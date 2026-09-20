import { consentCheck } from "./consentCheck.js";
import { disclosureCheck } from "./disclosureCheck.js";
import { recordingConsentCheck } from "./recordingConsentCheck.js";
import { optOutCheck } from "./optOutCheck.js";
import { piiScan } from "./piiScan.js";
import { PACKS as AVAILABLE_PACKS } from "../packs/index.js";

// session shape: { sessionId, startedAt, consentEvent: {granted, timestamp},
//                  turns: [{role: "user"|"agent", text, tMs}] }
export async function analyzeSession(session, { patternPackIds = ["generic"], llmGateway } = {}) {
  const patternPacks = patternPackIds
    .map((id) => AVAILABLE_PACKS[id])
    .filter(Boolean);
  const gatewayOpts = llmGateway ? { llmGateway } : {};

  const findings = await Promise.all([
    consentCheck(session),
    disclosureCheck(session, gatewayOpts),
    recordingConsentCheck(session),
    optOutCheck(session),
    piiScan(session, patternPacks, gatewayOpts),
  ]);

  return {
    sessionId: session.sessionId ?? null,
    generatedAt: new Date().toISOString(),
    findings,
  };
}
