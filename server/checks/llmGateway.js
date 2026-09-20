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

// Thrown after retries are exhausted on a 429, or on a request that timed
// out on every attempt (see TIMEOUT_MS below). Kept distinct from a generic
// failure so callers can show honest "temporarily unavailable" copy instead
// of a raw error dump. See docs/judging-criteria-and-enterprise-gap-assessment.md #1.
export class LlmGatewayRateLimitError extends Error {
  constructor(status, body) {
    const reason = status === "timeout" ? "timed out" : "rate limited";
    super(`LLM Gateway ${reason} after retries: ${status} ${body}`);
    this.name = "LlmGatewayRateLimitError";
  }
}

// The account's real Gateway limit is tight (~2 calls/30s, see AGENTS.md).
// With the mutex above, 429s are no longer caused by overlapping callers -
// they mean the account has exhausted its window and just needs to wait for
// it to roll over. A short backoff (previously 500/1500/3500ms, ~5.5s total)
// gives up well before that, so a cold multi-session run still errors out.
// Push the budget past a full window: worst case ~61s of waiting is fine,
// since callers are already serialized and queued behind each other.
const RETRYABLE_429_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000];

// A hung upstream connection (no response, not even an error) previously
// wedged the process-wide mutex below forever - every later caller queued
// behind it and hung identically until the process restarted. Bound every
// attempt so a hang fails fast and retries through the same ladder as a 429.
const DEFAULT_TIMEOUT_MS = 25_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Process-wide mutex: a cold multi-session demo run fires this from several
// concurrent checks/callers at once, and the account's Gateway rate limit is
// tight (~2 calls/30s) - see AGENTS.md. Queue everyone onto one call at a
// time rather than letting them all race the 429 retry loop simultaneously.
// ponytail: single global queue serializes ALL callers even across unrelated
// sessions; per-API-key sharding if throughput ever needs it.
let gatewayQueue = Promise.resolve();

export function callLlmGateway(messages, options = {}) {
  const result = gatewayQueue.then(() => callLlmGatewayNow(messages, options));
  gatewayQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function callLlmGatewayNow(messages, options = {}) {
  const {
    apiKey = process.env.ASSEMBLYAI_API_KEY,
    model = DEFAULT_MODEL,
    maxTokens = 1000,
    temperature = 0,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  let lastStatus, lastText;
  for (let attempt = 0; attempt <= RETRYABLE_429_DELAYS_MS.length; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let resp;
    try {
      resp = await fetch(LLM_GATEWAY_URL, {
        method: "POST",
        headers: { authorization: apiKey, "content-type": "application/json" },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name !== "AbortError") throw err;
      lastStatus = "timeout";
      lastText = `no response within ${timeoutMs}ms`;
      if (attempt < RETRYABLE_429_DELAYS_MS.length) {
        await sleep(RETRYABLE_429_DELAYS_MS[attempt]);
      }
      continue;
    } finally {
      clearTimeout(timer);
    }

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
