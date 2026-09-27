import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PHONE_STORAGE_KEY,
  getDefaultPhoneNumber,
  isValidPhoneNumber,
  setDefaultPhoneNumber,
} from "./phoneNumberPreference.js";

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

test("getDefaultPhoneNumber returns null when unset", () => {
  assert.equal(getDefaultPhoneNumber(mockStorage()), null);
});

test("setDefaultPhoneNumber persists a valid E.164 number", () => {
  const storage = mockStorage();
  assert.equal(setDefaultPhoneNumber("+18038245760", storage), "+18038245760");
  assert.equal(storage.getItem(DEFAULT_PHONE_STORAGE_KEY), "+18038245760");
});

test("setDefaultPhoneNumber rejects invalid numbers", () => {
  assert.throws(() => setDefaultPhoneNumber("8038245760", mockStorage()), /E\.164/);
  assert.equal(isValidPhoneNumber("+18038245760"), true);
  assert.equal(isValidPhoneNumber("bad"), false);
});
