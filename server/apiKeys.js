import { randomBytes, createHash } from "node:crypto";
import { supabaseConfigured } from "./supabaseCache.js";
import { PACK_IDS } from "./packs/index.js";

const TABLE = "api_keys";
const KEY_PREFIX = "cl_live_";
export const DEFAULT_EXPIRY_DAYS = 90;
export const ALL_SCOPES_SENTINEL = "all";
const VALID_SCOPE_IDS = new Set([ALL_SCOPES_SENTINEL, ...PACK_IDS]);

function headers(env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function restUrl(env, path) {
  return `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`;
}

function generateRawKey() {
  return `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashKey(rawKey) {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function validateScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return { ok: false, error: "scopes must be a non-empty array" };
  }
  const invalid = scopes.filter((s) => !VALID_SCOPE_IDS.has(s));
  if (invalid.length > 0) {
    return { ok: false, error: `Unknown scope id(s): ${invalid.join(", ")}` };
  }
  return { ok: true };
}

function rowToMetadata(row) {
  return {
    id: row.id,
    name: row.name,
    scopes: row.scopes,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

// Issues a new key for `clerkUserId`. Returns the raw key exactly once - it is
// never stored or retrievable again, only its SHA-256 hash is persisted.
export async function createApiKey(
  { clerkUserId, name, scopes, expiresInDays = DEFAULT_EXPIRY_DAYS },
  env = process.env,
  fetchImpl = fetch,
) {
  if (!supabaseConfigured(env)) {
    throw new Error("API key storage requires Supabase configuration (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).");
  }
  if (!clerkUserId) throw new Error("clerkUserId is required");
  if (!name || !name.trim()) throw new Error("name is required");
  const scopeCheck = validateScopes(scopes);
  if (!scopeCheck.ok) throw new Error(scopeCheck.error);
  if (!Number.isFinite(expiresInDays) || expiresInDays <= 0) {
    throw new Error("expiresInDays must be a positive number");
  }

  const rawKey = generateRawKey();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const resp = await fetchImpl(restUrl(env, `${TABLE}`), {
    method: "POST",
    headers: { ...headers(env), Prefer: "return=representation" },
    body: JSON.stringify({
      clerk_user_id: clerkUserId,
      name: name.trim(),
      key_hash: hashKey(rawKey),
      scopes,
      expires_at: expiresAt,
    }),
  });
  if (!resp.ok) {
    throw new Error(`Supabase insert failed: ${resp.status}`);
  }
  const [row] = await resp.json();
  return { rawKey, ...rowToMetadata(row) };
}

export async function listApiKeys(clerkUserId, env = process.env, fetchImpl = fetch) {
  if (!supabaseConfigured(env)) {
    throw new Error("API key storage requires Supabase configuration (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).");
  }
  const url = restUrl(
    env,
    `${TABLE}?clerk_user_id=eq.${encodeURIComponent(clerkUserId)}&select=id,name,scopes,expires_at,created_at,last_used_at,revoked_at&order=created_at.desc`,
  );
  const resp = await fetchImpl(url, { headers: headers(env) });
  if (!resp.ok) {
    throw new Error(`Supabase list failed: ${resp.status}`);
  }
  const rows = await resp.json();
  return (Array.isArray(rows) ? rows : []).map(rowToMetadata);
}

// Soft-revoke: sets revoked_at rather than deleting, so audit history survives.
// Scoped to clerkUserId so one user can never revoke another's key.
export async function revokeApiKey(clerkUserId, keyId, env = process.env, fetchImpl = fetch) {
  if (!supabaseConfigured(env)) {
    throw new Error("API key storage requires Supabase configuration (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).");
  }
  const url = restUrl(
    env,
    `${TABLE}?id=eq.${encodeURIComponent(keyId)}&clerk_user_id=eq.${encodeURIComponent(clerkUserId)}&select=id`,
  );
  const resp = await fetchImpl(url, {
    method: "PATCH",
    headers: { ...headers(env), Prefer: "return=representation" },
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  });
  if (!resp.ok) {
    throw new Error(`Supabase revoke failed: ${resp.status}`);
  }
  const rows = await resp.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Key not found");
  }
}

// Edits an existing key's expiry (extend or shorten). Scoped to clerkUserId
// so one user can never edit another's key.
export async function updateApiKeyExpiry(clerkUserId, keyId, expiresInDays, env = process.env, fetchImpl = fetch) {
  if (!supabaseConfigured(env)) {
    throw new Error("API key storage requires Supabase configuration (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).");
  }
  if (!Number.isFinite(expiresInDays) || expiresInDays <= 0) {
    throw new Error("expiresInDays must be a positive number");
  }
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const url = restUrl(
    env,
    `${TABLE}?id=eq.${encodeURIComponent(keyId)}&clerk_user_id=eq.${encodeURIComponent(clerkUserId)}&select=id,name,scopes,expires_at,created_at,last_used_at,revoked_at`,
  );
  const resp = await fetchImpl(url, {
    method: "PATCH",
    headers: { ...headers(env), Prefer: "return=representation" },
    body: JSON.stringify({ expires_at: expiresAt }),
  });
  if (!resp.ok) {
    throw new Error(`Supabase update failed: ${resp.status}`);
  }
  const rows = await resp.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Key not found");
  }
  return rowToMetadata(rows[0]);
}

// Verification interface for the (separate, sequenced) webhook-receiver task.
// Call with the raw key from an incoming request's auth header/param.
//
// Returns one of:
//   { valid: true, scopes: string[], clerkUserId: string }
//   { valid: false, reason: "not_configured" | "not_found" | "revoked" | "expired" }
//
// `scopes` is either ["all"] (every pack, including future ones) or a list of
// pack ids from server/packs/index.js's PACK_IDS - the caller is responsible
// for intersecting that with whichever patternPackIds it wants to run.
// On a valid key, last_used_at is updated best-effort (failure to record a
// touch never fails verification).
export async function verifyApiKey(rawKey, env = process.env, fetchImpl = fetch) {
  if (!supabaseConfigured(env)) {
    return { valid: false, reason: "not_configured" };
  }
  if (!rawKey || typeof rawKey !== "string") {
    return { valid: false, reason: "not_found" };
  }
  const url = restUrl(
    env,
    `${TABLE}?key_hash=eq.${encodeURIComponent(hashKey(rawKey))}&select=id,clerk_user_id,scopes,expires_at,revoked_at&limit=1`,
  );
  const resp = await fetchImpl(url, { headers: headers(env) });
  if (!resp.ok) {
    throw new Error(`Supabase lookup failed: ${resp.status}`);
  }
  const rows = await resp.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return { valid: false, reason: "not_found" };
  if (row.revoked_at) return { valid: false, reason: "revoked" };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { valid: false, reason: "expired" };

  fetchImpl(restUrl(env, `${TABLE}?id=eq.${encodeURIComponent(row.id)}`), {
    method: "PATCH",
    headers: { ...headers(env), Prefer: "return=minimal" },
    body: JSON.stringify({ last_used_at: new Date().toISOString() }),
  }).catch(() => {});

  return { valid: true, scopes: row.scopes, clerkUserId: row.clerk_user_id };
}
