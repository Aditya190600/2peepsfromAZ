# Playable sample

Playable samples run canned transcripts through `/v1/analyze-session` and show a severity-ranked report. Analyze uses the canned text. Diarize re-uploads an MP3.

## Sub-features

- `sample-analyze` runs **Clean call — everything passes** and shows a report.
- `sample-findings` shows ranked findings with citations when the sample is a violation.
- `sample-reopen` reuses a stored report on a second click of the same sample.

## How to get to it (user POV)

- Choose **Try**.
- Under **Playable samples**, choose a sample label, then **Analyze** (the left button, not **Diarize upload**).

## Driving it with cursor-ide-browser

Preconditions:

- Doctor is green.
- You are on `/try`.
- ASSEMBLYAI_API_KEY can reach LLM Gateway (disclosure + NER). A single sample is two Gateway calls, serialized.

- **Open lab.** Click `Try` or go to `http://127.0.0.1:5173/try`.
- **Analyze clean call.** Click `Clean call — everything passes`. The button label becomes `Analyzing…`, then the report panel heading is `Compliance report` with a Clear/pass verdict.
- **Violation sample.** Click `TCPA violation — no consent, SSN spoken`. The report verdict is Critical (or equivalent flag) and a finding mentions consent or SSN.
- **Stored second click.** After a successful analyze, click the same sample again. The report returns from History (`openStoredOrRunSample`) without a loading `Analyzing…` wait if an entry with that `sessionId` exists.
- **Proof.** `artifacts/playable-sample/clean.png` and snapshot; for a flag path `artifacts/playable-sample/tcpa.png`. Note the session id from the report meta line.

## Gotchas

- **Diarize upload** is a different path (`POST /v1/transcribe-upload`). It needs the MP3 under `client/public/samples/`. Do not use it for `sample-analyze`.
- Industry pack checkboxes (HIPAA / GLBA) change findings. Leave them unchecked unless the recipe names them.
- Gateway 429s surface as `unable to run` / `status: error` cards. That is a failed proof, not a UI bug, unless the mutex tests are also red.
- Scripted violation demos are a separate section below playable samples. They still need the matching pack checked.
