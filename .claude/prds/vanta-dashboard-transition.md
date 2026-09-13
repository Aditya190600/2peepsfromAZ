---
name: vanta-dashboard-transition
description: Restyle the shipped ComplyLine product chrome to the Vanta-layout dashboard from Paper, without changing brand tokens or inventing login.
status: backlog
priority: low
created: 2026-09-13T01:40:00Z
---

# PRD: vanta-dashboard-transition

## Executive Summary

After the demo spine and IA split ship, restyle **Home / Sessions / Review / Try** to match the **Vanta rebrand** page in Paper — layout only. ComplyLine tokens stay (paper / ink / navy, Source Serif 4 + Inter). This is **not** a major priority and must not block Session A/B or hackathon eligibility.

## Problem Statement

Paper page **Vanta rebrand** (`2-1` in file [2peepsfromAZ](https://app.paper.design/file/01M2685APFWAD00R6G1RJHZ79P/2-1)) already shows the target SaaS shell: light top bar, paper sidebar, Open Tasks / Home monitoring, Review, History, Fleet. The live client still looks like the Original Chrome (`Chrome.jsx` + `Dashboard.jsx` lab). Product-ia (`#35`) will split routes; this epic only **paints that IA** from Paper. Do not ship Vanta purple, extra marketing clones, or Paper-only surfaces (Login, Integrations, Pattern packs, Reports) unless they already exist in code.

## User Stories

### Operator
- As a Northstar Voice operator, I recognize a Vanta-like **sidebar + top bar** Home with the 12-session program, not a debugger rail of six audio players.
  - Acceptance: chrome matches Paper Vanta Home density (sidebar nav, main panel, optional Open Tasks rail on Home only).
- As an operator, Review idle vs report still works after the restyle.
  - Acceptance: no regression of `/sessions/:id` or Try lab.

## Functional Requirements

1. **Design source of truth:** Paper file `01M2685APFWAD00R6G1RJHZ79P`, page **Vanta rebrand**. Screenshot/export chrome, Home, Review, History/Fleet. Do not invent new screens.
2. **Tokens:** `App.css` / CSS variables only. No Vanta purple. No incident.io orange.
3. **Surfaces in scope:** Chrome, Home (or Fleet-as-home), Review (idle + report), Sessions/History. Landing stays the current bookish landing unless already updated by IA.
4. **Parked (do not build):** Login, Integrations, Pattern packs as first-class nav, Reports page, dark incident.io shell.
5. **Demo data lock:** 12 / 10 pass / 2 flagged / 83%; `sess_tcpa_04`, `sess_late_01`, `sess_clean_01`. Honest KPIs only.

## Non-Functional Requirements

- Priority: **low**. Starts after `product-ia-ingest-deploy` (or at least after `demo-spine` if IA is delayed).
- No new dependencies for visual chrome.
- Must remain usable at 1440px; one existing mobile breakpoint is enough.

## Success Criteria

- A judge can still complete Home → `sess_tcpa_04` → report after the restyle.
- Sidebar/nav labels match product IA (Home · Sessions · Try), mapped onto Vanta visual structure.
- Pixel-intent: Paper Vanta Home / Review / History, ComplyLine color.

## Constraints & Assumptions

- Brand lock from earlier epics still applies.
- Paper MCP / file is the visual spec; do not restyle from memory of Vanta.com.

## Out of Scope

- New rebrand pages, dark mode, login, marketing landing port, Pattern packs / Integrations product work.

## Dependencies

- `#35` product-ia-ingest-deploy (preferred). If `#35` is not done, restyle current `/dashboard` without adding fake nav items.
- Paper Vanta artboards.
- `client/src/Chrome.jsx`, `Dashboard.jsx`, `History.jsx`, `App.css`.
