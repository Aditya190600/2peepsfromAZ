import { CHECK_LABEL } from "./compliance.js";

export const MONITOR_CHECKS = ["consent", "ai_disclosure", "pii_scan", "opt_out"];

export function summarizeFleet(results) {
  const rows = Array.isArray(results) ? results.filter((r) => r?.report) : [];
  const total = rows.length;
  const passed = rows.filter(
    (r) => !r.report.findings.some((f) => f.status === "flag" || f.status === "error")
  ).length;
  const flaggedRows = rows.filter((r) => r.report.findings.some((f) => f.status === "flag"));
  const flagged = flaggedRows.length;
  const erroredOnly = total - passed - flagged;
  const complianceRate = total > 0 ? Math.round((passed / total) * 100) : 0;

  const perCheck = {};
  for (const r of rows) {
    for (const f of r.report.findings) {
      perCheck[f.check] ??= { pass: 0, flag: 0, error: 0, na: 0 };
      if (f.status === "n/a") perCheck[f.check].na += 1;
      else perCheck[f.check][f.status] += 1;
    }
  }

  return { total, passed, flagged, erroredOnly, complianceRate, perCheck, flaggedRows };
}

export function monitorTiles(perCheck) {
  return MONITOR_CHECKS.filter((check) => perCheck[check]).map((check) => {
    const counts = perCheck[check];
    const denom = counts.pass + counts.flag + counts.error + counts.na;
    return {
      check,
      label: CHECK_LABEL[check] ?? check,
      flag: counts.flag,
      pass: counts.pass,
      error: counts.error,
      na: counts.na,
      total: denom,
    };
  });
}
