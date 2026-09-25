import { getPool, dbConfigured } from "../db.js";
import * as demoAgentAgents from "./demoAgentAgents.js";

// Persistence for QUALEVAL_AGENT_NUMBER's two selectable target-agent
// variants (server/migrations/005_qualeval_demo_agent.sql) and which one is
// currently active. Each variant stores only an AssemblyAI `agent_id`, not
// prompt text - the prompt/greeting/voice live on AssemblyAI's own stored
// agent record (server/qualeval/demoAgentAgents.js), and `updateVariant`'s
// systemPrompt/greeting/voice fields write straight through to that record.
// Same hard-fail-without-Postgres contract as the rest of server/qualeval/
// store.js - genuinely editable operator config, not a cache, so there's no
// in-memory fallback.
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
    agentId: row.agent_id,
    updatedAt: row.updated_at,
  };
}

export async function listVariants(env = process.env, pool = getPool(env)) {
  requirePool(pool);
  const { rows } = await pool.query(`select key, name, agent_id, updated_at from qualeval_demo_agent_variants order by key`);
  return rows.map(variantRow);
}

export async function getVariant(key, env = process.env, pool = getPool(env)) {
  requirePool(pool);
  requireValidKey(key);
  const { rows } = await pool.query(
    `select key, name, agent_id, updated_at from qualeval_demo_agent_variants where key = $1`,
    [key],
  );
  return rows[0] ? variantRow(rows[0]) : null;
}

// Updates a variant's display `name` and/or `agentId` locally, and - when any
// of systemPrompt/greeting/voice is given - forwards those fields straight
// through to the variant's live AssemblyAI agent record via PUT
// /v1/agents/{id} (server/qualeval/demoAgentAgents.js's updateAgent), since
// that's where the prompt actually lives. Requires the variant to already
// have an agentId (set once by server/qualeval/demoAgentAgentsProvision.js).
export async function updateVariant(
  key,
  { name, agentId, systemPrompt, greeting, voice } = {},
  env = process.env,
  pool = getPool(env),
  { updateAgent = demoAgentAgents.updateAgent } = {},
) {
  requirePool(pool);
  requireValidKey(key);

  if (systemPrompt !== undefined || greeting !== undefined || voice !== undefined) {
    const current = await getVariant(key, env, pool);
    if (!current?.agentId) {
      throw new Error(`Variant "${key}" has no AssemblyAI agent_id yet - it hasn't been provisioned.`);
    }
    const body = {};
    if (systemPrompt !== undefined) body.system_prompt = systemPrompt;
    if (greeting !== undefined) body.greeting = greeting;
    if (voice !== undefined) body.voice = { voice_id: voice };
    await updateAgent(current.agentId, body, env);
  }

  const columns = { name, agent_id: agentId };
  const setKeys = Object.keys(columns).filter((k) => columns[k] !== undefined);
  if (setKeys.length === 0) return getVariant(key, env, pool);

  const setClause = setKeys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const { rows } = await pool.query(
    `update qualeval_demo_agent_variants set ${setClause}, updated_at = now()
     where key = $1
     returning key, name, agent_id, updated_at`,
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

// The one call server/qualeval/targetAgentStream.js's bridge needs at
// connect time: whichever variant is currently active, in full - just its
// AssemblyAI agent_id, since that's what binds the live session.
export async function getActiveVariant(env = process.env, pool = getPool(env)) {
  requirePool(pool);
  const { rows } = await pool.query(
    `select v.key, v.name, v.agent_id, v.updated_at
     from qualeval_demo_agent_state s
     join qualeval_demo_agent_variants v on v.key = s.active_variant
     where s.id = true`,
  );
  if (rows.length === 0) throw new Error("No active demo-agent variant configured");
  const variant = variantRow(rows[0]);
  if (!variant.agentId) throw new Error(`Active demo-agent variant "${variant.key}" has no AssemblyAI agent_id yet.`);
  return variant;
}

// Live prompt/greeting/voice for a variant, read straight from its
// AssemblyAI agent record - server/qualeval/router.js's
// GET /demo-agent/variants uses this so the operator sees what's actually
// live, not a locally-cached copy that could drift.
export async function getVariantWithAgent(
  key,
  env = process.env,
  pool = getPool(env),
  { getAgent = demoAgentAgents.getAgent } = {},
) {
  const variant = await getVariant(key, env, pool);
  if (!variant) return null;
  if (!variant.agentId) return variant;
  const agent = await getAgent(variant.agentId, env).catch(() => null);
  return {
    ...variant,
    systemPrompt: agent?.system_prompt ?? null,
    greeting: agent?.greeting ?? null,
    voice: agent?.voice?.voice_id ?? null,
  };
}
