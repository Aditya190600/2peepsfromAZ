import { caSb1001BotDisclosureCheck } from "../checks/caSb1001Check.js";

// The presence/absence polarity here (absence of disclosure = flag) is the
// opposite of the PII pattern packs (presence of a match = flag), and the
// requirement is a whole-call scan rather than a per-turn regex match, so
// this pack carries no `patterns` for piiScan.js and instead exposes a
// `check` function - the same allowance disclosureCheck.js gets for genuinely
// needing its own logic, extended here to a deterministic regex check rather
// than an LLM one. analyzeSession (server/checks/analyze.js) runs `check` for
// any selected pack that defines one, so it stays selectable via packIds
// exactly like the PII packs.
export const caSb1001Pack = {
  id: "ca_sb1001",
  name: "California SB 1001 (Bot Disclosure Act)",
  citation:
    "Cal. Bus. & Prof. Code §§17940-17942 (SB 1001, operative 2019-07-01) — unlawful to use a bot to communicate with a person with intent to mislead about its artificial identity, when done to incentivize a commercial transaction or influence a vote, unless the bot use is disclosed clearly, conspicuously, and in a manner reasonably designed to inform.",
  asserts:
    "Detects whether the agent self-identified as a bot/AI/automated system anywhere in the call - the statute names no fixed disclosure window, unlike the always-on ai_disclosure check's 10s CA AB 2905-style window. Not a determination of intent to mislead or of commercial-transaction/election purpose, which are separate statutory elements this check does not evaluate.",
  detectionSummary: "Bot/AI self-identification anywhere in call",
  alwaysOn: false,
  patterns: [],
  check: (session) => caSb1001BotDisclosureCheck(session),
  scenarios: [
    {
      id: "no-bot-disclosure-anywhere",
      title: "Agent never discloses it is a bot/AI across the whole call",
      expectCheckId: "ca_sb1001_bot_disclosure",
      expectCheckStatus: "flag",
      session: {
        sessionId: "eval_ca_sb1001_no_disclosure",
        startedAt: "2026-09-10T10:30:00.000Z",
        consentEvent: { granted: true, timestamp: "2026-09-10T10:29:50.000Z" },
        turns: [
          { role: "agent", text: "Hi there, thanks for calling Riverside Clinic.", tMs: 500 },
          { role: "user", text: "I'd like to book an appointment.", tMs: 6000 },
          { role: "agent", text: "Sure, let's find a time that works for you.", tMs: 9200 },
        ],
      },
    },
  ],
};
