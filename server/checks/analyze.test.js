import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeSession } from "./analyze.js";

const cleanSession = {
  sessionId: "sess_clean",
  startedAt: "2026-09-03T10:00:00.000Z",
  consentEvent: { granted: true, timestamp: "2026-09-03T09:59:55.000Z" },
  turns: [
    {
      role: "agent",
      text: "Hi, this is an AI assistant calling on behalf of Acme. This call may be recorded for quality purposes.",
      tMs: 500,
    },
    { role: "user", text: "Sure, go ahead.", tMs: 3000 },
  ],
};

const violatingSession = {
  sessionId: "sess_violation",
  startedAt: "2026-09-03T10:00:00.000Z",
  consentEvent: null,
  turns: [
    { role: "agent", text: "Hi, how can I help you today?", tMs: 500 },
    { role: "user", text: "My SSN is 123-45-6789, can you pull my file?", tMs: 4000 },
  ],
};

const healthcareSession = {
  sessionId: "sess_healthcare",
  startedAt: "2026-09-03T10:00:00.000Z",
  consentEvent: { granted: true, timestamp: "2026-09-03T09:59:00.000Z" },
  turns: [
    { role: "agent", text: "Hi, this is an automated assistant from the clinic.", tMs: 200 },
    { role: "user", text: "My patient id 483920 and MRN:1029384 are on file.", tMs: 3000 },
  ],
};

test("clean session passes consent and disclosure, no PII flagged", () => {
  const report = analyzeSession(cleanSession);
  const byCheck = Object.fromEntries(report.findings.map((f) => [f.check, f]));
  assert.equal(byCheck.consent.status, "pass");
  assert.equal(byCheck.ai_disclosure.status, "pass");
  assert.equal(byCheck.recording_consent.status, "pass");
  assert.equal(byCheck.pii_scan.status, "pass");
});

test("violating session flags missing consent, missing disclosure, and SSN", () => {
  const report = analyzeSession(violatingSession);
  const byCheck = Object.fromEntries(report.findings.map((f) => [f.check, f]));
  assert.equal(byCheck.consent.status, "flag");
  assert.equal(byCheck.ai_disclosure.status, "flag");
  assert.equal(byCheck.recording_consent.status, "flag");
  assert.equal(byCheck.pii_scan.status, "flag");
  assert.equal(byCheck.pii_scan.items[0].patternId, "ssn");
});

test("generic scan alone misses HIPAA identifiers; HIPAA pack catches them as a drop-in extension", () => {
  const genericOnly = analyzeSession(healthcareSession, { patternPackIds: ["generic"] });
  const withHipaa = analyzeSession(healthcareSession, { patternPackIds: ["generic", "hipaa"] });

  const genericPii = genericOnly.findings.find((f) => f.check === "pii_scan");
  const hipaaPii = withHipaa.findings.find((f) => f.check === "pii_scan");

  assert.equal(genericPii.items.length, 0);
  assert.ok(hipaaPii.items.length >= 2);
  assert.ok(hipaaPii.items.some((i) => i.patternId === "mrn"));
  assert.ok(hipaaPii.items.some((i) => i.patternId === "patient_id"));
});

const financeSession = {
  sessionId: "sess_finance",
  startedAt: "2026-09-03T10:00:00.000Z",
  consentEvent: { granted: true, timestamp: "2026-09-03T09:59:00.000Z" },
  turns: [
    { role: "agent", text: "Hi, this is an automated assistant from the bank.", tMs: 200 },
    {
      role: "user",
      text: "My routing number 021000021 and loan number 4837201 are on file.",
      tMs: 3000,
    },
  ],
};

test("generic scan alone misses finance identifiers; finance pack catches them as a drop-in extension", () => {
  const genericOnly = analyzeSession(financeSession, { patternPackIds: ["generic"] });
  const withFinance = analyzeSession(financeSession, { patternPackIds: ["generic", "finance"] });

  const genericPii = genericOnly.findings.find((f) => f.check === "pii_scan");
  const financePii = withFinance.findings.find((f) => f.check === "pii_scan");

  assert.equal(genericPii.items.length, 0);
  assert.ok(financePii.items.length >= 2);
  assert.ok(financePii.items.some((i) => i.patternId === "routing_number"));
  assert.ok(financePii.items.some((i) => i.patternId === "loan_number"));
});
