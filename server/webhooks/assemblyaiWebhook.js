import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { verifyApiKey, ALL_SCOPES_SENTINEL } from "../apiKeys.js";
import { PACK_IDS } from "../packs/index.js";
import { analyzeSession } from "../checks/analyze.js";
import { requestCacheKey } from "../warmCache.js";
import { supabaseConfigured, upsertReportCache } from "../supabaseCache.js";
import * as providers from "../providers/registry.js";

const AGENTS_BASE = "https://agents.assemblyai.com";
const SIGNATURE_TOLERANCE_SECONDS = 300;
const ARTIFACT_POLL_INTERVAL_MS = 3000;
const ARTIFACT_POLL_TIMEOUT_MS = 120_000;

// express.raw, not express.json - AssemblyAI signs the exact request body
// bytes, so this route must see them unparsed. Mount it before app.use(express.json())
// in index.js so the global JSON parser never touches this path.
export const rawBodyParser = express.raw({ type: "application/json", limit: "2mb" });

// AssemblyAI Voice Agent API webhooks sign every delivery with
// `X-AAI-Signature: t=<unix-seconds>,v1=<hex hmac-sha256>`, keyed with the
// secret registered on the subscription - not a customer-supplied auth
// header (that's the separate pre-recorded-audio product's
// webhook_auth_header_name/value, a different mechanism). ComplyLine has the
// customer set that subscription secret to their ComplyLine API key, so the
// same raw key both identifies the account (from the URL) and authenticates
// the delivery (via this signature).
// Verified live 2026-09-20: https://www.assemblyai.com/docs/voice-agents/voice-agent-api/webhooks
export function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const fields = Object.fromEntries(
    signatureHeader.split(",").map((pair) => {
      const i = pair.indexOf("=");
      return [pair.slice(0, i).trim(), pair.slice(i + 1).trim()];
    }),
  );
  const t = Number.parseInt(fields.t, 10);
  if (!Number.isFinite(t) || !fields.v1) return false;

  const expected = createHmac("sha256", secret).update(`${t}.`).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(fields.v1);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return Math.abs(Math.floor(Date.now() / 1000) - t) <= SIGNATURE_TOLERANCE_SECONDS;
}

export function resolvePatternPackIds(scopes) {
  if (scopes.includes(ALL_SCOPES_SENTINEL)) return PACK_IDS;
  return PACK_IDS.filter((id) => scopes.includes(id));
}

// Flattens one AssemblyAI conversation timeline into the
// {turns: [{role, text, tMs}]} shape analyzeSession expects (see
// server/checks/analyze.js). Each timeline turn pairs a user_transcript with
// an agent_text but only carries one absolute timestamp
// (agent_reply_started_at_ms) - both messages in a turn are stamped with it.
// ponytail: coarse (the exact user-speech instant isn't in the timeline
// schema); upgrade to time_to_first_audio_ms-adjusted timing if disclosure
// timing ever needs sub-turn precision.
export function timelineToTurns(timeline) {
  const startedAt = timeline.started_at_unix_ms ?? 0;
  const turns = [];
  for (const turn of timeline.turns ?? []) {
    const tMs = Number.isFinite(turn.agent_reply_started_at_ms)
      ? turn.agent_reply_started_at_ms - startedAt
      : 0;
    if (turn.user_transcript) turns.push({ role: "user", text: turn.user_transcript, tMs });
    if (turn.agent_text) turns.push({ role: "agent", text: turn.agent_text, tMs });
  }
  return turns;
}

async function fetchJson(url, headers, fetchImpl) {
  const resp = await fetchImpl(url, { headers });
  if (!resp.ok) throw new Error(`AssemblyAI request to ${url} failed: ${resp.status}`);
  return resp.json();
}

// session.completed fires before the recording/timeline are written -
// docs say they typically appear within ~90s - so poll GET /v1/sessions/{id}
// until `artifacts` is populated. Returns null on timeout rather than
// throwing, so the caller can log and give up instead of hanging forever.
export async function waitForArtifacts(
  sessionId,
  {
    apiKey,
    fetchImpl = fetch,
    pollIntervalMs = ARTIFACT_POLL_INTERVAL_MS,
    timeoutMs = ARTIFACT_POLL_TIMEOUT_MS,
  } = {},
) {
  const headers = { Authorization: apiKey };
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const session = await fetchJson(`${AGENTS_BASE}/v1/sessions/${sessionId}`, headers, fetchImpl);
    if (session.artifacts?.length > 0) return session;
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

export async function buildSessionFromWebhook(sessionId, opts) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const session = await waitForArtifacts(sessionId, opts);
  if (!session) throw new Error(`Timed out waiting for artifacts on session ${sessionId}`);
  const timelineArtifact = session.artifacts.find((a) => a.type === "timeline");
  if (!timelineArtifact) throw new Error(`No timeline artifact for session ${sessionId}`);
  const timeline = await fetchJson(timelineArtifact.url, {}, fetchImpl);
  return {
    sessionId,
    startedAt: timeline.started_at_unix_ms
      ? new Date(timeline.started_at_unix_ms).toISOString()
      : (session.created_at ?? null),
    consentEvent: null,
    turns: timelineToTurns(timeline),
  };
}

// Fire-and-forget async pipeline, dispatched off the fast-ack response path
// (see handleAssemblyaiWebhook below). Any failure is logged with the
// session id so it's discoverable rather than silently swallowed - there's
// no per-account report inbox yet (see docs/webhook-pivot-idea.md), so this
// gives the same visibility the manual /v1/analyze-session path already has.
export async function processWebhookSession(
  { sessionId, scopes },
  {
    apiKey = process.env.ASSEMBLYAI_API_KEY,
    fetchImpl = fetch,
    reportCache,
    analyzeSessionImpl = analyzeSession,
    llmGateway = providers.getModel().complete,
    modelProviderId = providers.getConfig().model.providerId,
  } = {},
) {
  try {
    const session = await buildSessionFromWebhook(sessionId, { apiKey, fetchImpl });
    const patternPackIds = resolvePatternPackIds(scopes);
    const key = requestCacheKey(session, patternPackIds, modelProviderId);
    const cached = reportCache?.get(key);
    if (cached) return cached;

    const report = await analyzeSessionImpl(session, { patternPackIds, llmGateway });
    const hasErroredCheck = report.findings.some((f) => f.status === "error");
    if (!hasErroredCheck) {
      reportCache?.set(key, report);
      if (supabaseConfigured()) {
        await upsertReportCache(key, report).catch((err) => {
          console.error(`Webhook report persist failed for session ${sessionId}: ${err.message}`);
        });
      }
    }
    return report;
  } catch (err) {
    console.error(`Webhook analysis failed for session ${sessionId}: ${err.message}`);
    throw err;
  }
}

// POST /v1/webhooks/assemblyai/:apiKey - see docs/webhook-pivot-idea.md.
// The path segment is the customer's ComplyLine API key: it's also what
// they set as their AssemblyAI webhook subscription's HMAC secret, so one
// credential does double duty (account lookup + delivery authenticity).
//
// Auth and signature verification happen synchronously so we can ack within
// AssemblyAI's timeout window; analysis (which needs the LLM Gateway and can
// take well over that window) is dispatched async, off the response path.
export function handleAssemblyaiWebhook(reportCache, { verifyKey = verifyApiKey, dispatch = processWebhookSession } = {}) {
  return async (req, res) => {
    const rawKey = req.params.apiKey;
    const verification = await verifyKey(rawKey);
    if (!verification.valid) {
      const status = verification.reason === "not_configured" ? 503 : 401;
      return res.status(status).json({ error: `Invalid API key: ${verification.reason}` });
    }

    if (!verifySignature(req.body, req.get("X-AAI-Signature"), rawKey)) {
      return res.status(401).json({ error: "invalid signature" });
    }

    let event;
    try {
      event = JSON.parse(req.body.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "invalid JSON body" });
    }

    res.status(200).json({ ok: true });

    if (event.event !== "session.completed") return;
    const sessionId = event.session?.session_id;
    if (!sessionId) return;

    dispatch({ sessionId, scopes: verification.scopes }, { reportCache }).catch(() => {
      // already logged inside processWebhookSession
    });
  };
}
