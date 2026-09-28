import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canAccessPhoneEvals,
  canViewPhoneEvalCall,
  listOwnedInboundNumbers,
  ownedNumberDigits,
  phoneEvalsConfigured,
} from "./phoneEvalAccess.js";

const store = {
  listNumbers: async (ownerId) => {
    if (ownerId === "user_a") {
      return [
        { e164: "+18038245760", direction: "inbound" },
        { e164: "+15551234567", direction: "outbound" },
      ];
    }
    return [];
  },
};

test("listOwnedInboundNumbers returns only inbound-capable numbers for the owner", async () => {
  assert.deepEqual(await listOwnedInboundNumbers(store, "user_a"), ["+18038245760"]);
  assert.deepEqual(await listOwnedInboundNumbers(store, "user_b"), []);
  assert.deepEqual(await listOwnedInboundNumbers(null, "user_a"), []);
});

test("phoneEvalsConfigured is true once the owner has an inbound number", async () => {
  assert.equal(await phoneEvalsConfigured(store, "user_a"), true);
  assert.equal(await phoneEvalsConfigured(store, "user_b"), false);
});

test("canAccessPhoneEvals opens for admins or configured non-admins", async () => {
  assert.equal(await canAccessPhoneEvals({ isPhoneEvalAdmin: true, telephonyStore: store, ownerId: "user_b" }), true);
  assert.equal(await canAccessPhoneEvals({ isPhoneEvalAdmin: false, telephonyStore: store, ownerId: "user_a" }), true);
  assert.equal(await canAccessPhoneEvals({ isPhoneEvalAdmin: false, telephonyStore: store, ownerId: "user_b" }), false);
  assert.equal(
    await canAccessPhoneEvals({ isPhoneEvalAdmin: async () => true, telephonyStore: store, ownerId: "user_b" }),
    true,
  );
});

test("canViewPhoneEvalCall scopes non-admins to their registered to_number", () => {
  const ownedDigits = ownedNumberDigits(["+18038245760"]);
  assert.equal(
    canViewPhoneEvalCall({
      isPhoneEvalAdmin: false,
      ownedDigits,
      call: { toNumber: "+1 (803) 824-5760" },
    }),
    true,
  );
  assert.equal(
    canViewPhoneEvalCall({
      isPhoneEvalAdmin: false,
      ownedDigits,
      call: { toNumber: "+19998887777" },
    }),
    false,
  );
  assert.equal(
    canViewPhoneEvalCall({
      isPhoneEvalAdmin: true,
      ownedDigits,
      call: { toNumber: "+19998887777" },
    }),
    true,
  );
});
