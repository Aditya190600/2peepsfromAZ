// California SB 1001 (Bot Disclosure Act), Cal. Bus. & Prof. Code §§17940-17942,
// operative 2019-07-01. Verified against the enrolled bill text
// (leginfo.legislature.ca.gov, bill_id=201720180SB1001) and secondary
// legal-tracking sources on 2026-09-24: it is unlawful to use a bot to
// communicate with a California resident with intent to mislead them about
// its artificial identity, for the purpose of incentivizing a commercial
// transaction or influencing a vote, unless the bot use is disclosed "clear,
// conspicuous, and reasonably designed to inform" - the statute names no
// fixed time window. That's the distinct requirement from the always-on
// ai_disclosure check (CA AB 2905-style, restricted to the first 10s) - see
// disclosureCheck.js - so this check scans the whole call, not just its
// opening seconds.
const BOT_ENTITY = "(?:bot|chatbot|virtual assistant|AI (?:assistant|agent|system)|automated (?:assistant|system))";
const BOT_DISCLOSURE_PHRASES = new RegExp(
  `\\b(I(?:'m| am) (?:a |an )?${BOT_ENTITY}|you(?:'re| are) (?:speaking|talking) (?:with|to) (?:a |an )?${BOT_ENTITY}|this (?:is|call uses) (?:a |an )?${BOT_ENTITY})\\b`,
  "i",
);

export function caSb1001BotDisclosureCheck(session) {
  const turns = session.turns ?? [];
  const agentTurns = turns.filter((t) => t.role === "agent");
  const match = agentTurns.find((t) => BOT_DISCLOSURE_PHRASES.test(t.text));

  if (!match) {
    return {
      check: "ca_sb1001_bot_disclosure",
      status: "flag",
      detail:
        "No bot/AI self-identification language detected anywhere in the agent's turns. SB 1001 requires clear, conspicuous disclosure, not tied to a fixed time window.",
    };
  }
  return {
    check: "ca_sb1001_bot_disclosure",
    status: "pass",
    detail: `Bot/AI self-identification detected at ${match.tMs}ms: "${match.text}"`,
    tMs: match.tMs,
  };
}
