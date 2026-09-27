import { test } from "node:test";
import assert from "node:assert/strict";
import * as broker from "./callBridgeBroker.js";

test("claimPendingRunForTarget finds a run with a persona leg but no target leg yet, and reserves it", () => {
  broker.registerPersonaLeg("run_a");
  const claimed = broker.claimPendingRunForTarget();
  assert.equal(claimed, "run_a");
  // Reserved - a second claim attempt should not also find it.
  assert.equal(broker.claimPendingRunForTarget(), null);
  broker.releaseRun("run_a");
});

test("claimPendingRunForTarget returns null when nothing is pending (a real external caller)", () => {
  assert.equal(broker.claimPendingRunForTarget(), null);
});

test("registering the same persona leg twice does not un-claim it", () => {
  broker.registerPersonaLeg("run_b");
  assert.equal(broker.claimPendingRunForTarget(), "run_b");
  broker.registerPersonaLeg("run_b");
  assert.equal(broker.claimPendingRunForTarget(), null);
  broker.releaseRun("run_b");
});

test("waitForClaimableRun retries until a persona leg registers, then resolves", async () => {
  const claimPromise = broker.waitForClaimableRun({ attempts: 10, intervalMs: 5 });
  // Register the persona leg slightly after the wait starts, simulating the
  // real timing (persona resolves its runId asynchronously).
  setTimeout(() => broker.registerPersonaLeg("run_d"), 15);
  const claimed = await claimPromise;
  assert.equal(claimed, "run_d");
  broker.releaseRun("run_d");
});

test("waitForClaimableRun gives up and returns null after exhausting attempts", async () => {
  const claimed = await broker.waitForClaimableRun({ attempts: 2, intervalMs: 5 });
  assert.equal(claimed, null);
});

test("releaseRun removes the run so a later claim never resurfaces it", () => {
  broker.registerPersonaLeg("run_e");
  broker.releaseRun("run_e");
  assert.equal(broker.claimPendingRunForTarget(), null);
});
