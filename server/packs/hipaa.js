export const hipaaPack = {
  id: "hipaa",
  name: "HIPAA identifiers (healthcare)",
  citation:
    "HIPAA Privacy Rule Safe Harbor, 45 CFR §164.514(b)(2) — 18 identifier categories requiring de-identification.",
  asserts:
    "Detects 3 spoken identifier shapes (MRN, NPI, patient ID). Not HIPAA's 18 Safe Harbor categories and not a HIPAA compliance determination.",
  alwaysOn: false,
  patterns: [
    {
      id: "mrn",
      label: "Possible Medical Record Number (MRN)",
      regex: /\bMRN[:\s#-]?\d{6,10}\b/gi,
      specimens: [
        { kind: "positive", utterance: "My MRN:1029384 is on file." },
        { kind: "negative", utterance: "My member number is 1029384.", why: "no MRN prefix" },
      ],
    },
    {
      id: "npi",
      label: "Possible National Provider Identifier (NPI)",
      regex: /\bNPI[:\s#-]?\d{10}\b/gi,
      specimens: [
        { kind: "positive", utterance: "The provider NPI:1234567893 is on the claim." },
        { kind: "negative", utterance: "The provider number is 1234567893.", why: "no NPI prefix" },
      ],
    },
    {
      id: "patient_id",
      label: "Possible patient ID",
      regex: /\bpatient\s*(?:id|#)\s*[:#-]?\s*\d{4,8}\b/gi,
      specimens: [
        { kind: "positive", utterance: "I have you as patient id 552017." },
        { kind: "negative", utterance: "I have you as member id 552017.", why: "patient keyword required" },
      ],
    },
  ],
  scenarios: [
    {
      id: "diagnosis-readback",
      title: "Agent reads back diagnosis and MRN",
      expectPatternIds: ["patient_id", "mrn"],
      session: {
        sessionId: "eval_hipaa_diagnosis_readback",
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
    },
  ],
};
