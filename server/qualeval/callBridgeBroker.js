// In-process registry that cross-wires the two bridgeSession instances for
// ONE real QualEval call, keyed by runId - see server/qualeval/
// bridgeSession.js's header comment for why this hand-off exists at all
// (Twilio does not bridge audio between the persona leg and the target-
// agent leg of a call placed against QUALEVAL_AGENT_NUMBER; each leg's own
// standalone <Connect><Stream> hijacks its own audio path).
//
// The persona side (server/qualeval/twilioStream.js) always knows its runId
// up front (carried as a Twilio Custom Parameter) and registers first. The
// target-agent side (server/qualeval/targetAgentStream.js) is NOT tied to
// any run - it answers QUALEVAL_AGENT_NUMBER for real external callers too,
// who have no runId at all - so it claims whichever run is currently
// "persona registered, not yet claimed" rather than being told a runId
// directly. Only one QualEval call is realistically in flight against this
// single demo number at a time (see AGENTS.md's "Out of scope: number-pool
// rotation" note), so a single first-match claim is enough; a real external
// caller with no matching pending run simply finds nothing to claim and the
// target agent behaves exactly as it does standalone.
const pending = new Map(); // runId -> { persona?: {injectAudio}, target?: {injectAudio} }

function entryFor(runId) {
  let entry = pending.get(runId);
  if (!entry) {
    entry = {};
    pending.set(runId, entry);
  }
  return entry;
}

export function registerPersonaLeg(runId, injectAudio) {
  entryFor(runId).persona = { injectAudio };
}

export function registerTargetLeg(runId, injectAudio) {
  entryFor(runId).target = { injectAudio };
}

// Finds a run whose persona leg has registered but has no target leg
// claiming it yet, and marks it claimed by registering a placeholder so a
// second concurrent target connection doesn't also claim it. Returns null
// when there's nothing to claim (a real external caller, or the persona leg
// hasn't registered yet - see waitForClaimableRun below).
export function claimPendingRunForTarget() {
  for (const [runId, entry] of pending) {
    if (entry.persona && !entry.target) {
      entry.target = { claimed: true };
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
// caller with no run to cross-wire to.
export async function waitForClaimableRun({ attempts = 10, intervalMs = 250 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const runId = claimPendingRunForTarget();
    if (runId) return runId;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

export function forwardToTarget(runId, audio) {
  pending.get(runId)?.target?.injectAudio?.(audio);
}

export function forwardToPersona(runId, audio) {
  pending.get(runId)?.persona?.injectAudio?.(audio);
}

export function releaseRun(runId) {
  pending.delete(runId);
}
