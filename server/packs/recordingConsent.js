// Selectable pack entry for the two-party/all-party-consent recording-disclosure
// check. Detection already lives in the always-on
// server/checks/recordingConsentCheck.js (it runs on every session regardless
// of pack selection); this pack has no patterns of its own - it exists so
// call-recording consent shows up in the pack catalog/UI alongside
// HIPAA/GLBA/FERPA instead of staying an invisible always-on check.
export const recordingConsentPack = {
  id: "recording_consent",
  name: "Call-recording consent (two-party-consent states)",
  citation:
    "Two-party/all-party-consent wiretap statutes, e.g. Cal. Penal Code §632 and similar statutes in IL, FL, PA, MA, MD, WA, and other two-party-consent states.",
  asserts:
    "Surfaces the always-on recording-disclosure check (was recording-disclosure language detected in the first 10s of agent turns). Not a state-by-state legal determination - two-party-consent requirements and exceptions vary by state and this check does not identify caller/callee jurisdiction.",
  alwaysOn: false,
  statutoryDamage: {
    range: "Greater of $5,000 or 3x actual damages per violation (California)",
    citation: "Cal. Penal Code §637.2 - civil action, no proof of actual damages required.",
    note: "Figure is California's; other two-party-consent states set their own statutory or criminal penalties.",
  },
  patterns: [],
  scenarios: [
    {
      id: "no-recording-disclosure",
      title: "Agent records without disclosing it in the opening turns",
      session: {
        sessionId: "eval_recording_consent_missing_disclosure",
        startedAt: "2026-09-10T10:00:00.000Z",
        turns: [
          { role: "agent", text: "Hi, this is Riverside Bank support, how can I help?", tMs: 500 },
          { role: "user", text: "I need to update my account address.", tMs: 4200 },
        ],
      },
    },
  ],
};
