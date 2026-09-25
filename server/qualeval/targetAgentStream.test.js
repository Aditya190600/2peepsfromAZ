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
    agentId: "agent_flawed",
  });
  const mintToken = async () => "tok";
  let sessionArgs;
  const createSession = (args) => {
    sessionArgs = args;
    return { injectAudio: () => {} };
  };
  const waitForClaimableRun = async () => null;

  const wss = attachTargetAgentStreamServer(httpServer, { getActiveVariant, mintToken, createSession, waitForClaimableRun });
  connect(wss, twilioWs);

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(sessionArgs, "createSession should have been called without needing a start event");
  assert.equal(sessionArgs.token, "tok");
  assert.equal(sessionArgs.agentId, "agent_flawed");
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
    waitForClaimableRun: async () => null,
  });
  connect(wss, twilioWs);

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(twilioWs.readyState, twilioWs.CLOSED);
});

test("a real external caller (no claimable run) still gets a working bridge, with no cross-wire", async () => {
  const twilioWs = new FakeSocket();
  const httpServer = new EventEmitter();
  const getActiveVariant = async () => ({ key: "compliant", agentId: "agent_compliant" });
  let onReplyAudio;
  const createSession = (args) => {
    onReplyAudio = args.onReplyAudio;
    return { injectAudio: () => {} };
  };
  const waitForClaimableRun = async () => null;

  const wss = attachTargetAgentStreamServer(httpServer, {
    getActiveVariant,
    mintToken: async () => "tok",
    createSession,
    waitForClaimableRun,
  });
  connect(wss, twilioWs);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  // No claimed run - forwarding reply audio anywhere should just be a no-op,
  // never throw (a real external caller has no QualEval run to cross-wire to).
  assert.doesNotThrow(() => onReplyAudio("some-audio"));
});

test("a claimed QualEval run gets registered with the broker for cross-wiring", async () => {
  const twilioWs = new FakeSocket();
  const httpServer = new EventEmitter();
  const getActiveVariant = async () => ({ key: "compliant", agentId: "agent_compliant" });
  const injectAudio = () => {};
  const createSession = () => ({ injectAudio });
  let registeredRunId;
  let registeredInjectAudio;

  const wss = attachTargetAgentStreamServer(httpServer, {
    getActiveVariant,
    mintToken: async () => "tok",
    createSession,
    waitForClaimableRun: async () => "run_xyz",
    registerTargetLeg: (runId, fn) => {
      registeredRunId = runId;
      registeredInjectAudio = fn;
    },
  });

  connect(wss, twilioWs);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(registeredRunId, "run_xyz");
  assert.equal(registeredInjectAudio, injectAudio);
});

test("forwards reply audio to the claimed run's persona leg via the injected forwardToPersona", async () => {
  const twilioWs = new FakeSocket();
  const httpServer = new EventEmitter();
  const getActiveVariant = async () => ({ key: "compliant", agentId: "agent_compliant" });
  let onReplyAudio;
  const createSession = (args) => {
    onReplyAudio = args.onReplyAudio;
    return { injectAudio: () => {} };
  };
  const forwarded = [];

  const wss = attachTargetAgentStreamServer(httpServer, {
    getActiveVariant,
    mintToken: async () => "tok",
    createSession,
    waitForClaimableRun: async () => "run_xyz",
    registerTargetLeg: () => {},
    forwardToPersona: (runId, audio) => forwarded.push({ runId, audio }),
  });

  connect(wss, twilioWs);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  onReplyAudio("target-said-this");
  assert.deepEqual(forwarded, [{ runId: "run_xyz", audio: "target-said-this" }]);
});
