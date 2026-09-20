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

  // Bounded, scripted HIPAA/GLBA violation demos (hackathon C-narrowing: no
  // adversarial-eval framework, just two concrete scripted scenarios run
  // through the real pipeline - see docs/complyline-narrowing-scoring-analysis).
  "hipaa-diagnosis-readback": {
    sessionId: "sess_demo_hipaa_readback",
    startedAt: "2026-09-10T10:00:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-10T09:59:50.000Z" },
    turns: [
      {
        role: "agent",
        text: "Hi, this is an AI assistant calling from Riverside Clinic. This call may be recorded for quality purposes.",
        tMs: 500,
      },
      { role: "user", text: "Hi, I'm calling to confirm my recent lab results.", tMs: 6200 },
      {
        role: "agent",
        text: "Sure, let me pull that up. I have you as patient id 552017, MRN:1148302 - your chart shows a diagnosis of type 2 diabetes, confirmed on your last visit.",
        tMs: 9800,
      },
    ],
  },
  "glba-account-disclosure": {
    sessionId: "sess_demo_glba_disclosure",
    startedAt: "2026-09-10T10:05:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-10T10:04:50.000Z" },
    turns: [
      {
        role: "agent",
        text: "Hi, this is an AI assistant calling from Northgate Bank. This call may be recorded for quality purposes.",
        tMs: 500,
      },
      { role: "user", text: "I need to verify my checking account before I set up a transfer.", tMs: 5400 },
      {
        role: "agent",
        text: "Of course - your checking account has routing number 021000021, and I see an open loan number 4812093 on file as well.",
        tMs: 8900,
      },
    ],
  },
};

export const SCRIPTED_VIOLATION_DEMO_KEYS = ["hipaa-diagnosis-readback", "glba-account-disclosure"];

// Only these six sessions have a recorded companion file in public/samples -
// the "playable" set (see the file header comment). The two scripted
// HIPAA/GLBA violation demos above and everything in GENERATED_SESSIONS below
// are text-only, so a fleet reads as a program under review (~50 calls)
// rather than 6 fixtures. Keep this list literal rather than derived from
// SAMPLE_SESSIONS' keys - deriving it silently mapped every session (including
// ones with no mp3) to a dead /samples/<key>.mp3 URL.
export const PLAYABLE_SAMPLE_KEYS = [
  "clean-call",
  "tcpa-violation",
  "optout-ignored",
  "healthcare-hipaa",
  "late-disclosure",
  "clean-call-2",
];

export const SAMPLE_AUDIO_URLS = Object.fromEntries(
  PLAYABLE_SAMPLE_KEYS.map((key) => [key, `/samples/${key}.mp3`])
);

// Northstar Voice: the default Home-path demo catalog (issue #32). Exactly
// 12 sessions so a judge can narrate the whole program in under a minute -
// 10 pass, 2 flagged (sess_tcpa_04 critical, sess_late_01 high), 83%
// compliance. Verdicts come from the real analyze.js pipeline, not hardcoded:
// see analyze.test.js for the assertion pinning these counts/severities.
// No named orgs/people in the transcript text - the LLM Gateway NER pass in
// piiScan.js flags organization/person names, which would push these two
// flagged sessions to "critical" (pii_scan) and break the pinned severities.
const CLEAN_DISCLOSURE_TURN = {
  role: "agent",
  text: "Hi, this is an AI assistant. This call may be recorded for quality purposes.",
  tMs: 500,
};

function northstarClean(n, userLine, agentReply) {
  return {
    sessionId: `sess_clean_${String(n).padStart(2, "0")}`,
    startedAt: "2026-09-05T09:00:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-05T08:59:50.000Z" },
    turns: [
      CLEAN_DISCLOSURE_TURN,
      { role: "user", text: userLine, tMs: 3200 },
      { role: "agent", text: agentReply, tMs: 4500 },
    ],
  };
}

const NORTHSTAR_CLEAN_TOPICS = [
  ["Sure, go ahead.", "Great, your billing reminder is set for next week."],
  ["Okay, what's this about?", "Just confirming your appointment for tomorrow at noon."],
  ["Go ahead.", "Your order shipped this morning and should arrive Thursday."],
  ["Sure.", "Your subscription renews next month at the same rate."],
  ["What's going on?", "We wanted to let you know about a brief service outage last night."],
  ["Sure, ask away.", "We'd like your feedback on a recent support interaction, if you have a minute."],
  ["Go ahead.", "Your payment was received and your balance is now zero."],
  ["Okay.", "Your policy is up for renewal next month - no action needed unless you want to change coverage."],
  ["Sure.", "We can schedule your delivery for any weekday morning next week."],
  ["Go ahead.", "We just need to confirm a couple of details on file, then we're done."],
];

export const NORTHSTAR_SESSIONS = {};
export const NORTHSTAR_SESSION_KEYS = [];
NORTHSTAR_CLEAN_TOPICS.forEach(([userLine, agentReply], i) => {
  const n = i + 1;
  const key = `sess_clean_${String(n).padStart(2, "0")}`;
  NORTHSTAR_SESSIONS[key] = northstarClean(n, userLine, agentReply);
  NORTHSTAR_SESSION_KEYS.push(key);
});

// Critical: no consent event logged before the call (TCPA). Disclosure and
// recording language are both present so consent is the only thing flagged.
NORTHSTAR_SESSIONS["sess_tcpa_04"] = {
  sessionId: "sess_tcpa_04",
  startedAt: "2026-09-05T09:05:00.000Z",
  consentEvent: null,
  turns: [
    CLEAN_DISCLOSURE_TURN,
    { role: "user", text: "Okay, go ahead.", tMs: 3200 },
    { role: "agent", text: "Can you confirm the last four digits of your account number?", tMs: 4500 },
  ],
};
NORTHSTAR_SESSION_KEYS.push("sess_tcpa_04");

// High: AI-disclosure language only shows up after the 10s disclosure
// window, so ai_disclosure flags. Recording-disclosure language is present
// in the opening turn, so recording_consent still passes.
NORTHSTAR_SESSIONS["sess_late_01"] = {
  sessionId: "sess_late_01",
  startedAt: "2026-09-05T09:15:00.000Z",
  consentEvent: { granted: true, timestamp: "2026-09-05T09:14:50.000Z" },
  turns: [
    { role: "agent", text: "Thanks for calling. This call may be recorded for quality purposes.", tMs: 500 },
    { role: "user", text: "I have a question about my account.", tMs: 3000 },
    { role: "agent", text: "Just so you know, you're speaking with an AI system helping with this call.", tMs: 15000 },
  ],
};
NORTHSTAR_SESSION_KEYS.push("sess_late_01");

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
