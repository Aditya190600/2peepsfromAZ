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
    qualevalRunId: row.qualeval_run_id,
    createdAt: row.created_at,
  };
}

const RETURNING =
  "id, twilio_call_sid, direction, from_number, to_number, caller_name, started_at, ended_at, end_reason, transcript, variant_key, agent_id, qualeval_run_id, created_at";

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
       (twilio_call_sid, direction, transcript, end_reason, ended_at, variant_key, agent_id)
     values ($1, $2, $3::jsonb, $4, now(), $5, $6)
     on conflict (twilio_call_sid) do update set
       transcript = excluded.transcript,
       end_reason = excluded.end_reason,
       ended_at = now(),
       variant_key = coalesce(excluded.variant_key, production_calls.variant_key),
       agent_id = coalesce(excluded.agent_id, production_calls.agent_id)
     returning ${RETURNING}`,
    [
      fields.twilioCallSid,
      fields.direction || "inbound",
      transcript,
      fields.endReason ?? null,
      fields.variantKey ?? null,
      fields.agentId ?? null,
    ],
  );
  return callRow(rows[0]);
}
