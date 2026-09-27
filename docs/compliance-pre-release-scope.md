# Pre-release compliance scope

Future scope for improvements to consider **before alpha and before beta**.
This document is not a description of current product behavior, and it is
not legal advice.

QualEval is the active product direction. The ComplyLine compliance checks
still exist in this repo. This note records release-readiness scope for
that compliance surface. It is not a reason to build QualEval features or
new compliance detection now.

Keyword or pattern detection alone cannot establish that a law applies or
that a call complied with it. The controls below should be validated by
privacy and regulatory counsel for the actual business model and
jurisdictions before either release treats them as product commitments.

## What exists today, and what this note adds

Every area below already has a post-call transcript pack and/or an
always-on check. Those checks flag spoken shapes or missing phrases. They
do not implement the four engines, the possible / confirmed / not applicable
verdict, the required responses, or the runtime actions in this note.

Current findings use `pass`, `flag`, and sometimes `n/a`. That `n/a` means
the check's own trigger was absent or the pack was not selected. It is not
the verdict model below.

The always-on generic PII pack (`generic`) flags spoken SSN, Luhn-valid
card, and account-number shapes under state breach-notification citations.
It is adjacent raw material for several areas. It is not a determination
that HIPAA, GLBA, FERPA, COPPA, PCI DSS, or GDPR applies.

| Area | Already in the repo | New scope in this note |
| --- | --- | --- |
| HIPAA | Pack `hipaa`: spoken MRN, NPI, and patient-ID shapes. The pack's own `asserts` say this is not HIPAA's 18 Safe Harbor categories and not a HIPAA compliance determination. | Health information combined with identifiers; covered-entity / business-associate context; the required PHI handling response. |
| GLBA | Pack `finance`: spoken ABA routing, IBAN, and loan/brokerage-number shapes. The pack says this is not a GLBA Safeguards audit. | Nonpublic personal information in a financial-product context, including the fact of being a customer; institution-specific notices, opt-out, safeguards, and vendor controls. |
| FERPA | Pack `ferpa`: labeled student number, student date of birth, and student's mother's maiden name. The pack says FERPA PII is broader and this is not a FERPA compliance determination. | Education-record context, grades, discipline, disability, consent or an applicable exception, redisclosure limits, and school-controlled vendors. |
| COPPA | Pack `coppa`: self-stated age under 13, self-stated K–7 grade, and a child stating their own name together with their school. The pack says these are fuzzy signals, not age verification and not a COPPA determination. | Child-directed context, telephone numbers, persistent identifiers, precise location, audio of a child's voice, and stopping collection until verifiable parental consent or an exception. |
| TCPA | Always-on `consent` check (a `consentEvent` logged before the call) plus always-on `opt_out` (a short-window transcript acknowledgment after a stop-calling phrase). Pack `tcpa` only surfaces the consent-event check. The pack says it does not evaluate prior express written consent, called-party identity, or call-time restrictions. `opt_out` does not prove a number was removed from a calling list. | Autodialer or artificial/prerecorded (including AI) voice, telemarketing purpose, called-number type, and consent source, scope, timestamp, seller, and revocation, with auditable evidence. |
| Call recording | Always-on `recording_consent` check: recording-disclosure phrasing in agent turns within the first 10 seconds. Pack `recording_consent` only surfaces that check. The pack says it does not identify caller or callee jurisdiction. | Locations, applicable jurisdictions, whether recording or transcription has begun, notice and consent from every required party, and stopping when consent is withheld. |
| PCI DSS | Pack `pcidss`: spoken CVV/security code, card expiration, and statements that card data will be retained. It complements the generic pack's Luhn card-number scan and says it is not a PCI DSS audit and cannot tell whether the call was recorded. | PAN, cardholder name, service code, PIN, and track/chip data; DTMF or assisted capture; suppression from audio, transcripts, logs, and prompts; post-authorization deletion rules. |
| GDPR | Pack `gdpr`: EU national ID or passport number, a keyworded IBAN, and a caller statement of EU residency or citizenship. The pack says this is not a lawful-basis check, not an Art. 13/14 notice check, and not proof consent was obtained. | Personal data linkable to an EU individual, including voice, transcript, caller ID, location, device data, and inferences; lawful basis, notice, minimization, retention, and data-subject rights. |
| FDCPA / Regulation F | Pack `fdcpa`: arrest/jail threats, false law-enforcement or attorney claims, and unqualified immediate garnishment or seizure threats, plus `mini_miranda` (debt-collection disclosure phrasing in the first 10 seconds, only when the pack is selected). The pack says it does not check call-time restrictions and is not an FDCPA determination. Regulation F is not implemented. | Debt-collection context and the wider prohibited-conduct set (harassment, false amounts, false legal status, time-barred suit threats, public disclosure, repeated calls, stop-channel), plus identity verification before revealing the debt and the Regulation F response constraints. |
| California SB 1001 | Pack `ca_sb1001` runs `ca_sb1001_bot_disclosure`: whether the agent self-identified as a bot, AI, or automated system anywhere in the call. The pack says it does not determine intent to mislead or a commercial-transaction or election purpose. A separate always-on `ai_disclosure` check looks for AI disclosure inside a 10-second window (an AB 2905-style timing check). That window is not SB 1001. | The statutory elements: an online bot, a California person, concealed artificial identity, and knowing influence of a commercial transaction or an election. Phone-call transcripts are not assumed to be that statute. |
| California AB 489 | Pack `ca_ab489`: first-person agent claims to be a physician/doctor, nurse, or to hold letters such as M.D., R.N., D.D.S., D.O., or P.A. The pack says this is not proof the speaker lacks a license and is not every practice act's term list. | AI healthcare advice that uses protected titles or wording implying a licensed natural person, including psychologist and the broader practice-act lists; clear AI identification; separating AI output from review by an identified licensed professional. |
| FCRA | Pack `fcra`: spoken credit-score or credit-report readback, plus whole-call checks for adverse-action language without dispute/free-copy/agency phrasing, and credit-pull language without an authorization-style phrase. The pack says this is not a full FCRA determination. The readback pattern flags a spoken credit-related shape. | Use of a consumer report for credit, insurance, employment, housing, account review, or collection; a recorded permissible purpose before access; mixed-file controls; dispute support; adverse-action notices when a report contributes to an unfavorable decision. |

## Verdict model

Every detection in this future scope should be able to resolve as one of:

- **possible** — a signal is present, and context is incomplete
- **confirmed** — the applicable context and the regulated fact are both established
- **not applicable** — the regime does not apply to this caller, purpose, or data

A detection must not automatically become a declared legal violation.
Most of these laws depend on context. A telephone number can be
HIPAA-identifying information, GLBA nonpublic personal information, FERPA
personally identifiable information, COPPA personal information, or ordinary
unregulated contact information, depending on who collected it, why, and
what it is linked to.

## Four engines

Future work should keep these as separate engines. Collapsing them into
"an identifier appeared, therefore a violation" drops the distinctions
this taxonomy exists to preserve.

1. **Sensitive-data detection.** PHI, student PII, financial NPI,
   payment-card data, child data, and GDPR personal data.
2. **Context determination.** Covered entity, financial institution,
   school/vendor relationship, child-directed service, debt collector,
   consumer-report user, EU person, or California interaction.
3. **Consent management.** Purpose, channel, seller or controller,
   timestamp, disclosure version, expiration, withdrawal, and proof of
   consent.
4. **Conversation policy.** Statements the AI must say, must not say, or
   must escalate to a qualified human.

## Areas

### HIPAA

**Detect.** Health information combined with names, addresses, dates,
phone numbers, medical-record numbers, account numbers, voiceprints, or
other identifying information. HIPAA protects individually identifiable
health information in oral, written, and electronic form. The familiar 18
identifiers specifically come from the Safe Harbor de-identification
method.

**Required response.** Authenticate appropriately. Apply minimum-necessary
access. Encrypt and restrict recordings and transcripts. Redact PHI from
logs. Enforce retention and deletion. Confirm covered-entity or
business-associate context.

**Non-goal.** Detection of one "HIPAA identifier" is not proof that HIPAA
applies. The current `hipaa` pack's three spoken ID shapes are not that
proof, and they are not the 18 Safe Harbor categories.

### GLBA

**Detect.** Nonpublic personal information obtained while providing a
financial product or service — for example, SSN, income, account balances,
payment history, account numbers, transactions, or the fact that someone
is a customer.

**Required response.** Classify as financial NPI. Restrict use and
disclosure. Encrypt and redact. Apply institution-specific privacy notices,
opt-out rules, safeguards, and vendor controls.

**Non-goal.** GLBA does not prescribe a closed identifier list equivalent
to HIPAA's 18 Safe Harbor identifiers. The current `finance` pack's three
account-number shapes are not that list and are not a Safeguards audit.

### FERPA

**Detect.** Student or family names, student IDs, birth dates, school
information, grades, disciplinary records, disability information, or
combinations that could identify a student when sourced from an education
record.

**Required response.** Verify consent or an applicable FERPA exception.
Restrict redisclosure. Ensure vendors operate under the school's direct
control and use records only for authorized purposes.

**Non-goal.** FERPA generally governs personally identifiable information
from maintained education records. It does not govern every statement
someone makes about a student. The current `ferpa` pack flags three labeled
student-record identifier shapes and does not decide record status, consent,
or an exception.

### COPPA

**Detect.** Signals that a user is under 13 — such as stated age, birth
date, school grade, or child-directed context — plus names, telephone
numbers, persistent identifiers, precise location, and audio containing a
child's voice.

**Required response.** Stop or limit collection until verifiable parental
consent is obtained, unless an exception applies. The FTC has a narrow
non-enforcement policy for briefly retained child-voice recordings used
only as substitutes for written commands, provided clear notice and
deletion safeguards are used.

**Non-goal.** The current `coppa` pack's three transcript signals are
lower-confidence clues that a caller might be a child. They are not age
verification under the COPPA Rule, and they do not implement parental
consent or the voice-recording exception.

### TCPA

**Detect.** Whether a call uses an autodialer or an artificial or
prerecorded voice, including an AI-generated voice. Whether the call is
telemarketing. Called-number type. Consent source, scope, timestamp,
seller, and revocation status.

**Required response.** Block calls that lack the applicable consent or
exemption. Retain auditable consent evidence. Honor revocations and
do-not-call requests. Provide required identification and opt-out
functionality. Telemarketing calls that use artificial or prerecorded
voices generally require prior express written consent.

**Non-goal.** A logged `consentEvent`, which is all the current `consent`
check and `tcpa` pack evaluate, is not prior express written consent, not
called-party identity, and not proof the calling technology or purpose was
classified. The `opt_out` check only looks for acknowledgment phrasing
near a stop-calling request.

### Call recording

**Detect.** Caller and agent locations, applicable jurisdictions, whether
recording or transcription has begun, and whether every required party
received notice and consented. Federal law establishes a one-party
minimum. Several states impose all-party requirements. Interstate calls
create choice-of-law uncertainty.

**Required response.** Use the strictest potentially applicable standard.
Disclose recording before substantive conversation. Capture affirmative
or otherwise clearly valid consent. Offer a non-recorded alternative.
Stop recording if consent is withheld or withdrawn.

**Non-goal.** "All-party consent" is the accurate term for group calls.
"Two-party consent" understates a call with more than two people. The
current check and `recording_consent` pack look for disclosure phrasing
in the first 10 seconds of agent turns. They do not determine
jurisdiction, whether recording actually started, or whether every
required party consented. The pack name still uses two-party wording.

### PCI DSS

**Detect.** Primary account number (PAN), expiration date, cardholder
name, service code, CVV/CVC/CID, PIN, and track or chip data spoken or
entered during a call. PCI DSS applies where payment-account data is
stored, processed, or transmitted.

**Required response.** Use DTMF masking or agent-assisted secure capture.
Suppress payment data from audio, transcripts, screen recordings, logs,
and model prompts. CVV/CVC/CID and other sensitive authentication data
must not be retained after authorization, even when encrypted. Stored PAN
must be rendered unreadable.

**Non-goal.** The current `pcidss` pack flags spoken CVV, expiration, and
retention-intent phrasing, and the generic pack can flag a Luhn-valid
card number. Neither masks audio, removes data from prompts or logs, nor
verifies post-authorization deletion.

### GDPR

**Detect.** Any information linked or linkable to an EU individual,
including telephone number, caller ID, account data, voice recording,
transcript, location, device information, and inferred characteristics.
Pseudonymized information remains personal data if re-identification is
possible.

**Required response.** Establish and document a lawful basis. Provide
transparent notice. Minimize collection. Define retention. Support
access, deletion, correction, objection, and applicable transfer
protections. Consent is only one possible lawful basis. When consent is
the basis used, it must be freely given, specific, informed,
unambiguous, and withdrawable.

**Non-goal.** The current `gdpr` pack flags three transcript signals for
human review. It does not establish that the caller is an EU data
subject, and it does not decide lawful basis, notice, or consent.

### FDCPA / Regulation F

**Detect.** Debt-collection context, and statements involving threats,
harassment, false amounts, false legal status, time-barred lawsuits,
public disclosure, repeated calls, or communication after a stop-channel
request.

**Required response.** Constrain scripts and generated responses. Verify
consumer identity before revealing the debt. Prevent third-party
disclosure. Honor inconvenient-time, cease-communication,
attorney-representation, and channel restrictions. Regulation F prohibits
harassment, false or misleading representations, unfair conduct, and
threats to sue over time-barred debts.

**Non-goal.** The current `fdcpa` pack flags three threat/authority
statement shapes and a missing mini-Miranda phrase. It does not decide
that the caller is a debt collector, and it does not cover Regulation F's
broader conduct rules or the call-time limit the pack already declines
to check for lack of a recipient timezone.

### California SB 1001

**Detect.** A bot interacting online with a California person while
concealing its artificial identity in order to knowingly influence a
commercial transaction or an election.

**Required response.** Provide a clear and conspicuous bot disclosure
before or at the start of the interaction. Bot disclosure is the safer
default across channels. The statutory language specifically addresses
online bot interactions, so this scope does not treat SB 1001 as covering
every ordinary telephone call.

**Non-goal.** The current `ca_sb1001` check flags a voice-call transcript
that never self-identifies as a bot or AI. That is a disclosure-phrasing
scan. It does not establish an online interaction, a California person,
concealment, or a commercial or electoral purpose. The always-on
10-second `ai_disclosure` check is a separate timing heuristic and is
not this statute.

### California AB 489

**Detect.** AI-generated healthcare advice that uses protected titles,
credentials, or wording suggesting the AI is a natural person holding a
healthcare license.

**Required response.** Clearly identify the system as AI. Prohibit it
from claiming to be a physician, nurse, psychologist, or other licensed
professional. Distinguish AI output from review by an identified licensed
professional. AB 489 became operative January 1, 2026. Each use of a
prohibited representation may be treated as a separate violation.

**Non-goal.** The current `ca_ab489` pack flags a narrow set of
first-person title and credential-letter claims. It does not cover the
full cross-referenced practice-act term lists, psychologist wording, or
a failure to separate AI output from review by a named licensed
professional, and a regex hit is not proof the speaker lacks a license.

### FCRA

**Detect.** Use of consumer-report information for credit, insurance,
employment, housing, account review, or collection.

**Required response.** Confirm and record a permissible purpose before
accessing a report. Restrict downstream use. Prevent mixed-file
disclosures. Support disputes. Trigger required adverse-action notices
when a report contributes to an unfavorable decision.

**Non-goal.** FCRA is about consumer-report use. The appearance of a
credit-related word during a call is not that use. The current `fcra`
pack's spoken score/report readback, and its phrase checks for missing
adverse-action or authorization language, are transcript signals. They
do not confirm a report was accessed, that a permissible purpose was
recorded before access, or that a report contributed to a decision.

## Minimum runtime actions

These are future release behavior, not what the post-call analyzer does
today.

- **Before the call.** Determine jurisdictions, call purpose, consent
  requirements, AI-disclosure requirements, and permitted data categories.
- **At call opening.** Identify the organization and the AI system.
  Provide recording and privacy notices. Capture required consent before
  recording or marketing begins.
- **During the call.** Detect protected data and prohibited statements in
  real time. Mask payment data. Prevent unauthorized disclosures. Route
  healthcare, credit, legal, and debt disputes to trained personnel.
- **After the call.** Redact recordings and transcripts. Separate consent
  evidence from conversation content. Apply purpose-specific retention.
  Control model-training use. Record policy decisions and escalations.
- **During audits.** Test false negatives and false positives, consent
  provenance, deletion, user-rights handling, script compliance, vendor
  access, model changes, and cross-border transfers.

## Counsel validation

These controls should be validated by privacy and regulatory counsel for
the actual business model and jurisdictions. Keyword detection alone
cannot establish legal applicability or compliance.
