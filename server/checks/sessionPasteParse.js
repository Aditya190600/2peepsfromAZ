import { callLlmGateway, parseJsonResponse } from "./llmGateway.js";

// Fallback for the Try page's "Paste session transcript" tab: pasted text
// that isn't strict session JSON (client/src/sessionPaste.js's cheap
// JSON.parse attempt already covers that case) still needs to become a
// {turns: [{role, text, tMs}]} session. This asks the LLM Gateway to extract
// one from arbitrary text - a raw transcript, a dictation, a rough call log -
// rather than requiring the caller to hand-format JSON.
const SYSTEM_PROMPT =
  'You extract a phone-call session from arbitrary pasted text (a transcript, a dictation, a rough call log, or JSON missing a strict "turns" array) and produce ONLY a JSON object of this shape: ' +
  '{"sessionId": <string|null>, "turns": [{"role": "agent"|"user", "text": <string>, "tMs": <number|null>}]}. ' +
  "Preserve line/paragraph order as turn order. Infer role from labels like \"Agent:\"/\"Caller:\"/\"AI:\"/\"You:\" where present; otherwise alternate roles starting with \"agent\". " +
  "If explicit timestamps aren't present, estimate tMs assuming roughly 3 seconds per turn starting at 0; use null only if you cannot even guess. " +
  "Respond with ONLY the JSON object, no other text.";

export async function llmParsePastedSession(text, { llmGateway = callLlmGateway } = {}) {
  const content = await llmGateway([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: text },
  ]);
  const parsed = parseJsonResponse(content, null);
  const turns = Array.isArray(parsed?.turns)
    ? parsed.turns
        .filter((t) => t && typeof t.text === "string" && t.text.trim())
        .map((t, i) => ({
          role: t.role === "user" ? "user" : "agent",
          text: t.text.trim(),
          tMs: typeof t.tMs === "number" ? t.tMs : i * 3000,
        }))
    : [];
  if (turns.length === 0) {
    return { ok: false, error: "Could not find any call turns in this text." };
  }
  return {
    ok: true,
    session: {
      sessionId:
        typeof parsed.sessionId === "string" && parsed.sessionId.trim()
          ? parsed.sessionId.trim()
          : `sess_pasted_${Date.now()}`,
      startedAt: new Date().toISOString(),
      consentEvent: null,
      turns,
    },
  };
}
