import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  updateApiKeyExpiry,
  verifyApiKey,
  hashKey,
  validateScopes,
  ALL_SCOPES_SENTINEL,
} from "./apiKeys.js";

function fakePool(initialRows = []) {
  let rows = initialRows;
  let nextId = 1;
  const calls = [];

  const query = async (text, params = []) => {
    calls.push({ text, params });
    const sql = text.trim().toLowerCase();

    if (sql.startsWith("insert into api_keys")) {
      const [clerk_user_id, name, key_hash, scopes, expires_at] = params;
      const row = {
        id: `key_${nextId++}`,
        clerk_user_id,
        name,
        key_hash,
        scopes: JSON.parse(scopes),
        expires_at,
        created_at: new Date().toISOString(),
        last_used_at: null,
        revoked_at: null,
      };
      rows.push(row);
      return { rows: [row] };
    }

    if (sql.startsWith("select") && sql.includes("clerk_user_id = $1")) {
      const [clerkUserId] = params;
      return { rows: rows.filter((r) => r.clerk_user_id === clerkUserId) };
    }

    if (sql.startsWith("select") && sql.includes("key_hash = $1")) {
      const [keyHash] = params;
      return { rows: rows.filter((r) => r.key_hash === keyHash) };
    }

    if (sql.startsWith("update api_keys set revoked_at")) {
      const [id, clerkUserId] = params;
      const matches = rows.filter((r) => r.id === id && r.clerk_user_id === clerkUserId);
      matches.forEach((r) => (r.revoked_at = new Date().toISOString()));
      return { rows: matches };
    }

    if (sql.startsWith("update api_keys set expires_at")) {
      const [expiresAt, id, clerkUserId] = params;
      const matches = rows.filter((r) => r.id === id && r.clerk_user_id === clerkUserId);
      matches.forEach((r) => (r.expires_at = expiresAt));
      return { rows: matches };
    }

    if (sql.startsWith("update api_keys set last_used_at")) {
      const [id] = params;
      const match = rows.find((r) => r.id === id);
      if (match) match.last_used_at = new Date().toISOString();
      return { rows: [] };
    }

    throw new Error(`unhandled query: ${text}`);
  };

  return { query, calls, rows: () => rows };
}

test("a created key verifies successfully and returns its scopes", async () => {
  const pool = fakePool();
  const created = await createApiKey({ clerkUserId: "user_1", name: "Prod webhook", scopes: ["hipaa"] }, {}, pool);
  assert.ok(created.rawKey.startsWith("cl_live_"));

  const result = await verifyApiKey(created.rawKey, {}, pool);
  assert.deepEqual(result, { valid: true, scopes: ["hipaa"], clerkUserId: "user_1" });
});

test("an unknown key fails verification", async () => {
  const pool = fakePool();
  const result = await verifyApiKey("cl_live_not-a-real-key", {}, pool);
  assert.deepEqual(result, { valid: false, reason: "not_found" });
});

test("a revoked key fails verification", async () => {
  const pool = fakePool();
  const created = await createApiKey(
    { clerkUserId: "user_1", name: "Rotated out", scopes: [ALL_SCOPES_SENTINEL] },
    {},
    pool,
  );
  await revokeApiKey("user_1", created.id, {}, pool);

  const result = await verifyApiKey(created.rawKey, {}, pool);
  assert.deepEqual(result, { valid: false, reason: "revoked" });
});

test("an expired key fails verification", async () => {
  const rawKey = "cl_live_expired-key";
  const pool = fakePool([
    {
      id: "key_expired",
      clerk_user_id: "user_1",
      name: "Short lived",
      key_hash: hashKey(rawKey),
      scopes: [ALL_SCOPES_SENTINEL],
      expires_at: new Date(Date.now() - 1000).toISOString(),
      created_at: new Date().toISOString(),
      last_used_at: null,
      revoked_at: null,
    },
  ]);
  const result = await verifyApiKey(rawKey, {}, pool);
  assert.deepEqual(result, { valid: false, reason: "expired" });
});

test("scopes round-trip through create and list", async () => {
  const pool = fakePool();
  await createApiKey({ clerkUserId: "user_1", name: "A", scopes: ["hipaa", "finance"] }, {}, pool);
  await createApiKey({ clerkUserId: "user_1", name: "B", scopes: [ALL_SCOPES_SENTINEL] }, {}, pool);
  await createApiKey({ clerkUserId: "user_2", name: "Other account", scopes: ["ferpa"] }, {}, pool);

  const keys = await listApiKeys("user_1", {}, pool);
  assert.equal(keys.length, 2);
  assert.deepEqual(
    keys.map((k) => k.scopes).sort(),
    [["hipaa", "finance"], [ALL_SCOPES_SENTINEL]].sort(),
  );
  assert.ok(keys.every((k) => k.rawKey === undefined), "list never returns the raw key");
});

test("validateScopes rejects unknown pack ids and empty arrays", () => {
  assert.equal(validateScopes([]).ok, false);
  assert.equal(validateScopes(["not-a-real-pack"]).ok, false);
  assert.equal(validateScopes(["hipaa"]).ok, true);
  assert.equal(validateScopes([ALL_SCOPES_SENTINEL]).ok, true);
});

test("hashKey is deterministic and never reversible-looking (fixed length hex)", () => {
  const h1 = hashKey("cl_live_abc");
  const h2 = hashKey("cl_live_abc");
  const h3 = hashKey("cl_live_different");
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test("revoking a key scoped to another user's id fails", async () => {
  const pool = fakePool();
  const created = await createApiKey({ clerkUserId: "user_1", name: "A", scopes: ["hipaa"] }, {}, pool);
  await assert.rejects(() => revokeApiKey("user_2", created.id, {}, pool));
});

test("updateApiKeyExpiry extends an existing key's expiry and the key still verifies", async () => {
  const pool = fakePool();
  const created = await createApiKey(
    { clerkUserId: "user_1", name: "A", scopes: ["hipaa"], expiresInDays: 1 },
    {},
    pool,
  );
  const updated = await updateApiKeyExpiry("user_1", created.id, 365, {}, pool);
  assert.ok(new Date(updated.expiresAt).getTime() > new Date(created.expiresAt).getTime());

  const result = await verifyApiKey(created.rawKey, {}, pool);
  assert.equal(result.valid, true);
});

test("updating expiry scoped to another user's id fails", async () => {
  const pool = fakePool();
  const created = await createApiKey({ clerkUserId: "user_1", name: "A", scopes: ["hipaa"] }, {}, pool);
  await assert.rejects(() => updateApiKeyExpiry("user_2", created.id, 30, {}, pool));
});

test("updateApiKeyExpiry rejects non-positive day counts", async () => {
  const pool = fakePool();
  const created = await createApiKey({ clerkUserId: "user_1", name: "A", scopes: ["hipaa"] }, {}, pool);
  await assert.rejects(() => updateApiKeyExpiry("user_1", created.id, 0, {}, pool));
});
