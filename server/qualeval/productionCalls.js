import { getPool } from "../db.js";

// Persists a real Twilio call. Inbound rows are written when
// QUALEVAL_AGENT_NUMBER answers (demoAgentVoice.js), from the webhook body,
// before the Media Stream exists. Outbound rows are written when placeCall
// gets a Call SID back. finishProductionCall attaches the transcript once
// the bridge ends, matched on that same Call SID.
//
// Missing DATABASE_URL is a no-op, not a thrown error: answering the phone
// must not depend on Postgres being up. A missing Call SID is also a no-op,
// because there is nothing to upsert on.

export function callerNameFromTwilioBody(body = {}) {
  const explicit = typeof body.CallerName === "string" ? body.CallerName.trim() : "";
  if (explicit) return explicit;
  const caller = typeof body.Caller === "string" ? body.Caller : "";
  const quoted = caller.match(/^"([^"]+)"\s*</);
  return quoted?.[1]?.trim() || null;
}

export function productionCallFromTwilioBody(body = {}) {
  return {
    twilioCallSid: body.CallSid || null,
    direction: "inbound",
    fromNumber: body.From || null,
    toNumber: body.To || null,
    callerName: callerNameFromTwilioBody(body),
  };
}

function callRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    twilioCallSid: row.twilio_call_sid,
    direction: row.direction,
    fromNumber: row.from_number,
    toNumber: row.to_number,
    callerName: row.caller_name,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    endReason: row.end_reason,
    transcript: row.transcript,
    variantKey: row.variant_key,
    agentId: row.agent_id,
    audioRef: row.audio_ref,
    qualevalRunId: row.qualeval_run_id,
    evaluationStatus: row.evaluation_status,
    verdict: row.verdict,
    assessment: row.assessment,
    criterionResults: row.criterion_results ?? [],
    evidenceQuotes: row.evidence_quotes ?? [],
    evaluationError: row.evaluation_error,
    complianceStatus: row.compliance_status,
    complianceReport: row.compliance_report,
    complianceError: row.compliance_error,
    analysisStartedAt: row.analysis_started_at,
    createdAt: row.created_at,
  };
}

const RETURNING =
  "id, twilio_call_sid, direction, from_number, to_number, caller_name, started_at, ended_at, end_reason, transcript, variant_key, agent_id, audio_ref, qualeval_run_id, evaluation_status, verdict, assessment, criterion_results, evidence_quotes, evaluation_error, compliance_status, compliance_report, compliance_error, analysis_started_at, created_at";

export async function recordProductionCall(fields, env = process.env, pool = getPool(env)) {
  if (!pool || !fields?.twilioCallSid) return null;
  const { rows } = await pool.query(
    `insert into production_calls
       (twilio_call_sid, direction, from_number, to_number, caller_name, qualeval_run_id)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (twilio_call_sid) do update set
       from_number = coalesce(excluded.from_number, production_calls.from_number),
       to_number = coalesce(excluded.to_number, production_calls.to_number),
       caller_name = coalesce(excluded.caller_name, production_calls.caller_name),
       qualeval_run_id = coalesce(excluded.qualeval_run_id, production_calls.qualeval_run_id)
     returning ${RETURNING}`,
    [
      fields.twilioCallSid,
      fields.direction,
      fields.fromNumber ?? null,
      fields.toNumber ?? null,
      fields.callerName ?? null,
      fields.qualevalRunId ?? null,
    ],
  );
  return callRow(rows[0]);
}

export async function finishProductionCall(fields, env = process.env, pool = getPool(env)) {
  if (!pool || !fields?.twilioCallSid) return null;
  const transcript = fields.transcript == null ? null : JSON.stringify(fields.transcript);
  const { rows } = await pool.query(
    `insert into production_calls
       (twilio_call_sid, direction, transcript, end_reason, ended_at, variant_key, agent_id, audio_ref, qualeval_run_id)
     values ($1, $2, $3::jsonb, $4, now(), $5, $6, $7, $8)
     on conflict (twilio_call_sid) do update set
       transcript = excluded.transcript,
       end_reason = excluded.end_reason,
       ended_at = now(),
       variant_key = coalesce(excluded.variant_key, production_calls.variant_key),
       agent_id = coalesce(excluded.agent_id, production_calls.agent_id),
       audio_ref = coalesce(excluded.audio_ref, production_calls.audio_ref),
       qualeval_run_id = coalesce(excluded.qualeval_run_id, production_calls.qualeval_run_id)
     returning ${RETURNING}`,
    [
      fields.twilioCallSid,
      fields.direction || "inbound",
      transcript,
      fields.endReason ?? null,
      fields.variantKey ?? null,
      fields.agentId ?? null,
      fields.audioRef ?? null,
      fields.qualevalRunId ?? null,
    ],
  );
  return callRow(rows[0]);
}

export async function getProductionCallBySid(twilioCallSid, env = process.env, pool = getPool(env)) {
  if (!pool || !twilioCallSid) return null;
  const { rows } = await pool.query(
    `select ${RETURNING} from production_calls where twilio_call_sid = $1`,
    [twilioCallSid],
  );
  return callRow(rows[0]);
}

export async function recordProductionCallEvaluation(fields, env = process.env, pool = getPool(env)) {
  if (!pool || !fields?.twilioCallSid) return null;
  const { rows } = await pool.query(
    `update production_calls set
       evaluation_status = $2,
       verdict = $3,
       assessment = $4,
       criterion_results = $5::jsonb,
       evidence_quotes = $6::jsonb,
       evaluation_error = $7,
       qualeval_run_id = coalesce($8, qualeval_run_id)
     where twilio_call_sid = $1
     returning ${RETURNING}`,
    [
      fields.twilioCallSid,
      fields.evaluationStatus ?? null,
      fields.verdict ?? null,
      fields.assessment ?? null,
      JSON.stringify(fields.criterionResults ?? []),
      JSON.stringify(fields.evidenceQuotes ?? []),
      fields.evaluationError ?? null,
      fields.qualevalRunId ?? null,
    ],
  );
  return callRow(rows[0]);
}

function transcriptForClient(value) {
  if (Array.isArray(value)) return { turns: value };
  if (value && Array.isArray(value.turns)) return value;
  return value ?? null;
}

export async function recordProductionCallCompliance(fields, env = process.env, pool = getPool(env)) {
  if (!pool || !fields?.twilioCallSid) return null;
  const { rows } = await pool.query(
    `update production_calls set
       compliance_status = $2,
       compliance_report = $3::jsonb,
       compliance_error = $4
     where twilio_call_sid = $1
     returning ${RETURNING}`,
    [
      fields.twilioCallSid,
      fields.complianceStatus ?? null,
      fields.complianceReport == null ? null : JSON.stringify(fields.complianceReport),
      fields.complianceError ?? null,
    ],
  );
  return callRow(rows[0]);
}

// Clears both post-call results and stamps when they (re)started, so the
// Phone Evals page shows them as running rather than missing.
export async function markProductionCallAnalysisStarted(twilioCallSid, env = process.env, pool = getPool(env)) {
  if (!pool || !twilioCallSid) return null;
  const { rows } = await pool.query(
    `update production_calls set
       analysis_started_at = now(),
       evaluation_status = null,
       verdict = null,
       assessment = null,
       criterion_results = null,
       evidence_quotes = null,
       evaluation_error = null,
       compliance_status = null,
       compliance_report = null,
       compliance_error = null
     where twilio_call_sid = $1
     returning ${RETURNING}`,
    [twilioCallSid],
  );
  return callRow(rows[0]);
}

// Last 10 digits so +1 (312) 800-3792 matches +13128003792.
export function phoneDigits(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.slice(-10);
}

export function isPersonaNumber(value, env = process.env) {
  const persona = phoneDigits(env.QUALEVAL_PERSONA_NUMBER);
  return persona !== "" && phoneDigits(value) === persona;
}

// Phone Evals (client/src/PhoneEvals.jsx): calls that reached the agent
// number directly. Legs of a QualEval scenario run belong to that run
// instead, so they never appear here: they carry qualeval_run_id once the
// bridge claims the run, and they always come from QUALEVAL_PERSONA_NUMBER,
// which also covers the window before the claim lands (or a claim that never
// does).
export function isPhoneEvalCall(call, env = process.env) {
  return call?.direction === "inbound" && !call.qualevalRunId && !isPersonaNumber(call.fromNumber, env);
}

export async function listPhoneEvalCalls(env = process.env, pool = getPool(env)) {
  if (!pool) return [];
  const { rows } = await pool.query(
    `select ${RETURNING} from production_calls
     where direction = 'inbound'
       and qualeval_run_id is null
     order by started_at desc
     limit 50`,
  );
  return rows
    .map(callRow)
    .filter((call) => isPhoneEvalCall(call, env))
    .map((call) => ({ ...call, transcript: transcriptForClient(call.transcript) }));
}
