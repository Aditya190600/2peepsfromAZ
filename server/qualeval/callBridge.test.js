import { test } from "node:test";
import assert from "node:assert/strict";
import { placeCall } from "./callBridge.js";

const ENV = {
  TWILIO_ACCOUNT_SID: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  TWILIO_AUTH_TOKEN: "token123",
  QUALEVAL_PERSONA_NUMBER: "+19125550000",
};

test("placeCall dials evaluation.agentPhoneNumber from QUALEVAL_PERSONA_NUMBER and marks the run in_progress", async () => {
  let placed;
  let markedInProgress;
  let watchdogArmedFor;
  let recorded;
  const run = { id: "run_1" };
  const scenario = { id: "scenario_1" };
  const evaluation = { agentPhoneNumber: "+15551234567" };

  const result = await placeCall(run, scenario, evaluation, {
    baseUrl: "https://app.example.com",
    env: ENV,
    place: async (params) => {
      placed = params;
      return { sid: "CA123", status: "queued" };
    },
    markRunInProgress: async (id, sid) => {
      markedInProgress = { id, sid };
      return { id, verdict: "in_progress", twilioCallSid: sid };
    },
    markRunError: async () => assert.fail("should not error on success"),
    watchdog: (id) => {
      watchdogArmedFor = id;
    },
    recordCall: async (fields) => {
      recorded = fields;
    },
  });

  assert.equal(placed.to, "+15551234567");
  assert.equal(placed.from, "+19125550000");
  assert.equal(placed.twimlUrl, "https://app.example.com/v1/qualeval/twilio-voice/run_1");
  assert.equal(markedInProgress.id, "run_1");
  assert.equal(markedInProgress.sid, "CA123");
  assert.equal(result.verdict, "in_progress");
  assert.equal(watchdogArmedFor, "run_1");
  assert.deepEqual(recorded, {
    twilioCallSid: "CA123",
    direction: "outbound",
    fromNumber: "+19125550000",
    toNumber: "+15551234567",
    qualevalRunId: "run_1",
  });
});

test("placeCall does not arm the watchdog when the call is never placed", async () => {
  await placeCall(
    { id: "run_1" },
    { id: "s1" },
    { agentPhoneNumber: "+1555" },
    {
      baseUrl: "https://app.example.com",
      env: {},
      place: async () => assert.fail("should not place a call"),
      markRunError: async () => {},
      watchdog: () => assert.fail("should not arm the watchdog when placement failed"),
    },
  );
});

test("placeCall marks the run as error, never fabricating a transcript, when Twilio isn't configured", async () => {
  let markedError;
  const run = { id: "run_1" };
  await placeCall(run, { id: "s1" }, { agentPhoneNumber: "+1555" }, {
    baseUrl: "https://app.example.com",
    env: {},
    place: async () => assert.fail("should not place a call"),
    markRunError: async (id, message) => {
      markedError = { id, message };
    },
  });
  assert.equal(markedError.id, "run_1");
  assert.match(markedError.message, /Twilio is not configured/);
});

test("placeCall marks the run as error when no persona number is configured, and never guesses a number", async () => {
  let markedError;
  await placeCall(
    { id: "run_1" },
    { id: "s1" },
    { agentPhoneNumber: "+1555" },
    {
      baseUrl: "https://app.example.com",
      env: { TWILIO_ACCOUNT_SID: ENV.TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN: ENV.TWILIO_AUTH_TOKEN },
      place: async () => assert.fail("should not place a call"),
      markRunError: async (id, message) => {
        markedError = { id, message };
      },
    },
  );
  assert.match(markedError.message, /QUALEVAL_PERSONA_NUMBER/);
});

test("placeCall marks the run as error when the evaluation has no target number", async () => {
  let markedError;
  await placeCall(
    { id: "run_1" },
    { id: "s1" },
    { agentPhoneNumber: null },
    {
      baseUrl: "https://app.example.com",
      env: ENV,
      place: async () => assert.fail("should not place a call"),
      markRunError: async (id, message) => {
        markedError = { id, message };
      },
    },
  );
  assert.match(markedError.message, /agentPhoneNumber/);
});

test("placeCall marks the run as error when Twilio's API rejects the call", async () => {
  let markedError;
  await placeCall(
    { id: "run_1" },
    { id: "s1" },
    { agentPhoneNumber: "+1555" },
    {
      baseUrl: "https://app.example.com",
      env: ENV,
      place: async () => {
        throw new Error("Twilio rejected the call: unverified caller ID");
      },
      markRunError: async (id, message) => {
        markedError = { id, message };
      },
    },
  );
  assert.match(markedError.message, /unverified caller ID/);
});
