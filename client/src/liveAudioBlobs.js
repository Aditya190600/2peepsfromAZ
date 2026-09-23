// In-tab-only registry of upload blob URLs by sessionId. Blob URLs
// (URL.createObjectURL) die with the page/reload and were never persisted to
// history (only SAMPLE_AUDIO_URLS keys survive a reload) - this just lets
// SessionInspector find a still-live blob if the upload happened earlier in
// the same browser session, without inventing new storage.
const blobs = new Map();

export function registerLiveAudioBlob(sessionId, url) {
  if (!sessionId || !url) return;
  const previous = blobs.get(sessionId);
  if (previous && previous !== url) URL.revokeObjectURL(previous);
  blobs.set(sessionId, url);
}

export function getLiveAudioBlob(sessionId) {
  return blobs.get(sessionId) ?? null;
}
