import * as demoAgentConfig from "./demoAgentConfig.js";
import { createAgent, getAgent, updateAgent, assemblyAiConfigured } from "./demoAgentAgents.js";
import { findDemoAgent } from "./demoAgentDefaults.js";

// Idempotently creates the AssemblyAI stored agents behind
// QUALEVAL_AGENT_NUMBER's selectable target agents (server/qualeval/
// demoAgentDefaults.js's DEMO_AGENTS catalog) on every boot, first inserting
// a variant row for any catalog key that doesn't have one yet - same
// "self-heal on restart" posture as demoAgentProvision.js's Twilio Voice
// Configuration check. Only creates an agent the first time a
// variant row has no agent_id yet - after that, editing goes through
// PATCH /v1/qualeval/demo-agent/variants/:key, which updates the live
// AssemblyAI record directly rather than recreating it.
//
// The one exception is the stored agent's `input` (audio format and turn
// detection): that is telephony plumbing this repo owns, not operator-edited
// content, and the Settings editor never touches it. An agent provisioned
// before a catalog change to it keeps the old settings forever otherwise, so
// every boot reconciles `input` on already-provisioned agents to the catalog.
export async function ensureDemoAgentsProvisioned({
  env = process.env,
  ensureVariantRows = demoAgentConfig.ensureVariantRows,
  listVariants = demoAgentConfig.listVariants,
  updateVariant = demoAgentConfig.updateVariant,
  create = createAgent,
  get = getAgent,
  update = updateAgent,
} = {}) {
  if (!assemblyAiConfigured(env) || !demoAgentConfig.dbConfigured(env)) return;

  try {
    await ensureVariantRows(env);
  } catch (err) {
    console.error(`QualEval: could not seed demo-agent variant rows: ${err.message}`);
  }

  const variants = await listVariants(env).catch((err) => {
    console.error(`QualEval: could not list demo-agent variants to provision: ${err.message}`);
    return [];
  });

  for (const variant of variants) {
    const catalogEntry = findDemoAgent(variant.key);
    if (!catalogEntry) continue;
    if (variant.agentId) {
      await reconcileInput(variant, catalogEntry, env, { get, update });
      continue;
    }
    try {
      const agent = await create(catalogEntry.agent, env);
      await updateVariant(variant.key, { agentId: agent.id }, env);
      console.log(`QualEval: provisioned demo-agent variant "${variant.key}" as AssemblyAI agent ${agent.id}`);
    } catch (err) {
      console.error(`QualEval: failed to provision demo-agent variant "${variant.key}": ${err.message}`);
    }
  }
}

// True when every field the catalog sets on `input` has the same value on
// the live agent. AssemblyAI echoes unset fields back as null (e.g.
// turn_detection.vad_threshold), so only the catalog's own keys count.
function inputMatches(live, wanted) {
  if (wanted === null || typeof wanted !== "object") return live === wanted;
  if (live === null || typeof live !== "object") return false;
  return Object.keys(wanted).every((k) => inputMatches(live[k], wanted[k]));
}

async function reconcileInput(variant, catalogEntry, env, { get, update }) {
  const wanted = catalogEntry.agent.input;
  try {
    const live = await get(variant.agentId, env);
    if (inputMatches(live?.input, wanted)) return;
    await update(variant.agentId, { input: wanted }, env);
    console.log(`QualEval: updated demo-agent variant "${variant.key}" input settings to the catalog's`);
  } catch (err) {
    console.error(`QualEval: could not reconcile demo-agent variant "${variant.key}" input settings: ${err.message}`);
  }
}
