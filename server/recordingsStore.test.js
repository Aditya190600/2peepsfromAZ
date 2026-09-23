import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import express from "express";
import { recordingsConfigured, uploadRecording, getRecording, recordingsRouter } from "./recordingsStore.js";

const ENV = {
  RECORDINGS_BUCKET: "storage",
  RECORDINGS_BUCKET_ENDPOINT: "https://t3.storageapi.dev",
  RECORDINGS_BUCKET_REGION: "auto",
  RECORDINGS_BUCKET_ACCESS_KEY_ID: "key",
  RECORDINGS_BUCKET_SECRET_ACCESS_KEY: "secret",
};

function notFound(name) {
  const err = new Error("not found");
  err.name = name;
  err.$metadata = { httpStatusCode: 404 };
  return err;
}

// Minimal in-memory S3: Put/Get/Head, with single "bytes=a-b" Range support.
function fakeS3() {
  const objects = new Map();
  return {
    objects,
    send: async (command) => {
      const name = command.constructor.name;
      const { Key, Body, ContentType, Range } = command.input;
      if (name === "PutObjectCommand") {
        objects.set(Key, { body: Buffer.from(Body), contentType: ContentType });
        return {};
      }
      const obj = objects.get(Key);
      if (name === "HeadObjectCommand") {
        if (!obj) throw notFound("NotFound");
        return {};
      }
      if (name === "GetObjectCommand") {
        if (!obj) throw notFound("NoSuchKey");
        let bytes = obj.body;
        let contentRange;
        if (Range) {
          const [, a, b] = /^bytes=(\d+)-(\d*)$/.exec(Range);
          const end = b ? Number(b) : bytes.length - 1;
          contentRange = `bytes ${a}-${end}/${bytes.length}`;
          bytes = bytes.subarray(Number(a), end + 1);
        }
        const body = Readable.from([bytes]);
        body.transformToString = async () => bytes.toString();
        return { Body: body, ContentType: obj.contentType, ContentLength: bytes.length, ContentRange: contentRange };
      }
      throw new Error(`unhandled command: ${name}`);
    },
  };
}

async function readAll(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks).toString();
}

// Boots the real router on an ephemeral port; the `x-user` header stands in
// for Clerk's userId so tests can act as different visitors.
async function startServer(s3 = fakeS3()) {
  const app = express();
  app.use(
    recordingsRouter({
      requireVisitor: (_req, _res, next) => next(),
      visitorId: (req) => req.headers["x-user"],
      env: ENV,
      s3,
    })
  );
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, { user, method = "GET", body, type = "audio/webm", headers = {} } = {}) =>
    fetch(`${base}${path}`, {
      method,
      body,
      headers: { ...(user ? { "x-user": user } : {}), ...(body ? { "content-type": type } : {}), ...headers },
    });
  return { s3, call, close: () => new Promise((r) => server.close(r)) };
}

test("recordingsConfigured is false unless every bucket var is set", () => {
  assert.equal(recordingsConfigured({}), false);
  assert.equal(recordingsConfigured({ RECORDINGS_BUCKET: "storage" }), false);
  assert.equal(recordingsConfigured(ENV), true);
});

test("uploadRecording throws without a configured bucket instead of silently no-op-ing", async () => {
  await assert.rejects(() => uploadRecording("anon", "sess_1", Buffer.from("x"), "audio/webm", {}, null));
});

test("uploadRecording rejects a non-audio content type", async () => {
  await assert.rejects(() => uploadRecording("anon", "sess_1", Buffer.from("x"), "text/html", ENV, fakeS3()));
});

test("getRecording round-trips what uploadRecording stored for the same owner", async () => {
  const s3 = fakeS3();
  await uploadRecording("user_a", "sess_1", Buffer.from("audio-bytes"), "audio/webm", ENV, s3);
  const recording = await getRecording("user_a", "sess_1", undefined, ENV, s3);
  assert.equal(recording.contentType, "audio/webm");
  assert.equal(await readAll(recording.body), "audio-bytes");
  assert.equal(await getRecording("user_b", "sess_1", undefined, ENV, s3), null);
});

test("getRecording is a no-op (null) without a configured bucket", async () => {
  assert.equal(await getRecording("anon", "sess_1", undefined, {}, null), null);
});

test("owner can upload and play back their recording", async () => {
  const srv = await startServer();
  try {
    const up = await srv.call("/v1/recordings/sess_1", { user: "user_a", method: "POST", body: "audio-bytes" });
    assert.equal(up.status, 201);
    assert.deepEqual(await up.json(), { url: "/v1/recordings/sess_1" });
    const get = await srv.call("/v1/recordings/sess_1", { user: "user_a" });
    assert.equal(get.status, 200);
    assert.equal(get.headers.get("content-type"), "audio/webm");
    assert.equal(get.headers.get("x-content-type-options"), "nosniff");
    assert.equal(get.headers.get("accept-ranges"), "bytes");
    assert.equal(await get.text(), "audio-bytes");
  } finally {
    await srv.close();
  }
});

test("another user can neither play nor overwrite the owner's recording, and sees 404", async () => {
  const srv = await startServer();
  try {
    await srv.call("/v1/recordings/sess_1", { user: "user_a", method: "POST", body: "owner-audio" });
    const get = await srv.call("/v1/recordings/sess_1", { user: "user_b" });
    assert.equal(get.status, 404);
    await srv.call("/v1/recordings/sess_1", { user: "user_b", method: "POST", body: "attacker-audio" });
    const owner = await srv.call("/v1/recordings/sess_1", { user: "user_a" });
    assert.equal(await owner.text(), "owner-audio");
    const share = await srv.call("/v1/recordings/sess_1/share", { user: "user_c", method: "POST" });
    assert.equal(share.status, 404);
  } finally {
    await srv.close();
  }
});

test("non-audio uploads are rejected with 415 and never stored", async () => {
  const srv = await startServer();
  try {
    const up = await srv.call("/v1/recordings/x", {
      user: "user_a",
      method: "POST",
      body: "<script>alert(1)</script>",
      type: "text/html",
    });
    assert.equal(up.status, 415);
    assert.equal(srv.s3.objects.size, 0);
  } finally {
    await srv.close();
  }
});

test("Range requests return 206 with Content-Range so the player can seek", async () => {
  const srv = await startServer();
  try {
    await srv.call("/v1/recordings/sess_1", { user: "user_a", method: "POST", body: "0123456789" });
    const get = await srv.call("/v1/recordings/sess_1", { user: "user_a", headers: { range: "bytes=2-5" } });
    assert.equal(get.status, 206);
    assert.equal(get.headers.get("content-range"), "bytes 2-5/10");
    assert.equal(get.headers.get("content-length"), "4");
    assert.equal(await get.text(), "2345");
  } finally {
    await srv.close();
  }
});

test("a share token grants play-only access to exactly that recording", async () => {
  const srv = await startServer();
  try {
    await srv.call("/v1/recordings/sess_1", { user: "user_a", method: "POST", body: "owner-audio" });
    const share = await srv.call("/v1/recordings/sess_1/share", { user: "user_a", method: "POST" });
    assert.equal(share.status, 201);
    const { url } = await share.json();
    assert.match(url, /^\/v1\/shared-recordings\/[A-Za-z0-9_-]{43}$/);

    const play = await srv.call(url);
    assert.equal(play.status, 200);
    assert.equal(play.headers.get("x-content-type-options"), "nosniff");
    assert.equal(await play.text(), "owner-audio");

    const guessed = await srv.call(`/v1/shared-recordings/${"A".repeat(43)}`);
    assert.equal(guessed.status, 404);
  } finally {
    await srv.close();
  }
});

test("a share token cannot overwrite the recording", async () => {
  const srv = await startServer();
  try {
    await srv.call("/v1/recordings/sess_1", { user: "user_a", method: "POST", body: "owner-audio" });
    const { url } = await (await srv.call("/v1/recordings/sess_1/share", { user: "user_a", method: "POST" })).json();
    const write = await srv.call(url, { method: "POST", body: "attacker-audio" });
    assert.equal(write.status, 404);
    const play = await srv.call(url);
    assert.equal(await play.text(), "owner-audio");
  } finally {
    await srv.close();
  }
});
