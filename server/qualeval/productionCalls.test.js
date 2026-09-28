import { test } from "node:test";
import assert from "node:assert/strict";
import {
  callerNameFromTwilioBody,
  productionCallFromTwilioBody,
  recordProductionCall,
  finishProductionCall,
  listPhoneEvalCalls,
  recordProductionCallCompliance,
  markProductionCallAnalysisStarted,
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

test("listPhoneEvalCalls lists only direct inbound calls, never QualEval run legs or outbound calls", async () => {
  const stored = [
    { twilio_call_sid: "CA_direct", direction: "inbound", from_number: "+13128003792", transcript: [{ role: "user", text: "hi" }] },
    { twilio_call_sid: "CA_run", direction: "inbound", from_number: "+13128003792", qualeval_run_id: "run_1" },
    { twilio_call_sid: "CA_persona", direction: "inbound", from_number: "+15550000002" },
    { twilio_call_sid: "CA_persona_formatted", direction: "inbound", from_number: "1-555-000-0002" },
    { twilio_call_sid: "CA_out", direction: "outbound", from_number: "+13128003792" },
  ];
  const pool = { query: async () => ({ rows: stored }) };
  const calls = await listPhoneEvalCalls({ QUALEVAL_PERSONA_NUMBER: "+1 (555) 000-0002" }, pool);
  assert.deepEqual(calls.map((c) => c.twilioCallSid), ["CA_direct"]);
  assert.deepEqual(calls[0].transcript, { turns: [{ role: "user", text: "hi" }] });

  const noPersona = await listPhoneEvalCalls({}, pool);
  assert.deepEqual(noPersona.map((c) => c.twilioCallSid), ["CA_direct", "CA_persona", "CA_persona_formatted"]);
  assert.deepEqual(await listPhoneEvalCalls({}, null), []);
});

test("listPhoneEvalCalls filters by to_number when toNumberDigits is set", async () => {
  const stored = [
    {
      twilio_call_sid: "CA_match",
      direction: "inbound",
      from_number: "+13128003792",
      to_number: "+18038245760",
      transcript: [{ role: "user", text: "hi" }],
    },
    {
      twilio_call_sid: "CA_other",
      direction: "inbound",
      from_number: "+13128003792",
      to_number: "+19998887777",
      transcript: [{ role: "user", text: "bye" }],
    },
  ];
  const pool = { query: async () => ({ rows: stored }) };
  const calls = await listPhoneEvalCalls({}, pool, { toNumberDigits: new Set(["8038245760"]) });
  assert.deepEqual(calls.map((c) => c.twilioCallSid), ["CA_match"]);
});

test("stores a call's compliance report and returns it on the call", async () => {
  let seen;
  const report = { findings: [{ check: "pii_scan", status: "flag" }], violationCount: 1 };
  const pool = {
    async query(sql, params) {
      seen = { sql, params };
      return {
        rows: [
          {
            twilio_call_sid: params[0],
            compliance_status: params[1],
            compliance_report: JSON.parse(params[2]),
            compliance_error: params[3],
          },
        ],
      };
    },
  };
  const call = await recordProductionCallCompliance(
    { twilioCallSid: "CA1", complianceStatus: "done", complianceReport: report },
    {},
    pool,
  );
  assert.match(seen.sql, /update production_calls set/);
  assert.deepEqual(seen.params, ["CA1", "done", JSON.stringify(report), null]);
  assert.equal(call.complianceStatus, "done");
  assert.deepEqual(call.complianceReport, report);
  assert.equal(call.complianceError, null);

  await recordProductionCallCompliance({ twilioCallSid: "CA2", complianceStatus: "no_transcript" }, {}, pool);
  assert.deepEqual(seen.params, ["CA2", "no_transcript", null, null]);
  assert.equal(await recordProductionCallCompliance({ twilioCallSid: "CA1" }, {}, null), null);
});

test("marking an analysis start clears both results and stamps the time", async () => {
  let seen;
  const pool = {
    async query(sql, params) {
      seen = { sql: sql.replace(/\s+/g, " "), params };
      return { rows: [{ twilio_call_sid: params[0], analysis_started_at: "2026-09-27T20:00:00Z" }] };
    },
  };
  const call = await markProductionCallAnalysisStarted("CA1", {}, pool);
  assert.deepEqual(seen.params, ["CA1"]);
  assert.match(seen.sql, /analysis_started_at = now\(\)/);
  assert.match(seen.sql, /evaluation_status = null/);
  assert.match(seen.sql, /compliance_report = null/);
  assert.equal(call.analysisStartedAt, "2026-09-27T20:00:00Z");
  assert.equal(await markProductionCallAnalysisStarted("CA1", {}, null), null);
  assert.equal(await markProductionCallAnalysisStarted(null, {}, pool), null);
});
