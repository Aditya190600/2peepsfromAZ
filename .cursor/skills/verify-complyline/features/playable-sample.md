# Playable sample

Playable samples run canned transcripts through `/v1/analyze-session` and show a severity-ranked report. Each sample card shows call details, an audio player with waveform, and an **Analyze** button; **Analyze fleet** at the bottom of the list runs every sample together.

## Sub-features

- `sample-analyze` runs **Clean call — everything passes** and shows a report.
- `sample-findings` shows ranked findings with citations when the sample is a violation.
- `sample-reopen` reuses a stored report on a second click of the same sample.

## How to get to it (user POV)

- Choose **Voice Compliance**, then the **Compliance Examples** tab.
- Under **Playable samples**, find the sample card, then click its **Analyze** button.

## Driving it with cursor-ide-browser

Preconditions:

- Doctor is green.
- You are on `/try`.
- ASSEMBLYAI_API_KEY can reach LLM Gateway (disclosure + NER). A single sample is two Gateway calls, serialized.

- **Open lab.** Click `Try` or go to `http://127.0.0.1:5173/try`.
- **Analyze clean call.** Click **Analyze** on the `Clean call — everything passes` card. The button label becomes `Analyzing…`, then the report panel heading is `Compliance report` with an `Overall verdict: Clear` badge.
- **Violation sample.** Click **Analyze** on the `TCPA violation — no consent, SSN spoken` card. The report verdict is Critical (or equivalent flag) and a finding mentions consent or SSN.
- **Stored second click.** After a successful analyze, click the same card's **Analyze** again. The report returns from History (`openStoredOrRunSample`) without a loading `Analyzing…` wait if an entry with that `sessionId` exists.
- **Proof.** `artifacts/playable-sample/clean.png` and snapshot; for a flag path `artifacts/playable-sample/tcpa.png`. Note the session id from the report meta line.

## Gotchas

- Industry pack checkboxes (HIPAA / GLBA) change findings. Leave them unchecked unless the recipe names them.
- Gateway 429s surface as `unable to run` / `status: error` cards. That is a failed proof, not a UI bug, unless the mutex tests are also red.
- Scripted violation demos are a separate sub-tab next to playable samples. They still need the matching pack checked.
