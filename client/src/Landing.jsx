import { Nav, Footer } from "./Chrome";

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
          <li>Catch a missing TCPA consent record before it becomes a complaint.</li>
          <li>Confirm your agent disclosed it's AI in the first few seconds, every call.</li>
          <li>Spot an SSN or account number leaking into a transcript before it spreads.</li>
          <li>Print a report you can hand to legal, not a wall of raw transcript.</li>
        </ul>

        <button className="btn btn-primary hero-cta" onClick={onGetStarted}>
          Get started
        </button>
      </main>

      <section className="trust-strip">
        <div className="trust-strip-item">
          <strong>No data retention risk.</strong>
          <p>Live call audio is never written to disk; transcripts live only in browser memory.</p>
        </div>
        <div className="trust-strip-item">
          <strong>Built on real citations.</strong>
          <p>Every finding traces to the statute it checks — TCPA, state AI-disclosure law, HIPAA, GLBA.</p>
        </div>
        <div className="trust-strip-item">
          <strong>Pluggable by industry.</strong>
          <p>Generic PII scan out of the box, with HIPAA and GLBA identifier packs as drop-in extensions.</p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
