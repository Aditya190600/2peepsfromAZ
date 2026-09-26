import { Nav, Footer } from "./Chrome";
import { SAMPLE_SESSIONS } from "./sampleSessions";
import { CHECK_LABEL, CHECK_CITATION } from "./compliance";

const SAMPLE = SAMPLE_SESSIONS["tcpa-violation"];

export default function Landing({ onGetStarted, navigate, path }) {
  return (
    <div className="page styled-page">
      <Nav path={path} navigate={navigate} />
      <header className="masthead">
        <p className="tagline">Know what your AI voice agent actually does.</p>
        <p className="tagline-subhead">
          Compliance checks on every completed call, and real test calls that prove an agent behaves the way you expect.
        </p>
      </header>

      <main className="hero">
        <h2 className="hero-headline">Know what your voice agent said before your lawyer finds out.</h2>
        <p className="hero-lede">
          Feed us one completed AssemblyAI call. Get back a severity-ranked report on consent,
          disclosure, and PII exposure — with a regulatory citation on every finding, checked
          against regulatory packs (TCPA, HIPAA, state AI-disclosure laws) and your own custom
          policy requirements.
        </p>

        <ul className="hero-value-list">
          <li>Catch a missing Telephone Consumer Protection Act (TCPA) consent record before it becomes a complaint.</li>
          <li>Confirm your agent disclosed it's AI in the first few seconds, every call.</li>
          <li>Spot an SSN or account number leaking into a transcript before it spreads.</li>
          <li>Print a report you can hand to legal, not a wall of raw transcript.</li>
        </ul>
      </main>

      <section className="hero">
        <h2 className="hero-headline">Know whether a voice agent is actually good, before you rely on it.</h2>
        <p className="hero-lede">
          QualEval places real test calls against any voice agent and judges the transcript against
          the scenarios and success criteria you define — no code, no engineering team required.
          Write a custom scenario, pick a persona, run the call, and get a pass/fail verdict backed
          by evidence from the transcript.
        </p>

        <ul className="hero-value-list">
          <li>Define what "good" looks like for an agent in plain language - no scripting.</li>
          <li>Generate custom test scenarios and personas instead of writing a QA suite by hand.</li>
          <li>Place a real call against the agent and get a pass/fail verdict with evidence, not a guess.</li>
          <li>
            Evaluate an agent you're <em>buying</em> from a vendor, not just one your own team built -
            the same scenarios and criteria work whether you wrote the agent or someone else did.
          </li>
        </ul>
      </section>

      <section className="how-it-works">
        <h2 className="section-heading">How it works</h2>
        <ol className="how-it-works-steps">
          <li>
            <strong>1. The call runs on AssemblyAI's Voice Agent API.</strong>
            <p>Your voice agent talks to the caller over AssemblyAI's managed Voice Agent websocket - no separate STT/TTS stack to wire up.</p>
          </li>
          <li>
            <strong>2. We ingest the finished session.</strong>
            <p>One completed session (its transcript, timing, and consent event) is handed to our checks - live from the browser, pasted/uploaded after the fact, or pushed by your own backend the instant a call ends.</p>
          </li>
          <li>
            <strong>3. AssemblyAI's LLM Gateway drives the compliance analysis.</strong>
            <p>Consent, disclosure timing, and free-form PII detection run as LLM Gateway calls against the transcript, layered on top of deterministic regex checks for structured PII like SSNs and account numbers.</p>
          </li>
          <li>
            <strong>4. You get a severity-ranked report.</strong>
            <p>Every finding is labeled critical, high, or medium, with a regulatory citation attached - ready to hand to legal.</p>
          </li>
        </ol>
      </section>

      <section className="sample-report-preview">
        <h2 className="section-heading">See a real finding</h2>
        <p className="section-lede">
          This is an actual check result from one of our sample sessions - not a mockup.
        </p>
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
            <p className="finding-citation">{CHECK_CITATION.pii_scan}</p>
          </div>
        </div>
        <button className="btn btn-outline sample-report-cta" onClick={onGetStarted}>
          Run this sample yourself
        </button>
      </section>

      <section className="trust-strip">
        <div className="trust-strip-item">
          <strong>Built on real citations.</strong>
          <p>Every finding traces to the statute it checks — TCPA, state AI-disclosure law, HIPAA, GLBA.</p>
        </div>
        <div className="trust-strip-item">
          <strong>Pluggable by industry.</strong>
          <p>Generic PII scan out of the box, with HIPAA, GLBA, and FERPA identifier packs as drop-in extensions.</p>
        </div>
        <div className="trust-strip-item">
          <strong>Built for buyers, not just builders.</strong>
          <p>Evaluating a third-party voice agent before you buy it? Run the same scenario-based evals a builder would.</p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
