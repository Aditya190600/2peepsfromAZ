import { Nav, Footer } from "./Chrome";
import { SAMPLE_SESSIONS } from "./sampleSessions";
import { CHECK_LABEL, CHECK_CITATION } from "./compliance";

const SAMPLE = SAMPLE_SESSIONS["tcpa-violation"];

export default function Landing({ onGetStarted, navigate, path }) {
  return (
    <div className="page">
      <Nav path={path} navigate={navigate} />
      <header className="masthead">
        <p className="tagline">Post-call compliance review for AI voice agents.</p>
      </header>

      <main className="hero">
        <h2 className="hero-headline">Know what your voice agent said before your lawyer finds out.</h2>
        <p className="hero-lede">
          Feed us one completed AssemblyAI call. Get back a severity-ranked report on consent,
          disclosure, and PII exposure — with a regulatory citation on every finding.
        </p>

        <ul className="hero-value-list">
          <li>Catch a missing Telephone Consumer Protection Act (TCPA) consent record before it becomes a complaint.</li>
          <li>Confirm your agent disclosed it's AI in the first few seconds, every call.</li>
          <li>Spot an SSN or account number leaking into a transcript before it spreads.</li>
          <li>Print a report you can hand to legal, not a wall of raw transcript.</li>
        </ul>
      </main>

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
      </section>

      <Footer />
    </div>
  );
}
