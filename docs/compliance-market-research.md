# Compliance market research

Quick look at how existing TCPA/robocall-compliance tools work, what they check, and what makes them read as enterprise-grade - inspiration for reworking ComplyLine's direction, not a spec.

## Who's out there

- **Contact Center Compliance** - decades-old DNC/TCPA scrubbing vendor, 70B+ number scrubs performed. Positioning: the boring, trusted utility layer.
- **Convoso** - dialer platform with compliance built into the dialing pipeline itself (not a bolt-on report).
- **TCN** - leans on a manual-approval workflow ("Manually Approved Calling") as its compliance story, i.e. process + documentation over pure automated detection.
- **Itero** - AI call-monitoring layer that scores every call against compliance rubrics and routes violations into coaching workflows.

## What they actually check

Wider net than ComplyLine's four checks, but the recurring categories:

- **Consent & DNC**: scrub against internal/federal/state Do-Not-Call registries *before* dialing (not just log a consent event after), reassigned-number database checks, 31-day DNC re-scrub cycles.
- **Frequency/cadence limits**: state-specific "mini-TCPA" call-window and attempt-frequency rules (Convoso's StateTracker, ACM/MCM) - a dimension ComplyLine doesn't touch at all today (we check one call in isolation, not a calling pattern over time).
- **Required disclosures**: not just "was AI disclosed" but a broader rubric of required spoken disclosures (payment terms, recording notice, FINRA suitability language) with *counter-criteria* to suppress false positives, not bare keyword matching.
- **Opt-out handling timeliness**: ComplyLine already does an in-call version; the market standard also tracks the multi-day SLA (opt-out honored within N business days across future dial attempts).
- **Caller ID integrity**: STIR/SHAKEN attestation - entirely outside ComplyLine's scope (we don't touch the dialing/signaling layer), but it's a first-class line item in every vendor's compliance pitch.

## How findings get presented

- **Contextual detection, not keyword spotting** - Itero explicitly frames a rule as positive-criteria + counter-criteria so a reviewer can see *why* something flagged, not just that it flagged. ComplyLine's LLM-Gateway-based disclosure/PII checks already do semantic judgment; the citation-per-finding is in the same spirit.
- **Closed-loop remediation, not passive reporting** - the strongest enterprise positioning (Itero) treats a flagged call as the start of a workflow: supervisor review queue, targeted coaching, mandatory re-certification before the rep goes live again. A report that just sits there reads as a lesser product next to this.
- **Auditable evidence trail** - "transcripts, timestamps, rubric-matched scoring, and the remediation record" kept together as the artifact you'd hand a regulator, not just a scorecard.
- **Fleet-level framing** - none of these vendors talk about "one call's compliance"; they talk about program-level metrics (100% call coverage, violation rate trends, phone-number reputation health). ComplyLine's fleet view is directionally right but still framed as a batch of individual reports rather than a continuous coverage metric.

## What reads as "enterprise" vs. what doesn't

Enterprise signals across these vendors, consistently:
- Compliance framed as a **built-in control on the pipeline** (scrub-before-dial, real-time attempt tracking), not a **post-hoc audit of one artifact**.
- **Remediation workflow** attached to every flag (who reviews it, what happens next), not just a flag.
- **Program-level metrics over time** (trend lines, violation rates, coverage %) rather than a single point-in-time verdict.
- Coverage of the **full regulatory surface a call center actually worries about** (DNC scrubbing, cadence limits, caller ID attestation) rather than one channel (spoken content) - buyers evaluating "compliance software" expect the dialing-layer controls to be part of the same product, not a separate concern.
- Decades-of-scale language ("70B scrubs") and integration into existing dialer/CRM stacks as trust signals - a standalone report generator without an integration story reads as a point tool, not a platform.

ComplyLine's post-hoc, one-session, spoken-content-only report is a real niche (nobody found doing scoped protocol-level AI voice-agent compliance - see `docs/hackathon-ideas.md`), but it's currently missing the two things buyers most associate with "enterprise": a remediation/workflow loop after a flag, and any view of compliance as a trend across many calls over time rather than a single verdict per session.
