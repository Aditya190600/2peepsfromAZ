// Synthetic sessions for demoing the report pipeline without a live call.
export const SAMPLE_SESSIONS = {
  "clean-call": {
    sessionId: "sess_demo_clean",
    startedAt: "2026-09-03T10:00:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-03T09:59:55.000Z" },
    turns: [
      { role: "agent", text: "Hi, this is an AI assistant calling from Acme Support.", tMs: 500 },
      { role: "user", text: "Sure, go ahead.", tMs: 3200 },
      { role: "agent", text: "Great, how can I help you today?", tMs: 4500 },
    ],
  },
  "tcpa-violation": {
    sessionId: "sess_demo_violation",
    startedAt: "2026-09-03T10:05:00.000Z",
    consentEvent: null,
    turns: [
      { role: "agent", text: "Hi there, how can I help you today?", tMs: 500 },
      { role: "user", text: "My SSN is 123-45-6789 and my card is 4111 1111 1111 1111.", tMs: 6000 },
    ],
  },
  "healthcare-hipaa": {
    sessionId: "sess_demo_healthcare",
    startedAt: "2026-09-03T10:10:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-03T10:09:30.000Z" },
    turns: [
      { role: "agent", text: "Hi, this is an automated assistant from the clinic.", tMs: 300 },
      { role: "user", text: "My patient id 483920 and MRN:1029384 are on file.", tMs: 3500 },
    ],
  },
  "late-disclosure": {
    sessionId: "sess_demo_late_disclosure",
    startedAt: "2026-09-03T10:15:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-03T10:14:50.000Z" },
    turns: [
      { role: "agent", text: "Hi there, thanks for calling Acme Support.", tMs: 500 },
      { role: "user", text: "Hey, I have a question about my account.", tMs: 3000 },
      { role: "agent", text: "Sure — just so you know, I'm an AI assistant helping with this call.", tMs: 15000 },
    ],
  },
  "clean-call-2": {
    sessionId: "sess_demo_clean_2",
    startedAt: "2026-09-03T10:20:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-03T10:19:45.000Z" },
    turns: [
      { role: "agent", text: "Hello, this is a virtual assistant calling on behalf of Acme Billing.", tMs: 400 },
      { role: "user", text: "Okay, what's this about?", tMs: 2800 },
      { role: "agent", text: "Just a reminder that your invoice is due next week.", tMs: 4200 },
    ],
  },
};
