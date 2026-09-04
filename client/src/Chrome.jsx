// Shared site chrome: top nav (brand-as-home-link + Review/History) and
// footer (data-handling + repo link). See judging-criteria-and-enterprise-gap-assessment.md
// item 10 - previously there was no way back to "/" and no footer anywhere.
export function Nav({ path, navigate }) {
  return (
    <nav className="site-nav">
      <a
        className="brand"
        href="/"
        onClick={(e) => {
          e.preventDefault();
          navigate("/");
        }}
      >
        <span className="brand-mark" aria-hidden="true" />
        <h1>ComplyLine</h1>
      </a>
      <div className="site-nav-links">
        <a
          className={`site-nav-link ${path === "/dashboard" ? "is-active" : ""}`}
          href="/dashboard"
          onClick={(e) => {
            e.preventDefault();
            navigate("/dashboard");
          }}
        >
          Review
        </a>
        <a
          className={`site-nav-link ${path === "/history" ? "is-active" : ""}`}
          href="/history"
          onClick={(e) => {
            e.preventDefault();
            navigate("/history");
          }}
        >
          History
        </a>
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <p className="site-footer-handling">
        Live call audio is never written to disk. Transcripts exist only in your browser's memory
        and are discarded on reload. Your AssemblyAI API key never leaves the server.
      </p>
      <p className="site-footer-links">
        <a href="https://github.com/Aditya190600/2peepsfromAZ" target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
        <span aria-hidden="true"> · </span>
        <span>ComplyLine — automated pattern-based screening, not legal advice.</span>
      </p>
    </footer>
  );
}
