import { decodeMuLawBytes } from "./pcmuAudio.js";

const SAMPLE_RATE = 8000;

// Shared by server/qualeval/twilioStream.js (upload) and
// server/qualeval/router.js (serve) - a leaf module so both can import it
// without router.js <-> twilioStream.js becoming a cycle (twilioStream.js
// already imports dispatchEvaluation from router.js).
export function qualevalCallAudioKey(runId) {
  return `qualeval-calls/${encodeURIComponent(runId)}.wav`;
}

// Inbound calls to QUALEVAL_AGENT_NUMBER have no QualEval run id. Key them
// by the Twilio Call SID, which is what production_calls is unique on.
export function productionCallAudioKey(callSid) {
  return `production-calls/${encodeURIComponent(callSid)}.wav`;
}

function encodeWav(pcmData, sampleRate, channels = 1) {
  const header = Buffer.alloc(44);
  const blockAlign = channels * 2;
  const byteRate = sampleRate * blockAlign;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcmData.length, 40);
  return Buffer.concat([header, pcmData]);
}

// Records both call legs into one mixed mono track. Each leg has its own
// buffer and every frame is written at the position bridgeSession.js
// reports on the call timeline (see its callClockMs), so one leg's frames
// never sum into each other - only the two legs are summed, in
// toWavBuffer.
//
// Frames used to be summed into a single buffer at their wall-clock arrival
// time. Reproduced on a real call 2026-09-27: Twilio's 20 ms media frames
// for the target agent arrive with ~0.5 s of network jitter, so about half
// of them landed on top of the previous frame, leaving ~18% of the agent's
// speech as dropped-out gaps and ~7% doubled (and buffered frames replayed
// after setup all stacked at t=0) - the agent side played back choppy next
// to the caller side. Positioning by the media's own timeline
// removes both.
//
// Preallocated to maxDurationMs since bridgeSession.js already caps every
// call at that length (its maxDurationTimer forces session.end).
export function createCallRecorder(maxDurationMs) {
  const capacity = Math.ceil((maxDurationMs / 1000) * SAMPLE_RATE) + SAMPLE_RATE; // +1s pad
  const tracks = {
    incoming: { samples: new Int16Array(capacity), end: 0 },
    outgoing: { samples: new Int16Array(capacity), end: 0 },
  };

  function indexAt(tMs) {
    return Math.min(capacity, Math.max(0, Math.round((tMs / 1000) * SAMPLE_RATE)));
  }

  function write(track, base64Payload, tMs) {
    if (!base64Payload) return;
    const samples = decodeMuLawBytes(Buffer.from(base64Payload, "base64"));
    const startIndex = indexAt(tMs);
    const fitted = samples.subarray(0, Math.max(0, capacity - startIndex));
    if (fitted.length === 0) return;
    track.samples.set(fitted, startIndex);
    track.end = Math.max(track.end, startIndex + fitted.length);
  }

  // Barge-in: Twilio discarded every outgoing frame it had not played yet,
  // so drop whatever this leg had queued past that point.
  function clearOutgoingFrom(tMs) {
    const track = tracks.outgoing;
    const from = indexAt(tMs);
    if (from >= track.end) return;
    track.samples.fill(0, from, track.end);
    track.end = from;
  }

  function hasAudio() {
    return tracks.incoming.end > 0 || tracks.outgoing.end > 0;
  }

  function toWavBuffer() {
    const length = Math.max(tracks.incoming.end, tracks.outgoing.end);
    const pcm = Buffer.alloc(length * 2);
    for (let i = 0; i < length; i++) {
      const mixed = tracks.incoming.samples[i] + tracks.outgoing.samples[i];
      pcm.writeInt16LE(Math.max(-32768, Math.min(32767, mixed)), i * 2);
    }
    return encodeWav(pcm, SAMPLE_RATE);
  }

  // Stereo WAV for waveform playback: channel 0 = caller/user, channel 1 =
  // agent. On the inbound target-agent leg incoming is the caller and
  // outgoing is the agent; on the outbound persona leg those are swapped.
  function toStereoWavBuffer({ userTrackName = "incoming", agentTrackName = "outgoing" } = {}) {
    const userTrack = tracks[userTrackName];
    const agentTrack = tracks[agentTrackName];
    const length = Math.max(userTrack.end, agentTrack.end);
    const pcm = Buffer.alloc(length * 4);
    for (let i = 0; i < length; i++) {
      pcm.writeInt16LE(userTrack.samples[i] ?? 0, i * 4);
      pcm.writeInt16LE(agentTrack.samples[i] ?? 0, i * 4 + 2);
    }
    return encodeWav(pcm, SAMPLE_RATE, 2);
  }

  return {
    addIncomingFrame: (base64Payload, tMs) => write(tracks.incoming, base64Payload, tMs),
    addOutgoingFrame: (base64Payload, tMs) => write(tracks.outgoing, base64Payload, tMs),
    clearOutgoingFrom,
    hasAudio,
    toWavBuffer,
    toStereoWavBuffer,
  };
}
