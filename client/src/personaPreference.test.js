import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PERSONA_STORAGE_KEY,
  getDefaultPersonaId,
  isValidPersonaId,
  setDefaultPersonaId,
} from "./personaPreference.js";

function mockStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
  };
}

test("getDefaultPersonaId falls back to neutral and ignores unknown stored ids", () => {
  const storage = mockStorage();
  assert.equal(getDefaultPersonaId(storage), "neutral");
  storage.setItem(DEFAULT_PERSONA_STORAGE_KEY, "healthcare");
  assert.equal(getDefaultPersonaId(storage), "healthcare");
  storage.setItem(DEFAULT_PERSONA_STORAGE_KEY, "not-a-persona");
  assert.equal(getDefaultPersonaId(storage), "neutral");
});

test("setDefaultPersonaId persists a valid persona id", () => {
  const storage = mockStorage();
  const persona = setDefaultPersonaId("bank", storage);
  assert.equal(persona.id, "bank");
  assert.equal(storage.getItem(DEFAULT_PERSONA_STORAGE_KEY), "bank");
});

test("setDefaultPersonaId rejects unknown ids", () => {
  assert.throws(() => setDefaultPersonaId("missing", mockStorage()), /Unknown persona id/);
  assert.equal(isValidPersonaId("flight"), true);
  assert.equal(isValidPersonaId("missing"), false);
});
