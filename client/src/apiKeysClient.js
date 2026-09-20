// Thin client for the server's account-scoped API key management routes
// (server/apiKeys.js). The raw key value is only ever present in the
// createApiKey response - it is never returned by list.
export async function fetchApiKeys() {
  const resp = await fetch("/v1/api-keys");
  const body = await resp.json();
  if (!resp.ok) throw new Error(body.error ?? "Could not load API keys.");
  return body;
}

export async function createApiKey({ name, scopes, expiresInDays }) {
  const resp = await fetch("/v1/api-keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, scopes, expiresInDays }),
  });
  const body = await resp.json();
  if (!resp.ok) throw new Error(body.error ?? "Could not create the API key.");
  return body;
}

export async function updateApiKeyExpiry(id, expiresInDays) {
  const resp = await fetch(`/v1/api-keys/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expiresInDays }),
  });
  const body = await resp.json();
  if (!resp.ok) throw new Error(body.error ?? "Could not update the key's expiry.");
  return body;
}

export async function revokeApiKey(id) {
  const resp = await fetch(`/v1/api-keys/${encodeURIComponent(id)}/revoke`, { method: "POST" });
  const body = await resp.json();
  if (!resp.ok) throw new Error(body.error ?? "Could not revoke the API key.");
  return body;
}
