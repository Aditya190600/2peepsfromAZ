# Evals (issue #42)

Open `/evals` from the navigation. Run the two canned evals, inspect checkpoints and transcript, edit a copy as JSON, or generate a draft and explicitly **Confirm and save**. The missing-consent fixture deliberately fails its consent checkpoint (2/3 passed); the clean fixture passes all three. The associated analyzer reports are Critical and Clear respectively.

For offline development without an API key or production cache warming:

```sh
npm run start:evals --prefix server
npm run dev --prefix client
```

The regular server also mounts these routes. `npm test --prefix server` includes the eval tests. HTTP tests need permission to bind localhost.

Documents contain `id`, `name`, `mode`, `startedAt`, `consentEvent`, `messages`, and `checkpoints`; see `fixtures/*.json`. Messages use `{role: "assistant"|"user", text, tMs}`. The runner maps these to the existing analyzer's agent/user turns. `mode` defaults to `offline`: disclosure is a limited phrase check within 10 seconds and PII uses the generic pattern pack only. It does not claim semantic coverage. `semantic` calls the production semantic checks.

Checkpoint types:

- `exact`: `expected` must equal selected text, case sensitively.
- `regex`: `pattern`, optional `flags` (`i`, `m`, `s`, `u`). Regex executes in a worker with a 500ms deadline.
- `check`: `check` is `consent`, `ai_disclosure`, `recording_consent`, `pii_scan`, or `opt_out`; `expected` is `pass`, `flag`, or `n/a`. Missing/errored findings produce checkpoint errors.
- `ai`: `systemPrompt`, optional `model`. Supports `{{messages}}` and `{{lastMessage}}`. Only the literal outputs `pass` and `fail` are accepted; other output or service failure is an error.

Text/AI checkpoints accept optional `role` and zero-based `messageIndex`. Selected turns are joined with newlines for exact/regex. AI judges receive the selected transcript as JSON. An offline eval containing an AI checkpoint still needs the Gateway for that checkpoint.

AI judging and authoring call `callLlmGateway`, sharing its process-wide queue and retries with production's AssemblyAI model. Default model remains `qwen3.5-4b-32k-fast`; custom model access depends on the account. Requires `ASSEMBLYAI_API_KEY`. Unit tests stub completions and do not establish live account access. Generation validates JSON and at least three checkpoints; malformed output is rejected without saving.

API:

- `GET /v1/evals`: documents with last-run time, status and pass rate.
- `GET /v1/evals/:id`: document.
- `POST /v1/evals`: validate and create a document; duplicate IDs return 409.
- `POST /v1/evals/generate` with `{prompt}`: unsaved draft.
- `POST /v1/evals/:id/run`: synchronous run; returns per-checkpoint outcomes, transcript, analyzer report and document snapshot.
- `GET /v1/evals/:id/runs/:runId`: retrieve saved run.

Checked-in fixtures are immutable. Saved copies and run snapshots persist under gitignored `server/.eval-data/` (override with `EVAL_DATA_DIR`). Use synthetic data. This is a local single-instance JSON store: deploy with a writable persistent directory to retain results across restarts; ephemeral hosting does not preserve it. No database is introduced. Saving revisions uses new IDs, preserving reproducibility of prior runs. Errors count against the pass-rate denominator and prevent an overall pass.
