import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { placeCall } from "./callBridge.js";
import * as broker from "./callBridgeBroker.js";
import { attachTargetAgentStreamServer } from "./targetAgentStream.js";

const ENV = {
  TWILIO_ACCOUNT_SID: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  TWILIO_AUTH_TOKEN: "token123",
  QUALEVAL_PERSONA_NUMBER: "+19125550000",
};

test("placeCall dials evaluation.agentPhoneNumber from QUALEVAL_PERSONA_NUMBER and marks the run in_progress", async () => {
  let placed;
  let markedInProgress;
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
  assert.deepEqual(recorded, {
    twilioCallSid: "CA123",
    direction: "outbound",
    fromNumber: "+19125550000",
    toNumber: "+15551234567",
    qualevalRunId: "run_1",
  });
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

test("placeCall registers the run with the evaluation's demo target agent before dialing", async () => {
  const events = [];
  await placeCall(
    { id: "run_7" },
    { id: "s1" },
    { agentPhoneNumber: "+1 (555) 123-4567", demoAgentKey: "healthcare-compliant" },
    {
      baseUrl: "https://app.example.com",
      env: { ...ENV, QUALEVAL_AGENT_NUMBER: "+15551234567" },
      registerPlacedRun: (runId, fields) => events.push(["register", runId, fields]),
      releaseRun: () => assert.fail("should not release a placed call"),
      place: async () => {
        events.push(["place"]);
        return { sid: "CA7", status: "queued" };
      },
      markRunInProgress: async (id, sid) => ({ id, verdict: "in_progress", twilioCallSid: sid }),
      recordCall: async () => {},
    },
  );
  assert.deepEqual(events, [["register", "run_7", { demoAgentKey: "healthcare-compliant" }], ["place"]]);
});

test("placeCall releases the registered run when Twilio rejects the call", async () => {
  const released = [];
  await placeCall(
    { id: "run_8" },
    { id: "s1" },
    { agentPhoneNumber: "+15551234567" },
    {
      baseUrl: "https://app.example.com",
      env: { ...ENV, QUALEVAL_AGENT_NUMBER: "+15551234567" },
      registerPlacedRun: () => {},
      releaseRun: (runId) => released.push(runId),
      place: async () => {
        throw new Error("Twilio rejected the call");
      },
      markRunError: async () => {},
    },
  );
  assert.deepEqual(released, ["run_8"]);
});

function placeOptions(overrides) {
  return {
    baseUrl: "https://app.example.com",
    env: { ...ENV, QUALEVAL_AGENT_NUMBER: "+15551234567" },
    place: async () => ({ sid: "CA9", status: "queued" }),
    markRunInProgress: async (id, sid) => ({ id, verdict: "in_progress", twilioCallSid: sid }),
    markRunError: async () => assert.fail("should not error"),
    recordCall: async () => {},
    releaseRun: () => {},
    ...overrides,
  };
}

test("placeCall does not register a run that dials an outside number", async () => {
  const registered = [];
  const looked = [];
  await placeCall(
    { id: "run_ext" },
    { id: "s1" },
    { agentPhoneNumber: "+14155550199", demoAgentKey: "healthcare-compliant" },
    placeOptions({
      registerPlacedRun: (runId) => registered.push(runId),
      importedNumberToken: async (to) => {
        looked.push(to);
        return null;
      },
    }),
  );
  assert.deepEqual(looked, ["+14155550199"]);
  assert.deepEqual(registered, []);
});

test("placeCall registers a run that dials an imported number answered by the demo agent", async () => {
  const registered = [];
  await placeCall(
    { id: "run_imp" },
    { id: "s1" },
    { agentPhoneNumber: "+14155550123", demoAgentKey: "flight-flawed" },
    placeOptions({
      registerPlacedRun: (runId, fields) => registered.push([runId, fields]),
      importedNumberToken: async (to) => (to === "+14155550123" ? "imported_token" : null),
    }),
  );
  assert.deepEqual(registered, [["run_imp", { demoAgentKey: "flight-flawed" }]]);
});

test("placeCall still dials, unregistered, when the imported number lookup fails", async () => {
  const registered = [];
  const result = await placeCall(
    { id: "run_lookup" },
    { id: "s1" },
    { agentPhoneNumber: "+14155550123", demoAgentKey: "flight-flawed" },
    placeOptions({
      registerPlacedRun: (runId) => registered.push(runId),
      importedNumberToken: async () => {
        throw new Error("store unreadable");
      },
    }),
  );
  assert.deepEqual(registered, []);
  assert.equal(result.verdict, "in_progress");
});

test("a direct caller to the demo number while an outside-number run is in flight answers as the Settings default", async () => {
  await placeCall(
    { id: "run_outside" },
    { id: "s1" },
    { agentPhoneNumber: "+14155550199", demoAgentKey: "healthcare-compliant" },
    placeOptions({ importedNumberToken: async () => null }),
  );

  const twilioWs = new EventEmitter();
  twilioWs.OPEN = 1;
  twilioWs.readyState = 1;
  twilioWs.send = () => {};
  twilioWs.close = () => {};
  const askedFor = [];
  let sessionArgs;
  let finished;
  const wss = attachTargetAgentStreamServer(new EventEmitter(), {
    getAnsweringVariant: async (key) => {
      askedFor.push(key);
      return { key: "compliant", agentId: "agent_compliant" };
    },
    mintToken: async () => "tok",
    createSession: (args) => {
      sessionArgs = args;
      return {};
    },
    waitForClaimableRun: async () => null,
    finishCall: async (fields) => {
      finished = fields;
      return null;
    },
    analyzeCall: async () => {},
    recordingsReady: () => false,
  });
  try {
    wss.emit("connection", twilioWs, { url: "/v1/qualeval/target-agent-stream" });
    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(askedFor, [null]);
    assert.equal(sessionArgs.agentId, "agent_compliant");
    await sessionArgs.onFinished({ turns: [], callSid: "CA_direct", reason: "session.ended" });
    assert.equal(finished.qualevalRunId, null);
  } finally {
    broker.releaseRun("run_outside");
  }
});
