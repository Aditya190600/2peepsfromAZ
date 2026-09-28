// Live listen-in for an in-progress QualEval call: consumes the server's
// GET /v1/qualeval/runs/:id/live Server-Sent Events stream (server/qualeval/
// router.js, fed by server/qualeval/liveCallHub.js) and plays both sides of
// the call through the Web Audio API as frames arrive.
//
// Frames are raw G.711 mu-law at 8 kHz - Twilio Media Streams' native codec,
// relayed untouched by the call bridge - on two tracks: "agent" (the target
// agent under test, heard over the phone) and "caller" (the simulated
// caller's own synthesized speech).

export const SAMPLE_RATE = 8000;
export const LIVE_AUDIO_STORAGE_KEY = "qualeval_live_audio_v1";

// Off unless the viewer opted in: a page running many scenarios in
// parallel shouldn't open every call's audio stream at once.
export function getLiveAudioPreference(storage = globalThis.localStorage) {
  try {
    return storage.getItem(LIVE_AUDIO_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function setLiveAudioPreference(on, storage = globalThis.localStorage) {
  try {
    storage.setItem(LIVE_AUDIO_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // private window/blocked storage - the toggle still works for this page
  }
}

const MU_LAW_DECODE_TABLE = (() => {
  const table = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const muLawByte = ~i & 0xff;
    const exponent = (muLawByte >> 4) & 0x07;
    const mantissa = muLawByte & 0x0f;
    const magnitude = (((mantissa << 3) + 0x84) << exponent) - 0x84;
    table[i] = ((muLawByte & 0x80 ? -magnitude : magnitude) / 32768);
  }
  return table;
})();

export function decodeMuLawBase64(base64) {
  const binary = atob(base64);
  const out = new Float32Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = MU_LAW_DECODE_TABLE[binary.charCodeAt(i)];
  return out;
}

// Decides when each frame plays. Both tracks share one clock anchored to the
// call's own tMs (the same offset the transcript and recording use), so the
// two sides stay in step; each track also has its own cursor so frames that
// arrive a little bunched up queue back to back instead of overlapping.
//
// Listening live means staying near the live edge, not hearing every frame:
// - A frame that would already be late (network hiccup) pushes the shared
//   clock forward rather than being dropped.
// - Once the clock runs more than maxLeadSec ahead of now, it re-anchors to
//   leadSec, so repeated hiccups don't add up over a long call.
// - When a track's queue runs more than maxBacklogSec past where the current
//   frame belongs, that queue is stale - a proxy held the stream back and
//   then released seconds of audio at once (reproduced live through a
//   Cloudflare tunnel: ~6.5 s of frames in one burst, which left playback
//   ~9 s behind the call for the rest of it). The track drops its queue
//   (`flush: true`) and resumes at the live edge. Both sides' audio arrives
//   close to real time from the bridge itself (Twilio media in 20 ms
//   frames, AssemblyAI reply.audio in ~40 ms chunks), so a real backlog
//   this size never comes from the call.
// Every start lands exactly on a SAMPLE_RATE sample, so back-to-back frames
// abut sample for sample in the 8 kHz context listenToLiveCall plays them
// through (see there).
export function createLiveScheduler({ leadSec = 0.25, minLeadSec = 0.05, maxLeadSec = 1, maxBacklogSec = 1.5 } = {}) {
  let offsetSec = null; // context time = tMs/1000 + offsetSec
  const cursors = { agent: 0, caller: 0 };
  const onSampleGrid = (sec) => Math.round(sec * SAMPLE_RATE) / SAMPLE_RATE;

  function schedule(track, tMs, durationSec, nowSec) {
    if (offsetSec === null || tMs / 1000 + offsetSec > nowSec + maxLeadSec) {
      offsetSec = nowSec + leadSec - tMs / 1000;
    }
    let position = tMs / 1000 + offsetSec;
    const earliest = nowSec + minLeadSec;
    if (position < earliest) {
      offsetSec += earliest - position;
      position = earliest;
    }
    const cursor = cursors[track] ?? 0;
    const flush = cursor - position > maxBacklogSec;
    const start = onSampleGrid(flush ? position : Math.max(cursor, position));
    cursors[track] = onSampleGrid(start + durationSec);
    return { start, flush };
  }

  // Barge-in: this track's queued speech was cancelled.
  function clear(track, nowSec) {
    cursors[track] = onSampleGrid(nowSec);
  }

  return { schedule, clear };
}

// The context runs at the frames' own 8 kHz rate. At the hardware rate
// (44.1/48 kHz) the browser resamples each 20-40 ms frame's buffer on its
// own, and every frame edge clicks - 50 clicks a second on the agent track,
// which is what made listening in sound scratchy even though the call
// audio itself is clean (measured in Chrome on a real call's frames: ~98%
// of the difference from one continuous buffer sat on frame edges). At
// 8 kHz the frames play sample for sample and only the mixed output is
// resampled, once, continuously. A browser that can't open an 8 kHz
// context still gets working, if clickier, audio.
function createContext(AudioContextImpl) {
  try {
    return new AudioContextImpl({ sampleRate: SAMPLE_RATE });
  } catch {
    return new AudioContextImpl();
  }
}

// Opens the live stream for one run and plays it. Returns { stop, resume,
// get suspended }. Callbacks: onOpen() each time the stream (re)connects -
// the server then replays every turn so far, so drop the ones shown -
// onTurn(turn) per transcript turn, onEnd() when the call is over or the stream fails
// for good, onStateChange() when audio suspension changes (the browser can
// hold an AudioContext created outside a click until the viewer clicks).
export function listenToLiveCall(
  runId,
  { onOpen, onTurn, onEnd, onStateChange, EventSourceImpl = globalThis.EventSource, AudioContextImpl = globalThis.AudioContext } = {},
) {
  const ctx = createContext(AudioContextImpl);
  const scheduler = createLiveScheduler();
  const sources = { agent: new Set(), caller: new Set() };
  const source = new EventSourceImpl(`/v1/qualeval/runs/${encodeURIComponent(runId)}/live`);
  let stopped = false;

  ctx.onstatechange = () => onStateChange?.();

  function play(track, tMs, payload) {
    if (ctx.state === "suspended") return; // don't queue up speech nobody can hear yet
    const samples = decodeMuLawBase64(payload);
    if (samples.length === 0) return;
    const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
    buffer.copyToChannel(samples, 0);
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    const key = track === "caller" ? "caller" : "agent";
    const { start, flush } = scheduler.schedule(key, tMs, buffer.duration, ctx.currentTime);
    if (flush) stopQueued(key);
    sources[key].add(node);
    node.onended = () => sources[key].delete(node);
    node.start(start);
  }

  function stopQueued(track) {
    for (const node of sources[track] ?? []) {
      try {
        node.stop();
      } catch {
        // already stopped
      }
    }
    sources[track]?.clear();
  }

  function clear(track) {
    stopQueued(track);
    scheduler.clear(track, ctx.currentTime);
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    source.close();
    ctx.close().catch(() => {});
  }

  source.onopen = () => onOpen?.();
  source.onmessage = (e) => {
    let event;
    try {
      event = JSON.parse(e.data);
    } catch {
      return;
    }
    if (event.type === "audio") play(event.track, event.tMs, event.payload);
    else if (event.type === "turn") onTurn?.(event.turn);
    else if (event.type === "clear") clear(event.track);
    else if (event.type === "end") {
      stop();
      onEnd?.();
    }
  };
  // EventSource retries a dropped connection by itself; only a closed one
  // (e.g. 404, auth failure) is final.
  source.onerror = () => {
    if (source.readyState === 2 && !stopped) {
      stop();
      onEnd?.();
    }
  };

  return {
    stop,
    resume: () => ctx.resume(),
    get suspended() {
      return ctx.state === "suspended";
    },
  };
}
