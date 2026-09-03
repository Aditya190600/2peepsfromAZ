import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { pool } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
app.use(cors());
app.use(express.json());

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

// Grounding endpoint for the check_regulation tool. Browser client calls this after
// receiving a tool.call event from the agent WS, then sends the result back as tool.result.
app.post("/v1/check-regulation", async (req, res) => {
  const { topic, jurisdiction } = req.body ?? {};
  if (!topic || !jurisdiction) {
    return res.status(400).json({ found: false, error: "topic and jurisdiction are required" });
  }

  const { rows } = await pool.query(
    `SELECT topic, jurisdiction, summary, citation FROM regulations
     WHERE lower(topic) = lower($1) AND lower(jurisdiction) = lower($2)`,
    [topic, jurisdiction]
  );

  if (rows.length === 0) {
    const { rows: fuzzy } = await pool.query(
      `SELECT topic, jurisdiction, summary, citation FROM regulations
       WHERE lower(jurisdiction) = lower($1) AND topic ILIKE '%' || $2 || '%'
       LIMIT 1`,
      [jurisdiction, topic]
    );
    if (fuzzy.length === 0) {
      return res.json({
        found: false,
        message: `No grounded ruleset entry for "${topic}" in ${jurisdiction}. This demo only covers California CCPA/CPRA (jurisdiction "US-CA"). Do not answer from general knowledge; tell the user this topic/jurisdiction isn't covered.`,
      });
    }
    return res.json({ found: true, ...fuzzy[0] });
  }

  res.json({ found: true, ...rows[0] });
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`complyline server listening on :${port}`));
