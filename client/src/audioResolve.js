import { SAMPLE_AUDIO_URLS } from "./sampleSessions.js";
import { getLiveAudioBlob } from "./liveAudioBlobs.js";

// Resolution order for SessionInspector's Call tab: a bucket-persisted
// recording (durable, see server/recordingsStore.js) beats a playable
// sample's audioKey, which beats the in-tab-only blob registry (dies on
// reload) - see AGENTS.md's SessionInspector.jsx section.
export function resolveAudioUrl(entry) {
  if (!entry) return null;
  if (entry.recordingUrl) return entry.recordingUrl;
  if (entry.audioKey) return SAMPLE_AUDIO_URLS[entry.audioKey] ?? null;
  return getLiveAudioBlob(entry.sessionId);
}
