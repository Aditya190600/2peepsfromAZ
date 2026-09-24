import { callLlmGatewayWithUsage, parseJsonResponse, LlmGatewayRateLimitError } from "./llmGateway.js";

// CA AB 2905-style AI-disclosure-timing check: was the AI nature of the call
// disclosed within the first few seconds. Judged semantically via AssemblyAI's
// LLM Gateway so paraphrases ("I'm a computer program helping you today") are
// caught, not just a hardcoded phrase list - see docs/guardrails-llm-gateway-integration.md.
const DISCLOSURE_WINDOW_MS = 10_000;

const SYSTEM_PROMPT = `You review the opening seconds of a phone call between an AI voice agent and a caller. Decide whether the agent disclosed that the caller is talking to an AI or automated system rather than a human - directly ("I'm an AI") or by paraphrase ("I'm a computer program helping you today", "you're speaking with a virtual assistant", "this call uses an automated system"). Respond with ONLY a JSON object, no other text: {"disclosed": true|false, "turnIndex": <number|null>, "quote": <string|null>}. Use the turnIndex and exact quote of the first turn where disclosure occurred, or null for both if there was none.`;

export async function disclosureCheck(session, { llmGateway = callLlmGatewayWithUsage, deterministic = false } = {}) {
  const turns = session.turns ?? [];
  const earlyAgentTurns = turns
    .map((t, turnIndex) => ({ ...t, turnIndex }))
    .filter((t) => t.role === "agent" && (t.tMs ?? 0) <= DISCLOSURE_WINDOW_MS);

  if (earlyAgentTurns.length === 0) {
    return {
      check: "ai_disclosure",
      status: "flag",
      detail: `No agent turns detected within the first ${DISCLOSURE_WINDOW_MS / 1000}s.`,
    };
  }

  if (deterministic) {
    const matched = earlyAgentTurns.find((t) =>
      /\b(AI (assistant|system)|automated (assistant|system)|virtual assistant)\b/i.test(t.text),
    );
    return {
      check: "ai_disclosure",
      status: matched ? "pass" : "flag",
      detail: "Offline phrase check only. Paraphrases require semantic analysis.",
      ...(matched ? { tMs: matched.tMs } : {}),
    };
  }

  const transcriptForPrompt = earlyAgentTurns
    .map((t) => `Turn ${t.turnIndex} (t=${t.tMs}ms): "${t.text}"`)
    .join("\n");

  let verdict, llmUsage, llmCostUsd;
  try {
    const result = await llmGateway([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: transcriptForPrompt },
    ]);
    const content = typeof result === "string" ? result : result.content;
    llmUsage = typeof result === "string" ? null : result.usage;
    llmCostUsd = typeof result === "string" ? null : result.costUsd;
    verdict = parseJsonResponse(content, null);
  } catch (err) {
    console.error("[disclosureCheck] LLM Gateway call failed:", err.message);
    const detail =
      err instanceof LlmGatewayRateLimitError
        ? "AI-disclosure check is temporarily unavailable due to high demand on the semantic model. Please retry in a moment."
        : "AI-disclosure check could not complete right now. Please retry in a moment.";
    return {
      check: "ai_disclosure",
      status: "error",
      detail,
      llmGatewayError: err.message,
      rateLimited: err instanceof LlmGatewayRateLimitError,
    };
  }

  if (!verdict || !verdict.disclosed) {
    return {
      check: "ai_disclosure",
      status: "flag",
      detail: `No AI-disclosure language detected (semantically, via LLM Gateway) in agent turns within the first ${
        DISCLOSURE_WINDOW_MS / 1000
      }s.`,
      ...(llmUsage ? { llmUsage, llmCostUsd } : {}),
    };
  }

  const matchedTurn = earlyAgentTurns.find((t) => t.turnIndex === verdict.turnIndex) ?? earlyAgentTurns[0];
  return {
    check: "ai_disclosure",
    status: "pass",
    detail: `AI disclosure detected at ${matchedTurn.tMs}ms: "${verdict.quote ?? matchedTurn.text}"`,
    tMs: matchedTurn.tMs,
    ...(llmUsage ? { llmUsage, llmCostUsd } : {}),
  };
}
