function luhnValid(digitsOnly) {
  let sum = 0;
  let alternate = false;
  for (let i = digitsOnly.length - 1; i >= 0; i--) {
    let d = Number(digitsOnly[i]);
    if (alternate) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

export const genericPack = {
  id: "generic",
  name: "Generic PII (SSN / credit card / account number)",
  citation:
    "State data-breach notification laws (e.g. Cal. Civ. Code §1798.82) — SSN/card/account numbers are regulated PII.",
  asserts:
    "Detects spoken SSN, Luhn-valid card, and account-number shapes. Not a full state-breach program.",
  alwaysOn: true,
  patterns: [
    {
      id: "ssn",
      label: "Possible SSN",
      regex: /\b\d{3}-\d{2}-\d{4}\b/g,
      specimens: [
        { kind: "positive", utterance: "My social is 123-45-6789 on the form." },
        { kind: "negative", utterance: "Please call me back at 123 456 7890.", why: "phone digits, not SSN dashes" },
      ],
    },
    {
      id: "credit_card",
      label: "Possible credit card number",
      regex: /\b(?:\d[ -]?){13,16}\b/g,
      validate: (match) => luhnValid(match.replace(/[ -]/g, "")),
      specimens: [
        { kind: "positive", utterance: "The card on file is 4111111111111111." },
        {
          kind: "negative",
          utterance: "The card on file is 4111111111111112.",
          why: "16 digits that fail Luhn",
        },
      ],
    },
    {
      id: "account_number",
      label: "Possible account number",
      regex: /\baccount(?:\s+number)?\s*(?:is|:)?\s*#?\d{6,12}\b/gi,
      specimens: [
        { kind: "positive", utterance: "My account number is 48392011." },
        { kind: "negative", utterance: "I opened an account last week.", why: "no digits after account" },
      ],
    },
  ],
  scenarios: [],
};
