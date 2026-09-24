export const pcidssPack = {
  id: "pcidss",
  name: "PCI DSS payment card data (voice channel)",
  citation:
    "PCI DSS v4.0.1 Requirement 3.3.1 - sensitive authentication data (CVV/CVC, PIN) must not be retained after authorization, even if encrypted.",
  asserts:
    "Detects spoken CVV/security code and card-expiration utterances - sensitive authentication data PCI DSS forbids ever storing or recording - plus statements implying card data retention. Complements, not duplicates, the generic pack's Luhn card-number scan (which cites general state breach law, not PCI DSS). Not a full PCI DSS audit and cannot verify whether the call itself was recorded.",
  alwaysOn: false,
  patterns: [
    {
      id: "cvv_spoken",
      label: "Possible CVV/security code spoken",
      regex: /\b(?:cvv2?|cvc2?|cid|security\s*code|verification\s*code)\b\s*(?:is|:)?\s*#?\s*\d{3,4}\b/gi,
      specimens: [
        { kind: "positive", utterance: "The CVV is 482, go ahead and process it." },
        {
          kind: "negative",
          utterance: "Please verify your identity with the security code we texted you.",
          why: "no digits follow the keyword, so no CVV value was actually spoken",
        },
      ],
    },
    {
      id: "card_expiration_spoken",
      label: "Possible card expiration date spoken",
      regex: /\bexpir(?:es|ation|y)\b[^.]{0,20}?\b(?:0[1-9]|1[0-2])\s*[/-]\s*\d{2,4}\b/gi,
      specimens: [
        { kind: "positive", utterance: "The card expires 04/27, and the number is 4111111111111111." },
        {
          kind: "negative",
          utterance: "My membership expires in April.",
          why: "no MM/YY-style date follows, so no card expiration was spoken",
        },
      ],
    },
    {
      id: "card_data_retention_intent",
      label: "Possible statement that card data will be recorded or retained",
      regex: /\b(?:record(?:ing)?|save|store|keep|retain)\b[^.]{0,40}\b(?:card\s*(?:number|details)?|cvv|cvc|security\s*code)\b/gi,
      specimens: [
        { kind: "positive", utterance: "I'm going to save your card number and CVV in our system for next time." },
        {
          kind: "negative",
          utterance: "I'm going to note your name and address in our system for next time.",
          why: "no card/CVV mention, so no retention of payment data is implied",
        },
      ],
    },
  ],
  scenarios: [
    {
      id: "card-readback-with-cvv",
      title: "Agent reads back card number, expiration, and CVV, then says it will be saved",
      expectPatternIds: ["cvv_spoken", "card_expiration_spoken", "card_data_retention_intent"],
      session: {
        sessionId: "eval_pcidss_card_readback",
        startedAt: "2026-09-24T10:05:00.000Z",
        consentEvent: { granted: true, timestamp: "2026-09-24T10:04:50.000Z" },
        turns: [
          {
            role: "agent",
            text: "Hi, this is an AI assistant calling from Northgate Travel. This call may be recorded for quality purposes.",
            tMs: 500,
          },
          { role: "user", text: "I'd like to pay for my booking now.", tMs: 5400 },
          {
            role: "user",
            text: "The card number is 4111111111111111, it expires 04/27, and the CVV is 482.",
            tMs: 8900,
          },
          {
            role: "agent",
            text: "Got it, I'm going to save your card number and CVV in our system for next time.",
            tMs: 12400,
          },
        ],
      },
    },
  ],
};
