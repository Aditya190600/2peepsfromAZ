import { transcribeAudio } from "../checks/transcribeUpload.js";

// The transcript a call is judged on, built from the call's own recording
// rather than from the live Voice Agent session that took part in it.
//
// That session's transcript events describe the conversation as the session
// saw it, which is not what went over the phone line whenever the two
// parties overlapped (reproduced on real calls 2026-09-27, compared against
// Twilio's own dual-channel recording of each call):
// - The far end's words spoken while the session was starting or giving a
//   reply come back dropped or misheard - "Can I get your name to get
//   started?" arrived as "Can I get your name started?" and as "Can I get you
//   a doctor?" - so a question the target agent really asked went missing
//   and was judged as never asked.
// - transcript.agent carries the reply text the session generated, trimmed
//   only to what it had already sent when interrupted. It sends audio faster
//   than real time and Twilio discards everything it had not played yet on a
//   barge-in "clear", so replies that were never heard ("Good. Then we don't
//   have anything else to talk about.") still showed up as spoken.
//
// The call recorder (server/qualeval/callRecorder.js) holds each leg
// separately, exactly as the phone line carried it, on the same timeline as
// the recording. Pre-recorded multichannel transcription of that stereo
// audio transcribes each leg on its own, so overlapping speech is kept in
// full on both sides, and utterance start times give each turn's real
// position in the call.
//
// Channel 1 is the recorder's incoming leg (the far end), channel 2 its
// outgoing leg (this bridge's own AssemblyAI session, as Twilio played it).
export function turnsFromChannelUtterances(utterances, { incomingRole, outgoingRole }) {
  const roleByChannel = { 1: incomingRole, 2: outgoingRole };
  return (utterances ?? [])
    .map((u) => ({ role: roleByChannel[u.channel], text: (u.text ?? "").trim(), tMs: u.start ?? 0 }))
    .filter((turn) => turn.role && turn.text)
    .sort((a, b) => a.tMs - b.tMs);
}

// How long a finished call's run may wait on its recording's transcript
// before falling back to the live session's turns. The run stays
// in_progress meanwhile, so this is part of store.js's
// STALE_RUN_AFTER_MS.in_progress budget.
export const CALL_TRANSCRIPTION_TIMEOUT_MS = 90 * 1000;

export async function transcribeCallRecording(
  recorder,
  { apiKey, incomingRole, outgoingRole, timeoutMs = CALL_TRANSCRIPTION_TIMEOUT_MS, ...transcribeOptions },
) {
  const transcript = await transcribeAudio(
    recorder.toStereoWavBuffer(),
    apiKey,
    { multichannel: true },
    { timeoutMs, ...transcribeOptions },
  );
  return turnsFromChannelUtterances(transcript.utterances, { incomingRole, outgoingRole });
}
