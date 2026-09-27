import { evaluateTranscript } from "./evaluator.js";
import {
  findEvaluationByPhone,
  recordProductionCallEvaluation,
} from "./productionCalls.js";

// Scores a finished inbound call against the evaluation whose target number
// was dialed. QualEval scenario runs already judge the outbound leg, so a
// run-linked inbound leg is recorded as skipped_run instead of calling the
// model twice. A real caller is judged on the evaluation's requirements
// (one criterion per line). No requirements means no_rubric: the call is
// stored, not invented a verdict.

export function rubricFromEvaluation(evaluation) {
  const requirements = String(evaluation?.requirements ?? "").trim();
  const description = String(evaluation?.description ?? "").trim();
  const rubricText = requirements || description;
  const criteria = rubricText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    rubricText,
    scenario: {
      name: evaluation?.name || "Inbound call",
      persona: null,
      situation: description || "A real caller dialed the agent.",
      callerObjectives: null,
      expectedBehavior: rubricText || null,
      evaluationCriteria: criteria.length > 0 ? criteria : [],
    },
  };
}

function turnsOf(transcript) {
  if (Array.isArray(transcript)) return transcript;
  if (Array.isArray(transcript?.turns)) return transcript.turns;
  return [];
}

export async function evaluateInboundCall(
  call,
  {
    findEvaluation = findEvaluationByPhone,
    evaluate = evaluateTranscript,
    record = recordProductionCallEvaluation,
  } = {},
) {
  if (!call?.twilioCallSid) return null;
  const evaluation = await findEvaluation(call.toNumber);
  const evaluationId = evaluation?.id ?? null;

  if (call.qualevalRunId) {
    return record({
      twilioCallSid: call.twilioCallSid,
      evaluationId,
      evaluationStatus: "skipped_run",
      qualevalRunId: call.qualevalRunId,
    });
  }

  const turns = turnsOf(call.transcript);
  if (turns.length === 0) {
    return record({
      twilioCallSid: call.twilioCallSid,
      evaluationId,
      evaluationStatus: "no_transcript",
    });
  }

  const { rubricText, scenario } = rubricFromEvaluation(evaluation);
  if (!evaluation || !rubricText) {
    return record({
      twilioCallSid: call.twilioCallSid,
      evaluationId,
      evaluationStatus: "no_rubric",
    });
  }

  try {
    const result = await evaluate(scenario, { turns });
    return record({
      twilioCallSid: call.twilioCallSid,
      evaluationId,
      evaluationStatus: result.verdict,
      verdict: result.verdict,
      assessment: result.assessment,
      criterionResults: result.criterionResults,
      evidenceQuotes: result.evidenceQuotes,
    });
  } catch (err) {
    return record({
      twilioCallSid: call.twilioCallSid,
      evaluationId,
      evaluationStatus: "error",
      evaluationError: err.message,
    });
  }
}
