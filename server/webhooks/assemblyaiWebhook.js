import { createHmac, timingSafeEqual } from "node:crypto";
import { ALL_SCOPES_SENTINEL } from "../apiKeys.js";
import { processIngestedSession } from "./ingest.js";

// Verified live against https://www.assemblyai.com/docs/voice-agents/voice-agent-api/webhooks
// (docs/llms-full.txt "Webhooks" section, 2026-09-23) - see docs/assemblyai-webhook-ingest.md.
const TIMESTAMP_TOLERANCE_SECONDS = 300;

// X-AAI-Signature: "t=<epoch>,v1=<hex hmac>". v1 = hex HMAC-SHA256, keyed
// with the subscription secret, over "{t}." followed by the raw request
// body bytes. Must be verified against the raw bytes - re-serializing
// parsed JSON before hashing produces different bytes and every signature
// fails (AssemblyAI's own docs warning).
export function verifySignature(rawBody, header, secret) {
  if (!secret) return { valid: false, reason: "not_configured" };
  if (!header || typeof header !== "string") return { valid: false, reason: "missing signature header" };

  const fields = {};
  for (const pair of header.split(",")) {
    const i = pair.indexOf("=");
    if (i === -1) continue;
    fields[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  const t = Number.parseInt(fields.t, 10);
  if (!Number.isFinite(t) || !fields.v1) return { valid: false, reason: "malformed signature header" };

  const expected = createHmac("sha256", secret).update(`${t}.`).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(fields.v1);
  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    return { valid: false, reason: "signature mismatch" };
  }
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > TIMESTAMP_TOLERANCE_SECONDS) {
    return { valid: false, reason: "timestamp outside tolerance" };
  }
  return { valid: true };
}

export async function fetchTranscript(url, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Transcript fetch failed: HTTP ${res.status}`);
  return res.json();
}

// The transcript_url resolves to a "timeline.json" artifact: {session_id,
// started_at_unix_ms, turns: [{user_transcript, agent_text,
// agent_reply_started_at_ms, ...}]}. Each timeline turn pairs one user
// utterance with one agent reply, unlike the {role, text, tMs} shape
// analyzeSession consumes, so this splits each timeline turn into up to two
// entries. Neither AssemblyAI's docs nor the timeline payload carry a
// separate timestamp for the user's utterance, so both entries from the
// same timeline turn share its agent_reply_started_at_ms anchor (relative to
// started_at_unix_ms); a turn with neither anchor nor prior timing falls
// back to fixed spacing, same fallback server/telephony/inbound.js uses for
// inputs with no real per-turn timestamps.
export function timelineToTurns(timeline) {
  const startedAt = Number.isFinite(timeline?.started_at_unix_ms) ? timeline.started_at_unix_ms : null;
  const turns = [];
  (timeline?.turns ?? []).forEach((turn, index) => {
    const anchorMs =
      startedAt !== null && Number.isFinite(turn?.agent_reply_started_at_ms)
        ? turn.agent_reply_started_at_ms - startedAt
        : index * 2000;
    const tMs = Math.max(0, anchorMs);
    if (turn?.user_transcript) turns.push({ role: "user", text: turn.user_transcript, tMs });
    if (turn?.agent_text) turns.push({ role: "agent", text: turn.agent_text, tMs });
  });
  return turns;
}

export function sessionFromCallEnded(call, timeline) {
  return {
    sessionId: call?.session_id || call?.call_id,
    startedAt: call?.created_at ?? new Date().toISOString(),
    // The webhook payload carries no consent signal - phone-call consent
    // logging is a separate, call-flow-specific concern (same as any other
    // session the consent check evaluates), so this is left unset rather
    // than assumed.
    consentEvent: null,
    turns: timelineToTurns(timeline),
  };
}

// Runs the existing ingest analysis pipeline (processIngestedSession) rather
// than duplicating its cache/dispatch logic. There is no ComplyLine API key
// on this path (auth is the webhook signature, not a customer key), so
// there's no per-key pack scope to resolve - it runs every pattern pack via
// the ALL_SCOPES_SENTINEL, since an automatic trigger has no operator
// present to pick packs and under-scanning a real phone call is the worse
// failure mode.
export async function processCallEnded(
  call,
  { reportCache, dispatch = processIngestedSession, fetchTranscriptImpl = fetchTranscript } = {},
) {
  if (!call?.transcript_url) {
    console.error(`AssemblyAI webhook: call.ended for ${call?.call_id} has no transcript_url`);
    return;
  }
  try {
    const timeline = await fetchTranscriptImpl(call.transcript_url);
    const session = sessionFromCallEnded(call, timeline);
    if (session.turns.length === 0) {
      console.error(`AssemblyAI webhook: call ${call.call_id} timeline had no turns to analyze`);
      return;
    }
    await dispatch({ session, scopes: [ALL_SCOPES_SENTINEL] }, { reportCache });
  } catch (err) {
    console.error(`AssemblyAI webhook: analysis failed for call ${call?.call_id}: ${err.message}`);
  }
}

// POST /v1/webhooks/assemblyai - see docs/assemblyai-webhook-ingest.md.
// AssemblyAI itself POSTs here for a registered webhook subscription
// (call.connected, call.ended, call.failed); there is no customer-side
// integration step, unlike POST /v1/ingest/:apiKey (server/webhooks/ingest.js),
// where the customer's own backend pushes a transcript it already has.
//
// Must be mounted with express.raw({ type: "application/json" }) ahead of
// the app-wide express.json() middleware so req.body is the exact bytes
// AssemblyAI signed - re-parsing/re-serializing JSON before verifying
// changes the bytes and every signature fails.
export function handleAssemblyAiWebhook(
  reportCache,
  {
    secret = process.env.AAI_WEBHOOK_SIGNING_SECRET,
    verify = verifySignature,
    dispatch = processCallEnded,
  } = {},
) {
  return (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    const verification = verify(rawBody, req.get("X-AAI-Signature"), secret);
    if (!verification.valid) {
      const status = verification.reason === "not_configured" ? 503 : 401;
      return res.status(status).json({ error: `Invalid webhook signature: ${verification.reason}` });
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }

    res.status(200).json({ ok: true });

    if (event?.event === "call.ended") {
      dispatch(event.call, { reportCache }).catch(() => {
        // already logged inside processCallEnded
      });
    } else if (event?.event === "call.connected" || event?.event === "call.failed") {
      // No transcript to analyze for these - log for visibility only.
      console.log(`AssemblyAI webhook: ${event.event} for call ${event.call?.call_id ?? "unknown"}`);
    }
  };
}
