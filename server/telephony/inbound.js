import { randomUUID } from "node:crypto";
import { analyzeSession } from "../checks/analyze.js";
import { headlineVerdict } from "../../client/src/compliance.js";
import { assertE164 } from "./carriers.js";

const PROVIDERS = new Set(["twilio", "telnyx", "zadarma", "byo-sip-trunk", "byo-phone-number"]);

export function sessionFromInbound(body) {
  if (!body || typeof body !== "object") {
    throw Object.assign(new Error("Inbound body is required"), { status: 400 });
  }
  const turns = Array.isArray(body.turns) ? body.turns : [];
  if (turns.length === 0 || turns.length > 200) {
    throw Object.assign(new Error("Inbound call needs 1-200 transcript turns"), { status: 400 });
  }
  const provider = body.provider ?? "byo-sip-trunk";
  if (!PROVIDERS.has(provider)) {
    throw Object.assign(new Error("Unknown inbound provider"), { status: 400 });
  }
  const e164 = assertE164(body.e164);
  const callId = typeof body.callId === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(body.callId)
    ? body.callId
    : randomUUID();
  const mapped = turns.map((turn, index) => {
    if (!turn || typeof turn.text !== "string" || !turn.text.trim()) {
      throw Object.assign(new Error("Each turn needs text"), { status: 400 });
    }
    const role = turn.role === "assistant" || turn.role === "agent" ? "agent" : turn.role === "user" ? "user" : null;
    if (!role) throw Object.assign(new Error("Each turn role must be agent or user"), { status: 400 });
    const tMs = Number.isFinite(turn.tMs) ? turn.tMs : index * 2000;
    if (tMs < 0) throw Object.assign(new Error("Turn tMs must be nonnegative"), { status: 400 });
    return { role, text: turn.text, tMs };
  });
  return {
    sessionId: `pstn_${callId}`,
    e164,
    provider,
    startedAt: typeof body.startedAt === "string" ? body.startedAt : new Date().toISOString(),
    consentEvent: body.consentEvent ?? null,
    turns: mapped,
    label: typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 160) : `${e164} inbound`,
  };
}

export async function ingestInbound(body, { analyze = analyzeSession, store, ownerId }) {
  const session = sessionFromInbound(body);
  const report = await analyze(
    {
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      consentEvent: session.consentEvent,
      turns: session.turns,
    },
    { deterministic: true },
  );
  const verdict = headlineVerdict(report.findings);
  const entry = {
    id: session.sessionId,
    timestamp: new Date().toISOString(),
    label: session.label,
    sessionId: session.sessionId,
    verdictLevel: verdict.level,
    verdictLabel: verdict.label,
    report,
    turns: session.turns,
    startedAt: session.startedAt,
    durationMs: session.turns.at(-1)?.tMs ?? 0,
    turnCount: session.turns.length,
    source: "pstn",
    findings: report.findings,
    e164: session.e164,
    provider: session.provider,
  };
  return store.saveSession(ownerId, entry);
}
