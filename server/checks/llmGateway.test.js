import { test } from "node:test";
import assert from "node:assert/strict";
import { callLlmGateway } from "./llmGateway.js";

function fakeResponse(content) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => "",
  };
}

test("callLlmGateway serializes concurrent calls, never more than one in flight", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  global.fetch = async () => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 20));
    inFlight--;
    return fakeResponse("ok");
  };

  await Promise.all([
    callLlmGateway([], { apiKey: "k" }),
    callLlmGateway([], { apiKey: "k" }),
    callLlmGateway([], { apiKey: "k" }),
  ]);

  assert.equal(maxInFlight, 1);
});

test("callLlmGateway keeps serializing later callers after an earlier call throws", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  let call = 0;
  global.fetch = async () => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 10));
    inFlight--;
    call++;
    if (call === 1) return { ok: false, status: 500, text: async () => "boom" };
    return fakeResponse("ok");
  };

  const results = await Promise.allSettled([
    callLlmGateway([], { apiKey: "k" }),
    callLlmGateway([], { apiKey: "k" }),
  ]);

  assert.equal(results[0].status, "rejected");
  assert.equal(results[1].status, "fulfilled");
  assert.equal(maxInFlight, 1);
});
