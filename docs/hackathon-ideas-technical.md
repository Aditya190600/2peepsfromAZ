# AssemblyAI Voice Agent Hackathon - Round 2 Idea Report (Technical Depth)

Scout task, 2026-09-01. No code changes, no PR. Follow-up to `docs/hackathon-ideas.md` (round 1, 12 ideas, captain-reviewed). Captain asked for a second batch leaning harder technical: real DSP work, and voice-AI infra/tooling ideas, ranked this time by technical depth / "nerd factor" over reuse.

## What I did

1. Re-read round 1 (`docs/hackathon-ideas.md`) for the AssemblyAI capability baseline it already established.
2. Re-verified current API capability via WebFetch (not memory), focused on what round 1 didn't need to check - raw audio access, prosody/pitch fields, tool-calling/session details:
   - `assemblyai.com/docs/speech-to-text/universal-streaming`
   - `assemblyai.com/docs/audio-intelligence`
   - `assemblyai.com/docs/speech-to-text/pre-recorded-audio`
   - `assemblyai.com/products/voice-agent-api`
   - Web search: AssemblyAI Voice Agent API 2026 CI/CD testing eval webhook function calling latency
3. Same cross-pollination check against captain's named projects (chief-of-staff, sabhalog, closepilot, chipspeak, make-in-america, teacher-recruiting, holguin-home-games), same caveat as round 1 - descriptions only, no deep repo read.

## New capability findings (Sept 2026, this round)

- **Streaming audio format:** mono 16-bit PCM by default (configurable sample rate), also AAC and Opus (Ogg or raw packets). Session auto-closes at 3 hours; un-terminated sessions bill for full duration - a real footgun to test for in an infra/QA idea.
- **Raw audio is never returned to the client** - the API returns transcript/word data only, not audio streams back. Critically: **the raw PCM your app already captured from the mic before sending it to AssemblyAI is available to you the whole time** - this is the audio DSP ideas below actually operate on, run locally/client-side, in parallel with (not instead of) the AssemblyAI call. No re-fetching needed.
- **No pitch, prosody, or acoustic-feature fields anywhere in AssemblyAI's output** - streaming or batch. Word timestamps + confidence, per-word and per-utterance, is the ceiling of what they expose. This is a genuine, confirmed gap: anything about *how* something was said acoustically (pitch, energy, spectral shape, timbre) is 100% on you to extract from raw audio. That's exactly the opening for direction 1.
- **Audio Intelligence (batch) feature list, confirmed:** Action Items, Auto Chapters, Custom Formatting, Entity Detection, Key Phrases, Sentiment Analysis, Speaker ID/diarization, Summarization, Topic Detection (IAB), Translation. All operate on the transcript/text layer, not the acoustic signal - consistent with round 1's finding.
- **Voice Agent API:** single WebSocket (`wss://agents.assemblyai.com/v1/ws`), 24kHz PCM in/out, built on Universal-3.5 Pro, ~1s end-to-end latency, JSON Schema tool/function calling, built-in turn detection + interruption handling, 30s reconnect window, $4.50/hr flat. No built-in session logging/transcript-export or CI tooling documented - that gap is exactly what direction 2's ideas fill.

**Implication for idea design:** direction 1 (DSP) ideas must run their own signal processing on locally-captured raw PCM, alongside AssemblyAI calls, since AssemblyAI gives you zero acoustic features. Direction 2 (infra) ideas are building *around* the Voice Agent API's WebSocket/tool-calling surface, which has no native testing/observability tooling - so there's real unaddressed white space here, not a "wrap an existing dashboard" job.

---

## Direction 1: Signal-processing-driven ideas

### 1. Prosody-Aware Emphasis Overlay
**Concept:** Run pitch tracking (e.g. YIN or autocorrelation-based F0 estimation) and short-time energy on the raw mic PCM in parallel with the AssemblyAI streaming transcript. Align pitch/energy peaks to AssemblyAI's word timestamps to detect *emphasized* words (pitch/energy spikes relative to local baseline) - then render the transcript with real prosodic emphasis markup (bold/underline on stressed words), not just text.
**Why technically differentiated:** AssemblyAI gives you words and timing, never how they were said. Pitch tracking from raw samples (autocorrelation or YIN, ~50 lines of numpy/scipy) plus alignment logic to timestamps is real signal-processing engineering, and the output (prosody-annotated transcript) is something no off-the-shelf transcription tool produces.
**Buildable in hackathon scope:** Yes. YIN pitch tracking is a well-known, implementable-in-a-day algorithm (scipy has the building blocks: autocorrelation via FFT). Alignment to AssemblyAI's word `start`/`end` timestamps is straightforward once both signals exist.
**Reuse:** Personal tool for reviewing recorded talks/pitches (did I emphasize the right words?); friend-testable for anyone prepping a talk; could become a captioning-accessibility feature (emphasis-aware live captions) as a startup seed.
**Cross-pollination:** sabhalog (line-delivery coaching - which words a performer stresses matters for a song/monologue); teacher-recruiting (interview delivery coaching, complements round 1's #4 hesitation-latency idea with a pitch-based signal instead of a timing-only one).

### 2. Spectral Fingerprint Speaker Re-ID (works where diarization can't)
**Concept:** AssemblyAI's diarization is batch-only and needs ~30s of speech per speaker to converge. Build a lightweight MFCC-based speaker embedding (compute Mel-Frequency Cepstral Coefficients per short window via FFT + mel filterbank, cluster with a simple distance metric) that runs live on the raw streaming PCM to re-identify a *known* speaker (e.g., "is this Sujeev talking again?") in near-real-time, well before 30s of new speech accumulates, and even in streaming mode where AssemblyAI has no diarization at all.
**Why technically differentiated:** This is exactly the class of DSP AssemblyAI's own docs confirm is absent from streaming: implementing an MFCC pipeline (FFT -> mel filterbank -> DCT) and a matching/clustering step yourself is classic, real acoustic-fingerprinting engineering, and it plugs a real, documented AssemblyAI capability hole (no live diarization) rather than duplicating a feature they already offer.
**Buildable in hackathon scope:** Moderate. `librosa`/`scipy` give MFCC primitives; the real work is threshold-tuning and a simple online matching loop against a small enrolled-speaker set (2-4 people) - realistic for a two-person team in hackathon time if scoped to "does this match one of N enrolled voices," not open-set diarization.
**Reuse:** Personal tool - "auto-tag who's talking" for any household/team recording without waiting for batch diarization; friend-testable for podcast co-hosts; startup-seed adjacent (fast speaker-gating for voice UIs, e.g. "only respond when it's my voice").
**Cross-pollination:** holguin-home-games (household speaker gating - who's talking in a multiplayer voice game round without a per-mic setup) is the strongest fit; loosely complements round 1's #7 ambient-log idea but sidesteps its worst privacy risk since it only matches against *enrolled* voices, not open recognition of anyone.

### 3. Wavelet-Based Vocal Onset/Transient Coach
**Concept:** Use wavelet transform (e.g. continuous wavelet transform via `scipy.signal.cwt` or a Python `pywt` Mexican-hat/Morlet wavelet) on raw PCM to detect fast vocal onsets and transients - the sharp attack at the start of a plosive consonant or a vocal note - independent of AssemblyAI's word boundaries, which are optimized for language recognition, not acoustic sharpness. Use this to measure articulation crispness / attack consistency for singers or public speakers (a "soft start" on consonants is audible sloppiness that word-level timestamps don't reveal).
**Why technically differentiated:** Wavelets are the right tool specifically because they localize transients in time *and* frequency simultaneously - better than plain FFT for detecting a sharp onset. Implementing CWT-based onset detection is a genuinely different DSP technique from direction 1's pitch tracking (#1) and spectral fingerprinting (#2), showing the team isn't a one-trick pony with FFT.
**Buildable in hackathon scope:** Moderate. `pywt` or `scipy.signal.cwt` gives the transform; onset-detection logic (peak-picking on wavelet coefficient energy across scales) is a known, scoped algorithm - a solid weekend-to-few-days build.
**Reuse:** Friend-testable for singers/voice coaches practicing diction; personal tool for public-speaking practice (round 1's #4 already covers hesitation timing - this is the complementary "how crisp was each word's start" signal).
**Cross-pollination:** sabhalog (vocal technique coaching for performers is a very natural fit - articulation crispness is something real voice coaches care about); teacher-recruiting only loosely (public-speaking prep).

### 4. Cross-Correlation Echo/Feedback Diagnostics for Voice-Agent QA
**Concept:** When testing a Voice Agent API integration (own idea or round 1's #1), acoustic echo (agent's own TTS bleeding back into the mic input) is a real, hard-to-spot failure mode. Use cross-correlation (via `scipy.signal.correlate`, FFT-accelerated) between the agent's outgoing TTS audio buffer and the incoming mic PCM to detect and quantify echo/leakage automatically, flagging sessions where the agent is "hearing itself" - a concrete signal-processing QA tool, not a subjective "it sounded glitchy" bug report.
**Why technically differentiated:** Cross-correlation-based echo detection is standard telecom/audio-engineering DSP, applied here to a novel target (Voice Agent API session health) that has no existing tooling. It's a genuine bridge between direction 1 (DSP) and direction 2 (infra) - flagging it honestly as such rather than forcing it into one bucket.
**Buildable in hackathon scope:** Yes - straightforward if the team already has a Voice Agent API integration running (e.g. round 1's #1) to test against; cross-correlation itself is a few lines of scipy.
**Reuse:** Direct infra tool for whichever Voice Agent API idea the team ships - dogfoods immediately; reusable diagnostic library for anyone else building on the Voice Agent API.
**Cross-pollination:** closepilot (if #1 from round 1 gets built, this is its QA companion); otherwise standalone tooling.

**Honest scoping note on direction 1:** four ideas above cover pitch/prosody (autocorrelation/YIN), spectral fingerprinting (MFCC/FFT), transient detection (wavelets), and correlation-based diagnostics (cross-correlation) - four genuinely different DSP techniques, not one technique restated four times. We did not force wavelets or FFT into every idea; #2 could arguably use simpler spectral centroid tricks instead of full MFCC and still work, but MFCC is the standard, well-documented approach for speaker embedding and is the more defensible engineering choice.

---

## Direction 2: Voice-AI infrastructure/tooling ideas

### 5. Voice Agent Regression CI Pipeline
**Concept:** Captain's named example (a). Record a fixed corpus of test audio clips (mix of clean speech, noisy speech, accented speech, interruptions) and a fixed set of expected Voice Agent API tool-calls/responses. On every code change to prompt/tool config, replay the corpus through the Voice Agent API WebSocket, score transcription accuracy (word error rate vs. known ground truth), tool-call correctness (did the right function get called with the right args), and end-to-end latency - fail the build if any regress past a threshold.
**Why technically differentiated:** This isn't a UI wrapper - it's building an actual test harness against a raw WebSocket protocol (`wss://agents.assemblyai.com/v1/ws`, 24kHz PCM in/out per AssemblyAI's docs) with real audio fixtures, real latency measurement, and real pass/fail gating logic. That's systems/infra engineering, the kind of thing that demonstrates you understand the protocol, not just the product.
**Buildable in hackathon scope:** Moderate-high. Recording/curating a small but real fixture corpus (10-20 clips) plus a scoring harness (WER calc is a known algorithm - Levenshtein distance over words) and a simple CI runner (GitHub Actions job) is a solid 3-5 day build for two people.
**Reuse:** Directly reusable for any of the team's own Voice Agent API projects (round 1's #1, or this round's #4/#8) - dogfoods on day one; genuinely open-sourceable as a standalone tool since no comparable AssemblyAI-specific CI harness is documented to exist.
**Cross-pollination:** closepilot (gates the #1 voice-status-query feature before it ships); chief-of-staff (if it ever adds a voice interface, this is the safety net first).

### 6. Adversarial Voice-Agent Eval Generator
**Concept:** Captain's named example (b). Use an LLM to synthesize adversarial test prompts against a text description of the target voice agent's intended behavior (e.g. "never quote a price without confirming the deal ID"), then synthesize those prompts to speech (TTS), feed them through the Voice Agent API, and automatically judge (via LeMUR or a separate LLM judge) whether the agent's spoken response violated the stated constraint - stress-testing the full STT-to-LLM-to-TTS pipeline end to end, not just the LLM in isolation.
**Why technically differentiated:** The interesting engineering here is closing the loop - text adversarial prompt -> synthesized speech -> full voice pipeline -> transcribed response -> automated judgment - and specifically testing failure modes that only show up acoustically (does noisy/accented adversarial TTS input cause STT mis-hears that cascade into bad LLM answers), not failure modes visible from a pure text-only eval.
**Buildable in hackathon scope:** Moderate. Needs an LLM to generate adversarial prompts, a TTS step to synthesize them (could reuse AssemblyAI's own agent-side TTS or an external one), the Voice Agent API round-trip, and an LLM-judge scoring step - four real integration points, doable in hackathon time if scoped to a fixed small rule-set (5-10 constraints) rather than open-ended red-teaming.
**Reuse:** Companion tool to #5 (CI pipeline runs the fixed regression corpus; this generates *new* adversarial cases over time) - the two are naturally packaged together as a "voice agent test suite" toolkit; startup-seed potential given voice-agent eval tooling is a genuinely underserved market right now (per the eval-metrics research found this round).
**Cross-pollination:** Same as #5 - closepilot, chief-of-staff; also make-in-america if any ops voice-agent work happens there.

### 7. Voice-Agent Session Replay & Diff Debugger
**Concept:** Capture every Voice Agent API session (audio in/out, transcript, tool calls, timestamps, latency-per-turn) into a structured session log, then build a replay UI that lets a developer scrub through a past session turn-by-turn and diff two sessions (e.g. "prompt v1" vs "prompt v2" run against the same test audio) side by side - transcript diff, tool-call diff, latency diff - to see exactly what a prompt/config change actually changed in behavior.
**Why technically differentiated:** AssemblyAI's docs confirm there's no built-in session logging or transcript export for the Voice Agent API - this fills a real, documented gap. Building a WebSocket session recorder plus a structured diff view (not just eyeballing two transcripts) is real developer-tooling engineering: session serialization format, turn-alignment logic for the diff (sessions won't be perfectly turn-for-turn aligned if behavior changed), and a debugging UI.
**Buildable in hackathon scope:** Moderate. Session recording is straightforward (log every WebSocket message); the diff/alignment logic and UI are the real work - a scoped, single-corpus "compare two runs" view (not a general-purpose analytics platform) is realistic in hackathon time.
**Reuse:** Direct dev tool for whichever Voice Agent API idea ships; genuinely useful standalone as "git diff, but for voice agent behavior" - a distinctive, ownable positioning.
**Cross-pollination:** Pairs naturally with #5/#6 as the third leg of a "voice agent dev tooling" suite; chief-of-staff's agent-dispatcher work (round 1's #11 cross-pollination note) is a loose long-term fit if it ever runs voice sessions.

### 8. Latency Budget Profiler for Voice Agent Pipelines
**Concept:** Instrument a Voice Agent API integration to break down the ~1s end-to-end latency AssemblyAI advertises into its real per-stage components as observed in your own app - mic-capture buffering, network send, STT partial-to-final delay, LLM tool-call round-trip (if any), TTS generation, playback buffering - and produce a flame-graph-style latency budget per turn, so a developer can see *where* latency is actually going when a response feels slow, instead of treating the whole pipeline as a black box.
**Why technically differentiated:** This requires understanding and instrumenting the actual message/event sequence of the WebSocket protocol (partial results, `end_of_turn` markers, tool-call events, TTS audio chunks) to attribute latency correctly - protocol-level engineering, not a wrapper around a single "response time" metric.
**Buildable in hackathon scope:** Yes, if scoped to instrumenting one's own client code plus timestamping the known event types from the AssemblyAI docs (turn finalization, tool call, audio chunk arrival) - a few days of careful instrumentation plus a simple visualization.
**Reuse:** Direct diagnostic tool for any Voice Agent API build the team ships; standalone value as a general "where did my 1 second go" profiler for anyone integrating the API, since AssemblyAI's ~1s latency claim is a marketing aggregate, not a breakdown developers can currently see.
**Cross-pollination:** Same suite as #5/#6/#7; also directly useful for round 1's #6 (Two-Agent Compressed Voice Protocol) benchmark harness, since it's exactly the kind of stage-by-stage latency data that idea's A/B benchmark needs.

---

## Ranked recommendations for this batch

Ranked by technical depth and "cool nerd factor" specifically, per captain's ask for this round - not reuse potential (reuse notes above stand on their own).

1. **#2 Spectral Fingerprint Speaker Re-ID.** The single most technically striking idea here: implementing an actual MFCC pipeline (FFT -> mel filterbank -> DCT) from near-scratch and using it to solve a real, documented capability gap (no live diarization in streaming) is the clearest "we built real signal processing, not an API wrapper" demo on either list. Also has genuine reuse (holguin-home-games) without needing privacy-engineering baggage.

2. **#1 Prosody-Aware Emphasis Overlay.** Pitch tracking (YIN/autocorrelation) is classic, respected DSP, cleanly demoable (show a transcript with real emphasis markup nobody else's tool produces), and grounded in a confirmed gap (zero prosody in AssemblyAI's output). Second-highest nerd factor because pitch tracking is more familiar/expected than MFCC, but still genuinely hard to get robust.

3. **#7 Voice-Agent Session Replay & Diff Debugger.** The most interesting infra idea technically - protocol-level session capture plus non-trivial turn-alignment diff logic is real systems engineering, and it's the kind of tool that photographs well (a working "git diff for voice agents" demo is a strong hackathon visual).

4. **#5 Voice Agent Regression CI Pipeline.** Captain's own named example, elevated with real WER scoring and latency gating rather than a thin CI wrapper - solid engineering depth, slightly less flashy to demo live than #7 but arguably the most immediately useful of anything in this report.

5. **#3 Wavelet-Based Vocal Onset/Transient Coach.** Wavelets are the most "look what we know" technique on this list (CWT is a step up in sophistication from FFT-based pitch tracking), but the use case (articulation crispness) is narrower and harder to make a compelling demo out of in a short time - good if the team wants to specifically flex a wavelet-based technique for its own sake.

**Notably strong pairing, not ranked above:** #5+#6+#7+#8 form a coherent, fully self-consistent "voice-agent developer tooling suite" - if the team wants a broader technical-infra story rather than one single idea, building #5 and #7 together (regression gate + session diff debugger) covers both testing and debugging with shared session-capture infrastructure, and is a very demoable, very ownable positioning ("we didn't just build a voice agent, we built its dev tools").

**Treat as stretch/lower priority this round:** #4 and #8 are real and useful but are naturally *companion* tools to whichever primary idea (from either round) actually ships - build them only once a Voice Agent API integration exists to instrument/test, not as standalone hackathon centerpieces.
