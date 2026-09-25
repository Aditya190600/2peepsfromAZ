import * as demoAgentConfig from "./demoAgentConfig.js";
import { createAgent, assemblyAiConfigured } from "./demoAgentAgents.js";
import { DEMO_AGENT_DEFAULTS } from "./demoAgentDefaults.js";

// Idempotently creates the two AssemblyAI stored agents behind
// QUALEVAL_AGENT_NUMBER's variants (server/qualeval/demoAgentConfig.js) on
// every boot, same "self-heal on restart" posture as demoAgentProvision.js's
// Twilio Voice Configuration check. Only creates an agent the first time a
// variant row has no agent_id yet - after that, editing goes through
// PATCH /v1/qualeval/demo-agent/variants/:key, which updates the live
// AssemblyAI record directly rather than recreating it.
export async function ensureDemoAgentsProvisioned({
  env = process.env,
  listVariants = demoAgentConfig.listVariants,
  updateVariant = demoAgentConfig.updateVariant,
  create = createAgent,
} = {}) {
  if (!assemblyAiConfigured(env) || !demoAgentConfig.dbConfigured(env)) return;

  const variants = await listVariants(env).catch((err) => {
    console.error(`QualEval: could not list demo-agent variants to provision: ${err.message}`);
    return [];
  });

  for (const variant of variants) {
    if (variant.agentId) continue;
    const defaults = DEMO_AGENT_DEFAULTS[variant.key];
    if (!defaults) continue;
    try {
      const agent = await create(defaults, env);
      await updateVariant(variant.key, { agentId: agent.id }, env);
      console.log(`QualEval: provisioned demo-agent variant "${variant.key}" as AssemblyAI agent ${agent.id}`);
    } catch (err) {
      console.error(`QualEval: failed to provision demo-agent variant "${variant.key}": ${err.message}`);
    }
  }
}
