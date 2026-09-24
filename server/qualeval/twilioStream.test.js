import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { attachTwilioStreamServer } from "./twilioStream.js";

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
