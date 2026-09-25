import * as store from "./store.js";

// A run can be placed (callBridge.js's placeCall marks it 'in_progress')
// and then hang there forever with zero further signal: the TwiML webhook
// fires and the call stays connected, but the Twilio Media Streams
// WebSocket upgrade to twilioStream.js/targetAgentStream.js never
// completes (confirmed live 2026-09-25 - see the firstmate
// qualeval-demo-agent-stream-regression investigation), and neither of
// those files has any timeout of its own (a real call can legitimately run
// for minutes, so they can't just bail after N seconds of silence). Without
// this watchdog a run like that stays 'in_progress' indefinitely with no
// error ever surfaced - a real product gap independent of whatever caused
// the WS upgrade to be missed in any one instance.
//
// Deliberately simple and bounded: one flat timer armed when the call is
// placed, guarded by store.markRunErrorIfStale so it can never clobber a
// run that finished on its own (fast path: verdict already moved past
// 'in_progress' by the time this fires, so the guarded update is a no-op).
// No cancellation wiring back from twilioStream.js - the guard makes that
// unnecessary, and this repo's call-bridge architecture already assumes a
// single in-process run at a time (see AGENTS.md's QualEval section).
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export function armStreamWatchdog(
  runId,
  { timeoutMs = DEFAULT_TIMEOUT_MS, markRunErrorIfStale = store.markRunErrorIfStale } = {},
) {
  const timer = setTimeout(() => {
    markRunErrorIfStale(
      runId,
      `Call did not complete within ${Math.round(timeoutMs / 1000)}s of being placed - the Media Stream bridge may never have connected.`,
    ).catch((err) => {
      console.error(`QualEval watchdog: failed to mark run ${runId} as stale: ${err.message}`);
    });
  }, timeoutMs);
  timer.unref?.();
  return timer;
}
