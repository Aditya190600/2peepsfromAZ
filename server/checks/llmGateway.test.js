import { test } from "node:test";
import assert from "node:assert/strict";
import { callLlmGateway, callLlmGatewayWithUsage, estimateCostUsd } from "./llmGateway.js";

function fakeResponse(content, usage) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content } }], ...(usage ? { usage } : {}) }),
    text: async () => "",
  };
}

test("callLlmGatewayWithUsage returns input/output/total tokens from the Gateway's usage object", async () => {
  global.fetch = async () =>
    fakeResponse("ok", { input_tokens: 120, output_tokens: 25, total_tokens: 145 });

  const result = await callLlmGatewayWithUsage([], { apiKey: "k", model: "qwen3.5-4b-32k-fast" });
  assert.equal(result.content, "ok");
  assert.deepEqual(result.usage, { inputTokens: 120, outputTokens: 25, totalTokens: 145 });
  assert.equal(typeof result.costUsd, "number");
  assert.ok(result.costUsd > 0);
});

test("callLlmGateway (back-compat) still resolves to the plain content string", async () => {
  global.fetch = async () => fakeResponse("ok", { input_tokens: 1, output_tokens: 1, total_tokens: 2 });
  assert.equal(await callLlmGateway([], { apiKey: "k" }), "ok");
});

test("estimateCostUsd returns null for an unpriced model instead of a misleading $0", () => {
  assert.equal(estimateCostUsd("some-unlisted-model", { inputTokens: 100, outputTokens: 100 }), null);
});

test("estimateCostUsd applies published per-1M-token pricing for the default model", () => {
  const cost = estimateCostUsd("qwen3.5-4b-32k-fast", { inputTokens: 1_000_000, outputTokens: 1_000_000 });
  assert.ok(Math.abs(cost - 0.6) < 1e-9);
});

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

// Repeatedly fires all pending mocked timers, yielding to microtasks between
// rounds so newly-scheduled timers (the next retry's abort timer, its sleep)
// get picked up too - a plain single runAll() only catches what's pending now.
async function flushTimers(t, rounds = 20) {
  for (let i = 0; i < rounds; i++) {
    t.mock.timers.runAll();
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test("callLlmGateway aborts a never-resolving fetch instead of wedging the mutex forever", async (t) => {
  global.fetch = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });

  t.mock.timers.enable({ apis: ["setTimeout"] });
  const promise = assert.rejects(callLlmGateway([], { apiKey: "k", timeoutMs: 20 }), /timed out/);
  await flushTimers(t);
  await promise;
});

test("callLlmGateway recovers after one timed-out attempt", async (t) => {
  let call = 0;
  global.fetch = (_url, { signal }) => {
    call++;
    if (call === 1) {
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }
    return Promise.resolve(fakeResponse("ok"));
  };

  t.mock.timers.enable({ apis: ["setTimeout"] });
  const promise = callLlmGateway([], { apiKey: "k", timeoutMs: 20 });
  await flushTimers(t);
  assert.equal(await promise, "ok");
});
