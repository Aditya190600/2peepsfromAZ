// Selectable pack entry for the TCPA consent check. Detection already lives in
// the always-on server/checks/consentCheck.js (it runs on every session
// regardless of pack selection); this pack has no patterns of its own - it
// exists so TCPA shows up in the pack catalog/UI alongside HIPAA/GLBA/FERPA
// instead of staying an invisible always-on check.
export const tcpaPack = {
  id: "tcpa",
  name: "TCPA consent (robocall / marketing calls)",
  citation: "Telephone Consumer Protection Act, 47 U.S.C. §227(b)(3).",
  asserts:
    "Surfaces the always-on consent-event check (was a valid consent event logged before this call). Not a TCPA compliance determination - TCPA also covers prior express written consent for marketing, called-party identity, and call-time restrictions this check does not evaluate.",
  alwaysOn: false,
  statutoryDamage: {
    range: "$500 per violation, up to $1,500 for willful/knowing violations",
    citation: "47 U.S.C. §227(b)(3) private right of action; treble damages are discretionary for willful violations.",
    note: "Per-call statutory damages - no proof of actual harm required.",
  },
  patterns: [],
  scenarios: [
    {
      id: "missing-consent-event",
      title: "Call proceeds with no consent event logged",
      session: {
        sessionId: "eval_tcpa_missing_consent",
        startedAt: "2026-09-10T10:00:00.000Z",
        turns: [
          {
            role: "agent",
            text: "Hi, this is an AI assistant calling from Riverside Auto about your extended warranty.",
            tMs: 500,
          },
          { role: "user", text: "I didn't sign up for this.", tMs: 4200 },
        ],
      },
    },
  ],
};
