// Second transcriber vendor, per the provider-swaps PRD ("Deepgram
// preferred ... or a documented stub with tests that lock the interface").
// This account has no Deepgram key to verify against live - unlike the
// AssemblyAI integration (see AGENTS.md's live-docs convention), this shape
// is built from Deepgram's public pre-recorded /v1/listen documentation
// (diarize=true&utterances=true -> results.utterances[] of {speaker,
// transcript, start, end}, start/end in seconds) and is NOT verified against
// a real call. Treat it as unverified until exercised with a real key; what
// the registry actually depends on is the locked interface below
// (transcribe(buffer) -> turns[]), covered by transcriberDeepgram.test.js.
import { getCredential } from "./store.js";

const DEEPGRAM_URL =
  "https://api.deepgram.com/v1/listen?diarize=true&utterances=true&smart_format=true";

// Diarization gives speaker labels with no inherent role. Same heuristic as
// the AssemblyAI adapter: whichever speaker talks first is the agent.
export function turnsFromUtterances(utterances) {
  if (!Array.isArray(utterances) || utterances.length === 0) return [];
  const agentSpeaker = utterances[0].speaker;
  return utterances.map((u) => ({
    role: u.speaker === agentSpeaker ? "agent" : "user",
    text: u.transcript,
    tMs: Math.round((u.start ?? 0) * 1000),
  }));
}

export async function transcribe(buffer) {
  const credential = getCredential("deepgram");
  if (!credential?.apiKey) {
    throw new Error("Deepgram is selected as the transcriber but no API key is configured.");
  }
  const resp = await fetch(DEEPGRAM_URL, {
    method: "POST",
    headers: { Authorization: `Token ${credential.apiKey}`, "Content-Type": "audio/*" },
    body: buffer,
  });
  if (!resp.ok) {
    throw new Error(`Deepgram transcription failed: ${resp.status} ${await resp.text()}`);
  }
  const body = await resp.json();
  return turnsFromUtterances(body?.results?.utterances ?? []);
}
