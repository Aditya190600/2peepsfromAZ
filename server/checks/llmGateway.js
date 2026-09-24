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

// Published LLM Gateway per-1M-token pricing (USD), verified live against
// /docs/llm-gateway/available-models on 2026-09-23 - see AGENTS.md's
// standing convention on checking docs before relying on a rate/field name.
// Real billing may add regional surcharges/rounding this table doesn't
// model, so every dollar figure derived from it is surfaced as an estimate,
// never as an exact charge - see estimateCostUsd below.
const MODEL_PRICING_PER_MILLION_USD = {
  "qwen3.5-4b-32k-fast": { prompt: 0.1, completion: 0.5 },
};

// Returns null (rather than 0) when the model isn't in the pricing table
// above, so callers can render "cost unknown" instead of a misleading $0.00.
export function estimateCostUsd(model, usage) {
  const pricing = MODEL_PRICING_PER_MILLION_USD[model];
  if (!pricing || !usage) return null;
  const promptCost = (usage.inputTokens / 1_000_000) * pricing.prompt;
  const completionCost = (usage.outputTokens / 1_000_000) * pricing.completion;
  return promptCost + completionCost;
}

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

function enqueueGatewayCall(messages, options) {
  const result = gatewayQueue.then(() => callLlmGatewayNow(messages, options));
  gatewayQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

// Back-compat contract: resolves to the completion text only, same as
// before this change. Callers that need token/cost metrics (see
// callLlmGatewayWithUsage below) get the richer shape; everyone else -
// provider adapters, evals, existing tests - keeps working unchanged.
export function callLlmGateway(messages, options = {}) {
  return enqueueGatewayCall(messages, options).then((result) => result.content);
}

// Same call, same queue/retry/backoff behavior, but resolves to
// { content, usage: {inputTokens, outputTokens, totalTokens}, costUsd, model, durationMs }
// so the three checks that call the Gateway (disclosureCheck, piiScan,
// scopeAdherenceCheck) can thread real token/cost numbers back out through
// analyzeSession's report shape. This is the default `complete` for the
// AssemblyAI model slot (server/providers/modelGateway.js) - a BYO
// OpenAI-compatible provider still implements the plain-string contract
// above, so its checks simply report no usage/cost, which is honest given
// this project doesn't have that provider's pricing.
export function callLlmGatewayWithUsage(messages, options = {}) {
  return enqueueGatewayCall(messages, options);
}

async function callLlmGatewayNow(messages, options = {}) {
  const {
    apiKey = process.env.ASSEMBLYAI_API_KEY,
    model = DEFAULT_MODEL,
    maxTokens = 1000,
    temperature = 0,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const startedAt = Date.now();
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
        const delayMs = RETRYABLE_429_DELAYS_MS[attempt];
        console.warn(
          `[llmGateway] attempt ${attempt + 1} timed out after ${timeoutMs}ms, retrying in ${delayMs}ms`,
        );
        await sleep(delayMs);
      }
      continue;
    } finally {
      clearTimeout(timer);
    }

    if (resp.ok) {
      const body = await resp.json();
      const rawUsage = body.usage ?? {};
      const usage = {
        inputTokens: rawUsage.input_tokens ?? 0,
        outputTokens: rawUsage.output_tokens ?? 0,
        totalTokens: rawUsage.total_tokens ?? (rawUsage.input_tokens ?? 0) + (rawUsage.output_tokens ?? 0),
      };
      const costUsd = estimateCostUsd(model, usage);
      const durationMs = Date.now() - startedAt;
      console.log(
        `[llmGateway] model=${model} inputTokens=${usage.inputTokens} outputTokens=${usage.outputTokens} ` +
          `totalTokens=${usage.totalTokens} costUsd=${costUsd === null ? "n/a" : costUsd.toFixed(6)} ` +
          `durationMs=${durationMs} attempt=${attempt + 1}`,
      );
      return { content: body.choices[0].message.content, usage, costUsd, model, durationMs };
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
      const delayMs = RETRYABLE_429_DELAYS_MS[attempt];
      console.warn(`[llmGateway] attempt ${attempt + 1} got 429, retrying in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }
  const durationMs = Date.now() - startedAt;
  console.error(
    `[llmGateway] model=${model} exhausted retries after ${durationMs}ms: ${lastStatus} ${lastText}`,
  );
  throw new LlmGatewayRateLimitError(lastStatus, lastText);
}

export function parseJsonResponse(content, fallback) {
  try {
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}
