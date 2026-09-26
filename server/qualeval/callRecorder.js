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

function buildMuLawDecodeTable() {
  const table = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    const muLawByte = ~i & 0xff;
    const sign = muLawByte & 0x80;
    const exponent = (muLawByte >> 4) & 0x07;
    const mantissa = muLawByte & 0x0f;
    let sample = ((mantissa << 3) + 0x84) << exponent;
    sample -= 0x84;
    table[i] = sign ? -sample : sample;
  }
  return table;
}

const MU_LAW_DECODE_TABLE = buildMuLawDecodeTable();

function decodeMuLaw(bytes) {
  const out = new Int16Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = MU_LAW_DECODE_TABLE[bytes[i]];
  return out;
}

function encodeWav(pcmData, sampleRate) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcmData.length, 40);
  return Buffer.concat([header, pcmData]);
}

// Buffers both call legs' decoded PCM into one mixed mono track, positioned
// by each frame's arrival offset (tMs since call start, the same clock
// bridgeSession.js uses for transcript turns) - an approximate wall-clock
// sync, not sample-accurate, but sufficient for a played-back call
// recording where both parties need to be audible together.
//
// Preallocated to maxDurationMs since bridgeSession.js already caps every
// call at that length (its maxDurationTimer forces session.end), so a fixed
// Int32Array avoids dynamic-growth bookkeeping for the accumulation buffer
// (int32 headroom absorbs the overlap of two mu-law legs summed before the
// final int16 clamp in toWavBuffer).
export function createCallRecorder(maxDurationMs) {
  const capacity = Math.ceil((maxDurationMs / 1000) * SAMPLE_RATE) + SAMPLE_RATE; // +1s pad
  const mix = new Int32Array(capacity);
  let maxIndex = -1;

  function addFrame(base64Payload, tMs) {
    if (!base64Payload) return;
    const bytes = Buffer.from(base64Payload, "base64");
    const samples = decodeMuLaw(bytes);
    const startIndex = Math.max(0, Math.round((tMs / 1000) * SAMPLE_RATE));
    for (let i = 0; i < samples.length; i++) {
      const idx = startIndex + i;
      if (idx >= capacity) break;
      mix[idx] += samples[i];
      if (idx > maxIndex) maxIndex = idx;
    }
  }

  function hasAudio() {
    return maxIndex >= 0;
  }

  function toWavBuffer() {
    const length = maxIndex + 1;
    const pcm = Buffer.alloc(length * 2);
    for (let i = 0; i < length; i++) {
      const clamped = Math.max(-32768, Math.min(32767, mix[i]));
      pcm.writeInt16LE(clamped, i * 2);
    }
    return encodeWav(pcm, SAMPLE_RATE);
  }

  return { addFrame, hasAudio, toWavBuffer };
}
