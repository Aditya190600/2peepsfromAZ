import { test } from "node:test";
import assert from "node:assert/strict";
import * as hub from "./liveCallHub.js";

test("a listener gets the turns so far, then live audio/turns/clear, then end", () => {
  hub.startCall("run_a");
  hub.publishTurn("run_a", { role: "agent", text: "Hi, how can I help?", tMs: 100 });
  hub.publishAudio("run_a", "agent", "early", 50); // before anyone listens - not buffered

  const events = [];
  const unsubscribe = hub.subscribe("run_a", (e) => events.push(e));
  assert.equal(typeof unsubscribe, "function");
  hub.publishAudio("run_a", "caller", "muLaw", 900);
  hub.publishClear("run_a", "caller");
  hub.publishTurn("run_a", { role: "user", text: "I need to rebook.", tMs: 1200 });
  hub.endCall("run_a");

  assert.deepEqual(events, [
    { type: "turn", turn: { role: "agent", text: "Hi, how can I help?", tMs: 100 } },
    { type: "audio", track: "caller", payload: "muLaw", tMs: 900 },
    { type: "clear", track: "caller" },
    { type: "turn", turn: { role: "user", text: "I need to rebook.", tMs: 1200 } },
    { type: "end" },
  ]);
  assert.equal(hub.isLive("run_a"), false);
});

test("subscribing to a call that isn't live returns null", () => {
  assert.equal(hub.subscribe("run_missing", () => {}), null);
});

test("an unsubscribed listener stops receiving events; publishing to an unknown run is a no-op", () => {
  hub.startCall("run_b");
  const events = [];
  const unsubscribe = hub.subscribe("run_b", (e) => events.push(e));
  unsubscribe();
  hub.publishAudio("run_b", "agent", "x", 1);
  hub.publishAudio("run_unknown", "agent", "x", 1);
  hub.endCall("run_b");
  assert.deepEqual(events, []);
});

test("a throwing listener doesn't stop other listeners", () => {
  hub.startCall("run_c");
  const events = [];
  hub.subscribe("run_c", () => {
    throw new Error("boom");
  });
  hub.subscribe("run_c", (e) => events.push(e.type));
  hub.publishAudio("run_c", "agent", "x", 1);
  hub.endCall("run_c");
  assert.deepEqual(events, ["audio", "end"]);
});

test("waitForStart: a listener joining while the call still rings gets it once the bridge starts", () => {
  const events = [];
  const unsubscribe = hub.subscribe("run_ringing", (e) => events.push(e), { waitForStart: true });
  assert.equal(typeof unsubscribe, "function");
  assert.equal(hub.isLive("run_ringing"), false);
  hub.startCall("run_ringing");
  hub.publishAudio("run_ringing", "agent", "hello", 10);
  hub.endCall("run_ringing");
  assert.deepEqual(events, [{ type: "audio", track: "agent", payload: "hello", tMs: 10 }, { type: "end" }]);
});

test("waitForStart: a call that fails before starting still ends its waiting listeners", () => {
  const events = [];
  hub.subscribe("run_never", (e) => events.push(e), { waitForStart: true });
  hub.endCall("run_never");
  assert.deepEqual(events, [{ type: "end" }]);
  // Nothing left behind: a later start has no stale listener.
  hub.startCall("run_never");
  hub.publishAudio("run_never", "agent", "x", 1);
  hub.endCall("run_never");
  assert.equal(events.length, 1);
});

test("waitForStart: unsubscribing before the start leaves no listener behind", () => {
  const events = [];
  const unsubscribe = hub.subscribe("run_gone", (e) => events.push(e), { waitForStart: true });
  unsubscribe();
  hub.startCall("run_gone");
  hub.publishAudio("run_gone", "agent", "x", 1);
  hub.endCall("run_gone");
  assert.deepEqual(events, []);
});
