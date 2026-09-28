import test from "node:test";
import assert from "node:assert/strict";
import { createCallRecorder } from "./callRecorder.js";
import { transcribeCallRecording, turnsFromChannelUtterances } from "./callTranscription.js";

const ROLES = { incomingRole: "agent", outgoingRole: "user" };

test("turnsFromChannelUtterances maps each recording channel to its role, in call order", () => {
  // Shape of a real multichannel response (2026-09-27): channel is a string.
  const turns = turnsFromChannelUtterances(
    [
      { channel: "2", speaker: "2", text: "Hello? I am—", start: 6800, end: 9520 },
      {
        channel: "1",
        speaker: "1",
        text: "Thanks for calling Northwind Bank. You are speaking with an AI assistant. Can I get your name to get started?",
        start: 1520,
        end: 6640,
      },
      { channel: "1", speaker: "1", text: "I am", start: 9760, end: 10000 },
    ],
    ROLES,
  );
  assert.deepEqual(turns, [
    {
      role: "agent",
      text: "Thanks for calling Northwind Bank. You are speaking with an AI assistant. Can I get your name to get started?",
      tMs: 1520,
    },
    { role: "user", text: "Hello? I am—", tMs: 6800 },
    { role: "agent", text: "I am", tMs: 9760 },
  ]);
});

test("turnsFromChannelUtterances drops empty utterances and unknown channels", () => {
  assert.deepEqual(
    turnsFromChannelUtterances(
      [
        { channel: "1", text: "  ", start: 0 },
        { channel: "3", text: "stray", start: 10 },
        { channel: "2", text: "Hi.", start: 20 },
      ],
      ROLES,
    ),
    [{ role: "user", text: "Hi.", tMs: 20 }],
  );
  assert.deepEqual(turnsFromChannelUtterances(undefined, ROLES), []);
});

test("transcribeCallRecording sends the recorder's stereo legs for multichannel transcription", async () => {
  const recorder = createCallRecorder(1000);
  recorder.addIncomingFrame(Buffer.alloc(160, 0x10).toString("base64"), 0);
  recorder.addOutgoingFrame(Buffer.alloc(160, 0x90).toString("base64"), 20);
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    if (String(url).endsWith("/v2/upload")) {
      return { ok: true, json: async () => ({ upload_url: "https://cdn.example/call.wav" }) };
    }
    if (String(url).endsWith("/v2/transcript")) return { ok: true, json: async () => ({ id: "tr_1" }) };
    return {
      ok: true,
      json: async () => ({
        status: "completed",
        utterances: [
          { channel: "2", text: "Hi, this is Maria.", start: 1200 },
          { channel: "1", text: "Hello, how can I help?", start: 100 },
        ],
      }),
    };
  };

  const turns = await transcribeCallRecording(recorder, { apiKey: "key", ...ROLES, fetchImpl, pollIntervalMs: 0 });

  const upload = calls[0];
  assert.equal(upload.opts.body.readUInt16LE(22), 2, "uploads the two-channel recording");
  assert.deepEqual(JSON.parse(calls[1].opts.body), { audio_url: "https://cdn.example/call.wav", multichannel: true });
  assert.deepEqual(turns, [
    { role: "agent", text: "Hello, how can I help?", tMs: 100 },
    { role: "user", text: "Hi, this is Maria.", tMs: 1200 },
  ]);
});
