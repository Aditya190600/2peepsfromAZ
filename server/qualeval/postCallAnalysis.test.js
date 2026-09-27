import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeFinishedCall } from "./postCallAnalysis.js";

const call = { twilioCallSid: "CA1", transcript: [{ role: "agent", text: "hi" }] };

test("marks the start, then runs compliance before the agent-instructions score", async () => {
  const order = [];
  await analyzeFinishedCall(call, {
    markStarted: async (sid) => order.push(`mark ${sid}`),
    analyzeCompliance: async (c) => order.push(`compliance ${c.twilioCallSid}`),
    evaluateCall: async (c) => order.push(`evaluate ${c.twilioCallSid}`),
  });
  assert.deepEqual(order, ["mark CA1", "compliance CA1", "evaluate CA1"]);
});

test("one failing step never stops the next", async () => {
  const ran = [];
  await analyzeFinishedCall(call, {
    markStarted: async () => {
      throw new Error("db down");
    },
    analyzeCompliance: async () => {
      ran.push("compliance");
      throw new Error("gateway 500");
    },
    evaluateCall: async () => ran.push("evaluate"),
  });
  assert.deepEqual(ran, ["compliance", "evaluate"]);
});

test("does nothing without a Call SID", async () => {
  const fail = async () => assert.fail("nothing to analyze");
  await analyzeFinishedCall({}, { markStarted: fail, analyzeCompliance: fail, evaluateCall: fail });
});
