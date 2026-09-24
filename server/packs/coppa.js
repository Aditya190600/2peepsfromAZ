export const coppaPack = {
  id: "coppa",
  name: "COPPA signals (children's privacy)",
  citation:
    "Children's Online Privacy Protection Act, 15 U.S.C. §§6501-6506, implemented by the FTC's COPPA Rule, 16 CFR Part 312 - personal information defined at §312.2, verifiable parental consent required before collection at §312.5, for any operator with actual knowledge it is dealing with a child under 13.",
  asserts:
    "Detects 3 transcript-visible signals a caller may be a child under 13 talking to the agent without a parent/guardian mediating: self-stated age under 13, self-stated K-7 grade level, and a child disclosing their own name together with their school. These are fuzzy conversational signals, not a COPPA compliance determination or an age-verification method under §312.5.",
  alwaysOn: false,
  patterns: [
    {
      id: "minor_self_identified_age",
      label: "Possible self-identified age under 13",
      regex: /\bI(?:'m| am)\s+(?:only\s+)?(?:\d|1[0-2])\s*(?:years?\s*old|yo)\b/gi,
      specimens: [
        { kind: "positive", utterance: "I'm 8 years old and I need help with my homework." },
        {
          kind: "negative",
          utterance: "I'm 13 years old and I have a question about my account.",
          why: "age 13 is at/above COPPA's under-13 threshold",
        },
      ],
    },
    {
      id: "minor_self_identified_grade",
      label: "Possible self-identified K-7 grade level",
      regex:
        /\bI(?:'m| am)\s+(?:a\s+)?(?:in\s+)?(?:the\s+)?(?:kindergartner|kindergarten|1st|2nd|3rd|4th|5th|6th|7th)\s*(?:grade|grader)\b/gi,
      specimens: [
        { kind: "positive", utterance: "I'm in the 3rd grade at Lincoln Elementary." },
        {
          kind: "negative",
          utterance: "My teacher is in the 3rd grade classroom next door.",
          why: "third-party reference, not the caller self-identifying",
        },
      ],
    },
    {
      id: "child_name_school_disclosure",
      label: "Possible child self-disclosure of name and school together",
      regex:
        /\bmy name is\s+[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s*,?\s*(?:and\s+)?(?:I go to|I'm at|I attend)\s+[A-Z][A-Za-z.\s]+(?:School|Elementary|Middle School)\b/gi,
      specimens: [
        { kind: "positive", utterance: "My name is Emma Carter and I go to Lincoln Elementary School." },
        {
          kind: "negative",
          utterance: "My name is Emma Carter and I go to the pharmacy on Main Street.",
          why: "no school reference, not a child-identifying disclosure",
        },
      ],
    },
  ],
  scenarios: [
    {
      id: "child-caller-self-discloses",
      title: "Caller who self-identifies as a young child discloses name and school",
      expectPatternIds: [
        "minor_self_identified_age",
        "minor_self_identified_grade",
        "child_name_school_disclosure",
      ],
      session: {
        sessionId: "eval_coppa_child_caller_self_discloses",
        startedAt: "2026-09-10T10:20:00.000Z",
        consentEvent: { granted: true, timestamp: "2026-09-10T10:19:50.000Z" },
        turns: [
          {
            role: "agent",
            text: "Hi, this is an AI assistant calling from Mesa Valley School nurse's office. This call may be recorded for quality purposes.",
            tMs: 500,
          },
          { role: "user", text: "Hi, my stomach hurts and I want to go home.", tMs: 5200 },
          {
            role: "agent",
            text: "I'm sorry to hear that. Can you tell me your name and a bit about yourself?",
            tMs: 8000,
          },
          {
            role: "user",
            text: "My name is Emma Carter and I go to Lincoln Elementary School. I'm 8 years old and I'm in the 3rd grade.",
            tMs: 12400,
          },
        ],
      },
    },
  ],
};
