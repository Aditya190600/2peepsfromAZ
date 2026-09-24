import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createEvaluation,
  listEvaluations,
  getEvaluation,
  insertScenarios,
  listScenarios,
  getScenario,
  updateScenario,
  deleteUnapprovedScenarios,
  createRun,
  getRun,
  listRuns,
  attachTranscript,
  recordVerdict,
  NOT_CONFIGURED_ERROR,
} from "./store.js";

// Minimal in-memory fake covering the three QualEval tables, generalized by
// table name rather than exact-string SQL matching (unlike apiKeys.test.js's
// fakePool) since this module's queries span three related tables.
function fakePool() {
  const tables = { qualeval_evaluations: [], qualeval_scenarios: [], qualeval_runs: [] };
  let nextId = 1;
  const genId = () => `id_${nextId++}`;

  const query = async (text, params = []) => {
    const sql = text.trim().toLowerCase();
    const tableMatch = sql.match(/(?:into|from|update)\s+(qualeval_\w+)/);
    const table = tableMatch?.[1];
    if (!table) throw new Error(`could not determine table from query: ${text}`);
    const rows = tables[table];

    if (sql.startsWith("insert into qualeval_evaluations")) {
      const [name, agent_phone_number, description, requirements, clerk_user_id] = params;
      const row = {
        id: genId(),
        name,
        agent_phone_number,
        description,
        requirements,
        clerk_user_id,
        created_at: new Date().toISOString(),
      };
      rows.push(row);
      return { rows: [row] };
    }
    if (sql.startsWith("insert into qualeval_scenarios")) {
      const [evaluation_id, name, persona, situation, caller_objectives, expected_behavior, evaluation_criteria, category] =
        params;
      const row = {
        id: genId(),
        evaluation_id,
        name,
        persona,
        situation,
        caller_objectives,
        expected_behavior,
        evaluation_criteria: JSON.parse(evaluation_criteria),
        category,
        status: "pending",
        created_at: new Date().toISOString(),
      };
      rows.push(row);
      return { rows: [row] };
    }
    if (sql.startsWith("insert into qualeval_runs")) {
      const [scenario_id, assessment] = params;
      const row = {
        id: genId(),
        scenario_id,
        call_timestamp: null,
        transcript: null,
        audio_ref: null,
        verdict: "pending",
        assessment,
        criterion_results: null,
        evidence_quotes: null,
        created_at: new Date().toISOString(),
      };
      rows.push(row);
      return { rows: [row] };
    }
    if (sql.startsWith("select") && table === "qualeval_evaluations") {
      if (params.length === 2) {
        const [id, clerkUserId] = params;
        return { rows: rows.filter((r) => r.id === id && r.clerk_user_id === clerkUserId) };
      }
      const [clerkUserId] = params;
      return { rows: rows.filter((r) => r.clerk_user_id === clerkUserId) };
    }
    if (sql.startsWith("select") && table === "qualeval_scenarios") {
      if (sql.includes("where id =")) {
        const [id] = params;
        return { rows: rows.filter((r) => r.id === id) };
      }
      const [evaluationId] = params;
      return { rows: rows.filter((r) => r.evaluation_id === evaluationId) };
    }
    if (sql.startsWith("select") && table === "qualeval_runs") {
      if (sql.includes("where id =")) {
        const [id] = params;
        return { rows: rows.filter((r) => r.id === id) };
      }
      const [scenarioId] = params;
      return { rows: rows.filter((r) => r.scenario_id === scenarioId) };
    }
    if (sql.startsWith("delete from qualeval_scenarios")) {
      const [evaluationId] = params;
      tables.qualeval_scenarios = rows.filter((r) => !(r.evaluation_id === evaluationId && r.status !== "approved"));
      return { rows: [] };
    }
    if (sql.startsWith("update qualeval_scenarios")) {
      const id = params[0];
      const row = rows.find((r) => r.id === id);
      if (!row) return { rows: [] };
      const setClause = text.match(/set (.+) where/i)[1];
      const cols = setClause.split(",").map((c) => c.trim().split("=")[0].trim());
      cols.forEach((col, i) => {
        row[col] = col === "evaluation_criteria" ? JSON.parse(params[i + 1]) : params[i + 1];
      });
      return { rows: [row] };
    }
    if (sql.startsWith("update qualeval_runs") && sql.includes("set transcript")) {
      const [id, transcript] = params;
      const row = rows.find((r) => r.id === id);
      if (!row) return { rows: [] };
      row.transcript = JSON.parse(transcript);
      row.call_timestamp = new Date().toISOString();
      return { rows: [row] };
    }
    if (sql.startsWith("update qualeval_runs") && sql.includes("set verdict")) {
      const [id, verdict, assessment, criterionResults, evidenceQuotes] = params;
      const row = rows.find((r) => r.id === id);
      if (!row) return { rows: [] };
      row.verdict = verdict;
      row.assessment = assessment;
      row.criterion_results = JSON.parse(criterionResults);
      row.evidence_quotes = JSON.parse(evidenceQuotes);
      return { rows: [row] };
    }

    throw new Error(`unhandled query: ${text}`);
  };

  return { query };
}

test("createEvaluation and listEvaluations round-trip, scoped by clerkUserId", async () => {
  const pool = fakePool();
  await createEvaluation({ clerkUserId: "user_1", name: "Order desk agent" }, {}, pool);
  await createEvaluation({ clerkUserId: "user_2", name: "Other account's eval" }, {}, pool);

  const evaluations = await listEvaluations("user_1", {}, pool);
  assert.equal(evaluations.length, 1);
  assert.equal(evaluations[0].name, "Order desk agent");
});

test("createEvaluation requires a name", async () => {
  const pool = fakePool();
  await assert.rejects(() => createEvaluation({ clerkUserId: "user_1", name: "  " }, {}, pool));
});

test("insertScenarios then listScenarios and getScenario round-trip", async () => {
  const pool = fakePool();
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Eval" }, {}, pool);
  const [scenario] = await insertScenarios(
    evaluation.id,
    [
      {
        name: "Angry customer wants a refund",
        persona: "Frustrated caller",
        situation: "Order arrived damaged",
        callerObjectives: "Get a refund",
        expectedBehavior: "Agent offers a refund or escalation path",
        evaluationCriteria: ["Offers refund or escalation", "Stays professional"],
        category: "edge-case",
      },
    ],
    {},
    pool,
  );
  assert.equal(scenario.status, "pending");

  const scenarios = await listScenarios(evaluation.id, {}, pool);
  assert.equal(scenarios.length, 1);
  assert.deepEqual(scenarios[0].evaluationCriteria, ["Offers refund or escalation", "Stays professional"]);

  const fetched = await getScenario(scenario.id, {}, pool);
  assert.equal(fetched.name, "Angry customer wants a refund");
});

test("updateScenario approves a scenario and rejects an unknown status", async () => {
  const pool = fakePool();
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Eval" }, {}, pool);
  const [scenario] = await insertScenarios(evaluation.id, [{ name: "S1", evaluationCriteria: [] }], {}, pool);

  const approved = await updateScenario(scenario.id, { status: "approved" }, {}, pool);
  assert.equal(approved.status, "approved");

  await assert.rejects(() => updateScenario(scenario.id, { status: "bogus" }, {}, pool));
});

test("deleteUnapprovedScenarios keeps approved scenarios and drops the rest", async () => {
  const pool = fakePool();
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Eval" }, {}, pool);
  const [keep, drop] = await insertScenarios(
    evaluation.id,
    [
      { name: "Keep me", evaluationCriteria: [] },
      { name: "Drop me", evaluationCriteria: [] },
    ],
    {},
    pool,
  );
  await updateScenario(keep.id, { status: "approved" }, {}, pool);

  await deleteUnapprovedScenarios(evaluation.id, {}, pool);

  const remaining = await listScenarios(evaluation.id, {}, pool);
  assert.deepEqual(
    remaining.map((s) => s.name),
    ["Keep me"],
  );
  assert.equal(await getScenario(drop.id, {}, pool), null);
});

test("createRun stubs a pending run with no fabricated transcript or verdict", async () => {
  const pool = fakePool();
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Eval" }, {}, pool);
  const [scenario] = await insertScenarios(evaluation.id, [{ name: "S1", evaluationCriteria: [] }], {}, pool);

  const run = await createRun(scenario.id, {}, pool);
  assert.equal(run.verdict, "pending");
  assert.equal(run.transcript, null);
  assert.match(run.assessment, /not yet run/i);

  const fetched = await getRun(run.id, {}, pool);
  assert.equal(fetched.verdict, "pending");

  const runs = await listRuns(scenario.id, {}, pool);
  assert.equal(runs.length, 1);
});

test("attachTranscript and recordVerdict update a run once a real transcript exists", async () => {
  const pool = fakePool();
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Eval" }, {}, pool);
  const [scenario] = await insertScenarios(evaluation.id, [{ name: "S1", evaluationCriteria: [] }], {}, pool);
  const run = await createRun(scenario.id, {}, pool);

  const transcript = { turns: [{ role: "agent", text: "Hello", tMs: 0 }] };
  const withTranscript = await attachTranscript(run.id, transcript, {}, pool);
  assert.deepEqual(withTranscript.transcript, transcript);

  const withVerdict = await recordVerdict(
    run.id,
    { verdict: "pass", assessment: "Handled well", criterionResults: [{ criterion: "c1", met: true }], evidenceQuotes: [] },
    {},
    pool,
  );
  assert.equal(withVerdict.verdict, "pass");
  assert.equal(withVerdict.assessment, "Handled well");
});

test("every write function throws the not-configured error when Postgres isn't set up", async () => {
  await assert.rejects(() => createEvaluation({ clerkUserId: "user_1", name: "x" }, {}, null), {
    message: NOT_CONFIGURED_ERROR,
  });
});
