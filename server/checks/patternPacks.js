// Pluggable PII pattern-pack architecture. Each pack is a plain object with an
// id/name and a list of {id, label, regex} patterns. piiScan.js runs whichever
// packs it's given - adding an industry pack means adding one more object here
// (or importing one from elsewhere) and passing it in, no core-code changes.

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
  patterns: [
    {
      id: "ssn",
      label: "Possible SSN",
      regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    },
    {
      id: "credit_card",
      label: "Possible credit card number",
      regex: /\b(?:\d[ -]?){13,16}\b/g,
      validate: (match) => luhnValid(match.replace(/[ -]/g, "")),
    },
    {
      id: "account_number",
      label: "Possible account number",
      regex: /\baccount(?:\s+number)?\s*(?:is|:)?\s*#?\d{6,12}\b/gi,
    },
  ],
};

export const hipaaPack = {
  id: "hipaa",
  name: "HIPAA identifiers (drop-in industry pack)",
  patterns: [
    {
      id: "mrn",
      label: "Possible Medical Record Number (MRN)",
      regex: /\bMRN[:\s#-]?\d{6,10}\b/gi,
    },
    {
      id: "npi",
      label: "Possible National Provider Identifier (NPI)",
      regex: /\bNPI[:\s#-]?\d{10}\b/gi,
    },
    {
      id: "patient_id",
      label: "Possible patient ID",
      regex: /\bpatient\s*(?:id|#)\s*[:#-]?\s*\d{4,8}\b/gi,
    },
  ],
};

export const financePack = {
  id: "finance",
  name: "GLBA finance identifiers (drop-in industry pack)",
  patterns: [
    {
      id: "routing_number",
      label: "Possible ABA routing number",
      regex: /\brouting\s*(?:number|#)?\s*[:#-]?\s*\d{9}\b/gi,
    },
    {
      id: "iban",
      label: "Possible IBAN",
      regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
    },
    {
      id: "loan_number",
      label: "Possible loan or brokerage number",
      regex: /\b(?:loan|brokerage)\s*(?:number|#)\s*[:#-]?\s*\d{6,12}\b/gi,
    },
  ],
};
