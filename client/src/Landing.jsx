export default function Landing({ onGetStarted }) {
  return (
    <div className="page">
      <header className="masthead">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <h1>ComplyLine</h1>
        </div>
        <p className="tagline">Post-call compliance review for AI voice agents.</p>
      </header>

      <main className="hero">
        <h2 className="hero-headline">Know what your voice agent said before your lawyer finds out.</h2>
        <p className="hero-lede">
          Feed us one completed AssemblyAI call. Get back a report on consent, disclosure, and
          PII exposure in seconds.
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
    </div>
  );
}
