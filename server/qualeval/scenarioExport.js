// Builds the .xlsx download for one evaluation's scenario set
// (GET /v1/qualeval/evaluations/:id/scenarios.xlsx in router.js). One row per
// scenario, every scenario field as its own column, plus the latest run's
// outcome so a reviewer can triage in a spreadsheet without re-opening the app.
import ExcelJS from "exceljs";

// Same labels the QualEval page's status tabs use (client/src/QualEval.jsx
// STATUS_TABS), so the spreadsheet reads the way the UI does.
const STATUS_LABELS = { pending: "Generated", approved: "Accepted", rejected: "Rejected" };

export const SCENARIO_EXPORT_COLUMNS = [
  { key: "name", header: "Name", width: 30 },
  { key: "category", header: "Category", width: 18 },
  { key: "status", header: "Status", width: 12 },
  { key: "persona", header: "Persona", width: 40 },
  { key: "situation", header: "Situation", width: 50 },
  { key: "callerObjectives", header: "Caller objectives", width: 40 },
  { key: "expectedBehavior", header: "Expected behavior", width: 50 },
  { key: "evaluationCriteria", header: "Evaluation criteria", width: 50 },
  { key: "latestVerdict", header: "Latest run verdict", width: 18 },
  { key: "latestRunAt", header: "Latest run at (UTC)", width: 20 },
  { key: "latestAssessment", header: "Latest run assessment", width: 60 },
];

function blankToNull(value) {
  return value === undefined || value === "" ? null : value;
}

function scenarioRowValues(scenario) {
  // runs arrive newest-first (store.listRuns), same as the page's runs?.[0].
  const latestRun = scenario.runs?.[0] ?? null;
  const criteria = scenario.evaluationCriteria ?? [];
  const runAt = latestRun?.callTimestamp ?? latestRun?.createdAt ?? null;
  return {
    name: blankToNull(scenario.name),
    category: blankToNull(scenario.category),
    status: STATUS_LABELS[scenario.status] ?? blankToNull(scenario.status),
    persona: blankToNull(scenario.persona),
    situation: blankToNull(scenario.situation),
    callerObjectives: blankToNull(scenario.callerObjectives),
    expectedBehavior: blankToNull(scenario.expectedBehavior),
    evaluationCriteria: criteria.length > 0 ? criteria.join("\n") : null,
    latestVerdict: blankToNull(latestRun?.verdict),
    latestRunAt: runAt ? new Date(runAt) : null,
    latestAssessment: blankToNull(latestRun?.assessment),
  };
}

// Resolves to a Buffer holding a complete .xlsx workbook.
export async function buildScenariosWorkbook(evaluation, scenarios) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Qualitative Evals";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Scenarios", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = SCENARIO_EXPORT_COLUMNS.map(({ key, header, width }) => ({
    key,
    header,
    width,
    style: { alignment: { vertical: "top", wrapText: true } },
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.getColumn("latestRunAt").numFmt = "yyyy-mm-dd hh:mm";
  for (const scenario of scenarios) sheet.addRow(scenarioRowValues(scenario));
  if (scenarios.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: SCENARIO_EXPORT_COLUMNS.length } };
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function scenariosExportFilename(evaluation) {
  const base = (evaluation?.name ?? "")
    .replace(/[^\p{L}\p{N} _.-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base ? `${base} - scenarios.xlsx` : "scenarios.xlsx";
}
