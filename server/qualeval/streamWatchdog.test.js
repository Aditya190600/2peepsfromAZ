import { test } from "node:test";
import assert from "node:assert/strict";
import { armStreamWatchdog } from "./streamWatchdog.js";

test("armStreamWatchdog marks the run as stale once the timeout elapses", async () => {
  let called;
  const timer = armStreamWatchdog("run_1", {
    timeoutMs: 5,
    markRunErrorIfStale: async (id, message) => {
      called = { id, message };
      return { id, verdict: "error", error: message };
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(called.id, "run_1");
  assert.match(called.message, /did not complete/);
  clearTimeout(timer);
});

test("armStreamWatchdog swallows a markRunErrorIfStale failure instead of throwing unhandled", async () => {
  const timer = armStreamWatchdog("run_1", {
    timeoutMs: 5,
    markRunErrorIfStale: async () => {
      throw new Error("pool unavailable");
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  clearTimeout(timer);
});
