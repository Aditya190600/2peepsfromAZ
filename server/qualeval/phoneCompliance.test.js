import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzePhoneEvalCompliance, packIdsForVariant, sessionFromCall } from "./phoneCompliance.js";

const turns = [
  { role: "agent", text: "Hi, I'm an AI assistant for Northwind Bank.", tMs: 0 },
  { role: "user", text: "My SSN is 123-45-6789.", tMs: 4000 },
];

test("picks the industry packs that match the answering agent's domain", () => {
  assert.deepEqual(packIdsForVariant("compliant"), ["generic", "finance"]);
  assert.deepEqual(packIdsForVariant("healthcare-flawed"), ["generic", "hipaa"]);
  assert.deepEqual(packIdsForVariant("flight-compliant"), ["generic"]);
  assert.deepEqual(packIdsForVariant("no-such-agent"), ["generic"]);
  assert.deepEqual(packIdsForVariant(null), ["generic"]);
});

test("treats the caller dialing in as consent given at call start", () => {
  const session = sessionFromCall({ twilioCallSid: "CA1", startedAt: "2026-09-27T20:00:00.000Z" }, turns);
  assert.equal(session.sessionId, "CA1");
  assert.equal(session.startedAt, "2026-09-27T20:00:00.000Z");
  assert.deepEqual(session.consentEvent, { granted: true, timestamp: "2026-09-27T20:00:00.000Z" });
  assert.equal(session.turns, turns);
});

test("analyzes a direct call with its domain's packs and stores the report", async () => {
  let analyzed;
  let saved;
  const gateway = async () => "{}";
  const report = { findings: [{ check: "pii_scan", status: "flag" }], violationCount: 1 };
  await analyzePhoneEvalCompliance(
    { twilioCallSid: "CA1", variantKey: "healthcare-compliant", transcript: turns, startedAt: "2026-09-27T20:00:00.000Z" },
    {
      analyze: async (session, opts) => {
        analyzed = { session, opts };
        return report;
      },
      llmGateway: () => gateway,
      record: async (fields) => {
        saved = fields;
      },
      env: {},
    },
  );
  assert.equal(analyzed.session.turns, turns);
  assert.deepEqual(analyzed.opts.patternPackIds, ["generic", "hipaa"]);
  assert.equal(analyzed.opts.llmGateway, gateway);
  assert.deepEqual(saved, { twilioCallSid: "CA1", complianceStatus: "done", complianceReport: report });
});

test("accepts a stored {turns} transcript as well as a bare turn array", async () => {
  let analyzed;
  await analyzePhoneEvalCompliance(
    { twilioCallSid: "CA1", transcript: { turns } },
    {
      analyze: async (session) => {
        analyzed = session;
        return {};
      },
      llmGateway: () => null,
      record: async () => {},
      env: {},
    },
  );
  assert.equal(analyzed.turns, turns);
});

test("never analyzes a QualEval scenario-run leg", async () => {
  const saved = [];
  const options = {
    analyze: async () => assert.fail("scenario runs are not Phone Evals calls"),
    llmGateway: () => null,
    record: async (fields) => saved.push(fields),
    env: { QUALEVAL_PERSONA_NUMBER: "+1 (555) 000-0002" },
  };
  await analyzePhoneEvalCompliance({ twilioCallSid: "CA1", qualevalRunId: "run_1", transcript: turns }, options);
  await analyzePhoneEvalCompliance({ twilioCallSid: "CA2", fromNumber: "+15550000002", transcript: turns }, options);
  assert.deepEqual(saved, [
    { twilioCallSid: "CA1", complianceStatus: "skipped_run" },
    { twilioCallSid: "CA2", complianceStatus: "skipped_run" },
  ]);
});

test("records a call with no speech without calling the model", async () => {
  let saved;
  await analyzePhoneEvalCompliance(
    { twilioCallSid: "CA1", transcript: [] },
    {
      analyze: async () => assert.fail("nothing to analyze"),
      llmGateway: () => null,
      record: async (fields) => {
        saved = fields;
      },
      env: {},
    },
  );
  assert.deepEqual(saved, { twilioCallSid: "CA1", complianceStatus: "no_transcript" });
});

test("stores an analysis failure instead of throwing", async () => {
  let saved;
  await analyzePhoneEvalCompliance(
    { twilioCallSid: "CA1", transcript: turns },
    {
      analyze: async () => {
        throw new Error("gateway 500");
      },
      llmGateway: () => null,
      record: async (fields) => {
        saved = fields;
      },
      env: {},
    },
  );
  assert.deepEqual(saved, { twilioCallSid: "CA1", complianceStatus: "error", complianceError: "gateway 500" });
});

test("does nothing without a Call SID", async () => {
  assert.equal(await analyzePhoneEvalCompliance({ transcript: turns }, { record: async () => assert.fail() }), null);
});
