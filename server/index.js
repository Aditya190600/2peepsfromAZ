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
import { requestCacheKey, warmNorthstarCache } from "./warmCache.js";
import { loadReportCache, supabaseConfigured, upsertReportCache } from "./supabaseCache.js";
import { createApiKey, listApiKeys, revokeApiKey, updateApiKeyExpiry, DEFAULT_EXPIRY_DAYS } from "./apiKeys.js";
import { handleIngest } from "./webhooks/ingest.js";
import { NORTHSTAR_SESSIONS, NORTHSTAR_SESSION_KEYS } from "../client/src/sampleSessions.js";
import * as providers from "./providers/registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
app.use(cors());

const reportCache = new Map();

app.use(express.json({ limit: "2mb" }));

// POST /v1/ingest/:apiKey - vendor-agnostic transcript ingest. The
// customer's own backend POSTs a transcript here after their call ends,
// authenticated by their ComplyLine API key. See docs/webhook-pivot-idea.md
// and server/webhooks/ingest.js.
app.post("/v1/ingest/:apiKey", handleIngest(reportCache));

// Per-visitor separation for the public demo, opt-in via both Clerk keys so a
// fresh clone/local dev/test run needs no Clerk account (same opt-in pattern
// as server/providers/ and Supabase caching). When unset, every request is
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
  if (!supabaseConfigured()) {
    return res.status(503).json({ error: "API key storage requires Supabase configuration." });
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
  if (!supabaseConfigured()) {
    return res.status(503).json({ error: "API key storage requires Supabase configuration." });
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
  if (!supabaseConfigured()) {
    return res.status(503).json({ error: "API key storage requires Supabase configuration." });
  }
  try {
    await revokeApiKey(visitorId(req), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

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
app.post("/v1/analyze-session", requireVisitor, async (req, res) => {
  const { session, patternPackIds = ["generic"] } = req.body ?? {};
  if (!session || !Array.isArray(session.turns)) {
    return res.status(400).json({ error: "session with a turns array is required" });
  }
  const modelProviderId = providers.getConfig().model.providerId;
  const key = requestCacheKey(session, patternPackIds, modelProviderId);
  const cached = reportCache.get(key);
  if (cached) {
    return res.json(cached);
  }
  try {
    const llmGateway = providers.getModel().complete;
    const report = await analyzeSession(session, { patternPackIds, llmGateway });
    const hasErroredCheck = report.findings.some((f) => f.status === "error");
    if (!hasErroredCheck) {
      reportCache.set(key, report);
      if (supabaseConfigured()) {
        upsertReportCache(key, report).catch((persistErr) => {
          console.error(`Supabase persist skipped: ${persistErr.message}`);
        });
      }
    }
    res.json(report);
  } catch (err) {
    res.status(502).json({ error: `Analysis failed: ${err.message}` });
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

await new Promise((resolve) => {
  app.listen(port, () => {
    console.log(`R3-21 compliance report server listening on :${port}`);
    resolve();
  });
});

if (supabaseConfigured()) {
  try {
    const rows = await loadReportCache();
    for (const row of rows) {
      if (row?.cache_key && row.report) reportCache.set(row.cache_key, row.report);
    }
    console.log(`Northstar cache: hydrated ${reportCache.size} reports from Supabase.`);
  } catch (err) {
    console.error(`Northstar cache: Supabase hydrate failed (${err.message}).`);
  }
}

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
  persist: supabaseConfigured()
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
