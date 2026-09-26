import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { clerkMiddleware, requireAuth, getAuth } from "@clerk/express";
import { analyzeSession } from "./checks/analyze.js";
import { packCatalog } from "./packs/index.js";
import { parsePackEvalRequest } from "./evals/wire.js";
import { evaluatePacks } from "./evals/runPackEvals.js";
import { evalRouter } from "./evals/router.js";
import { telephonyRouter } from "./telephony/router.js";
import { requestCacheKey, warmNorthstarCache } from "./warmCache.js";
import { loadReportCache, dbConfigured, upsertReportCache } from "./reportCache.js";
import { runMigrations } from "./migrate.js";
import { createApiKey, listApiKeys, revokeApiKey, updateApiKeyExpiry, DEFAULT_EXPIRY_DAYS } from "./apiKeys.js";
import { handleIngest } from "./webhooks/ingest.js";
import { handleAssemblyAiWebhook } from "./webhooks/assemblyaiWebhook.js";
import { recordingsRouter } from "./recordingsStore.js";
import { qualevalRouter } from "./qualeval/router.js";
import { twilioVoiceRoute } from "./qualeval/twilioVoice.js";
import { demoAgentVoiceRoute } from "./qualeval/demoAgentVoice.js";
import { ensureDemoAgentNumberConfigured } from "./qualeval/demoAgentProvision.js";
import { ensureDemoAgentsProvisioned } from "./qualeval/demoAgentAgentsProvision.js";
import { attachTwilioStreamServer } from "./qualeval/twilioStream.js";
import { attachTargetAgentStreamServer } from "./qualeval/targetAgentStream.js";
import {
  NORTHSTAR_SESSIONS,
  NORTHSTAR_SESSION_KEYS,
  SAMPLE_SESSIONS,
  PLAYABLE_SAMPLE_KEYS,
} from "../client/src/sampleSessions.js";
import { readFile } from "node:fs/promises";
import * as providers from "./providers/registry.js";
import { llmParsePastedSession } from "./checks/sessionPasteParse.js";
import { LlmGatewayRateLimitError } from "./checks/llmGateway.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
// Needed so req.protocol reflects Railway's terminating proxy's
// X-Forwarded-Proto (https) - without it every request looks like plain
// http, which would make server/qualeval/twilioVoice.js mint a ws:// (not
// wss://) Media Streams URL that Twilio refuses.
app.set("trust proxy", true);
app.use(cors());

const reportCache = new Map();

// POST /v1/webhooks/assemblyai - AssemblyAI-native call-ended trigger. Must
// be mounted with its own express.raw() ahead of the app-wide express.json()
// below, since signature verification needs the exact raw bytes AssemblyAI
// signed. See docs/assemblyai-webhook-ingest.md and
// server/webhooks/assemblyaiWebhook.js.
app.post(
  "/v1/webhooks/assemblyai",
  express.raw({ type: "application/json", limit: "1mb" }),
  handleAssemblyAiWebhook(reportCache),
);

app.use(express.json({ limit: "2mb" }));

// POST /v1/ingest/:apiKey - vendor-agnostic transcript ingest. The
// customer's own backend POSTs a transcript here after their call ends,
// authenticated by their ComplyLine API key. See docs/webhook-pivot-idea.md
// and server/webhooks/ingest.js.
app.post("/v1/ingest/:apiKey", handleIngest(reportCache));

// Per-visitor separation for the public demo, opt-in via both Clerk keys so a
// fresh clone/local dev/test run needs no Clerk account (same opt-in pattern
// as server/providers/ and Postgres caching). When unset, every request is
// treated as one shared anonymous visitor, matching today's single-tenant
// behavior exactly. Requiring both keys (rather than just the secret key)
// avoids clerkMiddleware() throwing on every request when only one is set.
const CLERK_ENABLED = Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY);
if (CLERK_ENABLED) app.use(clerkMiddleware());
const requireVisitor = CLERK_ENABLED ? requireAuth() : (_req, _res, next) => next();

// One shared "anon" account id when Clerk isn't configured, matching the
// single-tenant local-dev default everywhere else in this file.
function visitorId(req) {
  return CLERK_ENABLED ? getAuth(req).userId : "anon";
}

// The Examples page (client/src/Examples.jsx) is deliberately zero-setup -
// no sign-in required even when Clerk is on - because its samples/scripted
// demos are canned, static fixtures, never live user audio or PII. This
// looks the posted session up by sessionId against the same canned fixtures
// (SAMPLE_SESSIONS/NORTHSTAR_SESSIONS) already imported for the Northstar
// boot-warm cache, and substitutes the canonical server-side copy - so a
// signed-out request can never smuggle arbitrary content past auth by
// spoofing a known sessionId with different turns.
const CANNED_SESSIONS_BY_ID = new Map(
  [...Object.values(SAMPLE_SESSIONS), ...Object.values(NORTHSTAR_SESSIONS)].map((session) => [
    session.sessionId,
    session,
  ])
);

function requireVisitorUnlessCannedSample(req, res, next) {
  const canned = CANNED_SESSIONS_BY_ID.get(req.body?.session?.sessionId);
  if (canned) {
    req.body.session = canned;
    return next();
  }
  return requireVisitor(req, res, next);
}

const API_KEY = process.env.ASSEMBLYAI_API_KEY;
if (!API_KEY) {
  console.error("ASSEMBLYAI_API_KEY missing from .env");
  process.exit(1);
}

let bootStatus = {
  ok: false,
  cached: 0,
  total: NORTHSTAR_SESSION_KEYS.length,
  error: "Northstar cache is still warming.",
};

app.get("/v1/boot-status", (_req, res) => {
  res.json(bootStatus);
});

// Mints a short-lived Voice Agent token via whichever voice provider is
// currently selected (server/providers/registry.js). The real API key never
// leaves this server.
app.get("/v1/token", requireVisitor, async (_req, res) => {
  const { status, body } = await providers.getVoice().mintToken();
  res.status(status).json(body);
});

// Provider slots (transcriber/model/voice) - Vapi-style BYO-key swapping.
// See .claude/prds/provider-swaps.md. GET/list routes never return secrets.
app.get("/v1/providers", (_req, res) => {
  res.json(providers.listCatalog());
});

app.get("/v1/providers/config", (_req, res) => {
  res.json(providers.getConfig());
});

app.put("/v1/providers/config", (req, res) => {
  const { slot, providerId } = req.body ?? {};
  if (!slot || !providerId) {
    return res.status(400).json({ error: "slot and providerId are required" });
  }
  try {
    const updated = providers.setSelection(slot, providerId);
    res.json({ slot, ...updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/v1/providers/credentials", (req, res) => {
  const { providerId, apiKey, baseUrl, model } = req.body ?? {};
  if (!providerId) {
    return res.status(400).json({ error: "providerId is required" });
  }
  try {
    providers.setCredential(providerId, {
      apiKey,
      ...(baseUrl ? { baseUrl } : {}),
      ...(model ? { model } : {}),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/v1/packs", requireVisitor, (_req, res) => {
  res.json({ packs: packCatalog() });
});

// API key management for the signed-in human, via the web console. This is
// NOT the webhook auth path - verifyApiKey (server/apiKeys.js) is what a
// future webhook receiver calls to authenticate an inbound machine request.
//
// These routes require real Clerk sign-in even when the rest of the app's
// Clerk gate is a no-op (CLERK_ENABLED false): without it, every visitor
// would share the "anon" visitorId and pool real customer credentials under
// one account - unacceptable for production API keys, unlike the anonymous
// demo behavior everywhere else in this file.
function requireRealAccount(_req, res, next) {
  if (!CLERK_ENABLED) {
    return res.status(503).json({ error: "API key management requires sign-in (Clerk) to be configured." });
  }
  next();
}

app.get("/v1/api-keys", requireVisitor, requireRealAccount, async (req, res) => {
  try {
    const keys = await listApiKeys(visitorId(req));
    res.json({ keys, defaultExpiryDays: DEFAULT_EXPIRY_DAYS });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

app.post("/v1/api-keys", requireVisitor, requireRealAccount, async (req, res) => {
  if (!dbConfigured()) {
    return res.status(503).json({ error: "API key storage requires Postgres configuration." });
  }
  const { name, scopes, expiresInDays } = req.body ?? {};
  try {
    const created = await createApiKey({
      clerkUserId: visitorId(req),
      name,
      scopes,
      ...(expiresInDays !== undefined ? { expiresInDays } : {}),
    });
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch("/v1/api-keys/:id", requireVisitor, requireRealAccount, async (req, res) => {
  if (!dbConfigured()) {
    return res.status(503).json({ error: "API key storage requires Postgres configuration." });
  }
  const { expiresInDays } = req.body ?? {};
  try {
    const updated = await updateApiKeyExpiry(visitorId(req), req.params.id, Number(expiresInDays));
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/v1/api-keys/:id/revoke", requireVisitor, requireRealAccount, async (req, res) => {
  if (!dbConfigured()) {
    return res.status(503).json({ error: "API key storage requires Postgres configuration." });
  }
  try {
    await revokeApiKey(visitorId(req), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.use("/v1/evals", requireVisitor, evalRouter());

// QualEval: black-box qualitative acceptance testing for AI voice agents.
// See docs/qualeval-foundation.md. Requires Postgres, same hard-fail
// guard pattern as /v1/api-keys - genuinely new data, not a cache.
// POST /v1/qualeval/twilio-voice/:runId - Twilio's own webhook, not a
// visitor route (see server/qualeval/twilioVoice.js for the signature-based
// auth). Registered before the requireVisitor-gated /v1/qualeval router
// below so Express's prefix matching never routes Twilio's server-to-server
// POST through the Clerk auth gate. Twilio POSTs this as
// application/x-www-form-urlencoded, so it needs its own body parser rather
// than the app-wide express.json() above.
app.post(
  "/v1/qualeval/twilio-voice/:runId",
  express.urlencoded({ extended: false }),
  (req, res) => twilioVoiceRoute(req, res),
);

// POST /v1/qualeval/demo-agent-voice - same Twilio-webhook posture as the
// route above, answered by QUALEVAL_AGENT_NUMBER (server/qualeval/demoAgentVoice.js,
// server/qualeval/demoAgentProvision.js).
app.post(
  "/v1/qualeval/demo-agent-voice",
  express.urlencoded({ extended: false }),
  (req, res) => demoAgentVoiceRoute(req, res),
);

app.use("/v1/qualeval", requireVisitor, qualevalRouter({ visitorId }));

const telephony = telephonyRouter();
app.post("/v1/telephony/inbound", (req, res, next) => {
  const expected = process.env.TELEPHONY_WEBHOOK_SECRET;
  if (expected && req.get("x-complyline-hook-secret") === expected) {
    return telephony.inbound(req, res, next);
  }
  return requireVisitor(req, res, () => telephony.inbound(req, res, next));
});
app.use("/v1/telephony", requireVisitor, telephony);

app.post("/v1/pack-evals", requireVisitor, async (req, res) => {
  const parsed = parsePackEvalRequest(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  try {
    const run = await evaluatePacks(parsed.packIds);
    res.json(run);
  } catch (err) {
    res.status(502).json({ error: `Eval run failed: ${err.message}` });
  }
});

// Post-hoc compliance report for one completed (or synthetic) Voice Agent
// session: consent-event-logged (TCPA), AI-disclosure-timing (e.g. CA AB
// 2905), and a pluggable PII pattern-set scan. Body: { session, patternPackIds }.
app.post("/v1/analyze-session", requireVisitorUnlessCannedSample, async (req, res) => {
  const { session, patternPackIds = ["generic"], stream = false } = req.body ?? {};
  if (!session || !Array.isArray(session.turns)) {
    return res.status(400).json({ error: "session with a turns array is required" });
  }
  const modelProviderId = providers.getConfig().model.providerId;
  const key = requestCacheKey(session, patternPackIds, modelProviderId);
  const cached = reportCache.get(key);
  if (cached) {
    if (stream) {
      res.setHeader("Content-Type", "application/x-ndjson");
      res.write(`${JSON.stringify({ type: "done", report: cached })}\n`);
      return res.end();
    }
    return res.json(cached);
  }
  // stream=true (Dashboard's single-session live report and fleet report
  // paths) trades the plain JSON response for newline-delimited progress
  // events, one per check as it completes, ending with a "done" event
  // carrying the same report shape the non-streamed response returns - so
  // the "Analyzing…" state can show real tokens-used/cost/violation-count
  // numbers as they accumulate instead of a static message. Every other
  // caller (sample buttons, paste, upload-recording analyze) keeps the
  // original single-JSON-response contract unchanged.
  if (stream) res.setHeader("Content-Type", "application/x-ndjson");
  try {
    const llmGateway = providers.getModel().complete;
    const report = await analyzeSession(session, {
      patternPackIds,
      llmGateway,
      onCheckComplete: stream
        ? (finding, checksDone, checksTotal) => {
            res.write(
              `${JSON.stringify({
                type: "progress",
                check: finding.check,
                status: finding.status,
                checksDone,
                checksTotal,
                usage: finding.llmUsage ?? null,
                costUsd: finding.llmCostUsd ?? null,
              })}\n`,
            );
          }
        : undefined,
    });
    const hasErroredCheck = report.findings.some((f) => f.status === "error");
    if (!hasErroredCheck) {
      reportCache.set(key, report);
      if (dbConfigured()) {
        upsertReportCache(key, report).catch((persistErr) => {
          console.error(`Postgres persist skipped: ${persistErr.message}`);
        });
      }
    }
    if (stream) {
      res.write(`${JSON.stringify({ type: "done", report })}\n`);
      res.end();
    } else {
      res.json(report);
    }
  } catch (err) {
    if (stream) {
      res.write(`${JSON.stringify({ type: "error", error: `Analysis failed: ${err.message}` })}\n`);
      res.end();
    } else {
      res.status(502).json({ error: `Analysis failed: ${err.message}` });
    }
  }
});

// Fallback for the Try page's "Paste session transcript" tab: the client
// already tries a cheap strict-JSON parse itself (client/src/sessionPaste.js)
// and only calls this when that fails, since arbitrary pasted text (a raw
// transcript, a dictation, a rough call log) isn't valid session JSON but can
// still be turned into one via the LLM Gateway. Body: { text }.
app.post("/v1/parse-pasted-session", requireVisitor, async (req, res) => {
  const { text } = req.body ?? {};
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "text is required" });
  }
  try {
    const result = await llmParsePastedSession(text, { llmGateway: providers.getModel().complete });
    if (!result.ok) return res.status(422).json({ error: result.error });
    res.json({ session: result.session });
  } catch (err) {
    const rateLimited = err instanceof LlmGatewayRateLimitError;
    res.status(502).json({
      error: rateLimited
        ? "AssemblyAI's LLM Gateway rate limit was hit while parsing this paste. Wait a minute and retry."
        : `Could not parse this paste: ${err.message}`,
    });
  }
});

app.post(
  "/v1/transcribe-upload",
  requireVisitor,
  express.raw({ type: () => true, limit: "25mb" }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "audio file body is required" });
    }
    try {
      const turns = await providers.getTranscriber().transcribe(req.body);
      if (turns.length === 0) {
        return res.status(422).json({ error: "No speech detected in the uploaded audio." });
      }
      res.json({
        sessionId: `sess_upload_${Date.now()}`,
        startedAt: new Date().toISOString(),
        consentEvent: null,
        turns,
      });
    } catch (err) {
      res.status(502).json({ error: `Transcription failed: ${err.message}` });
    }
  }
);

// Zero-setup counterpart to /v1/transcribe-upload + /v1/analyze-session for
// the Examples page's "Auto-split speakers" demo: unlike those routes, this never
// accepts client-uploaded content and never analyzes a client-supplied
// session body - it only transcribes one of the fixed playable sample mp3s
// (client/public/samples), read server-side by key, and analyzes the result
// it produced itself, so a signed-out request can't smuggle arbitrary audio
// or an arbitrary session past auth via this route.
app.post("/v1/examples/diarize/:key", async (req, res) => {
  const { key } = req.params;
  if (!PLAYABLE_SAMPLE_KEYS.includes(key)) {
    return res.status(404).json({ error: "Unknown sample key." });
  }
  const { patternPackIds = ["generic"] } = req.body ?? {};
  try {
    const samplesDir = existsSync(dist)
      ? path.join(dist, "samples")
      : path.join(__dirname, "..", "client", "public", "samples");
    const audio = await readFile(path.join(samplesDir, `${key}.mp3`));
    const turns = await providers.getTranscriber().transcribe(audio);
    if (turns.length === 0) {
      return res.status(422).json({ error: "No speech detected in the sample audio." });
    }
    const session = {
      sessionId: `sess_upload_${Date.now()}`,
      startedAt: new Date().toISOString(),
      consentEvent: SAMPLE_SESSIONS[key]?.consentEvent ?? null,
      turns,
    };
    const report = await analyzeSession(session, {
      patternPackIds,
      llmGateway: providers.getModel().complete,
    });
    res.json({ session, report });
  } catch (err) {
    res.status(502).json({ error: `Transcription failed: ${err.message}` });
  }
});

app.use(recordingsRouter({ requireVisitor, visitorId }));

const dist = path.join(__dirname, "..", "client", "dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/v1")) return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}

const port = process.env.PORT || 8787;

const httpServer = await new Promise((resolve) => {
  const server = app.listen(port, () => {
    console.log(`R3-21 compliance report server listening on :${port}`);
    resolve(server);
  });
});

// Twilio Media Streams (server/qualeval/twilioStream.js) needs a raw
// WebSocket upgrade on the same http.Server Express is listening on -
// Express itself has no WebSocket support.
attachTwilioStreamServer(httpServer);

// Same as above, for the TARGET-AGENT side (server/qualeval/
// targetAgentStream.js, answering QUALEVAL_AGENT_NUMBER via
// server/qualeval/demoAgentVoice.js).
attachTargetAgentStreamServer(httpServer);

// Keeps QUALEVAL_AGENT_NUMBER's Voice Configuration pointed at our own
// demo-agent-voice TwiML on every boot - see demoAgentProvision.js's header
// comment for why an unconfigured number silently fails every call to it.
ensureDemoAgentNumberConfigured().catch((err) => {
  console.error(`QualEval: demo-agent number provisioning failed: ${err.message}`);
});

if (dbConfigured()) {
  try {
    await runMigrations();
    const rows = await loadReportCache();
    for (const row of rows) {
      if (row?.cache_key && row.report) reportCache.set(row.cache_key, row.report);
    }
    console.log(`Northstar cache: hydrated ${reportCache.size} reports from Postgres.`);
  } catch (err) {
    console.error(`Northstar cache: Postgres hydrate failed (${err.message}).`);
  }
}

// Idempotently creates the two AssemblyAI stored agents (compliant/flawed)
// behind QUALEVAL_AGENT_NUMBER's variants the first time each is missing an
// agent_id - see server/qualeval/demoAgentAgentsProvision.js. Must run after
// runMigrations() above, since it depends on migration 005's agent_id
// column existing.
ensureDemoAgentsProvisioned().catch((err) => {
  console.error(`QualEval: demo-agent AssemblyAI agent provisioning failed: ${err.message}`);
});

// Boot-time warming is intentionally pinned to the default AssemblyAI model
// path (it calls analyzeSession without an llmGateway override, same as
// providers.getModel() would resolve to for the "assemblyai-gateway"
// provider) rather than whatever a non-default model selection might be at
// boot - see requestCacheKey above for why that keeps the shared cache safe.
const result = await warmNorthstarCache({
  reportCache,
  analyzeSession,
  sessions: NORTHSTAR_SESSIONS,
  sessionKeys: NORTHSTAR_SESSION_KEYS,
  persist: dbConfigured()
    ? (hash, report) => upsertReportCache(hash, report)
    : undefined,
});
if (result.ok) {
  bootStatus = { ok: true, cached: result.cached, total: result.total, error: null };
  console.log(`Northstar cache: ${result.cached} of ${result.total} sessions cached.`);
} else {
  const detail = result.errors.map((e) => `${e.key}: ${e.error}`).join("; ");
  bootStatus = {
    ok: false,
    cached: result.cached,
    total: result.total,
    error: `Northstar cache did not complete (${result.cached} of ${result.total}). ${detail}`,
  };
  console.error(`Northstar cache failed (${result.cached} of ${result.total}). ${detail}`);
}
