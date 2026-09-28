import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureDemoAgentsProvisioned } from "./demoAgentAgentsProvision.js";

const ENV = { ASSEMBLYAI_API_KEY: "aai_key", DATABASE_URL: "postgres://fake" };
// Already-provisioned agents whose live input matches the catalog, so tests
// about creation never reach the network through the input reconcile.
const upToDate = {
  get: async () => ({ input: { format: { encoding: "audio/pcmu" }, turn_detection: { min_silence: 1200 } } }),
  update: async () => {
    throw new Error("should not be called");
  },
};

test("creates an agent and persists its id only for a variant with no agent_id yet", async () => {
  const listVariants = async () => [
    { key: "compliant", agentId: null },
    { key: "flawed", agentId: "already_provisioned" },
  ];
  const created = [];
  const create = async (body) => {
    created.push(body);
    return { id: "new_agent_id" };
  };
  const updated = [];
  const updateVariant = async (key, fields) => updated.push({ key, fields });

  await ensureDemoAgentsProvisioned({ env: ENV, ensureVariantRows: async () => {}, listVariants, updateVariant, create, ...upToDate });

  assert.equal(created.length, 1);
  assert.equal(created[0].name, "QualEval demo target agent - compliant");
  assert.deepEqual(updated, [{ key: "compliant", fields: { agentId: "new_agent_id" } }]);
});

test("no-ops when ASSEMBLYAI_API_KEY or DATABASE_URL is missing", async () => {
  const create = async () => {
    throw new Error("should not be called");
  };
  await ensureDemoAgentsProvisioned({ env: {}, listVariants: async () => [{ key: "compliant" }], create });
});

test("a failed create for one variant does not block the other", async () => {
  const listVariants = async () => [
    { key: "compliant", agentId: null },
    { key: "flawed", agentId: null },
  ];
  const create = async (body) => {
    if (body.name.includes("compliant")) throw new Error("boom");
    return { id: "flawed_agent_id" };
  };
  const updated = [];
  const updateVariant = async (key, fields) => updated.push({ key, fields });

  await ensureDemoAgentsProvisioned({ env: ENV, ensureVariantRows: async () => {}, listVariants, updateVariant, create, ...upToDate });

  assert.deepEqual(updated, [{ key: "flawed", fields: { agentId: "flawed_agent_id" } }]);
});

test("seeds catalog rows before listing, so a newly added catalog agent gets provisioned", async () => {
  const rows = [{ key: "compliant", agentId: "already_provisioned" }];
  const ensureVariantRows = async () => rows.push({ key: "flight-compliant", agentId: null });
  const created = [];
  const create = async (body) => {
    created.push(body);
    return { id: "flight_agent_id" };
  };
  const updated = [];
  const updateVariant = async (key, fields) => updated.push({ key, fields });

  await ensureDemoAgentsProvisioned({ env: ENV, ensureVariantRows, listVariants: async () => rows, updateVariant, create, ...upToDate });

  assert.equal(created.length, 1);
  assert.equal(created[0].name, "QualEval demo target agent - flight compliant");
  assert.deepEqual(created[0].input, { format: { encoding: "audio/pcmu" }, turn_detection: { min_silence: 1200 } });
  assert.deepEqual(updated, [{ key: "flight-compliant", fields: { agentId: "flight_agent_id" } }]);
});

test("reconciles an already-provisioned agent's input settings to the catalog, leaving its prompt alone", async () => {
  const listVariants = async () => [
    { key: "healthcare-compliant", agentId: "stale_agent" },
    { key: "compliant", agentId: "current_agent" },
  ];
  const liveInputs = {
    stale_agent: { type: "audio", format: { encoding: "audio/pcmu" }, keyterms: null, turn_detection: null },
    current_agent: {
      type: "audio",
      format: { encoding: "audio/pcmu", sample_rate: 8000 },
      keyterms: null,
      turn_detection: { vad_threshold: null, min_silence: 1200, max_silence: null },
    },
  };
  const get = async (agentId) => ({ id: agentId, system_prompt: "operator-edited prompt", input: liveInputs[agentId] });
  const updates = [];
  const update = async (agentId, body) => updates.push({ agentId, body });
  const create = async () => {
    throw new Error("should not be called");
  };

  await ensureDemoAgentsProvisioned({
    env: ENV,
    ensureVariantRows: async () => {},
    listVariants,
    updateVariant: async () => {},
    create,
    get,
    update,
  });

  assert.deepEqual(updates, [
    {
      agentId: "stale_agent",
      body: { input: { format: { encoding: "audio/pcmu" }, turn_detection: { min_silence: 1200 } } },
    },
  ]);
});

test("a failed input reconcile for one agent does not block the others", async () => {
  const listVariants = async () => [
    { key: "compliant", agentId: "broken" },
    { key: "flawed", agentId: "stale" },
  ];
  const get = async (agentId) => {
    if (agentId === "broken") throw new Error("boom");
    return { input: { format: { encoding: "audio/pcmu" } } };
  };
  const updates = [];
  await ensureDemoAgentsProvisioned({
    env: ENV,
    ensureVariantRows: async () => {},
    listVariants,
    updateVariant: async () => {},
    get,
    update: async (agentId) => updates.push(agentId),
  });
  assert.deepEqual(updates, ["stale"]);
});
