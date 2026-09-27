import { analyzeSession } from "../checks/analyze.js";
import * as providers from "../providers/registry.js";
import { findDemoAgent } from "./demoAgentDefaults.js";
import { isPersonaNumber, recordProductionCallCompliance } from "./productionCalls.js";

// Runs the ComplyLine compliance checks (server/checks/analyze.js) on a
// finished direct call to QUALEVAL_AGENT_NUMBER, the moment it ends, for the
// operator-only Phone Evals page (client/src/PhoneEvals.jsx). It sits beside
// phoneEvaluation.js's pass/fail verdict: that one asks "did the agent follow
// its own instructions", this one asks "did the call expose a compliance
// risk", with the same severity-ranked findings as the Voice Compliance page.
//
// Scenario-run legs are skipped for the same reason phoneEvaluation.js skips
// them: they belong to a QualEval run, never to Phone Evals.

// Industry packs per demo-agent domain, matching the Try page's persona
// auto-selection (client/src/personas.js): a banking call gets the finance
// pack, a healthcare call HIPAA. Running every pack instead would flag
// absence-is-bad requirements that have nothing to do with the call (an FDCPA
// Mini-Miranda on a flight booking).
export const DOMAIN_PACK_IDS = {
  banking: ["generic", "finance"],
  healthcare: ["generic", "hipaa"],
  flight: ["generic"],
};

export function packIdsForVariant(variantKey) {
  return DOMAIN_PACK_IDS[findDemoAgent(variantKey)?.domain] ?? ["generic"];
}

function turnsOf(transcript) {
  if (Array.isArray(transcript)) return transcript;
  if (Array.isArray(transcript?.turns)) return transcript.turns;
  return [];
}

// The caller dialed the agent themselves, so the call is consented to by
// placing it - the same stance the Try page's live call takes
// (client/src/useVoiceAgent.js). Without this every inbound call would carry
// a TCPA "no consent logged" flag that only applies to calls the business
// places.
export function sessionFromCall(call, turns) {
  const startedAt = new Date(call.startedAt ?? Date.now()).toISOString();
  return {
    sessionId: call.twilioCallSid,
    startedAt,
    consentEvent: { granted: true, timestamp: startedAt },
    turns,
  };
}

export async function analyzePhoneEvalCompliance(
  call,
  {
    analyze = analyzeSession,
    llmGateway = () => providers.getModel().complete,
    record = recordProductionCallCompliance,
    env = process.env,
  } = {},
) {
  if (!call?.twilioCallSid) return null;

  if (call.qualevalRunId || isPersonaNumber(call.fromNumber, env)) {
    return record({ twilioCallSid: call.twilioCallSid, complianceStatus: "skipped_run" });
  }

  const turns = turnsOf(call.transcript);
  if (turns.length === 0) {
    return record({ twilioCallSid: call.twilioCallSid, complianceStatus: "no_transcript" });
  }

  try {
    const report = await analyze(sessionFromCall(call, turns), {
      patternPackIds: packIdsForVariant(call.variantKey),
      llmGateway: llmGateway(),
    });
    return record({ twilioCallSid: call.twilioCallSid, complianceStatus: "done", complianceReport: report });
  } catch (err) {
    console.error(`Phone Evals: compliance analysis failed for ${call.twilioCallSid}: ${err.message}`);
    return record({
      twilioCallSid: call.twilioCallSid,
      complianceStatus: "error",
      complianceError: err.message,
    });
  }
}
