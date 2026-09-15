import { test } from "node:test";
import assert from "node:assert/strict";
import * as store from "./store.js";
import { transcribe, turnsFromUtterances } from "./transcriberDeepgram.js";

test.beforeEach(() => {
  store._resetForTests();
});

test("turnsFromUtterances maps the first speaker to agent and converts seconds to ms", () => {
  const turns = turnsFromUtterances([
    { speaker: 0, transcript: "Hi, this is Acme.", start: 0.2, end: 1.5 },
    { speaker: 1, transcript: "Hey there.", start: 2.0, end: 2.8 },
    { speaker: 0, transcript: "How can I help?", start: 3.0, end: 4.1 },
  ]);
  assert.deepEqual(turns, [
    { role: "agent", text: "Hi, this is Acme.", tMs: 200 },
    { role: "user", text: "Hey there.", tMs: 2000 },
    { role: "agent", text: "How can I help?", tMs: 3000 },
  ]);
});

test("turnsFromUtterances returns [] for empty/missing input", () => {
  assert.deepEqual(turnsFromUtterances([]), []);
  assert.deepEqual(turnsFromUtterances(undefined), []);
});

test("transcribe throws a human error when no Deepgram key is configured", async () => {
  await assert.rejects(() => transcribe(Buffer.from("audio")), /no API key is configured/);
});

test("transcribe sends the buffer with a Token auth header and maps the response", async () => {
  store.setCredential("deepgram", { apiKey: "dg_test_key" });
  let capturedUrl, capturedInit;
  global.fetch = async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return {
      ok: true,
      json: async () => ({
        results: { utterances: [{ speaker: 0, transcript: "hello", start: 0, end: 1 }] },
      }),
    };
  };

  const turns = await transcribe(Buffer.from("audio"));

  assert.match(capturedUrl, /^https:\/\/api\.deepgram\.com\/v1\/listen/);
  assert.equal(capturedInit.headers.Authorization, "Token dg_test_key");
  assert.deepEqual(turns, [{ role: "agent", text: "hello", tMs: 0 }]);
});

test("transcribe surfaces a non-ok response as an error", async () => {
  store.setCredential("deepgram", { apiKey: "dg_test_key" });
  global.fetch = async () => ({ ok: false, status: 401, text: async () => "unauthorized" });

  await assert.rejects(() => transcribe(Buffer.from("audio")), /Deepgram transcription failed: 401/);
});
