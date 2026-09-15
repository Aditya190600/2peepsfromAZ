// Thin client for the server's provider-registry routes
// (server/providers/registry.js). Never sees or sends a raw key anywhere but
// the one PUT that sets it, and never receives one back.
export async function fetchProviderCatalog() {
  const resp = await fetch("/v1/providers");
  if (!resp.ok) throw new Error("Could not load the provider catalog.");
  return resp.json();
}

export async function fetchProviderConfig() {
  const resp = await fetch("/v1/providers/config");
  if (!resp.ok) throw new Error("Could not load the current provider configuration.");
  return resp.json();
}

export async function setProviderSelection(slot, providerId) {
  const resp = await fetch("/v1/providers/config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slot, providerId }),
  });
  const body = await resp.json();
  if (!resp.ok) throw new Error(body.error ?? "Could not update the provider selection.");
  return body;
}

export async function setProviderCredential(providerId, apiKey, extra = {}) {
  const resp = await fetch("/v1/providers/credentials", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ providerId, apiKey, ...extra }),
  });
  const body = await resp.json();
  if (!resp.ok) throw new Error(body.error ?? "Could not save the API key.");
  return body;
}
