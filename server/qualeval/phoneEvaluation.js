import { evaluateTranscript } from "./evaluator.js";
import { getVariantWithAgent } from "./demoAgentConfig.js";
import { isPersonaNumber, recordProductionCallEvaluation } from "./productionCalls.js";

// Scores a finished call that reached an agent number's target agent,
// for the Phone Evals page (client/src/PhoneEvals.jsx, docs/phone-evals.md). Phone
// Evals is deliberately separate from QualEval evaluations: a direct dial is
// never attributed to an evaluation, even one whose target number matches,
// since matching on the dialed number put a real caller's call inside
// whichever evaluation set happened to target that number.
//
// A run-linked leg of a QualEval scenario run (it claimed a run, or it came
// from QUALEVAL_PERSONA_NUMBER but its claim never landed) is recorded as
// skipped_run instead of calling the model twice - the scenario run already judges it,
// and Phone Evals lists only calls with no run. A direct caller is judged on
// the answering agent's own live instructions (its AssemblyAI stored agent's
// system prompt), since that is the only rubric such a call has. No
// instructions means no_rubric: the call is stored, not invented a verdict.

export function rubricFromAgent(agent) {
  const instructions = String(agent?.systemPrompt ?? "").trim();
  return {
    instructions,
    scenario: {
      name: agent?.name ? `Direct call to ${agent.name}` : "Direct call",
      persona: null,
      situation: "A real caller dialed the agent's phone number directly, outside any QualEval scenario.",
      callerObjectives: null,
      expectedBehavior: instructions
        ? `The agent follows its own instructions:\n${instructions}`
        : null,
      evaluationCriteria: [],
    },
  };
}

function turnsOf(transcript) {
  if (Array.isArray(transcript)) return transcript;
  if (Array.isArray(transcript?.turns)) return transcript.turns;
  return [];
}

async function liveAgentFor(variantKey) {
  if (!variantKey) return null;
  return getVariantWithAgent(variantKey);
}

export async function evaluatePhoneCall(
  call,
  {
    getAgent = liveAgentFor,
    evaluate = evaluateTranscript,
    record = recordProductionCallEvaluation,
    env = process.env,
  } = {},
) {
  if (!call?.twilioCallSid) return null;

  if (call.qualevalRunId || isPersonaNumber(call.fromNumber, env)) {
    return record({
      twilioCallSid: call.twilioCallSid,
      evaluationStatus: "skipped_run",
      qualevalRunId: call.qualevalRunId ?? null,
    });
  }

  const turns = turnsOf(call.transcript);
  if (turns.length === 0) {
    return record({ twilioCallSid: call.twilioCallSid, evaluationStatus: "no_transcript" });
  }

  let agent = null;
  try {
    agent = await getAgent(call.variantKey);
  } catch (err) {
    console.error(`Phone Evals: could not load agent "${call.variantKey}": ${err.message}`);
  }
  const { instructions, scenario } = rubricFromAgent(agent);
  if (!instructions) {
    return record({ twilioCallSid: call.twilioCallSid, evaluationStatus: "no_rubric" });
  }

  try {
    const result = await evaluate(scenario, { turns });
    return record({
      twilioCallSid: call.twilioCallSid,
      evaluationStatus: result.verdict,
      verdict: result.verdict,
      assessment: result.assessment,
      criterionResults: result.criterionResults,
      evidenceQuotes: result.evidenceQuotes,
    });
  } catch (err) {
    return record({
      twilioCallSid: call.twilioCallSid,
      evaluationStatus: "error",
      evaluationError: err.message,
    });
  }
}
