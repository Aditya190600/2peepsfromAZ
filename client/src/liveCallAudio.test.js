import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createLiveScheduler,
  decodeMuLawBase64,
  getLiveAudioPreference,
  setLiveAudioPreference,
  listenToLiveCall,
} from "./liveCallAudio.js";

// Most tests only care about the start time.
function starts(scheduler) {
  return (track, tMs, durationSec, nowSec) => scheduler.schedule(track, tMs, durationSec, nowSec).start;
}

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
}

test("live audio preference defaults off and round-trips", () => {
  const storage = memoryStorage();
  assert.equal(getLiveAudioPreference(storage), false);
  setLiveAudioPreference(true, storage);
  assert.equal(getLiveAudioPreference(storage), true);
  setLiveAudioPreference(false, storage);
  assert.equal(getLiveAudioPreference(storage), false);
});

test("live audio preference reads as off when storage throws", () => {
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(getLiveAudioPreference(broken), false);
  assert.doesNotThrow(() => setLiveAudioPreference(true, broken));
});

test("decodeMuLawBase64 maps mu-law silence to ~0 and full-scale bytes to ~±1", () => {
  const samples = decodeMuLawBase64(Buffer.from([0xff, 0x7f, 0x00, 0x80]).toString("base64"));
  assert.equal(samples.length, 4);
  assert.equal(Math.abs(samples[0]), 0);
  assert.equal(Math.abs(samples[1]), 0);
  assert.ok(samples[2] < -0.9);
  assert.ok(samples[3] > 0.9);
});

test("scheduler keeps both tracks on the call's own clock with a small lead", () => {
  const sched = createLiveScheduler({ leadSec: 0.25, minLeadSec: 0.05 });
  const s = { schedule: starts(sched), clear: sched.clear };
  assert.equal(s.schedule("agent", 1000, 0.02, 10), 10.25);
  // The caller frame 500 ms later in the call plays 500 ms later, not "now".
  assert.equal(s.schedule("caller", 1500, 0.02, 10.01), 10.75);
});

test("scheduler queues a faster-than-real-time burst back to back on its own track", () => {
  const sched = createLiveScheduler({ leadSec: 0.25, minLeadSec: 0.05 });
  const s = { schedule: starts(sched), clear: sched.clear };
  const a = s.schedule("caller", 0, 0.5, 0);
  const b = s.schedule("caller", 5, 0.5, 0.005);
  const c = s.schedule("caller", 10, 0.5, 0.01);
  assert.deepEqual([a, b, c], [0.25, 0.75, 1.25]);
  // The other track isn't pushed back by it.
  assert.ok(Math.abs(s.schedule("agent", 20, 0.02, 0.02) - 0.27) < 1e-9);
});

test("scheduler shifts the clock forward for a late frame instead of playing it in the past", () => {
  const sched = createLiveScheduler({ leadSec: 0.25, minLeadSec: 0.05 });
  const s = { schedule: starts(sched), clear: sched.clear };
  s.schedule("agent", 0, 0.02, 0);
  // Network stall: frame for tMs=100 arrives at context time 2.
  assert.equal(s.schedule("agent", 100, 0.02, 2), 2.05);
  // Following frames stay on the shifted clock.
  assert.ok(Math.abs(s.schedule("agent", 120, 0.02, 2.01) - 2.07) < 1e-9);
});

test("scheduler clear() lets a track's next frame start without waiting for cancelled speech", () => {
  const sched = createLiveScheduler({ leadSec: 0.25, minLeadSec: 0.05 });
  const s = { schedule: starts(sched), clear: sched.clear };
  s.schedule("caller", 0, 5, 0); // 5 s of queued speech
  s.clear("caller", 1);
  assert.equal(s.schedule("caller", 800, 0.02, 1), 1.05);
});

class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.closed = false;
    FakeEventSource.last = this;
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  emit(event) {
    this.onmessage({ data: JSON.stringify(event) });
  }
}

class FakeAudioContext {
  constructor() {
    this.state = "running";
    this.currentTime = 0;
    this.started = [];
    this.destination = {};
  }
  createBuffer(_channels, length, sampleRate) {
    return { duration: length / sampleRate, copyToChannel: () => {} };
  }
  createBufferSource() {
    const ctx = this;
    return {
      connect: () => {},
      start(at) {
        ctx.started.push(at);
      },
      stop() {
        this.stopped = true;
      },
    };
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

test("listenToLiveCall plays audio frames, reports turns, and stops on end", () => {
  const turns = [];
  let ended = 0;
  let ctx;
  const listener = listenToLiveCall("run 1", {
    EventSourceImpl: FakeEventSource,
    AudioContextImpl: class extends FakeAudioContext {
      constructor() {
        super();
        ctx = this;
      }
    },
    onTurn: (t) => turns.push(t),
    onEnd: () => ended++,
  });
  const es = FakeEventSource.last;
  assert.equal(es.url, "/v1/qualeval/runs/run%201/live");
  const frame = Buffer.alloc(160, 0xff).toString("base64");
  es.emit({ type: "audio", track: "agent", tMs: 0, payload: frame });
  es.emit({ type: "turn", turn: { role: "agent", text: "Hello", tMs: 0 } });
  assert.equal(ctx.started.length, 1);
  assert.deepEqual(turns, [{ role: "agent", text: "Hello", tMs: 0 }]);
  assert.equal(listener.suspended, false);
  es.emit({ type: "end" });
  assert.equal(ended, 1);
  assert.equal(es.closed, true);
  assert.equal(ctx.state, "closed");
});

test("listenToLiveCall doesn't queue audio while the browser holds the context suspended", () => {
  let ctx;
  const listener = listenToLiveCall("run_2", {
    EventSourceImpl: FakeEventSource,
    AudioContextImpl: class extends FakeAudioContext {
      constructor() {
        super();
        this.state = "suspended";
        ctx = this;
      }
    },
  });
  FakeEventSource.last.emit({ type: "audio", track: "agent", tMs: 0, payload: Buffer.alloc(160, 0xff).toString("base64") });
  assert.equal(ctx.started.length, 0);
  assert.equal(listener.suspended, true);
  listener.stop();
});

test("scheduler re-anchors once jitter has pushed the clock too far behind live", () => {
  const sched = createLiveScheduler({ leadSec: 0.25, minLeadSec: 0.05, maxLeadSec: 1 });
  const s = { schedule: starts(sched), clear: sched.clear };
  s.schedule("agent", 0, 0.02, 0);
  // Repeated stalls each push the clock forward...
  s.schedule("agent", 100, 0.02, 1);
  s.schedule("agent", 200, 0.02, 2);
  s.schedule("agent", 300, 0.02, 3); // clock now ~2.75 s behind the call
  // ...then frames arrive promptly again: without re-anchoring, tMs=5000
  // would play ~2.7 s late. It plays leadSec after arrival instead.
  assert.equal(s.schedule("agent", 5000, 0.02, 5.03), 5.28);
});

test("re-anchoring doesn't overlap a track that still has queued speech", () => {
  const sched = createLiveScheduler({ leadSec: 0.25, minLeadSec: 0.05, maxLeadSec: 1, maxBacklogSec: 1.5 });
  const s = { schedule: starts(sched) };
  s.schedule("agent", 0, 0.02, 0);
  s.schedule("agent", 100, 0.02, 3); // clock pushed ~2.9 s behind
  s.schedule("caller", 3000, 1, 3.01); // 1 s of caller speech queued from ~3.05
  s.schedule("agent", 3100, 0.02, 3.1); // re-anchors
  assert.ok(s.schedule("caller", 3120, 0.5, 3.12) >= 4.05);
});

test("a proxy-delayed burst flushes the stale queue and plays from the live edge", () => {
  const sched = createLiveScheduler({ leadSec: 0.25, minLeadSec: 0.05, maxLeadSec: 1, maxBacklogSec: 1.5 });
  // 6 s of 20 ms agent frames all delivered at context time 10.
  let last;
  let flushes = 0;
  for (let tMs = 0; tMs < 6000; tMs += 20) {
    last = sched.schedule("agent", tMs, 0.02, 10);
    if (last.flush) flushes++;
  }
  assert.ok(flushes > 0);
  // The newest frame plays within ~maxBacklogSec of now, not ~6 s later.
  assert.ok(last.start - 10 <= 1.5 + 0.25, `start ${last.start}`);
});

test("real-time frames never flush", () => {
  const sched = createLiveScheduler();
  for (let i = 0; i < 500; i++) {
    const now = i * 0.02 + (i % 7) * 0.004; // mild jitter
    assert.equal(sched.schedule("agent", i * 20, 0.02, now).flush, false);
  }
});

// Each 20 ms frame is its own AudioBufferSourceNode. Played through a context
// at the hardware rate (44.1/48 kHz), the browser resamples every 8 kHz
// buffer on its own and each one's edges click - 50 clicks a second on the
// agent track, heard as scratchy audio (measured in Chrome's
// OfflineAudioContext on a real call's frames: ~98% of the error against one
// continuous buffer sat on frame boundaries). At the frames' own 8 kHz rate
// nothing is resampled per frame, as long as every frame starts exactly on a
// sample.
test("listenToLiveCall plays through a context at the frames' own 8 kHz rate", () => {
  let options;
  const listener = listenToLiveCall("run_3", {
    EventSourceImpl: FakeEventSource,
    AudioContextImpl: class extends FakeAudioContext {
      constructor(opts) {
        super();
        options = opts;
      }
    },
  });
  assert.deepEqual(options, { sampleRate: 8000 });
  listener.stop();
});

test("listenToLiveCall falls back to the default context where 8 kHz isn't supported", () => {
  const created = [];
  const listener = listenToLiveCall("run_4", {
    EventSourceImpl: FakeEventSource,
    AudioContextImpl: class extends FakeAudioContext {
      constructor(opts) {
        if (opts) throw new Error("NotSupportedError");
        super();
        created.push(this);
      }
    },
  });
  assert.equal(created.length, 1);
  listener.stop();
});

test("scheduler keeps jittery frames back to back on the 8 kHz sample grid", () => {
  const sched = createLiveScheduler();
  let prevEnd = null;
  for (let i = 0; i < 500; i++) {
    const now = 3.0001234 + i * 0.02 + ((i * 7919) % 13) * 0.0031;
    const { start } = sched.schedule("agent", i * 20, 0.02, now);
    const sample = start * 8000;
    assert.ok(Math.abs(sample - Math.round(sample)) < 1e-6, `frame ${i} start ${start} is off the sample grid`);
    if (prevEnd !== null && start - prevEnd < 0.001) {
      assert.ok(Math.abs(start - prevEnd) < 1e-9, `frame ${i} doesn't abut the previous one`);
    }
    prevEnd = start + 0.02;
  }
});
