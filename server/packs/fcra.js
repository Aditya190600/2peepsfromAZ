import { fcraAdverseActionDisclosureCheck, fcraCreditPullPermissiblePurposeCheck } from "../checks/fcraCheck.js";

export const fcraPack = {
  id: "fcra",
  name: "FCRA credit-related calls (finance)",
  citation:
    "FCRA, 15 U.S.C. §1681m(a) - adverse action based on a consumer report requires notice naming the reporting agency and the consumer's right to a free report and to dispute; §1681b - a consumer report may only be obtained for a permissible purpose disclosed to the consumer.",
  asserts:
    "Detects 3 spoken FCRA risk shapes: adverse action stated with no §1681m disclosure content anywhere in the call, a credit report/check pull mentioned with no permissible-purpose language anywhere in the call, and a spoken credit score or report readback. The first two scan the whole call, not just the triggering turn, so a disclosure spoken in a later turn is not a false positive. Not a full FCRA compliance determination.",
  alwaysOn: false,
  checks: [fcraAdverseActionDisclosureCheck, fcraCreditPullPermissiblePurposeCheck],
  patterns: [
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
      id: "adverse-action-and-pull-no-disclosure",
      title: "Agent pulls credit and denies credit without required disclosures anywhere in the call",
      expectPatternIds: ["credit_score_or_report_spoken"],
      session: {
        sessionId: "eval_fcra_adverse_action_and_pull_no_disclosure",
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
    {
      id: "adverse-action-and-pull-with-later-disclosure",
      title: "Agent pulls credit and denies credit, with required disclosures spoken in a later turn",
      expectPatternIds: ["credit_score_or_report_spoken"],
      session: {
        sessionId: "eval_fcra_adverse_action_and_pull_with_later_disclosure",
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
            text: "Sure, I'm going to pull your credit report now, but only with your authorization for this loan application. Your credit score is 640, which is on file.",
            tMs: 8400,
          },
          {
            role: "agent",
            text: "We're denying your loan application based on your credit report.",
            tMs: 12900,
          },
          {
            role: "agent",
            text: "You have the right to dispute the accuracy of this with the reporting agency and get a free copy of your report.",
            tMs: 16200,
          },
        ],
      },
    },
  ],
};
