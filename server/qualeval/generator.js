import { callLlmGateway, parseJsonResponse } from "../checks/llmGateway.js";

// Turns an evaluation's description/requirements into a batch of black-box
// test scenarios via the LLM Gateway. Each scenario is a persona + situation
// for a SIMULATED caller to run against the target agent (reached only by
// phone number) - never assumes access to the target's internals.
function systemPrompt(count) {
  return `You design black-box qualitative acceptance-test scenarios for an AI voice agent that will be reached only by phone. Given a description of what the agent does and its requirements, produce exactly ${count} distinct test scenarios. Each scenario is a simulated caller persona and situation that will place a real phone call to the target agent, plus how to judge the resulting transcript. Respond with ONLY a JSON object, no other text: {"scenarios": [{"name": string, "persona": string, "situation": string, "callerObjectives": string, "expectedBehavior": string, "evaluationCriteria": [string, ...], "category": string}]}. "name" is REQUIRED for every scenario - a short, descriptive title (4-8 words) that captures the persona and situation at a glance (e.g. "Frustrated caller disputes a duplicate charge"), never generic filler like "Scenario 1" or "Test case". "persona" describes who the simulated caller is (tone, background, constraints). "situation" is the scenario context the caller opens the call with. "callerObjectives" is what the simulated caller is trying to get out of the call. "expectedBehavior" is what the target agent should do to pass. "evaluationCriteria" is a short list of specific, checkable criteria an evaluator can look for in the transcript. "category" is a short tag (e.g. "happy-path", "edge-case", "policy-adherence", "escalation").`;
}

const DEFAULT_COUNT = 5;
const MIN_COUNT = 1;
const TOKENS_PER_SCENARIO = 450;
const BASE_TOKENS = 500;
const MAX_RESPONSE_TOKENS = 20000;
export const MAX_COUNT = Math.floor((MAX_RESPONSE_TOKENS - BASE_TOKENS) / TOKENS_PER_SCENARIO);

function clampCount(count) {
  const n = Number(count);
  if (!Number.isFinite(n)) return DEFAULT_COUNT;
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.round(n)));
}

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

// The prompt requires the LLM to name every scenario; this only covers the
// rare case where it doesn't, so the operator is never left inventing one.
function fallbackScenarioName(s, index) {
  if (s.category && s.persona) return `${s.category}: ${s.persona}`.slice(0, 80);
  if (s.situation) return String(s.situation).slice(0, 60);
  return `Scenario ${index + 1}`;
}

export async function generateScenarios(evaluation, { feedback, count, llmGateway = callLlmGateway } = {}) {
  const targetCount = clampCount(count);
  const content = await llmGateway(
    [
      { role: "system", content: systemPrompt(targetCount) },
      { role: "user", content: feedbackUserMessage({ ...evaluation, feedback }) },
    ],
    { maxTokens: Math.min(MAX_RESPONSE_TOKENS, BASE_TOKENS + targetCount * TOKENS_PER_SCENARIO), temperature: 0.4 },
  );
  const text = typeof content === "string" ? content : content.content;
  const parsed = parseJsonResponse(text, null);
  const scenarios = parsed?.scenarios;
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    throw new Error("LLM Gateway did not return a usable scenarios array.");
  }
  return scenarios.map((s, i) => ({
    name: s.name ? String(s.name) : fallbackScenarioName(s, i),
    persona: s.persona ? String(s.persona) : null,
    situation: s.situation ? String(s.situation) : null,
    callerObjectives: s.callerObjectives ? String(s.callerObjectives) : null,
    expectedBehavior: s.expectedBehavior ? String(s.expectedBehavior) : null,
    evaluationCriteria: Array.isArray(s.evaluationCriteria) ? s.evaluationCriteria.map(String) : [],
    category: s.category ? String(s.category) : null,
  }));
}
