import { test } from "node:test";
import assert from "node:assert/strict";
import { recordingsConfigured, uploadRecording, getRecording } from "./recordingsStore.js";

const ENV = {
  RECORDINGS_BUCKET: "storage",
  RECORDINGS_BUCKET_ENDPOINT: "https://t3.storageapi.dev",
  RECORDINGS_BUCKET_REGION: "auto",
  RECORDINGS_BUCKET_ACCESS_KEY_ID: "key",
  RECORDINGS_BUCKET_SECRET_ACCESS_KEY: "secret",
};

function fakeS3() {
  const calls = [];
  const objects = new Map();
  return {
    calls,
    objects,
    send: async (command) => {
      calls.push(command);
      const name = command.constructor.name;
      if (name === "PutObjectCommand") {
        objects.set(command.input.Key, { body: command.input.Body, contentType: command.input.ContentType });
        return {};
      }
      if (name === "GetObjectCommand") {
        const obj = objects.get(command.input.Key);
        if (!obj) {
          const err = new Error("not found");
          err.name = "NoSuchKey";
          throw err;
        }
        return { Body: obj.body, ContentType: obj.contentType };
      }
      throw new Error(`unhandled command: ${name}`);
    },
  };
}

test("recordingsConfigured is false unless every bucket var is set", () => {
  assert.equal(recordingsConfigured({}), false);
  assert.equal(recordingsConfigured({ RECORDINGS_BUCKET: "storage" }), false);
  assert.equal(recordingsConfigured(ENV), true);
});

test("uploadRecording throws without a configured bucket instead of silently no-op-ing", async () => {
  await assert.rejects(() => uploadRecording("sess_1", Buffer.from("x"), "audio/webm", {}, null));
});

test("uploadRecording PUTs under live-calls/<sessionId>.webm with the given content type", async () => {
  const s3 = fakeS3();
  const key = await uploadRecording("sess_1", Buffer.from("audio-bytes"), "audio/webm", ENV, s3);
  assert.equal(key, "live-calls/sess_1.webm");
  assert.equal(s3.calls[0].constructor.name, "PutObjectCommand");
  assert.equal(s3.calls[0].input.Bucket, "storage");
  assert.equal(s3.calls[0].input.Key, "live-calls/sess_1.webm");
  assert.equal(s3.calls[0].input.ContentType, "audio/webm");
});

test("getRecording round-trips what uploadRecording stored", async () => {
  const s3 = fakeS3();
  await uploadRecording("sess_1", Buffer.from("audio-bytes"), "audio/webm", ENV, s3);
  const recording = await getRecording("sess_1", ENV, s3);
  assert.equal(recording.contentType, "audio/webm");
  assert.equal(recording.body.toString(), "audio-bytes");
});

test("getRecording returns null for a missing key instead of throwing", async () => {
  const s3 = fakeS3();
  const recording = await getRecording("sess_never_uploaded", ENV, s3);
  assert.equal(recording, null);
});

test("getRecording is a no-op (null) without a configured bucket", async () => {
  assert.equal(await getRecording("sess_1", {}, null), null);
});
