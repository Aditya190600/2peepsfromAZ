import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

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

function recordingKey(sessionId) {
  return `live-calls/${sessionId}.webm`;
}

export async function uploadRecording(sessionId, body, contentType, env = process.env, s3 = getClient(env)) {
  if (!s3) throw new Error("Recordings storage is not configured.");
  const key = recordingKey(sessionId);
  await s3.send(
    new PutObjectCommand({
      Bucket: env.RECORDINGS_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType || "audio/webm",
    })
  );
  return key;
}

export async function getRecording(sessionId, env = process.env, s3 = getClient(env)) {
  if (!s3) return null;
  const key = recordingKey(sessionId);
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: env.RECORDINGS_BUCKET, Key: key }));
    return { body: result.Body, contentType: result.ContentType || "audio/webm" };
  } catch (err) {
    if (err.name === "NoSuchKey") return null;
    throw err;
  }
}
