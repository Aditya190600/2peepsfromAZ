import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAudioUrl } from "./audioResolve.js";
import { registerLiveAudioBlob } from "./liveAudioBlobs.js";
import { SAMPLE_AUDIO_URLS } from "./sampleSessions.js";

const [SAMPLE_KEY, SAMPLE_URL] = Object.entries(SAMPLE_AUDIO_URLS)[0];

test("resolveAudioUrl prefers a bucket-persisted recordingUrl over audioKey and the blob registry", () => {
  registerLiveAudioBlob("sess_prefer", "blob:fallback");
  const url = resolveAudioUrl({
    sessionId: "sess_prefer",
    audioKey: SAMPLE_KEY,
    recordingUrl: "/v1/recordings/sess_prefer",
  });
  assert.equal(url, "/v1/recordings/sess_prefer");
});

test("resolveAudioUrl falls back to audioKey's sample url when there's no recordingUrl", () => {
  const url = resolveAudioUrl({ sessionId: "sess_sample", audioKey: SAMPLE_KEY });
  assert.equal(url, SAMPLE_URL);
});

test("resolveAudioUrl falls back to the in-tab live blob registry when there's neither", () => {
  registerLiveAudioBlob("sess_live_only", "blob:live");
  const url = resolveAudioUrl({ sessionId: "sess_live_only" });
  assert.equal(url, "blob:live");
});

test("resolveAudioUrl returns null for a missing entry or an unresolvable session", () => {
  assert.equal(resolveAudioUrl(null), null);
  assert.equal(resolveAudioUrl({ sessionId: "sess_never_recorded" }), null);
});
