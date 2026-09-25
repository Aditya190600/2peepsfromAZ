// Thin REST client for AssemblyAI's stored-agent API
// (https://agents.assemblyai.com/v1/agents - see AGENTS.md's demo
// target-agent section), same injectable-fetchImpl style as
// server/qualeval/twilioClient.js. A stored agent's system_prompt/greeting/
// voice/tools live on AssemblyAI's own record, referenced by `agent_id`; see
// server/qualeval/bridgeSession.js for how that id binds a live session.
import { assemblyAiConfigured } from "./assemblyaiToken.js";

const API_BASE = "https://agents.assemblyai.com/v1";

export { assemblyAiConfigured };

function authHeaders(env) {
  // "The raw key works directly; a Bearer prefix is accepted and stripped."
  // (docs/voice-agents/voice-agent-api/manage-agents) - using Bearer here
  // matches assemblyaiToken.js's convention for the same account key.
  return { Authorization: `Bearer ${env.ASSEMBLYAI_API_KEY}`, "Content-Type": "application/json" };
}

async function asJson(response, action) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`AssemblyAI ${action} failed with HTTP ${response.status}: ${body?.detail ?? "unknown error"}`);
  }
  return body;
}

export async function createAgent(body, env = process.env, fetchImpl = fetch) {
  if (!assemblyAiConfigured(env)) throw new Error("ASSEMBLYAI_API_KEY is not configured.");
  const response = await fetchImpl(`${API_BASE}/agents`, {
    method: "POST",
    headers: authHeaders(env),
    body: JSON.stringify(body),
  });
  return asJson(response, "create-agent");
}

export async function updateAgent(agentId, body, env = process.env, fetchImpl = fetch) {
  if (!assemblyAiConfigured(env)) throw new Error("ASSEMBLYAI_API_KEY is not configured.");
  const response = await fetchImpl(`${API_BASE}/agents/${agentId}`, {
    method: "PUT",
    headers: authHeaders(env),
    body: JSON.stringify(body),
  });
  return asJson(response, "update-agent");
}

export async function getAgent(agentId, env = process.env, fetchImpl = fetch) {
  if (!assemblyAiConfigured(env)) throw new Error("ASSEMBLYAI_API_KEY is not configured.");
  const response = await fetchImpl(`${API_BASE}/agents/${agentId}`, { headers: authHeaders(env) });
  return asJson(response, "get-agent");
}
