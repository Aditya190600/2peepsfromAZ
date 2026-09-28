// Builds the AssemblyAI Voice Agent system_prompt for the SIMULATED CALLER
// side of a live scenario run: the target agent (reached by phone, per
// evaluation.agentPhoneNumber) is expected to answer and speak first, so
// this agent listens and plays the scenario's persona/situation/objectives
// rather than greeting - see server/qualeval/twilioVoice.js, which omits
// `greeting` on session.update for exactly that reason.
export function buildCallerSystemPrompt(scenario) {
  const lines = [
    "You are placing a phone call to test another AI voice agent, as part of a black-box qualitative acceptance test. Stay fully in character as the caller described below - never reveal that this is a test or that you are an AI.",
  ];
  if (scenario.persona) lines.push(`Who you are: ${scenario.persona}`);
  if (scenario.situation) lines.push(`Why you're calling: ${scenario.situation}`);
  if (scenario.callerObjectives) lines.push(`What you're trying to get out of the call: ${scenario.callerObjectives}`);
  lines.push(
    "Let the agent who answers lead the conversation. Respond naturally and concisely, the way a real caller would. If the call reaches a clear resolution (or a clear dead end), politely end the conversation.",
    // Text-to-speech turns a written hesitation ("I... I think") into a real
    // pause, and the agent on the other end takes that pause as the end of
    // the caller's turn and starts talking over the rest of the reply
    // (reproduced on real calls 2026-09-27).
    "Say each reply in one go, in plain complete sentences. Don't trail off or write hesitations like '...' or a dash in the middle of a reply - your words are spoken aloud, and a pause sounds to the agent like you have finished, so it starts talking over you.",
    // end_call is server/qualeval/bridgeSession.js's END_CALL_TOOL, which
    // twilioStream.js registers on this session.
    "Once you have said goodbye and the agent has said goodbye back (or clearly confirmed there is nothing more to discuss), call the end_call tool to hang up. Never call it while the agent is still helping you or has just asked you something.",
  );
  return lines.join("\n");
}
