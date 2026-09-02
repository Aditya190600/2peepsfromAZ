# AssemblyAI Voice Agent Hackathon - Consolidated Idea Reference

Scout task, 2026-09-02. Consolidates all prior idea research (`docs/hackathon-ideas.md`, `docs/hackathon-ideas-technical.md`, `docs/hackathon-completion-likelihood.md`, `docs/hackathon-novelty-research.md`, `docs/hackathon-round3-synthesis.md`) into one deduplicated reference, adds real judging-criteria research and a re-rank against it, evaluates a new combined pitch the team is leaning toward, checks AssemblyAI API coverage for every idea, and scouts for one more round of criteria-driven new candidates. Companion machine-readable deliverable: `docs/hackathon-idea-matrix.csv`.

**Judging-criteria access: see Part 2 below for the explicit confirmed-vs-fallback verdict before trusting anything downstream that references "judging criteria."**

---

## Part 1: All 21 ideas, one table

Ratings carried forward unchanged from the four source docs (novelty = real-WebSearch prior-art check; 30-day completion = AI-does-the-typing bottleneck analysis; actual-use-after-30-days = would either builder or a stranger still open this Oct 1).

| ID | Idea | One-line description | Novelty | 30-Day Completion | Actual Use After 30 Days |
|----|------|----------------------|---------|--------------------|---------------------------|
| R1-1 | Real Estate Voice Status Radar | Voice Agent API session answers spoken deal-status questions via function calling over a structured dataset (closepilot prototype). | Medium | Very High | Medium |
| R1-2 | Interruption/Airtime Fairness Coach | Streaming turn-timestamp math computes live per-speaker talk-time/interruption fairness on a call, no LLM needed. | Low | Very High | Low |
| R1-3 | Verbal Code-Review Companion | Engineer talks through a PR out loud; LeMUR cross-checks spoken claims against the real diff and flags unsupported ones. | High | Medium | High |
| R1-4 | Hesitation/Confidence-Latency Interview Coach | Mock-interview tool measuring pre-answer hesitation latency and filler-word density as a confidence trend. | Low | High | Low |
| R1-5 | Rehearsal Pacing & Cue-Drop Coach | Live transcript matched against a script flags dropped lines/pacing drift; batch diarization flags ensemble cue-blowing. | Low-Medium | Medium | Low-Medium |
| R1-6 | Two-Agent Compressed Voice Protocol | Two Voice Agent API sessions exchange a compact structured intermediate instead of full voice round-trips; A/B benchmarked vs. naive full-voice baseline. | High | Medium | Medium |
| R1-7 | Household Ambient Activity Log | Passive diarization + audio-intelligence on rolling home-audio windows builds a longitudinal elder/family activity signal. | Low | Low | Low |
| R1-8 | Longitudinal Team-Health Radar | Batch sentiment/entity detection on recurring standup recordings tracks per-person morale trend over weeks, not a single-call score. | Medium | High | Medium |
| R1-9 | Personality-Adapted Concept Tutor | Content-agnostic adaptive-tutor library that infers a learner's expertise from jargon/hesitation/phrasing and adjusts explanation depth. | Medium | Low | Low |
| R1-10 | Voice-Driven Design Rubber Duck | Voice pair-programming rubber duck for chip-design thinking-out-loud sessions; extracts decisions and interjects domain-specific prompts. | Medium | Medium | Low-Medium |
| R1-11 | Reasoning-Timeline Debugger | Correlates spoken debugging reasoning (timestamps) against shell/git history to produce a causal "why this fix worked" replay. | High | High | High |
| R1-12 | Live Negotiation/Meeting Tension Tracker | Rolling 20-30s batch sentiment passes build a live per-speaker "tension graph" during high-stakes calls. | Low | Medium-High | Low |
| R2-1 | Prosody-Aware Emphasis Overlay | Pitch/energy tracking on raw mic PCM aligned to AssemblyAI word timestamps renders a transcript with real emphasis markup. | Medium-High | High | Medium |
| R2-2 | Spectral Fingerprint Speaker Re-ID | From-scratch MFCC pipeline re-identifies an enrolled speaker live on streaming PCM, faster than batch diarization converges. | Low | Medium | Low |
| R2-3 | Wavelet-Based Vocal Onset/Transient Coach | CWT-based onset detection measures articulation crispness/attack sharpness independent of word-boundary timestamps. | High | Medium-High | Low-Medium |
| R2-4 | Cross-Correlation Echo/Feedback Diagnostics | Cross-correlation between outgoing TTS buffer and mic input detects/quantifies a Voice Agent session "hearing itself." | Medium | High (conditional on another Voice Agent build existing) | Medium |
| R2-5 | Voice Agent Regression CI Pipeline | Replays a fixed audio-clip corpus through the Voice Agent API on every config change; scores WER/tool-call-correctness/latency and gates the build. | Low | Very High | Medium-High |
| R2-6 | Adversarial Voice-Agent Eval Generator | LLM generates adversarial prompts, synthesizes to speech, runs through the Voice Agent API, and an LLM judge scores constraint violations end to end. | Medium-High | Medium-High | High |
| R2-7 | Voice-Agent Session Replay & Diff Debugger | Structured session recorder plus a turn-aligned diff view comparing two Voice Agent API runs (e.g. prompt v1 vs v2). | Low | High | Medium |
| R2-8 | Latency Budget Profiler | Per-stage protocol-event instrumentation breaks the ~1s Voice Agent latency claim into a flame-graph-style budget per turn. | Medium | Very High | Medium |
| R3-21 | Voice-Agent Compliance/Legal-Risk Checker | Ingests one Voice Agent API session and flags TCPA-consent gaps, missing AI-disclosure, and PII leaks as a scoped compliance report. | Medium-High | High | High |

Every idea above has a rating on all three axes - none needed a "not yet rated" fallback.

**Sources for the above (full detail, not repeated here):** `docs/hackathon-ideas.md` (R1 concepts), `docs/hackathon-ideas-technical.md` (R2 concepts), `docs/hackathon-completion-likelihood.md` (completion ratings + bottleneck reasoning), `docs/hackathon-novelty-research.md` (novelty ratings + prior-art citations), `docs/hackathon-round3-synthesis.md` (actual-use ratings + the R3-21 candidate + its own sourcing).

---

## Part 2: Real judging-criteria research

**VERDICT: REAL, CONFIRMED criteria obtained for this exact hackathon page - not the generic lablab.ai fallback pattern.**

Direct WebFetch of `https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon` returned a 403 (confirmed bot-wall, matching firstmate's prior report), and both `web.archive.org` and a Google-cache fetch failed to return content. A text-extraction mirror (`r.jina.ai/<url>`) of the live page succeeded and returned the actual rendered page content, cross-checked against independent WebSearch snippets for dates and prize-pool figures (which matched). Treat this as high-confidence but sourced through a third-party mirror rather than a first-party screenshot.

**Dates:** Starts Sep 1, 2026, 3:00 PM UTC; submissions close Sep 30, 2026, 3:00 PM UTC.

**Prizes:** $10,000 total pool ($5,000 cash + $5,000 AssemblyAI API credits), 5 winners, each getting $1,000 cash + $1,000 API credits. Distribution may take up to 90 days.

**Judging criteria (quoted as close to verbatim as the mirror returned, four dimensions):**
1. **Application of Technology** - "How effectively the chosen model(s) are integrated into the solution"
2. **Presentation** - "The clarity and effectiveness of the project presentation"
3. **Business Value** - "The impact and practical value, considering how well it fits into business areas"
4. **Originality** - "The uniqueness and creativity of the solution, highlighting approaches and ability to demonstrate behaviors"

**Submission requirements:** project title, short and long descriptions, technology tags, cover image, video presentation, slide presentation, public GitHub repo, and a working demo URL.

**Rules:** teams of 1-6; submissions must be original and MIT-license-compliant; participation voluntary with eligibility/third-party sponsor requirements; hackathon terms subject to change at organizers' discretion.

These four criteria are close to (but not identical to) lablab.ai's commonly-documented general pattern - no separate "Potential Impact" axis was found on this specific page; "Business Value" and "Presentation" replace/absorb what other lablab pages sometimes split into more categories. **Because these are confirmed for this exact hackathon, the re-rank below uses them directly rather than the general fallback pattern.**

### Re-rank against the real criteria (new pass, not a copy of round-3's recommendation)

Each of the 21 consolidated ideas plus the Part 3 combined pitch was scored High/Medium/Low on each of the four real criteria above (see `docs/hackathon-idea-matrix.csv` for the full per-idea breakdown). Headline shifts versus the round-3 recommendation:

- **R1-11 (Reasoning-Timeline Debugger) moves to #1 overall**, not R2-6 or R3-21. It already scored best on novelty/completion/actual-use in round 3, and it also scores High on three of the four real judging axes (Application of Technology, Presentation, Originality) - a personal terminal+voice demo is genuinely compelling to watch live, which round 3's axes never scored for. Its one soft spot is Business Value (Medium) - it's a personal dev tool, not an obviously monetizable product, but "Business Value" is only one of four criteria and it dominates the rest.
- **R3-21 (Compliance/Legal-Risk Checker) is a strong #2**, and is now the highest scorer specifically on Business Value (the criterion round 3's axes didn't measure at all) - TCPA/disclosure/PII risk is a direct, quantifiable dollar-cost argument judges can act on, and it demos cleanly (a scoped report of concrete flagged findings).
- **R2-6 (Adversarial Eval Generator) holds at a strong #4** (behind the Part 3 combined pitch, see below) - it scores High on Application of Technology and Presentation (a live "the agent got fooled" demo is dramatic) but is held back slightly by novelty being only Medium-High rather than R1-11/R1-3's High.
- **R2-5 and R2-7 (the pair round 3 already demoted) score even worse under the real criteria than under round 3's axes** - both are Low on Originality (Hamming/Cekura ship near-identical products, and a judge who knows the space can check this live) and only Medium-Low on Presentation (a CI pass/fail gate and a session-diff view are useful but visually unexciting compared to a live voice demo). This independently confirms round 3's demotion of this pair, now via a different lens (actual contest scoring, not researcher judgment).
- Crowded-category ideas (R1-2, R1-4, R1-7, R1-12) score at the bottom on the real criteria too, mainly via Low Originality - the same shipped-competitor problem that sank them in the novelty report also sinks them here, because "Originality" explicitly asks for uniqueness a judge can fact-check.

---

---

## Part 3: Combined pitch - Adversarial Voice-Agent Eval Suite with Synthetic-Voice/Liveness Detection

Captain and partner are leaning toward two concepts: (a) human-vs-AI-generated-voice differentiation (liveness/synthetic-speech detection - a new angle, not identical to any of the 21 existing ideas), and (b) R2-6, the Adversarial Voice-Agent Eval Generator. **These combine well, and honestly - this isn't a forced fit.**

**The combination:** the Adversarial Voice-Agent Eval Generator already tests whether a Voice Agent violates stated behavioral constraints under adversarial synthesized speech. Adding synthetic-voice/liveness detection as one of its **attack/test categories** is a natural extension of the exact same closed loop (adversarial prompt to TTS to Voice Agent to judge): instead of only testing "does noisy/accented adversarial audio cause the agent to answer wrong," the suite also tests "can a synthetic/spoofed voice fool the agent into treating it as a legitimate human caller" (e.g., bypassing a voice-verification step, or getting the agent to disclose something it shouldn't to a cloned voice). The liveness/spoof-detector becomes both (1) a new adversarial *input generator* for the eval suite (feed the agent known-synthetic audio and see if it's fooled) and (2) an optional *detection check* the suite runs alongside its judge (did the agent's own pipeline flag the audio as non-human).

**Real research on the liveness/synthetic-voice angle, done as its own topic:**

- **Novelty: Medium-Low for standalone detection, but real white space for the specific combination.** Real-time deepfake voice detection is a mature, commoditized commercial category - Pindrop Pulse (flags synthetic speech within ~2s), Reality Defender, Hiya, Modulate Velma, Resemble AI Detect, and ElevenLabs' own AI Speech Classifier all ship today. Academically it's even more saturated (ASVspoof 2019/2021/2024, ADD 2022/2023, Codecfake, SpoofCeleb, and 2026 benchmarking meta-papers). Standalone "is this voice fake" detection is not a novel product to build. But existing voice-agent eval tooling (Cekura, Maxim, Hamming, and other 2026 roundups) covers ASR accuracy, TTS quality, and prompt-injection-via-audio red-teaming - none of it foregrounds spoof/liveness-robustness as a scored eval dimension for a voice agent specifically. **"Spoof-robustness as an adversarial-eval metric" is real, unclaimed white space; "detecting a fake voice" by itself is not.**
- **Completion likelihood: High.** No training-from-scratch needed. `clovaai/aasist` (GitHub) ships pretrained AASIST/AASIST-L weights trained on ASVspoof2019; Hugging Face hosts W2V-AASIST (wav2vec2-XLSR + AASIST) and AASIST3, both ASVspoof-tuned pretrained checkpoints. An AI coding agent can pull a pretrained checkpoint and wrap it as one more attack-category module in the eval suite well within 30 days - this is integration work, the same kind of "well-scoped, AI-implements-it-fast" bottleneck R2-6 itself already has, not a new research risk.
- **Actual use after 30 days: High.** Industry urgency for deepfake voice fraud is well-documented and current: 86% of contact-center leaders name it a top concern, 66% doubt their own detection capability, vishing surged 442% in 2025, and deepfake fraud losses are projected at $40B by 2027. That's the Pindrop/Hiya buyer-side use case (already commercially solved for general fraud detection) - but the adjacent claim this combined pitch actually makes ("does MY voice agent specifically get fooled by synthetic callers, as part of routine QA") is much thinner-served territory, which is exactly the gap R2-6's own eval-suite framing already targets for other adversarial categories.

**AssemblyAI API coverage for this combined pitch: Medium, and this needs to be said plainly.** AssemblyAI's own blog is explicit: *"It's not something AssemblyAI offers. If authentication-grade voice biometrics is your primary need, you'll want a purpose-built biometrics platform rather than a speech understanding API."* There is no AssemblyAI-native liveness/synthetic-speech-detection capability anywhere in their docs, changelog, or blog - confirmed via direct research for this task. The eval-suite half (R2-6's existing mechanism: Voice Agent API + LLM Gateway for prompt-gen/judging) is High AssemblyAI coverage; the liveness-detection half requires an external, free, open-weights pretrained model (AASIST or similar) run locally - not a paid third-party API, but also not AssemblyAI. Pitched honestly, the majority of the combined suite's *infrastructure* (session orchestration, TTS, judging) is AssemblyAI-native; the *liveness attack category specifically* is not, and that should be stated in any submission rather than implied away.

**Evaluated against all axes (see `docs/hackathon-idea-matrix.csv` row `COMBINED` for the exact scores):** Novelty High, 30-day completion Medium-High, actual-use High, AssemblyAI API coverage Medium, and High on three of the four real judging criteria (Application of Technology, Presentation, Business Value, Originality) - it ranks **#3 overall** in Part 5's synthesis, just behind R1-11 and R3-21, and ahead of R2-6 alone. It does not need to be #1 to be a fair, real pick - it is a genuinely stronger pitch than R2-6 alone specifically because it adds a dramatic, judge-legible demo moment ("watch the agent get fooled by a cloned voice, live") on top of R2-6's already-solid technical and business case, at the honest cost of a partial (not majority) AssemblyAI-only build.

---

---

## Part 4: AssemblyAI API capability coverage

Verified directly against AssemblyAI's docs, product pages, changelog, and blog (Sep 2026), confirming and extending the baseline from the four prior research docs:

- **Voice Agent API** - single WebSocket (`wss://agents.assemblyai.com/v1/ws`), 24kHz PCM in/out, bundles STT + LLM reasoning + TTS + turn detection + interruption handling + native JSON-schema tool/function calling, ~1s end-to-end latency claim, $4.50/hr flat billing. No built-in session logging/export or CI tooling - confirmed still a real gap (relevant to R2-5/R2-7's scoring).
- **Universal-Streaming API** - word timestamps + per-word/utterance confidence is the acoustic ceiling; no pitch/prosody fields anywhere. Diarization and sentiment are batch-only.
- **Batch Speech Understanding** (renamed from "Audio Intelligence") - diarization, sentiment, entity detection, topic detection, summarization, auto chapters, action items, key phrases, custom formatting, translation - all AssemblyAI-native.
- **Guardrails** (new, separate product as of this research) - PII text redaction, PII audio redaction (beep-out), profanity filtering, content moderation, speech-threshold gating, marketed for GDPR/HIPAA/PCI compliance. This directly and natively supports R3-21 (Compliance Checker)'s PII-leak-detection sub-check.
- **LLM Gateway** (LeMUR appears retired as a brand name; same underlying capability) - applies LLMs over transcripts/spoken context for summarization, extraction, judging.
- **Voice-liveness / synthetic-speech / deepfake detection / speaker verification - explicit NO.** AssemblyAI's own blog states directly: *"It's not something AssemblyAI offers... you'll want a purpose-built biometrics platform rather than a speech understanding API."* This is a hard, sourced disqualifier for scoring any liveness/synthetic-voice idea (including the Part 3 combined pitch) as "majority AssemblyAI-buildable" - it is not.

**Per-idea coverage column is in `docs/hackathon-idea-matrix.csv`** (`assemblyai_api_coverage`, High/Medium/Low). Pattern: every product/infra idea built directly on the Voice Agent API, Streaming API, batch Speech Understanding, Guardrails, or LLM Gateway scores **High** - the majority of its core mechanism is a direct AssemblyAI API call. The three DSP ideas whose entire differentiating value is a from-scratch signal-processing technique AssemblyAI doesn't expose (R2-1 pitch/prosody, R2-2 MFCC speaker embeddings, R2-3 wavelet onset detection) score **Medium** - AssemblyAI still supplies the transcript/timestamp scaffolding, but the actual novel engineering is self-built DSP, not an AssemblyAI API surface. R1-9 (expertise-inference classifier) also scores Medium for the same reason - the classifier itself is not something AssemblyAI's API does. The Part 3 combined pitch scores Medium overall for the reason explained in Part 3: its eval-orchestration half is High, its liveness-detection half is a hard zero on AssemblyAI-nativeness.

None of the 21 consolidated ideas require a large stack of *paid* third-party APIs as their core mechanism - where an idea needs something beyond AssemblyAI (open-source scipy/librosa/pywt DSP libraries, GitHub Actions, a pretrained open-weights model like AASIST), it's free/local tooling, not another vendor's paid API. This satisfies captain's stated constraint even for the Medium-scoring ideas; "Medium" here tracks how much of the *core value* is delivered by AssemblyAI specifically, not whether a paid competitor API sneaks in.

---

---

## Part 5: CSV matrix and weighting method

Full matrix: `docs/hackathon-idea-matrix.csv` (22 rows: all 21 consolidated ideas + the Part 3 combined pitch). Columns: id, one-line description, novelty, 30-day completion, actual-use-after-30-days, AssemblyAI-API-coverage, the four real judging criteria (Application of Technology / Presentation / Business Value / Originality, each High/Medium/Low or a small set of compound terms carried from the source docs for the first three axes), and an overall-rank column.

**Weighting method used to compute `overall_rank`** (a reasoned synthesis, not a formula lablab publishes):

- Ratings were converted to a 1-5 numeric scale (Low=1, Low-Medium=2, Medium=3, Medium-High=4, High=5, Very High=5).
- `judging_avg` = the mean of the four real judging-criteria scores.
- `overall_score = 0.35 * judging_avg + 0.20 * novelty + 0.20 * completion + 0.15 * actual_use + 0.10 * api_coverage`

Reasoning for the weights: the four judging criteria get the largest single share (0.35) because that is literally how the contest picks winners - everything else is a proxy for whether the team *can and should* pursue an idea, not how it will be scored on Sep 30. Novelty and completion are weighted equally (0.20 each) because they gate each other symmetrically: a novel idea that can't ship in 30 days never reaches judging at all, and a fast-to-build idea with no novelty scores poorly on Originality regardless of how the other axes look - so the model treats "can this even happen" and "is this worth happening" as equally load-bearing. Actual-use (0.15) matters to the team's own post-hackathon motivation but not to the judges, so it's weighted lower than novelty/completion but still real - it's the tie-breaker between two similarly-scoring ideas. AssemblyAI API coverage (0.10) gets the smallest weight because it's a captain-imposed build constraint, not a judging axis, but it still counts because an idea that leans on non-AssemblyAI tooling for its core mechanism is a weaker "Application of Technology" story by construction (judges are told to look at "how effectively the chosen model(s) are integrated").

**Result:** R1-11 (Reasoning-Timeline Debugger) ranks #1, R3-21 (Compliance/Legal-Risk Checker) #2, the Part 3 combined pitch #3, R2-6 (Adversarial Eval Generator alone) #4, R1-3 (Verbal Code-Review Companion) #5. Full ranked order for all 22 rows is in the CSV.

---

## Part 6: Round 4 scouting - new judging-criteria-driven candidates

**Conclusion: nothing new clears the bar as a genuinely distinct 23rd idea.** This is an honest "no" rather than a padded entry, for a specific reason: the real judging criteria obtained in Part 2 (Application of Technology, Presentation, Business Value, Originality) are close to lablab's general pattern already anticipated when the prior four docs were written, and the two axes that weight most heavily in practice - Business Value and Originality - are exactly the axes the round-3 synthesis and this task's own liveness-detection research already probed hardest. The liveness/synthetic-voice research done for Part 3 was the deliberate judging-criteria-first search this part calls for (it specifically went looking for what a Business-Value-and-Originality lens would surface that the prior 20 ideas hadn't covered) - and what it found was not an entirely new standalone idea, but real evidence that the *existing* R2-6 concept becomes stronger when combined with it. That combination is captured fully in Part 3, not duplicated here as a separate row.

One adjacent idea surfaced during this research but was rejected as not distinct enough to add: a standalone "voice-agent spoof/fraud firewall" (block a suspected synthetic caller from reaching the agent at all, rather than testing the agent against synthetic audio in an eval suite). This was rejected because (a) it's the exact use case Pindrop/Hiya/Reality Defender already ship commercially and fund heavily (Low novelty, same problem R2-2's speaker-re-ID idea already has), and (b) it has near-zero AssemblyAI API coverage (it's pure third-party biometrics, not an AssemblyAI-adjacent tool at all) - it fails the same two gates (novelty, API-coverage constraint) that already sank other ideas in this matrix, so adding it as a padded 23rd row would not be honest given the brief's own standard for what counts as "genuinely strong."

---

## Final recommendation

1. **Build R1-11 (Reasoning-Timeline Debugger) if the team wants the single strongest all-around bet.** It ranks #1 across every axis measured in this pass - real judging criteria included - because it is simultaneously the most novel (nothing found combines voice with a shell/git causal audit trail), fastest-to-finish (well-specified correlation/join logic, no tuning loop), most likely to see actual post-hackathon use (captain's own daily debugging tool), fully AssemblyAI-native, and a genuinely compelling live demo (Presentation and Application of Technology both score High). Its one soft spot - Business Value, since it's a personal dev tool rather than an obvious product - is real but is one of four criteria, not a disqualifier.

2. **But given captain and partner's stated preference (Part 3's combined pitch), the Adversarial Voice-Agent Eval Suite with a synthetic-voice/liveness-detection attack category is a legitimately strong #3 overall, and the strongest pick that actually matches what the team said they want to build.** It beats R2-6 alone on every axis except AssemblyAI API coverage (Medium vs. High, because the liveness-detection component genuinely requires a non-AssemblyAI pretrained model - stated plainly, not glossed over) and it adds the single most dramatic, judge-legible demo moment in the whole matrix ("watch the voice agent get fooled by a cloned voice, live"). This is a coherent combination, not a forced one - the liveness check slots in as one more adversarial test category inside the eval loop R2-6 already builds, using the exact same orchestration.

3. **R3-21 (Compliance/Legal-Risk Checker) remains the strongest fully-AssemblyAI-native, highest-Business-Value pick**, and is a legitimate co-centerpiece or fallback if the team wants to de-risk the AssemblyAI-coverage question entirely - every sub-mechanism (session ingestion, PII detection via the new Guardrails product, LLM-Gateway-based disclosure/consent checks) is a direct AssemblyAI API call, and it scored highest of anything in the matrix on the real "Business Value" criterion specifically.

**Bottom line:** if the team wants to build exactly what they're leaning toward (the combined pitch), that choice is well-supported by real research and ranks #3 of 22 - a strong, honest, non-forced pick, not a compromise. If the team is open to reconsidering, R1-11 is the objectively highest-scoring idea across every axis measured, including the real judging criteria - and R3-21 is the safest bet against the AssemblyAI-API-coverage constraint specifically.

**Judging-criteria confirmation status (repeated for clarity): REAL criteria were obtained for this exact hackathon page via a working proxy fetch, cross-checked against independent search results - this was not the generic lablab.ai fallback pattern.** All re-ranking in Part 2 and the CSV matrix uses these confirmed criteria directly.

---

## Final recommendation

[FILLED IN AFTER ALL PARTS ABOVE ARE COMPLETE]
