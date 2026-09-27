import { test } from "node:test";
import assert from "node:assert/strict";
import { createOperatorCheck, parseOperatorEmails } from "./operatorAccess.js";

const req = {};

function check(raw, { clerkEnabled = true, userId = "user_1", emails = ["Captain@Example.com"] } = {}) {
  let lookups = 0;
  const isOperator = createOperatorCheck({
    allowlist: parseOperatorEmails(raw),
    clerkEnabled,
    userIdOf: () => userId,
    lookupEmails: async () => {
      lookups += 1;
      return emails;
    },
  });
  return isOperator(req).then((result) => ({ result, lookups }));
}

test("allows a signed-in user whose email is on the list, case-insensitively", async () => {
  assert.equal((await check(" other@example.com , captain@EXAMPLE.com")).result, true);
});

test("refuses a signed-in user whose email is not on the list", async () => {
  assert.equal((await check("other@example.com")).result, false);
});

test("refuses everyone when the list is unset or empty, without a Clerk lookup", async () => {
  for (const raw of [undefined, "", " , "]) {
    assert.deepEqual(await check(raw), { result: false, lookups: 0 }, String(raw));
  }
});

test("refuses a request with no signed-in user", async () => {
  assert.equal((await check("captain@example.com", { userId: null })).result, false);
});

test("with Clerk off, fails closed even for a listed email, unless the list is *", async () => {
  assert.deepEqual(await check("captain@example.com", { clerkEnabled: false }), { result: false, lookups: 0 });
  assert.deepEqual(await check("*", { clerkEnabled: false, userId: "anon" }), { result: true, lookups: 0 });
});

test("* on its own opens access to every signed-in visitor without a Clerk lookup", async () => {
  assert.deepEqual(await check(" * ", { emails: ["stranger@example.com"] }), { result: true, lookups: 0 });
});

test("a * mixed into an email list is ignored rather than opening access", async () => {
  for (const raw of ["captain@example.com,*", "*, captain@example.com", "*,*"]) {
    assert.equal((await check(raw, { emails: ["stranger@example.com"] })).result, false, raw);
  }
  assert.equal((await check("*,captain@example.com")).result, true);
});

test("treats a failed email lookup as not an operator", async () => {
  const isOperator = createOperatorCheck({
    allowlist: parseOperatorEmails("captain@example.com"),
    clerkEnabled: true,
    userIdOf: () => "user_1",
    lookupEmails: async () => {
      throw new Error("clerk down");
    },
  });
  assert.equal(await isOperator(req), false);
});
