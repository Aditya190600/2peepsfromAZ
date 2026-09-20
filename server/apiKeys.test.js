import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  verifyApiKey,
  hashKey,
  validateScopes,
  ALL_SCOPES_SENTINEL,
} from "./apiKeys.js";

const ENV = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "svc-key" };

function fakeSupabase(initialRows = []) {
  let rows = initialRows;
  let nextId = 1;
  const calls = [];

  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, opts });
    const method = opts.method ?? "GET";
    const parsed = new URL(url);
    const params = parsed.searchParams;

    if (method === "POST" && !params.has("id")) {
      const body = JSON.parse(opts.body);
      const row = {
        id: `key_${nextId++}`,
        clerk_user_id: body.clerk_user_id,
        name: body.name,
        key_hash: body.key_hash,
        scopes: body.scopes,
        expires_at: body.expires_at,
        created_at: new Date().toISOString(),
        last_used_at: null,
        revoked_at: null,
      };
      rows.push(row);
      return { ok: true, status: 201, json: async () => [row] };
    }

    if (method === "PATCH") {
      const idFilter = params.get("id")?.replace("eq.", "");
      const userFilter = params.get("clerk_user_id")?.replace("eq.", "");
      const body = JSON.parse(opts.body);
      const matches = rows.filter(
        (r) => r.id === idFilter && (userFilter === undefined || r.clerk_user_id === userFilter),
      );
      matches.forEach((r) => Object.assign(r, body));
      return { ok: true, status: 200, json: async () => matches };
    }

    if (method === "GET" || method === undefined) {
      let result = rows;
      const userFilter = params.get("clerk_user_id")?.replace("eq.", "");
      const hashFilter = params.get("key_hash")?.replace("eq.", "");
      if (userFilter !== undefined && userFilter !== null) {
        result = result.filter((r) => r.clerk_user_id === userFilter);
      }
      if (hashFilter !== undefined && hashFilter !== null) {
        result = result.filter((r) => r.key_hash === hashFilter);
      }
      return { ok: true, status: 200, json: async () => result };
    }

    throw new Error(`unhandled request: ${method} ${url}`);
  };

  return { fetchImpl, calls, rows: () => rows };
}

test("a created key verifies successfully and returns its scopes", async () => {
  const { fetchImpl } = fakeSupabase();
  const created = await createApiKey(
    { clerkUserId: "user_1", name: "Prod webhook", scopes: ["hipaa"] },
    ENV,
    fetchImpl,
  );
  assert.ok(created.rawKey.startsWith("cl_live_"));

  const result = await verifyApiKey(created.rawKey, ENV, fetchImpl);
  assert.deepEqual(result, { valid: true, scopes: ["hipaa"], clerkUserId: "user_1" });
});

test("an unknown key fails verification", async () => {
  const { fetchImpl } = fakeSupabase();
  const result = await verifyApiKey("cl_live_not-a-real-key", ENV, fetchImpl);
  assert.deepEqual(result, { valid: false, reason: "not_found" });
});

test("a revoked key fails verification", async () => {
  const { fetchImpl } = fakeSupabase();
  const created = await createApiKey(
    { clerkUserId: "user_1", name: "Rotated out", scopes: [ALL_SCOPES_SENTINEL] },
    ENV,
    fetchImpl,
  );
  await revokeApiKey("user_1", created.id, ENV, fetchImpl);

  const result = await verifyApiKey(created.rawKey, ENV, fetchImpl);
  assert.deepEqual(result, { valid: false, reason: "revoked" });
});

test("an expired key fails verification", async () => {
  const rawKey = "cl_live_expired-key";
  const { fetchImpl } = fakeSupabase([
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
  const result = await verifyApiKey(rawKey, ENV, fetchImpl);
  assert.deepEqual(result, { valid: false, reason: "expired" });
});

test("scopes round-trip through create and list", async () => {
  const { fetchImpl } = fakeSupabase();
  await createApiKey({ clerkUserId: "user_1", name: "A", scopes: ["hipaa", "finance"] }, ENV, fetchImpl);
  await createApiKey({ clerkUserId: "user_1", name: "B", scopes: [ALL_SCOPES_SENTINEL] }, ENV, fetchImpl);
  await createApiKey({ clerkUserId: "user_2", name: "Other account", scopes: ["ferpa"] }, ENV, fetchImpl);

  const keys = await listApiKeys("user_1", ENV, fetchImpl);
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
  const { fetchImpl } = fakeSupabase();
  const created = await createApiKey({ clerkUserId: "user_1", name: "A", scopes: ["hipaa"] }, ENV, fetchImpl);
  await assert.rejects(() => revokeApiKey("user_2", created.id, ENV, fetchImpl));
});
