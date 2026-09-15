// Second model vendor: any OpenAI-compatible /chat/completions endpoint
// (OpenAI itself, or a compatible proxy) via a BYO key. Same call shape as
// callLlmGateway(messages, options) so it drops into analyzeSession's
// injectable `llmGateway` option (server/checks/analyze.js) unchanged - no
// changes needed to disclosureCheck.js or piiScan.js for this adapter to work.
import { getCredential } from "./store.js";

export async function complete(messages, options = {}) {
  const credential = getCredential("openai-compatible");
  if (!credential?.apiKey) {
    throw new Error("An OpenAI-compatible model is selected but no API key is configured.");
  }
  const baseUrl = (credential.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = credential.model || "gpt-4o-mini";
  const { maxTokens = 1000, temperature = 0 } = options;

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
  });
  if (!resp.ok) {
    throw new Error(`OpenAI-compatible request failed: ${resp.status} ${await resp.text()}`);
  }
  const body = await resp.json();
  return body.choices[0].message.content;
}
