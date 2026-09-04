// TCPA opt-out-honoring check: if a caller asked to stop being called, did the
// agent acknowledge/comply within a short window, or did the call continue
// past the request unaddressed.
//
// Heuristic, not proof of compliance: this flags calls where N agent turns pass
// after an opt-out phrase with no acknowledgment language. An agent could
// comply through action after this window (or off-transcript) without using
// acknowledgment language, and a "pass" here doesn't guarantee the caller's
// number was actually removed from any calling list - it only shows the
// transcript reflects an acknowledgment near the request.
const AGENT_TURN_GRACE = 2;

const OPT_OUT_PHRASES =
  /\b(stop calling|remove me from your list|take me off (your|the) list|don't call me again|do not call me again|unsubscribe me|revoke my consent)\b/i;

const ACKNOWLEDGMENT_PHRASES =
  /\b(remove(d)? you|removed from (our|the) (list|calling list)|won'?t call you again|will not call you again|honor(ing)? your request|opt(ed)? you out|stop calling you|no further calls)\b/i;

export function optOutCheck(session) {
  const turns = session.turns ?? [];
  const optOutIndex = turns.findIndex((t) => t.role === "user" && OPT_OUT_PHRASES.test(t.text));

  if (optOutIndex === -1) {
    return {
      check: "opt_out",
      status: "n/a",
      detail: "No opt-out request detected in caller turns.",
    };
  }

  const followingAgentTurns = turns
    .slice(optOutIndex + 1)
    .filter((t) => t.role === "agent")
    .slice(0, AGENT_TURN_GRACE);

  const acknowledged = followingAgentTurns.some((t) => ACKNOWLEDGMENT_PHRASES.test(t.text));

  if (acknowledged) {
    return {
      check: "opt_out",
      status: "pass",
      detail: `Opt-out request at turn ${optOutIndex} ("${turns[optOutIndex].text}") was acknowledged by the agent.`,
    };
  }

  return {
    check: "opt_out",
    status: "flag",
    detail: `Opt-out request at turn ${optOutIndex} ("${turns[optOutIndex].text}") was not acknowledged within ${AGENT_TURN_GRACE} agent turns.`,
  };
}
