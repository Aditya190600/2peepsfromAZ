# ComplyLine: customer targets + elevator pitch

All claims grounded in what's actually shipped on `main` (as of `beeafbc`).

## What the app actually does (read from source)

`server/checks/` - five checks run against one completed AssemblyAI Voice Agent session transcript:

- `consentCheck.js` - TCPA: was a consent event logged (and logged *before* call start), via `session.consentEvent`.
- `recordingConsentCheck.js` - wiretap/two-party-consent statutes (CA + 10+ states): regex scan for recording-disclosure language in agent turns within first 10s.
- `optOutCheck.js` - TCPA opt-out honoring: if caller says "stop calling me" etc., did agent acknowledge within 2 turns. Explicitly documented as a heuristic, not proof of list removal (see comment block in file).
- `disclosureCheck.js` - CA AB 2905-style AI-disclosure timing: semantic (LLM-judged via AssemblyAI's own LLM Gateway, `llmGateway.js`) check that the agent disclosed it's an AI within first 10s, catching paraphrases not just fixed phrases.
- `piiScan.js` + `patternPacks.js` - pluggable regex pattern-pack architecture. Shipped packs: `genericPack` (SSN, Luhn-validated credit card, account number), `hipaaPack` (MRN, NPI, patient ID), `financePack` (ABA routing number, IBAN, loan/brokerage number).

Confirmed via `git log --oneline main`: finance pack added PR #9, recording-consent PR #11, LLM Gateway wiring PR #12, opt-out PR #13, fleet view (multi-session aggregate) PR #10, audio-upload + timestamped clickable findings PR #19.

Real constraints that shape the pitch (from `AGENTS.md`): post-hoc report only, not a live advisor; no DB, no stored audio for live calls (only text transcript + `tMs`); demo-upload path has real audio playback tied to findings.

## Customer categories (ranked by pain-point strength x solo-outreach reachability)

### 1. Debt collection / BPOs running outbound AI dialers - highest fit
**Pain**: FDCPA requires "mini-Miranda" disclosure (that it's a collector, debt may be used for collection) plus TCPA consent for autodialed calls, and 2021 FDCPA Reg F expanded these to any "communication" including bot-driven ones. A missed disclosure or unhonored opt-out is a per-call statutory violation ($500-$1,500/violation, class-action bait). Firms are actively adopting AI collectors right now (a hot 2025-2026 vertical) but compliance tooling lags the tech adoption - exactly the gap ComplyLine's `optOutCheck` + `consentCheck` fill directly.
**Reachability**: small/mid collection agencies and BPOs are findable on LinkedIn by title ("Compliance Officer," "VP Compliance," debt collection industry associations like ACA International have public member directories and a lively conference/Slack-adjacent community). Cold LinkedIn outreach to a compliance officer at a mid-size agency (50-500 seats) is realistic for a solo founder - these people actively search for tooling because Reg F enforcement risk is top-of-mind for them.

### 2. Telehealth intake / healthcare scheduling lines
**Pain**: AI phone intake/scheduling is being piloted heavily in telehealth (staffing shortage driven). HIPAA doesn't require a specific "AI disclosure" but does require careful handling of identifiers, and state AI-disclosure laws (CA AB 2905, similar bills elsewhere) apply regardless of industry once an AI is voicing the call. `piiScan.js`'s `hipaaPack` (MRN/NPI/patient ID detection) is a direct, named-in-code fit here - not a stretch.
**Reachability**: telehealth startups are heavy AssemblyAI customers already (voice-agent-in-healthcare is a known AssemblyAI case-study category) - reachable through AssemblyAI's own customer/partner Slack or Discord community, YC batches (many telehealth/health-scheduling YC companies), and health-tech founder communities. This is the category where "built on AssemblyAI" as a credibility signal lands hardest, since they're likely already AssemblyAI users.

### 3. Insurance sales/claims call centers
**Pain**: outbound insurance sales calling is TCPA-heavy (consent + do-not-call registry exposure), and claims-intake calls often collect SSN/account numbers - directly in `genericPack`'s scan surface. Insurance compliance teams are used to being audited (NAIC market conduct exams) so a report artifact maps to something they already do internally, manually.
**Reachability**: harder than 1/2 - insurance compliance orgs skew larger/slower-moving, less startup-adjacent. Best reached via InsurTech-specific communities (e.g. relevant subreddits/LinkedIn groups, InsurTech NY/similar meetup networks) rather than cold outreach; treat as tier-2, not first target.

### 4. Home services / property management AI receptionists
**Pain**: lower regulatory stakes (no dedicated federal statute like FDCPA/HIPAA) but still TCPA-exposed if outbound, and increasingly common early adopters of AI phone agents (a very active 2025-2026 SMB AI-receptionist wave - Vapi/Bland/Retell-style deployments). Weakest "real legal exposure" story of the four, but the easiest cold-outreach target and a good practice/validation lane before committing outreach effort to harder verticals.
**Reachability**: these companies are visible on Twitter/X and LinkedIn building in public, in Indie Hackers and AI-agent-building Discords - an easy warm-up conversation, low friction, useful for pressure-testing the pitch even if lower urgency.

**Recommendation**: lead outreach with #1 (debt collection/BPOs) - real, current, statutory dollar-per-violation exposure plus a genuinely underserved compliance-tooling gap. Use #2 (telehealth) as the parallel track since AssemblyAI's own ecosystem gives a reachable warm path there. Treat #3 and #4 as secondary.

## Elevator pitch

**One-line hook**: "Your AI voice agent just made 10,000 calls. Do you know if every one of them was legally compliant?"

**Pitch** (aimed at a compliance officer or engineering lead at a company running AI voice agents):

> ComplyLine ingests a completed AssemblyAI Voice Agent session and automatically flags the things that turn one bad call into a lawsuit: was TCPA consent actually logged before the call happened, did the agent disclose it was an AI within the legally-relevant window (CA AB 2905 and similar state laws), did it honor a caller's "stop calling me" within a reasonable number of turns (FDCPA/TCPA opt-out), and did it say anything it shouldn't have - SSNs, account numbers, or industry-specific identifiers like HIPAA MRNs or GLBA routing numbers, via a pluggable pattern-pack scanner you can extend for your own regulatory surface. This isn't a mockup: it runs on AssemblyAI's own Voice Agent and LLM Gateway APIs against your real call transcripts, the same infra you're already using to run the agent, and the AI-disclosure check is judged semantically (via LLM Gateway), not just string-matched, so it catches paraphrases a keyword filter would miss. If you're scaling AI phone calls into a regulated-adjacent workflow, this is the audit trail your legal team is going to ask for eventually - ComplyLine gives it to you before they do.
