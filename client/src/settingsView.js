// Pure view helpers for Settings.jsx, split out so node --test can cover them.

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
