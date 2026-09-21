import { randomBytes, createHash } from "node:crypto";
import { getPool } from "./db.js";
import { PACK_IDS } from "./packs/index.js";

const KEY_PREFIX = "cl_live_";
export const DEFAULT_EXPIRY_DAYS = 90;
export const ALL_SCOPES_SENTINEL = "all";
const VALID_SCOPE_IDS = new Set([ALL_SCOPES_SENTINEL, ...PACK_IDS]);

const NOT_CONFIGURED_ERROR = "API key storage requires Postgres configuration (DATABASE_URL).";

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
  pool = getPool(env),
) {
  if (!pool) throw new Error(NOT_CONFIGURED_ERROR);
  if (!clerkUserId) throw new Error("clerkUserId is required");
  if (!name || !name.trim()) throw new Error("name is required");
  const scopeCheck = validateScopes(scopes);
  if (!scopeCheck.ok) throw new Error(scopeCheck.error);
  if (!Number.isFinite(expiresInDays) || expiresInDays <= 0) {
    throw new Error("expiresInDays must be a positive number");
  }

  const rawKey = generateRawKey();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const { rows } = await pool.query(
    `insert into api_keys (clerk_user_id, name, key_hash, scopes, expires_at)
     values ($1, $2, $3, $4, $5)
     returning id, name, scopes, expires_at, created_at, last_used_at, revoked_at`,
    [clerkUserId, name.trim(), hashKey(rawKey), JSON.stringify(scopes), expiresAt],
  );
  return { rawKey, ...rowToMetadata(rows[0]) };
}

export async function listApiKeys(clerkUserId, env = process.env, pool = getPool(env)) {
  if (!pool) throw new Error(NOT_CONFIGURED_ERROR);
  const { rows } = await pool.query(
    `select id, name, scopes, expires_at, created_at, last_used_at, revoked_at
     from api_keys where clerk_user_id = $1 order by created_at desc`,
    [clerkUserId],
  );
  return rows.map(rowToMetadata);
}

// Soft-revoke: sets revoked_at rather than deleting, so audit history survives.
// Scoped to clerkUserId so one user can never revoke another's key.
export async function revokeApiKey(clerkUserId, keyId, env = process.env, pool = getPool(env)) {
  if (!pool) throw new Error(NOT_CONFIGURED_ERROR);
  const { rows } = await pool.query(
    `update api_keys set revoked_at = now()
     where id = $1 and clerk_user_id = $2
     returning id`,
    [keyId, clerkUserId],
  );
  if (rows.length === 0) {
    throw new Error("Key not found");
  }
}

// Edits an existing key's expiry (extend or shorten). Scoped to clerkUserId
// so one user can never edit another's key.
export async function updateApiKeyExpiry(clerkUserId, keyId, expiresInDays, env = process.env, pool = getPool(env)) {
  if (!pool) throw new Error(NOT_CONFIGURED_ERROR);
  if (!Number.isFinite(expiresInDays) || expiresInDays <= 0) {
    throw new Error("expiresInDays must be a positive number");
  }
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const { rows } = await pool.query(
    `update api_keys set expires_at = $1
     where id = $2 and clerk_user_id = $3
     returning id, name, scopes, expires_at, created_at, last_used_at, revoked_at`,
    [expiresAt, keyId, clerkUserId],
  );
  if (rows.length === 0) {
    throw new Error("Key not found");
  }
  return rowToMetadata(rows[0]);
}

// Verification interface for the webhook receiver (server/webhooks/ingest.js).
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
export async function verifyApiKey(rawKey, env = process.env, pool = getPool(env)) {
  if (!pool) {
    return { valid: false, reason: "not_configured" };
  }
  if (!rawKey || typeof rawKey !== "string") {
    return { valid: false, reason: "not_found" };
  }
  const { rows } = await pool.query(
    `select id, clerk_user_id, scopes, expires_at, revoked_at
     from api_keys where key_hash = $1 limit 1`,
    [hashKey(rawKey)],
  );
  const row = rows[0];
  if (!row) return { valid: false, reason: "not_found" };
  if (row.revoked_at) return { valid: false, reason: "revoked" };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { valid: false, reason: "expired" };

  pool
    .query("update api_keys set last_used_at = now() where id = $1", [row.id])
    .catch(() => {});

  return { valid: true, scopes: row.scopes, clerkUserId: row.clerk_user_id };
}
