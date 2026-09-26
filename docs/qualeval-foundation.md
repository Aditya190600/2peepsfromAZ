# QualEval foundation

QualEval is a black-box qualitative acceptance-testing platform for AI voice
agents: treat a target agent as reachable only by phone number, generate
scenarios/personas via the LLM Gateway, run real calls against it, and judge
the transcript pass/fail with evidence. This supersedes the ComplyLine
compliance-pack positioning as the active product direction (per the
2026-09-24 captain-approved pivot) - existing pack work is not being removed,
but new product work should build here, not there, unless told otherwise.

## What this task built (foundation only)

This is the foundation slice: everything up to and including scenario
approval. The call-placement step was stubbed when this slice landed; it has
since been built (outbound only) - see AGENTS.md's "Real outbound
call-placement bridge" section for the current Twilio -> AssemblyAI bridge
architecture, which supersedes the "Stubbed, honestly" section below.

**Fully working:**
- Data model: `server/migrations/003_qualeval.sql` (`qualeval_evaluations`,
  `qualeval_scenarios`, `qualeval_runs`), same `create table if not exists`
  style and hard-fail-without-Postgres contract as `api_keys`
  (`server/qualeval/store.js`'s `dbConfigured()` guard - no in-memory
  fallback, this is genuinely new data).
- Scenario generation via the LLM Gateway (`server/qualeval/generator.js`),
  reusing the existing `server/checks/llmGateway.js` call pattern (accepts
  both the plain-string and `{content, usage}` shapes, same as
  `disclosureCheck.js`).
- Evaluator (`server/qualeval/evaluator.js`): judges a real transcript
  against a scenario's expected behavior/criteria, returns
  pass/fail + assessment + per-criterion results + evidence quotes. Throws
  rather than fabricating a verdict when there's no transcript.
- REST routes (`server/qualeval/router.js`, mounted at `/v1/qualeval` behind
  the same `requireVisitor`/`visitorId` gate as every other product route in
  `server/index.js`): create/edit/delete an evaluation, list/get evaluations
  (with nested scenarios+runs), generate/regenerate scenarios (typed feedback
  folds into the next prompt; regeneration replaces pending/rejected
  scenarios but keeps approved ones), approve/reject/edit/delete a scenario,
  create a run for an approved scenario, list runs, get one run. `GET
  /v1/qualeval/config` exposes the deployment's `QUALEVAL_AGENT_NUMBER` so
  the client can prefill the target-agent phone number field instead of
  hardcoding it into the bundle.
- Frontend: `/qualeval` route (`client/src/routes.js`, `client/src/QualEval.jsx`),
  new left-rail nav link (`client/src/chromeNav.js`), evaluation creation
  form (editable after creation), and a combined generation-review page
  (scenario cards split into Generated/Accepted/Rejected tabs, each
  deletable, plus a persistent typed-feedback regenerate panel - not a
  per-item wizard). Every generated scenario carries an LLM-authored name;
  `generator.js`'s `fallbackScenarioName` only covers the rare case where the
  model omits one.

**Stubbed at the time this slice landed (now superseded, see above):**
`POST /v1/qualeval/scenarios/:id/runs` created a Run recorded as
`verdict: "pending"`, `transcript: null`, with an assessment text that read
"Not yet run - pending Twilio call-placement credentials", when Twilio
credentials were absent. `server/qualeval/store.js`'s `attachTranscript` and
`server/qualeval/router.js`'s `dispatchEvaluation` were the seam a follow-up
call-bridge task would call once a real transcript exists - that follow-up
has since landed (outbound bridge, see AGENTS.md); the `pending` stub path
still runs when Twilio env vars are unset.

**Still out of scope** (follow-up): the bidirectional (target-calls-QualEval)
inbound direction, the follow-up-scenario path, two-demo-target-agent tabs,
phone-number-pool rotation, persona avatars, failure-driven regeneration.

## Where to look

- Backend module: `server/qualeval/` (`store.js`, `generator.js`,
  `evaluator.js`, `router.js`, and their `*.test.js` files).
- Migration: `server/migrations/003_qualeval.sql`.
- Frontend: `client/src/QualEval.jsx`, `client/src/qualevalClient.js`.
