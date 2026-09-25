import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { attachTargetAgentStreamServer } from "./targetAgentStream.js";

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
  wss.emit("connection", twilioWs, { url: "/v1/qualeval/target-agent-stream" });
}

test("bridges immediately using the active variant, without waiting for a start event", async () => {
  const twilioWs = new FakeSocket();
  const httpServer = new EventEmitter();
  const getActiveVariant = async () => ({
    key: "flawed",
    systemPrompt: "be flawed",
    greeting: "hi",
    voice: "george",
  });
  const mintToken = async () => "tok";
  let sessionArgs;
  const createSession = (args) => {
    sessionArgs = args;
  };

  const wss = attachTargetAgentStreamServer(httpServer, { getActiveVariant, mintToken, createSession });
  connect(wss, twilioWs);

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(sessionArgs, "createSession should have been called without needing a start event");
  assert.equal(sessionArgs.token, "tok");
  assert.equal(sessionArgs.systemPrompt, "be flawed");
  assert.equal(sessionArgs.greeting, "hi");
  assert.equal(sessionArgs.voice, "george");
  // No swap on this side - see bridgeSession.js's header comment.
  assert.equal(sessionArgs.transcriptUserRole, "user");
  assert.equal(sessionArgs.transcriptAgentRole, "agent");
});

test("closes the stream instead of hanging when loading the active variant fails", async () => {
  const twilioWs = new FakeSocket();
  const httpServer = new EventEmitter();
  const wss = attachTargetAgentStreamServer(httpServer, {
    getActiveVariant: async () => {
      throw new Error("no active variant");
    },
    mintToken: async () => "tok",
    createSession: () => {
      throw new Error("createSession should never be called when variant loading fails");
    },
  });
  connect(wss, twilioWs);

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(twilioWs.readyState, twilioWs.CLOSED);
});
