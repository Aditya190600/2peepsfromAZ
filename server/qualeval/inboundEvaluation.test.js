import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateInboundCall, rubricFromEvaluation } from "./inboundEvaluation.js";

const evaluation = {
  id: "eval_1",
  name: "Clinic line",
  agentPhoneNumber: "+18038245760",
  description: "Front desk",
  requirements: "Disclose the AI in the first sentence.\nDo not ask for a social security number.",
};

test("splits requirements into one criterion per line", () => {
  const { scenario } = rubricFromEvaluation(evaluation);
  assert.deepEqual(scenario.evaluationCriteria, [
    "Disclose the AI in the first sentence.",
    "Do not ask for a social security number.",
  ]);
  assert.equal(scenario.expectedBehavior, evaluation.requirements);
});

test("scores an inbound caller against the evaluation for the dialed number", async () => {
  let judged;
  let saved;
  const result = await evaluateInboundCall(
    {
      twilioCallSid: "CA123",
      toNumber: "+1 (803) 824-5760",
      transcript: [{ role: "agent", text: "This is an AI assistant." }],
    },
    {
      findEvaluation: async (to) => {
        assert.equal(to, "+1 (803) 824-5760");
        return evaluation;
      },
      evaluate: async (scenario, transcript) => {
        judged = { scenario, transcript };
        return {
          verdict: "pass",
          assessment: "Disclosed the AI.",
          criterionResults: [{ criterion: "Disclose the AI in the first sentence.", met: true }],
          evidenceQuotes: [{ quote: "This is an AI assistant.", turnIndex: 0 }],
        };
      },
      record: async (fields) => {
        saved = fields;
        return fields;
      },
    },
  );
  assert.equal(result.verdict, "pass");
  assert.equal(judged.transcript.turns[0].text, "This is an AI assistant.");
  assert.equal(saved.evaluationId, "eval_1");
  assert.equal(saved.evaluationStatus, "pass");
});

test("does not call the model when this inbound leg is already a QualEval run", async () => {
  let saved;
  await evaluateInboundCall(
    { twilioCallSid: "CA123", toNumber: "+18038245760", qualevalRunId: "run_1", transcript: [{ role: "agent", text: "hi" }] },
    {
      findEvaluation: async () => evaluation,
      evaluate: async () => assert.fail("should not score a scenario run twice"),
      record: async (fields) => {
        saved = fields;
      },
    },
  );
  assert.equal(saved.evaluationStatus, "skipped_run");
  assert.equal(saved.qualevalRunId, "run_1");
  assert.equal(saved.evaluationId, "eval_1");
});

test("records no_rubric and does not call the model when the evaluation has no requirements", async () => {
  let saved;
  await evaluateInboundCall(
    { twilioCallSid: "CA123", toNumber: "+18038245760", transcript: [{ role: "user", text: "hello" }] },
    {
      findEvaluation: async () => ({ id: "eval_1", name: "Empty", requirements: "  ", description: "" }),
      evaluate: async () => assert.fail("should not score without a rubric"),
      record: async (fields) => {
        saved = fields;
      },
    },
  );
  assert.equal(saved.evaluationStatus, "no_rubric");
  assert.equal(saved.evaluationId, "eval_1");
});

test("records the model error instead of throwing", async () => {
  let saved;
  await evaluateInboundCall(
    { twilioCallSid: "CA123", toNumber: "+18038245760", transcript: [{ role: "user", text: "hello" }] },
    {
      findEvaluation: async () => evaluation,
      evaluate: async () => {
        throw new Error("rate limited");
      },
      record: async (fields) => {
        saved = fields;
      },
    },
  );
  assert.equal(saved.evaluationStatus, "error");
  assert.equal(saved.evaluationError, "rate limited");
});
