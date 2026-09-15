import { test } from "node:test";
import assert from "node:assert/strict";
import * as store from "./store.js";
import { complete } from "./modelOpenaiCompatible.js";

test.beforeEach(() => {
  store._resetForTests();
});

test("complete throws a human error when no key is configured", async () => {
  await assert.rejects(
    () => complete([{ role: "user", content: "hi" }]),
    /no API key is configured/
  );
});

test("complete hits the configured base URL with a Bearer key and returns message content", async () => {
  store.setCredential("openai-compatible", { apiKey: "sk-test", baseUrl: "https://example.com/v1/" });
  let capturedUrl, capturedInit;
  global.fetch = async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return { ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }] }) };
  };

  const content = await complete([{ role: "user", content: "hi" }]);

  assert.equal(capturedUrl, "https://example.com/v1/chat/completions");
  assert.equal(capturedInit.headers.Authorization, "Bearer sk-test");
  const body = JSON.parse(capturedInit.body);
  assert.equal(body.model, "gpt-4o-mini");
  assert.equal(content, "ok");
});

test("complete defaults to api.openai.com when no baseUrl is stored", async () => {
  store.setCredential("openai-compatible", { apiKey: "sk-test" });
  let capturedUrl;
  global.fetch = async (url) => {
    capturedUrl = url;
    return { ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }] }) };
  };

  await complete([{ role: "user", content: "hi" }]);

  assert.equal(capturedUrl, "https://api.openai.com/v1/chat/completions");
});

test("complete surfaces a non-ok response as an error", async () => {
  store.setCredential("openai-compatible", { apiKey: "sk-test" });
  global.fetch = async () => ({ ok: false, status: 429, text: async () => "rate limited" });

  await assert.rejects(
    () => complete([{ role: "user", content: "hi" }]),
    /OpenAI-compatible request failed: 429/
  );
});
