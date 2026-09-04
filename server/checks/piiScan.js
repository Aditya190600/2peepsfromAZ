import { callLlmGateway, parseJsonResponse } from "./llmGateway.js";

function redact(match) {
  if (match.length <= 4) return "*".repeat(match.length);
  return match.slice(0, 2) + "*".repeat(match.length - 4) + match.slice(-2);
}

const NER_SYSTEM_PROMPT = `You will be given a phone-call transcript as a JSON array of turns, each shaped {"turnIndex": number, "role": "agent"|"user", "text": string}. Identify personally identifiable information mentioned anywhere in the text: person names, organization names, email addresses, phone numbers, and full street addresses. Respond with ONLY a JSON object, no other text: {"items": [{"turnIndex": number, "type": "person_name"|"organization"|"email"|"phone_number"|"address", "text": "<exact substring as it appears in that turn>"}]}. Return {"items": []} if none are found. Do not report SSNs, credit card numbers, or account numbers - those are covered separately.`;

// Free-form PII (names, orgs, emails, addresses) that regex can't reliably
// catch. Runs one LLM Gateway call over the whole session - see
// docs/guardrails-llm-gateway-integration.md for why LLM Gateway rather than
// Guardrails' audio-time redact_pii is the fit here.
async function llmPiiScan(session, llmGateway) {
  const turns = session.turns ?? [];
  if (turns.length === 0) return [];

  const payload = turns.map((t, turnIndex) => ({ turnIndex, role: t.role, text: t.text }));

  let content;
  try {
    content = await llmGateway([
      { role: "system", content: NER_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(payload) },
    ]);
  } catch (err) {
    return { error: err.message };
  }

  const parsed = parseJsonResponse(content, { items: [] });
  const items = Array.isArray(parsed.items) ? parsed.items : [];

  return items
    .filter((item) => turns[item.turnIndex] && typeof item.text === "string" && item.text.length > 0)
    .map((item) => ({
      turnIndex: item.turnIndex,
      tMs: turns[item.turnIndex].tMs,
      role: turns[item.turnIndex].role,
      packId: "llm_gateway_ner",
      patternId: item.type,
      label: `LLM Gateway-detected ${String(item.type).replace(/_/g, " ")}`,
      matchRedacted: redact(item.text),
    }));
}

// Scans every transcript turn against every pattern in every supplied pack
// (deterministic, structured PII like SSN/credit-card/account-number - see
// patternPacks.js), then supplements with an LLM Gateway pass for free-form
// PII regex can't express. Packs stay pluggable: pass [genericPack] for the
// core scan, or [genericPack, hipaaPack] to drop in an industry pack alongside it.
export async function piiScan(session, patternPacks, { llmGateway = callLlmGateway } = {}) {
  const items = [];
  const turns = session.turns ?? [];

  turns.forEach((turn, turnIndex) => {
    for (const pack of patternPacks) {
      for (const pattern of pack.patterns) {
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
        for (const match of turn.text.matchAll(regex)) {
          if (pattern.validate && !pattern.validate(match[0])) continue;
          items.push({
            turnIndex,
            tMs: turn.tMs,
            role: turn.role,
            packId: pack.id,
            patternId: pattern.id,
            label: pattern.label,
            matchRedacted: redact(match[0]),
          });
        }
      }
    }
  });

  const llmResult = await llmPiiScan(session, llmGateway);
  let llmGatewayError = null;
  if (Array.isArray(llmResult)) {
    items.push(...llmResult);
  } else {
    llmGatewayError = llmResult.error;
  }

  return {
    check: "pii_scan",
    status: items.length > 0 ? "flag" : "pass",
    patternPacksUsed: patternPacks.map((p) => p.id),
    ...(llmGatewayError ? { llmGatewayError } : {}),
    items,
  };
}
