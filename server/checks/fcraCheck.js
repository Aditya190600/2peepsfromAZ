// FCRA §1681m/§1681b whole-call checks. piiScan.js (patternPacks.js) matches
// each pattern's regex against one turn's text at a time, so a same-turn
// "trigger without disclosure nearby" regex false-flags a compliant call that
// speaks the required language in a later turn - a natural way for a voice
// agent to phrase two sentences. These checks instead scan every turn for the
// trigger, then separately scan every turn in the whole session for the
// required language, mirroring caSb1001BotDisclosureCheck's whole-call scan.

const ADVERSE_ACTION_TRIGGER =
  /\b(?:den(?:y|ies|ied|ying)|reject(?:s|ed|ing)?|increas(?:e|es|ed|ing))\b[^.!?]{0,80}\bcredit\s+(?:report|history|score)\b/i;
const ADVERSE_ACTION_DISCLOSURE = /\b(?:right to dispute|free copy|dispute the accuracy|reporting agency)\b/i;

export function fcraAdverseActionDisclosureCheck(session) {
  const turns = session.turns ?? [];
  const trigger = turns.find((t) => ADVERSE_ACTION_TRIGGER.test(t.text));
  if (!trigger) {
    return {
      check: "fcra_adverse_action_disclosure",
      status: "n/a",
      detail: "No adverse-action-on-credit language detected in this call.",
    };
  }
  const disclosed = turns.some((t) => ADVERSE_ACTION_DISCLOSURE.test(t.text));
  if (disclosed) {
    return {
      check: "fcra_adverse_action_disclosure",
      status: "pass",
      detail: `Adverse action at ${trigger.tMs}ms ("${trigger.text}") was accompanied by required FCRA §1681m disclosure language somewhere in the call.`,
      tMs: trigger.tMs,
    };
  }
  return {
    check: "fcra_adverse_action_disclosure",
    status: "flag",
    detail: `Adverse action at ${trigger.tMs}ms ("${trigger.text}") with no FCRA §1681m disclosure (right to dispute, free copy, reporting agency) detected anywhere in the call.`,
    tMs: trigger.tMs,
  };
}

const CREDIT_PULL_TRIGGER = /\b(?:pull|run|check|access)\b[^.!?]{0,40}\bcredit\s*(?:report|check|history)\b/i;
const CREDIT_PULL_PERMISSIBLE_PURPOSE = /\b(?:authoriz\w*|permission|consent|your approval)\b/i;

export function fcraCreditPullPermissiblePurposeCheck(session) {
  const turns = session.turns ?? [];
  const trigger = turns.find((t) => CREDIT_PULL_TRIGGER.test(t.text));
  if (!trigger) {
    return {
      check: "fcra_credit_pull_permissible_purpose",
      status: "n/a",
      detail: "No credit report/check pull mentioned in this call.",
    };
  }
  const authorized = turns.some((t) => CREDIT_PULL_PERMISSIBLE_PURPOSE.test(t.text));
  if (authorized) {
    return {
      check: "fcra_credit_pull_permissible_purpose",
      status: "pass",
      detail: `Credit pull at ${trigger.tMs}ms ("${trigger.text}") was accompanied by permissible-purpose/authorization language somewhere in the call.`,
      tMs: trigger.tMs,
    };
  }
  return {
    check: "fcra_credit_pull_permissible_purpose",
    status: "flag",
    detail: `Credit pull at ${trigger.tMs}ms ("${trigger.text}") with no permissible-purpose/authorization language detected anywhere in the call.`,
    tMs: trigger.tMs,
  };
}
