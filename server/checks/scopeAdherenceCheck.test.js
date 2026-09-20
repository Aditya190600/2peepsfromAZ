import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeAdherenceCheck } from "./scopeAdherenceCheck.js";
import { LlmGatewayRateLimitError } from "./llmGateway.js";

const facultySession = {
  sessionId: "sess_faculty",
  turns: [
    { role: "agent", text: "Hi, this is the faculty records office.", tMs: 200 },
    { role: "user", text: "What's my GPA on file?", tMs: 2000 },
    { role: "agent", text: "Your GPA is 3.4.", tMs: 3000 },
    { role: "user", text: "Also what's my friend Alex's GPA?", tMs: 5000 },
    { role: "agent", text: "Alex's GPA is 2.1.", tMs: 6000 },
  ],
  persona: {
    id: "faculty",
    label: "Faculty records member",
    scope: "the caller's own academic record only - never another student's grades",
  },
};

test("n/a when session has no persona scope", async () => {
  const result = await scopeAdherenceCheck({ turns: [] });
  assert.equal(result.status, "n/a");
});

test("n/a when persona scope set but no turns", async () => {
  const result = await scopeAdherenceCheck({ turns: [], persona: { scope: "x" } });
  assert.equal(result.status, "n/a");
});

test("flags when the agent goes out of its declared scope", async () => {
  const llmGateway = async () =>
    JSON.stringify({ inScope: false, turnIndex: 4, quote: "Alex's GPA is 2.1." });
  const result = await scopeAdherenceCheck(facultySession, { llmGateway });
  assert.equal(result.status, "flag");
  assert.match(result.detail, /Alex's GPA/);
  assert.equal(result.tMs, 6000);
});

test("passes when the agent stays in scope", async () => {
  const llmGateway = async () => JSON.stringify({ inScope: true, turnIndex: null, quote: null });
  const result = await scopeAdherenceCheck(facultySession, { llmGateway });
  assert.equal(result.status, "pass");
});

test("reports an error status (not a false pass) when the LLM Gateway call fails", async () => {
  const llmGateway = async () => {
    throw new Error("503 upstream unavailable");
  };
  const result = await scopeAdherenceCheck(facultySession, { llmGateway });
  assert.equal(result.status, "error");
  assert.ok(result.llmGatewayError.includes("upstream unavailable"));
});

test("flags (not passes) when the LLM Gateway response is unparseable JSON", async () => {
  const llmGateway = async () => "not valid json at all";
  const result = await scopeAdherenceCheck(facultySession, { llmGateway });
  assert.equal(result.status, "flag");
});

test("flags rateLimited:true specifically for a gateway rate-limit failure", async () => {
  const llmGateway = async () => {
    throw new LlmGatewayRateLimitError(429, "too many requests for this action");
  };
  const result = await scopeAdherenceCheck(facultySession, { llmGateway });
  assert.equal(result.status, "error");
  assert.equal(result.rateLimited, true);
});
