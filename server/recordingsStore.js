import { createHash, randomBytes } from "node:crypto";
import { pipeline } from "node:stream";
import express from "express";
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

let client;

// Railway auto-injects these once the bucket ("storage") is linked to this
// service via ${{storage.VAR}} references (see AGENTS.md / PR for the exact
// `railway variable set` calls) - same opt-in-by-env-presence pattern as
// server/db.js's DATABASE_URL. Unset (local dev, no bucket linked), the
// caller degrades to client-only blob playback.
export function recordingsConfigured(env = process.env) {
  return Boolean(
    env.RECORDINGS_BUCKET &&
      env.RECORDINGS_BUCKET_ENDPOINT &&
      env.RECORDINGS_BUCKET_ACCESS_KEY_ID &&
      env.RECORDINGS_BUCKET_SECRET_ACCESS_KEY
  );
}

function getClient(env = process.env) {
  if (!recordingsConfigured(env)) return null;
  if (!client) {
    client = new S3Client({
      region: env.RECORDINGS_BUCKET_REGION || "auto",
      endpoint: env.RECORDINGS_BUCKET_ENDPOINT,
      credentials: {
        accessKeyId: env.RECORDINGS_BUCKET_ACCESS_KEY_ID,
        secretAccessKey: env.RECORDINGS_BUCKET_SECRET_ACCESS_KEY,
      },
      // Railway Buckets run on Tigris and use virtual-hosted-style URLs for
      // any bucket created after the switch (verified live against docs.railway.com/storage-buckets).
      forcePathStyle: false,
    });
  }
  return client;
}

// The owner (visitorId) is part of the key, so a request from anyone else
// resolves to a different key: they can neither read nor overwrite it, and
// a miss looks identical to "never recorded" (404, no existence leak).
function recordingKey(owner, sessionId) {
  return `live-calls/${encodeURIComponent(owner)}/${sessionId}.webm`;
}

// Only a hash of a share token is stored, same as server/apiKeys.js.
function shareKey(token) {
  return `recording-shares/${createHash("sha256").update(token).digest("hex")}.json`;
}

function isNotFound(err) {
  return err.name === "NoSuchKey" || err.name === "NotFound" || err.$metadata?.httpStatusCode === 404;
}

export function isAudioContentType(contentType) {
  return /^audio\/[a-z0-9.+-]+(\s*;.*)?$/i.test(contentType ?? "");
}

export async function uploadRecording(owner, sessionId, body, contentType, env = process.env, s3 = getClient(env)) {
  if (!s3) throw new Error("Recordings storage is not configured.");
  if (!isAudioContentType(contentType)) throw new Error("Recording must have an audio content type.");
  const key = recordingKey(owner, sessionId);
  await s3.send(
    new PutObjectCommand({
      Bucket: env.RECORDINGS_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return key;
}

async function getObject(key, range, env, s3) {
  if (!s3) return null;
  try {
    const result = await s3.send(
      new GetObjectCommand({ Bucket: env.RECORDINGS_BUCKET, Key: key, ...(range ? { Range: range } : {}) })
    );
    return {
      body: result.Body,
      contentType: isAudioContentType(result.ContentType) ? result.ContentType : "audio/webm",
      contentLength: result.ContentLength,
      contentRange: result.ContentRange,
    };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export function getRecording(owner, sessionId, range, env = process.env, s3 = getClient(env)) {
  return getObject(recordingKey(owner, sessionId), range, env, s3);
}

// Mints a play-only share token for the owner's own recording. Returns null
// when the owner has no recording under that sessionId.
export async function createShareToken(owner, sessionId, env = process.env, s3 = getClient(env)) {
  if (!s3) return null;
  const key = recordingKey(owner, sessionId);
  try {
    await s3.send(new HeadObjectCommand({ Bucket: env.RECORDINGS_BUCKET, Key: key }));
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
  const token = randomBytes(32).toString("base64url");
  await s3.send(
    new PutObjectCommand({
      Bucket: env.RECORDINGS_BUCKET,
      Key: shareKey(token),
      Body: JSON.stringify({ key }),
      ContentType: "application/json",
    })
  );
  return token;
}

export async function getSharedRecording(token, range, env = process.env, s3 = getClient(env)) {
  if (!s3) return null;
  let share;
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: env.RECORDINGS_BUCKET, Key: shareKey(token) }));
    share = JSON.parse(await result.Body.transformToString());
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
  return getObject(share.key, range, env, s3);
}

const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;
const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function sendRecording(res, recording) {
  res.status(recording.contentRange ? 206 : 200);
  res.setHeader("Content-Type", recording.contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Accept-Ranges", "bytes");
  if (recording.contentLength != null) res.setHeader("Content-Length", recording.contentLength);
  if (recording.contentRange) res.setHeader("Content-Range", recording.contentRange);
  pipeline(recording.body, res, (err) => {
    if (err && err.code !== "ERR_STREAM_PREMATURE_CLOSE") console.log(`Recording stream failed: ${err.message}`);
  });
}

function sendFetchError(res, err) {
  if (err.$metadata?.httpStatusCode === 416) return res.status(416).end();
  res.status(502).json({ error: `Recording fetch failed: ${err.message}` });
}

// Owner-scoped recording routes. `requireVisitor`/`visitorId` are the same
// Clerk-or-anon pair server/index.js uses everywhere else; `s3` is injectable
// for tests (server/recordingsStore.test.js).
export function recordingsRouter({ requireVisitor, visitorId, env = process.env, s3 = getClient(env) }) {
  const router = express.Router();

  router.param("sessionId", (req, res, next, sessionId) => {
    if (!SESSION_ID_RE.test(sessionId)) return res.status(400).json({ error: "invalid session id" });
    next();
  });

  // Persists a live-call recording (opt-in `recordCall` in the Try page) to
  // the Railway bucket so it survives reload and plays back in the report.
  // When the bucket isn't configured (local dev), this 503s and the client
  // falls back to the in-memory blob it already has.
  router.post(
    "/v1/recordings/:sessionId",
    requireVisitor,
    (req, res, next) => {
      if (!isAudioContentType(req.headers["content-type"])) {
        return res.status(415).json({ error: "recording must have an audio content type" });
      }
      next();
    },
    express.raw({ type: () => true, limit: "25mb" }),
    async (req, res) => {
      const { sessionId } = req.params;
      if (!s3) {
        console.log(`Recordings storage not configured - skipping bucket upload for ${sessionId}.`);
        return res.status(503).json({ error: "Recordings storage is not configured." });
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: "recording body is required" });
      }
      try {
        await uploadRecording(visitorId(req), sessionId, req.body, req.headers["content-type"], env, s3);
        res.status(201).json({ url: `/v1/recordings/${encodeURIComponent(sessionId)}` });
      } catch (err) {
        res.status(502).json({ error: `Recording upload failed: ${err.message}` });
      }
    }
  );

  router.get("/v1/recordings/:sessionId", requireVisitor, async (req, res) => {
    try {
      const recording = await getRecording(visitorId(req), req.params.sessionId, req.headers.range, env, s3);
      if (!recording) return res.status(404).json({ error: "Recording not found." });
      sendRecording(res, recording);
    } catch (err) {
      sendFetchError(res, err);
    }
  });

  router.post("/v1/recordings/:sessionId/share", requireVisitor, async (req, res) => {
    try {
      const token = await createShareToken(visitorId(req), req.params.sessionId, env, s3);
      if (!token) return res.status(404).json({ error: "Recording not found." });
      res.status(201).json({ url: `/v1/shared-recordings/${token}` });
    } catch (err) {
      res.status(502).json({ error: `Share link creation failed: ${err.message}` });
    }
  });

  // Play-only: anyone holding the token can stream the one recording it
  // points at. There is deliberately no write route on this path.
  router.get("/v1/shared-recordings/:token", async (req, res) => {
    if (!SHARE_TOKEN_RE.test(req.params.token)) return res.status(404).json({ error: "Recording not found." });
    try {
      const recording = await getSharedRecording(req.params.token, req.headers.range, env, s3);
      if (!recording) return res.status(404).json({ error: "Recording not found." });
      sendRecording(res, recording);
    } catch (err) {
      sendFetchError(res, err);
    }
  });

  return router;
}
