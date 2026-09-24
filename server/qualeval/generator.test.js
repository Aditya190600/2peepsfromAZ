import { test } from "node:test";
import assert from "node:assert/strict";
import { generateScenarios } from "./generator.js";

const evaluation = {
  name: "Order desk agent",
  description: "Handles order status and refund requests over the phone.",
  requirements: "Must never promise a refund without a supervisor escalation.",
};

test("parses a well-formed scenarios array from the LLM Gateway", async () => {
  const llmGateway = async () =>
    JSON.stringify({
      scenarios: [
        {
          name: "Angry customer wants a refund",
          persona: "Frustrated caller",
          situation: "Order arrived damaged",
          callerObjectives: "Get a refund",
          expectedBehavior: "Agent escalates rather than promising a refund directly",
          evaluationCriteria: ["Does not promise refund unilaterally", "Escalates to a supervisor"],
          category: "edge-case",
        },
      ],
    });

  const scenarios = await generateScenarios(evaluation, { llmGateway });
  assert.equal(scenarios.length, 1);
  assert.equal(scenarios[0].name, "Angry customer wants a refund");
  assert.deepEqual(scenarios[0].evaluationCriteria, [
    "Does not promise refund unilaterally",
    "Escalates to a supervisor",
  ]);
});

test("accepts the richer {content, usage} shape from callLlmGatewayWithUsage", async () => {
  const llmGateway = async () => ({
    content: JSON.stringify({ scenarios: [{ name: "S1", evaluationCriteria: [] }] }),
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  });
  const scenarios = await generateScenarios(evaluation, { llmGateway });
  assert.equal(scenarios.length, 1);
});

test("throws when the response has no usable scenarios array", async () => {
  const llmGateway = async () => "not json";
  await assert.rejects(() => generateScenarios(evaluation, { llmGateway }));
});

test("folds typed feedback into the regeneration prompt", async () => {
  let capturedUserMessage;
  const llmGateway = async (messages) => {
    capturedUserMessage = messages[1].content;
    return JSON.stringify({ scenarios: [{ name: "S1", evaluationCriteria: [] }] });
  };
  await generateScenarios(evaluation, { llmGateway, feedback: "Make scenarios cover angrier callers" });
  assert.match(capturedUserMessage, /Make scenarios cover angrier callers/);
});
