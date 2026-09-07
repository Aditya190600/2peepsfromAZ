// Synthetic sessions for demoing the report pipeline without a live call.
// Each key also has a matching recorded-speech file at /samples/<key>.mp3
// (generated from these same turns) so a sample session can actually be
// played back, not just read as text - see SAMPLE_AUDIO_URLS below.
export const SAMPLE_SESSIONS = {
  // tMs values match the two-speaker MP3s in /samples (GuyNeural agent /
  // JennyNeural user). Regenerated via scripts/generate-sample-audio.py so
  // AssemblyAI speaker_labels diarization returns real multi-turn utterances
  // when the file is dropped on the upload demo path.
  "clean-call": {
    sessionId: "sess_demo_clean",
    startedAt: "2026-09-03T10:00:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-03T09:59:55.000Z" },
    turns: [
      {
        role: "agent",
        text: "Hi, this is an AI assistant calling from Acme Support. This call may be recorded for quality purposes.",
        tMs: 500,
      },
      { role: "user", text: "Sure, go ahead.", tMs: 8800 },
      { role: "agent", text: "Great, how can I help you today?", tMs: 11604 },
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
  "optout-ignored": {
    sessionId: "sess_demo_optout_ignored",
    startedAt: "2026-09-03T10:15:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-03T10:14:30.000Z" },
    turns: [
      { role: "agent", text: "Hi, this is an AI assistant calling about your account.", tMs: 500 },
      { role: "user", text: "Stop calling me, take me off your list.", tMs: 5128 },
      { role: "agent", text: "I hear you, but let me tell you about today's offer.", tMs: 9012 },
      { role: "agent", text: "This deal expires tonight.", tMs: 13136 },
    ],
  },
  "healthcare-hipaa": {
    sessionId: "sess_demo_healthcare",
    startedAt: "2026-09-03T10:10:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-03T10:09:30.000Z" },
    turns: [
      { role: "agent", text: "Hi, this is an automated assistant from the clinic.", tMs: 300 },
      { role: "user", text: "My patient id 483920 and MRN:1029384 are on file.", tMs: 4736 },
    ],
  },
  "late-disclosure": {
    sessionId: "sess_demo_late_disclosure",
    startedAt: "2026-09-03T10:15:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-03T10:14:50.000Z" },
    turns: [
      { role: "agent", text: "Hi there, thanks for calling Acme Support.", tMs: 500 },
      { role: "user", text: "Hey, I have a question about my account.", tMs: 4336 },
      { role: "agent", text: "Sure — just so you know, I'm an AI assistant helping with this call.", tMs: 15000 },
    ],
  },
  "clean-call-2": {
    sessionId: "sess_demo_clean_2",
    startedAt: "2026-09-03T10:20:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-03T10:19:45.000Z" },
    turns: [
      {
        role: "agent",
        text: "Hello, this is a virtual assistant calling on behalf of Acme Billing. This call is being recorded for quality purposes.",
        tMs: 400,
      },
      { role: "user", text: "Okay, what's this about?", tMs: 9204 },
      { role: "agent", text: "Just a reminder that your invoice is due next week.", tMs: 12248 },
    ],
  },
};

// Only the six sessions above have a recorded companion file - these are the
// "playable" set. Everything in GENERATED_SESSIONS below is text-only, so a
// fleet reads as a program under review (~50 calls) rather than 6 fixtures.
export const SAMPLE_AUDIO_URLS = Object.fromEntries(
  Object.keys(SAMPLE_SESSIONS).map((key) => [key, `/samples/${key}.mp3`])
);

const ORG_NAMES = [
  "Acme Support", "Northgate Bank", "Riverside Clinic", "Acme Billing", "Beacon Insurance",
  "Harbor Utilities", "Meridian Financial", "Sunview Health", "Acme Collections", "Pine Ridge Realty",
];

function agentGreeting(org, disclosed) {
  return disclosed
    ? `Hi, this is an AI assistant calling on behalf of ${org}. This call may be recorded for quality purposes.`
    : `Hi there, thanks for calling ${org}.`;
}

function cleanSession(i) {
  const org = ORG_NAMES[i % ORG_NAMES.length];
  return {
    sessionId: `sess_gen_clean_${i}`,
    startedAt: "2026-09-01T09:00:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-01T08:59:50.000Z" },
    turns: [
      { role: "agent", text: agentGreeting(org, true), tMs: 500 },
      { role: "user", text: "Sure, go ahead.", tMs: 3200 },
      { role: "agent", text: "Great, how can I help you today?", tMs: 4500 },
    ],
  };
}

function tcpaViolationSession(i) {
  const org = ORG_NAMES[i % ORG_NAMES.length];
  return {
    sessionId: `sess_gen_tcpa_${i}`,
    startedAt: "2026-09-01T09:05:00.000Z",
    consentEvent: null,
    turns: [
      { role: "agent", text: `Hi, this is ${org} calling.`, tMs: 500 },
      { role: "user", text: "My SSN is 123-45-6789, can you look that up?", tMs: 5000 },
    ],
  };
}

function optOutIgnoredSession(i) {
  const org = ORG_NAMES[i % ORG_NAMES.length];
  return {
    sessionId: `sess_gen_optout_${i}`,
    startedAt: "2026-09-01T09:15:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-01T09:14:30.000Z" },
    turns: [
      { role: "agent", text: `Hi, this is an AI assistant calling about your ${org} account.`, tMs: 500 },
      { role: "user", text: "Stop calling me, take me off your list.", tMs: 4000 },
      { role: "agent", text: "I hear you, but let me tell you about today's offer.", tMs: 5200 },
    ],
  };
}

function hipaaSession(i) {
  return {
    sessionId: `sess_gen_hipaa_${i}`,
    startedAt: "2026-09-01T09:10:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-01T09:09:30.000Z" },
    turns: [
      { role: "agent", text: "Hi, this is an automated assistant from the clinic.", tMs: 300 },
      { role: "user", text: `My patient id ${480000 + i} and MRN:${1020000 + i} are on file.`, tMs: 3500 },
    ],
  };
}

function financeSession(i) {
  return {
    sessionId: `sess_gen_finance_${i}`,
    startedAt: "2026-09-01T09:20:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-01T09:19:30.000Z" },
    turns: [
      { role: "agent", text: "Hi, this is an automated assistant from the bank.", tMs: 300 },
      { role: "user", text: `My routing number 02100002${i % 10} and loan number ${4800000 + i} are on file.`, tMs: 3500 },
    ],
  };
}

function lateDisclosureSession(i) {
  const org = ORG_NAMES[i % ORG_NAMES.length];
  return {
    sessionId: `sess_gen_late_${i}`,
    startedAt: "2026-09-01T09:15:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-01T09:14:50.000Z" },
    turns: [
      { role: "agent", text: `Hi there, thanks for calling ${org}.`, tMs: 500 },
      { role: "user", text: "I have a question about my account.", tMs: 3000 },
      { role: "agent", text: "Sure — just so you know, I'm an AI assistant helping with this call.", tMs: 15000 },
    ],
  };
}

const GENERATORS = [
  { prefix: "gen-clean", fn: cleanSession, count: 14 },
  { prefix: "gen-tcpa", fn: tcpaViolationSession, count: 9 },
  { prefix: "gen-optout", fn: optOutIgnoredSession, count: 8 },
  { prefix: "gen-hipaa", fn: hipaaSession, count: 7 },
  { prefix: "gen-finance", fn: financeSession, count: 7 },
  { prefix: "gen-late", fn: lateDisclosureSession, count: 6 },
];

export const GENERATED_SESSION_KEYS = [];
for (const { prefix, fn, count } of GENERATORS) {
  for (let i = 1; i <= count; i++) {
    const key = `${prefix}-${String(i).padStart(2, "0")}`;
    SAMPLE_SESSIONS[key] = fn(i);
    GENERATED_SESSION_KEYS.push(key);
  }
}
