export const financePack = {
  id: "finance",
  name: "GLBA finance identifiers (banking)",
  citation: "GLBA Safeguards Rule, 15 U.S.C. §6801 — nonpublic personal financial information must be protected.",
  asserts:
    "Detects 3 spoken identifier shapes (ABA routing, IBAN, loan/brokerage number). Not a GLBA Safeguards audit.",
  alwaysOn: false,
  patterns: [
    {
      id: "routing_number",
      label: "Possible ABA routing number",
      regex: /\brouting\s*(?:number|#)?\s*[:#-]?\s*\d{9}\b/gi,
      specimens: [
        { kind: "positive", utterance: "The routing number 021000021 is on the form." },
        { kind: "negative", utterance: "The transit number is 021000021.", why: "routing keyword required" },
      ],
    },
    {
      id: "iban",
      label: "Possible IBAN",
      regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
      specimens: [
        { kind: "positive", utterance: "Wire it to GB82WEST12345698765432." },
        { kind: "negative", utterance: "Wire it to gb82west12345698765432.", why: "IBAN regex is case-sensitive" },
      ],
    },
    {
      id: "loan_number",
      label: "Possible loan or brokerage number",
      regex: /\b(?:loan|brokerage)\s*(?:number|#)\s*[:#-]?\s*\d{6,12}\b/gi,
      specimens: [
        { kind: "positive", utterance: "I see an open loan number 4812093." },
        { kind: "negative", utterance: "I see an open file number 4812093.", why: "loan/brokerage keyword required" },
      ],
    },
  ],
  scenarios: [
    {
      id: "account-disclosure",
      title: "Agent reads back routing and loan numbers",
      expectPatternIds: ["routing_number", "loan_number"],
      session: {
        sessionId: "eval_finance_account_disclosure",
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
    },
  ],
};
