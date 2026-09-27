import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createBridgeSession, END_CALL_TOOL } from "./bridgeSession.js";
import { peakPcmuAmplitude, SILENCE_AMPLITUDE_THRESHOLD } from "./pcmuAudio.js";

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
  // 0x00 is the peak negative mu-law sample (~32124) on the shared decode
  // table. 0x7F and 0xFF decode to amplitude 0, so noteAudioActivity ignores
  // them and the watchdog is never reset.
  return Buffer.alloc(160, 0x00).toString("base64");
}

test("an interrupted reply clears Twilio's buffered playback so the cancelled speech stops", async () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  createBridgeSession({ twilioWs, token: "tok", WebSocketImpl: fakeWebSocketImpl(aaiWs), systemPrompt: "be a caller", silenceTimeoutMs: 0 });
  aaiWs.emit("open");
  twilioWs.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1" } }));
  aaiWs.emit("message", JSON.stringify({ type: "session.ready" }));
  aaiWs.emit("message", JSON.stringify({ type: "reply.started" }));
  aaiWs.emit("message", JSON.stringify({ type: "reply.audio", data: "partOfReply" }));

  // The far end barges in and AssemblyAI cancels the reply.
  aaiWs.emit("message", JSON.stringify({ type: "reply.done", status: "interrupted" }));
  assert.deepEqual(twilioWs.sent.at(-1), { event: "clear", streamSid: "MZ1" });

  aaiWs.emit("message", JSON.stringify({ type: "session.ended" }));
});

test("a completed reply leaves Twilio's playback alone", async () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  createBridgeSession({ twilioWs, token: "tok", WebSocketImpl: fakeWebSocketImpl(aaiWs), systemPrompt: "be a caller", silenceTimeoutMs: 0 });
  aaiWs.emit("open");
  twilioWs.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1" } }));
  aaiWs.emit("message", JSON.stringify({ type: "session.ready" }));
  aaiWs.emit("message", JSON.stringify({ type: "reply.audio", data: "wholeReply" }));
  aaiWs.emit("message", JSON.stringify({ type: "reply.done", status: "completed" }));

  assert.equal(twilioWs.sent.some((msg) => msg.event === "clear"), false);

  aaiWs.emit("message", JSON.stringify({ type: "session.ended" }));
});

test("an interrupted reply before Twilio's 'start' drops its buffered audio instead of playing it later", async () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  createBridgeSession({ twilioWs, token: "tok", WebSocketImpl: fakeWebSocketImpl(aaiWs), systemPrompt: "be a caller", silenceTimeoutMs: 0 });
  aaiWs.emit("open");
  aaiWs.emit("message", JSON.stringify({ type: "session.ready" }));
  aaiWs.emit("message", JSON.stringify({ type: "reply.audio", data: "cancelledGreeting" }));
  aaiWs.emit("message", JSON.stringify({ type: "reply.done", status: "interrupted" }));

  twilioWs.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1" } }));
  assert.equal(twilioWs.sent.some((msg) => msg.event === "media"), false);

  aaiWs.emit("message", JSON.stringify({ type: "session.ended" }));
});

test("silence timeout ends the call when neither leg carries audible audio", (t) => {
  // Mocked timers: a real-time wait only cleared the 60 ms of timers by
  // ~10 ms and failed under a loaded full-suite run.
  t.mock.timers.enable({ apis: ["setTimeout"] });
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
  t.mock.timers.tick(50);
  assert.equal(finished, null);
  assert.deepEqual(aaiWs.sent.at(-1), { type: "session.end" });
  t.mock.timers.tick(10);
  assert.ok(finished);
  assert.equal(finished.reason, "silence_timeout_grace");
});

test("audible media on either leg resets the silence watchdog", (t) => {
  // Mocked timers: a real 100ms wait plus the default 2000ms grace leaves
  // `finished` null even when the 80ms watchdog already fired.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  let finished = null;
  const payload = loudPcmuPayload();
  assert.ok(peakPcmuAmplitude(payload) >= SILENCE_AMPLITUDE_THRESHOLD);
  const bridge = createBridgeSession({
    twilioWs,
    token: "tok",
    WebSocketImpl: fakeWebSocketImpl(aaiWs),
    systemPrompt: "be a caller",
    maxDurationMs: 60_000,
    silenceTimeoutMs: 80,
    stopGraceMs: 10,
    onFinished: (result) => {
      finished = result;
    },
  });
  aaiWs.emit("open");
  twilioWs.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1" } }));
  aaiWs.emit("message", JSON.stringify({ type: "session.ready" }));

  t.mock.timers.tick(79);
  twilioWs.emit("message", JSON.stringify({ event: "media", media: { payload } }));
  // Cross the original 80ms deadline, then one more tick. A grace timer
  // scheduled when that deadline fires does not run inside the same tick.
  t.mock.timers.tick(20);
  t.mock.timers.tick(10);
  assert.equal(finished, null);
  assert.equal(aaiWs.sent.some((msg) => msg.type === "session.end"), false);

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

test("live-listening taps: onTurn fires per transcript turn and onOutgoingAudioCleared on barge-in", async () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  const liveTurns = [];
  let cleared = 0;
  createBridgeSession({
    twilioWs,
    token: "tok",
    WebSocketImpl: fakeWebSocketImpl(aaiWs),
    systemPrompt: "be a caller",
    silenceTimeoutMs: 0,
    onTurn: (turn) => liveTurns.push(turn),
    onOutgoingAudioCleared: () => cleared++,
  });
  aaiWs.emit("open");
  twilioWs.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1" } }));
  aaiWs.emit("message", JSON.stringify({ type: "session.ready" }));
  aaiWs.emit("message", JSON.stringify({ type: "transcript.user", text: "Thanks for calling." }));
  aaiWs.emit("message", JSON.stringify({ type: "transcript.agent", text: "Hi, I need help." }));
  aaiWs.emit("message", JSON.stringify({ type: "reply.done", status: "completed" }));
  assert.equal(cleared, 0);
  aaiWs.emit("message", JSON.stringify({ type: "reply.done", status: "interrupted" }));
  assert.equal(cleared, 1);

  assert.deepEqual(
    liveTurns.map(({ role, text }) => ({ role, text })),
    [
      { role: "agent", text: "Thanks for calling." },
      { role: "user", text: "Hi, I need help." },
    ],
  );
  aaiWs.emit("message", JSON.stringify({ type: "session.ended" }));
});

test("reports incoming audio at Twilio's media.timestamp, not at its jittery arrival time", async () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  const incoming = [];
  createBridgeSession({
    twilioWs,
    token: "tok",
    WebSocketImpl: fakeWebSocketImpl(aaiWs),
    systemPrompt: "be a caller",
    silenceTimeoutMs: 0,
    onIncomingAudio: (payload, tMs) => incoming.push({ payload, tMs }),
  });
  twilioWs.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1" } }));
  // Three frames delivered back to back in one burst (network jitter, or the
  // setup-time replay in twilioStream.js) still land 20 ms apart.
  for (const timestamp of ["0", "20", "40"]) {
    twilioWs.emit("message", JSON.stringify({ event: "media", media: { payload: `f${timestamp}`, timestamp } }));
  }

  assert.deepEqual(incoming, [
    { payload: "f0", tMs: 0 },
    { payload: "f20", tMs: 20 },
    { payload: "f40", tMs: 40 },
  ]);
  aaiWs.emit("message", JSON.stringify({ type: "session.ended" }));
});

test("reports outgoing audio at its Twilio playout position: back to back, reset by a barge-in clear", async () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  const outgoing = [];
  const clears = [];
  createBridgeSession({
    twilioWs,
    token: "tok",
    WebSocketImpl: fakeWebSocketImpl(aaiWs),
    systemPrompt: "be a caller",
    silenceTimeoutMs: 0,
    onOutgoingAudio: (payload, tMs) => outgoing.push(tMs),
    onOutgoingAudioCleared: (tMs) => clears.push(tMs),
  });
  aaiWs.emit("open");
  aaiWs.emit("message", JSON.stringify({ type: "session.ready" }));
  twilioWs.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1" } }));
  // 300 bytes of audio/pcmu = 37.5 ms. AssemblyAI delivers a reply faster
  // than real time, so these arrive together but play one after another.
  const chunk = Buffer.alloc(300, 0xff).toString("base64");
  for (let i = 0; i < 3; i++) aaiWs.emit("message", JSON.stringify({ type: "reply.audio", data: chunk }));
  const [first, second, third] = outgoing;
  assert.equal(second - first, 37.5);
  assert.equal(third - second, 37.5);

  aaiWs.emit("message", JSON.stringify({ type: "reply.done", status: "interrupted" }));
  assert.equal(clears.length, 1);
  assert.ok(clears[0] < third, "the clear lands before the queued audio would have finished playing");
  aaiWs.emit("message", JSON.stringify({ type: "reply.audio", data: chunk }));
  assert.ok(outgoing[3] >= clears[0]);
  assert.ok(outgoing[3] < third + 37.5, "the next reply starts at the clear, not after the discarded audio");
  aaiWs.emit("message", JSON.stringify({ type: "session.ended" }));
});

// Starts a session with the end_call tool enabled and the call fully up
// (Twilio "start" plus AssemblyAI session.ready).
function startEndCallBridge(overrides = {}) {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  const result = { finished: null };
  createBridgeSession({
    twilioWs,
    token: "tok",
    WebSocketImpl: fakeWebSocketImpl(aaiWs),
    systemPrompt: "be a caller",
    endCallTool: true,
    silenceTimeoutMs: 0,
    maxDurationMs: 60_000,
    stopGraceMs: 10,
    onFinished: (payload) => {
      result.finished = payload;
    },
    ...overrides,
  });
  aaiWs.emit("open");
  twilioWs.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1" } }));
  aaiWs.emit("message", JSON.stringify({ type: "session.ready" }));
  return { twilioWs, aaiWs, result };
}

test("endCallTool registers the end_call tool on the session; it is off by default", () => {
  const { aaiWs } = startEndCallBridge();
  assert.deepEqual(aaiWs.sent[0].session.tools, [END_CALL_TOOL]);
  assert.equal(END_CALL_TOOL.name, "end_call");
  aaiWs.emit("message", JSON.stringify({ type: "session.ended" }));

  const plainTwilio = new FakeSocket();
  const plainAai = new FakeSocket();
  createBridgeSession({ twilioWs: plainTwilio, token: "tok", WebSocketImpl: fakeWebSocketImpl(plainAai), systemPrompt: "x", silenceTimeoutMs: 0 });
  plainAai.emit("open");
  assert.equal(plainAai.sent[0].session.tools, undefined);
  plainAai.emit("message", JSON.stringify({ type: "session.ended" }));
});

test("end_call hangs up only after Twilio has played the goodbye out, then ends the AssemblyAI session cleanly", () => {
  const { twilioWs, aaiWs, result } = startEndCallBridge();
  aaiWs.emit("message", JSON.stringify({ type: "reply.started" }));
  aaiWs.emit("message", JSON.stringify({ type: "reply.audio", data: "goodbye" }));
  aaiWs.emit("message", JSON.stringify({ type: "tool.call", call_id: "c1", name: "end_call", arguments: {} }));
  // Still generating the goodbye - nothing ends yet.
  assert.equal(aaiWs.sent.some((msg) => msg.type === "session.end"), false);

  aaiWs.emit("message", JSON.stringify({ type: "reply.done", status: "completed" }));
  // Twilio may still be playing the goodbye: ask to be told when it's done.
  assert.deepEqual(twilioWs.sent.at(-1), { event: "mark", streamSid: "MZ1", mark: { name: "end_call" } });
  assert.equal(aaiWs.sent.some((msg) => msg.type === "session.end"), false);
  assert.equal(twilioWs.readyState, twilioWs.OPEN);

  twilioWs.emit("message", JSON.stringify({ event: "mark", streamSid: "MZ1", mark: { name: "end_call" } }));
  assert.deepEqual(aaiWs.sent.at(-1), { type: "session.end" });
  aaiWs.emit("message", JSON.stringify({ type: "session.ended" }));

  assert.equal(result.finished.reason, "end_call");
  // Closing the Media Stream socket is what hangs up the phone call.
  assert.equal(twilioWs.readyState, twilioWs.CLOSED);
});

test("an interrupted end_call reply cancels the hangup - the far end is still talking", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { twilioWs, aaiWs, result } = startEndCallBridge({ hangupTimeoutMs: 1000 });
  aaiWs.emit("message", JSON.stringify({ type: "tool.call", call_id: "c1", name: "end_call", arguments: {} }));
  aaiWs.emit("message", JSON.stringify({ type: "reply.done", status: "interrupted" }));

  assert.equal(twilioWs.sent.some((msg) => msg.event === "mark"), false);
  t.mock.timers.tick(5000);
  assert.equal(result.finished, null);
  assert.equal(aaiWs.sent.some((msg) => msg.type === "session.end"), false);

  // A later, uninterrupted end_call still works.
  aaiWs.emit("message", JSON.stringify({ type: "tool.call", call_id: "c2", name: "end_call", arguments: {} }));
  aaiWs.emit("message", JSON.stringify({ type: "reply.done", status: "completed" }));
  twilioWs.emit("message", JSON.stringify({ event: "mark", streamSid: "MZ1", mark: { name: "end_call" } }));
  aaiWs.emit("message", JSON.stringify({ type: "session.ended" }));
  assert.equal(result.finished.reason, "end_call");
});

test("a requested hangup still ends the call if reply.done or Twilio's mark never arrives", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { aaiWs, result } = startEndCallBridge({ hangupTimeoutMs: 1000 });
  aaiWs.emit("message", JSON.stringify({ type: "tool.call", call_id: "c1", name: "end_call", arguments: {} }));
  aaiWs.emit("message", JSON.stringify({ type: "reply.done", status: "completed" }));

  t.mock.timers.tick(999);
  assert.equal(result.finished, null);
  t.mock.timers.tick(1);
  assert.deepEqual(aaiWs.sent.at(-1), { type: "session.end" });
  // AssemblyAI never confirms either - the grace window finishes it.
  t.mock.timers.tick(10);
  assert.equal(result.finished.reason, "end_call");
});

test("end_call is ignored unless endCallTool is enabled", () => {
  const twilioWs = new FakeSocket();
  const aaiWs = new FakeSocket();
  let finished = null;
  createBridgeSession({
    twilioWs,
    token: "tok",
    WebSocketImpl: fakeWebSocketImpl(aaiWs),
    systemPrompt: "x",
    silenceTimeoutMs: 0,
    onFinished: (payload) => {
      finished = payload;
    },
  });
  aaiWs.emit("open");
  twilioWs.emit("message", JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: "CA1" } }));
  aaiWs.emit("message", JSON.stringify({ type: "session.ready" }));
  aaiWs.emit("message", JSON.stringify({ type: "tool.call", call_id: "c1", name: "end_call", arguments: {} }));
  aaiWs.emit("message", JSON.stringify({ type: "reply.done", status: "completed" }));
  assert.equal(twilioWs.sent.some((msg) => msg.event === "mark"), false);
  assert.equal(finished, null);
  aaiWs.emit("message", JSON.stringify({ type: "session.ended" }));
  assert.equal(finished.reason, "session.ended");
});
