import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { analyzeSession } from "./checks/analyze.js";
import { transcribeUpload } from "./checks/transcribeUpload.js";

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

// Mints a short-lived Voice Agent token. The real API key never leaves this server.
app.get("/v1/token", async (_req, res) => {
  const url =
    "https://agents.assemblyai.com/v1/token?expires_in_seconds=300&max_session_duration_seconds=8640";
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const body = await resp.json();
  res.status(resp.status).json(body);
});

// Reports are cached by a hash of the exact request (session content +
// pattern packs) - the sample sessions are static and their verdicts never
// change, so once a report comes back with no failed checks it never needs
// to hit the LLM Gateway again. Live/uploaded sessions get fresh session ids
// each time, so they naturally never collide with a cached entry.
// ponytail: unbounded process-lifetime Map, fine at this data volume (dozens
// of sample sessions); swap for an LRU if this ever needs to bound memory.
const reportCache = new Map();

function cacheKey(session, patternPackIds) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ session, patternPackIds: [...patternPackIds].sort() }))
    .digest("hex");
}

// Post-hoc compliance report for one completed (or synthetic) Voice Agent
// session: consent-event-logged (TCPA), AI-disclosure-timing (e.g. CA AB
// 2905), and a pluggable PII pattern-set scan. Body: { session, patternPackIds }.
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
    }
    res.json(report);
  } catch (err) {
    res.status(502).json({ error: `Analysis failed: ${err.message}` });
  }
});

// Demo pipeline: transcribes an uploaded audio file (drag-and-drop, not a
// live call) via AssemblyAI's pre-recorded STT API into the same
// {turns: [{role, text, tMs}]} session shape a live call produces, so the
// client can feed it into the existing /v1/analyze-session pipeline.
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

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`R3-21 compliance report server listening on :${port}`));
