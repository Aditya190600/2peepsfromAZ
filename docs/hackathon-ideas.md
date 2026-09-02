# AssemblyAI Voice Agent Hackathon — Idea Report

Scout task, 2026-09-01. No code changes, no PR — this is a research/ideation deliverable per the brief.

## What I did

1. Fetched AssemblyAI docs directly (WebFetch, not memory) to ground every idea in real, current API capability:
   - `assemblyai.com/docs` (product index)
   - `assemblyai.com/docs/speech-to-text/universal-streaming` (streaming API)
   - `assemblyai.com/docs/audio-intelligence` (batch "Speech Understanding" features)
   - `assemblyai.com/docs/speech-to-text/speaker-diarization`
   - Web search on their Voice Agent API / LeMUR / LLM Gateway (2026 state)
2. Cross-checked captain's other named projects (chief-of-staff, sabhalog, closepilot, chipspeak, make-in-america, teacher-recruiting, holguin-home-games) for cross-pollination fit. I did not have direct registry access beyond the names given in the brief, so cross-pollination notes below are based on the one-line descriptions provided, not a deep read of those repos.

## AssemblyAI capability summary (verified from docs, Sept 2026)

**Streaming (real-time) API:**
- Partial + finalized transcripts; `end_of_turn: true` marks a finalized turn (built-in turn detection at natural pauses).
- Word-level timestamps + per-word confidence.
- Sessions stay open up to 3 hours.
- Accepts AAC, Opus (Ogg/raw), mono 16-bit PCM.
- **No speaker diarization in streaming mode** — diarization is batch-only.

**Batch/pre-recorded "Speech Understanding" (Audio Intelligence) API:**
- Speaker diarization: up to 10 speakers (2-10 min audio) or 30 speakers (>10 min); `speakers_expected` / min/max controls; needs ~30s of speech per speaker for good accuracy; returns an `utterances` array with speaker labels, timestamps, confidence, word-level speaker attribution.
- Sentiment analysis (per sentence), entity detection, topic detection (IAB taxonomy), summarization, auto chapters, action items, key phrases, custom formatting, translation.

**Voice Agent API:** single connection bundling STT + LLM routing + TTS for real-time conversational agents, built on Universal-3.5 Pro, ~1s end-to-end latency claimed.

**LLM Gateway / LeMUR:** apply LLMs directly to transcripts/spoken context (summarize, extract, chat-complete over audio-derived data) — this is the piece that lets you do structured reasoning over what was said, in both async and real-time flows.

**Scale claims (marketing, not independently verified):** 99+ languages, ~94% word accuracy (Universal-3 Pro), 2M hours/day processed across customers like Zoom/Runway.

**Implication for idea design:** real-time streaming gives you turn-boundaries, word timing, and confidence — but NOT diarization or audio-intelligence features live. Anything needing diarization/sentiment/entities either runs on short recorded segments processed near-real-time (a "rolling batch" pattern), or is post-hoc. The Voice Agent API is the only piece that gets you true low-latency two-way voice conversation.

---

## Ideas

### 1. Real Estate Voice Status Radar (closepilot prototype)
**Concept:** Call in (or open a mic session) and ask "what's the status of the Smith escrow?" — a Voice Agent API session (STT + LLM + TTS) answers by calling function-calling tools against a structured deal dataset, live, voice-to-voice.
**Why unconventional:** Not dictation — the voice is the query interface into structured data, and the output is spoken synthesis, not a transcript.
**Buildable in hackathon scope:** Yes — Voice Agent API is designed exactly for this (STT/LLM/TTS bundled), function calling over a small mock dataset is a day or two of work.
**Reuse:** Direct — this is literally the deferred closepilot "voice status query" feature. Also generalizes into a standalone "ask your database out loud" voice-agent kit (any founder with structured data + function-calling could reuse it) — so it's both a closepilot prototype AND a standalone library.
**Cross-pollination:** Closepilot (direct validation of a real deferred feature — lowest-stakes way to de-risk it before building in the main product).

### 2. Interruption / Airtime Fairness Coach
**Concept:** Live multi-mic (or multi-track) call — streaming API turn-detection timestamps compute talk-time balance, interruption counts, and response-latency per speaker in real time; nudges surface live ("you've talked 80% of the last 5 min").
**Why unconventional:** Uses turn-boundary data as a social-dynamics instrument, not a transcript product. No LLM even strictly required for v1 — just streaming turn timing math.
**Buildable in hackathon scope:** Very — cheapest idea on this list. Streaming API alone gets you 80% of it.
**Reuse:** High — friend-testable immediately on any team call, podcast recording, debate practice, panel prep. Real "keep using it" candidate since it needs zero setup beyond a mic.
**Cross-pollination:** Could feed sabhalog rehearsal feedback (who's dominating a scene rehearsal) or general team-health tooling. Stays useful fully standalone too.

### 3. Verbal Code-Review Companion
**Concept:** Engineer talks through a PR out loud ("I handled the null case on line 42..."); streaming transcript + LeMUR cross-references the spoken claim against the actual diff (fed as context) and flags claims not supported by the code.
**Why unconventional:** Voice as a verification signal against code, not voice-to-code dictation.
**Buildable in hackathon scope:** Moderate — needs diff-ingestion + LeMUR prompt design, but no diarization/audio-intelligence needed.
**Reuse:** Personal daily-driver potential for captain himself (he reviews code regularly) — highest "will I actually keep using this" score of any idea here. Friend-testable for any dev.
**Cross-pollination:** Fully standalone; loosely could plug into chief-of-staff's agent-dispatcher workflows later.

### 4. Hesitation / Confidence-Latency Interview Coach
**Concept:** Mock interview practice tool. Uses word timestamps + turn detection to measure micro-pause latency before answering hard questions and filler-word density — outputs a "confidence latency" trend, not a transcript grade.
**Why unconventional:** Measures *how* someone answers (timing/hesitation), not *what* they said — orthogonal to existing interview-prep transcript tools.
**Buildable in hackathon scope:** Yes — streaming API + simple timing analysis; LeMUR optional for question-difficulty tagging.
**Reuse:** Friend-testable for anyone interview-prepping; direct fit for teacher-recruiting (candidate interview prep) as a pluggable module, not a bolted-on feature.
**Cross-pollination:** teacher-recruiting (candidate prep tool); reusable standalone for any interview-prep use case.

### 5. Rehearsal Pacing & Cue-Drop Coach (sabhalog)
**Concept:** Performer rehearses lines/songs; live transcript matched against the script flags dropped/mis-said lines and tracks pacing vs. target runtime; post-take diarization identifies who's over-talking or blowing cues in ensemble scenes.
**Buildable in hackathon scope:** Moderate — needs script-matching logic (fuzzy string match against streaming transcript) plus a batch diarization pass per take.
**Reuse:** Friend-testable directly with performing-arts groups sabhalog already serves; a plausible future sabhalog add-on (rehearsal analytics), but works as a fully standalone rehearsal tool with no sabhalog dependency.
**Cross-pollination:** sabhalog (direct audience fit, optional future feature).

### 6. Two-Agent Compressed Voice Protocol (elevated version of captain's own seed)
**Concept:** Two Voice Agent API sessions talk to each other, but instead of full natural-language TTS/STT round-trips, they exchange a compact structured intermediate (JSON/function-call payloads over the LLM Gateway) — then benchmark latency/cost against a naive full-voice baseline.
**Why unconventional:** Turns his own seed idea into an actual measurable artifact (a benchmark harness) instead of a demo gimmick.
**Buildable in hackathon scope:** Moderate-high — building two agents plus a clean A/B benchmark harness is real engineering work, but scoped and testable.
**Reuse:** Open-source benchmark/library for anyone building multi-agent voice systems; startup-seed-adjacent only if multi-agent voice protocols become a real niche (speculative).
**Cross-pollination:** None direct — deliberately fully standalone; good "just for fun / genuinely novel" pick if the team wants max unconventionality over max reuse.

### 7. Household Ambient Activity Log — utility-solved version of his ambient-sound seed
**Concept:** Passive background listener (like the captain's own species-soundmap seed, but solved for utility): builds a longitudinal household activity signal — e.g., "kids arguing spike at 4pm", "unusually quiet 3 hours" — for elder-care or parental check-in use, using diarization + audio intelligence on rolling recorded windows.
**Why unconventional:** Directly answers the captain's own caveat ("I want to see how this can be used to create something useful") by picking a longitudinal-care use case instead of restating the ambient-soundmap concept.
**Buildable in hackathon scope:** Risky — needs careful consent/privacy framing (always-on listening) that a hackathon timeline won't fully solve; flagging this explicitly as the idea with the highest non-technical risk on this list.
**Reuse:** Real product-shaped, but only with real privacy engineering beyond hackathon scope — best treated as a "cool demo, not a keeper" unless the team is prepared to take consent/security seriously post-hackathon.
**Cross-pollination:** None of the named projects — fully standalone, and arguably should stay a demo rather than become a personal tool given the privacy surface.

### 8. Longitudinal Team-Health Radar (mood analysis done right)
**Concept:** Weekly standup/retro recordings run through batch sentiment + entity detection; tracks morale *trend per person over time*, not a single-call mood score.
**Why unconventional:** The generic version of this ("mood analyzer") is exactly what captain said to avoid — the differentiator here is longitudinal trend detection across recurring meetings, which requires actual data-pipeline thinking (storing/comparing scores over weeks), not just calling the sentiment endpoint once.
**Buildable in hackathon scope:** Moderate — need a small persistence layer plus a trend visualization, on top of the sentiment API call itself.
**Reuse:** Friend-testable for any small team running recurring standups; loose fit for make-in-america's ops cadence.
**Cross-pollination:** make-in-america (team ops); otherwise standalone.

### 9. Personality-Adapted Concept Tutor as a pluggable library (not a canned bot)
**Concept:** Ship this as a reusable "adaptive voice tutor" library: the agent infers a learner's expertise level in real time from jargon usage, hesitation, and question phrasing (via turn-detection + LeMUR), and adapts explanation depth — with the curriculum content itself pluggable, so chipspeak or teacher-recruiting could drop in their own subject matter.
**Why unconventional:** The differentiator vs. the generic seed idea is architectural — building it as a content-agnostic adapter library rather than one hardcoded tutor bot.
**Buildable in hackathon scope:** Ambitious for 2 people in a month if done properly (the "infer expertise from speech patterns" piece is genuinely hard to get right) — treat as a stretch idea.
**Reuse:** Startup-seed potential if the adapter pattern works; direct plug points into chipspeak (chip-design tutoring) and teacher-recruiting (onboarding/training).
**Cross-pollination:** chipspeak, teacher-recruiting.

### 10. Voice-Driven Design Rubber Duck (chipspeak)
**Concept:** Engineer thinks out loud about an RTL/chip-design problem; the agent uses turn detection + LeMUR to extract structured design decisions and action items, and interjects domain-specific clarifying prompts back via TTS mid-thought — a domain-specific voice pair-programming rubber duck.
**Why unconventional:** Domain-specific reasoning loop, not generic note-taking; the value is in the interjection logic (knowing when to speak up), not transcription.
**Buildable in hackathon scope:** Moderate — needs decent chip-design domain prompting in LeMUR, but the mechanics (Voice Agent API + interject-on-pause) are within scope.
**Reuse:** Direct feed into chipspeak; also standalone as a "voice rubber duck for any technical domain" if the domain-prompting layer is kept swappable.
**Cross-pollination:** chipspeak (direct).

### 11. Reasoning-Timeline Debugger ("talk to your terminal")
**Concept:** Speak your bug-hypothesis reasoning out loud while working in the terminal; the agent transcribes the reasoning stream and correlates timestamps against your shell/git history to produce a "why this fix worked/didn't" replay/audit trail.
**Why unconventional:** Voice becomes a debugging-session audit log, not a dictation input — output is a timeline artifact, not text you typed.
**Buildable in hackathon scope:** Moderate — streaming transcription is easy; the shell/git-history correlation logic is the real work.
**Reuse:** Personal tool for captain's own debugging sessions; loosely complements (not duplicates) chief-of-staff's offline transcription — this is the online, causally-correlated counterpart.
**Cross-pollination:** chief-of-staff (adjacent, not overlapping — chief-of-staff transcribes offline; this correlates real-time speech with terminal state).

### 12. Live Negotiation/Meeting Tension Tracker
**Concept:** During a live call, periodic short-window batch passes (sentiment + entity detection on rolling 20-30s chunks, since full audio intelligence isn't available in streaming) build a live "tension graph" per speaker, flagging sharp tone shifts — output is a graph/alert feed, not a transcript.
**Why unconventional:** Repurposes batch-only sentiment analysis into a faux-real-time signal via rolling windows — a genuine engineering trick worth learning, not just an API call.
**Buildable in hackathon scope:** Moderate — the rolling-window batching pattern is a good hands-on lesson in AssemblyAI's real-time/batch boundary.
**Reuse:** Personal tool for high-stakes calls (negotiations, 1:1s); friend-testable for sales/negotiation coaching; possible startup seed in negotiation-coaching software.
**Cross-pollination:** None of the named projects directly — standalone.

---

## Ranked recommendations

Given captain's stated goals — **hands-on real voice-AI feel, keep-using-it reuse, avoid generic ideas** — in order:

1. **#1 Real Estate Voice Status Radar.** This is the only idea that exercises AssemblyAI's actual Voice Agent API (STT+LLM+TTS bundled, real-time two-way conversation) rather than just streaming transcription — so it delivers the most authentic "built a voice agent" feel of anything on this list. It also directly de-risks a real, already-deferred closepilot feature at zero cost to the main product, and generalizes into a reusable "ask your database out loud" kit either of them could hand to other founders. Best combination of learning depth + genuine reuse + zero genericness (nobody pitches "voice status query over your own transaction data" at a hackathon).

2. **#3 Verbal Code-Review Companion.** Highest "I will actually use this again" score — captain reviews code regularly, and this is a tool for himself, not a demo for judges. Genuinely unconventional (voice as a verification signal against a diff, inverse of dictation) and moderate build effort.

3. **#2 Interruption/Airtime Fairness Coach.** Cheapest to build (streaming API alone), most immediately friend-testable (works on any call with zero setup), and a clean unconventional angle nobody else at the hackathon will likely pitch. Good hedge if #1 or #3 turn out harder than expected mid-hackathon.

4. **#4 Hesitation/Confidence-Latency Interview Coach.** Same technical footprint as #2 (turn detection + timing, no diarization needed) but pointed at a concrete audience (teacher-recruiting candidate prep) — worth pursuing if the team wants a cross-pollination story on top of the core build.

5. **#6 Two-Agent Compressed Voice Protocol.** If the team specifically wants to chase the "unconventional agent-to-agent" thread captain floated, do it as this elevated/benchmarked version rather than the raw seed idea — it produces a real measurable artifact instead of a demo gimmick, though it's the most standalone (no cross-pollination) and moderately harder to scope well in a month with two people.

**Avoid or treat as demo-only:** #7 (ambient household log) carries real privacy risk that a hackathon timeline can't responsibly close — fine as a stretch demo, not as "what we keep using." #9 (adaptive tutor library) is the most architecturally ambitious and best treated as a future project once the team has more voice-AI mileage, not a first hackathon build.
