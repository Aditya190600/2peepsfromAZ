# AssemblyAI Voice Agent Hackathon - Completion Likelihood Reassessment

Scout task, 2026-09-01. Re-assesses all 20 ideas from `docs/hackathon-ideas.md` (round 1) and `docs/hackathon-ideas-technical.md` (round 2) against a new metric: **likelihood of completion within the 30-day hackathon window (Sep 1-30, 2026), assuming AI coding agents do all the typing**, not the two humans.

## Method

Under an AI-does-the-typing model, code volume stops being the bottleneck. For each idea I asked: what's the REAL bottleneck once typing speed is free?

- **Well-known, well-specified algorithm** (YIN pitch tracking, MFCC, Levenshtein/WER, cross-correlation, CWT onset detection, standard CI harness) - an AI agent implements this correctly from references in hours, not days. High completion likelihood even if it "looked moderate" under a human-hours estimate.
- **Real-world tuning/validation loop** (threshold tuning against real audio, "does the LLM judge correctly," "is the interject timing right") - a human still has to listen, judge, and iterate. AI coding speed does not touch this. This is the bottleneck that survives the AI-coding shift.
- **Genuine design/research uncertainty** (an unsettled protocol schema, "infer expertise from speech patterns," subjective UX taste) - AI can implement a spec fast; it can't resolve an open design question for the team.
- **External dependency** (needs another idea already built, needs real accounts/hardware/consent) - unaffected by who writes the code.
- **Scope creep / open-ended "make it good" tail** (subjective quality bars, unbounded tuning) - real 30-day risk even with fast implementation.

Scale: **Very High / High / Medium / Low**, consistent across all 20.

---

## Round 1 (product ideas)

| # | Idea | Completion likelihood | Real bottleneck | Original rating moved? |
|---|------|------------------------|------------------|--------------------------|
| 1 | Real Estate Voice Status Radar | **Very High** | Voice Agent API + function calling over a mock dataset is a standard, well-documented integration pattern - nothing left to tune once it works | No change - was already rated straightforwardly buildable; AI coding just confirms it |
| 2 | Interruption/Airtime Fairness Coach | **Very High** | Pure streaming-timestamp math, no model in the loop for v1, nothing subjective to tune | No change - already the cheapest idea on the list |
| 3 | Verbal Code-Review Companion | **Medium** | Diff-ingestion is fast to build, but "does the LLM correctly flag unsupported claims against real diffs" needs iterative prompt tuning against real PRs - a human-judgment loop, not typing volume | **Moves up modestly.** Was "Moderate" for code-volume reasons (diff ingestion + prompt design); the ingestion part is now nearly free, but the validation-accuracy tuning remains the same 30-day risk it always was |
| 4 | Hesitation/Confidence-Latency Interview Coach | **High** | Streaming timing analysis is well-specified; LeMUR question-tagging is optional and low-risk | **Moves up.** Was "Yes/buildable" mostly on code-volume grounds - now clearly fast with no real tuning gate |
| 5 | Rehearsal Pacing & Cue-Drop Coach | **Medium** | Fuzzy script-matching against messy spoken performance and a batch diarization pass are both well-known techniques, but getting match thresholds right against real rehearsal audio (mumbled lines, ad-libs) is a real-world tuning loop | **Partial move.** Code volume (fuzzy match + diarization call) is now cheap; threshold tuning against real performers is the part that doesn't get faster |
| 6 | Two-Agent Compressed Voice Protocol | **Medium** | Building two agents and a benchmark harness is well-specified engineering, but *designing* the compact structured intermediate representation is an open design decision, not an implementation task | **Doesn't move much.** Was "Moderate-high" for code-volume; the actual gate is a design decision AI coding speed doesn't resolve |
| 7 | Household Ambient Activity Log | **Low** | Consent/privacy engineering for always-on listening is a policy and trust problem, not a coding problem | **No change - explicitly flagged in the original report as the highest non-technical-risk idea, and that risk is untouched by who writes the code** |
| 8 | Longitudinal Team-Health Radar | **High** | Sentiment API call + a small persistence layer + trend visualization is standard data-pipeline engineering with no subjective tuning gate | **Moves up.** Was "Moderate" purely for the persistence-layer code volume - now fast |
| 9 | Personality-Adapted Concept Tutor (adaptive library) | **Low** | "Infer expertise level from jargon/hesitation/phrasing in real time" is a genuinely hard, unsolved-in-general research problem - AI can write the code for whatever heuristic you pick, but picking a heuristic that actually works is the open question | **No change - already flagged "ambitious/stretch" in round 1, and the reason (research uncertainty, not code volume) is exactly the kind of bottleneck AI coding doesn't touch** |
| 10 | Voice-Driven Design Rubber Duck | **Medium** | Voice Agent API + interject-on-pause mechanics are standard; "knowing when to speak up" without being annoying needs real iteration against actual thinking-out-loud sessions | **Partial move.** Mechanics got cheaper; the interject-timing judgment call is the same bottleneck as before |
| 11 | Reasoning-Timeline Debugger | **High** | Streaming transcription is trivial; shell/git-history timestamp correlation is well-specified join logic, no subjective tuning | **Moves up.** Was "Moderate" for the correlation-logic code volume - now fast and mechanical |
| 12 | Live Negotiation/Meeting Tension Tracker | **Medium-High** | The rolling-window batching pattern (calling batch sentiment on 20-30s chunks) is well-specified engineering; interpreting the resulting "tension graph" as meaningful (not noisy false alarms) needs some real-call validation | **Moves up, but not fully.** Was "Moderate" for the engineering trick itself, which is now fast; the residual gate is validating the signal isn't noise on real calls |

## Round 2 (technical/DSP + infra ideas)

| # | Idea | Completion likelihood | Real bottleneck | Original rating moved? |
|---|------|------------------------|------------------|--------------------------|
| 1 | Prosody-Aware Emphasis Overlay | **High** | YIN/autocorrelation pitch tracking is a well-known, well-documented algorithm; alignment to AssemblyAI word timestamps is mechanical join logic. Some tuning needed for "what counts as emphasis" but it's a single threshold, not an open-ended loop | **Moves up.** Was already "Yes" but for code-volume reasons ("50 lines of numpy"); now the algorithm is essentially free, leaving only a bounded tuning pass |
| 2 | Spectral Fingerprint Speaker Re-ID | **Medium** | MFCC pipeline itself (FFT to mel filterbank to DCT) is standard and AI-implementable fast via librosa/scipy - but the original report itself flags "the real work is threshold-tuning and a simple online matching loop against enrolled voices" as the actual scope gate. That's real-world audio iteration, immune to AI coding speed | **Does NOT move up much - this is the textbook case the brief warned about.** Looked "Moderate" for code-volume; the code got cheap, but the genuine bottleneck (matching threshold tuning against real enrolled voices) was never about code volume and stays exactly as hard |
| 3 | Wavelet-Based Vocal Onset/Transient Coach | **Medium-High** | CWT-based onset detection is a known, scoped algorithm (`pywt`/`scipy.signal.cwt` + peak-picking) - AI implements this fast. Residual risk is making "articulation crispness" a compelling, legible demo, which is a presentation/design judgment call, not a coding one | **Moves up somewhat.** Was "Moderate" for build effort; algorithm is now fast, but the "narrow, hard to make compelling" demo risk flagged in round 2 is untouched |
| 4 | Cross-Correlation Echo/Feedback Diagnostics | **High (conditional)** | Cross-correlation via scipy is a few lines, fully mechanical, no tuning loop of consequence. But it has a hard external dependency: it needs a working Voice Agent API integration (e.g. idea R1#1) to test against | **Moves up, with a caveat.** Was "Yes" already; now it's genuinely fast to build, but completion is gated on another idea existing first - a dependency risk unrelated to coding speed |
| 5 | Voice Agent Regression CI Pipeline | **Very High** | This is the clearest case in the whole set: WER scoring (Levenshtein distance), a GitHub Actions runner, and a fixture-replay harness are all standard, well-documented patterns an AI agent implements correctly and quickly. The one non-code task (recording/curating 10-20 real audio clips) is mechanical labor, not iterative judgment | **Moves up the most of any idea on either list.** Was "Moderate-high" almost entirely because of code volume (harness + scorer + CI runner = "3-5 day build" under a human-hours model) - under AI-assisted coding this collapses to config plus a fixed, bounded data-collection task |
| 6 | Adversarial Voice-Agent Eval Generator | **Medium-High** | Four integration points (LLM prompt-gen, TTS, Voice Agent round-trip, LLM judge) are all standard wiring an AI agent handles well. The real gate is whether the LLM-judge scoring is actually trustworthy against a fixed 5-10 constraint rule-set - that's a validation loop, calibrated against real transcripts, not a typing task | **Moves up, but less than #5.** Was "Moderate" for the four-integration-point code volume, which is now cheap; judge-accuracy calibration is the part that remains genuinely a 30-day risk |
| 7 | Voice-Agent Session Replay & Diff Debugger | **High** | Session recording is a straightforward WebSocket message log. Turn-alignment diff logic sounds fuzzy but is actually a well-known algorithm class (sequence alignment / edit-distance over turns, same family as WER above) - AI implements this correctly from a clear spec. UI is standard | **Moves up significantly.** Was "Moderate" citing "the diff/alignment logic and UI are the real work" as if it were open-ended - reframed, it's a scoped algorithmic problem with a known solution shape, which AI coding handles well |
| 8 | Latency Budget Profiler | **Very High** | Pure protocol-event instrumentation (timestamp known event types: turn finalization, tool call, audio chunk) plus a visualization. No subjective judgment, no external dependency beyond an existing integration, no tuning loop | **Moves up substantially.** Was "Yes" already scoped tightly; now the instrumentation-plus-viz work that made it "a few days" collapses further - almost pure plumbing |

---

## Which ratings changed, and why (explicit)

**Moved up meaningfully because the original constraint was code volume, not judgment:** R1#4, R1#8, R1#11, R2#1, R2#5 (biggest mover), R2#7, R2#8.

**Moved up only partially - real tuning/validation loop survives underneath the now-cheap code:** R1#3, R1#5, R1#10, R1#12, R2#3, R2#6.

**Did not move, or barely moved - bottleneck was never code volume:**
- R1#7 (privacy/consent policy problem)
- R1#9 (open research question - "infer expertise" has no settled solution to implement)
- R1#6 (open design decision - what the compact protocol representation even is)
- **R2#2 - this is the report's clearest illustration of the brief's warning.** Round 2 already knew "the real work is threshold-tuning," even before this pass; AI-assisted coding makes the MFCC pipeline itself nearly free, but does nothing for the tuning loop, so the net completion likelihood stays Medium rather than jumping to High/Very High the way the pure-infra ideas did.

**Conditional on an external dependency, unaffected by coding speed either way:** R2#4 (needs a working Voice Agent integration to test against).

---

## Why build this / key outcomes (per idea)

Added at captain's request before finalizing a pick. "Why build this" is the underlying motivating reason, not a restatement of the concept. "Key outcomes" are concrete, checkable things you'd hold in hand at hackathon end if the idea succeeds - not vague goals.

### Round 1

**1. Real Estate Voice Status Radar**
Why: De-risk a real, already-deferred closepilot feature before committing engineering time to it in the main product, at zero cost if it fails.
Key outcomes: A working Voice Agent API session answering natural-language questions against a mock deal dataset via function calling; a recorded demo of at least 3 distinct query types answered correctly; a reusable "ask your structured data out loud" starter kit (agent config + function schema) usable outside closepilot.

**2. Interruption/Airtime Fairness Coach**
Why: Validate that pure streaming-timestamp math (no LLM) is enough to produce a genuinely useful social-dynamics signal - a cheap test of "how far can turn-detection data alone go."
Key outcomes: A live talk-time/interruption dashboard tested on at least 2 real calls (e.g. a team standup, a podcast recording); numeric fairness metrics (% airtime per speaker, interruption count) logged per session; zero-setup mic-only demo.

**3. Verbal Code-Review Companion**
Why: Build a tool captain would actually keep using on his own PRs - the test of whether voice-as-verification-signal against a diff is a real workflow improvement, not a novelty.
Key outcomes: A working pipeline that ingests a real PR diff plus a spoken walkthrough and outputs a list of specific claims flagged as unsupported by the code; a run against at least 3 of captain's own real PRs with a human-graded accuracy count (how many flags were correct vs. false positive).

**4. Hesitation/Confidence-Latency Interview Coach**
Why: Produce a concrete, reusable module for teacher-recruiting's candidate interview prep rather than a one-off demo, proving the cross-pollination story works in practice.
Key outcomes: A "confidence latency" trend chart from a mock interview session (pause length + filler-word density per answer); the module packaged so it can be pointed at teacher-recruiting's own interview question set; before/after trend comparison across 2+ practice sessions from the same test subject.

**5. Rehearsal Pacing & Cue-Drop Coach**
Why: Give sabhalog's performing-arts groups a rehearsal analytics tool grounded in a domain sabhalog already serves, instead of a generic transcription add-on.
Key outcomes: A script-matching report flagging dropped/mis-said lines against a real rehearsal recording; a pacing-vs-target-runtime chart; at least one real take from a sabhalog-adjacent performer or scene run through the tool with a human-reviewed accuracy check on the flagged drops.

**6. Two-Agent Compressed Voice Protocol**
Why: Turn captain's own "two agents talk to each other" seed into a measurable engineering artifact (a benchmark) instead of a demo gimmick, settling whether a compact intermediate actually beats full-voice round-trips.
Key outcomes: Two working Voice Agent API sessions communicating via a defined compact schema; a same-task A/B benchmark (latency + cost) against a naive full-voice baseline, with real numbers, not estimates; the compact-protocol schema itself as a reusable spec.

**7. Household Ambient Activity Log**
Why: Answer captain's own stated goal ("show me something useful, not just a soundmap") with a longitudinal-care use case - but the report's own risk flag (privacy/consent) means this is really testing whether the team is willing to engineer consent seriously, not just whether the DSP works.
Key outcomes (demo-scoped, not production-scoped): A longitudinal activity signal (e.g. hourly noise-level/activity chart) from a multi-day recorded test household; at least one flagged anomaly event ("unusually quiet 3 hours") validated against what actually happened; an explicit, written consent/data-retention model even if not fully implemented.

**8. Longitudinal Team-Health Radar**
Why: Prove that a real data-pipeline (persisted per-person trend over time) is worth the extra engineering over a single-call "mood score," which is the generic version captain explicitly said to avoid.
Key outcomes: A per-person sentiment trend line spanning at least 3 recorded standup/retro sessions from the same recurring meeting; a stored, queryable history (not just a live dashboard); one flagged trend shift validated by a human who was in the actual meetings.

**9. Personality-Adapted Concept Tutor**
Why: Test whether an expertise-inference-from-speech heuristic can work at all, framed as a pluggable library so a positive result is directly reusable by chipspeak and teacher-recruiting rather than a one-off bot.
Key outcomes: A working expertise-level classifier (even a simple heuristic) tested against at least 2 speakers of visibly different expertise on the same topic; the adapter interface (content-agnostic API) documented and exercised with one swapped-in subject-matter module; an honest accuracy readout on the classifier, including its failure cases.

**10. Voice-Driven Design Rubber Duck**
Why: Give chipspeak a domain-specific voice pair-programming tool where the differentiator is knowing *when* to interject, not just transcribing - testing a real interaction-design hypothesis, not just LeMUR prompting.
Key outcomes: A working interject-on-pause loop tested on at least one real chip-design thinking-out-loud session; a log of extracted structured decisions/action items from that session; a human judgment call on whether the interjections were useful vs. annoying, recorded as a concrete finding.

**11. Reasoning-Timeline Debugger**
Why: Build a personal tool for captain's own debugging sessions that correlates spoken reasoning with terminal/git state - proving voice can be a causal audit trail, not just a transcript.
Key outcomes: A working correlation between a spoken reasoning stream and real shell/git-history timestamps from at least one live debugging session; a replayable timeline artifact showing "what I said" next to "what changed" at each step; used on at least one of captain's own real bugs, with the resulting timeline reviewed for accuracy.

**12. Live Negotiation/Meeting Tension Tracker**
Why: Prove the rolling-window batch-as-pseudo-realtime trick works as a genuine engineering pattern, applied to a high-stakes-call use case rather than a routine meeting.
Key outcomes: A live tension graph generated during at least one real or simulated negotiation/high-stakes call, built on 20-30s rolling batch windows; at least one flagged tone-shift event cross-checked against what a human in the call actually remembers happening; documented latency of the rolling-window pipeline (how "live" it actually felt).

### Round 2

**1. Prosody-Aware Emphasis Overlay**
Why: Close a confirmed, documented gap - AssemblyAI exposes zero acoustic/prosody features - with a technique (pitch tracking) that's classic, respected DSP and produces an output no off-the-shelf transcription tool makes.
Key outcomes: A pitch/energy tracker running on raw mic PCM in parallel with an AssemblyAI stream; emphasis-annotated transcript output (bold/underline on stressed words) from at least one real recorded talk/pitch; a side-by-side comparison of the tool's flagged emphasis against a human's own sense of what they stressed.

**2. Spectral Fingerprint Speaker Re-ID**
Why: Plug a real, documented capability hole (no live diarization in streaming, and batch diarization needs ~30s to converge) with a from-scratch MFCC pipeline - genuine acoustic-fingerprinting engineering, not an API wrapper.
Key outcomes: An MFCC-based embedding pipeline (FFT to mel filterbank to DCT) built from primitives; a working match/no-match decision against a small enrolled set (2-4 speakers) on live streaming PCM; a measured accuracy/false-positive rate from a real test session, plus the tuned matching threshold as a documented, checkable number.

**3. Wavelet-Based Vocal Onset/Transient Coach**
Why: Demonstrate a third, genuinely different DSP technique (wavelets, not FFT-based) on the same list, proving the team isn't a one-trick pony - applied to a real gap (word-boundary timestamps don't capture articulation sharpness).
Key outcomes: A working CWT-based onset detector run on real recorded speech/singing; an "articulation crispness" score or chart per test clip; at least one before/after comparison (e.g. same phrase said crisply vs. mumbled) showing the detector actually distinguishes them.

**4. Cross-Correlation Echo/Feedback Diagnostics**
Why: Give whichever Voice Agent API build the team ships a concrete QA tool for a real, hard-to-spot failure mode (the agent hearing its own TTS), replacing subjective "it sounded glitchy" bug reports with a number.
Key outcomes: A working cross-correlation check between outgoing TTS buffer and incoming mic PCM; a numeric echo/leakage score run against at least one real Voice Agent API session; at least one deliberately-induced echo case caught and flagged by the tool as a validation check.

**5. Voice Agent Regression CI Pipeline**
Why: Give the team - and specifically the partner, in her actual professional domain - a real regression-testing safety net for prompt/tool-config changes, the difference between "we think it still works" and "we know it still works."
Key outcomes: A curated fixture corpus of 10-20 real audio clips (clean/noisy/accented/interrupted) with ground-truth transcripts and expected tool-calls; a scoring harness producing WER, tool-call-correctness, and latency numbers per run; a GitHub Actions job that fails the build on regression past a set threshold, demonstrated on at least one deliberately-introduced regression.

**6. Adversarial Voice-Agent Eval Generator**
Why: Stress-test the full STT-to-LLM-to-TTS pipeline against acoustic failure modes (not just text-only LLM evals), closing a real gap in how voice agents typically get tested.
Key outcomes: A fixed rule-set of 5-10 behavioral constraints; LLM-generated adversarial prompts synthesized to speech and run through the real Voice Agent API; an automated judge verdict per case, with a human-reviewed accuracy check on at least 10 judged cases (does the judge's pass/fail match a human's).

**7. Voice-Agent Session Replay & Diff Debugger**
Why: Fill a documented, confirmed gap - no built-in session logging or transcript export for the Voice Agent API - with a real developer tool, not just a nice-to-have log viewer.
Key outcomes: A structured session recorder capturing every WebSocket message (audio, transcript, tool calls, timestamps) for real sessions; a working diff view comparing two sessions (e.g. prompt v1 vs v2 against the same test audio) with turn-alignment logic that handles sessions that aren't 1:1 aligned; at least one real "here's exactly what this prompt change did" comparison run and captured as a demo artifact.

**8. Latency Budget Profiler**
Why: Turn AssemblyAI's marketing-aggregate "~1s end-to-end" claim into a real, inspectable per-stage breakdown developers can actually act on.
Key outcomes: Per-stage instrumentation (mic buffering, network send, STT partial-to-final, tool-call round-trip, TTS generation, playback buffering) on a real Voice Agent API integration; a flame-graph-style visualization of at least one real turn's latency budget; identification of the single largest latency contributor from real measured data, not assumption.

## Synthesis: partner fit + completion likelihood + nerd factor

Captain has reassessed that the round-1 real-estate idea (R1#1) is a poor motivational fit for the partner - a voice-AI QA engineer at xAI - despite its Very High completion likelihood. Two candidate directions are on the table: round 2's QA/infra cluster (#5 CI, #6 adversarial eval, #7 session replay) versus #2 (MFCC speaker re-ID) as a pure-DSP-novelty pick.

Laid against the three axes:

| Idea | Completion likelihood | Nerd factor (round 2's own ranking) | Partner fit (voice-AI QA at xAI) |
|---|---|---|---|
| R2#5 CI Pipeline | Very High | Moderate-high (round 2 ranked it #4 of 8) | **Direct hit** - this is literally her day job's tooling category |
| R2#7 Session Replay/Diff Debugger | High | High (round 2 ranked it #3 of 8) | **Direct hit** - "git diff for voice agent behavior" is a QA-engineer's tool by construction |
| R2#6 Adversarial Eval Generator | Medium-High | Not separately ranked (bundled in the infra suite) | **Direct hit** - adversarial/red-team eval generation is squarely voice-AI QA work |
| R2#2 MFCC Speaker Re-ID | Medium | Highest (round 2 ranked it #1 of 8) | Weak - it's DSP novelty, not QA/infra; doesn't touch her actual professional domain |

The completion-likelihood pass changes the calculus in the QA/infra cluster's favor on more than just "it fits her job": #5 and #7 are now the two single highest-completion-likelihood ideas across *both* rounds, precisely because their bottlenecks (standard WER/CI patterns, standard sequence-alignment diffing) are the kind AI-assisted coding collapses cleanest. #2, by contrast, keeps its Medium rating specifically because its bottleneck - real-audio threshold tuning - is exactly the kind of work that doesn't get faster no matter who's typing. So the fit argument and the completion-likelihood argument now point the same direction, rather than trading off against each other.

## Final recommendation

**Build R2#5 (Voice Agent Regression CI Pipeline) and R2#7 (Session Replay & Diff Debugger) together as the hackathon centerpiece.** Round 2's original report already noted these two share session-capture infrastructure and form a natural pair ("we didn't just build a voice agent, we built its dev tools") - that framing gets stronger now: both independently carry the highest completion likelihood on either list, both land squarely in the partner's actual professional domain (voice-AI QA/infra, not DSP-for-its-own-sake), and together they cover both the "does this still work" (CI) and "what exactly changed" (diff debugger) halves of a real QA workflow. This is the safest bet against the 30-day clock while still being a technically real build (WER scoring, protocol-level WebSocket instrumentation, sequence-alignment diffing) - not a demo gimmick.

**If time remains, add R2#6 (Adversarial Eval Generator) as a stretch third leg.** It shares the same session infrastructure, deepens the QA story (regression testing plus adversarial testing plus replay debugging is a complete eval-tooling narrative), and its Medium-High rather than Very High completion likelihood is an acceptable risk only once #5/#7 are already banked - not as a starting bet.

**Drop R2#2 (MFCC Speaker Re-ID) as the primary pick**, despite its higher nerd-factor ranking. Its own scoping note admits the real gate is real-audio threshold tuning against enrolled voices - a bottleneck AI-assisted coding does not shrink - and it doesn't touch the partner's actual QA/infra domain the way the round-2 infra cluster does. It remains a reasonable "if the team specifically wants pure DSP novelty over domain fit" fallback, but the fit and the completion-likelihood analysis now agree it's the weaker bet, not just a different flavor of good.

**Avoid entirely for this cycle:** R1#7 (privacy-gated) and R1#9 (research-uncertainty-gated) - the AI-coding shift changes nothing about why these were already the two lowest-confidence ideas across both rounds.
