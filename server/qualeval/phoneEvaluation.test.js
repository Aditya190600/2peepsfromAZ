import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePhoneCall, rubricFromAgent } from "./phoneEvaluation.js";

const agent = {
  key: "compliant",
  name: "Northwind Bank (compliant)",
  systemPrompt: "Disclose that you are an AI in your first sentence.",
};

test("builds the rubric from the answering agent's own instructions", () => {
  const { instructions, scenario } = rubricFromAgent(agent);
  assert.equal(instructions, agent.systemPrompt);
  assert.equal(scenario.name, "Direct call to Northwind Bank (compliant)");
  assert.match(scenario.expectedBehavior, /Disclose that you are an AI/);
});

test("scores a direct caller against the active agent, never an evaluation set", async () => {
  let judged;
  let saved;
  const result = await evaluatePhoneCall(
    {
      twilioCallSid: "CA123",
      variantKey: "compliant",
      transcript: [{ role: "agent", text: "This is an AI assistant." }],
    },
    {
      getAgent: async (key) => {
        assert.equal(key, "compliant");
        return agent;
      },
      evaluate: async (scenario, transcript) => {
        judged = { scenario, transcript };
        return {
          verdict: "pass",
          assessment: "Disclosed the AI.",
          criterionResults: [],
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
  assert.equal(saved.evaluationStatus, "pass");
  assert.equal("evaluationId" in saved, false);
});

test("does not call the model when this leg is already a QualEval run", async () => {
  let saved;
  await evaluatePhoneCall(
    { twilioCallSid: "CA123", variantKey: "compliant", qualevalRunId: "run_1", transcript: [{ role: "agent", text: "hi" }] },
    {
      getAgent: async () => agent,
      evaluate: async () => assert.fail("should not score a scenario run twice"),
      record: async (fields) => {
        saved = fields;
      },
    },
  );
  assert.equal(saved.evaluationStatus, "skipped_run");
  assert.equal(saved.qualevalRunId, "run_1");
});

test("does not call the model for a persona-number leg whose run claim never landed", async () => {
  let saved;
  await evaluatePhoneCall(
    { twilioCallSid: "CA123", variantKey: "compliant", fromNumber: "1 (555) 000-0002", transcript: [{ role: "agent", text: "hi" }] },
    {
      getAgent: async () => agent,
      evaluate: async () => assert.fail("should not score a scenario run leg"),
      record: async (fields) => {
        saved = fields;
      },
      env: { QUALEVAL_PERSONA_NUMBER: "+15550000002" },
    },
  );
  assert.equal(saved.evaluationStatus, "skipped_run");
  assert.equal(saved.qualevalRunId, null);
});

test("records no_rubric when the agent's instructions can't be loaded", async () => {
  for (const getAgent of [async () => ({ ...agent, systemPrompt: "  " }), async () => null, async () => {
    throw new Error("AssemblyAI down");
  }]) {
    let saved;
    await evaluatePhoneCall(
      { twilioCallSid: "CA123", variantKey: "compliant", transcript: [{ role: "user", text: "hello" }] },
      {
        getAgent,
        evaluate: async () => assert.fail("should not score without a rubric"),
        record: async (fields) => {
          saved = fields;
        },
      },
    );
    assert.equal(saved.evaluationStatus, "no_rubric");
  }
});

test("records no_transcript when nothing was said", async () => {
  let saved;
  await evaluatePhoneCall(
    { twilioCallSid: "CA123", variantKey: "compliant", transcript: [] },
    {
      getAgent: async () => assert.fail("no need to load the agent"),
      evaluate: async () => assert.fail("nothing to score"),
      record: async (fields) => {
        saved = fields;
      },
    },
  );
  assert.equal(saved.evaluationStatus, "no_transcript");
});

test("records the model error instead of throwing", async () => {
  let saved;
  await evaluatePhoneCall(
    { twilioCallSid: "CA123", variantKey: "compliant", transcript: [{ role: "user", text: "hello" }] },
    {
      getAgent: async () => agent,
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
