---
name: telephony-sip
status: backlog
created: 2026-09-13T01:40:00Z
updated: 2026-09-13T01:40:00Z
progress: 0%
prd: .claude/prds/telephony-sip.md
github: https://github.com/Aditya190600/2peepsfromAZ/issues/43
---

# Epic: telephony-sip

## Overview

Phone numbers and SIP trunks so ComplyLine can take PSTN traffic. Twilio / Telnyx / Zadarma as documented recipes; Vonage and Sinch via BYO SIP. Inspired by Vapi SIP + import-number docs, not a Vapi wrapper.

## Architecture Decisions

- One SIP/telephony gateway in v1; provider recipes are configs on that stack.
- Share credentials module with `provider-swaps`.
- Inbound ↁEsession ↁE`analyze-session` is the MVP; outbound after inbound.

## Tasks Created

- [ ] 001.md - Number and trunk data model
- [ ] 002.md - Twilio and Telnyx import
- [ ] 003.md - BYO SIP (Vonage, Sinch, generic)
- [ ] 004.md - Zadarma recipe and inbound-to-session
