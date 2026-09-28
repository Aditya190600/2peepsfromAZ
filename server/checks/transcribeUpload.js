// Transcribes an uploaded audio file into a session shape the existing
// analyzeSession pipeline already understands: {turns: [{role, text, tMs}]}.
// Uses AssemblyAI's pre-recorded Speech-to-Text API (POST /v2/upload,
// POST /v2/transcript, GET /v2/transcript/{id}) - a different product from
// the Voice Agent API used for live calls, but still AssemblyAI-only.
// Verified against https://www.assemblyai.com/docs/llms-full.txt 2026-09-04:
// utterances[] items are {speaker, text, start, end} with start/end in ms.
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadAudio(buffer, apiKey, fetchImpl) {
  const resp = await fetchImpl("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: { Authorization: apiKey },
    body: buffer,
  });
  if (!resp.ok) throw new Error(`AssemblyAI upload failed: ${resp.status} ${await resp.text()}`);
  const { upload_url } = await resp.json();
  return upload_url;
}

async function submitTranscript(audioUrl, apiKey, options, fetchImpl) {
  const resp = await fetchImpl("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ audio_url: audioUrl, ...options }),
  });
  if (!resp.ok) throw new Error(`AssemblyAI transcript submit failed: ${resp.status} ${await resp.text()}`);
  const { id } = await resp.json();
  return id;
}

async function pollTranscript(id, apiKey, { fetchImpl, pollIntervalMs, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const resp = await fetchImpl(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { Authorization: apiKey },
    });
    const body = await resp.json();
    if (body.status === "completed") return body;
    if (body.status === "error") throw new Error(`AssemblyAI transcription failed: ${body.error}`);
    await sleep(pollIntervalMs);
  }
  throw new Error("AssemblyAI transcription timed out");
}

// Uploads `buffer` and runs one pre-recorded transcription with the given
// request `options` (e.g. {speaker_labels: true}), resolving the completed
// transcript body. Shared with server/qualeval/callTranscription.js.
export async function transcribeAudio(
  buffer,
  apiKey,
  options,
  { fetchImpl = globalThis.fetch, pollIntervalMs = POLL_INTERVAL_MS, timeoutMs = POLL_TIMEOUT_MS } = {},
) {
  const uploadUrl = await uploadAudio(buffer, apiKey, fetchImpl);
  const transcriptId = await submitTranscript(uploadUrl, apiKey, options, fetchImpl);
  return pollTranscript(transcriptId, apiKey, { fetchImpl, pollIntervalMs, timeoutMs });
}

// Diarization gives speaker labels ("A", "B", ...) with no inherent role.
// Heuristic: whichever speaker talks first is the agent (calls in this app
// always open with the agent's greeting/disclosure) - everyone else is "user".
// Exported so unit tests can cover the mapping without hitting the network.
export function turnsFromUtterances(utterances) {
  if (!Array.isArray(utterances) || utterances.length === 0) return [];
  const agentSpeaker = utterances[0].speaker;
  return utterances.map((u) => ({
    role: u.speaker === agentSpeaker ? "agent" : "user",
    text: u.text,
    tMs: u.start ?? 0,
  }));
}

export async function transcribeUpload(buffer, apiKey) {
  // Demo call audio is always a 2-party agent/user exchange. Without
  // speakers_expected, AssemblyAI often collapses distinct TTS voices into a
  // single utterance (verified live 2026-09-08 on the sample MP3s) — which
  // zeroes out disclosure timing and clickable finding timestamps. Pinning
  // the expected count is a hard boundary, not a hint; see
  // https://www.assemblyai.com/docs/pre-recorded-audio/label-speakers
  const transcript = await transcribeAudio(buffer, apiKey, { speaker_labels: true, speakers_expected: 2 });
  return turnsFromUtterances(transcript.utterances ?? []);
}
