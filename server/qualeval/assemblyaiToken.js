// Mints a short-lived AssemblyAI Voice Agent token for the server-side
// caller session (server/qualeval/bridgeSession.js). Deliberately separate
// from server/providers/voiceAssemblyai.js's mintToken: that one resolves
// through the BYO-provider registry for the browser Try-page product
// surface, which is unrelated to QualEval's phone-call bridge - QualEval
// always uses the account's own AssemblyAI key directly, same as
// ASSEMBLYAI_API_KEY is read elsewhere (see AGENTS.md).
const TOKEN_URL =
  "https://agents.assemblyai.com/v1/token?expires_in_seconds=300&max_session_duration_seconds=8640";

export function assemblyAiConfigured(env = process.env) {
  return Boolean(env.ASSEMBLYAI_API_KEY);
}

export async function mintAssemblyAiToken(env = process.env, fetchImpl = fetch) {
  if (!assemblyAiConfigured(env)) throw new Error("ASSEMBLYAI_API_KEY is not configured.");
  const response = await fetchImpl(TOKEN_URL, { headers: { Authorization: `Bearer ${env.ASSEMBLYAI_API_KEY}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.token) {
    throw new Error(`AssemblyAI token mint failed: HTTP ${response.status}`);
  }
  return body.token;
}
