// Thin client for the server's QualEval routes (server/qualeval/router.js).
async function json(resp) {
  const body = await resp.json();
  if (!resp.ok) throw new Error(body.error ?? "QualEval request failed.");
  return body;
}

export async function listEvaluations() {
  return json(await fetch("/v1/qualeval/evaluations")).then((body) => body.evaluations);
}

export async function createEvaluation({ name, agentPhoneNumber, description, requirements }) {
  return json(
    await fetch("/v1/qualeval/evaluations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, agentPhoneNumber, description, requirements }),
    }),
  );
}

export async function getEvaluation(id) {
  return json(await fetch(`/v1/qualeval/evaluations/${encodeURIComponent(id)}`));
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
