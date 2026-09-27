// Operator allowlist for QUALEVAL_AGENT_NUMBER's shared controls (the
// Settings page's /v1/qualeval/demo-agent/* routes and the persona number on
// /v1/qualeval/config). The public demo lets any visitor sign in, so a signed-in
// Clerk user is not enough to flip which agent answers the shared number or to
// read every agent's system prompt.
//
// QUALEVAL_OPERATOR_EMAILS is a comma-separated, case-insensitive list of
// allowed emails, matched against the signed-in Clerk user's verified email
// addresses. Unset or empty means nobody is an operator (fail closed). "*"
// allows every visitor - the only way to open these controls when Clerk isn't
// configured, since there is then no identity to check.

export function parseOperatorEmails(raw) {
  return new Set(
    String(raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

// Returns an async (req) => boolean. `lookupEmails(userId)` resolves the
// user's verified email addresses; `userIdOf(req)` reads the signed-in user id.
// A failed lookup counts as not an operator.
export function createOperatorCheck({ allowlist, clerkEnabled, userIdOf, lookupEmails }) {
  return async (req) => {
    if (allowlist.has("*")) return true;
    if (allowlist.size === 0 || !clerkEnabled) return false;
    const userId = userIdOf(req);
    if (!userId) return false;
    let emails;
    try {
      emails = await lookupEmails(userId);
    } catch (err) {
      console.error(`Operator email lookup failed for ${userId}: ${err.message}`);
      return false;
    }
    return emails.some((email) => allowlist.has(String(email).toLowerCase()));
  };
}
