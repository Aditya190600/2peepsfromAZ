import { test } from "node:test";
import assert from "node:assert/strict";
import { createAgent, updateAgent, getAgent } from "./demoAgentAgents.js";

const ENV = { ASSEMBLYAI_API_KEY: "aai_key_123" };

function fakeFetch(handler) {
  return async (url, opts) => handler(url, opts);
}

test("createAgent throws when ASSEMBLYAI_API_KEY is not configured", async () => {
  await assert.rejects(createAgent({ name: "x" }, {}), /not configured/);
});

test("createAgent posts to /v1/agents with Bearer auth and returns the parsed body", async () => {
  let captured;
  const fetchImpl = fakeFetch(async (url, opts) => {
    captured = { url, opts };
    return { ok: true, json: async () => ({ id: "agent_1", name: "x" }) };
  });
  const agent = await createAgent({ name: "x", system_prompt: "p", voice: { voice_id: "anna" } }, ENV, fetchImpl);
  assert.equal(captured.url, "https://agents.assemblyai.com/v1/agents");
  assert.equal(captured.opts.method, "POST");
  assert.equal(captured.opts.headers.Authorization, "Bearer aai_key_123");
  assert.equal(agent.id, "agent_1");
});

test("createAgent surfaces a non-2xx response as an error", async () => {
  const fetchImpl = fakeFetch(async () => ({ ok: false, status: 401, json: async () => ({ detail: "Unauthorized" }) }));
  await assert.rejects(createAgent({ name: "x" }, ENV, fetchImpl), /HTTP 401/);
});

test("updateAgent PUTs to /v1/agents/:id with only the changed fields", async () => {
  let captured;
  const fetchImpl = fakeFetch(async (url, opts) => {
    captured = { url, opts };
    return { ok: true, json: async () => ({ id: "agent_1", greeting: "hi" }) };
  });
  const agent = await updateAgent("agent_1", { greeting: "hi" }, ENV, fetchImpl);
  assert.equal(captured.url, "https://agents.assemblyai.com/v1/agents/agent_1");
  assert.equal(captured.opts.method, "PUT");
  assert.equal(JSON.parse(captured.opts.body).greeting, "hi");
  assert.equal(agent.greeting, "hi");
});

test("getAgent fetches /v1/agents/:id", async () => {
  const fetchImpl = fakeFetch(async () => ({ ok: true, json: async () => ({ id: "agent_1", system_prompt: "p" }) }));
  const agent = await getAgent("agent_1", ENV, fetchImpl);
  assert.equal(agent.system_prompt, "p");
});
