import { callLlmGateway, parseJsonResponse } from "../checks/llmGateway.js";

// Judges a completed call transcript against one scenario's expected
// behavior and criteria. Only ever called with a real transcript (see
// server/qualeval/store.js's attachTranscript) - never fabricates a verdict
// for a run that hasn't actually been placed.
//
// The per-criterion results are the source of truth for the verdict and the
// summary shown on the verdict banner. When the model wrote its overall
// assessment first (as this prompt's JSON shape used to ask), it reasoned
// inside the assessment and could cite a criterion as a failure and then
// concede it was met in the same sentence ("failed to disclose within 10
// seconds (it took 1120ms ... so this criterion is actually met)"), while its
// criterion results correctly marked that criterion met. The prompt now asks
// for the criterion results first, and summarize() below never lets the
// banner text name a criterion that passed as a reason for failing.
const SYSTEM_PROMPT = `You are a strict qualitative acceptance-test evaluator for an AI voice agent. You are given a test scenario (persona, situation, caller objectives, expected behavior, evaluation criteria) and the transcript of a real phone call a simulated caller placed against the target agent to run that scenario. Judge whether the target agent's behavior in the transcript satisfies the expected behavior and each evaluation criterion. Respond with ONLY a JSON object, no other text, with the keys in this order: {"criterionResults": [{"criterion": string, "met": boolean, "explanation": string}], "evidenceQuotes": [{"quote": string, "turnIndex": number}], "verdict": "pass"|"fail", "assessment": string}. Judge every criterion first. "verdict" is "fail" if any criterion is not met, otherwise "pass". "assessment" is a short overall summary of why the call passed or failed, written after judging the criteria: for a fail, give only the reasons that made it fail and never name a criterion you marked met. Quote exact text from the transcript in evidenceQuotes, and reference the turnIndex it came from.`;

function isJudgedCriterion(c) {
  return c && typeof c === "object" && typeof c.met === "boolean";
}

// Verdict and banner summary, derived from the per-criterion results when
// the model returned any: a call fails exactly when a criterion is unmet,
// and a failing call's summary lists only those unmet criteria, so it can
// never contradict the green criteria shown under it. Without judged
// criteria (e.g. a Phone Evals call scored on the agent's own instructions
// may come back with none), the model's own verdict and assessment stand.
function summarize({ verdict, assessment, criterionResults }) {
  const judged = criterionResults.filter(isJudgedCriterion);
  if (judged.length === 0) return { verdict, assessment };
  const unmet = judged.filter((c) => !c.met);
  if (unmet.length === 0) {
    return { verdict: "pass", assessment: verdict === "pass" && assessment ? assessment : `All ${judged.length} criteria met.` };
  }
  const reasons = unmet.map((c) => String(c.criterion ?? "").trim()).filter(Boolean);
  return {
    verdict: "fail",
    assessment: `Failed ${unmet.length} of ${judged.length} criteria${reasons.length ? `: ${reasons.join("; ")}.` : "."}`,
  };
}

// Turn times go to the model in seconds, the unit criteria are written in
// ("within the first 10 seconds"). Given raw milliseconds it compared
// t=1440ms against 10 seconds and marked a disclosure at 1.44 s as late.
function turnTime(tMs) {
  return Number.isFinite(tMs) ? `${(tMs / 1000).toFixed(1)}s` : "?";
}

function transcriptForPrompt(transcript) {
  const turns = transcript?.turns ?? [];
  return turns.map((t, i) => `Turn ${i} (${t.role}, t=${turnTime(t.tMs)}): "${t.text}"`).join("\n");
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
  const criterionResults = Array.isArray(parsed.criterionResults) ? parsed.criterionResults : [];
  return {
    ...summarize({
      verdict: parsed.verdict,
      assessment: parsed.assessment ? String(parsed.assessment) : "",
      criterionResults,
    }),
    criterionResults,
    evidenceQuotes: Array.isArray(parsed.evidenceQuotes) ? parsed.evidenceQuotes : [],
  };
}
