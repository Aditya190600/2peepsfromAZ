// In-process fan-out of one in-progress QualEval call's live audio and
// transcript turns to whoever is listening in the browser (GET /v1/qualeval/
// runs/:id/live in server/qualeval/router.js). This is a read-only tap: the
// persona leg's bridge (server/qualeval/twilioStream.js) publishes what it
// already relays between Twilio and AssemblyAI, and nothing published here
// is ever fed back into either call leg - both legs still hear each other
// only over the real phone line (see server/qualeval/bridgeSession.js's
// header comment on the removed server-side audio cross-feed).
//
// In-memory and per-process, like server/qualeval/callBridgeBroker.js: the
// bridge and the listener's HTTP stream are served by the same single
// Railway instance. A listener that connects after the call already ended,
// or to another process, simply gets an immediate "end".
//
// Transcript turns are kept for the life of the call so a listener that
// joins mid-call sees the conversation so far; audio is not buffered - a
// late listener hears from the moment they join.
//
// A run is marked in_progress as soon as Twilio accepts the call, but the
// bridge only starts here once the phone is answered and its Media Stream
// connects - seconds later. A listener arriving in that window waits
// (subscribe's waitForStart) instead of being told the call is over.
const calls = new Map(); // runId -> { turns: [], listeners: Set }
const waiting = new Map(); // runId -> Set of listeners awaiting startCall

export function startCall(runId) {
  if (calls.has(runId)) return;
  const listeners = waiting.get(runId) ?? new Set();
  waiting.delete(runId);
  calls.set(runId, { turns: [], listeners });
}

export function isLive(runId) {
  return calls.has(runId);
}

function emit(runId, event) {
  const call = calls.get(runId);
  if (!call) return;
  for (const listener of call.listeners) {
    try {
      listener(event);
    } catch (err) {
      console.error(`QualEval live call ${runId}: listener failed: ${err.message}`);
    }
  }
}

// track is "agent" (the target agent under test, heard over the phone) or
// "caller" (the simulated caller's own synthesized speech) - the same roles
// QualEval's transcript turns use, so the client can label/mix them alike.
export function publishAudio(runId, track, payload, tMs) {
  if (!payload) return;
  emit(runId, { type: "audio", track, payload, tMs });
}

// The caller's reply was cut off by barge-in; the bridge has told Twilio to
// drop its buffered audio, so listeners should drop theirs too.
export function publishClear(runId, track) {
  emit(runId, { type: "clear", track });
}

export function publishTurn(runId, turn) {
  const call = calls.get(runId);
  if (!call) return;
  call.turns.push(turn);
  emit(runId, { type: "turn", turn });
}

export function endCall(runId) {
  const call = calls.get(runId);
  const listeners = call?.listeners ?? waiting.get(runId);
  calls.delete(runId);
  waiting.delete(runId);
  for (const listener of listeners ?? []) {
    try {
      listener({ type: "end" });
    } catch {
      // listener already gone
    }
  }
}

// Returns an unsubscribe function, or null when the call isn't live here
// (and waitForStart is false). The listener first receives every turn so
// far, then live events, then a final { type: "end" }. With waitForStart,
// a call that hasn't started yet is joined once it does; the caller owns
// giving up (unsubscribing) if it never does.
export function subscribe(runId, listener, { waitForStart = false } = {}) {
  const call = calls.get(runId);
  if (!call) {
    if (!waitForStart) return null;
    if (!waiting.has(runId)) waiting.set(runId, new Set());
    waiting.get(runId).add(listener);
    return () => {
      const set = calls.get(runId)?.listeners ?? waiting.get(runId);
      set?.delete(listener);
      if (waiting.get(runId)?.size === 0) waiting.delete(runId);
    };
  }
  for (const turn of call.turns) listener({ type: "turn", turn });
  call.listeners.add(listener);
  return () => call.listeners.delete(listener);
}
