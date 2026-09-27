import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeSession } from "./analyze.js";
import { LlmGatewayRateLimitError } from "./llmGateway.js";
import { piiScan } from "./piiScan.js";
import { genericPack } from "./patternPacks.js";

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

const paraphraseDisclosureSession = {
  sessionId: "sess_paraphrase",
  startedAt: "2026-09-03T10:00:00.000Z",
  consentEvent: { granted: true, timestamp: "2026-09-03T09:59:55.000Z" },
  turns: [
    { role: "agent", text: "Hi there, I'm a computer program helping you today.", tMs: 400 },
    { role: "user", text: "Okay, sounds good.", tMs: 3000 },
  ],
};

// Fakes the LLM Gateway so tests never hit the network or need an API key.
// Distinguishes the disclosure-check call from the PII-NER call by the
// system prompt's content, matching the two prompts in the real checks.
function fakeLlmGateway({ disclosed = { disclosed: false, turnIndex: null, quote: null }, nerItems = [] } = {}) {
  return async (messages) => {
    const systemPrompt = messages[0].content;
    if (systemPrompt.includes("disclos")) {
      return JSON.stringify(disclosed);
    }
    return JSON.stringify({ items: nerItems });
  };
}

test("clean session passes consent and disclosure, no PII flagged", async () => {
  const llmGateway = fakeLlmGateway({ disclosed: { disclosed: true, turnIndex: 0, quote: "I'm an AI assistant" } });
  const report = await analyzeSession(cleanSession, { llmGateway });
  const byCheck = Object.fromEntries(report.findings.map((f) => [f.check, f]));
  assert.equal(byCheck.consent.status, "pass");
  assert.equal(byCheck.ai_disclosure.status, "pass");
  assert.equal(byCheck.recording_consent.status, "pass");
  assert.equal(byCheck.pii_scan.status, "pass");
});

test("violating session flags missing consent, missing disclosure, and SSN", async () => {
  const llmGateway = fakeLlmGateway();
  const report = await analyzeSession(violatingSession, { llmGateway });
  const byCheck = Object.fromEntries(report.findings.map((f) => [f.check, f]));
  assert.equal(byCheck.consent.status, "flag");
  assert.equal(byCheck.ai_disclosure.status, "flag");
  assert.equal(byCheck.recording_consent.status, "flag");
  assert.equal(byCheck.pii_scan.status, "flag");
  assert.equal(byCheck.pii_scan.items[0].patternId, "ssn");
  assert.equal(report.violationCount, 4);
});

test("report shape carries a violation count and a usage total (item 8: live-analysis metrics)", async () => {
  const llmGateway = async () => ({
    content: JSON.stringify({ disclosed: true, turnIndex: 0, quote: "I'm an AI" }),
    usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    costUsd: 0.00003,
  });
  const report = await analyzeSession(cleanSession, { llmGateway });
  assert.equal(report.violationCount, 0);
  // disclosureCheck and piiScan both call the Gateway with this session - two calls' worth of usage.
  assert.equal(report.usage.calls, 2);
  assert.equal(report.usage.totalTokens, 240);
  assert.ok(Math.abs(report.usage.estimatedCostUsd - 0.00006) < 1e-9);
});

test("onCheckComplete fires once per check with running done/total counts", async () => {
  const llmGateway = fakeLlmGateway();
  const seen = [];
  await analyzeSession(violatingSession, {
    llmGateway,
    onCheckComplete: (finding, done, total) => seen.push({ check: finding.check, done, total }),
  });
  assert.equal(seen.length, 7);
  assert.deepEqual(
    seen.map((s) => s.total),
    [7, 7, 7, 7, 7, 7, 7],
  );
  assert.deepEqual(
    seen.map((s) => s.done).sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7],
  );
});

test("no opt-out request reports n/a, not a false flag", async () => {
  const llmGateway = fakeLlmGateway({ disclosed: { disclosed: true, turnIndex: 0, quote: "AI assistant" } });
  const report = await analyzeSession(cleanSession, { llmGateway });
  const byCheck = Object.fromEntries(report.findings.map((f) => [f.check, f]));
  assert.equal(byCheck.opt_out.status, "n/a");
});

test("opt-out request honored by the agent passes", async () => {
  const llmGateway = fakeLlmGateway({ disclosed: { disclosed: true, turnIndex: 0, quote: "AI assistant" } });
  const session = {
    sessionId: "sess_optout_honored",
    startedAt: "2026-09-03T10:00:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-03T09:59:00.000Z" },
    turns: [
      { role: "agent", text: "Hi, this is an AI assistant calling about your account.", tMs: 500 },
      { role: "user", text: "Stop calling me, take me off your list.", tMs: 4000 },
      { role: "agent", text: "Understood, I've removed you from our calling list.", tMs: 5000 },
    ],
  };
  const report = await analyzeSession(session, { llmGateway });
  const byCheck = Object.fromEntries(report.findings.map((f) => [f.check, f]));
  assert.equal(byCheck.opt_out.status, "pass");
});

test("opt-out request ignored by the agent flags", async () => {
  const llmGateway = fakeLlmGateway({ disclosed: { disclosed: true, turnIndex: 0, quote: "AI assistant" } });
  const session = {
    sessionId: "sess_optout_ignored",
    startedAt: "2026-09-03T10:00:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-03T09:59:00.000Z" },
    turns: [
      { role: "agent", text: "Hi, this is an AI assistant calling about your account.", tMs: 500 },
      { role: "user", text: "Stop calling me, remove me from your list.", tMs: 4000 },
      { role: "agent", text: "I understand, but let me tell you about our new offer.", tMs: 5000 },
      { role: "agent", text: "This deal is only available today.", tMs: 8000 },
    ],
  };
  const report = await analyzeSession(session, { llmGateway });
  const byCheck = Object.fromEntries(report.findings.map((f) => [f.check, f]));
  assert.equal(byCheck.opt_out.status, "flag");
});

test("generic scan alone misses HIPAA identifiers; HIPAA pack catches them as a drop-in extension", async () => {
  const llmGateway = fakeLlmGateway({ disclosed: { disclosed: true, turnIndex: 0, quote: "automated assistant" } });
  const genericOnly = await analyzeSession(healthcareSession, { patternPackIds: ["generic"], llmGateway });
  const withHipaa = await analyzeSession(healthcareSession, { patternPackIds: ["generic", "hipaa"], llmGateway });

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

test("generic scan alone misses finance identifiers; finance pack catches them as a drop-in extension", async () => {
  const llmGateway = fakeLlmGateway({ disclosed: { disclosed: true, turnIndex: 0, quote: "automated assistant" } });
  const genericOnly = await analyzeSession(financeSession, { patternPackIds: ["generic"], llmGateway });
  const withFinance = await analyzeSession(financeSession, { patternPackIds: ["generic", "finance"], llmGateway });

  const genericPii = genericOnly.findings.find((f) => f.check === "pii_scan");
  const financePii = withFinance.findings.find((f) => f.check === "pii_scan");

  assert.equal(genericPii.items.length, 0);
  assert.ok(financePii.items.length >= 2);
  assert.ok(financePii.items.some((i) => i.patternId === "routing_number"));
  assert.ok(financePii.items.some((i) => i.patternId === "loan_number"));
});

const ferpaSession = {
  sessionId: "sess_ferpa",
  startedAt: "2026-09-03T10:00:00.000Z",
  consentEvent: { granted: true, timestamp: "2026-09-03T09:59:00.000Z" },
  turns: [
    { role: "agent", text: "Hi, this is an automated assistant from the school.", tMs: 200 },
    {
      role: "user",
      text: "The student number is STU-4829017 and the student's date of birth is 04/17/2009.",
      tMs: 3000,
    },
  ],
};

test("generic scan alone misses FERPA identifiers; FERPA pack catches them as a drop-in extension", async () => {
  const llmGateway = fakeLlmGateway({
    disclosed: { disclosed: true, turnIndex: 0, quote: "automated assistant" },
  });
  const genericOnly = await analyzeSession(ferpaSession, {
    patternPackIds: ["generic"],
    llmGateway,
  });
  const withFerpa = await analyzeSession(ferpaSession, {
    patternPackIds: ["generic", "ferpa"],
    llmGateway,
  });

  const genericPii = genericOnly.findings.find((f) => f.check === "pii_scan");
  const ferpaPii = withFerpa.findings.find((f) => f.check === "pii_scan");

  assert.equal(genericPii.items.length, 0);
  assert.ok(ferpaPii.items.some((i) => i.patternId === "student_number"));
  assert.ok(ferpaPii.items.some((i) => i.patternId === "student_dob"));
});

test("LLM Gateway disclosure check catches a paraphrase the old hardcoded phrase list would have missed", async () => {
  const llmGateway = fakeLlmGateway({
    disclosed: { disclosed: true, turnIndex: 0, quote: "I'm a computer program helping you today" },
  });
  const report = await analyzeSession(paraphraseDisclosureSession, { llmGateway });
  const byCheck = Object.fromEntries(report.findings.map((f) => [f.check, f]));
  assert.equal(byCheck.ai_disclosure.status, "pass");
  assert.match(byCheck.ai_disclosure.detail, /computer program/);
});

test("LLM Gateway PII scan catches free-form PII (names/emails) that regex patterns can't express", async () => {
  const session = {
    sessionId: "sess_freeform_pii",
    startedAt: "2026-09-03T10:00:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-03T09:59:55.000Z" },
    turns: [
      { role: "agent", text: "Thanks for calling, who am I speaking with?", tMs: 500 },
      { role: "user", text: "This is Jordan Lee, reach me at jordan.lee@example.com.", tMs: 3000 },
    ],
  };
  const llmGateway = fakeLlmGateway({
    disclosed: { disclosed: false, turnIndex: null, quote: null },
    nerItems: [
      { turnIndex: 1, type: "person_name", text: "Jordan Lee" },
      { turnIndex: 1, type: "email", text: "jordan.lee@example.com" },
    ],
  });
  const report = await analyzeSession(session, { llmGateway });
  const pii = report.findings.find((f) => f.check === "pii_scan");
  assert.equal(pii.status, "flag");
  assert.ok(pii.items.some((i) => i.packId === "llm_gateway_ner" && i.patternId === "person_name"));
  assert.ok(pii.items.some((i) => i.packId === "llm_gateway_ner" && i.patternId === "email"));
});

test("PII scan does not flag an org/support-desk greeting name, but still flags real PII in the same session", async () => {
  const session = {
    sessionId: "sess_org_greeting",
    startedAt: "2026-09-03T10:00:00.000Z",
    consentEvent: { granted: true, timestamp: "2026-09-03T09:59:55.000Z" },
    turns: [
      { role: "agent", text: "Hi, thanks for calling Acme Support, this is an AI assistant.", tMs: 500 },
      {
        role: "user",
        text: "This is Jordan Lee, my number is 555-123-4567 and I live at 12 Main St, reach me at jordan.lee@example.com.",
        tMs: 3000,
      },
    ],
  };
  const llmGateway = fakeLlmGateway({
    disclosed: { disclosed: true, turnIndex: 0, quote: "AI assistant" },
    nerItems: [
      { turnIndex: 0, type: "person_name", text: "Acme Support" },
      { turnIndex: 1, type: "person_name", text: "Jordan Lee" },
      { turnIndex: 1, type: "email", text: "jordan.lee@example.com" },
      { turnIndex: 1, type: "phone_number", text: "555-123-4567" },
      { turnIndex: 1, type: "address", text: "12 Main St" },
    ],
  });
  const report = await analyzeSession(session, { llmGateway });
  const pii = report.findings.find((f) => f.check === "pii_scan");

  assert.equal(pii.items.filter((i) => i.turnIndex === 0).length, 0, "Acme Support must not be flagged");
  assert.ok(pii.items.some((i) => i.patternId === "person_name" && i.turnIndex === 1));
  assert.ok(pii.items.some((i) => i.patternId === "email"));
  assert.ok(pii.items.some((i) => i.patternId === "phone_number"));
  assert.ok(pii.items.some((i) => i.patternId === "address"));
});

test("disclosure check reports an error status (not a false flag) when the LLM Gateway call fails", async () => {
  const llmGateway = async (messages) => {
    if (messages[0].content.includes("disclos")) throw new Error("503 upstream unavailable");
    return JSON.stringify({ items: [] });
  };
  const report = await analyzeSession(cleanSession, { llmGateway });
  const disclosure = report.findings.find((f) => f.check === "ai_disclosure");
  assert.equal(disclosure.status, "error");
  assert.ok(disclosure.llmGatewayError.includes("upstream unavailable"));
});

test("PII scan still reports pattern-pack matches and notes the error when the LLM Gateway call fails", async () => {
  const llmGateway = async (messages) => {
    if (messages[0].content.includes("disclos")) return JSON.stringify({ disclosed: true, turnIndex: 0, quote: "hi" });
    throw new Error("503 upstream unavailable");
  };
  const report = await analyzeSession(violatingSession, { llmGateway });
  const pii = report.findings.find((f) => f.check === "pii_scan");
  assert.equal(pii.status, "flag");
  assert.equal(pii.items[0].patternId, "ssn");
  assert.ok(pii.llmGatewayError.includes("upstream unavailable"));
});

test("disclosure check flags rateLimited:true specifically for a gateway rate-limit failure, not a generic error", async () => {
  const llmGateway = async () => {
    throw new LlmGatewayRateLimitError(429, "too many requests for this action");
  };
  const report = await analyzeSession(cleanSession, { llmGateway });
  const disclosure = report.findings.find((f) => f.check === "ai_disclosure");
  assert.equal(disclosure.status, "error");
  assert.equal(disclosure.rateLimited, true);
});

test("PII scan flags rateLimited:true specifically for a gateway rate-limit failure, not a generic error", async () => {
  const llmGateway = async (messages) => {
    if (messages[0].content.includes("disclos")) return JSON.stringify({ disclosed: true, turnIndex: 0, quote: "hi" });
    throw new LlmGatewayRateLimitError(429, "too many requests for this action");
  };
  const report = await analyzeSession(cleanSession, { llmGateway });
  const pii = report.findings.find((f) => f.check === "pii_scan");
  assert.equal(pii.status, "error");
  assert.equal(pii.rateLimited, true);
});

test("offline piiScan keeps a pattern-pack match and adds the offline sentence only when nothing matched", async () => {
  const llmGateway = () => {
    throw new Error("no network");
  };

  const matched = await piiScan(
    { turns: [{ role: "user", text: "my SSN is 123-45-6789", tMs: 0 }] },
    [genericPack],
    { deterministic: true, llmGateway },
  );
  assert.equal(matched.status, "flag");
  assert.ok(matched.items.length > 0);
  assert.equal(matched.detail, undefined);

  const clean = await piiScan(
    { turns: [{ role: "user", text: "Sure, go ahead.", tMs: 0 }] },
    [genericPack],
    { deterministic: true, llmGateway },
  );
  assert.equal(clean.status, "pass");
  assert.deepEqual(clean.items, []);
  assert.equal(clean.detail, "Offline pattern packs only. Free-form PII requires semantic analysis.");
});

test("piiScan's semantic-pass failure detail never claims 'found nothing' next to pattern matches", async () => {
  const llmGateway = async () => {
    throw new Error("LLM Gateway request failed: 401");
  };

  const matched = await piiScan(
    { turns: [{ role: "user", text: "my SSN is 123-45-6789", tMs: 0 }] },
    [genericPack],
    { llmGateway },
  );
  assert.equal(matched.status, "flag");
  assert.doesNotMatch(matched.detail, /found nothing/);
  assert.match(matched.detail, /Pattern-pack matches are listed below/);

  const clean = await piiScan({ turns: [{ role: "user", text: "Sure, go ahead.", tMs: 0 }] }, [genericPack], {
    llmGateway,
  });
  assert.equal(clean.status, "error");
  assert.match(clean.detail, /^Pattern-pack scan found nothing/);
});

test("a pack's own check function only runs when that pack is selected via patternPackIds", async () => {
  const llmGateway = async () => JSON.stringify({ disclosed: true, turnIndex: 0, quote: "AI assistant" });

  const withoutPack = await analyzeSession(cleanSession, { llmGateway });
  assert.equal(withoutPack.findings.some((f) => f.check === "ca_sb1001_bot_disclosure"), false);

  const withPack = await analyzeSession(cleanSession, {
    llmGateway,
    patternPackIds: ["generic", "ca_sb1001"],
  });
  const sb1001 = withPack.findings.find((f) => f.check === "ca_sb1001_bot_disclosure");
  assert.ok(sb1001);
  assert.equal(sb1001.status, "pass");
});
