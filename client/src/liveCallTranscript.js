// Pure helpers for live-call transcript timing and TTS echo suppression.

export function normalizeTranscriptText(text) {
  return (text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Drop a transcript.user turn that is really the agent's own speech bleeding
// back into the mic and getting transcribed as the caller.
export function shouldDropEchoUserTurn(text, tMs, agentPlaybackUntilMs, lastAgentText, graceMs = 400) {
  if (tMs <= agentPlaybackUntilMs + graceMs) return true;
  const user = normalizeTranscriptText(text);
  const agent = normalizeTranscriptText(lastAgentText);
  if (!user || !agent) return false;
  if (user === agent) return true;
  const shorter = user.length <= agent.length ? user : agent;
  const longer = user.length > agent.length ? user : agent;
  if (shorter.length >= 12 && longer.includes(shorter)) return true;
  return false;
}

export function agentTurnStartMs(replyAudioStartMs, fallbackMs) {
  return replyAudioStartMs ?? fallbackMs;
}
