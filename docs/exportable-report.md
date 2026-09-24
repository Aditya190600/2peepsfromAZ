# Exportable report

The compliance report generated in the client can be printed/saved as a PDF
or exported as JSON, so it can be handed to a compliance officer, used as
static source material (e.g. for the hackathon demo video/cover image), or
fed into another system.

## How it works

- A **Print report** button and an **Export as JSON** button appear next to
  the report metadata once a report has been generated (`client/src/Dashboard.jsx`,
  `Report` component).
- **Print report** calls `window.print()`. No PDF library, no server-side
  render step — the browser's own print pipeline (which already knows how to
  save to PDF) does the work.
  - A dedicated `@media print` stylesheet in `client/src/App.css` reformats
    the page for print output:
    - The session panel, masthead, and the toolbar buttons are hidden.
    - A letterhead block (ComplyLine brand mark, session id, generated
      timestamp) is shown in place of the on-screen header — this block only
      renders under `@media print` (`.print-letterhead`).
    - Each finding gets `break-inside: avoid` so a card isn't split across a
      page boundary.
    - A short footer disclaimer ("automated pattern-based screening, not
      legal advice") is appended, also print-only.
  - The document `<title>` is set to `ComplyLine report — <sessionId>`
    whenever a report is loaded, so "Save as PDF" from the print dialog
    suggests a sensible filename.
- **Export as JSON** calls `downloadReportJson` (`client/src/Dashboard.jsx`),
  which downloads `{sessionId, generatedAt, verdict, findings}` as
  `compliance-report-<sessionId>.json`. JSON was chosen over PDF/CSV because
  the report is structured, nested data (findings with severities, citations,
  timestamps) that a downstream system (a ticketing tool, a script, another
  report) would want to parse programmatically — PDF is print/human-only and
  CSV can't represent nested findings cleanly.

## Why this approach

Per the design system already in place (Source Serif 4 / Inter / IBM Plex
Mono, `client/src/App.css`), the printed output needed to look like a real
document rather than a raw screenshot of the app UI. Using the browser's
native print pipeline with a dedicated print stylesheet gets that for free,
with no new dependency and no server-side rendering pipeline — the report
data and layout are already in the DOM. JSON export reuses that same in-DOM
report data, so no new fetch or re-computation is needed either.

## Trying it

1. `./scripts/start.sh`
2. Generate a report (a live call, or one of the sample sessions).
3. Click **Print report** in the report panel, or use the browser's print
   preview to see the formatted document before printing/saving to PDF.
4. Click **Export as JSON** to download the report data as a `.json` file.
