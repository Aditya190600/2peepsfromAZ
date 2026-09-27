# Get started

Get started takes a judge from the landing page to `/try`, the Voice Compliance page. It must not request the microphone until the judge clicks **Start call**.

## Sub-features

- `get-started-cta` moves from `/` to `/try`. With Clerk on, the signed-out `Get started` nav button opens the sign-in modal, which redirects to `/try`. With Clerk off there is no `Get started` button; the landing page's `Run this sample yourself` CTA goes to `/try` instead.
- `get-started-no-mic` does not prompt for `getUserMedia` on arrival.

## How to get to it (user POV)

- Choose **Get started** (Clerk on) or **Run this sample yourself** on the landing page.
- Signed in, choose **Go to app** in the landing page's top-right nav.

## Driving it with cursor-ide-browser

Preconditions:

- Doctor is green at `http://127.0.0.1:5173`.

- **Open landing.** Navigate to `http://127.0.0.1:5173/`. Snapshot shows `Run this sample yourself` (and `Get started` when Clerk is on and signed out).
- **Choose the CTA.** Click `Run this sample yourself`. URL becomes `/try`. The nav rail marks `Voice Compliance` active and the page shows a `Start call` control.
- **No mic.** No browser permission prompt before **Start call** is clicked.
- **Proof.** Save snapshot and screenshot to `artifacts/get-started/`. Record the URL in `artifacts/get-started/url.txt`.

## Gotchas

- `/home` (Northstar 12-session summary) is hidden from the nav rail and no longer the Get started target. It still loads by typed URL.
- `App.jsx` reads the path after `pushState`. A snapshot taken before the SPA finishes can still show Landing.
- Do not click **Start call** during this recipe.
