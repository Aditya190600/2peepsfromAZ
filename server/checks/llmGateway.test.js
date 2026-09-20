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
