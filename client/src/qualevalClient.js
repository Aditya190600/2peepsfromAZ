// Thin client for the server's QualEval routes (server/qualeval/router.js).
async function json(resp) {
  const body = await resp.json();
  if (!resp.ok) {
    const err = new Error(body.error ?? "Qualitative Evals request failed.");
    err.status = resp.status;
    throw err;
  }
  return body;
}

export async function listEvaluations() {
  return json(await fetch("/v1/qualeval/evaluations")).then((body) => body.evaluations);
}

export async function createEvaluation({ name, agentPhoneNumber, description, requirements, demoAgentKey }) {
  return json(
    await fetch("/v1/qualeval/evaluations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, agentPhoneNumber, description, requirements, demoAgentKey }),
    }),
  );
}

export async function getEvaluation(id) {
  return json(await fetch(`/v1/qualeval/evaluations/${encodeURIComponent(id)}`));
}

// Phone Evals: calls that dialed an agent number directly, outside any
// QualEval scenario run. Admins see every call; others only calls to numbers
// they registered in Settings.
export async function listPhoneEvalCalls() {
  return json(await fetch("/v1/qualeval/phone-evals")).then((body) => body.calls);
}

export async function rerunPhoneEvalAnalysis(callSid) {
  return json(
    await fetch(`/v1/qualeval/phone-evals/${encodeURIComponent(callSid)}/analyze`, { method: "POST" }),
  );
}

export async function updateEvaluation(id, fields) {
  return json(
    await fetch(`/v1/qualeval/evaluations/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fields),
    }),
  );
}

export async function deleteEvaluation(id) {
  const resp = await fetch(`/v1/qualeval/evaluations/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error ?? "Could not delete the evaluation.");
  }
}

export async function getQualevalConfig() {
  return json(await fetch("/v1/qualeval/config"));
}

export async function generateScenarios(evaluationId, feedback, count) {
  return json(
    await fetch(`/v1/qualeval/evaluations/${encodeURIComponent(evaluationId)}/scenarios/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feedback, count }),
    }),
  ).then((body) => body.scenarios);
}

export async function updateScenario(id, fields) {
  return json(
    await fetch(`/v1/qualeval/scenarios/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fields),
    }),
  );
}

export async function deleteScenario(id) {
  const resp = await fetch(`/v1/qualeval/scenarios/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error ?? "Could not delete the scenario.");
  }
}

export async function deleteScenariosByStatus(evaluationId, status) {
  const resp = await fetch(
    `/v1/qualeval/evaluations/${encodeURIComponent(evaluationId)}/scenarios?status=${encodeURIComponent(status)}`,
    { method: "DELETE" },
  );
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error ?? "Could not delete these scenarios.");
  }
}

export async function createRun(scenarioId) {
  return json(
    await fetch(`/v1/qualeval/scenarios/${encodeURIComponent(scenarioId)}/runs`, { method: "POST" }),
  );
}

export async function getRun(id) {
  return json(await fetch(`/v1/qualeval/runs/${encodeURIComponent(id)}`));
}

export async function endRun(id) {
  return json(await fetch(`/v1/qualeval/runs/${encodeURIComponent(id)}/end`, { method: "POST" }));
}

// Target agents that can answer QUALEVAL_AGENT_NUMBER, plus which one is
// live right now (server/qualeval/router.js's /demo-agent routes).
export async function listDemoAgents() {
  return json(await fetch("/v1/qualeval/demo-agent/variants"));
}

export async function setActiveDemoAgent(key) {
  return json(
    await fetch("/v1/qualeval/demo-agent/active", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variant: key }),
    }),
  ).then((body) => body.activeKey);
}

// Downloads an evaluation's scenario set as .xlsx (GET
// /evaluations/:id/scenarios.xlsx). Fetched as a blob rather than a plain
// link so a failure surfaces as an error instead of a downloaded JSON body.
export async function exportScenariosXlsx(evaluationId) {
  const resp = await fetch(`/v1/qualeval/evaluations/${encodeURIComponent(evaluationId)}/scenarios.xlsx`);
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error ?? "Could not export these scenarios.");
  }
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = attachmentFilename(resp.headers.get("content-disposition")) ?? "scenarios.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function attachmentFilename(header) {
  if (!header) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) return decodeURIComponent(encoded[1]);
  const plain = /filename="([^"]+)"/i.exec(header);
  return plain ? plain[1] : null;
}
