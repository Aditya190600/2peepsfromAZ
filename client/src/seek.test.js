import { test } from "node:test";
import assert from "node:assert/strict";
import { seekAudio } from "./seek.js";

function fakeAudioRef() {
  const played = { calls: 0 };
  const audio = {
    currentTime: 0,
    play: () => {
      played.calls += 1;
    },
  };
  return { ref: { current: audio }, audio, played };
}

test("seekAudio() converts tMs to seconds and resumes playback", () => {
  const { ref, audio, played } = fakeAudioRef();
  seekAudio(ref, 4500);
  assert.equal(audio.currentTime, 4.5);
  assert.equal(played.calls, 1);
});

test("seekAudio() is a no-op when the audio element isn't mounted yet", () => {
  const ref = { current: null };
  assert.doesNotThrow(() => seekAudio(ref, 1000));
});

test("seekAudio() subtracts the recording's start offset so a live-call timestamp lands on the right audio", () => {
  const { ref, audio } = fakeAudioRef();
  seekAudio(ref, 7500, 4500);
  assert.equal(audio.currentTime, 3);
});

test("seekAudio() clamps to the start when the timestamp precedes the recording", () => {
  const { ref, audio } = fakeAudioRef();
  seekAudio(ref, 1000, 4500);
  assert.equal(audio.currentTime, 0);
});
