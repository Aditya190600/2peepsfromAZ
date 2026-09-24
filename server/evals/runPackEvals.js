import { analyzeSession } from "../checks/analyze.js";
import { requirePack } from "../packs/index.js";
import { casesForPack, diagnoseOwnerMiss, ownerItems } from "./cases.js";

/**
 * Canned Gateway: disclosed=true, NER empty. Never fetches. Same prompt
 * discrimination as analyze.test.js fakeLlmGateway.
 */
export async function offlineEvalGateway(messages) {
  const systemPrompt = messages[0]?.content ?? "";
  if (systemPrompt.includes("disclos")) {
    return JSON.stringify({ disclosed: true, turnIndex: 0, quote: "AI assistant" });
  }
  return JSON.stringify({ items: [] });
}

function piiFinding(report) {
  return (report.findings ?? []).find((f) => f.check === "pii_scan") ?? { items: [], patternPacksUsed: [] };
}

function checkFinding(report, checkId) {
  return (report.findings ?? []).find((f) => f.check === checkId) ?? null;
}

function gradeEnabled(cse, pack, report) {
  const pii = piiFinding(report);
  const used = pii.patternPacksUsed ?? [];
  const items = ownerItems(pii, cse.ownerPackId);
  const checkpoints = [];

  const active = used.includes(cse.ownerPackId);
  checkpoints.push({
    kind: "owner-pack-active",
    passed: active,
    detail: active
      ? `${cse.ownerPackId} was in patternPacksUsed`
      : `${cse.ownerPackId} missing from patternPacksUsed (${used.join(", ") || "none"})`,
  });

  if (cse.kind === "detects" || cse.kind === "scenario") {
    for (const patternId of cse.expectedPatternIds) {
      const hit = items.some((item) => item.patternId === patternId);
      const pattern = pack.patterns.find((p) => p.id === patternId);
      checkpoints.push({
        kind: "expected-item",
        passed: hit,
        detail: hit
          ? `flagged ${patternId}`
          : diagnoseOwnerMiss(pattern, cse.session, items),
      });
    }
  }

  if (cse.kind === "ignores") {
    const leaked = items.filter((item) => item.patternId === cse.patternId);
    checkpoints.push({
      kind: "owner-pack-absent-pattern",
      passed: leaked.length === 0,
      detail:
        leaked.length === 0
          ? `${cse.patternId} stayed quiet`
          : `${cse.patternId} fired on a near-miss`,
    });
  }

  if (cse.kind === "detects" || cse.kind === "scenario") {
    const extra = items.filter((item) => !cse.expectedPatternIds.includes(item.patternId));
    checkpoints.push({
      kind: "closed-world",
      passed: extra.length === 0,
      detail:
        extra.length === 0
          ? "no unexpected owner items"
          : `unexpected owner items: ${extra.map((i) => i.patternId).join(", ")}`,
    });
  }

  if (cse.kind === "scenario" && cse.expectCheckId) {
    const finding = checkFinding(report, cse.expectCheckId);
    const matched = finding?.status === cse.expectCheckStatus;
    checkpoints.push({
      kind: "check-status",
      passed: matched,
      detail: matched
        ? `${cse.expectCheckId} reported status "${cse.expectCheckStatus}"`
        : `${cse.expectCheckId} reported status "${finding?.status ?? "missing"}", expected "${cse.expectCheckStatus}"`,
    });
  }

  return {
    mode: "enabled",
    patternPackIds: null, // filled by caller
    checkpoints,
    passed: checkpoints.every((c) => c.passed),
  };
}

function gradeOmitted(cse, report) {
  const pii = piiFinding(report);
  const used = pii.patternPacksUsed ?? [];
  const items = ownerItems(pii, cse.ownerPackId);
  const checkpoints = [
    {
      kind: "owner-pack-absent",
      passed: !used.includes(cse.ownerPackId),
      detail: used.includes(cse.ownerPackId)
        ? `${cse.ownerPackId} still in patternPacksUsed`
        : `${cse.ownerPackId} omitted from the scan`,
    },
    {
      kind: "no-owner-items",
      passed: items.length === 0,
      detail:
        items.length === 0
          ? "no owner-pack items with the pack off"
          : `owner items leaked: ${items.map((i) => i.patternId).join(", ")}`,
    },
  ];

  if (cse.kind === "scenario" && cse.expectCheckId) {
    const finding = checkFinding(report, cse.expectCheckId);
    checkpoints.push({
      kind: "check-absent",
      passed: finding === null,
      detail:
        finding === null
          ? `${cse.expectCheckId} did not run with the pack off`
          : `${cse.expectCheckId} still ran with status "${finding.status}"`,
    });
  }

  return {
    mode: "owner-omitted",
    patternPackIds: null,
    checkpoints,
    passed: checkpoints.every((c) => c.passed),
  };
}

/**
 * Run curated suites for an already-validated industry pack pick.
 * Never writes reportCache. Never calls the live Gateway.
 *
 * @param {string[]} packIds
 * @param {{ analyze?: typeof analyzeSession, llmGateway?: Function }} [opts]
 */
export async function evaluatePacks(packIds, opts = {}) {
  const analyze = opts.analyze ?? analyzeSession;
  const llmGateway = opts.llmGateway ?? offlineEvalGateway;
  const suites = [];

  for (const packId of packIds) {
    const pack = requirePack(packId);
    const others = packIds.filter((id) => id !== packId);
    const enabledIds = ["generic", ...packIds];
    const omittedIds = ["generic", ...others];
    const cases = casesForPack(pack);
    const results = [];

    for (const cse of cases) {
      const enabledReport = await analyze(cse.session, {
        patternPackIds: enabledIds,
        llmGateway,
      });
      const omittedReport = await analyze(cse.session, {
        patternPackIds: omittedIds,
        llmGateway,
      });
      const enabled = gradeEnabled(cse, pack, enabledReport);
      enabled.patternPackIds = enabledIds;
      const ownerOmitted = gradeOmitted(cse, omittedReport);
      ownerOmitted.patternPackIds = omittedIds;
      results.push({
        id: cse.id,
        ownerPackId: cse.ownerPackId,
        kind: cse.kind,
        title: cse.title,
        claim: cse.claim,
        enabled,
        ownerOmitted,
        passed: enabled.passed && ownerOmitted.passed,
      });
    }

    const passed = results.filter((r) => r.passed).length;
    suites.push({
      packId: pack.id,
      packName: pack.name,
      asserts: pack.asserts,
      citation: pack.citation,
      passed,
      failed: results.length - passed,
      cases: results,
    });
  }

  const passed = suites.reduce((n, s) => n + s.passed, 0);
  const failed = suites.reduce((n, s) => n + s.failed, 0);
  return {
    generatedAt: new Date().toISOString(),
    packIds: [...packIds],
    judge: "synthetic-offline",
    passed,
    failed,
    suites,
  };
}
