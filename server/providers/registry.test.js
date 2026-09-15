import { test } from "node:test";
import assert from "node:assert/strict";
import * as store from "./store.js";
import * as registry from "./registry.js";

test.beforeEach(() => {
  store._resetForTests();
});

test("getConfig defaults every slot to its AssemblyAI provider with no key required", () => {
  const config = registry.getConfig();
  assert.equal(config.transcriber.providerId, "assemblyai");
  assert.equal(config.transcriber.requiresKey, false);
  assert.equal(config.transcriber.keyConfigured, true);
  assert.equal(config.model.providerId, "assemblyai-gateway");
  assert.equal(config.voice.providerId, "assemblyai-voice-agent");
});

test("listCatalog never exposes the underlying module reference", () => {
  const catalog = registry.listCatalog();
  for (const providers of Object.values(catalog)) {
    for (const provider of providers) {
      assert.equal(provider.module, undefined);
      assert.ok(typeof provider.id === "string");
      assert.ok(typeof provider.label === "string");
      assert.ok(typeof provider.requiresKey === "boolean");
    }
  }
});

test("setSelection rejects unknown slots and providers", () => {
  assert.throws(() => registry.setSelection("bogus", "assemblyai"), registry.InvalidProviderError);
  assert.throws(
    () => registry.setSelection("transcriber", "bogus"),
    registry.InvalidProviderError
  );
});

test("setSelection updates getConfig for that slot only", () => {
  registry.setSelection("transcriber", "deepgram");
  const config = registry.getConfig();
  assert.equal(config.transcriber.providerId, "deepgram");
  assert.equal(config.transcriber.requiresKey, true);
  assert.equal(config.transcriber.keyConfigured, false);
  assert.equal(config.model.providerId, "assemblyai-gateway");
});

test("setCredential rejects an empty key and unknown provider id", () => {
  assert.throws(
    () => registry.setCredential("deepgram", { apiKey: "" }),
    registry.InvalidProviderError
  );
  assert.throws(
    () => registry.setCredential("bogus-provider", { apiKey: "k" }),
    registry.InvalidProviderError
  );
});

test("setCredential flips keyConfigured to true for that provider's slot", () => {
  registry.setSelection("transcriber", "deepgram");
  registry.setCredential("deepgram", { apiKey: "dg_test_key" });
  assert.equal(registry.getConfig().transcriber.keyConfigured, true);
});

test("getTranscriber/getModel/getVoice resolve to the currently selected adapter module", () => {
  assert.equal(typeof registry.getTranscriber().transcribe, "function");
  assert.equal(typeof registry.getModel().complete, "function");
  assert.equal(typeof registry.getVoice().mintToken, "function");

  registry.setSelection("model", "openai-compatible");
  assert.equal(typeof registry.getModel().complete, "function");
});

test("resolving an unset/invalid selection falls back to the slot's first (AssemblyAI) provider", () => {
  store._resetForTests({ selection: { model: "not-a-real-provider" } });
  const model = registry.getModel();
  assert.equal(typeof model.complete, "function");
});
