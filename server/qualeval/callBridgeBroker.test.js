import { test } from "node:test";
import assert from "node:assert/strict";
import * as broker from "./callBridgeBroker.js";

test("claimPendingRunForTarget finds a run with a persona leg but no target leg yet, and reserves it", () => {
  broker.registerPersonaLeg("run_a", () => {});
  const claimed = broker.claimPendingRunForTarget();
  assert.equal(claimed, "run_a");
  // Reserved - a second claim attempt should not also find it.
  assert.equal(broker.claimPendingRunForTarget(), null);
  broker.releaseRun("run_a");
});

test("claimPendingRunForTarget returns null when nothing is pending (a real external caller)", () => {
  assert.equal(broker.claimPendingRunForTarget(), null);
});

test("forwardToTarget/forwardToPersona deliver audio to the other leg's injectAudio", () => {
  const personaReceived = [];
  const targetReceived = [];
  broker.registerPersonaLeg("run_b", (audio) => personaReceived.push(audio));
  broker.registerTargetLeg("run_b", (audio) => targetReceived.push(audio));

  broker.forwardToTarget("run_b", "persona-said-this");
  broker.forwardToPersona("run_b", "target-said-this");

  assert.deepEqual(targetReceived, ["persona-said-this"]);
  assert.deepEqual(personaReceived, ["target-said-this"]);
  broker.releaseRun("run_b");
});

test("forwarding to a run with no registered leg on that side is a silent no-op", () => {
  broker.registerPersonaLeg("run_c", () => {});
  assert.doesNotThrow(() => broker.forwardToTarget("run_c", "audio"));
  assert.doesNotThrow(() => broker.forwardToPersona("nonexistent-run", "audio"));
  broker.releaseRun("run_c");
});

test("waitForClaimableRun retries until a persona leg registers, then resolves", async () => {
  const claimPromise = broker.waitForClaimableRun({ attempts: 10, intervalMs: 5 });
  // Register the persona leg slightly after the wait starts, simulating the
  // real timing (persona resolves its runId asynchronously).
  setTimeout(() => broker.registerPersonaLeg("run_d", () => {}), 15);
  const claimed = await claimPromise;
  assert.equal(claimed, "run_d");
  broker.releaseRun("run_d");
});

test("waitForClaimableRun gives up and returns null after exhausting attempts", async () => {
  const claimed = await broker.waitForClaimableRun({ attempts: 2, intervalMs: 5 });
  assert.equal(claimed, null);
});

test("releaseRun removes both legs so a later claim never resurfaces the stale run", () => {
  broker.registerPersonaLeg("run_e", () => {});
  broker.registerTargetLeg("run_e", () => {});
  broker.releaseRun("run_e");
  assert.equal(broker.claimPendingRunForTarget(), null);
  // forwarding after release is a no-op, not a crash.
  assert.doesNotThrow(() => broker.forwardToTarget("run_e", "audio"));
});
