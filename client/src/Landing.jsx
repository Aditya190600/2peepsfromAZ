import { Nav, Footer } from "./Chrome";
import { SAMPLE_SESSIONS } from "./sampleSessions";
import { CHECK_LABEL, CHECK_CITATION, PACK_CITATION } from "./compliance";
import {
  EXAMPLE_EVALUATION,
  EXAMPLE_SCENARIO,
  EXAMPLE_FLAGGED_CRITERION,
  EXAMPLE_FLAGGED_TURN,
  EXAMPLE_PATH,
} from "./qualevalExampleData";

const SAMPLE = SAMPLE_SESSIONS["tcpa-violation"];

// Each step's `kind` picks its color: where the data comes from (input),
// what AssemblyAI does (assemblyai), our own analysis (analysis), and what
// you get back (output). Steps mirror the real pipelines:
// ComplyLine is server/checks/analyze.js's analyzeSession over one session;
// QualEval is server/qualeval/ generator.js -> callBridge.js/bridgeSession.js
// -> evaluator.js.
const COMPLYLINE_STEPS = [
  {
    kind: "input",
    tag: "Intake",
    title: "A completed call",
    detail: "A live Voice Agent call, an uploaded recording, a pasted transcript, or a push from your backend.",
  },
  {
    kind: "assemblyai",
    tag: "AssemblyAI",
    title: "Transcribe",
    detail: "Voice Agent API transcript, or pre-recorded STT for uploads. Every turn keeps its speaker and timestamp.",
  },
  {
    kind: "analysis",
    tag: "LLM Gateway + packs",
    title: "Run the checks",
    chips: [
      CHECK_LABEL.consent,
      CHECK_LABEL.ai_disclosure,
      CHECK_LABEL.recording_consent,
      CHECK_LABEL.opt_out,
      CHECK_LABEL.pii_scan,
      CHECK_LABEL.mini_miranda,
    ],
  },
  {
    kind: "output",
    tag: "Report",
    title: "Severity-ranked findings",
    detail: "Critical, high, or medium, each with a regulatory citation and a timestamp in the call.",
  },
];

const QUALEVAL_STEPS = [
  {
    kind: "input",
    tag: "You",
    title: "Describe the agent",
    detail: "Its phone number, what it does, and what it must always or never do.",
  },
  {
    kind: "analysis",
    tag: "LLM Gateway",
    title: "Generate scenarios",
    detail: "A caller persona, a situation, and pass/fail criteria for each test.",
  },
  {
    kind: "input",
    tag: "You",
    title: "Approve",
    detail: "Keep the scenarios worth running and reject the rest.",
  },
  {
    kind: "assemblyai",
    tag: "AssemblyAI",
    title: "Place a real call",
    detail: "Twilio dials the agent and an AssemblyAI Voice Agent plays the persona. Transcript and recording are captured.",
  },
  {
    kind: "output",
    tag: "LLM Gateway",
    title: "Score the transcript",
    detail: "Pass or fail on every criterion, with quoted evidence from the call.",
  },
];

function WorkflowDiagram({ label, steps }) {
  return (
    <figure className="workflow">
      <figcaption className="workflow-caption">{label}</figcaption>
      <ol className="workflow-steps" style={{ "--steps": steps.length }}>
        {steps.map((step, i) => (
          <li key={step.title} className={`workflow-step is-${step.kind}`}>
            {i > 0 && (
              <svg className="workflow-arrow" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 12h16m-5-5 5 5-5 5" />
              </svg>
            )}
            <div className="workflow-card">
              <span className="workflow-tag">{step.tag}</span>
              <strong className="workflow-title">{step.title}</strong>
              {step.detail && <p className="workflow-detail">{step.detail}</p>}
              {step.chips && (
                <ul className="workflow-chips">
                  {step.chips.map((chip) => (
                    <li key={chip}>{chip}</li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
    </figure>
  );
}

function formatClock(tMs) {
  const totalSeconds = Math.round(tMs / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export default function Landing({ onGetStarted, navigate, path }) {
  return (
    <div className="page styled-page">
      <Nav path={path} navigate={navigate} />
      <header className="masthead">
        <p className="brand-tagline">The independent trust layer for voice agents</p>
        <p className="tagline">Know what your AI voice agent actually does.</p>
        <p className="tagline-subhead">
          Compliance checks on every completed call, and real test calls that prove an agent behaves the way you expect.
        </p>
      </header>

      <main className="hero">
        <h2 className="hero-headline">Know what your voice agent said before your lawyer finds out.</h2>
        <p className="hero-lede">
          Feed us one completed AssemblyAI call. Get back a severity-ranked report on consent, disclosure, and PII
          exposure, with a regulatory citation on every finding. Each call is checked against regulatory packs (TCPA,
          HIPAA, state AI-disclosure laws) and your own custom policy requirements.
        </p>

        <ul className="hero-value-list">
          <li>Catch a missing Telephone Consumer Protection Act (TCPA) consent record before it becomes a complaint.</li>
          <li>Confirm your agent disclosed it's AI in the first few seconds, every call.</li>
          <li>Spot an SSN or account number leaking into a transcript before it spreads.</li>
          <li>Hand legal a clear, cited report they can act on.</li>
        </ul>
      </main>

      <WorkflowDiagram label="ComplyLine: how a call becomes a compliance report" steps={COMPLYLINE_STEPS} />

      <section className="sample-report-preview">
        <h2 className="section-heading">See a real finding</h2>
        <p className="section-lede">An actual check result from one of our sample sessions.</p>
        <div className="panel report-panel">
          <div className="finding is-flag">
            <div className="finding-head">
              <span className="finding-status is-critical">Flag</span>
              <span className="finding-name">{CHECK_LABEL.consent}</span>
            </div>
            <p className="finding-detail">No consent event logged before this call (TCPA).</p>
            <p className="finding-citation">{CHECK_CITATION.consent}</p>
          </div>
          <div className="finding is-flag">
            <div className="finding-head">
              <span className="finding-status is-critical">Flag</span>
              <span className="finding-name">{CHECK_LABEL.pii_scan}</span>
            </div>
            <p className="finding-detail">
              Matched "{SAMPLE.turns[1].text}" against the generic PII pack: possible SSN and credit card number.
            </p>
            <p className="finding-citation">{PACK_CITATION.generic}</p>
          </div>
        </div>
        <button className="btn btn-outline sample-report-cta" onClick={onGetStarted}>
          Run this sample yourself
        </button>
      </section>

      <section className="hero">
        <h2 className="hero-headline">Know whether a voice agent is actually good, before you rely on it.</h2>
        <p className="hero-lede">
          QualEval places real test calls against any voice agent and judges the transcript against the scenarios and
          success criteria you define. Anyone on your team can set it up in plain language. Write a custom scenario,
          pick a persona, run the call, and get a pass/fail verdict backed by evidence from the transcript.
        </p>

        <ul className="hero-value-list">
          <li>Define what "good" looks like for an agent in plain language.</li>
          <li>Generate a full set of custom test scenarios and personas automatically.</li>
          <li>Place a real call against the agent and get a pass/fail verdict backed by quotes from the transcript.</li>
          <li>
            Evaluate an agent you're <em>buying</em> from a vendor with the same scenarios and criteria you'd use on
            one your own team built.
          </li>
        </ul>
      </section>

      <WorkflowDiagram label="QualEval: how a scenario becomes a pass/fail verdict" steps={QUALEVAL_STEPS} />

      <section className="sample-report-preview">
        <h2 className="section-heading">See an example evaluation</h2>
        <p className="section-lede">One scenario run against our seeded-gap demo clinic agent.</p>
        <div className="panel scorecard">
          <div className="scorecard-head">
            <span className="example-badge">Example</span>
            <span className="scorecard-verdict is-fail">✕ Fail</span>
          </div>
          <h3 className="scorecard-title">{EXAMPLE_SCENARIO.name}</h3>
          <dl className="scorecard-meta">
            <div>
              <dt>Persona</dt>
              <dd>{EXAMPLE_SCENARIO.personaLabel}</dd>
            </div>
            <div>
              <dt>Target agent</dt>
              <dd>{EXAMPLE_EVALUATION.targetAgent}</dd>
            </div>
          </dl>
          <figure className="scorecard-excerpt">
            <figcaption>
              Flagged at {formatClock(EXAMPLE_FLAGGED_TURN.tMs)} · {EXAMPLE_FLAGGED_CRITERION.criterion}
            </figcaption>
            <blockquote>
              <span className="scorecard-speaker">Agent</span> "{EXAMPLE_FLAGGED_TURN.text}"
            </blockquote>
          </figure>
        </div>
        <a
          className="btn btn-outline sample-report-cta"
          href={EXAMPLE_PATH}
          onClick={(e) => {
            e.preventDefault();
            navigate(EXAMPLE_PATH);
          }}
        >
          View full evaluation →
        </a>
      </section>

      <section className="trust-strip">
        <div className="trust-strip-item">
          <strong>Built on real citations.</strong>
          <p>Every finding traces to the statute it checks: TCPA, state AI-disclosure law, HIPAA, GLBA.</p>
        </div>
        <div className="trust-strip-item">
          <strong>Pluggable by industry.</strong>
          <p>Generic PII scan out of the box, with HIPAA, GLBA, and FERPA identifier packs as drop-in extensions.</p>
        </div>
        <div className="trust-strip-item">
          <strong>Built for buyers and builders alike.</strong>
          <p>Evaluating a third-party voice agent before you buy it? Run the same scenario-based evals a builder would.</p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
