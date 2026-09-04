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

async function uploadAudio(buffer, apiKey) {
  const resp = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: { Authorization: apiKey },
    body: buffer,
  });
  if (!resp.ok) throw new Error(`AssemblyAI upload failed: ${resp.status} ${await resp.text()}`);
  const { upload_url } = await resp.json();
  return upload_url;
}

async function submitTranscript(audioUrl, apiKey) {
  const resp = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ audio_url: audioUrl, speaker_labels: true }),
  });
  if (!resp.ok) throw new Error(`AssemblyAI transcript submit failed: ${resp.status} ${await resp.text()}`);
  const { id } = await resp.json();
  return id;
}

async function pollTranscript(id, apiKey) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const resp = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { Authorization: apiKey },
    });
    const body = await resp.json();
    if (body.status === "completed") return body;
    if (body.status === "error") throw new Error(`AssemblyAI transcription failed: ${body.error}`);
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("AssemblyAI transcription timed out");
}

// Diarization gives speaker labels ("A", "B", ...) with no inherent role.
// Heuristic: whichever speaker talks first is the agent (calls in this app
// always open with the agent's greeting/disclosure) - everyone else is "user".
function turnsFromUtterances(utterances) {
  if (utterances.length === 0) return [];
  const agentSpeaker = utterances[0].speaker;
  return utterances.map((u) => ({
    role: u.speaker === agentSpeaker ? "agent" : "user",
    text: u.text,
    tMs: u.start,
  }));
}

export async function transcribeUpload(buffer, apiKey) {
  const uploadUrl = await uploadAudio(buffer, apiKey);
  const transcriptId = await submitTranscript(uploadUrl, apiKey);
  const transcript = await pollTranscript(transcriptId, apiKey);
  return turnsFromUtterances(transcript.utterances ?? []);
}
