import { getPool, dbConfigured } from "../db.js";

// Persistence for QUALEVAL_AGENT_NUMBER's two selectable target-agent
// variants (server/migrations/005_qualeval_demo_agent.sql) and which one is
// currently active. Same hard-fail-without-Postgres contract as the rest of
// server/qualeval/store.js - genuinely editable operator config, not a
// cache, so there's no in-memory fallback.
export const NOT_CONFIGURED_ERROR =
  "QualEval demo-agent configuration requires Postgres configuration (DATABASE_URL). See server/db.js's dbConfigured().";

export { dbConfigured };

export const VARIANT_KEYS = ["compliant", "flawed"];

function requirePool(pool) {
  if (!pool) throw new Error(NOT_CONFIGURED_ERROR);
}

function requireValidKey(key) {
  if (!VARIANT_KEYS.includes(key)) {
    throw new Error(`variant key must be one of ${VARIANT_KEYS.join(", ")}`);
  }
}

function variantRow(row) {
  return {
    key: row.key,
    name: row.name,
    systemPrompt: row.system_prompt,
    greeting: row.greeting,
    voice: row.voice,
    updatedAt: row.updated_at,
  };
}

export async function listVariants(env = process.env, pool = getPool(env)) {
  requirePool(pool);
  const { rows } = await pool.query(
    `select key, name, system_prompt, greeting, voice, updated_at from qualeval_demo_agent_variants order by key`,
  );
  return rows.map(variantRow);
}

export async function getVariant(key, env = process.env, pool = getPool(env)) {
  requirePool(pool);
  requireValidKey(key);
  const { rows } = await pool.query(
    `select key, name, system_prompt, greeting, voice, updated_at from qualeval_demo_agent_variants where key = $1`,
    [key],
  );
  return rows[0] ? variantRow(rows[0]) : null;
}

export async function updateVariant(key, { name, systemPrompt, greeting, voice }, env = process.env, pool = getPool(env)) {
  requirePool(pool);
  requireValidKey(key);
  const columns = { name, system_prompt: systemPrompt, greeting, voice };
  const setKeys = Object.keys(columns).filter((k) => columns[k] !== undefined);
  if (setKeys.length === 0) throw new Error("no fields to update");
  const setClause = setKeys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const { rows } = await pool.query(
    `update qualeval_demo_agent_variants set ${setClause}, updated_at = now()
     where key = $1
     returning key, name, system_prompt, greeting, voice, updated_at`,
    [key, ...setKeys.map((k) => columns[k])],
  );
  if (rows.length === 0) throw new Error("Variant not found");
  return variantRow(rows[0]);
}

export async function getActiveVariantKey(env = process.env, pool = getPool(env)) {
  requirePool(pool);
  const { rows } = await pool.query(`select active_variant from qualeval_demo_agent_state where id = true`);
  return rows[0]?.active_variant ?? null;
}

export async function setActiveVariant(key, env = process.env, pool = getPool(env)) {
  requirePool(pool);
  requireValidKey(key);
  const { rows } = await pool.query(
    `update qualeval_demo_agent_state set active_variant = $1, updated_at = now()
     where id = true
     returning active_variant`,
    [key],
  );
  if (rows.length === 0) throw new Error("Demo-agent state row not found");
  return rows[0].active_variant;
}

// The one call server/qualeval/demoAgentVoice.js's bridge needs at connect
// time: whichever variant is currently active, in full.
export async function getActiveVariant(env = process.env, pool = getPool(env)) {
  requirePool(pool);
  const { rows } = await pool.query(
    `select v.key, v.name, v.system_prompt, v.greeting, v.voice, v.updated_at
     from qualeval_demo_agent_state s
     join qualeval_demo_agent_variants v on v.key = s.active_variant
     where s.id = true`,
  );
  if (rows.length === 0) throw new Error("No active demo-agent variant configured");
  return variantRow(rows[0]);
}
