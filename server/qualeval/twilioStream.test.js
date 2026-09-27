import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { attachTwilioStreamServer } from "./twilioStream.js";
import * as broker from "./callBridgeBroker.js";
import * as liveCallHub from "./liveCallHub.js";

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.OPEN = 1;
    this.CLOSED = 3;
    this.readyState = 1;
    this.sent = [];
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = this.CLOSED;
    this.emit("close");
  }
}

function connect(wss, twilioWs) {
  wss.emit("connection", twilioWs, { url: "/v1/qualeval/twilio-stream" });
}

test("resolves runId from the start event's customParameters, not the connection URL", async () => {
  const twilioWs = new FakeSocket();
  const httpServer = new EventEmitter();
  const getRun = async (id) => (id === "run_1" ? { id: "run_1", scenarioId: "scn_1" } : null);
  const getScenario = async () => ({ id: "scn_1", name: "test" });
  const mintToken = async () => "tok";
  let sessionArgs;
  const createSession = (args) => {
    sessionArgs = args;
    return {};
  };

  const wss = attachTwilioStreamServer(httpServer, { getRun, getScenario, mintToken, createSession });
  connect(wss, twilioWs);

  // No query string on the URL at all - matches Twilio's real behavior,
  // which drops query params on <Stream url> (see twilioVoice.js).
  twilioWs.emit("message", JSON.stringify({ event: "connected", protocol: "Call", version: "1.0.0" }));
  twilioWs.emit(
    "message",
    JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1", customParameters: { runId: "run_1" } } }),
  );

  // Let the async getRun/getScenario/mintToken chain resolve.
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(sessionArgs, "createSession should have been called once the run/scenario/token resolved");
  assert.equal(sessionArgs.token, "tok");

  // The persona's speech reaches the target over the phone line only - no
  // server-side copy (see bridgeSession.js's header comment).
  assert.equal(sessionArgs.onReplyAudio, undefined);
  // Registered with the broker so the target-agent leg can link its
  // production call to this run.
  assert.equal(broker.claimPendingRunForTarget(), "run_1");
  broker.releaseRun("run_1");
});

test("closes the stream instead of hanging when the start event carries no runId", async () => {
  const twilioWs = new FakeSocket();
  const httpServer = new EventEmitter();
  const wss = attachTwilioStreamServer(httpServer, {
    getRun: async () => null,
    getScenario: async () => null,
    mintToken: async () => "tok",
    createSession: () => {
      throw new Error("createSession should never be called without a runId");
    },
  });
  connect(wss, twilioWs);

  twilioWs.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1", customParameters: {} } }));

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(twilioWs.readyState, twilioWs.CLOSED);
});

test("publishes both sides' audio and each turn to live listeners, and ends the live call when the bridge finishes", async () => {
  const twilioWs = new FakeSocket();
  const httpServer = new EventEmitter();
  let sessionArgs;
  const wss = attachTwilioStreamServer(httpServer, {
    getRun: async () => ({ id: "run_live", scenarioId: "scn_1" }),
    getScenario: async () => ({ id: "scn_1", name: "test" }),
    mintToken: async () => "tok",
    createSession: (args) => {
      sessionArgs = args;
      return {};
    },
    markRunError: async () => {},
    finishCall: async () => {},
  });
  connect(wss, twilioWs);
  twilioWs.emit(
    "message",
    JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1", customParameters: { runId: "run_live" } } }),
  );
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(sessionArgs);

  const events = [];
  liveCallHub.subscribe("run_live", (e) => events.push(e));
  sessionArgs.onIncomingAudio("targetVoice", 20);
  sessionArgs.onOutgoingAudio("callerVoice", 40);
  sessionArgs.onOutgoingAudioCleared();
  sessionArgs.onTurn({ role: "agent", text: "Hello", tMs: 60 });
  await sessionArgs.onError("bridge failed");

  assert.deepEqual(events, [
    { type: "audio", track: "agent", payload: "targetVoice", tMs: 20 },
    { type: "audio", track: "caller", payload: "callerVoice", tMs: 40 },
    { type: "clear", track: "caller" },
    { type: "turn", turn: { role: "agent", text: "Hello", tMs: 60 } },
    { type: "end" },
  ]);
  assert.equal(liveCallHub.isLive("run_live"), false);
});
