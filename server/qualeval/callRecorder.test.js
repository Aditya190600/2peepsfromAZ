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

function wavSamples(wav) {
  const samples = [];
  for (let i = 44; i < wav.length; i += 2) samples.push(wav.readInt16LE(i));
  return samples;
}

function frame(values) {
  return Buffer.from(values.map(muLawEncode)).toString("base64");
}

// 1 ms at 8 kHz = 8 samples.
const MS = 8;

test("createCallRecorder mixes both legs into one WAV buffer", () => {
  const recorder = createCallRecorder(1000);
  assert.equal(recorder.hasAudio(), false);

  recorder.addIncomingFrame(frame(Array(MS).fill(1000)), 0);
  recorder.addOutgoingFrame(frame(Array(MS).fill(1000)), 0);

  assert.equal(recorder.hasAudio(), true);
  const wav = recorder.toWavBuffer();
  assert.equal(wav.subarray(0, 4).toString(), "RIFF");
  assert.equal(wav.subarray(8, 12).toString(), "WAVE");
  const samples = wavSamples(wav);
  assert.equal(samples.length, MS);
  // The two legs are summed: each decodes to ~1000.
  assert.ok(samples.every((v) => v > 1900 && v < 2100), `unexpected mix ${samples}`);
});

test("createCallRecorder writes a leg's frames in place instead of summing overlapping frames of the same leg", () => {
  const recorder = createCallRecorder(1000);
  recorder.addIncomingFrame(frame(Array(2 * MS).fill(1000)), 0);
  // A frame reported over the second half of the first (same leg) replaces
  // it rather than doubling it.
  recorder.addIncomingFrame(frame(Array(2 * MS).fill(-1000)), 1);

  const samples = wavSamples(recorder.toWavBuffer());
  assert.equal(samples.length, 3 * MS);
  assert.ok(samples.slice(0, MS).every((v) => v > 900));
  assert.ok(samples.slice(MS).every((v) => v < -900));
});

test("createCallRecorder.clearOutgoingFrom drops outgoing audio queued past a barge-in and keeps the incoming leg", () => {
  const recorder = createCallRecorder(1000);
  recorder.addIncomingFrame(frame(Array(4 * MS).fill(1000)), 0);
  recorder.addOutgoingFrame(frame(Array(4 * MS).fill(-3000)), 0);
  recorder.clearOutgoingFrom(2);

  const samples = wavSamples(recorder.toWavBuffer());
  assert.equal(samples.length, 4 * MS);
  assert.ok(samples.slice(0, 2 * MS).every((v) => v < -1500), "outgoing audio before the clear stays");
  assert.ok(samples.slice(2 * MS).every((v) => v > 900 && v < 1100), "only the incoming leg remains after the clear");
});

test("createCallRecorder ignores empty payloads", () => {
  const recorder = createCallRecorder(1000);
  recorder.addIncomingFrame(null, 0);
  recorder.addOutgoingFrame("", 5);
  assert.equal(recorder.hasAudio(), false);
});

test("createCallRecorder.toStereoWavBuffer writes caller on channel 0 and agent on channel 1", () => {
  const recorder = createCallRecorder(1000);
  recorder.addIncomingFrame(frame(Array(MS).fill(1000)), 0);
  recorder.addOutgoingFrame(frame(Array(MS).fill(-1000)), 0);

  const wav = recorder.toStereoWavBuffer();
  assert.equal(wav.readUInt16LE(22), 2);
  const left = wav.readInt16LE(44);
  const right = wav.readInt16LE(46);
  assert.ok(left > 900);
  assert.ok(right < -900);
});

test("qualevalCallAudioKey scopes by runId", () => {
  assert.equal(qualevalCallAudioKey("run_1"), "qualeval-calls/run_1.wav");
});
