import { test } from "node:test";
import assert from "node:assert/strict";
import { registerLiveAudioBlob, getLiveAudioBlob } from "./liveAudioBlobs.js";

test("registers and resolves a live blob by sessionId", () => {
  registerLiveAudioBlob("sess_live_1", "blob:abc");
  assert.equal(getLiveAudioBlob("sess_live_1"), "blob:abc");
});

test("unknown sessionId resolves to null, not undefined/throw", () => {
  assert.equal(getLiveAudioBlob("sess_never_registered"), null);
});

test("ignores registration with a missing sessionId or url", () => {
  registerLiveAudioBlob(null, "blob:xyz");
  registerLiveAudioBlob("sess_live_2", null);
  assert.equal(getLiveAudioBlob("sess_live_2"), null);
});
