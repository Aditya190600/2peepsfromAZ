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
  createBridgeSession({ twilioWs, token: "tok", WebSocketImpl: fakeWebSocketImpl(aaiWs), systemPrompt: "be a caller" });
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

test("swaps AssemblyAI's user/agent roles into QualEval's caller/target transcript shape", async () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  let finished;
  createBridgeSession({
    twilioWs,
    token: "tok",
    WebSocketImpl: fakeWebSocketImpl(aaiWs),
    systemPrompt: "be a caller",
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
    onError: () => {},
  });

  aaiWs.emit("message", JSON.stringify({ type: "session.error", error: "boom" }));

  assert.equal(twilioWs.readyState, twilioWs.CLOSED);
});
