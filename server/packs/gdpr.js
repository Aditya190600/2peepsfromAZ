export const gdprPack = {
  id: "gdpr",
  name: "GDPR EU caller data (data protection/consent)",
  citation:
    "EU Regulation 2016/679 (GDPR) — Art. 6/7 lawful basis and consent conditions; Art. 13/14 information to be provided to the data subject.",
  asserts:
    "Detects 3 spoken transcript signals (EU national ID/passport number, IBAN, and a caller statement indicating EU residency or citizenship). Not a GDPR compliance determination, not a lawful-basis or Art. 13/14 notice check, and not verification that consent was actually obtained - flags signals for human review only.",
  alwaysOn: false,
  patterns: [
    {
      id: "eu_national_id",
      label: "Possible EU national ID or passport number",
      regex: /\b(?:national\s*id(?:entity)?(?:\s*card)?\s*number|passport\s*number)\s*[:#-]?\s*[A-Z0-9]{6,12}\b/gi,
      specimens: [
        { kind: "positive", utterance: "My national ID number is X1234567." },
        { kind: "negative", utterance: "My employee number is X1234567.", why: "national ID/passport keyword required" },
      ],
    },
    {
      id: "eu_iban",
      label: "Possible IBAN",
      regex: /\bIBAN\s*[:#-]?\s*[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/gi,
      specimens: [
        { kind: "positive", utterance: "My IBAN is DE89370400440532013000." },
        { kind: "negative", utterance: "My account number is DE89370400440532013000.", why: "IBAN keyword required" },
      ],
    },
    {
      id: "eu_residency_indicator",
      label: "Caller statement indicating EU residency or citizenship",
      regex:
        /\bI(?:'?m| am)\s+(?:calling|based|located)\s+(?:from|in)\s+(?:the\s+EU|the\s+European\s+Union|Germany|France|Spain|Italy|the\s+Netherlands|Ireland|Poland|Belgium|Austria|Portugal|Sweden|Denmark|Finland|Greece|Czechia|Hungary|Romania|Bulgaria|Croatia|Slovakia|Slovenia|Lithuania|Latvia|Estonia|Luxembourg|Malta|Cyprus)\b|\bI(?:'?m| am)\s+an?\s+EU\s+citizen\b/gi,
      specimens: [
        { kind: "positive", utterance: "I'm calling from Germany and I'd like to update my details." },
        { kind: "negative", utterance: "I'm calling from the Texas office.", why: "not an EU country/EU citizenship statement" },
      ],
    },
  ],
  scenarios: [
    {
      id: "eu-caller-iban-readback",
      title: "EU caller shares national ID and IBAN with no consent language",
      expectPatternIds: ["eu_residency_indicator", "eu_national_id", "eu_iban"],
      session: {
        sessionId: "eval_gdpr_eu_caller_iban_readback",
        startedAt: "2026-09-10T10:20:00.000Z",
        turns: [
          { role: "agent", text: "Thanks for calling support, how can I help today?", tMs: 500 },
          {
            role: "user",
            text: "I'm calling from Germany to update my refund details. My national ID number is X1234567 and my IBAN is DE89370400440532013000.",
            tMs: 6200,
          },
          { role: "agent", text: "Got it, I'll update that on your account now.", tMs: 11800 },
        ],
      },
    },
  ],
};
