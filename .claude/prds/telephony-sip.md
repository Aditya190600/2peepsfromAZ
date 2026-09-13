---
name: telephony-sip
description: Phone numbers for ComplyLine agents via Twilio, Telnyx, Zadarma, BYO SIP (Vonage, Sinch, others).
status: backlog
created: 2026-09-13T01:40:00Z
---

# PRD: telephony-sip

## Executive Summary

Give ComplyLine a **phone number** layer like Vapi: import or BYO numbers, attach them to an agent, receive and place PSTN calls. First-class targets: **Twilio**, **Telnyx**, **Zadarma**. **Vonage** and **Sinch** (and any other SIP-compliant carrier) land via **BYO SIP trunk** — the same pattern Vapi documents for generic trunks.

Docs: [Vapi SIP trunking](https://docs.vapi.ai/advanced/sip/sip-trunk), [Twilio SIP](https://docs.vapi.ai/advanced/sip/twilio), [Telnyx SIP](https://docs.vapi.ai/advanced/sip/telnyx), [Zadarma ↔ Vapi](https://zadarma.com/en/support/instructions/vapiai/).

## Problem Statement

The app is browser-mic + upload only. There is no DID, no inbound webhook, no SIP. A compliance product for voice agents that never touches a phone number cannot ingest “real” carrier sessions except by file drop.

This is **post-hackathon**. Do not put PSTN on the Get started path.

## User Stories

### Operator
- As an operator, I import a Twilio or Telnyx number with account credentials and assign it to the Northstar demo agent.
  - Acceptance: number appears in a Phone numbers list; inbound call creates a session that can be analyzed.
- As an operator, I add a **BYO SIP trunk** (gateway + optional username/password) and attach a DID — covering Vonage, Sinch, or a generic SBC.
  - Acceptance: credential validation fails loudly if the gateway is unreachable; secrets stay server-side.
- As an operator, I can use **Zadarma** with SIP register (username/password) as documented for Vapi.

## Functional Requirements

1. **Resources:** `PhoneNumber` `{ provider, e164, label, credentialId, direction }` and `SipTrunkCredential` `{ provider, gateways[], outboundAuth? }`.
2. **Providers:**
   - `twilio` — Account SID + Auth Token import (Vapi import-Twilio analog).
   - `telnyx` — API key or SIP FQDN/IP + outbound voice profile analog.
   - `zadarma` — SIP username/password + `pbx.zadarma.com` / `sip.zadarma.com`.
   - `byo-sip-trunk` — generic SIP; **this is the Vonage and Sinch path** unless a native SDK is added later.
3. **Call path:** inbound SIP/webhook → audio/session → existing `analyze-session` (and optional live agent). Outbound is a later slice inside this epic if inbound works.
4. **Security:** IP allowlists / digest auth as required by the carrier; never log passwords; never expose trunks to the browser.

## Non-Functional Requirements

- Prefer one SIP stack (document choice: e.g. livekit-sip, Asterisk, Twilio programmable voice, or a hosted proxy). Do not implement five stacks.
- Regional note from Vapi: US vs EU SIP hosts must match API region — call this out in README.

## Success Criteria

- Documented import for Twilio **or** Telnyx with a test number (manual QA acceptable).
- BYO SIP credential API + one documented Vonage **or** Sinch trunk recipe.
- Zadarma recipe in README even if implemented as `byo-sip-trunk`.
- An inbound call produces a session that History can reopen (depends on `#33`).

## Constraints & Assumptions

- No-DB: numbers/credentials in gitignored JSON or env is OK for v1.
- Browser Try mic remains; telephony is additive.
- We are **inspired by Vapi**, not wrapping the Vapi API (unless a later decision says otherwise).

## Out of Scope

- SMS, number marketplace, porting UX, Amazon Chime.
- Native first-class Vonage/Sinch SDKs in v1 (SIP is enough).

## Dependencies

- `demo-spine` reopenable sessions.
- Provider credential store from `provider-swaps` (can share a credentials module).
