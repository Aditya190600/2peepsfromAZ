import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { analyzeSession } from "./checks/analyze.js";
import { transcribeUpload } from "./checks/transcribeUpload.js";
import { cacheKey, warmNorthstarCache } from "./warmCache.js";
import { loadReportCache, supabaseConfigured, upsertReportCache } from "./supabaseCache.js";
import { NORTHSTAR_SESSIONS, NORTHSTAR_SESSION_KEYS } from "../client/src/sampleSessions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

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

app.get("/v1/token", async (_req, res) => {
  const url =
    "https://agents.assemblyai.com/v1/token?expires_in_seconds=300&max_session_duration_seconds=8640";
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const body = await resp.json();
  res.status(resp.status).json(body);
});

const reportCache = new Map();

app.post("/v1/analyze-session", async (req, res) => {
  const { session, patternPackIds = ["generic"] } = req.body ?? {};
  if (!session || !Array.isArray(session.turns)) {
    return res.status(400).json({ error: "session with a turns array is required" });
  }
  const key = cacheKey(session, patternPackIds);
  const cached = reportCache.get(key);
  if (cached) {
    return res.json(cached);
  }
  try {
    const report = await analyzeSession(session, { patternPackIds });
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
  express.raw({ type: () => true, limit: "25mb" }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "audio file body is required" });
    }
    try {
      const turns = await transcribeUpload(req.body, API_KEY);
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
