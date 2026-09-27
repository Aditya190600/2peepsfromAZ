export const WAVEFORM_BUCKETS = 240;

function peaksForChannel(audioBuffer, channelIndex, buckets = WAVEFORM_BUCKETS) {
  const data = audioBuffer.getChannelData(channelIndex);
  const length = data.length;
  const bucketSize = Math.max(1, Math.floor(length / buckets));
  const peaks = new Array(buckets).fill(0);
  for (let b = 0; b < buckets; b++) {
    const start = b * bucketSize;
    const end = Math.min(length, start + bucketSize);
    let peak = 0;
    for (let i = start; i < end; i++) {
      const sample = Math.abs(data[i]);
      if (sample > peak) peak = sample;
    }
    peaks[b] = peak;
  }
  const max = Math.max(...peaks, 0.0001);
  return peaks.map((p) => p / max);
}

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
  return null;
}

// Channels closer than this are one upmixed signal (a live-call MediaRecorder
// blob or a typical stereo upload), not a speaker-separated recording.
// QualEval/Phone Evals WAVs sit well above it: one channel is the caller and
// the other is the agent, so they differ wherever only one side is speaking.
const SAME_SIGNAL_DIFF_RATIO = 0.08;

function channelsCarrySameSignal(audioBuffer) {
  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.getChannelData(1);
  const length = Math.min(left.length, right.length);
  if (!length) return true;
  const step = Math.max(1, Math.floor(length / 4096));
  let diff = 0;
  let energy = 0;
  for (let i = 0; i < length; i += step) {
    const l = left[i];
    const r = right[i];
    diff += Math.abs(l - r);
    energy += Math.abs(l) + Math.abs(r);
  }
  if (energy < 1e-6) return true;
  return diff / energy < SAME_SIGNAL_DIFF_RATIO;
}

// Splits mono peaks into agent/user tracks using turn intervals. Without turns,
// agent gets the full mono waveform and user stays silent (dotted baseline only).
// `offsetMs` maps session-relative turn times onto the file: a live recording
// starts after connect, so buffer time 0 is session time `offsetMs`.
export function computeDualPeaks(audioBuffer, turns, buckets = WAVEFORM_BUCKETS, durationSec, offsetMs = 0) {
  // QualEval/Phone Evals recordings are speaker-separated stereo: channel 0 =
  // caller/user, channel 1 = agent. Live-call blobs and mixed uploads are also
  // stereo, with the same mix copied onto both channels, so only trust the
  // split when the two channels actually differ.
  if (audioBuffer.numberOfChannels >= 2 && !channelsCarrySameSignal(audioBuffer)) {
    return {
      user: peaksForChannel(audioBuffer, 0, buckets),
      agent: peaksForChannel(audioBuffer, 1, buckets),
    };
  }

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
    else if (role === "agent") agent[b] = peak;
  }
  return { agent, user };
}
