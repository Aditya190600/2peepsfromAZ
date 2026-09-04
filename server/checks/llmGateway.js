// Thin client for AssemblyAI's LLM Gateway.
// Auth is the raw API key with no "Bearer" prefix - different from the Voice
// Agent API, which does require Bearer. See AGENTS.md for the standing
// convention of verifying this against the live docs before relying on it.
const LLM_GATEWAY_URL = "https://llm-gateway.assemblyai.com/v1/chat/completions";
// Bedrock/Vertex/OpenAI-provider models (Claude, Gemini, GPT, etc.) return
// "Your account does not have access to this LLM Gateway model" on
// accounts without those provider integrations enabled - verified live
// against a real account 2026-09-04. qwen3.5-4b-32k-fast is served
// directly by AssemblyAI (no third-party provider gating), so it's the
// broadly-available default. See /docs/llm-gateway/available-models.
const DEFAULT_MODEL = "qwen3.5-4b-32k-fast";

export class LlmGatewayModelAccessError extends Error {
  constructor(model, status, body) {
    super(`LLM Gateway model access denied for "${model}": ${status} ${body}`);
    this.name = "LlmGatewayModelAccessError";
    this.model = model;
  }
}

// Thrown after retries are exhausted on a 429. Kept distinct from a generic
// failure so callers can show honest "rate limited" copy instead of a raw
// error dump. See docs/judging-criteria-and-enterprise-gap-assessment.md #1.
export class LlmGatewayRateLimitError extends Error {
  constructor(status, body) {
    super(`LLM Gateway rate limited after retries: ${status} ${body}`);
    this.name = "LlmGatewayRateLimitError";
  }
}

const RETRYABLE_429_DELAYS_MS = [500, 1500, 3500];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callLlmGateway(messages, options = {}) {
  const {
    apiKey = process.env.ASSEMBLYAI_API_KEY,
    model = DEFAULT_MODEL,
    maxTokens = 1000,
    temperature = 0,
  } = options;

  let lastStatus, lastText;
  for (let attempt = 0; attempt <= RETRYABLE_429_DELAYS_MS.length; attempt++) {
    const resp = await fetch(LLM_GATEWAY_URL, {
      method: "POST",
      headers: { authorization: apiKey, "content-type": "application/json" },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
    });
    if (resp.ok) {
      const body = await resp.json();
      return body.choices[0].message.content;
    }

    const text = await resp.text();
    if (resp.status === 400 && text.includes("does not have access to this LLM Gateway model")) {
      throw new LlmGatewayModelAccessError(model, resp.status, text);
    }
    if (resp.status !== 429) {
      throw new Error(`LLM Gateway request failed: ${resp.status} ${text}`);
    }
    lastStatus = resp.status;
    lastText = text;
    if (attempt < RETRYABLE_429_DELAYS_MS.length) {
      await sleep(RETRYABLE_429_DELAYS_MS[attempt]);
    }
  }
  throw new LlmGatewayRateLimitError(lastStatus, lastText);
}

export function parseJsonResponse(content, fallback) {
  try {
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}
