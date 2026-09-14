# Design contract: Paper Vanta vs shipped IA

Source. Paper file `01M2685APFWAD00R6G1RJHZ79P`, page **Vanta rebrand** (`2-1`).
Shipped IA after `#35`. Routes are `/` landing, `/home`, `/sessions`, `/try`. Nav labels are Home · Sessions · Try.

This restyle paints that IA. It does not add Paper-only product surfaces.

## Demo numbers (frozen)

Program outcome from real Northstar reports, not invented copy.

- 12 sessions in the program
- 10 passed every check
- 2 flagged
- 83% compliance rate (`Math.round(10 / 12 * 100)`)
- Flagged session ids. `sess_tcpa_04` (critical), `sess_late_01` (high)
- Clean control. `sess_clean_01`

Per-check monitoring tiles are **not** frozen to Paper's 2 / 1 / 3 / 0. Those tiles must be derived from the same 12 reports (`summarizeFleet`). If a tile would disagree with the frozen headline, the headline wins and the tile shows the honest check counts.

## Artboards

| Paper artboard | Disposition | Product mapping |
| --- | --- | --- |
| Home — Vanta layout | **keep** | `/home`. Sidebar + top bar + compliance progress + monitoring tiles. |
| Review | **keep** (layout) | `/try` plus `/sessions/:id` report. Paper's Review table and Start call live on Try. Idle / loading / error stay from `#37`. |
| History | **keep** | `/sessions`. Table columns label, session id, verdict, when. |
| Fleet | **later** | Home already is the 12-session program. Do not add a Fleet nav item. Reuse the Fleet table density on Home so `sess_tcpa_04` remains clickable. |
| Landing | **keep current code** | `/` stays the bookish Get started page. Do not port the Vanta landing clone. |
| Login — Vanta layout | **park** | No auth. No Login nav item. No avatar menu that implies an account. |
| Integrations | **park** | No page. No nav item. |
| Pattern packs | **park** | Packs stay as Try checkboxes, not a nav destination. |
| Reports | **park** | No Reports page. The report is Home / Try / Session view. |

incident.io page (`3-1`) stays out of this epic.

## Chrome

Steal from Paper Home.

- Top bar ~57px, white, brand left (navy mark + ComplyLine)
- Sidebar ~220px, paper ground
- Main panel white
- Open Tasks rail ~280px, **Home only**, hideable
- Nav labels in the sidebar. Home · Sessions · Try. Never Review / History / Reports / Pattern packs / Fleet / Integrations / Login
- Colors from existing CSS variables only (`--ink`, `--paper`, `--panel`, `--accent` `#1F3A5F`). No Vanta purple. No incident.io orange.

Parked chrome details (do not ship as fake product).

- Sidebar Search field
- Top-bar help / bell / avatar cluster
- Open Tasks "1 report to export" (no export product)
- Open Tasks "1 PII finding needs remediation" unless `pii_scan` is actually flagged in the 12 reports

Honest Open Tasks. One row per flagged session in the program, linking to `/sessions/:id`.

## Token mapping

Paper tokens already match `client/src/App.css` `:root`. Keep that file as the source of truth. Do not introduce `--color-vanta` or new hex accents.
