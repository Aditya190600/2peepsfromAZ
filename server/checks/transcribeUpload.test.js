import { test } from "node:test";
import assert from "node:assert/strict";
import { turnsFromUtterances } from "./transcribeUpload.js";

test("turnsFromUtterances maps first speaker to agent and others to user", () => {
  const turns = turnsFromUtterances([
    { speaker: "A", text: "Hi, this is an AI assistant.", start: 500 },
    { speaker: "B", text: "Sure, go ahead.", start: 3200 },
    { speaker: "A", text: "How can I help?", start: 4500 },
  ]);
  assert.deepEqual(turns, [
    { role: "agent", text: "Hi, this is an AI assistant.", tMs: 500 },
    { role: "user", text: "Sure, go ahead.", tMs: 3200 },
    { role: "agent", text: "How can I help?", tMs: 4500 },
  ]);
});

test("turnsFromUtterances preserves utterance start times for seekable findings", () => {
  const turns = turnsFromUtterances([
    { speaker: "A", text: "Hello.", start: 400 },
    { speaker: "B", text: "My SSN is 123-45-6789.", start: 6000 },
  ]);
  assert.equal(turns[0].tMs, 400);
  assert.equal(turns[1].tMs, 6000);
  assert.equal(turns[1].role, "user");
});

test("turnsFromUtterances returns [] for empty or missing utterances", () => {
  assert.deepEqual(turnsFromUtterances([]), []);
  assert.deepEqual(turnsFromUtterances(undefined), []);
  assert.deepEqual(turnsFromUtterances(null), []);
});

test("single-speaker upload collapses to agent-only turns (demo audio failure mode)", () => {
  // Documents the failure mode the two-voice sample regen fixes: one speaker
  // → everything attributed to agent. Mapping itself is still correct.
  const turns = turnsFromUtterances([
    {
      speaker: "A",
      text: "Hi there, how can I help you today? My SSN is 123-45-6789.",
      start: 0,
    },
  ]);
  assert.deepEqual(turns, [
    {
      role: "agent",
      text: "Hi there, how can I help you today? My SSN is 123-45-6789.",
      tMs: 0,
    },
  ]);
});
