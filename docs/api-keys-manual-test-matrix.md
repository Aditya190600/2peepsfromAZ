# API Keys manual test matrix

`client/src/ApiKeys.jsx` has no component-level test runner in this repo
(only `node:test` for plain JS modules - see `server/apiKeys.test.js` for the
hashing/verification logic). Verify these cases by hand before merging any
change that touches it. Requires `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
set (the `api_keys` migration applied) - without them every route below
returns 503, which is itself worth confirming once.

1. **Empty state** - fresh account, no keys yet. Page shows "No API keys yet"
   and a "New key" button in the page header.
2. **Create, all packs** - click New key, name it, leave "All packs" selected,
   accept the default 90-day expiry, submit. The raw key is shown exactly
   once with a copy button and a "you won't see this again" warning.
   Reloading the page (or navigating away and back) never shows the raw key
   again - only the list row (name, "All packs", Active, expiry, last used).
3. **Create, specific packs** - choose "Specific packs", check HIPAA and
   GLBA (finance) only, submit. List row shows "HIPAA identifiers
   (healthcare), GLBA finance identifiers (banking)", not "All packs". The
   Generate button stays disabled until at least one pack is checked.
4. **Custom expiry** - set expiry to 1 day at creation. Row's Expires column
   shows a date ~1 day out, status Active.
5. **Edit expiry** - click "Edit expiry" on an active key. An inline row
   swaps in with a days-from-now input (default the account's
   `defaultExpiryDays`), Save, and Cancel. Save calls `PATCH
   /v1/api-keys/:id` and the Expires column updates to the new date; Cancel
   discards the edit with no request sent. Editing one row's expiry does not
   change the key value or any other row.
6. **Revoke** - click Revoke on an active key. Row updates to status Revoked
   with no further Revoke or Edit expiry button. Confirm the underlying key
   now fails `verifyApiKey` (via `server/apiKeys.test.js`'s revoked-key case,
   or a direct POST to `/v1/ingest/:apiKey`).
7. **Expired key** - manually backdate a row's `expires_at` in Supabase (or
   wait out a short test expiry). Reload the list: status shows Expired, not
   Active. Revoke and Edit expiry still show (expiry and revocation are
   independent - an expired key can still be explicitly revoked or have its
   expiry extended for the audit trail).
8. **Copy button** - click "Copy to clipboard" on a freshly created key,
   paste elsewhere, confirm it matches the displayed raw key exactly
   (`cl_live_` prefix included).
9. **Nav** - "API Keys" appears in the left rail alongside Home/Sessions/Try,
   highlights active on `/api-keys`, and is reachable from a fresh sign-in.
10. **Sign-in not configured** - unset `VITE_CLERK_PUBLISHABLE_KEY` (client)
    and `CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY` (server), reload `/api-keys`.
    Page shows the "sign-in required" message, not the create form or key
    list, and issues no `/v1/api-keys` request. Hitting `GET /v1/api-keys`,
    `POST /v1/api-keys`, `PATCH /v1/api-keys/:id`, or `POST
    /v1/api-keys/:id/revoke` directly (curl) returns 503 - real API keys must
    never pool under the shared anonymous demo visitor.

All ten must pass with the raw key value appearing in exactly one network
response body (`POST /v1/api-keys`) - confirm via devtools network tab that
`GET /v1/api-keys` never includes a raw key field.
