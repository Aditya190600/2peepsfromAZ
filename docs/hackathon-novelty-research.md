# Hackathon Idea Novelty Research — Has Someone Already Built This?

Scout task, 2026-09-02. Real web search (WebSearch, real queries against the core mechanism of each idea, not the literal title) for all 20 ideas across `docs/hackathon-ideas.md` (round 1, 12 ideas) and `docs/hackathon-ideas-technical.md` (round 2, 8 ideas). Also committed to `docs/hackathon-novelty-research.md` in the 2peepsfromAZ repo and pushed to `main`.

Novelty scale used throughout: **High** (real search turned up nothing close) / **Medium** (adjacent or partial overlap exists) / **Low** (something very close, often shipped/commercial, already exists). Two separate questions are answered per idea where relevant: is the *underlying technique* well-known (expected, not itself a finding) vs. does the *exact product/tool* already exist (the damaging finding if true).

---

## The triggering question: "have people already done the git-diff thing?" (R2#7)

**Direct answer: yes, closely — a well-funded commercial product already does almost exactly this for voice agents specifically, and the general pattern (session replay + diff two runs of an agent) is a mature, multi-vendor category for LLM agents broadly.**

R2#7, Voice-Agent Session Replay & Diff Debugger, proposes: capture every Voice Agent API session (audio, transcript, tool calls, timestamps, latency-per-turn) into a structured log, then build a replay UI that diffs two sessions (e.g. prompt v1 vs v2 against the same test audio) side by side — transcript diff, tool-call diff, latency diff.

What's already out there:

- **Hamming AI** (hamming.ai) is the closest match, and it is not adjacent — it is essentially the same product, shipped, for voice agents specifically. Confirmed via their own docs/marketing: "replay any test call from your dashboard, listen to the full conversation, review the transcript, and examine turn-by-turn metrics"; "Scenario Rerun" replays real calls against new agent versions with one click; Hamming "automatically associates calls with model and prompt versions so teams can compare intent accuracy, latency percentiles, and compliance behavior side by side." That is transcript + latency + version diffing, on voice-agent sessions, as a commercial SaaS feature today.
- **Cekura AI** (cekura.ai) ships adjacent functionality — regression suites that run the same scenario against different agent versions, CI/GitHub-triggered, with per-run scoring and diff review of proposed scoring-logic changes.
- Outside the voice-specific space, **session replay + trace diffing for LLM/agent systems generally** is a mature, multi-vendor category: LangSmith (tag runs, compare traces, node-by-node state diffs, replay against new models), Langfuse, Braintrust, Arize Phoenix, AgentOps ("time-travel debugging" — replay a session and inspect the sequence that led to a failure), Helicone, Galileo.
- **ctxdiff** (github.com/salmanzafar949/ctxdiff) is a small open-source tool literally pitched as "git diff for your agent's context window... turn by turn, block by block" — same framing, text-agent context rather than voice sessions specifically.

**Novelty rating: Low.** The underlying techniques (session logging, trace replay, side-by-side run comparison) are standard practice across the whole LLM-agent-tooling industry, and the *exact product* — replay + version-to-version diff (transcript/latency/tool-calls) specifically for voice agent sessions — already exists and is commercially shipped (Hamming AI), not merely a nearby technique. This is the single most damaging finding of the whole pass: it isn't "someone built something similar," it's "a funded startup's core feature is this."

**What would still be worth pursuing, if the team wants to keep this thread:**
- Target AssemblyAI's Voice Agent API specifically. Hamming/Cekura are agent-platform-agnostic (LiveKit, Retell, Vapi, etc.) and there's no evidence either has a purpose-built integration against AssemblyAI's `wss://agents.assemblyai.com/v1/ws` protocol — a fast, free, open-source tool scoped narrowly to that one WebSocket protocol is a real (if narrow) gap, and "we built the missing dev tool for the API we're hacking on" is still a legitimate, honest hackathon story.
- Open-source and self-hosted vs. Hamming's commercial SaaS is a real differentiator for a hackathon audience, even if it doesn't change the underlying novelty math.
- Do **not** pitch this as "nobody's built session diffing for voice agents" — that claim is false and checkable live during judging. If pursued, the honest framing is "a scoped, protocol-specific, open-source companion tool," not a novel category.
- Given this finding, **R2#5 (Regression CI Pipeline)** — the team's other centerpiece-adjacent pick — has the *same* problem (see below): both Hamming and Cekura already ship this. The pairing "we built the missing dev tools" loses force when both halves of the pairing are already commercial features elsewhere.

---

## Round 1 (`docs/hackathon-ideas.md`)

### 1. Real Estate Voice Status Radar (closepilot)
**Found:** A large, commoditized market of real-estate voice AI agents (Retell AI, CloudTalk, Aloware, ContactSwing, GoodCall) doing lead qualification, scheduling, and CRM sync via voice + function calling. None of the found products specifically do "ask an existing deal record a status question out loud, live" — they're lead-gen/scheduling bots, not a status-query interface over your own structured data.
**Closeness:** Adjacent-but-different. The pattern (voice agent + function calling + CRM) is a solved, commodity category; the specific "ask your own database out loud for a status answer" framing wasn't found as a shipped product.
**Novelty: Medium.** Technique is commodity; the specific product framing appears unbuilt, but it's a thin reskin of an extremely crowded space.

### 2. Interruption / Airtime Fairness Coach
**Found:** **Equal Time** (Zoom/Google Workspace marketplace app) explicitly tracks real-time per-speaker talk time for meeting fairness with AI summaries; a Zoom "Participation & Speaking Time Tracker" marketplace app does the same.
**Closeness:** Exact overlap on the core mechanism (live per-speaker talk-time tracking for fairness). Interruption-specific counting and live nudge alerts weren't confirmed present in Equal Time, but the central premise is directly covered by a shipped product.
**Novelty: Low.** Already exists as a shipped, marketplace-listed product.

### 3. Verbal Code-Review Companion
**Found:** AI code-review tools (CodeRabbit, PR-Agent, Greptile, Diffity) all review diffs via text/LLM with no voice input. No tool combining voice input with fact-checking spoken claims against the actual diff was found.
**Closeness:** Nothing close found — the pieces (AI diff review, STT/voice dictation) exist separately but not combined this way.
**Novelty: High.** Both underlying techniques (LLM diff review, STT) are standard; the combined product does not appear to exist.

### 4. Hesitation / Confidence-Latency Interview Coach
**Found:** Dense, mature space — **LockedIn AI** (real-time pacing/tone/pause coaching, 116ms feedback), **Yoodli** (filler word + pacing + hesitation analytics), **Google Interview Warmup**, **Auto Interview AI** (WPM + filler-word frequency), **Huru** (explicitly targets "moments of hesitation").
**Closeness:** Exact overlap — multiple shipped commercial tools already measure hesitation/pause timing plus filler-word density for interview coaching, essentially the stated mechanism.
**Novelty: Low.** The "trend over time, not a single grade" framing is a possible differentiator but wasn't confirmed absent from these tools, several of which already emphasize trends.

### 5. Rehearsal Pacing & Cue-Drop Coach (sabhalog)
**Found:** **StageLine** does fuzzy-matched live cue detection against a script (19 languages, handles ad-libs). **RehearseNow** and **ActOnCue** do live line-tracking/cueing. **Cue** (ColdRead) has a live pacing indicator that warns when reading speed drifts from target — nearly identical to the pacing-vs-target-runtime piece. No product found adds post-take diarization for ensemble "who's over-talking/blowing cues" analysis.
**Closeness:** Exact overlap on solo line-tracking + pacing; nothing found on the ensemble-diarization layer.
**Novelty: Low-Medium.** Solo mechanic is shipped in consumer apps already; the ensemble/diarization angle is the only unclaimed part.

### 6. Two-Agent Compressed Voice Protocol
**Found:** No product or benchmark doing exactly this. Adjacent academic work: a structured agent-communication protocol paper (LACP, arXiv 2510.13821) benchmarks payload/latency vs. a REST baseline for text/API agents; AgentComm-Bench (arXiv 2603.20285) stress-tests compressed communication for embodied/robotics agents under network impairment — different domain. MCP is the general structured-tool-call standard but isn't a voice-vs-structured A/B benchmark either.
**Closeness:** Adjacent-but-different only.
**Novelty: High.** Nothing close to "two voice agents A/B benchmarked voice-mode vs. structured-shortcut mode" was found anywhere.

### 7. Household Ambient Activity Log
**Found:** Substantial, close prior art. **Sensi.AI** is a commercial product using passive home audio sensors for elder daily-activity/well-being monitoring. **DESAMO** (arXiv 2508.18918) is passive audio-LLM monitoring for elder-friendly smart homes. Multiple academic systems build longitudinal acoustic activity/ADL recognition with activity heatmaps over months — very close to the proposed "kids arguing spike at 4pm" longitudinal signal.
**Closeness:** Exact overlap on the core mechanism (passive diarization + longitudinal acoustic-event trend, elder-care framing); Sensi.AI is a shipping commercial product doing essentially this.
**Novelty: Low.** Both the technique (diarization + audio-event classification) and the specific product concept (passive longitudinal home audio monitoring for elder/family care) already exist commercially — this reinforces round 1's own flag that this idea carries privacy risk without much novelty upside to offset it.

### 8. Longitudinal Team-Health Radar
**Found:** General employee-sentiment-over-time tools exist (Culture Amp, Enculture AI) but are survey/chat-based, not meeting-recording-based. Meeting-specific: **Read AI** tracks sentiment/engagement automatically across every standup, audio-meeting-native and cross-meeting; **Sup** and Geekbot offer standup mood tracking (mostly text-standup-bot based).
**Closeness:** Adjacent-but-different — audio-meeting sentiment tracking over time exists (Read AI) but per-person longitudinal trend specifically from recurring recorded standups (vs. per-meeting scores) isn't confirmed as a distinct shipped feature.
**Novelty: Medium.**

### 9. Personality-Adapted Concept Tutor (pluggable library)
**Found:** Adaptive AI tutoring is a large, mature category (Engageli, Estha, YoLearn, Cognispark, multiple ITS literature reviews) — adapting pace/difficulty/vocabulary is well established. No product found specifically infers expertise from jargon usage + hesitation + question phrasing in real-time voice, and none is packaged as a content-agnostic pluggable adapter library.
**Closeness:** Adjacent-but-different — the goal (adaptive depth) is common; the specific inference mechanism and library architecture were not found built.
**Novelty: Medium.** Adaptive difficulty/pacing itself is well-known; "infer expertise from hesitation + jargon speech signals" specifically is not a found shipped technique.

### 10. Voice-Driven Design Rubber Duck (chipspeak)
**Found:** Close overlap on the general mechanism. **DUCK-E** (github.com/jedarden/duck-e) is an OpenAI Realtime API voice assistant that actively listens and interjects with clarifying questions while you talk through code — explicitly built as "rubber duck that talks back." **rubber-duckie** (MrJanHorak) does STT/TTS + local LLM rubber-duck interjection too.
**Closeness:** Exact overlap on the core interaction pattern (voice rubber duck that interjects with clarifying questions) — this exists and is open-source. No chip-design/RTL-specific version found.
**Novelty: Medium.** The interaction loop already exists and is open-sourced; the chip-design domain layer (structured decision/action-item extraction, RTL-specific prompting) is the only real differentiator left.

### 11. Reasoning-Timeline Debugger ("talk to your terminal")
**Found:** Voice-to-terminal input tools are common (Claude Code voice mode, `claude-voice`, "AI Bash," speech-to-console tools) — these transcribe speech into terminal commands/prompts. None found correlates spoken-reasoning timestamps against shell/git history to produce a "why this fix worked/didn't" causal audit trail or replay.
**Closeness:** Adjacent-but-different — voice-into-terminal input is solved; the timestamp-correlated reasoning/git audit-trail artifact is not.
**Novelty: High** for the specific artifact (the correlation + replay/audit trail); the underlying speech-to-terminal input piece is a solved, common technique.

### 12. Live Negotiation / Meeting Tension Tracker
**Found:** Strong existing category. **Balto** does real-time call coaching with sentiment/emotional-shift flagging; **Dialpad** does live sentiment analysis with alerts on sentiment dips; **Gong** does topic-level sentiment tracking of emotional shifts and deal-health scoring.
**Closeness:** Exact overlap at the product-concept level — multiple commercial tools already do live sentiment-shift alerting on calls, especially in sales/negotiation contexts. The "per-speaker tension graph" framing and the rolling-window implementation trick are thinner differentiators.
**Novelty: Low.** Close existing commercial products: Gong, Balto, Dialpad.

---

## Round 2 (`docs/hackathon-ideas-technical.md`)

### Direction 1 — DSP ideas

For all four DSP ideas: pitch tracking (YIN/autocorrelation), MFCC, wavelets, and cross-correlation are textbook-standard techniques with mature libraries (scipy, librosa, pywt) — finding them broadly in search is expected and is *not* itself a novelty problem. The real question, answered separately below, is whether the specific applied product already exists.

**1. Prosody-Aware Emphasis Overlay** — Found only academic tools/papers: Prosograph (open-source prosody visualization, word-level pitch alignment), AutoProsody, StressTransfer, word-level TTS prosody-markup papers (Interspeech 2024). No consumer "live transcript with bold/underlined emphasized words" product found. **Novelty: Medium-High** — technique is well-studied in research, no shipped product does this specific live-transcript overlay.

**2. Spectral Fingerprint Speaker Re-ID** — Found close-to-exact overlap: **Picovoice Eagle Speaker Recognition** is an on-device, real-time enrolled-speaker verification product explicitly built for "verify speaker fast enough for a wake word." **openWakeWord** (open-source) supports per-user custom verifier models as a second-stage filter; a GitHub repo (`frymanofer/Python_WakeWordDetection`) explicitly combines wake-word + speaker verification + enrollment. **Novelty: Low** at the product level — "fast enrolled-speaker gating without waiting for full diarization" is already commercial (Eagle) and open-source (openWakeWord) solved territory. The DIY MFCC pipeline remains a legitimate personal learning exercise, just not a novel product.

**3. Wavelet-Based Vocal Onset/Transient Coach** — Found only academic papers in unrelated domains (wavelet-packet VAD, Morse-wavelet voice liveness detection, DWT singer identification, chirp-group-delay onset detection for instruments) — none targeting vocal consonant-attack/articulation coaching. Generic vocal-coaching apps exist but with no evidence of wavelet-based transient analysis. **Novelty: High** — no applied product doing wavelet-based articulation-crispness coaching was found.

**4. Cross-Correlation Echo/Feedback Diagnostics for Voice-Agent QA** — Cross-correlation-based echo/double-talk detection is a mature, decades-old, patented telecom/AEC technique built into telephony and WebRTC stacks. No evidence found of this specifically packaged as a voice-agent QA/CI tool (i.e., a diagnostic flagging "this Voice Agent API session heard itself"). **Novelty: Medium** — expect a knowledgeable judge to note "this is standard echo cancellation," but no exact "voice-agent echo QA tool" product was found; the QA-tool framing for LLM voice agents specifically is the (narrow) unclaimed part.

### Direction 2 — Infra/tooling ideas

**5. Voice Agent Regression CI Pipeline** — Found exact overlap: **Hamming AI** ("Voice Agent Testing in CI/CD," CI/CD gating that blocks merges on regression) and **Cekura AI** ("Automated Recurring Voice Agent Tests" — scheduled/CI-triggered regression suites, tool-call capture of name/args/result/latency, GitHub integration) both ship this near-exactly: fixed scenario corpora replayed on every prompt/model/infra change, WER + tool-call-correctness + latency scored, pass/fail gating. TestMu AI / LambdaTest publish the same pattern as a guide. **Novelty: Low.** This is a commercial product category today, not a novel mechanism — same finding as R2#7, and it's the same two vendors (Hamming, Cekura) covering both.

**6. Adversarial Voice-Agent Eval Generator** — No product/OSS project doing the specific closed loop (LLM generates adversarial prompt → TTS → full voice agent → LLM judges constraint violation) was found. Found instead: general LLM/agent adversarial-generation research for text agents (AdversaBench arXiv 2606.24589, SIRAJ arXiv 2510.26037, REDAgentBench arXiv 2608.10669), Braintrust's "turn adversarial testing into a regression suite" (text-domain), a futureagi.com blog on the *need* for voice-specific red-teaming (no built tool described), and GARAK (open-source LLM vulnerability scanner, text/API-level only, not voice). **Novelty: Medium-High.** The LLM-attacker/LLM-judge pattern is well-established for text agents; closing the loop through an actual TTS → voice agent → STT round trip specifically to catch acoustic-cascade failures (accented/noisy adversarial audio causing STT mis-hears that cascade into bad answers) appears to be real, unaddressed white space.

**8. Latency Budget Profiler for Voice Agent Pipelines** — Found abundant content on the *concept* of per-stage latency breakdown (LiveKit, Deepgram, Telnyx, Hamming, Cresta, Retell AI all publish latency-budget guidance), but no flame-graph-style per-turn visualization tool or named profiler product — existing tooling is dashboard/percentile-based (p50/p90 in Hamming/Cekura), not a stage-attributed flame graph per turn. **Novelty: Medium.** What to measure is well-known and widely discussed; the specific visualization tool (flame-graph per turn, protocol-level instrumentation against AssemblyAI's own event types) has no found existing implementation.

---

## Summary table

| # | Idea | Novelty | One-line finding |
|---|------|---------|-------------------|
| R1-1 | Real Estate Voice Status Radar | Medium | Voice+CRM agents are commodity; "ask your deal data out loud" framing itself not found as a shipped product. |
| R1-2 | Interruption/Airtime Fairness Coach | **Low** | Equal Time (Zoom/Workspace marketplace app) already does live per-speaker talk-time fairness tracking. |
| R1-3 | Verbal Code-Review Companion | **High** | No tool found combining voice input with fact-checking spoken claims against a diff. |
| R1-4 | Hesitation/Confidence-Latency Interview Coach | **Low** | Yoodli, LockedIn AI, Huru, Auto Interview AI already ship hesitation/pause + filler-word coaching. |
| R1-5 | Rehearsal Pacing & Cue-Drop Coach | Low-Medium | StageLine/Cue already do live script-matched line-tracking + pacing; ensemble diarization angle is unclaimed. |
| R1-6 | Two-Agent Compressed Voice Protocol | **High** | Nothing found doing a voice-vs-structured-shortcut A/B benchmark between two voice agents. |
| R1-7 | Household Ambient Activity Log | **Low** | Sensi.AI is a shipping commercial product doing passive longitudinal home-audio elder-care monitoring. |
| R1-8 | Longitudinal Team-Health Radar | Medium | Read AI does audio-meeting sentiment over time; per-person longitudinal trend from recurring standups specifically not confirmed as a distinct feature. |
| R1-9 | Personality-Adapted Concept Tutor | Medium | Adaptive tutoring is a mature category; the specific speech-based expertise-inference + adapter-library packaging not found. |
| R1-10 | Voice-Driven Design Rubber Duck | Medium | DUCK-E (OSS) already does voice rubber-duck-that-interjects; chip-design domain layer is the only gap. |
| R1-11 | Reasoning-Timeline Debugger | **High** | Voice-to-terminal input is common; timestamp-correlated reasoning/git audit-trail replay not found anywhere. |
| R1-12 | Live Negotiation/Meeting Tension Tracker | **Low** | Gong, Balto, Dialpad already do live call sentiment-shift alerting, including sales/negotiation contexts. |
| R2-1 | Prosody-Aware Emphasis Overlay | Medium-High | Research tools only (Prosograph, AutoProsody); no shipped live-transcript emphasis-overlay product. |
| R2-2 | Spectral Fingerprint Speaker Re-ID | **Low** | Picovoice Eagle + openWakeWord already do real-time enrolled-speaker verification/gating commercially and open-source. |
| R2-3 | Wavelet-Based Vocal Onset/Transient Coach | **High** | No applied product found doing wavelet-based articulation-crispness coaching. |
| R2-4 | Cross-Correlation Echo Diagnostics for Voice-Agent QA | Medium | Echo detection via cross-correlation is standard/patented AEC tech; no exact "voice-agent QA tool" framing found. |
| R2-5 | Voice Agent Regression CI Pipeline | **Low** | Hamming AI and Cekura AI already ship this near-exactly (WER + tool-call + latency gating in CI). |
| R2-6 | Adversarial Voice-Agent Eval Generator | Medium-High | Text-agent red-teaming (LLM attacker + LLM judge) is established; the full TTS→voice-agent→STT closed loop is real unaddressed white space. |
| **R2-7** | **Voice-Agent Session Replay & Diff Debugger ("git diff for voice agents")** | **Low** | **Hamming AI already ships session replay + version-to-version transcript/latency/tool-call comparison for voice agents; broader LLM-agent trace-diff tooling (LangSmith, AgentOps, ctxdiff) is a mature multi-vendor category.** |
| R2-8 | Latency Budget Profiler for Voice Agent Pipelines | Medium | What to measure is well-known industry guidance; no flame-graph-per-turn visualization tool found built. |

---

## What this should change about the team's current leaning

The team's stated leaning going into this research was **R2#5 + R2#7 as centerpiece, R2#6 as stretch**. This research should change that leaning:

- **R2#7 (Session Replay & Diff Debugger) — novelty is Low, not a safe centerpiece as pitched.** Hamming AI already ships almost exactly this for voice agents generally. Don't present it as "we invented git diff for voice agents" — that's checkable and false. If kept, reframe narrowly as "the missing dev tool for AssemblyAI's specific Voice Agent API protocol, open-source" rather than a novel category, and be ready for a judge to know Hamming/Cekura by name.
- **R2#5 (Regression CI Pipeline) — same problem, same finding: Low novelty.** Hamming and Cekura both already ship WER + tool-call + latency gating in CI for voice agents. This means **both halves of the current centerpiece pairing are already-commercial features**, not just one — the "we built the missing voice-agent dev tools" story is weaker than the team may have assumed, since the tools aren't actually missing industry-wide, just missing from AssemblyAI's specific ecosystem.
- **R2#6 (Adversarial Eval Generator), currently the stretch pick, tests out as the most novel of the three** (Medium-High) — the closed TTS→voice-agent→STT adversarial loop, specifically testing acoustic-cascade failures, was not found built anywhere, unlike #5 and #7. If the team wants a technically strong, defensibly-novel centerpiece from this trio, **#6 is the stronger claim than #5 or #7**, not the fallback.
- Suggested reshuffle to consider: promote **R2#6** to co-centerpiece (with the honest framing that the underlying red-team/judge pattern is well-known for text agents, but the voice-specific closed loop is not), keep **R2#7** if the team wants it but scope and pitch it narrowly (AssemblyAI-protocol-specific, open-source, not "invented" replay/diff), and treat **R2#5** as a useful supporting/demo-infra piece rather than a novelty selling point.
- Outside this trio, the two ideas with the cleanest "real search found nothing close" results across the whole 20 are **R1#3 (Verbal Code-Review Companion)**, **R1#6 (Two-Agent Compressed Voice Protocol)**, **R1#11 (Reasoning-Timeline Debugger)**, and **R2#3 (Wavelet-Based Vocal Onset Coach)** — worth keeping in mind if the team wants a genuinely uncontested novelty claim rather than a "close but differentiated" one.
- Several round-1 ideas the team may not have flagged as risky turned out to have close, shipped commercial competitors: **R1#2, R1#4, R1#7, R1#12** are all Low novelty against named, real products (Equal Time; Yoodli/LockedIn AI/Huru; Sensi.AI; Gong/Balto/Dialpad respectively) — none of these were previously called out as having existing competition in the original two reports.
