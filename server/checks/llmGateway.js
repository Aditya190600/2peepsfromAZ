// Thin client for AssemblyAI's LLM Gateway.
// Auth is the raw API key with no "Bearer" prefix - different from the Voice
// Agent API, which does require Bearer. See AGENTS.md for the standing
// convention of verifying this against the live docs before relying on it.
const LLM_GATEWAY_URL = "https://llm-gateway.assemblyai.com/v1/chat/completions";
const DEFAULT_MODEL = "claude-sonnet-4-6";

export async function callLlmGateway(messages, options = {}) {
  const {
    apiKey = process.env.ASSEMBLYAI_API_KEY,
    model = DEFAULT_MODEL,
    maxTokens = 1000,
    temperature = 0,
  } = options;

  const resp = await fetch(LLM_GATEWAY_URL, {
    method: "POST",
    headers: { authorization: apiKey, "content-type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
  });
  if (!resp.ok) {
    throw new Error(`LLM Gateway request failed: ${resp.status} ${await resp.text()}`);
  }
  const body = await resp.json();
  return body.choices[0].message.content;
}

export function parseJsonResponse(content, fallback) {
  try {
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}
