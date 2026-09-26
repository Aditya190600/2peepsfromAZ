export class ApiError extends Error {}

// AssemblyAI's LLM Gateway rate limit (~2 calls/30s) is easy to hit, and a
// rate-limited check comes back as a normal 200 response with a
// `status: "error"` finding (see server/checks/llmGateway.js's
// LlmGatewayRateLimitError, caught per-check in disclosureCheck.js/piiScan.js
// rather than thrown up to the route) - never an HTTP error `analyze()` would
// reject on. Callers must inspect the resolved report's findings.
export const GATEWAY_RATE_LIMIT_MESSAGE =
  "AssemblyAI's LLM Gateway rate limit was hit, so part of this report couldn't be generated. " +
  "Wait a minute or two and retry, avoid running many sessions or checks back-to-back, and if " +
  "this keeps happening, check your account's usage and plan limits on the AssemblyAI dashboard.";

export function findRateLimitedFinding(report) {
  return report?.findings?.find((f) => f.rateLimited) ?? null;
}

// onProgress(event), if given, requests the streamed (newline-delimited
// JSON) response instead of a single JSON body, and is called once per
// check as it completes with { finding, checksDone, checksTotal } - finding
// is the actual, full finding object (same shape as one entry of the final
// report's findings array), not just a status flag, so a caller can render
// each check's detail as soon as it lands instead of waiting for every
// check (including the slowest one) to finish - see server/index.js's
// stream=true branch of /v1/analyze-session. Resolves to the same report
// shape either way.
export async function analyze(session, patternPackIds, onProgress) {
  const resp = await fetch("/v1/analyze-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session, patternPackIds, stream: Boolean(onProgress) }),
  });
  if (!resp.ok) {
    throw new ApiError(
      resp.status >= 500
        ? "The compliance server hit an error analyzing this session. Please try again."
        : "This session couldn't be analyzed - check that it has a valid transcript and try again."
    );
  }
  if (!onProgress) return resp.json();
  return readNdjsonReport(resp, onProgress);
}

async function readNdjsonReport(resp, onProgress) {
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line) continue;
      const event = JSON.parse(line);
      if (event.type === "progress") onProgress(event);
      else if (event.type === "done") return event.report;
      else if (event.type === "error") throw new ApiError(event.error);
    }
  }
  throw new ApiError("The compliance server closed the connection before the analysis finished.");
}

// Exercises the real webhook/ingest path (POST /v1/ingest/:apiKey) a
// customer integration would use, instead of the direct /v1/analyze-session
// call. Acks immediately with {ok:true}; the report is generated
// asynchronously server-side, so there is no report to return here.
export async function ingestSession(apiKey, session) {
  const resp = await fetch(`/v1/ingest/${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session }),
  });
  let body;
  try {
    body = await resp.json();
  } catch {
    throw new ApiError("The compliance server is unreachable right now. Please try again shortly.");
  }
  if (!resp.ok) throw new ApiError(body.error ?? "Webhook ingest failed. Please try again.");
  return body;
}

// Fallback for pasted text that isn't strict session JSON - parseSessionPaste
// (sessionPaste.js) already tried a cheap client-side JSON.parse first; this
// hits the LLM Gateway server-side to extract a session from arbitrary text.
export async function llmParsePastedSession(text) {
  const resp = await fetch("/v1/parse-pasted-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  let body;
  try {
    body = await resp.json();
  } catch {
    throw new ApiError("The compliance server is unreachable right now. Please try again shortly.");
  }
  if (!resp.ok) throw new ApiError(body.error ?? "Could not parse this paste. Please try again.");
  return body.session;
}

// Examples page counterpart to transcribeUpload + analyze: transcribes one
// of the fixed playable sample mp3s and analyzes the result in one
// unauthenticated (zero-setup) round trip via /v1/examples/diarize/:key,
// since it only ever reads a known sample file server-side, never a
// client-uploaded one or a client-supplied session. Resolves to
// { session, report }.
export async function diarizeSample(key, patternPackIds) {
  const resp = await fetch(`/v1/examples/diarize/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patternPackIds }),
  });
  let body;
  try {
    body = await resp.json();
  } catch {
    throw new ApiError("The compliance server is unreachable right now. Please try again shortly.");
  }
  if (!resp.ok) throw new ApiError(body.error ?? "Transcription failed. Please try again.");
  return body;
}

export async function transcribeUpload(file) {
  const resp = await fetch("/v1/transcribe-upload", {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  let body;
  try {
    body = await resp.json();
  } catch {
    throw new ApiError("The compliance server is unreachable right now. Please try again shortly.");
  }
  if (!resp.ok) throw new ApiError(body.error ?? "Transcription failed. Please try again.");
  return body;
}

// Persists a recorded live call to the Railway bucket (server/recordingsStore.js).
// Rejects (with the server's message) when the bucket isn't configured -
// callers should catch this and fall back to the in-memory blob URL, not
// surface it as a hard error.
export async function uploadRecording(sessionId, blob) {
  const resp = await fetch(`/v1/recordings/${encodeURIComponent(sessionId)}`, {
    method: "POST",
    headers: { "Content-Type": blob.type || "audio/webm" },
    body: blob,
  });
  let body;
  try {
    body = await resp.json();
  } catch {
    throw new ApiError("The compliance server is unreachable right now.");
  }
  if (!resp.ok) throw new ApiError(body.error ?? "Recording upload failed.");
  return body.url;
}

// Mints a play-only share link for the caller's own bucket recording
// (server/recordingsStore.js). Returns the link's path.
export async function shareRecording(sessionId) {
  const resp = await fetch(`/v1/recordings/${encodeURIComponent(sessionId)}/share`, { method: "POST" });
  let body;
  try {
    body = await resp.json();
  } catch {
    throw new ApiError("The compliance server is unreachable right now.");
  }
  if (!resp.ok) throw new ApiError(body.error ?? "Share link creation failed.");
  return body.url;
}

export async function mapWithConcurrency(items, limit, fn, onProgress) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
      done += 1;
      onProgress?.(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
