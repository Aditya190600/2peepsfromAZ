export const ferpaPack = {
  id: "ferpa",
  name: "FERPA identifiers (education)",
  citation:
    "FERPA, 34 CFR §99.3 — education-record PII includes student numbers and direct or indirect identifiers linked to a student.",
  asserts:
    "Detects 3 labeled student-record identifier disclosures (student number, student date of birth, and student's mother's maiden name). FERPA PII is broader and context-dependent; not a FERPA compliance determination.",
  alwaysOn: false,
  patterns: [
    {
      id: "student_number",
      label: "Possible student number",
      regex:
        /\b(?:student|pupil|learner)\s*(?:id(?:entification)?(?:\s+number)?|identifier|number|#)\s*(?:is|:|#|-)?\s*(?=[A-Z0-9-]*\d)[A-Z0-9](?:[A-Z0-9-]{3,18}[A-Z0-9])\b/gi,
      specimens: [
        { kind: "positive", utterance: "The student number is STU-4829017." },
        {
          kind: "negative",
          utterance: "The employee number is STU-4829017.",
          why: "student context required",
        },
      ],
    },
    {
      id: "student_dob",
      label: "Possible student date of birth",
      regex:
        /\b(?:student|pupil|learner)(?:['’]s)?\s*(?:date of birth|dob)\s*(?:is|:|-)\s*(?:0?[1-9]|1[0-2])[\/-](?:0?[1-9]|[12]\d|3[01])[\/-](?:19|20)\d{2}\b/gi,
      specimens: [
        { kind: "positive", utterance: "The student's date of birth is 04/17/2009." },
        {
          kind: "negative",
          utterance: "The semester start date is 04/17/2009.",
          why: "student date-of-birth label required",
        },
      ],
    },
    {
      id: "mothers_maiden_name",
      label: "Possible student's mother's maiden name",
      regex:
        /\b(?:student|pupil|learner)(?:['’]s)?\s+mother(?:['’]s)?\s+maiden\s+name\s*(?:is|:|-)\s+[A-Z][A-Z'’-]{1,30}\b/gi,
      specimens: [
        {
          kind: "positive",
          utterance: "The student's mother's maiden name is Ramirez.",
        },
        {
          kind: "negative",
          utterance: "The customer's mother's maiden name is Ramirez.",
          why: "student context required",
        },
      ],
    },
  ],
  scenarios: [
    {
      id: "student-record-readback",
      title: "Agent reads back student-record identifiers",
      expectPatternIds: ["student_number", "student_dob", "mothers_maiden_name"],
      session: {
        sessionId: "eval_ferpa_student_record_readback",
        startedAt: "2026-09-10T10:10:00.000Z",
        consentEvent: { granted: true, timestamp: "2026-09-10T10:09:50.000Z" },
        turns: [
          {
            role: "agent",
            text: "Hi, this is an AI assistant calling from Mesa Valley School. This call may be recorded for quality purposes.",
            tMs: 500,
          },
          { role: "user", text: "I am calling to verify the enrollment record.", tMs: 5200 },
          {
            role: "agent",
            text: "I found student ID STU-4829017. The student's date of birth is 04/17/2009, and the student's mother's maiden name is Ramirez.",
            tMs: 8600,
          },
        ],
      },
    },
  ],
};
