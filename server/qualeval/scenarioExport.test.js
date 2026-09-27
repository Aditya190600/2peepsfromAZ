import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { SCENARIO_EXPORT_COLUMNS, buildScenariosWorkbook, scenariosExportFilename } from "./scenarioExport.js";

const evaluation = { id: "eval_1", name: "Bank / Teller: v2" };
const scenarios = [
  {
    id: "sc_1",
    name: "Lost card",
    category: "happy path",
    status: "approved",
    persona: "Anxious retiree",
    situation: "Card lost abroad",
    callerObjectives: "Freeze the card",
    expectedBehavior: "Verify identity, then freeze",
    evaluationCriteria: ["Verifies identity", "Freezes card"],
    createdAt: "2026-09-20T10:00:00.000Z",
    runs: [
      { verdict: "pass", callTimestamp: "2026-09-21T12:00:00.000Z", assessment: "Handled well." },
      { verdict: "fail", callTimestamp: "2026-09-20T12:00:00.000Z", assessment: "Older run." },
    ],
  },
  {
    id: "sc_2",
    name: "Abusive caller",
    category: null,
    status: "pending",
    persona: null,
    situation: "Caller swears",
    callerObjectives: null,
    expectedBehavior: null,
    evaluationCriteria: null,
    createdAt: "2026-09-20T10:05:00.000Z",
    runs: [],
  },
];

async function readBack(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.getWorksheet("Scenarios");
}

test("buildScenariosWorkbook writes a real xlsx with one header row plus one row per scenario", async () => {
  const buffer = await buildScenariosWorkbook(evaluation, scenarios);
  // xlsx is a zip container: every valid file starts with the "PK" local header.
  assert.equal(buffer.subarray(0, 2).toString("latin1"), "PK");

  const sheet = await readBack(buffer);
  assert.ok(sheet, "expected a Scenarios worksheet");
  assert.equal(sheet.rowCount, 3);
  assert.deepEqual(
    sheet.getRow(1).values.slice(1),
    SCENARIO_EXPORT_COLUMNS.map((c) => c.header),
  );
});

test("buildScenariosWorkbook exports every scenario field plus the latest run's outcome", async () => {
  const sheet = await readBack(await buildScenariosWorkbook(evaluation, scenarios));
  const row = Object.fromEntries(
    SCENARIO_EXPORT_COLUMNS.map((c, i) => [c.key, sheet.getRow(2).getCell(i + 1).value]),
  );
  assert.equal(row.name, "Lost card");
  assert.equal(row.category, "happy path");
  assert.equal(row.status, "Accepted");
  assert.equal(row.persona, "Anxious retiree");
  assert.equal(row.situation, "Card lost abroad");
  assert.equal(row.callerObjectives, "Freeze the card");
  assert.equal(row.expectedBehavior, "Verify identity, then freeze");
  assert.equal(row.evaluationCriteria, "Verifies identity\nFreezes card");
  assert.equal(row.latestVerdict, "pass");
  assert.equal(row.latestRunAt.toISOString(), "2026-09-21T12:00:00.000Z");
  assert.equal(row.latestAssessment, "Handled well.");
});

test("buildScenariosWorkbook leaves missing fields and never-run scenarios blank", async () => {
  const sheet = await readBack(await buildScenariosWorkbook(evaluation, scenarios));
  const row = sheet.getRow(3);
  const col = (key) => row.getCell(SCENARIO_EXPORT_COLUMNS.findIndex((c) => c.key === key) + 1).value;
  assert.equal(col("name"), "Abusive caller");
  assert.equal(col("status"), "Generated");
  assert.equal(col("situation"), "Caller swears");
  for (const key of ["category", "persona", "evaluationCriteria", "latestVerdict", "latestRunAt", "latestAssessment"]) {
    assert.equal(col(key), null, `${key} should be blank`);
  }
});

test("buildScenariosWorkbook still produces a header-only sheet for an evaluation with no scenarios", async () => {
  const sheet = await readBack(await buildScenariosWorkbook(evaluation, []));
  assert.equal(sheet.rowCount, 1);
});

test("scenariosExportFilename strips characters that are unsafe in a download filename", () => {
  assert.equal(scenariosExportFilename(evaluation), "Bank Teller v2 - scenarios.xlsx");
  assert.equal(scenariosExportFilename({ name: "   " }), "scenarios.xlsx");
});
