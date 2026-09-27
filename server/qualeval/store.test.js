import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createEvaluation,
  listEvaluations,
  getEvaluation,
  updateEvaluation,
  deleteEvaluation,
  insertScenarios,
  listScenarios,
  getScenario,
  updateScenario,
  deleteScenario,
  deleteScenariosByStatus,
  deleteUnapprovedScenarios,
  createRun,
  getRun,
  listRuns,
  attachTranscript,
  markRunInProgress,
  markRunError,
  expireStaleRuns,
  STALE_RUN_AFTER_MS,
  markRunAwaitingEvaluation,
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
    const evaluationOwns = (evaluationId, clerkUserId) => {
      if (clerkUserId === null || clerkUserId === undefined) return true;
      const evaluation = tables.qualeval_evaluations.find((e) => e.id === evaluationId);
      return evaluation?.clerk_user_id === clerkUserId;
    };

    if (sql.startsWith("select") && table === "qualeval_evaluations") {
      if (params.length === 2) {
        const [id, clerkUserId] = params;
        return { rows: rows.filter((r) => r.id === id && r.clerk_user_id === clerkUserId) };
      }
      const [clerkUserId] = params;
      return { rows: rows.filter((r) => r.clerk_user_id === clerkUserId) };
    }
    if (sql.startsWith("select") && table === "qualeval_scenarios") {
      if (sql.includes("where s.id =")) {
        const [id, clerkUserId] = params;
        return { rows: rows.filter((r) => r.id === id && evaluationOwns(r.evaluation_id, clerkUserId)) };
      }
      const [evaluationId, clerkUserId] = params;
      return { rows: rows.filter((r) => r.evaluation_id === evaluationId && evaluationOwns(evaluationId, clerkUserId)) };
    }
    if (sql.startsWith("select") && table === "qualeval_runs") {
      if (sql.includes("where r.id =")) {
        const [id, clerkUserId] = params;
        const row = rows.find((r) => r.id === id);
        if (!row) return { rows: [] };
        const scenario = tables.qualeval_scenarios.find((s) => s.id === row.scenario_id);
        return { rows: evaluationOwns(scenario?.evaluation_id, clerkUserId) ? [row] : [] };
      }
      const [scenarioId] = params;
      return { rows: rows.filter((r) => r.scenario_id === scenarioId) };
    }
    if (sql.startsWith("delete from qualeval_scenarios") && sql.includes("where id = $1")) {
      const [id, clerkUserId] = params;
      const row = rows.find((r) => r.id === id);
      if (!row || !evaluationOwns(row.evaluation_id, clerkUserId)) return { rows: [] };
      tables.qualeval_scenarios = rows.filter((r) => r.id !== id);
      return { rows: [row] };
    }
    if (sql.startsWith("delete from qualeval_scenarios") && sql.includes("status = $2")) {
      const [evaluationId, status, clerkUserId] = params;
      tables.qualeval_scenarios = rows.filter(
        (r) => !(r.evaluation_id === evaluationId && r.status === status && evaluationOwns(evaluationId, clerkUserId)),
      );
      return { rows: [] };
    }
    if (sql.startsWith("delete from qualeval_scenarios")) {
      const [evaluationId] = params;
      tables.qualeval_scenarios = rows.filter((r) => !(r.evaluation_id === evaluationId && r.status !== "approved"));
      return { rows: [] };
    }
    if (sql.startsWith("delete from qualeval_evaluations")) {
      const [id, clerkUserId] = params;
      const row = rows.find((r) => r.id === id && r.clerk_user_id === clerkUserId);
      if (!row) return { rows: [] };
      tables.qualeval_evaluations = rows.filter((r) => r.id !== id);
      return { rows: [row] };
    }
    if (sql.startsWith("update qualeval_evaluations")) {
      const [id, clerkUserId] = params;
      const row = rows.find((r) => r.id === id && r.clerk_user_id === clerkUserId);
      if (!row) return { rows: [] };
      const setClause = text.match(/set ([\s\S]+?)\s+where id = \$1/i)[1];
      const cols = setClause.split(",").map((c) => c.trim().split("=")[0].trim());
      cols.forEach((col, i) => {
        row[col] = params[i + 2];
      });
      return { rows: [row] };
    }
    if (sql.startsWith("update qualeval_scenarios")) {
      const [id, clerkUserId] = params;
      const row = rows.find((r) => r.id === id);
      if (!row || !evaluationOwns(row.evaluation_id, clerkUserId)) return { rows: [] };
      const setClause = text.match(/set ([\s\S]+?)\s+where id = \$1/i)[1];
      const cols = setClause.split(",").map((c) => c.trim().split("=")[0].trim());
      cols.forEach((col, i) => {
        row[col] = col === "evaluation_criteria" ? JSON.parse(params[i + 2]) : params[i + 2];
      });
      return { rows: [row] };
    }
    if (sql.startsWith("update qualeval_runs") && sql.includes("set verdict = 'in_progress'")) {
      const [id, twilioCallSid] = params;
      const row = rows.find((r) => r.id === id);
      if (!row) return { rows: [] };
      row.verdict = "in_progress";
      row.twilio_call_sid = twilioCallSid;
      return { rows: [row] };
    }
    if (sql.startsWith("update qualeval_runs") && sql.includes("case verdict")) {
      const [pendingCutoff, inProgressCutoff, awaitingCutoff, pendingError, inProgressError, awaitingError] = params;
      const expired = rows.filter(
        (r) =>
          (r.verdict === "pending" && pendingCutoff !== null && r.created_at < pendingCutoff) ||
          (r.verdict === "in_progress" && r.created_at < inProgressCutoff) ||
          (r.verdict === "awaiting_evaluation" && (r.call_timestamp ?? r.created_at) < awaitingCutoff),
      );
      for (const row of expired) {
        row.error = { pending: pendingError, in_progress: inProgressError }[row.verdict] ?? awaitingError;
        row.verdict = "error";
      }
      return { rows: expired };
    }
    if (sql.startsWith("update qualeval_runs") && sql.includes("set verdict = 'error'")) {
      const [id, message] = params;
      const row = rows.find((r) => r.id === id);
      if (!row) return { rows: [] };
      row.verdict = "error";
      row.error = message;
      return { rows: [row] };
    }
    if (sql.startsWith("update qualeval_runs") && sql.includes("set verdict = 'awaiting_evaluation'")) {
      const [id, transcript] = params;
      const row = rows.find((r) => r.id === id);
      if (!row) return { rows: [] };
      row.verdict = "awaiting_evaluation";
      row.transcript = JSON.parse(transcript);
      row.call_timestamp = new Date().toISOString();
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

test("updateEvaluation edits the evaluation's own fields, scoped by clerkUserId", async () => {
  const pool = fakePool();
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Order desk agent" }, {}, pool);

  const updated = await updateEvaluation(
    evaluation.id,
    "user_1",
    { name: "Renamed eval", agentPhoneNumber: "+15555550100" },
    {},
    pool,
  );
  assert.equal(updated.name, "Renamed eval");
  assert.equal(updated.agentPhoneNumber, "+15555550100");

  await assert.rejects(() => updateEvaluation(evaluation.id, "user_2", { name: "Hijacked" }, {}, pool));
});

test("updateEvaluation rejects a blank name", async () => {
  const pool = fakePool();
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Eval" }, {}, pool);
  await assert.rejects(() => updateEvaluation(evaluation.id, "user_1", { name: "  " }, {}, pool));
});

test("deleteEvaluation removes the evaluation, scoped by clerkUserId", async () => {
  const pool = fakePool();
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Eval" }, {}, pool);

  await assert.rejects(() => deleteEvaluation(evaluation.id, "user_2", {}, pool));
  await deleteEvaluation(evaluation.id, "user_1", {}, pool);
  assert.equal(await getEvaluation(evaluation.id, "user_1", {}, pool), null);
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

  const scenarios = await listScenarios(evaluation.id, "user_1", {}, pool);
  assert.equal(scenarios.length, 1);
  assert.deepEqual(scenarios[0].evaluationCriteria, ["Offers refund or escalation", "Stays professional"]);

  const fetched = await getScenario(scenario.id, "user_1", {}, pool);
  assert.equal(fetched.name, "Angry customer wants a refund");
});

test("getScenario and listScenarios do not return another account's scenario", async () => {
  const pool = fakePool();
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Eval" }, {}, pool);
  const [scenario] = await insertScenarios(evaluation.id, [{ name: "S1", evaluationCriteria: [] }], {}, pool);

  assert.equal(await getScenario(scenario.id, "user_2", {}, pool), null);
  assert.equal((await listScenarios(evaluation.id, "user_2", {}, pool)).length, 0);
});

test("updateScenario approves a scenario and rejects an unknown status", async () => {
  const pool = fakePool();
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Eval" }, {}, pool);
  const [scenario] = await insertScenarios(evaluation.id, [{ name: "S1", evaluationCriteria: [] }], {}, pool);

  const approved = await updateScenario(scenario.id, "user_1", { status: "approved" }, {}, pool);
  assert.equal(approved.status, "approved");

  await assert.rejects(() => updateScenario(scenario.id, "user_1", { status: "bogus" }, {}, pool));
});

test("updateScenario refuses to mutate another account's scenario", async () => {
  const pool = fakePool();
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Eval" }, {}, pool);
  const [scenario] = await insertScenarios(evaluation.id, [{ name: "S1", evaluationCriteria: [] }], {}, pool);

  await assert.rejects(() => updateScenario(scenario.id, "user_2", { status: "approved" }, {}, pool));
});

test("deleteScenario removes a single scenario regardless of status, scoped by clerkUserId", async () => {
  const pool = fakePool();
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Eval" }, {}, pool);
  const [scenario] = await insertScenarios(evaluation.id, [{ name: "S1", evaluationCriteria: [] }], {}, pool);

  await assert.rejects(() => deleteScenario(scenario.id, "user_2", {}, pool));
  await deleteScenario(scenario.id, "user_1", {}, pool);
  assert.equal(await getScenario(scenario.id, "user_1", {}, pool), null);
});

test("deleteScenariosByStatus only removes scenarios in that evaluation and status", async () => {
  const pool = fakePool();
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Eval" }, {}, pool);
  const other = await createEvaluation({ clerkUserId: "user_1", name: "Other eval" }, {}, pool);
  const [pending1, pending2] = await insertScenarios(
    evaluation.id,
    [
      { name: "Pending 1", evaluationCriteria: [] },
      { name: "Pending 2", evaluationCriteria: [] },
    ],
    {},
    pool,
  );
  const [approved] = await insertScenarios(evaluation.id, [{ name: "Approved", evaluationCriteria: [] }], {}, pool);
  await updateScenario(approved.id, "user_1", { status: "approved" }, {}, pool);
  const [otherPending] = await insertScenarios(other.id, [{ name: "Other pending", evaluationCriteria: [] }], {}, pool);

  await deleteScenariosByStatus(evaluation.id, "user_1", "pending", {}, pool);

  const remaining = await listScenarios(evaluation.id, "user_1", {}, pool);
  assert.deepEqual(remaining.map((s) => s.name), ["Approved"]);
  assert.equal(await getScenario(pending1.id, "user_1", {}, pool), null);
  assert.equal(await getScenario(pending2.id, "user_1", {}, pool), null);
  const otherRemaining = await listScenarios(other.id, "user_1", {}, pool);
  assert.deepEqual(otherRemaining.map((s) => s.name), ["Other pending"]);
  assert.ok(otherPending);
});

test("deleteScenariosByStatus is scoped by clerkUserId", async () => {
  const pool = fakePool();
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Eval" }, {}, pool);
  const [pending] = await insertScenarios(evaluation.id, [{ name: "Pending", evaluationCriteria: [] }], {}, pool);

  await deleteScenariosByStatus(evaluation.id, "user_2", "pending", {}, pool);

  const remaining = await listScenarios(evaluation.id, "user_1", {}, pool);
  assert.deepEqual(remaining.map((s) => s.name), ["Pending"]);
  assert.ok(pending);
});

test("deleteScenariosByStatus rejects an invalid status", async () => {
  const pool = fakePool();
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Eval" }, {}, pool);

  await assert.rejects(() => deleteScenariosByStatus(evaluation.id, "user_1", "bogus", {}, pool));
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
  await updateScenario(keep.id, "user_1", { status: "approved" }, {}, pool);

  await deleteUnapprovedScenarios(evaluation.id, {}, pool);

  const remaining = await listScenarios(evaluation.id, "user_1", {}, pool);
  assert.deepEqual(
    remaining.map((s) => s.name),
    ["Keep me"],
  );
  assert.equal(await getScenario(drop.id, "user_1", {}, pool), null);
});

test("createRun stubs a pending run with no fabricated transcript or verdict", async () => {
  const pool = fakePool();
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Eval" }, {}, pool);
  const [scenario] = await insertScenarios(evaluation.id, [{ name: "S1", evaluationCriteria: [] }], {}, pool);

  const run = await createRun(scenario.id, {}, pool);
  assert.equal(run.verdict, "pending");
  assert.equal(run.transcript, null);
  assert.match(run.assessment, /not yet run/i);

  const fetched = await getRun(run.id, "user_1", {}, pool);
  assert.equal(fetched.verdict, "pending");

  const runs = await listRuns(scenario.id, {}, pool);
  assert.equal(runs.length, 1);
});

test("getRun does not return another account's run", async () => {
  const pool = fakePool();
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Eval" }, {}, pool);
  const [scenario] = await insertScenarios(evaluation.id, [{ name: "S1", evaluationCriteria: [] }], {}, pool);
  const run = await createRun(scenario.id, {}, pool);

  assert.equal(await getRun(run.id, "user_2", {}, pool), null);
  assert.notEqual(await getRun(run.id, null, {}, pool), null);
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

test("markRunInProgress records the Twilio call sid and moves the run out of pending", async () => {
  const pool = fakePool();
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Eval" }, {}, pool);
  const [scenario] = await insertScenarios(evaluation.id, [{ name: "S1", evaluationCriteria: [] }], {}, pool);
  const run = await createRun(scenario.id, {}, pool);

  const updated = await markRunInProgress(run.id, "CA123", {}, pool);
  assert.equal(updated.verdict, "in_progress");
  assert.equal(updated.twilioCallSid, "CA123");
});

test("markRunError records a call-placement failure without fabricating a verdict", async () => {
  const pool = fakePool();
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Eval" }, {}, pool);
  const [scenario] = await insertScenarios(evaluation.id, [{ name: "S1", evaluationCriteria: [] }], {}, pool);
  const run = await createRun(scenario.id, {}, pool);

  const updated = await markRunError(run.id, "Twilio rejected the call", {}, pool);
  assert.equal(updated.verdict, "error");
  assert.equal(updated.error, "Twilio rejected the call");
});

async function runInState(pool, verdict) {
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Eval" }, {}, pool);
  const [scenario] = await insertScenarios(evaluation.id, [{ name: "S1", evaluationCriteria: [] }], {}, pool);
  const run = await createRun(scenario.id, {}, pool);
  if (verdict === "in_progress") await markRunInProgress(run.id, "CA123", {}, pool);
  if (verdict === "awaiting_evaluation") {
    await markRunInProgress(run.id, "CA123", {}, pool);
    await markRunAwaitingEvaluation(run.id, { turns: [{ role: "agent", text: "Hi", tMs: 0 }] }, {}, pool);
  }
  if (verdict === "pass") {
    await markRunInProgress(run.id, "CA123", {}, pool);
    await recordVerdict(run.id, { verdict: "pass", assessment: "Handled well" }, {}, pool);
  }
  return run;
}

const later = (state) => Date.now() + STALE_RUN_AFTER_MS[state] + 1000;

test("expireStaleRuns errors an in_progress run whose call bridge is gone (e.g. server restarted mid-call)", async () => {
  const pool = fakePool();
  const run = await runInState(pool, "in_progress");

  const expired = await expireStaleRuns({ now: later("in_progress") }, {}, pool);
  assert.deepEqual(
    expired.map((r) => r.id),
    [run.id],
  );
  const updated = await getRun(run.id, null, {}, pool);
  assert.equal(updated.verdict, "error");
  assert.match(updated.error, /Call did not finish/);
});

test("expireStaleRuns leaves an in_progress run alone while a real call could still be running", async () => {
  const pool = fakePool();
  const run = await runInState(pool, "in_progress");

  const expired = await expireStaleRuns({ now: Date.now() + 5 * 60 * 1000 }, {}, pool);
  assert.deepEqual(expired, []);
  assert.equal((await getRun(run.id, null, {}, pool)).verdict, "in_progress");
});

test("expireStaleRuns errors a run stranded in awaiting_evaluation", async () => {
  const pool = fakePool();
  const run = await runInState(pool, "awaiting_evaluation");

  await expireStaleRuns({ now: later("awaiting_evaluation") }, {}, pool);
  const updated = await getRun(run.id, null, {}, pool);
  assert.equal(updated.verdict, "error");
  assert.match(updated.error, /Evaluation did not finish/);
});

test("expireStaleRuns errors a stale pending run only when includePending is set", async () => {
  const pool = fakePool();
  const run = await runInState(pool, "pending");

  await expireStaleRuns({ includePending: false, now: later("pending") }, {}, pool);
  assert.equal((await getRun(run.id, null, {}, pool)).verdict, "pending");

  await expireStaleRuns({ includePending: true, now: later("pending") }, {}, pool);
  const updated = await getRun(run.id, null, {}, pool);
  assert.equal(updated.verdict, "error");
  assert.match(updated.error, /Call was never placed/);
});

test("expireStaleRuns never touches a finished run", async () => {
  const pool = fakePool();
  const run = await runInState(pool, "pass");

  const expired = await expireStaleRuns({ now: later("in_progress") }, {}, pool);
  assert.deepEqual(expired, []);
  assert.equal((await getRun(run.id, null, {}, pool)).verdict, "pass");
});

test("markRunAwaitingEvaluation attaches the transcript and moves the run to awaiting_evaluation, never straight to pass/fail", async () => {
  const pool = fakePool();
  const evaluation = await createEvaluation({ clerkUserId: "user_1", name: "Eval" }, {}, pool);
  const [scenario] = await insertScenarios(evaluation.id, [{ name: "S1", evaluationCriteria: [] }], {}, pool);
  const run = await createRun(scenario.id, {}, pool);
  await markRunInProgress(run.id, "CA123", {}, pool);

  const transcript = { turns: [{ role: "agent", text: "Hello", tMs: 0 }] };
  const updated = await markRunAwaitingEvaluation(run.id, transcript, {}, pool);
  assert.equal(updated.verdict, "awaiting_evaluation");
  assert.deepEqual(updated.transcript, transcript);
});

test("every write function throws the not-configured error when Postgres isn't set up", async () => {
  await assert.rejects(() => createEvaluation({ clerkUserId: "user_1", name: "x" }, {}, null), {
    message: NOT_CONFIGURED_ERROR,
  });
});
