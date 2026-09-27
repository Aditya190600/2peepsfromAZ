import { evaluatePhoneCall } from "./phoneEvaluation.js";
import { analyzePhoneEvalCompliance } from "./phoneCompliance.js";
import { markProductionCallAnalysisStarted } from "./productionCalls.js";

// The two analyses a finished direct call gets (see AGENTS.md's Phone Evals
// section): the compliance report first, since it is what the Phone Evals page
// leads with, then the pass/fail score against the agent's own instructions.
// They run one after the other rather than side by side because both call the
// LLM Gateway, whose rate limit is tight (~2 calls/30s); run together their
// retries collide and both are more likely to give up. One failing never
// stops the other. Shared by the hangup path (targetAgentStream.js) and the
// operator re-run route (router.js).
export async function analyzeFinishedCall(
  call,
  {
    markStarted = markProductionCallAnalysisStarted,
    analyzeCompliance = analyzePhoneEvalCompliance,
    evaluateCall = evaluatePhoneCall,
  } = {},
) {
  if (!call?.twilioCallSid) return;
  const steps = [
    ["mark analysis start", () => markStarted(call.twilioCallSid)],
    ["compliance analysis", () => analyzeCompliance(call)],
    ["agent-instructions evaluation", () => evaluateCall(call)],
  ];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (err) {
      console.error(`Phone Evals: ${name} failed for ${call.twilioCallSid}: ${err.message}`);
    }
  }
}
