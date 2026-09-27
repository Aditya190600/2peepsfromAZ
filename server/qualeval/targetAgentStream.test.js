import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { attachTargetAgentStreamServer } from "./targetAgentStream.js";
import { createBridgeSession } from "./bridgeSession.js";

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
    return {};
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

test("reply audio goes only to this call's own Twilio leg, never cross-fed to another session", async () => {
  const twilioWs = new FakeSocket();
  const httpServer = new EventEmitter();
  let sessionArgs;
  const wss = attachTargetAgentStreamServer(httpServer, {
    getActiveVariant: async () => ({ key: "compliant", agentId: "agent_compliant" }),
    mintToken: async () => "tok",
    createSession: (args) => {
      sessionArgs = args;
      return {};
    },
    waitForClaimableRun: async () => "run_xyz",
  });
  connect(wss, twilioWs);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  // The caller hears this agent over the phone line only. A second,
  // server-side copy fed into the calling agent made both sides talk over
  // each other (see bridgeSession.js's header comment).
  assert.equal(sessionArgs.onReplyAudio, undefined);
});

test("a claimed QualEval run is linked onto the production call and its evaluation", async () => {
  const twilioWs = new FakeSocket();
  const httpServer = new EventEmitter();
  let sessionArgs;
  let finished;
  let analyzed;
  const released = [];
  const wss = attachTargetAgentStreamServer(httpServer, {
    getActiveVariant: async () => ({ key: "compliant", agentId: "agent_compliant" }),
    mintToken: async () => "tok",
    createSession: (args) => {
      sessionArgs = args;
      return {};
    },
    waitForClaimableRun: async () => "run_xyz",
    releaseRun: (runId) => released.push(runId),
    finishCall: async (fields) => {
      finished = fields;
      return {};
    },
    analyzeCall: async (fields) => {
      analyzed = fields;
    },
    recordingsReady: () => false,
  });
  connect(wss, twilioWs);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  await sessionArgs.onFinished({ turns: [], callSid: "CA1", reason: "session.ended" });
  assert.equal(finished.qualevalRunId, "run_xyz");
  assert.equal(analyzed.qualevalRunId, "run_xyz");
  assert.deepEqual(released, ["run_xyz"]);
});

// Reproduces the real inbound-call failure (confirmed from production logs
// 2026-09-25: every target-agent bridge log line stayed "[no-call-sid]"
// through call end, and "twilio event start" was never logged): Twilio sends
// "connected" and "start" the instant its Media Streams socket opens, while
// this handler is still awaiting the active-variant lookup and token mint.
// Those messages must not be lost, or streamSid is never learned and every
// reply.audio chunk is buffered forever - the caller hears only silence.
test("Twilio start event arriving during async setup still reaches the bridge, so agent audio is played to the caller", async () => {
  const twilioWs = new FakeSocket();
  const httpServer = new EventEmitter();
  let aaiWs;
  class FakeAaiSocket extends FakeSocket {
    constructor() {
      super();
      aaiWs = this;
    }
  }
  const createSession = (args) => createBridgeSession({ ...args, WebSocketImpl: FakeAaiSocket });

  const wss = attachTargetAgentStreamServer(httpServer, {
    getActiveVariant: async () => ({ key: "compliant", agentId: "agent_compliant" }),
    mintToken: async () => "tok",
    createSession,
    waitForClaimableRun: async () => null,
  });
  connect(wss, twilioWs);
  // Same tick as the connection, before any awaited setup resolves.
  twilioWs.emit("message", Buffer.from(JSON.stringify({ event: "connected", protocol: "Call" })));
  twilioWs.emit(
    "message",
    Buffer.from(JSON.stringify({ event: "start", streamSid: "MZ123", start: { streamSid: "MZ123", callSid: "CA123" } })),
  );

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(aaiWs, "bridge session should have opened an AssemblyAI socket");

  try {
    aaiWs.emit("open");
    aaiWs.emit("message", Buffer.from(JSON.stringify({ type: "session.ready" })));
    aaiWs.emit("message", Buffer.from(JSON.stringify({ type: "reply.audio", data: "AAAA" })));

    const media = twilioWs.sent.filter((m) => m.event === "media");
    assert.deepEqual(media, [{ event: "media", streamSid: "MZ123", media: { payload: "AAAA" } }]);
  } finally {
    // Ends the session so its max-duration timer doesn't hold the process.
    aaiWs.emit("close");
  }
});

test("does not open an AssemblyAI session when the caller hangs up during setup", async () => {
  const twilioWs = new FakeSocket();
  const httpServer = new EventEmitter();
  let created = false;
  const wss = attachTargetAgentStreamServer(httpServer, {
    getActiveVariant: async () => ({ key: "compliant", agentId: "agent_compliant" }),
    mintToken: async () => "tok",
    createSession: () => {
      created = true;
      return {};
    },
    waitForClaimableRun: async () => null,
  });
  connect(wss, twilioWs);
  twilioWs.close();

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(created, false);
});

test("writes the transcript onto the production call when the inbound bridge ends", async () => {
  const twilioWs = new FakeSocket();
  const httpServer = new EventEmitter();
  let sessionArgs;
  let finished;
  let analyzed;
  const wss = attachTargetAgentStreamServer(httpServer, {
    getActiveVariant: async () => ({ key: "compliant", agentId: "agent_1" }),
    mintToken: async () => "tok",
    createSession: (args) => {
      sessionArgs = args;
      return {};
    },
    waitForClaimableRun: async () => null,
    finishCall: async (fields) => {
      finished = fields;
      return { toNumber: "+18038245760", fromNumber: "+13128003792", startedAt: "2026-09-27T20:00:00.000Z" };
    },
    analyzeCall: async (call) => {
      analyzed = call;
    },
  });
  connect(wss, twilioWs);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  await sessionArgs.onFinished({
    turns: [{ speaker: "user", text: "This is Rastopopulous" }],
    callSid: "CA999",
    reason: "session.ended",
  });

  assert.equal(finished.audioRef, null);
  assert.equal(finished.twilioCallSid, "CA999");
  assert.deepEqual(finished.transcript, [{ speaker: "user", text: "This is Rastopopulous" }]);
  // A direct call is analyzed for Phone Evals against the answering agent, with
  // no dialed-number lookup that could attribute it to a QualEval evaluation.
  assert.deepEqual(analyzed, {
    twilioCallSid: "CA999",
    variantKey: "compliant",
    transcript: [{ speaker: "user", text: "This is Rastopopulous" }],
    qualevalRunId: null,
    fromNumber: "+13128003792",
    startedAt: "2026-09-27T20:00:00.000Z",
  });
});

test("uploads a mixed WAV for an inbound call and stores its audio path", async () => {
  const twilioWs = new FakeSocket();
  const httpServer = new EventEmitter();
  let sessionArgs;
  let uploaded;
  let finished;
  const wav = Buffer.from("RIFFwav");
  const wss = attachTargetAgentStreamServer(httpServer, {
    getActiveVariant: async () => ({ key: "compliant", agentId: "agent_1" }),
    mintToken: async () => "tok",
    createSession: (args) => {
      sessionArgs = args;
      return {};
    },
    waitForClaimableRun: async () => null,
    createRecorder: () => ({
      addIncomingFrame() {},
      addOutgoingFrame() {},
      clearOutgoingFrom() {},
      hasAudio: () => true,
      toWavBuffer: () => wav,
    }),
    recordingsReady: () => true,
    uploadRecording: async (key, body, contentType) => {
      uploaded = { key, body, contentType };
    },
    finishCall: async (fields) => {
      finished = fields;
      return { toNumber: "+18038245760" };
    },
    analyzeCall: async () => {},
  });
  connect(wss, twilioWs);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  sessionArgs.onIncomingAudio("AAAA", 0);
  sessionArgs.onOutgoingAudio("BBBB", 20);
  await sessionArgs.onFinished({
    turns: [{ speaker: "agent", text: "hello" }],
    callSid: "CA111",
    reason: "session.ended",
  });

  assert.equal(uploaded.key, "production-calls/CA111.wav");
  assert.equal(uploaded.contentType, "audio/wav");
  assert.equal(uploaded.body, wav);
  assert.equal(finished.audioRef, "/v1/qualeval/production-calls/CA111/audio");
});
