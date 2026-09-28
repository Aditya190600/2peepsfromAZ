import { callLlmGateway, parseJsonResponse } from "../checks/llmGateway.js";

// Judges a completed call transcript against one scenario's expected
// behavior and criteria. Only ever called with a real transcript (see
// server/qualeval/store.js's attachTranscript) - never fabricates a verdict
// for a run that hasn't actually been placed.
//
// The model's verdict and assessment are authoritative: the verdict also
// covers the expected behavior, which the listed criteria may not (a Phone
// Evals call is scored with no listed criteria at all). The one thing fixed
// up in code is the original contradiction: when the model wrote its overall
// assessment first (as this prompt's JSON shape used to ask), it reasoned
// inside the assessment and could cite a criterion as a failure and then
// concede it was met in the same sentence ("failed to disclose within 10
// seconds (it took 1120ms ... so this criterion is actually met)"), while its
// criterion results correctly marked that criterion met. The prompt now asks
// for the criterion results first, and withoutConcededCriteria() below drops
// any clause of a failing assessment that concedes a criterion was met.
const SYSTEM_PROMPT = `You are a strict qualitative acceptance-test evaluator for an AI voice agent. You are given a test scenario (persona, situation, caller objectives, expected behavior, evaluation criteria) and the transcript of a real phone call a simulated caller placed against the target agent to run that scenario. Judge whether the target agent's behavior in the transcript satisfies the expected behavior and each evaluation criterion. Respond with ONLY a JSON object, no other text, with the keys in this order: {"criterionResults": [{"criterion": string, "met": boolean, "explanation": string}], "evidenceQuotes": [{"quote": string, "turnIndex": number}], "verdict": "pass"|"fail", "assessment": string}. Judge every criterion first. "verdict" is "fail" if any criterion is not met or the expected behavior is not satisfied, otherwise "pass". "assessment" is a short overall summary of why the call passed or failed, written after judging the criteria: for a fail, give only the reasons that made it fail and never name a criterion you marked met. Quote exact text from the transcript in evidenceQuotes, and reference the turnIndex it came from.`;

const CONCESSION = /\b(?:is|was)\s+(?:actually\s+)?(?:met|satisfied)\b|\bwhich is under\b/i;

// Splits prose into clauses at sentence ends and ", and"/", but" joins, never
// inside parentheses (where the model tends to argue with itself). Each
// clause keeps the separator that led into it, so dropping clauses leaves the
// surviving text exactly as written.
function clauses(text) {
  const out = [];
  let depth = 0;
  let lead = "";
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "(") depth += 1;
    if (ch === ")") depth = Math.max(0, depth - 1);
    const rest = text.slice(i);
    const join = depth === 0 && /^,\s+(?:and|but)\s+/i.exec(rest);
    const sentenceEnd = depth === 0 && /^[.!?]\s+/.exec(rest);
    if (join || sentenceEnd) {
      const end = join ? i : i + 1;
      out.push({ lead, body: text.slice(start, end) });
      lead = join ? join[0] : sentenceEnd[0].slice(1);
      i = end + lead.length;
      start = i;
      continue;
    }
    i += 1;
  }
  out.push({ lead, body: text.slice(start) });
  return out.filter((c) => c.body.trim());
}

// A failing assessment with every clause that concedes a criterion was met
// removed, when criterionResults does mark some criterion met. Falls back to
// listing the unmet criteria only when nothing of the assessment is left.
function withoutConcededCriteria(assessment, criterionResults) {
  const judged = criterionResults.filter((c) => c && typeof c === "object" && typeof c.met === "boolean");
  const unmet = judged.filter((c) => !c.met);
  if (!assessment || !judged.some((c) => c.met)) return assessment;
  const all = clauses(assessment);
  const kept = all.filter((c) => !CONCESSION.test(c.body));
  if (kept.length === all.length) return assessment;
  if (kept.length === 0) {
    const reasons = unmet.map((c) => String(c.criterion ?? "").trim()).filter(Boolean);
    return reasons.length ? `Failed ${unmet.length} of ${judged.length} criteria: ${reasons.join("; ")}.` : assessment;
  }
  let text = kept.map((c, i) => (i === 0 ? c.body : c.lead + c.body)).join("").trim();
  const ending = /[.!?]$/.exec(all[all.length - 1].body.trim());
  if (ending && !/[.!?]$/.test(text)) text += ending[0];
  return text[0].toUpperCase() + text.slice(1);
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
  const assessment = parsed.assessment ? String(parsed.assessment) : "";
  return {
    verdict: parsed.verdict,
    assessment: parsed.verdict === "fail" ? withoutConcededCriteria(assessment, criterionResults) : assessment,
    criterionResults,
    evidenceQuotes: Array.isArray(parsed.evidenceQuotes) ? parsed.evidenceQuotes : [],
  };
}
