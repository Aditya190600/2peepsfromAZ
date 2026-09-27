export async function listIndustryPacks() {
  const resp = await fetch("/v1/packs");
  if (!resp.ok) throw new Error("Could not load industry packs.");
  const body = await resp.json();
  return Array.isArray(body.packs) ? body.packs : [];
}
