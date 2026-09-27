// Shared mu-law (PCMU, 8 kHz) helpers for QualEval's Twilio bridge and call
// recorder. Used by bridgeSession.js's silence watchdog and callRecorder.js's
// decode path.

export const SILENCE_AMPLITUDE_THRESHOLD = 200;

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

export function decodeMuLawBytes(bytes) {
  const out = new Int16Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = MU_LAW_DECODE_TABLE[bytes[i]];
  return out;
}

export function peakPcmuAmplitude(base64Payload) {
  if (!base64Payload) return 0;
  const bytes = Buffer.from(base64Payload, "base64");
  let peak = 0;
  for (let i = 0; i < bytes.length; i++) {
    const abs = Math.abs(MU_LAW_DECODE_TABLE[bytes[i]]);
    if (abs > peak) peak = abs;
  }
  return peak;
}
