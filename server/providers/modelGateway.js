// Default model slot: the existing AssemblyAI LLM Gateway client, mutex and
// 429 backoff included unchanged. See server/checks/llmGateway.js.
import { callLlmGateway } from "../checks/llmGateway.js";

export const complete = callLlmGateway;
