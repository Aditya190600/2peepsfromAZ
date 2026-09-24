import { getPool, dbConfigured } from "../db.js";

export const NOT_CONFIGURED_ERROR =
  "QualEval storage requires Postgres configuration (DATABASE_URL). See server/db.js's dbConfigured().";

export { dbConfigured };

function requirePool(pool) {
  if (!pool) throw new Error(NOT_CONFIGURED_ERROR);
}

function evaluationRow(row) {
  return {
    id: row.id,
    name: row.name,
    agentPhoneNumber: row.agent_phone_number,
    description: row.description,
    requirements: row.requirements,
    clerkUserId: row.clerk_user_id,
    createdAt: row.created_at,
  };
}

function scenarioRow(row) {
  return {
    id: row.id,
    evaluationId: row.evaluation_id,
    name: row.name,
    persona: row.persona,
    situation: row.situation,
    callerObjectives: row.caller_objectives,
    expectedBehavior: row.expected_behavior,
    evaluationCriteria: row.evaluation_criteria,
    category: row.category,
    status: row.status,
    createdAt: row.created_at,
  };
}

function runRow(row) {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    callTimestamp: row.call_timestamp,
    transcript: row.transcript,
    audioRef: row.audio_ref,
    verdict: row.verdict,
    assessment: row.assessment,
    criterionResults: row.criterion_results,
    evidenceQuotes: row.evidence_quotes,
    createdAt: row.created_at,
  };
}

export async function createEvaluation(
  { clerkUserId = "anon", name, agentPhoneNumber, description, requirements },
  env = process.env,
  pool = getPool(env),
) {
  requirePool(pool);
  if (!name || !name.trim()) throw new Error("name is required");
  const { rows } = await pool.query(
    `insert into qualeval_evaluations (name, agent_phone_number, description, requirements, clerk_user_id)
     values ($1, $2, $3, $4, $5)
     returning id, name, agent_phone_number, description, requirements, clerk_user_id, created_at`,
    [name.trim(), agentPhoneNumber ?? null, description ?? null, requirements ?? null, clerkUserId],
  );
  return evaluationRow(rows[0]);
}

export async function listEvaluations(clerkUserId = "anon", env = process.env, pool = getPool(env)) {
  requirePool(pool);
  const { rows } = await pool.query(
    `select id, name, agent_phone_number, description, requirements, clerk_user_id, created_at
     from qualeval_evaluations where clerk_user_id = $1 order by created_at desc`,
    [clerkUserId],
  );
  return rows.map(evaluationRow);
}

export async function getEvaluation(id, clerkUserId = "anon", env = process.env, pool = getPool(env)) {
  requirePool(pool);
  const { rows } = await pool.query(
    `select id, name, agent_phone_number, description, requirements, clerk_user_id, created_at
     from qualeval_evaluations where id = $1 and clerk_user_id = $2`,
    [id, clerkUserId],
  );
  return rows[0] ? evaluationRow(rows[0]) : null;
}

export async function insertScenarios(evaluationId, scenarios, env = process.env, pool = getPool(env)) {
  requirePool(pool);
  const inserted = [];
  for (const s of scenarios) {
    const { rows } = await pool.query(
      `insert into qualeval_scenarios
         (evaluation_id, name, persona, situation, caller_objectives, expected_behavior, evaluation_criteria, category)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, evaluation_id, name, persona, situation, caller_objectives, expected_behavior,
                 evaluation_criteria, category, status, created_at`,
      [
        evaluationId,
        s.name,
        s.persona ?? null,
        s.situation ?? null,
        s.callerObjectives ?? null,
        s.expectedBehavior ?? null,
        JSON.stringify(s.evaluationCriteria ?? []),
        s.category ?? null,
      ],
    );
    inserted.push(scenarioRow(rows[0]));
  }
  return inserted;
}

// Deletes every scenario for an evaluation that hasn't been approved yet -
// used by regenerate, so an operator's already-approved scenarios survive a
// re-roll of the rest while pending/rejected ones are replaced outright.
export async function deleteUnapprovedScenarios(evaluationId, env = process.env, pool = getPool(env)) {
  requirePool(pool);
  await pool.query(`delete from qualeval_scenarios where evaluation_id = $1 and status != 'approved'`, [
    evaluationId,
  ]);
}

// clerkUserId scopes access to the evaluation that owns this scenario, same
// per-account isolation as getEvaluation/listEvaluations - see review-1.
export async function listScenarios(evaluationId, clerkUserId, env = process.env, pool = getPool(env)) {
  requirePool(pool);
  const { rows } = await pool.query(
    `select s.id, s.evaluation_id, s.name, s.persona, s.situation, s.caller_objectives, s.expected_behavior,
            s.evaluation_criteria, s.category, s.status, s.created_at
     from qualeval_scenarios s
     join qualeval_evaluations e on e.id = s.evaluation_id
     where s.evaluation_id = $1 and e.clerk_user_id = $2
     order by s.created_at asc`,
    [evaluationId, clerkUserId],
  );
  return rows.map(scenarioRow);
}

// clerkUserId may be null only for trusted system-internal callers (see
// dispatchEvaluation in router.js) that aren't acting on behalf of a request.
export async function getScenario(id, clerkUserId, env = process.env, pool = getPool(env)) {
  requirePool(pool);
  const { rows } = await pool.query(
    `select s.id, s.evaluation_id, s.name, s.persona, s.situation, s.caller_objectives, s.expected_behavior,
            s.evaluation_criteria, s.category, s.status, s.created_at
     from qualeval_scenarios s
     join qualeval_evaluations e on e.id = s.evaluation_id
     where s.id = $1 and ($2::text is null or e.clerk_user_id = $2)`,
    [id, clerkUserId],
  );
  return rows[0] ? scenarioRow(rows[0]) : null;
}

const VALID_SCENARIO_STATUSES = new Set(["pending", "approved", "rejected"]);

export async function updateScenario(id, clerkUserId, fields, env = process.env, pool = getPool(env)) {
  requirePool(pool);
  if (fields.status !== undefined && !VALID_SCENARIO_STATUSES.has(fields.status)) {
    throw new Error(`status must be one of ${[...VALID_SCENARIO_STATUSES].join(", ")}`);
  }
  const columns = {
    name: fields.name,
    persona: fields.persona,
    situation: fields.situation,
    caller_objectives: fields.callerObjectives,
    expected_behavior: fields.expectedBehavior,
    evaluation_criteria: fields.evaluationCriteria !== undefined ? JSON.stringify(fields.evaluationCriteria) : undefined,
    category: fields.category,
    status: fields.status,
  };
  const setKeys = Object.keys(columns).filter((k) => columns[k] !== undefined);
  if (setKeys.length === 0) throw new Error("no fields to update");
  const setClause = setKeys.map((k, i) => `${k} = $${i + 3}`).join(", ");
  const { rows } = await pool.query(
    `update qualeval_scenarios set ${setClause}
     where id = $1 and evaluation_id in (select id from qualeval_evaluations where clerk_user_id = $2)
     returning id, evaluation_id, name, persona, situation, caller_objectives, expected_behavior,
               evaluation_criteria, category, status, created_at`,
    [id, clerkUserId, ...setKeys.map((k) => columns[k])],
  );
  if (rows.length === 0) throw new Error("Scenario not found");
  return scenarioRow(rows[0]);
}

// Creates a stub Run for an approved scenario. Real call-placement is not
// wired yet (pending Twilio credentials) - the run is recorded honestly as
// "pending", never a fabricated transcript or verdict. See
// server/qualeval/router.js's createRun handler for the full contract.
// Callers must verify scenario ownership themselves first (e.g. via
// getScenario(id, clerkUserId)) before calling this with a trusted scenarioId.
export async function createRun(scenarioId, env = process.env, pool = getPool(env)) {
  requirePool(pool);
  const { rows } = await pool.query(
    `insert into qualeval_runs (scenario_id, verdict, assessment)
     values ($1, 'pending', $2)
     returning id, scenario_id, call_timestamp, transcript, audio_ref, verdict, assessment,
               criterion_results, evidence_quotes, created_at`,
    [scenarioId, "Not yet run - pending Twilio call-placement credentials."],
  );
  return runRow(rows[0]);
}

// clerkUserId may be null only for trusted system-internal callers (see
// dispatchEvaluation in router.js) that aren't acting on behalf of a request.
export async function getRun(id, clerkUserId, env = process.env, pool = getPool(env)) {
  requirePool(pool);
  const { rows } = await pool.query(
    `select r.id, r.scenario_id, r.call_timestamp, r.transcript, r.audio_ref, r.verdict, r.assessment,
            r.criterion_results, r.evidence_quotes, r.created_at
     from qualeval_runs r
     join qualeval_scenarios s on s.id = r.scenario_id
     join qualeval_evaluations e on e.id = s.evaluation_id
     where r.id = $1 and ($2::text is null or e.clerk_user_id = $2)`,
    [id, clerkUserId],
  );
  return rows[0] ? runRow(rows[0]) : null;
}

// Callers must verify scenario ownership themselves first (e.g. via
// getScenario(id, clerkUserId)) before calling this with a trusted scenarioId.
export async function listRuns(scenarioId, env = process.env, pool = getPool(env)) {
  requirePool(pool);
  const { rows } = await pool.query(
    `select id, scenario_id, call_timestamp, transcript, audio_ref, verdict, assessment,
            criterion_results, evidence_quotes, created_at
     from qualeval_runs where scenario_id = $1 order by created_at desc`,
    [scenarioId],
  );
  return rows.map(runRow);
}

// Attaches a real transcript to a run and records the call timestamp. Called
// once a real call-placement path exists (out of scope for this task - see
// AGENTS.md's QualEval section); never called with a fabricated transcript.
export async function attachTranscript(id, transcript, env = process.env, pool = getPool(env)) {
  requirePool(pool);
  const { rows } = await pool.query(
    `update qualeval_runs set transcript = $2, call_timestamp = now()
     where id = $1
     returning id, scenario_id, call_timestamp, transcript, audio_ref, verdict, assessment,
               criterion_results, evidence_quotes, created_at`,
    [id, JSON.stringify(transcript)],
  );
  if (rows.length === 0) throw new Error("Run not found");
  return runRow(rows[0]);
}

export async function recordVerdict(
  id,
  { verdict, assessment, criterionResults, evidenceQuotes },
  env = process.env,
  pool = getPool(env),
) {
  requirePool(pool);
  const { rows } = await pool.query(
    `update qualeval_runs
     set verdict = $2, assessment = $3, criterion_results = $4, evidence_quotes = $5
     where id = $1
     returning id, scenario_id, call_timestamp, transcript, audio_ref, verdict, assessment,
               criterion_results, evidence_quotes, created_at`,
    [id, verdict, assessment ?? null, JSON.stringify(criterionResults ?? []), JSON.stringify(evidenceQuotes ?? [])],
  );
  if (rows.length === 0) throw new Error("Run not found");
  return runRow(rows[0]);
}
