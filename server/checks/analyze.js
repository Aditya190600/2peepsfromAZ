import { consentCheck } from "./consentCheck.js";
import { disclosureCheck } from "./disclosureCheck.js";
import { piiScan } from "./piiScan.js";
import { genericPack, hipaaPack } from "./patternPacks.js";

const AVAILABLE_PACKS = { generic: genericPack, hipaa: hipaaPack };

// session shape: { sessionId, startedAt, consentEvent: {granted, timestamp},
//                  turns: [{role: "user"|"agent", text, tMs}] }
export function analyzeSession(session, { patternPackIds = ["generic"] } = {}) {
  const patternPacks = patternPackIds
    .map((id) => AVAILABLE_PACKS[id])
    .filter(Boolean);

  const findings = [consentCheck(session), disclosureCheck(session), piiScan(session, patternPacks)];

  return {
    sessionId: session.sessionId ?? null,
    generatedAt: new Date().toISOString(),
    findings,
  };
}
