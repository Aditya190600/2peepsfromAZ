# AssemblyAI Voice Agent Hackathon — Complete Idea Reference

**This is the single, definitive, self-contained ideas document.** Every idea generated across five research rounds (25 total: 12 round-1 product ideas, 8 round-2 DSP/infra ideas, 1 compliance-checker candidate, 1 combined pitch, 3 world-building/gaming ideas) is documented here in full — concept, all rating axes, real judging-criteria scores, and overall rank. No other file needs to be opened to understand any single idea's complete picture.

The per-round source docs (`hackathon-ideas-technical.md`, `hackathon-novelty-research.md`, `hackathon-completion-likelihood.md`, `hackathon-round3-synthesis.md`, `hackathon-idea-consolidation.md`, `hackathon-ideas-worldbuilding-gaming.md`) remain in the repo as historical/supporting detail — the deeper prior-art citations, source links, and round-by-round reasoning trails live there. They are not required reading.

Machine-readable version: `docs/hackathon-idea-matrix.csv` (25 rows, same ranking).

---

## Hackathon facts (real, confirmed — not the generic fallback)

Confirmed via a working proxy fetch of the live hackathon page (`lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon`), cross-checked against independent search results for dates and prize figures.

- **Dates:** Starts Sep 1, 2026, 3:00 PM UTC. Submissions close Sep 30, 2026, 3:00 PM UTC.
- **Prizes:** $10,000 total pool ($5,000 cash + $5,000 API credits), 5 winners, each getting $1,000 cash + $1,000 credits.
- **Submission requirements:** project title, short/long descriptions, technology tags, cover image, video presentation, slide presentation, public GitHub repo (MIT-license-compliant), working demo URL. Teams of 1-6.
- **Judging criteria (four dimensions, quoted as returned by the mirror):**
  1. **Application of Technology** — "How effectively the chosen model(s) are integrated into the solution"
  2. **Presentation** — "The clarity and effectiveness of the project presentation"
  3. **Business Value** — "The impact and practical value, considering how well it fits into business areas"
  4. **Originality** — "The uniqueness and creativity of the solution, highlighting approaches and ability to demonstrate behaviors"

## AssemblyAI capability summary (verified from docs, Sept 2026)

- **Voice Agent API** — single WebSocket (`wss://agents.assemblyai.com/v1/ws`), 24kHz PCM in/out, bundles STT + LLM reasoning + TTS + native turn detection + interruption/barge-in handling + JSON-schema tool/function calling. Built on Universal-3.5 Pro, ~1s end-to-end latency claim, $4.50/hr flat billing. No built-in session logging/export or CI tooling — a real, confirmed gap.
- **Universal-Streaming API** — partial + finalized transcripts, `end_of_turn` markers, word-level timestamps + per-word confidence. **No diarization or prosody/pitch fields in streaming mode** — the acoustic ceiling is words + timing, nothing about *how* something was said. Mono 16-bit PCM (also AAC, Opus); sessions auto-close at 3 hours.
- **Batch Speech Understanding** (formerly "Audio Intelligence") — speaker diarization (up to 30 speakers), sentiment analysis, entity detection, topic detection (IAB), summarization, auto chapters, action items, key phrases, custom formatting, translation. All text-layer, not acoustic.
- **Guardrails** (separate product) — PII text redaction, PII audio redaction (beep-out), profanity filtering, content moderation, marketed for GDPR/HIPAA/PCI compliance use cases.
- **LLM Gateway** (LeMUR's successor branding) — apply LLMs over transcripts/spoken context for summarization, extraction, judging.
- **Explicit gap, confirmed via AssemblyAI's own blog:** no voice-liveness / synthetic-speech / deepfake / speaker-verification capability. "It's not something AssemblyAI offers... you'll want a purpose-built biometrics platform."
- Raw mic PCM is captured client-side before it's sent to AssemblyAI and stays available locally the whole time — this is what any DSP idea (pitch tracking, MFCC, wavelets) actually operates on, in parallel with the AssemblyAI call, not instead of it.

## Rating axes used throughout

- **Novelty** — real WebSearch prior-art check. High = nothing close found; Low = a shipped/funded competitor does this almost exactly.
- **30-Day Completion** — assumes an AI coding agent does the typing; the real bottleneck is what survives that (a real-audio tuning/validation loop, an open design/research question, an external dependency, a subjective quality bar), not code volume.
- **Actual Use After 30 Days** — would either builder, or a stranger, plausibly still open/clone this on Oct 1, 2026.
- **AssemblyAI API Coverage** — does the *core mechanic* run through an AssemblyAI product surface (High), partially with real non-AssemblyAI engineering as the differentiator (Medium), or mostly outside AssemblyAI (Low)?
- **Four judging criteria** (Application of Technology / Presentation / Business Value / Originality) — scored against the real confirmed criteria above.
- **Overall rank** — `overall_score = 0.35·judging_avg + 0.20·novelty + 0.20·completion + 0.15·actual_use + 0.10·api_coverage` (Low=1 … High=5 on a 1-5 scale, half-steps for compound terms like "Medium-High"). Judging criteria get the largest weight because that's literally how the contest picks winners; novelty and completion are weighted equally because they gate each other (novel-but-unbuildable and buildable-but-unoriginal both fail); actual-use is the tie-breaker for the team's own post-hackathon motivation; API coverage is smallest because it's a self-imposed build constraint, not a judging axis, though it still feeds "Application of Technology."

---

## Master ranking table

| Rank | ID | Idea | Novelty | Completion | Actual Use | API Coverage | App. of Tech | Presentation | Business Value | Originality |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | R1-11 | Reasoning-Timeline Debugger | High | High | High | High | High | High | Medium | High |
| 2 | R3-21 | Voice-Agent Compliance/Legal-Risk Checker (industry-agnostic core) | Medium-High | High | High | High | High | High | High | High |
| 3 | COMBINED | Adversarial Eval Suite + Synthetic-Voice Liveness Check | High | Medium-High | High | Medium | High | High | High | High |
| 4 | R2-6 | Adversarial Voice-Agent Eval Generator | Medium-High | Medium-High | High | High | High | High | High | Medium-High |
| 5 | R1-3 | Verbal Code-Review Companion | High | Medium | High | High | High | Medium | Medium-High | High |
| 6 | R2-1 | Prosody-Aware Emphasis Overlay | Medium-High | High | Medium | Medium | High | High | Medium | Medium-High |
| 7 | W3 | Voice-Authored Agent Arena | High | Medium | Medium-High | Medium | Medium | High | Medium-High | High |
| 8 | W2 | Spoken Ensemble NPC Director | Medium | High | Medium | High | High | High | Medium | Medium |
| 9 | R1-1 | Real Estate Voice Status Radar | Medium | Very High | Medium | High | High | High | Medium | Low-Medium |
| 10 | R1-6 | Two-Agent Compressed Voice Protocol | High | Medium | Medium | High | High | Medium | Low | High |
| 11 | R1-8 | Longitudinal Team-Health Radar | Medium | High | Medium | High | Medium | Medium | Medium | Medium |
| 12 | R2-8 | Latency Budget Profiler | Medium | Very High | Medium | High | Medium | Medium | Medium | Medium |
| 13 | R2-3 | Wavelet-Based Vocal Onset/Transient Coach | High | Medium-High | Low-Medium | Medium | High | Low-Medium | Low | High |
| 14 | R2-4 | Cross-Correlation Echo/Feedback Diagnostics | Medium | High | Medium | High | Medium | Low-Medium | Low-Medium | Medium |
| 15 | W1 | Voice-Native Living World Weaver | Medium | Medium-High | Low-Medium | High | High | High | Low-Medium | Low-Medium |
| 16 | R2-7 | Voice-Agent Session Replay & Diff Debugger | Low | High | Medium | High | Medium-High | Medium-High | Medium | Low |
| 17 | R2-5 | Voice Agent Regression CI Pipeline | Low | Very High | Medium-High | High | Medium | Low-Medium | Medium-High | Low |
| 18 | R1-10 | Voice-Driven Design Rubber Duck | Medium | Medium | Low-Medium | High | Medium | Medium-High | Low-Medium | Medium |
| 19 | R1-5 | Rehearsal Pacing & Cue-Drop Coach | Low-Medium | Medium | Low-Medium | High | Medium | Medium-High | Low | Low-Medium |
| 20 | R1-4 | Hesitation/Confidence-Latency Interview Coach | Low | High | Low | High | Medium | Medium | Low | Low |
| 21 | R1-2 | Interruption/Airtime Fairness Coach | Low | Very High | Low | High | Low | Medium | Low | Low |
| 22 | R1-12 | Live Negotiation/Meeting Tension Tracker | Low | Medium-High | Low | High | Medium | Medium | Low | Low |
| 23 | R1-9 | Personality-Adapted Concept Tutor | Medium | Low | Low | Medium | Low-Medium | Medium | Medium | Medium |
| 24 | R2-2 | Spectral Fingerprint Speaker Re-ID | Low | Medium | Low | Medium | High | Medium | Low | Low |
| 25 | R1-7 | Household Ambient Activity Log | Low | Low | Low | High | Medium | Medium | Medium | Low |

**Bottom line recommendation:** Build **R1-11** for the single strongest all-around bet (highest score on every axis including real judging criteria; the one soft spot is Business Value, since it's a personal dev tool). **R3-21** (this task's revised, industry-agnostic-first version — see below) is the strongest Business-Value pick and the safest bet against the AssemblyAI-coverage constraint, since every sub-mechanism is a direct AssemblyAI API call. If the team wants what captain and partner were already leaning toward, **COMBINED** is a legitimately strong #3, honestly caveated on API coverage (the liveness-detection half needs a non-AssemblyAI pretrained model).

---

## Tier 1: Top picks (rank 1-5)

### 1. Reasoning-Timeline Debugger (R1-11) — "talk to your terminal"
**Concept:** Speak your bug-hypothesis reasoning out loud while working in the terminal. The agent transcribes the reasoning stream via AssemblyAI's streaming API and correlates timestamps against your shell/git history to produce a "why this fix worked/didn't" replay/audit trail. Voice becomes a debugging-session audit log, not a dictation input — the output is a causal timeline artifact, not text you typed.
**Novelty:** High. Voice-to-terminal input tools are common (Claude Code voice mode, speech-to-console tools), but nothing found correlates spoken-reasoning timestamps against shell/git history into a causal replay/audit trail.
**30-day completion:** High. Streaming transcription is trivial; the shell/git-history correlation is well-specified join logic with no subjective tuning gate.
**Actual use after 30 days:** High. This is explicitly a personal tool for captain's own debugging sessions — zero external data, zero other people, targets something he does constantly. Novelty research found nothing close.
**AssemblyAI API coverage:** High — streaming transcription is the entire mechanism.
**Judging criteria:** Application of Technology High (real-time transcription driving a genuinely novel correlation engine), Presentation High (a live "watch my reasoning line up with my terminal" demo is compelling and easy to follow), Business Value Medium (a personal dev tool, not an obvious product — its one real soft spot), Originality High (nothing close found anywhere).
**Key outcomes if built:** a working correlation between a spoken reasoning stream and real shell/git-history timestamps from a live debugging session; a replayable timeline showing "what I said" next to "what changed"; used on at least one of captain's real bugs with the timeline reviewed for accuracy.

### 2. Voice-Agent Compliance/Legal-Risk Checker (R3-21) — revised, industry-agnostic-first
**This entry reflects Part A's revision for this task — see "Part A: industry-agnostic redesign" below for the full research and reasoning. Ratings below are the post-revision, current scores.**
**Concept:** Ingests one AssemblyAI Voice Agent API session and produces a scoped compliance report against a core, industry-agnostic check set that applies to *any* company running an AI voice agent, regardless of vertical: (1) was a valid consent event logged before this call, per TCPA (the FCC's Feb 2024 ruling classifies AI-generated-voice calls as robocalls, and consent/identification/opt-out rules are universal across industries); (2) was the AI nature of the call disclosed at the start of the call, per state disclosure laws (California's AB 2905 requires disclosure at the start of a covered outbound call using an artificial voice — most 2026 secondary sources describe this as within the first few seconds, not the "15 seconds" figure this project's earlier research cited, which this revision corrects); and (3) a general PII-pattern scan (SSN, credit-card numbers, generic account-number shapes) run against the transcript using a pluggable, configurable pattern-set architecture. Industry-specific pattern packs — HIPAA identifiers for healthcare, financial-account-number formats for finance/insurance, real-estate transaction identifiers, etc. — ship as an optional extension layer a deployer can drop in, not a hard requirement for the tool to be useful out of the box.
**Novelty:** Medium-High. The underlying legal facts (TCPA, state disclosure laws, PII redaction) are well-documented and not novel to research; no single tool found does "compliance checker for one specific voice-agent session" as a scoped, protocol-level, industry-agnostic-first artifact — the closest things (Hamming/LiveKit compliance features) are bundled into much bigger paid observability platforms, not a free, narrow, single-purpose checker.
**30-day completion:** High. Each core check is a well-known, bounded pattern: (a) a consent-event-logged boolean check against the session log; (b) a keyword/timing check on the first few seconds of the transcript for disclosure language; (c) PII detection via an existing entity-recognition library (spaCy, Presidio) or AssemblyAI's own Guardrails PII-redaction product directly, rather than a from-scratch detector. The industry-agnostic-first scoping decision *reduces* 30-day risk versus the original framing, because it removes the temptation to build several industry-specific rule sets before the tool is demoable — ship the core three checks, demonstrate one pluggable pattern pack (e.g. a HIPAA identifier pack) as proof the extension layer works, and stop there.
**Actual use after 30 days:** High. Targets the *buyer* side of voice AI — any company that has deployed or is about to deploy a voice agent and needs to not get sued — which is a broader, more urgent addressable audience than "another dev tool for the small number of teams building voice agents on AssemblyAI specifically," and broader still than a single-industry version would have been. The compliance-guide publishing frenzy found in research (six-plus law firms and vendors publishing dedicated 2026 TCPA/AI-disclosure guides in the same few months) evidences active, current buyer anxiety that isn't industry-gated.
**AssemblyAI API coverage:** High. Session ingestion, PII detection via the Guardrails product, and disclosure/consent-language checks via the LLM Gateway are all direct AssemblyAI API calls; the industry-specific pattern packs (an optional layer, not the core) are lightweight regex/rule additions, not a new architecture.
**Judging criteria:** Application of Technology High (multiple AssemblyAI surfaces — session log, Guardrails, LLM Gateway — doing real, central work), Presentation High (a scoped report of concrete flagged findings demos cleanly and is easy for judges to follow), **Business Value High and more defensibly so post-revision** — the industry-agnostic-first framing directly addresses the one real weakness a judge could have raised against the original scoping (a niche vertical-specific tool with a small addressable market) by making the total addressable market "any company running a voice agent" rather than one vertical, Originality High (no scoped, protocol-specific, industry-agnostic-first compliance checker found built anywhere).
**Honest limitation, stated plainly (per this task's own instruction not to overclaim):** industry-agnostic-first does not mean industry-blind. A company in a regulated vertical (healthcare, finance) that relies on the core check set alone will still miss vertical-specific requirements — HIPAA's PHI categories are broader than generic PII, and finance carries its own disclosure/recording-retention rules layered on top of TCPA, not replacing it. The core tool is a genuinely useful floor for any company, not a ceiling for a regulated one; the pluggable pattern-pack layer is what closes that gap, and shipping even one working pack (not just claiming the architecture supports it) is what makes this an honest claim rather than an overclaim.
**What changed from the pre-revision framing:** the original candidate (see `docs/hackathon-round3-synthesis.md`) was already scored well on all axes, so no numeric score moved *down*. What changed is the scoping decision itself — core-checks-first with pluggable industry packs, rather than an implicit assumption that a useful version needs deep per-industry customization — which removes the concrete build-risk captain flagged (over-scoping into several industry rule sets inside 30 days) and strengthens the Business Value claim's defensibility against the exact objection a judge would raise.
**Key outcomes if built:** a working session-ingestion pipeline producing a report flagging "no consent event logged before this call," "no AI-disclosure detected in the opening seconds," and "possible SSN/CC-number pattern at turn N" against a real or synthetic Voice Agent API session; at least one working industry-specific pattern pack (e.g. HIPAA identifiers) demonstrated as a drop-in extension, not just described.

### 3. Adversarial Voice-Agent Eval Suite with Synthetic-Voice Liveness Check (COMBINED)
**Concept:** Combines two ideas captain and partner were independently leaning toward. The base is the Adversarial Voice-Agent Eval Generator (R2-6, below): an LLM synthesizes adversarial test prompts against a stated behavioral constraint ("never quote a price without confirming the deal ID"), synthesizes them to speech, runs them through the real Voice Agent API, and an LLM judge scores whether the spoken response violated the constraint. Synthetic-voice/liveness detection is added as one more **attack/test category** in the same closed loop: instead of only testing "does noisy/accented adversarial audio cause the agent to answer wrong," the suite also tests "can a synthetic/cloned voice fool the agent into treating it as a legitimate human caller" — using a pretrained, open-weights spoof-detection model (e.g. AASIST) as both a new adversarial input generator and an optional detection check run alongside the judge.
**Novelty:** High for the specific combination. Standalone deepfake-voice detection is a mature, commoditized commercial category (Pindrop Pulse, Reality Defender, Hiya, Resemble AI Detect, ElevenLabs' classifier) — not novel by itself. But no existing voice-agent eval tooling (Cekura, Maxim, Hamming) foregrounds spoof/liveness-robustness as a scored eval dimension for a voice agent specifically — "spoof-robustness as an adversarial-eval metric" is real, unclaimed white space.
**30-day completion:** Medium-High. No training-from-scratch needed — `clovaai/aasist` ships pretrained weights on ASVspoof2019; wrapping a pretrained checkpoint as one more attack-category module is integration work, not research, the same shape of well-scoped bottleneck R2-6 already has on its own.
**Actual use after 30 days:** High. Deepfake voice fraud is a well-documented, current industry concern (86% of contact-center leaders name it a top concern per 2026 industry surveys; vishing surged 442% in 2025) — the adjacent claim this pitch makes ("does MY voice agent specifically get fooled by synthetic callers, as part of routine QA") is much thinner-served territory than the general fraud-detection market Pindrop/Hiya already own.
**AssemblyAI API coverage:** Medium, stated plainly — AssemblyAI's own blog confirms liveness/synthetic-speech detection is explicitly not something they offer. The eval-orchestration half (Voice Agent API + LLM Gateway for prompt-gen/judging) is High coverage; the liveness-detection half requires an external, free, open-weights pretrained model run locally — not a paid third-party API, but also not AssemblyAI.
**Judging criteria:** Application of Technology High, Presentation High (a live "watch the agent get fooled by a cloned voice" demo is a dramatic, judge-legible moment), Business Value High, Originality High.
**Honest note:** this is a genuinely strong combination, not a forced fit — the liveness check slots into the exact same closed loop (adversarial prompt → TTS → agent → judge) R2-6 already builds, using the same orchestration. Its one real cost is the Medium (not High) API-coverage score, since the liveness-detection component is the one piece of the whole matrix that AssemblyAI has explicitly, on the record, declined to offer.

### 4. Adversarial Voice-Agent Eval Generator (R2-6)
**Concept:** An LLM generates adversarial test prompts against a text description of the target voice agent's intended behavior (e.g. "never quote a price without confirming the deal ID"), synthesizes those prompts to speech, feeds them through the Voice Agent API, and an LLM judge (via LeMUR/LLM Gateway) automatically scores whether the agent's spoken response violated the stated constraint — stress-testing the full STT-to-LLM-to-TTS pipeline end to end, including acoustic-cascade failures (does noisy/accented adversarial audio cause STT mis-hears that cascade into bad answers) that a text-only eval never surfaces.
**Novelty:** Medium-High. Text-agent adversarial red-teaming (LLM attacker + LLM judge) is well-established (NVIDIA's `garak`, 8,000+ stars); the full closed TTS-to-voice-agent-to-STT loop specifically testing acoustic-cascade failures is real, unaddressed white space.
**30-day completion:** Medium-High. Four integration points (LLM prompt-gen, TTS, Voice Agent round-trip, LLM judge) are all standard wiring; the real gate is whether the LLM-judge scoring is trustworthy against a fixed 5-10 constraint rule-set — a validation loop against real transcripts, not a typing task.
**Actual use after 30 days:** High. `garak`'s sustained multi-year, 8,000+-star usage is direct precedent that "adversarial eval generator for AI systems" is a tool-shape people keep using, and it's squarely the partner's professional domain (voice-AI QA red-teaming at xAI).
**AssemblyAI API coverage:** High — Voice Agent API and LLM Gateway carry the entire mechanism.
**Judging criteria:** Application of Technology High, Presentation High (a live "the agent got fooled" demo is dramatic), Business Value High, Originality Medium-High.
**Key outcomes if built:** a fixed rule-set of 5-10 behavioral constraints; LLM-generated adversarial prompts synthesized to speech and run through the real Voice Agent API; an automated judge verdict per case, human-reviewed against at least 10 cases for judge accuracy.

### 5. Verbal Code-Review Companion (R1-3)
**Concept:** An engineer talks through a PR out loud ("I handled the null case on line 42..."); the spoken transcript plus the actual diff (fed as context) go to the LLM Gateway, which cross-references the spoken claim against the real code and flags claims not supported by it. Voice as a verification signal against code, not voice-to-code dictation.
**Novelty:** High. AI code-review tools (CodeRabbit, PR-Agent, Greptile) all review diffs via text/LLM with no voice input; nothing found combines voice input with fact-checking spoken claims against a diff.
**30-day completion:** Medium. Diff-ingestion is fast; "does the LLM correctly flag unsupported claims against real diffs" needs iterative prompt tuning against real PRs — a human-judgment loop that AI-coding speed doesn't shrink.
**Actual use after 30 days:** High. This is the one idea explicitly framed as "would captain use it on his own real PRs" — a problem he has every week, no continuous-data upkeep needed, and nothing found already fills this gap.
**AssemblyAI API coverage:** High — streaming transcription plus LLM Gateway carries the whole mechanism.
**Judging criteria:** Application of Technology High, Presentation Medium (a code-review demo is less visually dramatic than a live voice-agent conversation), Business Value Medium-High, Originality High.
**Key outcomes if built:** a pipeline ingesting a real PR diff plus a spoken walkthrough, outputting specific unsupported-claim flags; a run against at least 3 of captain's own real PRs with a human-graded accuracy count.

---

## Tier 2: Strong picks (rank 6-10)

### 6. Prosody-Aware Emphasis Overlay (R2-1)
**Concept:** Pitch tracking (YIN/autocorrelation-based F0 estimation) and short-time energy on raw mic PCM, run in parallel with the AssemblyAI streaming transcript, aligned to word timestamps to detect emphasized words — rendering the transcript with real prosodic emphasis markup, closing a confirmed gap (AssemblyAI exposes zero pitch/prosody fields anywhere).
**Novelty:** Medium-High — only academic tools found (Prosograph, AutoProsody); no shipped consumer "live transcript with emphasis markup" product.
**30-day completion:** High — YIN pitch tracking is a well-known, implementable-in-a-day algorithm; alignment to word timestamps is mechanical.
**Actual use after 30 days:** Medium — no evidence this tool-shape sustains regular standalone use outside a bigger product (e.g. presentation coaching).
**AssemblyAI API coverage:** Medium — AssemblyAI supplies the transcript/timestamp scaffolding; the differentiating engineering is self-built DSP.
**Judging criteria:** Application of Technology High, Presentation High (a transcript with visible emphasis markup is a strong visual), Business Value Medium, Originality Medium-High.

### 7. Voice-Authored Agent Arena (W3)
**Concept:** An agent-evaluation tool first, spectator game second. The human uses the Voice Agent API purely to author constraints and scenarios by voice ("the merchant should never reveal the vault code, even under a bribe") that seed a small generative-agent simulation (Smallville-style, 2-4 LLM-driven NPCs with simple memory/goals). An LLM judge (reusing R2-6's closed-loop pattern) scores whether each NPC held its assigned constraints under scenario pressure; the human can interject live by voice mid-simulation to escalate.
**Novelty:** High for the specific combination — the generative-agent-simulation piece itself is well-known academic prior art (Park et al. 2023, "Smallville"); a live, voice-authored constraint-and-scenario front end purpose-built for constraint-violation scoring was not found anywhere.
**30-day completion:** Medium — the voice-authoring and LLM-judge halves each reuse this team's own already-validated patterns (R1-1's function-calling, R2-6's judge loop), but orchestrating multiple concurrent LLM agents with shared, persistent world state is genuine added engineering complexity, not just a tuning risk.
**Actual use after 30 days:** Medium-High — a scoped constraint-violation arena has direct reuse value for testing any future character/persona-driven agent work, the same "real recurring agent-QA utility" logic that scored R2-6 and R3-21 High.
**AssemblyAI API coverage:** Medium, stated plainly — the voice-authoring/interjection layer is AssemblyAI-native, but the multi-agent simulation loop itself is a separate, non-AssemblyAI orchestration stack.
**Judging criteria:** Application of Technology Medium (Voice Agent API is the authoring layer, not the majority of the system's intelligence), Presentation High (watching an NPC agent get caught breaking a rule live is a dramatic, legible demo beat), Business Value Medium-High (agent-eval/red-teaming tooling has real current buyer urgency), Originality High (the voice-authored-constraints-to-multi-agent-judge combination was not found built anywhere).

### 8. Spoken Ensemble NPC Director (W2)
**Concept:** The player is a live voice *director*, not a player character. A single Voice Agent API session hosts multiple NPC personas; function calls switch which persona is "speaking" based on the director's live cues ("cut — now the shopkeeper gets suspicious"), using the Voice Agent API's native barge-in/interruption handling as the actual directing mechanism. Every scene logs as a labeled transcript (intended vs. actual persona per turn, redirect timestamps) directly usable as a persona-consistency-drift benchmark.
**Novelty:** Medium — NVIDIA ACE, Inworld AI, and Convai already own real-time voice NPC dialogue as a mature platform category, but all are developer-facing engine SDKs, not a consumer-facing "live voice director" experience; the director-redirects-via-barge-in framing and drift-labeling export were not found anywhere.
**30-day completion:** High — persona-switching via function calls is mechanically the same shape as W1's proven pattern, and native interruption handling is exactly the primitive a "director cuts the scene" interaction needs.
**Actual use after 30 days:** Medium — the entertainment half faces the same crowded-market headwind as W1, but the persona-drift transcript output has real standalone utility as a lightweight eval tool for character-consistency prompting.
**AssemblyAI API coverage:** High — the Voice Agent API carries the entire mechanic.
**Judging criteria:** Application of Technology High (uses interruption handling as a first-class game mechanic), Presentation High (a live improv-scene demo with audible redirects is a strong hackathon moment), Business Value Medium, Originality Medium.

### 9. Real Estate Voice Status Radar (R1-1) — closepilot prototype
**Concept:** A Voice Agent API session answers spoken deal-status questions ("what's the status of the Smith escrow?") by calling function-calling tools against a structured deal dataset, live, voice-to-voice — voice as the query interface into structured data, output as spoken synthesis rather than a transcript.
**Novelty:** Medium — voice+CRM agents are a commodity category (Retell AI, CloudTalk, Aloware), but the specific "ask your own deal data out loud" framing wasn't found as a shipped product.
**30-day completion:** Very High — Voice Agent API plus function calling over a small mock dataset is a standard, well-documented pattern.
**Actual use after 30 days:** Medium — directly de-risks a real, already-deferred closepilot feature, but its long-term life depends on closepilot productionizing it, not on the builders keeping a side tool running.
**AssemblyAI API coverage:** High — the entire mechanism is the Voice Agent API.
**Judging criteria:** Application of Technology High, Presentation High, Business Value Medium, Originality Low-Medium.

### 10. Two-Agent Compressed Voice Protocol (R1-6)
**Concept:** Two Voice Agent API sessions talk to each other, but instead of full natural-language TTS/STT round-trips, exchange a compact structured intermediate (JSON/function-call payloads over the LLM Gateway) — then benchmark latency/cost against a naive full-voice baseline, turning captain's own agent-to-agent seed idea into a measurable artifact rather than a demo gimmick.
**Novelty:** High — nothing found does a voice-vs-structured-shortcut A/B benchmark between two voice agents; adjacent academic work (LACP, AgentComm-Bench) covers different domains (text/API agents, robotics).
**30-day completion:** Medium — building two agents and a benchmark harness is well-specified engineering, but *designing* the compact intermediate representation is an open design decision AI-coding speed doesn't resolve.
**Actual use after 30 days:** Medium — a genuinely novel benchmark artifact, but a benchmark is inherently a one-time measurement, not a tool anyone re-opens weekly.
**AssemblyAI API coverage:** High — both agents run on the Voice Agent API.
**Judging criteria:** Application of Technology High, Presentation Medium, Business Value Low, Originality High.

---

## Tier 3: Solid mid-tier (rank 11-17)

### 11. Longitudinal Team-Health Radar (R1-8)
**Concept:** Weekly standup/retro recordings run through batch sentiment + entity detection; tracks morale *trend per person over time* across recurring meetings (requiring a small persistence layer), not a single-call mood score — the differentiator vs. the generic "mood analyzer" captain explicitly said to avoid.
**Novelty:** Medium — Read AI already does audio-meeting sentiment over time; per-person longitudinal trend from recurring standups specifically wasn't confirmed as a distinct shipped feature.
**30-day completion:** High — sentiment API call plus a small persistence layer and trend viz is standard data-pipeline engineering with no subjective tuning gate.
**Actual use after 30 days:** Medium — needs a real recurring meeting to stay useful, and Read AI already covers the core mechanism.
**AssemblyAI API coverage:** High.
**Judging criteria:** Application of Technology Medium, Presentation Medium, Business Value Medium, Originality Medium.

### 12. Latency Budget Profiler (R2-8)
**Concept:** Instruments a Voice Agent API integration to break the ~1s end-to-end latency claim into its real per-stage components (mic-capture buffering, STT partial-to-final delay, tool-call round-trip, TTS generation, playback buffering), producing a flame-graph-style latency budget per turn.
**Novelty:** Medium — the concept of per-stage latency breakdown is widely discussed industry guidance; no flame-graph-per-turn visualization tool was found built.
**30-day completion:** Very High — pure protocol-event instrumentation, no subjective judgment, no tuning loop.
**Actual use after 30 days:** Medium — real recurring engineering need, but percentile/dashboard latency tooling already ships inside Hamming/Cekura/LiveKit.
**AssemblyAI API coverage:** High.
**Judging criteria:** Application of Technology Medium, Presentation Medium, Business Value Medium, Originality Medium.

### 13. Wavelet-Based Vocal Onset/Transient Coach (R2-3)
**Concept:** Uses a continuous wavelet transform on raw PCM to detect fast vocal onsets/transients (the sharp attack at the start of a plosive consonant), independent of AssemblyAI's word boundaries, to measure articulation crispness for singers or public speakers — a third, genuinely different DSP technique from pitch tracking and MFCC on this list.
**Novelty:** High — only academic papers in unrelated domains found (wavelet-packet VAD, singer-ID); no applied product doing wavelet-based articulation coaching.
**30-day completion:** Medium-High — CWT-based onset detection is a known, scoped algorithm; residual risk is making "articulation crispness" a compelling demo.
**Actual use after 30 days:** Low-Medium — genuinely novel but no standing user (a singer, a vocal coach) in either builder's actual workflow.
**AssemblyAI API coverage:** Medium — AssemblyAI supplies timestamp scaffolding; the differentiating engineering is self-built DSP.
**Judging criteria:** Application of Technology High, Presentation Low-Medium, Business Value Low, Originality High.

### 14. Cross-Correlation Echo/Feedback Diagnostics (R2-4)
**Concept:** Cross-correlation between a Voice Agent's outgoing TTS buffer and incoming mic PCM detects and quantifies acoustic echo (the agent "hearing itself"), a real, hard-to-spot Voice Agent QA failure mode, turning a subjective "it sounded glitchy" bug report into a number.
**Novelty:** Medium — cross-correlation echo detection is mature, decades-old telecom/AEC technique; no evidence found of it specifically packaged as a voice-agent QA/CI tool.
**30-day completion:** High (conditional) — a few lines of scipy, fully mechanical, but has a hard external dependency on another Voice Agent API build existing to test against.
**Actual use after 30 days:** Medium — entirely dependent on another idea existing and staying alive; no independent life of its own.
**AssemblyAI API coverage:** High.
**Judging criteria:** Application of Technology Medium, Presentation Low-Medium, Business Value Low-Medium, Originality Medium.

### 15. Voice-Native Living World Weaver (W1)
**Concept:** A live, two-way Voice Agent API session where the player's speech mutates a persistent world-state graph (locations, NPCs, items, flags) via function calls in real time — a continuous, barge-in-capable conversation with a narrator that also *is* the game engine. Every session exports the world-state graph plus the full transcript as a structured, replayable "world definition" file, reloadable or handed to a different AI agent as a ready-made environment.
**Novelty:** Medium — the entertainment half is not novel (VoxDungeon, DungeonsDeep.ai, AI Dungeon already ship close voice-driven interactive-fiction analogs); the world-state export-as-reusable-agent-environment mechanic is the one real, narrow differentiator, thin enough a judge could call this "AI Dungeon with extra steps" if underemphasized.
**30-day completion:** Medium-High — the core function-calling-over-world-state pattern is proven (same shape as R1-1's), but narrative coherence over a long session is a real prompt-tuning loop AI-coding speed doesn't shrink.
**Actual use after 30 days:** Low-Medium — interactive fiction is bursty, and strong commercial substitutes already exist; neither builder has a standing personal use case for a fantasy-adventure game.
**AssemblyAI API coverage:** High.
**Judging criteria:** Application of Technology High, Presentation High, Business Value Low-Medium, Originality Low-Medium.

### 16. Voice-Agent Session Replay & Diff Debugger (R2-7)
**Concept:** Captures every Voice Agent API session (audio, transcript, tool calls, latency-per-turn) into a structured log, then a replay UI diffs two sessions (e.g. prompt v1 vs v2 against the same test audio) side by side — transcript diff, tool-call diff, latency diff.
**Novelty:** Low — Hamming AI already ships essentially this for voice agents ("replay any test call... Scenario Rerun... compare intent accuracy, latency percentiles, compliance behavior"); broader LLM-agent trace-diff tooling (LangSmith, AgentOps, ctxdiff) is a mature multi-vendor category. This is the single most damaging novelty finding across the whole matrix — not "someone built something similar," a funded startup's core feature is this.
**30-day completion:** High — session recording is a straightforward WebSocket log; turn-alignment diff logic is a known algorithm class (sequence alignment, same family as WER scoring).
**Actual use after 30 days:** Medium — the category has real staying power generally, but Hamming ships almost exactly this; only survives past the demo if scoped narrowly to AssemblyAI's own specific protocol.
**AssemblyAI API coverage:** High.
**Judging criteria:** Application of Technology Medium-High, Presentation Medium-High, Business Value Medium, Originality Low.

### 17. Voice Agent Regression CI Pipeline (R2-5)
**Concept:** Replays a fixed corpus of test audio clips through the Voice Agent API on every prompt/tool-config change, scoring WER (Levenshtein distance vs. ground truth), tool-call correctness, and end-to-end latency — failing the build if any regress past a threshold.
**Novelty:** Low — Hamming AI and Cekura AI both already ship this near-exactly (fixed scenario corpora replayed on every change, WER + tool-call + latency scored, pass/fail gating), the same two vendors covering R2-7 above.
**30-day completion:** Very High — WER scoring, a GitHub Actions runner, and a fixture-replay harness are all standard, well-documented patterns; the one non-code task (curating 10-20 audio clips) is mechanical labor.
**Actual use after 30 days:** Medium-High — real, recurring need specifically for the partner's actual job (voice-AI QA), but Hamming/Cekura already fully solve it, weakening the pull to keep a homegrown version alive.
**AssemblyAI API coverage:** High.
**Judging criteria:** Application of Technology Medium, Presentation Low-Medium, Business Value Medium-High, Originality Low.

---

## Tier 4: Weaker picks (rank 18-25)

### 18. Voice-Driven Design Rubber Duck (R1-10) — chipspeak
**Concept:** An engineer thinks out loud about an RTL/chip-design problem; the agent uses turn detection + the LLM Gateway to extract structured design decisions and action items, interjecting domain-specific clarifying prompts back via TTS mid-thought.
**Novelty:** Medium — DUCK-E and rubber-duckie are real open-source prior art for the exact voice-rubber-duck-that-interjects loop; the chip-design domain layer is the only real differentiator left.
**30-day completion:** Medium — mechanics are standard; "knowing when to speak up without being annoying" needs real iteration.
**Actual use after 30 days:** Low-Medium — open-source prior art exists but shows no sustained-use signal; the chip-design layer is thin for either builder's daily workflow.
**AssemblyAI API coverage:** High.
**Judging criteria:** Application of Technology Medium, Presentation Medium-High, Business Value Low-Medium, Originality Medium.

### 19. Rehearsal Pacing & Cue-Drop Coach (R1-5) — sabhalog
**Concept:** Live transcript matched against a script flags dropped/mis-said lines and tracks pacing vs. target runtime; a batch diarization pass per take flags who's over-talking or blowing cues in ensemble scenes.
**Novelty:** Low-Medium — StageLine/Cue already do live script-matched line-tracking and pacing indicators in shipped consumer apps; the ensemble-diarization angle is the only unclaimed part.
**30-day completion:** Medium — fuzzy script-matching and a diarization call are well-known techniques, but getting match thresholds right against real messy rehearsal audio is a genuine tuning loop.
**Actual use after 30 days:** Low-Medium — real fit for sabhalog's performing-arts groups, but bursty (only used while actively rehearsing for a show).
**AssemblyAI API coverage:** High.
**Judging criteria:** Application of Technology Medium, Presentation Medium-High, Business Value Low, Originality Low-Medium.

### 20. Hesitation/Confidence-Latency Interview Coach (R1-4)
**Concept:** A mock-interview tool measuring pre-answer hesitation latency and filler-word density from word timestamps and turn detection, tracked as a "confidence latency" trend rather than a single grade.
**Novelty:** Low — Yoodli, LockedIn AI, Huru, and Auto Interview AI already ship hesitation/pause plus filler-word coaching as shipped, funded products.
**30-day completion:** High — well-specified timing analysis, no real tuning gate.
**Actual use after 30 days:** Low — neither builder is job-interviewing; once demo novelty wears off there's no standing personal use case, and commercial substitutes already exist.
**AssemblyAI API coverage:** High.
**Judging criteria:** Application of Technology Medium, Presentation Medium, Business Value Low, Originality Low.

### 21. Interruption/Airtime Fairness Coach (R1-2)
**Concept:** Live streaming turn-detection timestamps compute talk-time balance, interruption counts, and response-latency per speaker in real time on a call — no LLM required for v1.
**Novelty:** Low — Equal Time (Zoom/Google Workspace marketplace app, 700+ orgs) already ships live per-speaker talk-time fairness tracking.
**30-day completion:** Very High — pure streaming-timestamp math, cheapest idea on the whole list.
**Actual use after 30 days:** Low — a maintained SaaS already does this at scale; no reason to keep a hand-rolled copy running once the demo ends.
**AssemblyAI API coverage:** High.
**Judging criteria:** Application of Technology Low, Presentation Medium, Business Value Low, Originality Low.

### 22. Live Negotiation/Meeting Tension Tracker (R1-12)
**Concept:** Periodic short-window batch sentiment + entity detection passes on rolling 20-30s chunks (since full audio intelligence isn't available in streaming) build a live "tension graph" per speaker on high-stakes calls, flagging sharp tone shifts.
**Novelty:** Low — Gong, Balto, and Dialpad already do live call sentiment-shift alerting, including in sales/negotiation contexts.
**30-day completion:** Medium-High — the rolling-window batching pattern is well-specified; interpreting the resulting graph as meaningful (not noise) needs some real-call validation.
**Actual use after 30 days:** Low — mature, heavily-funded commercial category; neither builder is a sales team.
**AssemblyAI API coverage:** High.
**Judging criteria:** Application of Technology Medium, Presentation Medium, Business Value Low, Originality Low.

### 23. Personality-Adapted Concept Tutor (R1-9)
**Concept:** A content-agnostic "adaptive voice tutor" library that infers a learner's expertise level in real time from jargon usage, hesitation, and question phrasing (turn-detection + LLM Gateway) and adapts explanation depth, with curriculum content pluggable so chipspeak or teacher-recruiting could drop in their own subject matter.
**Novelty:** Medium — adaptive tutoring itself is a mature category; the specific expertise-inference-from-speech mechanism and content-agnostic library architecture weren't found built.
**30-day completion:** Low — "infer expertise from jargon/hesitation/phrasing" is genuinely hard, unsolved-in-general research territory; AI can implement whatever heuristic is picked, but picking one that actually works is the open question.
**Actual use after 30 days:** Low — an inaccurate classifier isn't something either builder keeps using; reads as a research note, not a tool.
**AssemblyAI API coverage:** Medium — the classifier itself is not an AssemblyAI API surface.
**Judging criteria:** Application of Technology Low-Medium, Presentation Medium, Business Value Medium, Originality Medium.

### 24. Spectral Fingerprint Speaker Re-ID (R2-2)
**Concept:** A from-scratch MFCC pipeline (FFT → mel filterbank → DCT) run live on raw streaming PCM to re-identify a known, enrolled speaker in near-real-time, well before the ~30s AssemblyAI's batch diarization needs to converge — and works in streaming mode at all, where AssemblyAI has no diarization whatsoever.
**Novelty:** Low — Picovoice Eagle (commercial) and openWakeWord (open-source, active) already do real-time enrolled-speaker verification/gating well.
**30-day completion:** Medium — the MFCC pipeline itself is fast to implement, but the real bottleneck (threshold-tuning against real enrolled voices) is real-world audio iteration that AI-coding speed does not shrink — the report's clearest illustration of that exact failure mode.
**Actual use after 30 days:** Low — same bottleneck twice: the completion gate (ongoing calibration) is also the persistence gate.
**AssemblyAI API coverage:** Medium — AssemblyAI supplies transcript scaffolding; the differentiating engineering is self-built DSP that plugs a real AssemblyAI capability hole.
**Judging criteria:** Application of Technology High (genuine from-scratch signal-processing engineering), Presentation Medium, Business Value Low, Originality Low.

### 25. Household Ambient Activity Log (R1-7)
**Concept:** A passive background listener building a longitudinal household activity signal ("kids arguing spike at 4pm," "unusually quiet 3 hours") for elder-care or parental check-in use, via diarization + audio intelligence on rolling recorded windows.
**Novelty:** Low — Sensi.AI is a shipping commercial product doing essentially this for elder-care monitoring; academic prior art (DESAMO) is close too.
**30-day completion:** Low — the real bottleneck is consent/privacy engineering for always-on listening, a policy/trust problem untouched by coding speed.
**Actual use after 30 days:** Low — carries real ongoing-infra and privacy-engineering requirements neither builder has a standing reason to keep operating past a demo.
**AssemblyAI API coverage:** High.
**Judging criteria:** Application of Technology Medium, Presentation Medium, Business Value Medium, Originality Low.
**Explicit flag carried from every prior round:** highest non-technical (privacy/consent) risk of any idea in the matrix — treat as a demo-only exploration, not a build target, unless the team is prepared to take consent/security seriously post-hackathon.

---

## Part A: industry-agnostic redesign of the compliance/legal-risk checker

This section documents the research and reasoning behind R3-21's revised scope (reflected in its Tier-1 entry above), done for this task in response to a specific concern: compliance/legal-risk requirements for AI voice agents are often industry-specific (HIPAA for healthcare, various rules for finance/insurance/real estate), so a checker scoped as originally described risked either being too narrow to be broadly useful, or requiring per-industry customization that wouldn't fit a 30-day build.

### What the original research already claimed, and what this task verified

The original candidate research (`docs/hackathon-round3-synthesis.md`) proposed three sub-checks: TCPA consent-event logging, state AI-disclosure timing, and PII-leakage scanning. This task did fresh, independent web research (not a re-read of the prior doc) to check whether that scoping is actually industry-agnostic, and found:

- **TCPA is confirmed industry-agnostic at its core, with additional layers for regulated verticals — not a separate rule for them.** The FCC's Feb 2024 ruling that AI-generated-voice calls fall under the TCPA's "artificial or prerecorded voice" provisions applies to any outbound call to a U.S. number, in any industry; consent, identification, and opt-out requirements are the same base rule everywhere. Healthcare carries an *additional* TCPA exemption for strictly treatment-related, non-marketing communications (a carve-out, not a replacement), and finance carries additional regulatory layers on top of the same base TCPA requirement. This confirms the original claim: TCPA attaches to the *act* of placing an AI voice call, not to the caller's industry.
- **California's AI-disclosure requirement (AB 2905) is also confirmed industry-agnostic** — it applies to any business using an automatic dialing-announcing device with an AI-generated voice, regardless of vertical. **One correction to the prior research, found in this task's own verification:** the original doc's "15-second disclosure window" figure does not match what multiple independent 2026 sources describe for AB 2905 — the statute requires disclosure "at the start of the call," and secondary sources consistently describe the practical window as the first few seconds (some cite ~3 seconds), not 15. This document's core check is written as "was AI disclosed at/near the start of the call" rather than hard-coding a specific second count, both because that's more defensible against the correction and because it generalizes better to other states' disclosure rules, which don't all use the same exact window.
- **PII-pattern detection is confirmed industry-agnostic as a *capability*, but not as a fixed pattern list.** Generic PII (SSN, credit-card-number shapes, phone numbers, addresses) is a real, universal category any voice agent could leak regardless of industry — this part of the check set is genuinely industry-agnostic out of the box. But *what counts as sensitive* does vary by vertical: HIPAA's Protected Health Information (PHI) categories are broader than generic PII (they include things like medical record numbers and diagnosis codes that a generic PII scanner has no reason to know about), and finance has its own account-number/routing-number formats. The original research's instinct to treat this as "plausibly industry-agnostic as a general capability" is correct, but only if the pattern set is architected as pluggable/configurable from the start — a hard-coded generic-only scanner would in fact under-serve a HIPAA-covered deployer, exactly the risk the concern raised.

### The revised scope

The core, out-of-the-box tool ships three industry-agnostic checks, each backed by a rule that attaches to the *act* of running a voice agent, not to any one vertical:
1. **Consent-event-logged check** (TCPA) — was a valid consent event recorded before this call.
2. **AI-disclosure-timing check** (state disclosure laws, e.g. California AB 2905) — was the AI nature of the call disclosed at/near the start.
3. **Generic PII-pattern scan** — SSN, credit-card-number, and other universally-sensitive patterns detected in the transcript, using AssemblyAI's Guardrails PII-redaction product or an entity-recognition library as the detection engine.

Industry-specific pattern packs (a HIPAA-identifier pack for healthcare, a financial-account-format pack for finance/insurance, etc.) are an **optional extension layer**, plugged into the same PII-scanning architecture rather than requiring a different tool or a hard-coded assumption about the deployer's vertical. This is the architectural choice that resolves the original concern: the tool is useful to any company out of the box, and gets more precise for a regulated vertical without needing a rewrite.

### Honest assessment — does this fully resolve the concern?

Partially, and that's stated plainly rather than overclaimed. The core three checks are genuinely industry-agnostic and would demo cleanly for any company. But a company in a regulated vertical that stops at the core checks alone is still under-covered relative to their actual regulatory exposure — the core tool is a floor, not a ceiling, for a HIPAA- or finance-covered deployer. The honest claim this revision supports is: **"useful to any company out of the box, extensible to be precise for a regulated one"** — not **"solves compliance for every industry."** Shipping at least one working pattern pack (not just describing the architecture) during the hackathon is what would make that claim demonstrably true rather than aspirational.

### Effect on scoring

Business Value was already scored High in the pre-revision matrix, so no numeric score moves upward on the 1-5 scale used here — but the revision makes that High score substantially more defensible against the exact objection a judge could otherwise raise (a narrow, single-vertical tool has a small addressable market). The addressable-market argument is now "any company running a voice agent," not one vertical, which is a materially stronger Business Value case even though the label on the scale doesn't change. Completion likelihood stays High, and the industry-agnostic-first scoping decision measurably *reduces* real 30-day build risk versus the original framing, by removing the temptation to build several industry-specific rule sets before the tool is demoable.

---

## Sources

Full citation trails for every claim above (novelty prior-art links, completion-likelihood reasoning, actual-use evidence, judging-criteria access method) live in the per-round source docs: `docs/hackathon-ideas.md`'s prior version is superseded by this file; see `docs/hackathon-ideas-technical.md` (R2 concepts), `docs/hackathon-novelty-research.md` (novelty citations), `docs/hackathon-completion-likelihood.md` (completion reasoning), `docs/hackathon-round3-synthesis.md` (actual-use reasoning, original R3-21 research, TCPA/PII/disclosure-law source links), `docs/hackathon-idea-consolidation.md` (judging-criteria access method, combined-pitch research, CSV weighting method), `docs/hackathon-ideas-worldbuilding-gaming.md` (W1/W2/W3 full writeups and prior-art landscape).

Part A's fresh verification for this task used direct WebSearch against: FCC's Feb 2024 TCPA/AI-voice ruling coverage, 2026 TCPA-healthcare-exemption analyses, and multiple independent 2026 summaries of California AB 2905's disclosure-timing requirement (the correction to the "15 seconds" figure).
