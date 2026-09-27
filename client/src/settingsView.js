// Pure view helpers for Settings.jsx, split out so node --test can cover them.

export const CUSTOM_PHONE_OPTION = "__custom__";

// Formats an E.164 US number (+18038245760) as (803) 824-5760 for display;
// anything else is shown as-is.
export function formatPhoneNumber(e164) {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164 ?? "");
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : e164;
}

// Groups agents by domain in the order the server returned them (catalog
// order), so each domain's compliant/flawed pair sits together.
export function groupByDomain(agents) {
  const groups = [];
  for (const agent of agents) {
    let group = groups.find((g) => g.domain === agent.domain);
    if (!group) {
      group = { domain: agent.domain, label: agent.domainLabel ?? agent.domain, agents: [] };
      groups.push(group);
    }
    group.agents.push(agent);
  }
  return groups;
}

export function buildPhoneNumberOptions({ agentPhoneNumber, personaPhoneNumber, importedNumbers = [] }) {
  const options = [];
  const seen = new Set();

  function addOption(id, label, number) {
    const normalized = (number ?? "").trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    options.push({ id: normalized, label, number: normalized });
  }

  addOption(agentPhoneNumber, "Demo target agent", agentPhoneNumber);
  for (const entry of importedNumbers) {
    addOption(entry.e164, entry.label || "Imported number", entry.e164);
  }
  addOption(personaPhoneNumber, "QualEval caller number", personaPhoneNumber);
  options.push({ id: CUSTOM_PHONE_OPTION, label: "Custom number…", number: null });
  return options;
}

export function resolvePhoneMenuSelection(options, storedNumber) {
  const normalized = (storedNumber ?? "").trim();
  if (!normalized) {
    return {
      selectedId: options[0]?.id ?? CUSTOM_PHONE_OPTION,
      customValue: "",
      resolvedNumber: options[0]?.number ?? "",
    };
  }
  const match = options.find((option) => option.number === normalized);
  if (match) {
    return { selectedId: match.id, customValue: normalized, resolvedNumber: normalized };
  }
  return { selectedId: CUSTOM_PHONE_OPTION, customValue: normalized, resolvedNumber: normalized };
}
