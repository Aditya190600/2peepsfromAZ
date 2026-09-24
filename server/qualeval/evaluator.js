import { callLlmGateway, parseJsonResponse } from "../checks/llmGateway.js";

// Judges a completed call transcript against one scenario's expected
// behavior and criteria. Only ever called with a real transcript (see
// server/qualeval/store.js's attachTranscript) - never fabricates a verdict
// for a run that hasn't actually been placed.
const SYSTEM_PROMPT = `You are a strict qualitative acceptance-test evaluator for an AI voice agent. You are given a test scenario (persona, situation, caller objectives, expected behavior, evaluation criteria) and the transcript of a real phone call a simulated caller placed against the target agent to run that scenario. Judge whether the target agent's behavior in the transcript satisfies the expected behavior and each evaluation criterion. Respond with ONLY a JSON object, no other text: {"verdict": "pass"|"fail", "assessment": string, "criterionResults": [{"criterion": string, "met": boolean, "explanation": string}], "evidenceQuotes": [{"quote": string, "turnIndex": number}]}. "assessment" is a short overall summary of why the call passed or failed. Quote exact text from the transcript in evidenceQuotes, and reference the turnIndex it came from.`;

function transcriptForPrompt(transcript) {
  const turns = transcript?.turns ?? [];
  return turns.map((t, i) => `Turn ${i} (${t.role}, t=${t.tMs ?? "?"}ms): "${t.text}"`).join("\n");
}

export async function evaluateTranscript(scenario, transcript, { llmGateway = callLlmGateway } = {}) {
  const turns = transcript?.turns ?? [];
  if (turns.length === 0) {
    throw new Error("Cannot evaluate a run with no transcript turns.");
  }

  const userMessage = [
    `Scenario: ${scenario.name}`,
    scenario.persona ? `Persona: ${scenario.persona}` : null,
    scenario.situation ? `Situation: ${scenario.situation}` : null,
    scenario.callerObjectives ? `Caller objectives: ${scenario.callerObjectives}` : null,
    scenario.expectedBehavior ? `Expected behavior: ${scenario.expectedBehavior}` : null,
    `Evaluation criteria: ${JSON.stringify(scenario.evaluationCriteria ?? [])}`,
    "",
    "Transcript:",
    transcriptForPrompt(transcript),
  ]
    .filter((line) => line !== null)
    .join("\n");

  const content = await llmGateway(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    { maxTokens: 1500, temperature: 0 },
  );
  const text = typeof content === "string" ? content : content.content;
  const parsed = parseJsonResponse(text, null);
  if (!parsed || (parsed.verdict !== "pass" && parsed.verdict !== "fail")) {
    throw new Error("LLM Gateway did not return a usable verdict.");
  }
  return {
    verdict: parsed.verdict,
    assessment: parsed.assessment ? String(parsed.assessment) : "",
    criterionResults: Array.isArray(parsed.criterionResults) ? parsed.criterionResults : [],
    evidenceQuotes: Array.isArray(parsed.evidenceQuotes) ? parsed.evidenceQuotes : [],
  };
}
