export function parseSessionPaste(text) {
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, error: "Paste a session JSON object with a turns array." };
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: "That paste is not valid JSON." };
  }
  const session =
    value && typeof value === "object" && !Array.isArray(value) && Array.isArray(value.session?.turns)
      ? value.session
      : value;
  if (!session || typeof session !== "object" || Array.isArray(session)) {
    return { ok: false, error: "Paste a session JSON object with a turns array." };
  }
  if (!Array.isArray(session.turns)) {
    return { ok: false, error: "session with a turns array is required" };
  }
  return { ok: true, session };
}
