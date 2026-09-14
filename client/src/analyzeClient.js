export class ApiError extends Error {}

export async function fetchBootStatus() {
  try {
    const resp = await fetch("/v1/boot-status");
    if (!resp.ok) return null;
    return resp.json();
  } catch {
    return null;
  }
}

export async function analyze(session, patternPackIds) {
  const resp = await fetch("/v1/analyze-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session, patternPackIds }),
  });
  if (!resp.ok) {
    throw new ApiError(
      resp.status >= 500
        ? "The compliance server hit an error analyzing this session. Please try again."
        : "This session couldn't be analyzed - check that it has a valid transcript and try again."
    );
  }
  return resp.json();
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
