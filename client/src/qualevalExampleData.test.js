import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXAMPLE_SCENARIO,
  EXAMPLE_RUN,
  EXAMPLE_SCENARIO_PASS,
  EXAMPLE_RUN_PASS,
} from "./qualevalExampleData.js";

function assertConsistentRun(scenario, run) {
  assert.deepEqual(
    run.criterionResults.map((r) => r.criterion),
    scenario.evaluationCriteria,
    "every criterion is scored, in order",
  );
  for (const { quote, turnIndex } of run.evidenceQuotes) {
    const turn = run.transcript.turns[turnIndex];
    assert.ok(turn, `evidence turn ${turnIndex} exists`);
    assert.ok(turn.text.includes(quote), `evidence quote appears in turn ${turnIndex}`);
  }
}

test("examples cover both a failing and a passing verdict", () => {
  assert.equal(EXAMPLE_RUN.verdict, "fail");
  assert.equal(EXAMPLE_RUN_PASS.verdict, "pass");
});

test("the pass example meets every criterion, so its verdict is earned", () => {
  assertConsistentRun(EXAMPLE_SCENARIO_PASS, EXAMPLE_RUN_PASS);
  assert.ok(EXAMPLE_RUN_PASS.criterionResults.every((r) => r.met));
});

test("the fail example has at least one unmet criterion", () => {
  assertConsistentRun(EXAMPLE_SCENARIO, EXAMPLE_RUN);
  assert.ok(EXAMPLE_RUN.criterionResults.some((r) => !r.met));
});
