import { test } from "node:test";
import assert from "node:assert/strict";
import * as broker from "./callBridgeBroker.js";

test("claimPendingRun hands the target leg the demo agent key placeCall registered for the run, once", () => {
  broker.registerPlacedRun("run_a", { demoAgentKey: "healthcare-compliant" });
  assert.deepEqual(broker.claimPendingRun(), { runId: "run_a", demoAgentKey: "healthcare-compliant" });
  // Reserved - a second target connection does not also get it.
  assert.equal(broker.claimPendingRun(), null);
  broker.releaseRun("run_a");
});

test("claimPendingRun returns null when nothing is pending (a real external caller)", () => {
  assert.equal(broker.claimPendingRun(), null);
});

test("a placed run with no demo agent key claims with a null key (the Settings default answers)", () => {
  broker.registerPlacedRun("run_b");
  assert.deepEqual(broker.claimPendingRun(), { runId: "run_b", demoAgentKey: null });
  broker.releaseRun("run_b");
});

test("releaseRun removes the run so a later claim never resurfaces it", () => {
  broker.registerPlacedRun("run_c", { demoAgentKey: "flight-flawed" });
  broker.releaseRun("run_c");
  assert.equal(broker.claimPendingRun(), null);
});

test("a placed run no target leg claimed in time is dropped, not handed to a later caller", () => {
  broker.registerPlacedRun("run_d", { demoAgentKey: "healthcare-compliant" }, 1_000);
  assert.equal(broker.claimPendingRun(1_000 + broker.UNCLAIMED_RUN_TTL_MS + 1), null);
  // Dropped for good, not just skipped.
  assert.equal(broker.claimPendingRun(1_000), null);
});
