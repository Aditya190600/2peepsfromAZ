export const WAVEFORM_BUCKETS = 240;

// Downsamples a decoded AudioBuffer into `buckets` peak-amplitude values (0..1),
// mixing all channels down to mono first.
export function computePeaks(audioBuffer, buckets = WAVEFORM_BUCKETS) {
  const channels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const bucketSize = Math.max(1, Math.floor(length / buckets));
  const peaks = new Array(buckets).fill(0);
  const channelData = [];
  for (let c = 0; c < channels; c++) channelData.push(audioBuffer.getChannelData(c));
  for (let b = 0; b < buckets; b++) {
    const start = b * bucketSize;
    const end = Math.min(length, start + bucketSize);
    let peak = 0;
    for (let i = start; i < end; i++) {
      let sample = 0;
      for (let c = 0; c < channels; c++) sample += Math.abs(channelData[c][i]);
      sample /= channels;
      if (sample > peak) peak = sample;
    }
    peaks[b] = peak;
  }
  const max = Math.max(...peaks, 0.0001);
  return peaks.map((p) => p / max);
}

function roleAtTime(turns, tMs) {
  if (!turns?.length) return null;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (tMs >= turns[i].tMs) return turns[i].role;
  }
  return turns[0].role;
}

// Splits mono peaks into agent/user tracks using turn intervals. Without turns,
// agent gets the full mono waveform and user stays silent (dotted baseline only).
// `offsetMs` maps session-relative turn times onto the file: a live recording
// starts after connect, so buffer time 0 is session time `offsetMs`.
export function computeDualPeaks(audioBuffer, turns, buckets = WAVEFORM_BUCKETS, durationSec, offsetMs = 0) {
  const mono = computePeaks(audioBuffer, buckets);
  const duration = durationSec ?? audioBuffer.duration;
  if (!turns?.length) {
    return { agent: mono, user: new Array(buckets).fill(0) };
  }

  const agent = new Array(buckets).fill(0);
  const user = new Array(buckets).fill(0);
  const bucketMs = (duration * 1000) / buckets;
  const shift = Number.isFinite(offsetMs) ? offsetMs : 0;

  for (let b = 0; b < buckets; b++) {
    const midMs = (b + 0.5) * bucketMs + shift;
    const role = roleAtTime(turns, midMs);
    const peak = mono[b];
    if (role === "user") user[b] = peak;
    else agent[b] = peak;
  }
  return { agent, user };
}
