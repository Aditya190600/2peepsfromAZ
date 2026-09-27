// In-process registry that links the target-agent leg of a QualEval-placed
// call back to its run, keyed by runId. Audio is NOT relayed here - both
// legs hear each other over the real phone line (see server/qualeval/
// bridgeSession.js's header comment for why an earlier server-side audio
// cross-feed was removed). What the target-agent side still needs is the
// runId, so its production-call record and inbound evaluation
// (server/qualeval/targetAgentStream.js) can be tied to the QualEval run
// that placed the call.
//
// The persona side (server/qualeval/twilioStream.js) always knows its runId
// up front (carried as a Twilio Custom Parameter) and registers first. The
// target-agent side is NOT tied to any run - it answers
// QUALEVAL_AGENT_NUMBER for real external callers too, who have no runId at
// all - so it claims whichever run is currently "persona registered, not yet
// claimed" rather than being told a runId directly. Only one QualEval call is
// realistically in flight against this single demo number at a time (see
// AGENTS.md's "Out of scope: number-pool rotation" note), so a single
// first-match claim is enough; a real external caller with no matching
// pending run simply finds nothing to claim.
const pending = new Map(); // runId -> { claimed: boolean }

export function registerPersonaLeg(runId) {
  if (!pending.has(runId)) pending.set(runId, { claimed: false });
}

// Finds a run whose persona leg has registered but that no target leg has
// claimed yet, and marks it claimed so a second concurrent target connection
// doesn't also claim it. Returns null when there's nothing to claim (a real
// external caller, or the persona leg hasn't registered yet - see
// waitForClaimableRun below).
export function claimPendingRunForTarget() {
  for (const [runId, entry] of pending) {
    if (!entry.claimed) {
      entry.claimed = true;
      return runId;
    }
  }
  return null;
}

// The target-agent leg's WebSocket typically connects before the persona
// leg has resolved its runId (the persona side waits on a "start" event with
// Custom Parameters first - see twilioStream.js), so an immediate claim
// attempt usually finds nothing yet for a genuine QualEval call. Retries
// briefly before giving up and treating the connection as a real external
// caller with no run to link to.
export async function waitForClaimableRun({ attempts = 40, intervalMs = 250 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const runId = claimPendingRunForTarget();
    if (runId) return runId;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

export function releaseRun(runId) {
  pending.delete(runId);
}
