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
// for the criterion results first, and withoutMetCriteria() below drops any
// clause of a failing assessment that names a criterion marked met.
const SYSTEM_PROMPT = `You are a strict qualitative acceptance-test evaluator for an AI voice agent. You are given a test scenario (persona, situation, caller objectives, expected behavior, evaluation criteria) and the transcript of a real phone call a simulated caller placed against the target agent to run that scenario. Judge whether the target agent's behavior in the transcript satisfies the expected behavior and each evaluation criterion. Respond with ONLY a JSON object, no other text, with the keys in this order: {"criterionResults": [{"criterion": string, "met": boolean, "explanation": string}], "evidenceQuotes": [{"quote": string, "turnIndex": number}], "verdict": "pass"|"fail", "assessment": string}. Judge every criterion first. "verdict" is "fail" if any criterion is not met or the expected behavior is not satisfied, otherwise "pass". "assessment" is a short overall summary of why the call passed or failed, written after judging the criteria: for a fail, give only the reasons that made it fail and never name a criterion you marked met. Quote exact text from the transcript in evidenceQuotes, and reference the turnIndex it came from.`;

const STOPWORDS = new Set(["agent", "caller", "call", "that", "this", "with", "within", "first", "their", "them", "they", "from", "does", "should", "must", "criterion", "criteria"]);

function keywords(text) {
  const words = String(text ?? "").toLowerCase().match(/[a-z]{4,}/g) ?? [];
  return new Set(words.filter((w) => !STOPWORDS.has(w)).map((w) => w.slice(0, 5)));
}

function overlap(a, b) {
  let n = 0;
  for (const w of a) if (b.has(w)) n += 1;
  return n;
}

// Splits prose into clauses at sentence ends, semicolons, and ", and"/", but"
// joins, never inside parentheses (where the model tends to argue with
// itself).
function clauses(text) {
  const out = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(") depth += 1;
    if (ch === ")") depth = Math.max(0, depth - 1);
    current += ch;
    if (depth > 0) continue;
    const rest = text.slice(i + 1);
    const sentenceEnd = /[.!?]/.test(ch) && /^\s/.test(rest);
    const join = /^,?\s+(and|but)\s+/i.exec(rest);
    if (sentenceEnd || ch === ";" || (ch !== "," && join)) {
      out.push(current);
      current = "";
      if (join && !sentenceEnd && ch !== ";") i += join[0].length;
    }
  }
  out.push(current);
  return out.map((c) => c.trim().replace(/^[,;]\s*/, "").replace(/[,;.!?]+$/, "").trim()).filter(Boolean);
}

function namesCriterion(clause, criteria) {
  const words = keywords(clause);
  return Math.max(0, ...criteria.map((c) => overlap(words, keywords(c.criterion))));
}

// A failing assessment with every clause that names a met criterion (more
// closely than any unmet one) removed. Falls back to listing the unmet
// criteria only when nothing of the assessment is left.
function withoutMetCriteria(assessment, criterionResults) {
  const judged = criterionResults.filter((c) => c && typeof c === "object" && typeof c.met === "boolean");
  const met = judged.filter((c) => c.met);
  const unmet = judged.filter((c) => !c.met);
  if (!assessment || met.length === 0) return assessment;
  const all = clauses(assessment);
  const kept = all.filter((clause) => {
    const metScore = namesCriterion(clause, met);
    return metScore < 2 || metScore <= namesCriterion(clause, unmet);
  });
  if (kept.length === all.length) return assessment;
  if (kept.length === 0) {
    const reasons = unmet.map((c) => String(c.criterion ?? "").trim()).filter(Boolean);
    return reasons.length ? `Failed ${unmet.length} of ${judged.length} criteria: ${reasons.join("; ")}.` : assessment;
  }
  return kept.map((c) => `${c[0].toUpperCase()}${c.slice(1)}.`).join(" ");
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
    assessment: parsed.verdict === "fail" ? withoutMetCriteria(assessment, criterionResults) : assessment,
    criterionResults,
    evidenceQuotes: Array.isArray(parsed.evidenceQuotes) ? parsed.evidenceQuotes : [],
  };
}
