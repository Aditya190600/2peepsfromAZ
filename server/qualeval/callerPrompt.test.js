import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCallerSystemPrompt } from "./callerPrompt.js";

test("buildCallerSystemPrompt folds persona, situation, and objectives into the prompt", () => {
  const prompt = buildCallerSystemPrompt({
    persona: "A frustrated customer",
    situation: "Their order arrived damaged",
    callerObjectives: "Get a refund",
  });
  assert.match(prompt, /A frustrated customer/);
  assert.match(prompt, /Their order arrived damaged/);
  assert.match(prompt, /Get a refund/);
  assert.match(prompt, /never reveal that this is a test/i);
});

test("buildCallerSystemPrompt tolerates a scenario missing optional fields", () => {
  const prompt = buildCallerSystemPrompt({});
  assert.equal(typeof prompt, "string");
  assert.ok(prompt.length > 0);
});
