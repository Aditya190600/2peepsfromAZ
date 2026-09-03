import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { analyzeSession } from "./checks/analyze.js";

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

// Post-hoc compliance report for one completed (or synthetic) Voice Agent
// session: consent-event-logged (TCPA), AI-disclosure-timing (e.g. CA AB
// 2905), and a pluggable PII pattern-set scan. Body: { session, patternPackIds }.
app.post("/v1/analyze-session", (req, res) => {
  const { session, patternPackIds } = req.body ?? {};
  if (!session || !Array.isArray(session.turns)) {
    return res.status(400).json({ error: "session with a turns array is required" });
  }
  const report = analyzeSession(session, { patternPackIds });
  res.json(report);
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`R3-21 compliance report server listening on :${port}`));
