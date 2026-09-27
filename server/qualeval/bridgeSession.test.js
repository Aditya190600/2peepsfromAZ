import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
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

function fakeWebSocketImpl(aaiWs) {
  return function FakeWebSocketImpl() {
    return aaiWs;
  };
}

test("bridges Twilio media to AssemblyAI input.audio only after session.ready, and back for reply.audio", async () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  createBridgeSession({ twilioWs, token: "tok", WebSocketImpl: fakeWebSocketImpl(aaiWs), systemPrompt: "be a caller", silenceTimeoutMs: 0 });
  aaiWs.emit("open");

  // session.update sent on open, before session.ready
  assert.equal(aaiWs.sent[0].type, "session.update");
  assert.equal(aaiWs.sent[0].session.system_prompt, "be a caller");
  assert.equal(aaiWs.sent[0].session.input.format.encoding, "audio/pcmu");
  assert.equal(aaiWs.sent[0].session.output.format.encoding, "audio/pcmu");

  twilioWs.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1" } }));

  // media arrives before session.ready - must be dropped, not sent
  twilioWs.emit("message", JSON.stringify({ event: "media", media: { payload: "early" } }));
  assert.equal(aaiWs.sent.length, 1);

  aaiWs.emit("message", JSON.stringify({ type: "session.ready" }));

  twilioWs.emit("message", JSON.stringify({ event: "media", media: { payload: "muLawBase64" } }));
  const forwarded = aaiWs.sent.at(-1);
  assert.equal(forwarded.type, "input.audio");
  assert.equal(forwarded.audio, "muLawBase64");

  aaiWs.emit("message", JSON.stringify({ type: "reply.audio", data: "replyMuLaw" }));
  const played = twilioWs.sent.at(-1);
  assert.equal(played.event, "media");
  assert.equal(played.streamSid, "MZ1");
  assert.equal(played.media.payload, "replyMuLaw");

  // session.ready starts a max-duration timer - end the session so it's
  // cleared and doesn't keep the test process alive.
  aaiWs.emit("message", JSON.stringify({ type: "session.ended" }));
});

test("reply.audio arriving before Twilio's 'start' event is buffered and flushed once streamSid is known, not dropped", async () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  createBridgeSession({ twilioWs, token: "tok", WebSocketImpl: fakeWebSocketImpl(aaiWs), systemPrompt: "be a caller", silenceTimeoutMs: 0 });
  aaiWs.emit("open");

  // AssemblyAI's session.ready/reply.audio can win the race against Twilio's
  // own "start" event - the greeting must not be lost.
  aaiWs.emit("message", JSON.stringify({ type: "session.ready" }));
  aaiWs.emit("message", JSON.stringify({ type: "reply.audio", data: "earlyGreeting" }));

  // Nothing sent to Twilio yet - streamSid isn't known.
  assert.equal(twilioWs.sent.length, 0);

  twilioWs.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1" } }));

  const played = twilioWs.sent.at(-1);
  assert.equal(played.event, "media");
  assert.equal(played.streamSid, "MZ1");
  assert.equal(played.media.payload, "earlyGreeting");

  // A later reply.audio, arriving after streamSid is known, still sends immediately.
  aaiWs.emit("message", JSON.stringify({ type: "reply.audio", data: "laterChunk" }));
  assert.equal(twilioWs.sent.at(-1).media.payload, "laterChunk");
  assert.equal(twilioWs.sent.length, 2);

  aaiWs.emit("message", JSON.stringify({ type: "session.ended" }));
});

function loudPcmuPayload() {
  // 0x00 is the peak mu-law sample (~32124). 0x7F and 0xFF decode to
  // amplitude 0 (bias-only silence) and never reset the watchdog.
  return Buffer.alloc(160, 0x00).toString("base64");
}

test("silence timeout ends the call when neither leg carries audible audio", async () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  let finished = null;
  createBridgeSession({
    twilioWs,
    token: "tok",
    WebSocketImpl: fakeWebSocketImpl(aaiWs),
    systemPrompt: "be a caller",
    maxDurationMs: 60_000,
    silenceTimeoutMs: 50,
    stopGraceMs: 10,
    onFinished: (payload) => {
      finished = payload;
    },
  });
  aaiWs.emit("open");
  twilioWs.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1" } }));
  aaiWs.emit("message", JSON.stringify({ type: "session.ready" }));
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.ok(finished);
  assert.equal(finished.reason, "silence_timeout_grace");
});

test("audible media on either leg resets the silence watchdog", async () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  let finished = null;
  const bridge = createBridgeSession({
    twilioWs,
    token: "tok",
    WebSocketImpl: fakeWebSocketImpl(aaiWs),
    systemPrompt: "be a caller",
    maxDurationMs: 60_000,
    silenceTimeoutMs: 80,
    // Short enough that a watchdog which was not reset finishes inside the
    // wait below. The default 2000ms grace would leave `finished` null either way.
    stopGraceMs: 10,
    onFinished: (payload) => {
      finished = payload;
    },
  });
  aaiWs.emit("open");
  twilioWs.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1" } }));
  aaiWs.emit("message", JSON.stringify({ type: "session.ready" }));

  await new Promise((resolve) => setTimeout(resolve, 40));
  twilioWs.emit("message", JSON.stringify({ event: "media", media: { payload: loudPcmuPayload() } }));
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(finished, null);

  bridge.stop();
  assert.equal(finished.reason, "manual_stop");
});

test("max-duration cap finishes from twilio start even when AssemblyAI never reaches session.ready", async () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  let finished = null;
  createBridgeSession({
    twilioWs,
    token: "tok",
    WebSocketImpl: fakeWebSocketImpl(aaiWs),
    systemPrompt: "be a caller",
    silenceTimeoutMs: 0,
    maxDurationMs: 40,
    onFinished: (payload) => {
      finished = payload;
    },
  });
  aaiWs.emit("open");
  twilioWs.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1" } }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(finished);
  assert.equal(finished.reason, "max_duration");
});

test("swaps AssemblyAI's user/agent roles into QualEval's caller/target transcript shape", async () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  let finished;
  createBridgeSession({
    twilioWs,
    token: "tok",
    WebSocketImpl: fakeWebSocketImpl(aaiWs),
    systemPrompt: "be a caller",
    silenceTimeoutMs: 0,
    onFinished: (result) => (finished = result),
  });

  twilioWs.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1" } }));
  aaiWs.emit("message", JSON.stringify({ type: "session.ready" }));

  // transcript.user = the far end (target agent under test) -> role "agent"
  aaiWs.emit("message", JSON.stringify({ type: "transcript.user", text: "Thanks for calling, how can I help?" }));
  // transcript.agent = our simulated caller -> role "user"
  aaiWs.emit("message", JSON.stringify({ type: "transcript.agent", text: "I'd like a refund." }));

  aaiWs.emit("message", JSON.stringify({ type: "session.ended" }));

  assert.ok(finished);
  assert.equal(finished.reason, "session.ended");
  assert.equal(finished.callSid, "CA1");
  assert.deepEqual(
    finished.turns.map((t) => t.role),
    ["agent", "user"],
  );
  assert.equal(finished.turns[0].text, "Thanks for calling, how can I help?");
  assert.equal(finished.turns[1].text, "I'd like a refund.");
});

test("target-agent side: binds by agent_id (mutually exclusive with inline fields), no role swap", async () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  let finished;
  createBridgeSession({
    twilioWs,
    token: "tok",
    WebSocketImpl: fakeWebSocketImpl(aaiWs),
    agentId: "agent_flawed",
    transcriptUserRole: "user",
    transcriptAgentRole: "agent",
    silenceTimeoutMs: 0,
    onFinished: (result) => (finished = result),
  });
  aaiWs.emit("open");

  // agent_id session.update carries nothing else - see bridgeSession.js's
  // header comment on why inline fields can't ride alongside it.
  assert.deepEqual(aaiWs.sent[0].session, { agent_id: "agent_flawed" });

  twilioWs.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1" } }));
  aaiWs.emit("message", JSON.stringify({ type: "session.ready" }));

  // transcript.user = the far end (the simulated caller phoning in) -> role "user", no swap
  aaiWs.emit("message", JSON.stringify({ type: "transcript.user", text: "I'd like a refund." }));
  // transcript.agent = AssemblyAI's own LLM (the target agent under test) -> role "agent", no swap
  aaiWs.emit("message", JSON.stringify({ type: "transcript.agent", text: "Sure, let me help with that." }));

  aaiWs.emit("message", JSON.stringify({ type: "session.ended" }));

  assert.deepEqual(
    finished.turns.map((t) => t.role),
    ["user", "agent"],
  );
});

test("a Twilio hangup with no session.ended still finishes the bridge with whatever transcript exists", async () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  let finished;
  createBridgeSession({
    twilioWs,
    token: "tok",
    WebSocketImpl: fakeWebSocketImpl(aaiWs),
    systemPrompt: "be a caller",
    silenceTimeoutMs: 0,
    onFinished: (result) => (finished = result),
  });
  twilioWs.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1" } }));
  aaiWs.emit("message", JSON.stringify({ type: "session.ready" }));
  aaiWs.emit("message", JSON.stringify({ type: "transcript.agent", text: "Hello?" }));

  twilioWs.emit("close");

  assert.ok(finished);
  assert.equal(finished.reason, "twilio_closed");
  assert.equal(finished.turns.length, 1);
});

test("Twilio 'stop' finishes the bridge after a grace window even if neither socket ever closes", async () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  let finished;
  createBridgeSession({
    twilioWs,
    token: "tok",
    WebSocketImpl: fakeWebSocketImpl(aaiWs),
    systemPrompt: "be a caller",
    silenceTimeoutMs: 0,
    stopGraceMs: 10,
    onFinished: (result) => (finished = result),
  });
  twilioWs.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1" } }));
  aaiWs.emit("message", JSON.stringify({ type: "session.ready" }));
  aaiWs.emit("message", JSON.stringify({ type: "transcript.agent", text: "Thanks, bye." }));

  // Twilio sends "stop" (a reliable message) but - as observed live - never
  // follows up with its own socket close event, and AssemblyAI never sends
  // session.ended either. Nothing but the grace timer can finish this call.
  twilioWs.emit("message", JSON.stringify({ event: "stop" }));
  assert.equal(finished, undefined);

  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.ok(finished);
  assert.equal(finished.reason, "twilio_stop_grace");
  assert.equal(finished.turns.length, 1);
});

test("AssemblyAI's session.ended arriving during the stop grace window finishes immediately, not late", async () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  let finished;
  createBridgeSession({
    twilioWs,
    token: "tok",
    WebSocketImpl: fakeWebSocketImpl(aaiWs),
    systemPrompt: "be a caller",
    silenceTimeoutMs: 0,
    stopGraceMs: 5000,
    onFinished: (result) => (finished = result),
  });
  twilioWs.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1" } }));
  aaiWs.emit("message", JSON.stringify({ type: "session.ready" }));

  twilioWs.emit("message", JSON.stringify({ event: "stop" }));
  aaiWs.emit("message", JSON.stringify({ type: "session.ended" }));

  assert.ok(finished);
  assert.equal(finished.reason, "session.ended");
});

test("an AssemblyAI session.error calls onError instead of onFinished", async () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  let error;
  let finished;
  createBridgeSession({
    twilioWs,
    token: "tok",
    WebSocketImpl: fakeWebSocketImpl(aaiWs),
    systemPrompt: "be a caller",
    silenceTimeoutMs: 0,
    onFinished: () => (finished = true),
    onError: (msg) => (error = msg),
  });
  aaiWs.emit("message", JSON.stringify({ type: "session.error", error: "boom" }));

  assert.equal(finished, undefined);
  assert.match(error, /boom/);
});

test("AssemblyAI session.ended closes the Twilio leg so the real PSTN call hangs up", async () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  createBridgeSession({
    twilioWs,
    token: "tok",
    WebSocketImpl: fakeWebSocketImpl(aaiWs),
    systemPrompt: "be a caller",
    silenceTimeoutMs: 0,
  });

  aaiWs.emit("message", JSON.stringify({ type: "session.ended" }));

  assert.equal(twilioWs.readyState, twilioWs.CLOSED);
});

test("AssemblyAI session.error also closes the Twilio leg, not just the AssemblyAI socket", async () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  createBridgeSession({
    twilioWs,
    token: "tok",
    WebSocketImpl: fakeWebSocketImpl(aaiWs),
    systemPrompt: "be a caller",
    silenceTimeoutMs: 0,
    onError: () => {},
  });

  aaiWs.emit("message", JSON.stringify({ type: "session.error", error: "boom" }));

  assert.equal(twilioWs.readyState, twilioWs.CLOSED);
});
