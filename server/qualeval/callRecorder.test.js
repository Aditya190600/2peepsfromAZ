import test from "node:test";
import assert from "node:assert/strict";
import { createCallRecorder, qualevalCallAudioKey } from "./callRecorder.js";

function muLawEncode(sample) {
  // Minimal encoder for test fixtures only - inverse of the decode table in
  // callRecorder.js, good enough to round-trip a known sample value.
  const BIAS = 0x84;
  const CLIP = 32635;
  let sign = sample < 0 ? 0x80 : 0;
  if (sample < 0) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; exponent--, mask >>= 1);
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

test("createCallRecorder mixes frames from both legs into one WAV buffer", () => {
  const recorder = createCallRecorder(1000);
  assert.equal(recorder.hasAudio(), false);

  const frame = Buffer.from([muLawEncode(1000), muLawEncode(1000)]).toString("base64");
  recorder.addFrame(frame, 0);
  recorder.addFrame(frame, 10);

  assert.equal(recorder.hasAudio(), true);
  const wav = recorder.toWavBuffer();
  assert.equal(wav.subarray(0, 4).toString(), "RIFF");
  assert.equal(wav.subarray(8, 12).toString(), "WAVE");
  assert.ok(wav.length > 44);
});

test("createCallRecorder ignores empty payloads", () => {
  const recorder = createCallRecorder(1000);
  recorder.addFrame(null, 0);
  recorder.addFrame("", 5);
  assert.equal(recorder.hasAudio(), false);
});

test("qualevalCallAudioKey scopes by runId", () => {
  assert.equal(qualevalCallAudioKey("run_1"), "qualeval-calls/run_1.wav");
});
