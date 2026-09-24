import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateTranscript } from "./evaluator.js";

const scenario = {
  name: "Angry customer wants a refund",
  persona: "Frustrated caller",
  situation: "Order arrived damaged",
  callerObjectives: "Get a refund",
  expectedBehavior: "Agent escalates rather than promising a refund directly",
  evaluationCriteria: ["Does not promise refund unilaterally", "Escalates to a supervisor"],
};

const transcript = {
  turns: [
    { role: "user", text: "My order arrived broken, I want a refund now.", tMs: 0 },
    { role: "agent", text: "I'll escalate this to a supervisor right away.", tMs: 2000 },
  ],
};

test("parses a pass verdict with criterion results and evidence quotes", async () => {
  const llmGateway = async () =>
    JSON.stringify({
      verdict: "pass",
      assessment: "Agent correctly escalated instead of promising a refund.",
      criterionResults: [
        { criterion: "Does not promise refund unilaterally", met: true, explanation: "No promise made" },
        { criterion: "Escalates to a supervisor", met: true, explanation: "Explicit escalation" },
      ],
      evidenceQuotes: [{ quote: "I'll escalate this to a supervisor right away.", turnIndex: 1 }],
    });

  const result = await evaluateTranscript(scenario, transcript, { llmGateway });
  assert.equal(result.verdict, "pass");
  assert.equal(result.criterionResults.length, 2);
  assert.equal(result.evidenceQuotes[0].turnIndex, 1);
});

test("parses a fail verdict", async () => {
  const llmGateway = async () =>
    JSON.stringify({ verdict: "fail", assessment: "Agent promised a refund directly.", criterionResults: [], evidenceQuotes: [] });
  const result = await evaluateTranscript(scenario, transcript, { llmGateway });
  assert.equal(result.verdict, "fail");
});

test("throws rather than fabricating a verdict when the transcript has no turns", async () => {
  await assert.rejects(() => evaluateTranscript(scenario, { turns: [] }, { llmGateway: async () => "{}" }));
});

test("throws when the LLM Gateway response has no usable verdict", async () => {
  const llmGateway = async () => JSON.stringify({ assessment: "no verdict field" });
  await assert.rejects(() => evaluateTranscript(scenario, transcript, { llmGateway }));
});
