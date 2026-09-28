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
//
// The run is registered twice, and either registration alone is enough:
// once by placeCall (server/qualeval/callBridge.js) just before it asks
// Twilio to dial, carrying the evaluation's demo target agent key, and again
// by the persona leg once its "start" event names the run. The placement
// registration is what lets the target leg pick the right agent: it lands
// before Twilio even rings the target number, so the target leg can claim it
// the instant its socket connects - before it opens its AssemblyAI session,
// whose agent is fixed on the first session.update - rather than answering
// as Settings' single Target agents switch.
const pending = new Map(); // runId -> { claimed, demoAgentKey, registeredAt }

// A placement registration whose call never reached a target leg we bridge
// (it rang an outside number, went unanswered, or the persona leg never
// connected) must not be claimed later by an unrelated caller. Longer than
// Twilio's default 60 s ring timeout plus Media Streams connect time.
export const UNCLAIMED_RUN_TTL_MS = 2 * 60 * 1000;

export function registerPlacedRun(runId, { demoAgentKey = null } = {}, now = Date.now()) {
  pending.set(runId, { claimed: false, demoAgentKey, registeredAt: now });
}

export function registerPersonaLeg(runId, now = Date.now()) {
  if (!pending.has(runId)) pending.set(runId, { claimed: false, demoAgentKey: null, registeredAt: now });
}

// Finds a run registered but not yet claimed by any target leg, and marks it
// claimed so a second concurrent target connection doesn't also claim it.
// Returns { runId, demoAgentKey }, or null when there's nothing to claim (a
// real external caller, or the persona leg hasn't registered yet - see
// waitForClaimableRun below).
export function claimPendingRun(now = Date.now()) {
  for (const [runId, entry] of pending) {
    if (entry.claimed) continue;
    if (now - entry.registeredAt > UNCLAIMED_RUN_TTL_MS) {
      pending.delete(runId);
      continue;
    }
    entry.claimed = true;
    return { runId, demoAgentKey: entry.demoAgentKey };
  }
  return null;
}

export function claimPendingRunForTarget(now = Date.now()) {
  return claimPendingRun(now)?.runId ?? null;
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
