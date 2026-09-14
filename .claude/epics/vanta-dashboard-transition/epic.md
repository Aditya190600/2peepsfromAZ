---
name: vanta-dashboard-transition
status: in-progress
updated: 2026-09-14T09:00:00Z
progress: 90%
prd: .claude/prds/vanta-dashboard-transition.md
github: https://github.com/Aditya190600/2peepsfromAZ/issues/40
priority: low
---

# Epic: vanta-dashboard-transition

## Overview

Low-priority visual transition: apply the Paper **Vanta rebrand** chrome and Home/Review/History layouts to the live ComplyLine client after the IA split. Tokens stay ComplyLine. Do not ship login or Paper-only product surfaces.

## Architecture Decisions

- Paper page `2-1` is the spec: https://app.paper.design/file/01M2685APFWAD00R6G1RJHZ79P/2-1
- Steal layout (sidebar, top bar, Open Tasks rail on Home only). No Vanta purple.
- Prefer starting after `#35`. If IA is not done, restyle existing routes only.

## Technical Approach

- `Chrome.jsx` + `App.css` for shell
- Home/Fleet density in `Dashboard.jsx` (or split files from `#36`)
- Review idle/report and History/Sessions list visual parity

## Implementation Strategy

Inventory Paper vs code first (cheap), then chrome, then Home, then Review/Sessions. Stop if demo-spine is still broken.

## Task Breakdown Preview

1. Paper vs code inventory / design contract
2. Vanta chrome with ComplyLine tokens
3. Home monitoring + Open Tasks rail
4. Review + Sessions restyle

## Estimated Effort

~10 hours. Priority: low.

## Tasks Created

- [ ] 001.md - Paper vs code inventory
- [ ] 002.md - Vanta chrome shell
- [ ] 003.md - Home as Vanta monitoring
- [ ] 004.md - Review and Sessions restyle
