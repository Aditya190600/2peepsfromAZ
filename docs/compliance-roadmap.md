# ComplyLine compliance roadmap

Narrow, compliance-only positioning. Not a voice-agent QA tool.

## The pitch

Roark, Hamming, and Cekura all check calls, but compliance is one feature inside a
broader QA/observability product for each of them. ComplyLine does only compliance:
regulatory packs, a company's own custom policy on top of them, and a real dollar
liability estimate per violation, not just a pass/fail.

## Why not Roark / Hamming / Cekura

- All three already check disclosures, consent, and exposed personal data - that
  overlap is real and not a differentiator by itself.
- None of them let a customer easily add their own company-specific compliance rule
  on top of the general regulatory packs.
- None of them attach a dollar figure to a violation.
- None of them flag anything while a call is still in progress; all are post-call or
  pre-launch-simulation only.

## What's built

- [x] Post-call ingestion via AssemblyAI's native webhook (`call.ended` /
      `call.connected` / `call.failed`), signature-verified, transcript fetched and
      analyzed automatically - no customer code required.
- [x] Manual customer-push ingestion (`POST /v1/ingest/:apiKey`) for any other
      provider, wired by hand today.
- [x] Phone number import (Twilio/Telnyx) with inbound calls auto-checked.
- [x] Fixed regulatory compliance packs: HIPAA, GLBA, FERPA, COPPA (children's
      privacy - self-stated age/grade and child name+school disclosure signals),
      PCI DSS (spoken CVV, card expiration, and retention-intent detection -
      PCI DSS Req. 3.3.1), GDPR (transcript-signal detection only - EU national
      ID/passport, IBAN, EU residency statements - not a lawful-basis or
      consent determination), FDCPA (prohibited debt-collection statements;
      statutory damages verified: up to $1,000/action, 15 U.S.C.
      §1692k(a)(2)(A) - not TCPA's per-call figure), FCRA (adverse-action
      disclosure, permissible-purpose, and credit-score/report readback checks).
- [x] TCPA pack (47 U.S.C. §227) - selectable in the pack catalog, wraps the
      existing always-on consent-event check rather than duplicating detection;
      carries statutory-damage metadata ($500-$1,500 per call, no proof of harm
      required).
- [x] Call-recording-consent pack (two-party-consent states, e.g. Cal. Penal
      Code §632) - selectable in the pack catalog, wraps the existing always-on
      recording-disclosure check; carries statutory-damage metadata (CA: greater
      of $5,000 or 3x actual damages per violation).
- [x] Personas mapped to the packs they need, including multi-pack personas (e.g. a
      school nurse persona checking HIPAA and FERPA together).
- [x] Self-serve API keys, scoped to one or more packs (or all).
- [x] Session history, transcript + audio + report per call.
- [x] Report: print and export as JSON.
- [x] Live-run metrics: tokens used, dollar cost of the analysis itself, violation
      counts.
- [x] Recordings: stored, owner-only playback, explicit "share with audio" links.
- [x] State-specific AI-disclosure/deceptive-practice packs: California SB 1001
      (bot disclosure, whole-call scan) and California AB 489 (self-claimed
      healthcare-credential detection). Texas SB 140, floated as a third
      example, was verified against its enrolled text on 2026-09-24 and contains
      no AI/synthetic-voice disclosure or opt-out requirement - it's a
      telemarketing registration/bonding expansion law - so no pack was built
      under that citation.

## What's not built yet

- [ ] **Custom, company-specific policy packs** - a way for a customer to write
      their own compliance rule and have it checked alongside the regulatory packs.
      Core to the pitch, not built.
- [ ] **Dollar liability estimate per violation** - a range or confidence-bound
      estimate, not a single hard number. Core to the pitch, not built.
- [ ] Pre-call / pre-launch check (stretch item) - checking an agent's script or
      prompt before any call happens, using the same packs.
- [ ] Live, mid-call flagging while a call is still in progress - discussed at
      length, currently not the priority; revisit only if time allows.
- [ ] Self-serve "connect your provider" flow for any platform beyond AssemblyAI -
      today every non-AssemblyAI integration is wired by hand.

## Pre-alpha / pre-beta control scope

The checklist above is today's ComplyLine surface. A separate note,
[Pre-release compliance scope](compliance-pre-release-scope.md), records the
detection taxonomy, verdict model, four engines, and runtime actions to
consider before alpha and beta. That note is future scope. It is not a
description of current product behavior, not legal advice, and not a reason
to build it now. QualEval remains the active product direction; the
ComplyLine checks stay in the repo as they are.

## Explicitly out of scope for now

- Full audit-report product as the headline feature - reports stay as plumbing
  supporting the dollar estimate, not the pitch itself.
- Adversarial/red-team testing - Roark already does this; not a gap worth chasing.
- On-prem/data-residency hosting, regulatory-change tracking subscription, and
  embedding the engine into other platforms - real future directions, not part of
  the current build.
