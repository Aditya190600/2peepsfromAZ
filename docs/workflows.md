# Workflows

What the user actually does in ComplyLine today, and why they'd bother. One product, several entry points into the same core loop: get a completed voice-agent session in front of it, get back a severity-ranked compliance report. This is a thinking tool for reshaping product direction, not a spec - no acceptance criteria, no roadmap.

## 1. Run a live call and get its compliance report

**What they do:** On `/dashboard`, check the consent box, click "Start call," talk to the AssemblyAI voice agent through the mic, click "End call," then "Generate report for last call."

**Value prop:** This is the only workflow that proves the checks work against a *real* AssemblyAI Voice Agent session, not a canned transcript - it's the credibility anchor for the demo video and for anyone deciding whether to trust the tool on their own calls.

## 2. Try a one-click sample session (playable or text-only)

**What they do:** Without touching a mic, click one of six labeled sample buttons ("Clean call," "TCPA violation," "Opt-out ignored," etc.) - each instantly analyzed. A larger text-only sample library (labeled by generated scenario) exists for volume testing without needing audio files at all.

**Value prop:** Lets anyone (a judge, a prospect, a teammate) see every failure mode the tool catches in seconds, with zero setup, zero mic permission dialog, and no waiting on a live call. This is the fastest path to "I get what this does."

## 3. Upload a recorded audio file for analysis

**What they do:** Drag an audio file (or click to choose one) into the "Demo: try your own audio" dropzone. It's transcribed via AssemblyAI's pre-recorded STT, then run through the same compliance pipeline, with the report's timestamped findings clickable to seek the audio player.

**Value prop:** Bridges the tool to whatever call recordings a real business already has sitting around (from a different voice stack, or archived calls), without requiring they re-architect around the live Voice Agent API just to get a report.

## 4. Review the report itself

**What they do:** Read the severity-ranked findings list (each with a plain-language detail, a regulatory citation, and a headline verdict like "critical" or "clear" at the top), optionally jump to the exact moment in the audio a finding fires, then print/export it.

**Value prop:** The report - not a raw transcript, not a dashboard of numbers - is the actual deliverable: something a compliance officer or legal team can act on directly, with the citation doing the work of explaining *why* it matters.

## 5. Turn on an industry-specific PII pack

**What they do:** Before analyzing a session, check "HIPAA identifiers" and/or "GLBA finance identifiers" in the pattern-pack selector. The generic SSN/credit-card/account-number scan always runs; these add on top of it.

**Value prop:** Shows the architecture is genuinely extensible - a healthcare or banking prospect can see their specific identifiers get caught without waiting for a bespoke build, which matters for the "will this work for my industry" objection.

## 6. Analyze a fleet of sessions at once

**What they do:** Click "Analyze N sample sessions" or "Analyze full library" to run every sample through the pipeline (rate-limited to 2 concurrent), then browse an aggregate compliance-rate view with per-check pass/flag counts and a per-session drill-down.

**Value prop:** A single call's report answers "did this one call comply"; the fleet view answers the question an actual compliance team has - "how compliant is this whole program" - which is the more sellable framing for an enterprise buyer.

## 7. Check the report history / audit trail

**What they do:** Visit `/history` to see a running list of every report generated this session (label, session ID, verdict), persisted in `localStorage`.

**Value prop:** Gives a lightweight "what have I already checked" record without standing up a database - useful for anyone running several sessions through in one sitting and needing to compare or revisit past verdicts.

## 8. Extend the PII scan with a new pattern pack (developer workflow)

**What they do:** Add a new pack object (id, name, list of `{id, label, regex}` patterns) to `server/checks/patternPacks.js`, following the existing `hipaaPack`/`financePack` shape - no changes to `piiScan.js` or `analyze.js` are needed.

**Value prop:** Proves the "pluggable by industry" claim isn't just marketing copy - a new vertical (e.g. a pack for a specific state's ID formats) is a five-minute addition, which matters for both scaling to new customer segments and for the judges evaluating originality/extensibility.
