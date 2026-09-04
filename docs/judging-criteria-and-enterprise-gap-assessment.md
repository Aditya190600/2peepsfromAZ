# ComplyLine: honest judging-criteria score + enterprise-credibility gap assessment

**Date:** 2026-09-04 · **Commit assessed:** `beeafbc` (main, PR #21) · **Method:** app run locally and clicked through in a real browser, plus direct API probing.

---

## TL;DR

The engineering underneath is genuinely good and the checks are real. But **the app as it actually runs today fails its own flagship demo**: the sample session literally labelled *"Clean call — everything passes"* renders two red-adjacent **"Unable to run"** cards with raw HTTP 429 JSON error blobs pasted into the compliance report. That is not a styling nit - it is the first thing a judge or a buyer would click.

Root cause (measured, not guessed): AssemblyAI's LLM Gateway on this account allows **~2 calls per ~30 seconds**, then hard-429s. Every report makes 2 LLM calls. So the app supports **about one report per 30s**, and the "Analyze all 6 sample sessions" fleet view - which fires 12 concurrent calls - **can never fully succeed**. There is no retry, no backoff, no queue, and no caching anywhere in the code.

Fixing that one thing (S-to-M effort) is worth more to both hackathon judging and enterprise credibility than every cosmetic item on the rest of this list combined.

Scores against the hackathon's own four criteria, on what actually works right now: **Application of Technology 3.5/5 · Presentation 2.5/5 · Business Value 4/5 · Originality 4/5.**

---

## 1. What was done

Ran the real thing, end to end, and interrogated the API directly rather than reading source and inferring.

```
./scripts/install.sh          # deps already vendored; .env carries a live ASSEMBLYAI_API_KEY
cd server && npm test         # 11/11 pass, 49ms
cd server && npm start        # :8787
cd client && npm run dev      # :5173
```

Then in a real Chrome session: landing page → dashboard → each sample session → fleet view → backend-down error path → console/network inspection → direct `curl` against the backend and against AssemblyAI's LLM Gateway.

**Confirmed working live (not mocked):**

| Path | Evidence |
|---|---|
| Voice Agent token mint | `GET /v1/token` → 200, real `AQICAHhSP--...` token |
| Pre-recorded STT upload | `POST /v1/transcribe-upload` with a real mp3 → 200, real transcript returned |
| Compliance analysis | `POST /v1/analyze-session` → 200, structured findings |
| Check self-tests | `npm test` → 11 pass, 0 fail, including the HIPAA-pack drop-in demonstration |

So the AssemblyAI integration is real and the hackathon eligibility requirement is genuinely met. The problems are elsewhere.

---

## 2. Score against the four judging criteria

Criteria and their definitions come from `docs/hackathon-ideas.md` (lines 55-59 - the "Judging facts" block, quoted from the live hackathon page). No weighting is published, so equal weight is assumed.

### Application of Technology — 3.5 / 5
> *"How effectively the chosen model(s) are integrated into the solution"*

**Strong:** three distinct AssemblyAI surfaces are wired for real - Voice Agent API (live WebSocket session ingestion), pre-recorded Speech-to-Text with `speaker_labels` diarization for the upload path, and LLM Gateway for semantic judgment. `server/checks/transcribeUpload.js:30` correctly requests diarization and maps `utterances[]` to roles. The architectural claim in the README - that semantic LLM judgment catches paraphrases a regex phrase-list would miss - is real and is proven by a runnable test (`analyze.test.js`, "LLM Gateway disclosure check catches a paraphrase the old hardcoded phrase list would have missed").

**The 1.5-point deduction is entirely about reliability under real conditions.** The two checks that constitute the technology story - `ai_disclosure` and the free-form `pii_scan` pass - are the two that fail. Measured directly against the gateway, 10s apart:

```
call 1 -> 200
call 2 -> 200
call 3 -> 429 {"message":"too many requests for this action","code":429}
call 4 -> 429
call 5 -> 429
call 6 -> 429
```

Running all six sample sessions sequentially through the backend, spaced 20 seconds apart, still degrades:

```
clean-call      consent=pass ai_disclosure=error recording_consent=pass opt_out=n/a  pii_scan=error
tcpa-violation  consent=flag ai_disclosure=error recording_consent=flag opt_out=n/a  pii_scan=flag
optout-ignored  consent=pass ai_disclosure=pass  recording_consent=flag opt_out=flag pii_scan=pass
```

`ai_disclosure` succeeded **1 time in 3**. A judge clicking twice in a minute sees the differentiator break. There is no retry, backoff, concurrency cap, or result cache anywhere - `Dashboard.jsx:299-309` fires all six analyses through `Promise.all`, i.e. 12 simultaneous gateway calls into a ~2-per-30s budget.

Second, smaller deduction: the shipped **`financePack` (GLBA) is invisible in the product**. It exists at `server/checks/patternPacks.js:66` and is covered by a passing test, but `Dashboard.jsx:272` hardcodes `hipaaPack ? ["generic","hipaa"] : ["generic"]`. A whole shipped capability - and the one that best proves the "pluggable pattern packs" architecture claim - cannot be reached from the UI.

### Presentation — 2.5 / 5
> *"The clarity and effectiveness of the project presentation"*

This is the weakest axis and the one most cheaply improved.

**Good:** the typography is genuinely tasteful (serif display face, restrained navy accent, calm off-white ground) - it does not look like unstyled Bootstrap. The landing headline *"Know what your voice agent said before your lawyer finds out"* is a sharp, memorable value proposition. Print styles exist (`App.css:725-780`) with a letterhead and footer, so the "hand it to legal" claim is backed by real CSS.

**Why it still scores 2.5:**

1. **The flagship sample contradicts its own label.** Clicking *"Clean call — everything passes"* produces two `Unable to run` cards containing raw JSON with `request_id` UUIDs and `"code":429` dumped into a compliance report. See `img/judging-criteria/07-clean-call-429-errors.jpg`. This is the demo's front door.
2. **The fleet summary is internally inconsistent.** It reads **"0 of 6 calls passed all checks · 6 flagged"** while two rows below it are visibly green **Pass**. The per-check tallies also don't add to 6 (`AI disclosure timing: 1 pass 0 flag` accounts for one of six) because errored checks are silently dropped from the count. See `img/judging-criteria/06-fleet-report.jpg`.
3. **Enormous dead space.** The layout caps at `max-width: 1040px` (`App.css:36`) but is *left-biased* inside a 1568px viewport, leaving roughly a third of the screen permanently blank on the right while the left panel is cramped. Every screenshot shows it.
4. **Raw browser `<audio controls>` widgets**, seven of them stacked down the left rail, each rendering Chrome's default grey pill. It reads as a debug scaffold, not a product.
5. **A real pixel bug.** The upload hint is indented 25px out of alignment with its own heading and collides with the dashed drop zone below it - the word "finding." sits on the border. See `img/judging-criteria/08-packnote-indent-bug.png`. Cause: `.pack-note` at `App.css:147-151` carries `margin: 6px 0 0 25px`, an indent designed to align under the HIPAA *checkbox*, reused at `Dashboard.jsx:436` where there is no checkbox to align to, and with no bottom margin.

### Business Value — 4 / 5
> *"The impact and practical value, considering how well it fits into business areas"*

**Strong, and the best-argued part of the project.** The problem is real and dated: TCPA consent logging, state AI-disclosure statutes (CA AB 2905), opt-out honoring, PII leakage. The addressable market really is "any company running a voice agent," not one vertical, and the pattern-pack architecture makes the vertical expansion story concrete rather than hand-waved. The output is the right artifact - a printable report for legal, not a transcript dump. The fleet view is the correct instinct for showing this is a compliance *program*, not a one-call toy.

**Deductions:** it stops one step short of the thing a buyer actually asks. There is **no severity or risk ranking** - a missing TCPA consent record (statutory damages $500-$1,500 *per call*) renders in exactly the same visual weight as a late AI disclosure. There is **no regulatory citation** on any finding, so a compliance officer cannot trace a flag to the rule it violates. And there is **no data-handling statement anywhere in the client** - grepping for `retention|not stored|encrypt|audit|privacy` across `client/src/*.jsx` gets **zero hits**. For a product whose entire premise is custody of compliance-sensitive call content, that silence is disqualifying to a hospital or bank - and it is *needlessly* so, because the true answer is a strong selling point that is already architecturally true: live call audio is never written to disk, and transcripts live only in browser memory.

### Originality — 4 / 5
> *"The uniqueness and creativity of the solution, highlighting approaches and ability to demonstrate behaviors"*

**Strong.** The prior-art check in `docs/hackathon-ideas.md` found no scoped, protocol-level, industry-agnostic compliance checker for AI voice agents. Most hackathon entries *build* a voice agent; this one **audits** one - meta-tooling for a category that is about to need it, which is a genuinely differentiated angle. The pluggable pattern-pack design with HIPAA shipped as a real drop-in (proven by a test that shows the generic scan missing what the pack catches) is a creative, demonstrable architecture claim rather than a slide.

**Deduction:** the most original mechanism - LLM Gateway semantic judgment replacing brittle phrase-matching - is exactly the one that fails live, so originality is currently better evidenced in the test suite than in the running product. Originality a judge cannot *see work* scores as originality claimed, not demonstrated.

---

## 3. Enterprise-credibility pass: every screen and state

The app is **two routes and effectively one working screen**. `App.jsx` is a 24-line hand-rolled router: `/` → `Landing.jsx` (32 lines), `/dashboard` → `Dashboard.jsx` (510 lines, everything else).

### Screen inventory

| Screen | State | Verdict |
|---|---|---|
| `/` Landing | Brand, headline, 4 bullets, one CTA | Clean copy, but no nav, no footer, no trust strip, no "how it works", no pricing/contact. Ends abruptly in whitespace. `img/judging-criteria/01-landing.jpg` |
| `/dashboard` first run | Left rail + "How this works" 3-step panel | This *is* the onboarding (PR #8). It's static prose, always present, never dismissible, and never adapts. `img/judging-criteria/02-dashboard-empty.jpg` |
| Single report | Findings list, print button, audio player | The best screen in the app. Real, legible, well-organized. `img/judging-criteria/04-report-violation.jpg` |
| Fleet report | Aggregate tallies + 6 rows | Right idea, contradictory numbers. `img/judging-criteria/06-fleet-report.jpg` |
| Report with degraded checks | Two `Unable to run` cards w/ raw JSON | The flagship failure. `img/judging-criteria/07-clean-call-429-errors.jpg` |

### State-by-state audit

| State | Present? | Detail |
|---|---|---|
| Live-call connecting | Yes | `"Connecting…"` hint, `Dashboard.jsx:392` |
| Live-call error | Yes | `error-banner`, `Dashboard.jsx:401` |
| Mic silent | Yes | Banner from PR #20's `micSilent` flag. Good, hard-won UX |
| Transcript empty | Yes | `"Listening for the first turn…"`, `Dashboard.jsx:424` |
| Upload in progress | Yes | `"Transcribing and analyzing…"`, `Dashboard.jsx:455` |
| Upload error | Yes | `error-banner`, `Dashboard.jsx:459` |
| Fleet loading | Partial | Button flips to `"Analyzing…"` - but nothing in the empty result panel, so a 15-30s run looks like nothing happened |
| **Sample-analysis loading** | **No** | `runSample` (`Dashboard.jsx:293`) has no loading state at all |
| **Sample-analysis error** | **No** | No `try`/`catch`, and `analyze()` (`Dashboard.jsx:37-44`) never checks `resp.ok` |
| **Fleet error** | **No** | No `try`/`catch` |
| **Live-report error** | **No** | No `try`/`catch` |

**Reproduced the worst of these.** With the backend stopped, clicking a sample session does *absolutely nothing* - no spinner, no message, no change. The failure exists only in the console:

```
[EXCEPTION] SyntaxError: Failed to execute 'json' on 'Response': Unexpected end of JSON input
    at analyze (Dashboard.jsx:55)
    at async runSample (Dashboard.jsx:590)
```

Screenshot of the silent dead-end: `img/judging-criteria/05-backend-down-silent.jpg`. On a deployed Vercel/Replit demo where a cold backend is routine, this reads as "the app is broken."

### Sample-data volume and realism

Six sessions, each **10.6-14.0 seconds** long (`ffprobe`), 3-6 turns each. Verified real and valid mp3s. That's the right *coverage* of scenarios (clean ×2, TCPA, opt-out, HIPAA, late disclosure) but nowhere near the *volume* that reads as a compliance program. A fleet view of 6 calls is a demo; a bank thinks in thousands per day.

One structural weakness in the upload path worth knowing before the demo video: the sample audio is single-voice, so AssemblyAI's diarization returns **one utterance**, and `turnsFromUtterances` collapses the whole call into a single `agent` turn at `tMs: 0`:

```json
{"turns":[{"role":"agent","text":"Hi there, how can I help you today? My SSN is 123-45-6789 and my card is 4111111111111111.","tMs":0}]}
```

With every utterance attributed to the agent at 0ms, the disclosure-timing and opt-out checks are structurally meaningless on that input, and PR #19's clickable-timestamp feature degenerates to everything pointing at 0:00. The *code* is correct - it's the demo audio that defeats it. A genuine two-speaker recording would work.

### Trust and compliance signals

| Signal | Present? |
|---|---|
| Data handling / retention statement | **No** - zero matches across `client/src/*.jsx` |
| Audit trail / report history | **No** - reports vanish on reload, nothing persisted |
| Access control or any notion of a user/org | **No** |
| Regulatory citations on findings | **No** - "TCPA" appears in titles only, no rule reference |
| Severity / risk ranking | **No** - all findings identical visual weight |
| Report identity | Partial - session id + generated-at timestamp, no version, no report id |
| Print/export | **Yes** - real print CSS with letterhead + footer. The single strongest trust artifact in the build |

### Other observations

- **No way back to `/` from `/dashboard`.** The masthead brand is not a link. No nav anywhere in either route.
- **Responsive:** exactly one breakpoint (`@media (max-width: 860px)`, `App.css:84`) collapsing the two-column grid. Adequate; not a priority.
- **Console is clean** on the happy path - no React warnings, no errors.

---

## 4. Ranked recommendations

Ranked by (impact on judging + impact on enterprise credibility) ÷ effort. Effort assumes an AI coding agent doing the typing, as the ideas doc does. Everything here is polish or completeness on what already exists; only #6 and #9 add real new surface, and both are small.

**S** = under half a day · **M** = ~1 day · **L** = 2-3 days

### Tier 1 — do these or the demo is at risk

**1. Make LLM Gateway calls survive the account rate limit. — Effort: M**
Cache results by session hash (the six samples are static and their verdicts never change - cache them at build time or on first success and the demo never hits the gateway again); add bounded retry with exponential backoff on 429; cap fleet concurrency to 1-2 instead of `Promise.all` over 6. Then replace the raw-JSON error card with honest human copy ("Semantic check unavailable - rate limited, retrying") that never shows a `request_id` to a user.
*Judging:* the single highest-impact item. It converts Application of Technology from 3.5 to ~4.5 and Presentation from 2.5 to ~3.5, because the flagship sample stops contradicting its own name.
*Enterprise:* decisive. Raw HTTP error JSON in a compliance report is instantly disqualifying.

**2. Give every analysis path a loading and an error state. — Effort: S**
Add `try`/`catch` + a pending flag to `runSample`, `runFleet`, and `runLiveReport`; make `analyze()` check `resp.ok` (`Dashboard.jsx:37-44`). Right now a dead backend produces a completely silent dead-end.
*Judging:* prevents a catastrophic live-demo moment on a cold-started deploy.
*Enterprise:* "nothing happens when I click" is the clearest possible signal of a prototype.

**3. Fix the fleet summary's contradictory arithmetic. — Effort: S**
"0 of 6 passed · 6 flagged" while two rows read Pass. Count errored checks explicitly and surface them ("4 checks could not run") rather than dropping them from the tally.
*Judging:* this is the aggregate/scale screen - the one a judge screenshots. It must not look like it can't count.
*Enterprise:* a compliance tool whose numbers visibly disagree with its own rows is unusable.

### Tier 2 — highest credibility per unit of effort

**4. Add a data-handling statement and per-finding regulatory citations. — Effort: S**
A short, permanent panel stating what is and isn't retained - the honest answer is already strong: *live call audio is never written to disk; transcripts exist only in browser memory and are discarded on reload; the API key never leaves the server.* Plus one citation line per check (TCPA 47 U.S.C. §227 / 47 CFR 64.1200; CA AB 2905; HIPAA §164.514(b)(2)).
*Judging:* directly lifts Business Value - it's the difference between "flags things" and "flags things against a rule."
*Enterprise:* the highest-leverage item on the whole list. It is pure copy, costs almost nothing, and it is the first question a hospital or bank asks. Answering it *well* is currently free money left on the table.

**5. Add severity ranking to findings. — Effort: S**
Tier the checks (missing TCPA consent = Critical, PII exposure = Critical, late disclosure = High, recording disclosure = Medium) and sort the report so the worst is first. Surface a single headline risk verdict per call.
*Judging:* makes the report look like a decision aid rather than a checklist.
*Enterprise:* a compliance officer triages by severity. A flat list forces them to do that work manually.

**6. Expose the finance (GLBA) pack, and make pack selection a real control. — Effort: S**
`financePack` is built and tested at `patternPacks.js:66` but unreachable from the UI (`Dashboard.jsx:272`). Turn the single HIPAA checkbox into a small multi-select of industry packs.
*Judging:* lifts Originality and Application of Technology, because "pluggable, industry-agnostic core" goes from an asserted architecture claim to something the judge can *toggle and watch change*. Best ratio of judging impact to effort on the list.
*Enterprise:* "pick your regulatory regime" is exactly the shape a vertical buyer expects.

**7. Replace the raw `<audio controls>` widgets and fix the layout dead space. — Effort: M**
One shared, styled compact player; centre the 1040px column or widen it and rebalance the two panels. Fix the `.pack-note` 25px indent bug (`App.css:147-151`) - either drop the indent from the reused class or give the upload hint its own class.
*Judging:* Presentation is the weakest score and this is most of the remaining gap.
*Enterprise:* seven stacked default browser players is the single most "hackathon prototype" thing on screen.

### Tier 3 — worth it if Tier 1-2 land early

**8. Raise sample-data volume so the fleet view reads as a program. — Effort: M**
Expand from 6 to ~40-60 synthetic sessions (text-only is fine - audio only matters for the handful actually played in the video). Give the fleet view a compliance-rate percentage, a per-check breakdown, and a simple trend. Keep the 6 audio-backed ones as the "playable" set.
*Judging:* the difference between "here are my 6 test fixtures" and "here is a fleet under review."
*Enterprise:* scale is most of what "serious product" means visually. Note this only pays off *after* #1 - 60 sessions × 2 gateway calls is hopeless without caching.

**9. Add a persisted report history / audit trail. — Effort: M**
A "Recent reports" list with timestamps and headline verdicts. `localStorage` is entirely sufficient and stays true to the no-database architecture.
*Judging:* moderate - adds a second real screen and makes the IA read as a product.
*Enterprise:* high. "Compliance tool with no record of what it checked" is a contradiction, and an audit trail is the thing an auditor asks for by name.

**10. Give the app real navigation and finish the landing page. — Effort: S**
Make the brand a home link, add a two-item nav (Review / History), add a footer with data-handling and a repo link. Close the landing page with a trust strip instead of raw whitespace.
*Judging:* modest.
*Enterprise:* moderate - navigation is a large part of what separates "a product" from "a demo screen," but it's cosmetic next to Tier 1-2.

### Explicitly not recommended

- **Multi-tenant admin console, org onboarding wizard, real auth, or a database.** An empty-org onboarding wizard was floated at one point; skip it: with no persistence and no users, a setup wizard would be a fake front door onto nothing, and building the real thing behind it is an L-sized project that competes directly with Tier 1. Item #4 (data handling) plus #9 (history) buys most of the same "this is a real system" credibility for a fraction of the cost.
- **Redesigning the visual language.** The typography is already the strongest thing about the presentation. The gap is broken states and dead space, not aesthetic direction.

---

## 5. Work that should ship (bugs, not opinions)

Reproduced, with root cause identified. These are fixes, not proposals:

1. **`analyze()` never checks `resp.ok`** (`client/src/Dashboard.jsx:37-44`) and `runSample`/`runFleet`/`runLiveReport` have no `try`/`catch` → silent dead-end when the backend is down. Console evidence captured above.
2. **No rate-limit handling for LLM Gateway 429s** anywhere; `Promise.all` over 6 sessions (`Dashboard.jsx:299-309`) guarantees the fleet view fails. Raw JSON error text with `request_id` leaks into the report UI.
3. **Fleet summary drops errored checks from its tallies**, producing "0 of 6 passed" alongside two visible Pass rows.
4. **`.pack-note` 25px indent reused out of context** (`App.css:147-151` ← `Dashboard.jsx:436`) → misaligned hint text colliding with the drop zone.
5. **`financePack` shipped but unreachable** (`patternPacks.js:66`; `Dashboard.jsx:272` hardcodes the pack list).

Suggested shipping order: **1 → 2 → 3 → 5 → 4** (correctness and demo-safety first, cosmetics last).

---

## 6. Screenshots

All in `img/judging-criteria/`, captured from the running app at commit `beeafbc`:

| File | Shows |
|---|---|
| `01-landing.jpg` | Landing page - clean copy, no nav/footer, ends in whitespace |
| `02-dashboard-empty.jpg` | Dashboard first run + "How this works" static onboarding |
| `03-sample-list.jpg` | Six raw `<audio controls>` widgets stacked in the left rail |
| `04-report-violation.jpg` | A working report - the app at its best |
| `05-backend-down-silent.jpg` | Backend down, sample clicked: nothing happens at all |
| `06-fleet-report.jpg` | Fleet view: "0 of 6 passed" above two green Pass rows |
| `07-clean-call-429-errors.jpg` | **"Clean call — everything passes"** rendering two `Unable to run` cards with raw 429 JSON |
| `08-packnote-indent-bug.png` | Zoom: misaligned hint text overlapping the drop zone |

---

## 7. Environment caveat

Audio playback could not be verified in the automated Chrome instance used for this assessment - `<audio>` elements enter a playing state but `duration` stays `null` and `readyState` stays `0`, which is characteristic of an automated browser with no audio output device. The files themselves are valid (`ffprobe` reports 10.6-14.0s durations for all six) and are served correctly (`200`, `content-type: audio/mpeg`). **Playback and the click-a-timestamp-to-seek interaction should be confirmed manually in a normal browser before the demo video is recorded.**

Separately: `chrome-devtools-axi` was unusable in the session that produced this assessment (`take_snapshot` failed with `Invalid arguments ... Required at pageId` on every invocation, and it dropped its page list). All browser work was done with the claude-in-chrome tools instead.
