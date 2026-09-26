import { test } from "node:test";
import assert from "node:assert/strict";
import { PERSONAS, findPersona, resolvePersonaCallConfig } from "./personas.js";

test("every persona has a unique id and a documented AssemblyAI voice", async () => {
  const DOCUMENTED_VOICES = new Set([
    "alba",
    "eve",
    "george",
    "jane",
    "jean",
    "mary",
    "michael",
    "anna",
    "charles",
    "paul",
    "vera",
  ]);
  const ids = new Set();
  for (const persona of PERSONAS) {
    assert.ok(!ids.has(persona.id), `duplicate persona id ${persona.id}`);
    ids.add(persona.id);
    assert.ok(DOCUMENTED_VOICES.has(persona.voice), `${persona.id} uses undocumented voice ${persona.voice}`);
  }
});

test("neutral persona has no scope and no violation toggle", () => {
  const neutral = findPersona("neutral");
  assert.equal(neutral.scope, null);
  assert.equal(neutral.violation, null);
});

test("every non-neutral persona has a scope and a violation toggle tied to a real check", () => {
  const VALID_CHECK_IDS = new Set(["ai_disclosure", "pii_scan", "scope_adherence", "consent", "opt_out"]);
  for (const persona of PERSONAS.filter((p) => p.id !== "neutral")) {
    assert.ok(persona.scope, `${persona.id} missing scope`);
    assert.ok(persona.violation, `${persona.id} missing violation toggle`);
    assert.ok(VALID_CHECK_IDS.has(persona.violation.checkId), `${persona.id} violation targets unknown check`);
  }
});

test("school nurse persona auto-selects HIPAA, FERPA, and COPPA packs", () => {
  const nurse = findPersona("nurse");
  assert.deepEqual(nurse.packIds, ["hipaa", "ferpa", "coppa"]);
});

test("findPersona falls back to the first persona for an unknown id", () => {
  assert.equal(findPersona("does-not-exist").id, PERSONAS[0].id);
  assert.equal(findPersona(undefined).id, PERSONAS[0].id);
});

test("resolvePersonaCallConfig returns the compliant baseline by default", () => {
  const flight = findPersona("flight");
  const config = resolvePersonaCallConfig(flight, false);
  assert.equal(config.systemPrompt, flight.systemPrompt);
  assert.equal(config.greeting, flight.greeting);
  assert.equal(config.voice, "george");
  assert.match(config.systemPrompt, /disclosing.*AI/i);
});

test("resolvePersonaCallConfig applies the seeded violation when toggled", () => {
  const flight = findPersona("flight");
  const config = resolvePersonaCallConfig(flight, true);
  assert.doesNotMatch(config.systemPrompt, /disclosing.*AI/i);
  assert.equal(config.greeting, flight.violation.greetingOverride);
});

test("resolvePersonaCallConfig on a persona whose violation keeps the default greeting", () => {
  const bank = findPersona("bank");
  const config = resolvePersonaCallConfig(bank, true);
  assert.equal(config.greeting, bank.greeting);
  assert.match(config.systemPrompt, /confirm it/);
});

test("resolvePersonaCallConfig ignores the toggle for the neutral persona (no violation defined)", () => {
  const neutral = findPersona("neutral");
  const config = resolvePersonaCallConfig(neutral, true);
  assert.equal(config.systemPrompt, neutral.systemPrompt);
  assert.equal(config.greeting, neutral.greeting);
});
