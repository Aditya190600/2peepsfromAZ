// Default voice slot: mints an AssemblyAI Voice Agent token exactly as
// server/index.js used to do inline. The real API key never leaves the
// server. See AGENTS.md for the token-mint endpoint shape.
import { getCredential } from "./store.js";

const TOKEN_URL =
  "https://agents.assemblyai.com/v1/token?expires_in_seconds=300&max_session_duration_seconds=8640";

export async function mintToken() {
  const apiKey = getCredential("assemblyai-voice-agent")?.apiKey ?? process.env.ASSEMBLYAI_API_KEY;
  const resp = await fetch(TOKEN_URL, { headers: { Authorization: `Bearer ${apiKey}` } });
  const body = await resp.json();
  return { status: resp.status, body };
}
