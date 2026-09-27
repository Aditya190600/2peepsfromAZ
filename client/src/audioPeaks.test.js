import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDualPeaks, computePeaks } from "./audioPeaks.js";

function fakeBuffer({ duration = 2, sampleRate = 100, channelFn }) {
  const length = Math.floor(duration * sampleRate);
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) data[i] = channelFn(i / sampleRate);
  return {
    duration,
    length,
    numberOfChannels: 1,
    getChannelData: () => data,
  };
}

test("computeDualPeaks() without turns puts mono peaks on agent track only", () => {
  const buf = fakeBuffer({
    channelFn: (t) => (t < 1 ? 0.8 : 0.2),
  });
  const { agent, user } = computeDualPeaks(buf, null, 4);
  assert.equal(user.every((p) => p === 0), true);
  assert.ok(agent.some((p) => p > 0));
});

test("computeDualPeaks() routes peaks to the active speaker per turn interval", () => {
  const buf = fakeBuffer({
    channelFn: (t) => 0.9,
  });
  const turns = [
    { role: "agent", text: "hi", tMs: 0 },
    { role: "user", text: "hey", tMs: 1000 },
  ];
  const { agent, user } = computeDualPeaks(buf, turns, 4, 2);
  assert.ok(agent[0] > 0);
  assert.equal(user[0], 0);
  assert.ok(user[3] > 0);
  assert.equal(agent[3], 0);
});

test("computePeaks() normalizes peaks to 0..1", () => {
  const buf = fakeBuffer({ channelFn: () => 0.5 });
  const peaks = computePeaks(buf, 8);
  assert.equal(peaks.length, 8);
  assert.ok(peaks.every((p) => p >= 0 && p <= 1));
  assert.equal(peaks[0], 1);
});
