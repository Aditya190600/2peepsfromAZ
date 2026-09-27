import * as demoAgentConfig from "./demoAgentConfig.js";
import { createAgent, assemblyAiConfigured } from "./demoAgentAgents.js";
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
export async function ensureDemoAgentsProvisioned({
  env = process.env,
  ensureVariantRows = demoAgentConfig.ensureVariantRows,
  listVariants = demoAgentConfig.listVariants,
  updateVariant = demoAgentConfig.updateVariant,
  create = createAgent,
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
    if (variant.agentId) continue;
    const catalogEntry = findDemoAgent(variant.key);
    if (!catalogEntry) continue;
    try {
      const agent = await create(catalogEntry.agent, env);
      await updateVariant(variant.key, { agentId: agent.id }, env);
      console.log(`QualEval: provisioned demo-agent variant "${variant.key}" as AssemblyAI agent ${agent.id}`);
    } catch (err) {
      console.error(`QualEval: failed to provision demo-agent variant "${variant.key}": ${err.message}`);
    }
  }
}
