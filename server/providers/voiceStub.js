// Second voice provider is intentionally a documented stub, not a fake
// integration - see .claude/epics/provider-swaps/52.md ("Keep AssemblyAI
// Voice Agent as voice default. Document/stub a second voice provider.").
// Selecting it surfaces a clear, human error instead of pretending to work.
export async function mintToken() {
  return {
    status: 501,
    body: {
      error:
        "Custom voice is selected but not implemented yet. Switch back to AssemblyAI Voice Agent to start a live call.",
    },
  };
}
