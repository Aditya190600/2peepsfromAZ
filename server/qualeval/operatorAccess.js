// Operator allowlist for QUALEVAL_AGENT_NUMBER's shared controls: the
// Settings page's /v1/qualeval/demo-agent/* routes, the provider registry, and
// the persona number on /v1/qualeval/config. router.js's requireOperator runs
// this on each of those route handlers - the client hiding them is cosmetic.
// Phone Evals call scope (all calls vs one registered number) uses a separate
// QUALEVAL_ADMIN_EMAILS allowlist - see phoneEvalAccess.js.
// The public demo lets any visitor sign in, so a signed-in Clerk user is not
// enough to flip which agent answers the shared number, read every agent's
// system prompt, or read every caller's transcript.
//
// QUALEVAL_OPERATOR_EMAILS is a comma-separated, case-insensitive list of
// allowed emails, matched against the signed-in Clerk user's verified email
// addresses. Unset or empty means nobody is an operator (fail closed). The
// value "*" on its own opens access to every visitor - an explicit opt-in, and
// the only way to open these controls when Clerk isn't configured, since there
// is then no identity to check. A "*" mixed into an email list is ignored, so
// a stray wildcard can't silently turn an allowlist into open access.

export const OPEN_ACCESS = "*";

export function parseOperatorEmails(raw) {
  const value = String(raw ?? "").trim();
  if (value === OPEN_ACCESS) return new Set([OPEN_ACCESS]);
  return new Set(
    value
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email && email !== OPEN_ACCESS),
  );
}

// Returns an async (req) => boolean. `lookupEmails(userId)` resolves the
// user's verified email addresses; `userIdOf(req)` reads the signed-in user id.
// A failed lookup counts as not an operator.
export function createOperatorCheck({ allowlist, clerkEnabled, userIdOf, lookupEmails }) {
  return async (req) => {
    if (allowlist.has(OPEN_ACCESS)) return true;
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
