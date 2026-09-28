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

// Reproduced from a real healthcare scenario run: the model's overall
// assessment cited the AI-disclosure criterion as a failure reason and then
// conceded it was met, while its own criterion results marked it met.
const disclosureCriterion = "Agent discloses it is an automated system within the first 10 seconds";
const medicationCriterion = "Agent confirms medication adherence";
const contradictoryJudgement = {
  verdict: "fail",
  assessment:
    "The agent failed to disclose the automated system within 10 seconds (it took 1120ms, which is 1.12 seconds, so this criterion is actually met), and it never confirmed medication adherence.",
  criterionResults: [
    { criterion: disclosureCriterion, met: true, explanation: "Disclosed at 1120ms." },
    { criterion: medicationCriterion, met: false, explanation: "Never asked about medication." },
  ],
  evidenceQuotes: [],
};

test("a failing verdict's summary names only the unmet criteria, never a met one", async () => {
  const result = await evaluateTranscript(scenario, transcript, {
    llmGateway: async () => JSON.stringify(contradictoryJudgement),
  });
  assert.equal(result.verdict, "fail");
  assert.equal(result.assessment, `Failed 1 of 2 criteria: ${medicationCriterion}.`);
  assert.doesNotMatch(result.assessment, /disclos/i);
  assert.deepEqual(result.criterionResults, contradictoryJudgement.criterionResults);
});

test("an unmet criterion fails the run even if the model's verdict says pass", async () => {
  const result = await evaluateTranscript(scenario, transcript, {
    llmGateway: async () => JSON.stringify({ ...contradictoryJudgement, verdict: "pass", assessment: "Looks fine." }),
  });
  assert.equal(result.verdict, "fail");
  assert.equal(result.assessment, `Failed 1 of 2 criteria: ${medicationCriterion}.`);
});

test("all criteria met passes the run, replacing a fail-shaped summary", async () => {
  const allMet = contradictoryJudgement.criterionResults.map((c) => ({ ...c, met: true }));
  const result = await evaluateTranscript(scenario, transcript, {
    llmGateway: async () => JSON.stringify({ ...contradictoryJudgement, criterionResults: allMet }),
  });
  assert.equal(result.verdict, "pass");
  assert.equal(result.assessment, "All 2 criteria met.");
});

test("asks for criterion results before the verdict and assessment", async () => {
  let systemPrompt = "";
  await evaluateTranscript(scenario, transcript, {
    llmGateway: async (messages) => {
      systemPrompt = messages[0].content;
      return JSON.stringify(contradictoryJudgement);
    },
  });
  const order = ['"criterionResults"', '"verdict"', '"assessment"'].map((key) => systemPrompt.indexOf(key));
  assert.ok(order.every((i) => i >= 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test("gives the model turn times in seconds, the unit criteria are written in", async () => {
  let userMessage = "";
  await evaluateTranscript(
    scenario,
    { turns: [{ role: "agent", text: "You're speaking with an AI assistant.", tMs: 1440 }, { role: "user", text: "Hi.", tMs: 9000 }] },
    {
      llmGateway: async (messages) => {
        userMessage = messages[1].content;
        return JSON.stringify(contradictoryJudgement);
      },
    },
  );
  assert.match(userMessage, /Turn 0 \(agent, t=1\.4s\)/);
  assert.match(userMessage, /Turn 1 \(user, t=9\.0s\)/);
  assert.doesNotMatch(userMessage, /ms\)/);
});
