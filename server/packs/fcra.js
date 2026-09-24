export const fcraPack = {
  id: "fcra",
  name: "FCRA credit-related calls (finance)",
  citation:
    "FCRA, 15 U.S.C. §1681m(a) - adverse action based on a consumer report requires notice naming the reporting agency and the consumer's right to a free report and to dispute; §1681b - a consumer report may only be obtained for a permissible purpose disclosed to the consumer.",
  asserts:
    "Detects 3 spoken FCRA risk shapes: adverse action stated without §1681m disclosure content nearby, a credit report/check pull mentioned without permissible-purpose language nearby, and a spoken credit score or report readback. Not a full FCRA compliance determination.",
  alwaysOn: false,
  patterns: [
    {
      id: "adverse_action_missing_disclosure",
      label: "Adverse action stated without FCRA §1681m disclosure",
      regex:
        /\b(?:den(?:y|ies|ied|ying)|reject(?:s|ed|ing)?|increas(?:e|es|ed|ing))\b[^.!?]{0,80}\bcredit\s+(?:report|history|score)\b(?![\s\S]{0,180}\b(?:right to dispute|free copy|dispute the accuracy|reporting agency)\b)/gi,
      specimens: [
        {
          kind: "positive",
          utterance: "We're denying your loan application based on your credit report. Have a good day.",
        },
        {
          kind: "negative",
          utterance:
            "We're denying your loan application based on your credit report. You have the right to dispute the accuracy of this with the reporting agency and get a free copy of your report.",
          why: "required §1681m disclosure content follows the adverse-action language",
        },
      ],
    },
    {
      id: "credit_pull_missing_permissible_purpose",
      label: "Credit report pull mentioned without permissible-purpose disclosure",
      regex:
        /\b(?:pull|run|check|access)\b[^.!?]{0,40}\bcredit\s*(?:report|check|history)\b(?![^.!?]{0,150}\b(?:authoriz\w*|permission|consent|your approval)\b)/gi,
      specimens: [
        {
          kind: "positive",
          utterance: "I'm going to pull your credit report now to check your application.",
        },
        {
          kind: "negative",
          utterance:
            "I'm going to pull your credit report now, but only with your authorization for this loan application.",
          why: "permissible-purpose/authorization language follows the credit-pull mention",
        },
      ],
    },
    {
      id: "credit_score_or_report_spoken",
      label: "Spoken credit score or credit report readback",
      regex: /\bcredit\s+(?:score\s*(?:is|of|:)?\s*\d{3}|report\s+shows|report\s+says)\b/gi,
      specimens: [
        { kind: "positive", utterance: "Your credit score is 640, which is on file." },
        {
          kind: "negative",
          utterance: "Your customer satisfaction score is 640, which is on file.",
          why: "credit keyword required",
        },
      ],
    },
  ],
  scenarios: [
    {
      id: "adverse-action-and-pull",
      title: "Agent pulls credit and denies credit without required disclosures",
      expectPatternIds: [
        "credit_pull_missing_permissible_purpose",
        "credit_score_or_report_spoken",
        "adverse_action_missing_disclosure",
      ],
      session: {
        sessionId: "eval_fcra_adverse_action_and_pull",
        startedAt: "2026-09-10T10:15:00.000Z",
        consentEvent: { granted: true, timestamp: "2026-09-10T10:14:50.000Z" },
        turns: [
          {
            role: "agent",
            text: "Hi, this is an AI assistant calling from Northgate Lending. This call may be recorded for quality purposes.",
            tMs: 500,
          },
          { role: "user", text: "I'm calling about the personal loan I applied for.", tMs: 5100 },
          {
            role: "agent",
            text: "Sure, I'm going to pull your credit report now to check your application. Your credit score is 640, which is on file.",
            tMs: 8400,
          },
          {
            role: "agent",
            text: "We're denying your loan application based on your credit report. Have a good day.",
            tMs: 12900,
          },
        ],
      },
    },
  ],
};
