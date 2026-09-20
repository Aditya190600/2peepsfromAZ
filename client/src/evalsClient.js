export async function listIndustryPacks() {
  const resp = await fetch("/v1/packs");
  if (!resp.ok) throw new Error("Could not load industry packs.");
  const body = await resp.json();
  return Array.isArray(body.packs) ? body.packs : [];
}

export async function runPackEvals(packIds) {
  const resp = await fetch("/v1/pack-evals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packIds }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(body.error ?? "Pack evals failed to run.");
  }
  return body;
}
