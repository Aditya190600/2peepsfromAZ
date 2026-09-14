# Get started

Get started takes a judge from the landing page to `/home`, the Northstar Voice 12-session summary. It must not request the microphone.

## Sub-features

- `get-started-cta` moves from `/` to `/home`.
- `get-started-tenant` shows Northstar Voice tenant copy on arrival.
- `get-started-no-mic` does not show Start call and does not prompt for `getUserMedia`.
- `get-started-analyzing` starts the 12-session fleet on that view.

## How to get to it (user POV)

- Choose **Get started** on the landing page.
- Type `/home` in the address bar.

## Driving it with cursor-ide-browser

Preconditions:

- Doctor is green at `http://127.0.0.1:5173`.
- You are not on a leftover `/try` tab from another run.

- **Open landing.** Navigate to `http://127.0.0.1:5173/`. Snapshot shows heading `Know what your voice agent said before your lawyer finds out.` and a button `Get started`.
- **Choose Get started.** Click `Get started`. URL becomes `/home`. The page shows `Reviewing sessions for Northstar Voice` and `legal@northstarvoice.com`.
- **No mic.** There is no `Start call` control. No browser permission prompt.
- **Fleet started.** The report panel shows `Analyzing…` with a session count, or a `Fleet compliance report` with a compliance rate. Capture before leaving.
- **Typed URL.** In a fresh tab or after returning to `/`, navigate to `http://127.0.0.1:5173/home`. Same tenant copy and fleet behavior.
- **Proof.** Save snapshot and screenshot to `artifacts/get-started/`. Both show ComplyLine, Northstar Voice, and either Analyzing or a numeric compliance rate. Record the URL in `artifacts/get-started/url.txt`.

## Gotchas

- `/try` is the lab. Nav **Try** uses that path. Do not count it as Get started.
- Auto-run of 12 sessions hits AssemblyAI LLM Gateway with a process-wide mutex. Waiting for `83%` can take minutes. Arrival + Analyzing is enough to prove navigation; waiting for the fleet headline is the full KPI proof.
- `App.jsx` reads the path after `pushState`. A snapshot taken before the SPA finishes can still show Landing.
- Do not click **Start call** during this recipe. That control lives on `/try` only.
