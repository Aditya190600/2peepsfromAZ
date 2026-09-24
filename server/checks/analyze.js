import { consentCheck } from "./consentCheck.js";
import { disclosureCheck } from "./disclosureCheck.js";
import { recordingConsentCheck } from "./recordingConsentCheck.js";
import { optOutCheck } from "./optOutCheck.js";
import { piiScan } from "./piiScan.js";
import { scopeAdherenceCheck } from "./scopeAdherenceCheck.js";
import { miniMirandaCheck } from "./miniMirandaCheck.js";
import { PACKS as AVAILABLE_PACKS } from "../packs/index.js";

// Sums each finding's optional llmUsage/llmCostUsd (see llmGateway.js's
// callLlmGatewayWithUsage) into one report-level total, so the client can
// show real tokens-used/dollar-estimate numbers instead of a static
// "Analyzing…" message. Findings with no LLM call (consent, opt-out, etc.)
// simply don't contribute.
function aggregateUsage(findings) {
  let calls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let estimatedCostUsd = 0;
  let costKnown = false;
  for (const finding of findings) {
    if (!finding.llmUsage) continue;
    calls += 1;
    inputTokens += finding.llmUsage.inputTokens ?? 0;
    outputTokens += finding.llmUsage.outputTokens ?? 0;
    totalTokens += finding.llmUsage.totalTokens ?? 0;
    if (typeof finding.llmCostUsd === "number") {
      costKnown = true;
      estimatedCostUsd += finding.llmCostUsd;
    }
  }
  return { calls, inputTokens, outputTokens, totalTokens, estimatedCostUsd: costKnown ? estimatedCostUsd : null };
}

// session shape: { sessionId, startedAt, consentEvent: {granted, timestamp},
//                  turns: [{role: "user"|"agent", text, tMs}],
//                  persona?: {id, label, scope, seedViolation} }
//
// onCheckComplete(finding, checksDone, checksTotal) fires as each of the
// checks below resolves (they run concurrently, so completion order isn't
// fixed) - lets a caller (see server/index.js's streamed /v1/analyze-session
// response) surface live tokens-used/cost/violation-count progress instead
// of a static "Analyzing…" message.
export async function analyzeSession(
  session,
  { patternPackIds = ["generic"], llmGateway, deterministic = false, onCheckComplete } = {},
) {
  const patternPacks = patternPackIds
    .map((id) => AVAILABLE_PACKS[id])
    .filter(Boolean);
  const gatewayOpts = { ...(llmGateway ? { llmGateway } : {}), deterministic };

  // Packs whose requirement can't be expressed as a piiScan pattern (e.g. a
  // whole-call presence check with inverse polarity, or one needing LLM
  // judgment) carry their own `check`/`checks` function(s) instead of (or
  // alongside) `patterns` - see caSb1001Pack and fcraPack. They stay opt-in
  // via patternPackIds like every other pack.
  const packChecks = patternPacks
    .flatMap((pack) => (pack.checks ?? (pack.check ? [pack.check] : [])))
    .map((fn) => () => fn(session, gatewayOpts));

  const checks = [
    () => consentCheck(session),
    () => disclosureCheck(session, gatewayOpts),
    () => recordingConsentCheck(session),
    () => optOutCheck(session),
    () => piiScan(session, patternPacks, gatewayOpts),
    () => scopeAdherenceCheck(session, gatewayOpts),
    () => miniMirandaCheck(session, { patternPackIds }),
    ...packChecks,
  ];

  let checksDone = 0;
  const findings = await Promise.all(
    checks.map((run) =>
      Promise.resolve(run()).then((finding) => {
        checksDone += 1;
        onCheckComplete?.(finding, checksDone, checks.length);
        return finding;
      }),
    ),
  );

  return {
    sessionId: session.sessionId ?? null,
    generatedAt: new Date().toISOString(),
    findings,
    usage: aggregateUsage(findings),
    violationCount: findings.filter((f) => f.status === "flag").length,
  };
}
