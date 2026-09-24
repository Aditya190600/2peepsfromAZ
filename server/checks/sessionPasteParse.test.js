import { test } from "node:test";
import assert from "node:assert/strict";
import { llmParsePastedSession } from "./sessionPasteParse.js";

test("extracts turns from the model's JSON response", async () => {
  const llmGateway = async () =>
    JSON.stringify({
      sessionId: "sess_from_text",
      turns: [
        { role: "agent", text: "Hi, this is ComplyLine.", tMs: 0 },
        { role: "user", text: "Hi there.", tMs: 2500 },
      ],
    });
  const result = await llmParsePastedSession("Agent: Hi, this is ComplyLine.\nCaller: Hi there.", {
    llmGateway,
  });
  assert.equal(result.ok, true);
  assert.equal(result.session.sessionId, "sess_from_text");
  assert.equal(result.session.turns.length, 2);
  assert.equal(result.session.turns[1].role, "user");
});

test("fills in a best-effort tMs when the model omits it", async () => {
  const llmGateway = async () =>
    JSON.stringify({ turns: [{ role: "agent", text: "Hello" }, { role: "user", text: "Hi" }] });
  const result = await llmParsePastedSession("hello / hi", { llmGateway });
  assert.equal(result.ok, true);
  assert.equal(result.session.turns[0].tMs, 0);
  assert.equal(result.session.turns[1].tMs, 3000);
});

test("mints a sessionId when the model doesn't return one", async () => {
  const llmGateway = async () => JSON.stringify({ turns: [{ role: "agent", text: "Hi" }] });
  const result = await llmParsePastedSession("hi", { llmGateway });
  assert.equal(result.ok, true);
  assert.match(result.session.sessionId, /^sess_pasted_/);
});

test("fails when the model returns no usable turns", async () => {
  const llmGateway = async () => JSON.stringify({ turns: [] });
  const result = await llmParsePastedSession("not a call", { llmGateway });
  assert.equal(result.ok, false);
  assert.match(result.error, /could not find/i);
});

test("fails when the model response isn't valid JSON", async () => {
  const llmGateway = async () => "not json";
  const result = await llmParsePastedSession("hi", { llmGateway });
  assert.equal(result.ok, false);
});
