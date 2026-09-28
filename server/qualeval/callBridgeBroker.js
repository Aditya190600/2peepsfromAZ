// In-process registry that links the target-agent leg of a QualEval-placed
// call back to its run, keyed by runId. Audio is NOT relayed here - both
// legs hear each other over the real phone line (see server/qualeval/
// bridgeSession.js's header comment for why an earlier server-side audio
// cross-feed was removed). What the target-agent side still needs is the
// runId, so its production-call record and inbound evaluation
// (server/qualeval/targetAgentStream.js) can be tied to the QualEval run
// that placed the call.
//
// placeCall (server/qualeval/callBridge.js) registers the run just before
// it asks Twilio to dial, carrying the evaluation's demo target agent key -
// and only when the dialed number is one our own demo-agent-voice route
// answers, so a run ringing an outside number can never be claimed by a real
// caller dialing ours. The target-agent side is NOT tied to any run - it
// answers real external callers too, who have no runId at all - so it claims
// whichever run is registered and not yet claimed, synchronously, the
// instant its socket connects: before it opens its AssemblyAI session, whose
// agent is fixed on the first session.update. Only one QualEval call is
// realistically in flight against this single demo number at a time (see
// AGENTS.md's "Out of scope: number-pool rotation" note), so a single
// first-match claim is enough; a real external caller with no pending run
// simply finds nothing to claim and answers as Settings' Target agents
// switch. The persona leg does not register: it knows its runId only once
// its "start" arrives, after the target leg has already connected.
const pending = new Map(); // runId -> { claimed, demoAgentKey, registeredAt }

// A placement registration whose call never reached a target leg we bridge
// (it rang an outside number, went unanswered, or the persona leg never
// connected) must not be claimed later by an unrelated caller. Longer than
// Twilio's default 60 s ring timeout plus Media Streams connect time.
export const UNCLAIMED_RUN_TTL_MS = 2 * 60 * 1000;

export function registerPlacedRun(runId, { demoAgentKey = null } = {}, now = Date.now()) {
  pending.set(runId, { claimed: false, demoAgentKey, registeredAt: now });
}

// Finds a run registered but not yet claimed by any target leg, and marks it
// claimed so a second concurrent target connection doesn't also claim it.
// Returns { runId, demoAgentKey }, or null when there's nothing to claim (a
// real external caller).
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

export function releaseRun(runId) {
  pending.delete(runId);
}
