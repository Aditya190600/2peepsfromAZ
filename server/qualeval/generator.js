import { callLlmGateway, parseJsonResponse } from "../checks/llmGateway.js";

// Turns an evaluation's description/requirements into 5-10 black-box test
// scenarios via the LLM Gateway. Each scenario is a persona + situation for a
// SIMULATED caller to run against the target agent (reached only by phone
// number) - never assumes access to the target's internals.
const SYSTEM_PROMPT = `You design black-box qualitative acceptance-test scenarios for an AI voice agent that will be reached only by phone. Given a description of what the agent does and its requirements, produce 5 to 10 distinct test scenarios. Each scenario is a simulated caller persona and situation that will place a real phone call to the target agent, plus how to judge the resulting transcript. Respond with ONLY a JSON object, no other text: {"scenarios": [{"name": string, "persona": string, "situation": string, "callerObjectives": string, "expectedBehavior": string, "evaluationCriteria": [string, ...], "category": string}]}. "persona" describes who the simulated caller is (tone, background, constraints). "situation" is the scenario context the caller opens the call with. "callerObjectives" is what the simulated caller is trying to get out of the call. "expectedBehavior" is what the target agent should do to pass. "evaluationCriteria" is a short list of specific, checkable criteria an evaluator can look for in the transcript. "category" is a short tag (e.g. "happy-path", "edge-case", "policy-adherence", "escalation").`;

function feedbackUserMessage({ name, description, requirements, feedback }) {
  const parts = [
    `Evaluation name: ${name}`,
    description ? `Description: ${description}` : null,
    requirements ? `Requirements: ${requirements}` : null,
  ].filter(Boolean);
  if (feedback && feedback.trim()) {
    parts.push(
      `The operator reviewed a previous batch of scenarios and gave this feedback - fold it into the next generation: ${feedback.trim()}`,
    );
  }
  return parts.join("\n");
}

export async function generateScenarios(evaluation, { feedback, llmGateway = callLlmGateway } = {}) {
  const content = await llmGateway(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: feedbackUserMessage({ ...evaluation, feedback }) },
    ],
    { maxTokens: 4000, temperature: 0.4 },
  );
  const text = typeof content === "string" ? content : content.content;
  const parsed = parseJsonResponse(text, null);
  const scenarios = parsed?.scenarios;
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    throw new Error("LLM Gateway did not return a usable scenarios array.");
  }
  return scenarios.map((s) => ({
    name: String(s.name ?? "Untitled scenario"),
    persona: s.persona ? String(s.persona) : null,
    situation: s.situation ? String(s.situation) : null,
    callerObjectives: s.callerObjectives ? String(s.callerObjectives) : null,
    expectedBehavior: s.expectedBehavior ? String(s.expectedBehavior) : null,
    evaluationCriteria: Array.isArray(s.evaluationCriteria) ? s.evaluationCriteria.map(String) : [],
    category: s.category ? String(s.category) : null,
  }));
}
