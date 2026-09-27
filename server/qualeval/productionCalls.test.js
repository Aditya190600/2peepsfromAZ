import { test } from "node:test";
import assert from "node:assert/strict";
import {
  callerNameFromTwilioBody,
  productionCallFromTwilioBody,
  recordProductionCall,
  finishProductionCall,
  listPhoneEvalCalls,
} from "./productionCalls.js";

test("reads Twilio CNAM, and a quoted SIP display name when CNAM is absent", () => {
  assert.equal(callerNameFromTwilioBody({ CallerName: " Rastopopulous " }), "Rastopopulous");
  assert.equal(
    callerNameFromTwilioBody({ Caller: '"Rastopopulous" <sip:+13128003792@twilio.com>' }),
    "Rastopopulous",
  );
  assert.equal(callerNameFromTwilioBody({ Caller: "+13128003792" }), null);
});

test("maps an inbound Twilio voice webhook onto a production call", () => {
  assert.deepEqual(
    productionCallFromTwilioBody({
      CallSid: "CA123",
      From: "+13128003792",
      To: "+18005550199",
      CallerName: "Rastopopulous",
    }),
    {
      twilioCallSid: "CA123",
      direction: "inbound",
      fromNumber: "+13128003792",
      toNumber: "+18005550199",
      callerName: "Rastopopulous",
    },
  );
});

function memoryPool() {
  const rows = [];
  return {
    rows,
    async query(sql, params) {
      const text = sql.replace(/\s+/g, " ").trim().toLowerCase();
      const insertCols = text.split(" values ")[0];
      if (insertCols.includes("from_number")) {
        const [sid, direction, fromNumber, toNumber, callerName, runId] = params;
        let row = rows.find((r) => r.twilio_call_sid === sid);
        if (!row) {
          row = {
            id: `id_${rows.length + 1}`,
            twilio_call_sid: sid,
            direction,
            from_number: fromNumber,
            to_number: toNumber,
            caller_name: callerName,
            qualeval_run_id: runId,
            transcript: null,
            end_reason: null,
            ended_at: null,
            variant_key: null,
            agent_id: null,
            started_at: "t0",
            created_at: "t0",
          };
          rows.push(row);
        } else {
          row.from_number = fromNumber ?? row.from_number;
          row.to_number = toNumber ?? row.to_number;
          row.caller_name = callerName ?? row.caller_name;
          row.qualeval_run_id = runId ?? row.qualeval_run_id;
        }
        return { rows: [row] };
      }
      if (text.startsWith("insert into production_calls")) {
        const [sid, direction, transcript, endReason, variantKey, agentId, audioRef] = params;
        let row = rows.find((r) => r.twilio_call_sid === sid);
        if (!row) {
          row = {
            id: `id_${rows.length + 1}`,
            twilio_call_sid: sid,
            direction,
            from_number: null,
            to_number: null,
            caller_name: null,
            qualeval_run_id: null,
            started_at: "t0",
            created_at: "t0",
          };
          rows.push(row);
        }
        row.transcript = transcript == null ? null : JSON.parse(transcript);
        row.end_reason = endReason;
        row.ended_at = "t1";
        row.variant_key = variantKey ?? row.variant_key;
        row.agent_id = agentId ?? row.agent_id;
        row.audio_ref = audioRef ?? row.audio_ref;
        return { rows: [row] };
      }
      throw new Error(`unexpected sql: ${text}`);
    },
  };
}

test("recordProductionCall upserts by Call SID and keeps the first direction", async () => {
  const pool = memoryPool();
  const saved = await recordProductionCall(
    {
      twilioCallSid: "CA123",
      direction: "inbound",
      fromNumber: "+13128003792",
      toNumber: "+18005550199",
      callerName: "Rastopopulous",
    },
    {},
    pool,
  );
  assert.equal(saved.fromNumber, "+13128003792");
  assert.equal(saved.callerName, "Rastopopulous");

  await recordProductionCall(
    { twilioCallSid: "CA123", direction: "outbound", fromNumber: null, callerName: null },
    {},
    pool,
  );
  assert.equal(pool.rows.length, 1);
  assert.equal(pool.rows[0].direction, "inbound");
  assert.equal(pool.rows[0].caller_name, "Rastopopulous");
});

test("finishProductionCall attaches the transcript without dropping the caller", async () => {
  const pool = memoryPool();
  await recordProductionCall(
    {
      twilioCallSid: "CA123",
      direction: "inbound",
      fromNumber: "+13128003792",
      callerName: "Rastopopulous",
    },
    {},
    pool,
  );
  const finished = await finishProductionCall(
    {
      twilioCallSid: "CA123",
      direction: "inbound",
      transcript: [{ speaker: "user", text: "This is Rastopopulous" }],
      endReason: "session.ended",
      variantKey: "compliant",
      agentId: "agent_1",
      audioRef: "/v1/qualeval/production-calls/CA123/audio",
    },
    {},
    pool,
  );
  assert.equal(finished.fromNumber, "+13128003792");
  assert.equal(finished.callerName, "Rastopopulous");
  assert.equal(finished.endReason, "session.ended");
  assert.equal(finished.audioRef, "/v1/qualeval/production-calls/CA123/audio");
  assert.deepEqual(finished.transcript, [{ speaker: "user", text: "This is Rastopopulous" }]);
  assert.equal(pool.rows.length, 1);
});

test("does nothing when Postgres or the Call SID is missing", async () => {
  assert.equal(await recordProductionCall({ twilioCallSid: "CA1", direction: "inbound" }, {}, null), null);
  assert.equal(await recordProductionCall({ direction: "inbound" }, {}, memoryPool()), null);
  assert.equal(await finishProductionCall({ transcript: [] }, {}, memoryPool()), null);
});

test("listPhoneEvalCalls asks only for direct inbound calls, excluding QualEval run legs", async () => {
  let seen;
  const pool = {
    async query(sql, params) {
      seen = { sql: sql.replace(/\s+/g, " "), params };
      return { rows: [{ twilio_call_sid: "CA1", direction: "inbound", transcript: [{ role: "user", text: "hi" }] }] };
    },
  };
  const calls = await listPhoneEvalCalls({ QUALEVAL_PERSONA_NUMBER: "+1 (555) 000-0002" }, pool);
  assert.match(seen.sql, /direction = 'inbound'/);
  assert.match(seen.sql, /qualeval_run_id is null/);
  assert.doesNotMatch(seen.sql, /evaluation_id/);
  assert.deepEqual(seen.params, ["5550000002"]);
  assert.deepEqual(calls[0].transcript, { turns: [{ role: "user", text: "hi" }] });
  assert.deepEqual(await listPhoneEvalCalls({}, null), []);
});
