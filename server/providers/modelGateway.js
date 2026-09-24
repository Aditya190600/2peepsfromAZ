// Default model slot: the existing AssemblyAI LLM Gateway client, mutex and
// 429 backoff included unchanged. See server/checks/llmGateway.js.
import { callLlmGatewayWithUsage } from "../checks/llmGateway.js";

export const complete = callLlmGatewayWithUsage;
