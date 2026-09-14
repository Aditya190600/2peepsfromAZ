// Shared site chrome: top nav (brand-as-landing-link + Home/Sessions/Try) and
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
          className={`site-nav-link ${path === "/home" ? "is-active" : ""}`}
          href="/home"
          onClick={(e) => {
            e.preventDefault();
            navigate("/home");
          }}
        >
          Home
        </a>
        <a
          className={`site-nav-link ${path === "/sessions" || path.startsWith("/sessions/") ? "is-active" : ""}`}
          href="/sessions"
          onClick={(e) => {
            e.preventDefault();
            navigate("/sessions");
          }}
        >
          Sessions
        </a>
        <a
          className={`site-nav-link ${path === "/try" ? "is-active" : ""}`}
          href="/try"
          onClick={(e) => {
            e.preventDefault();
            navigate("/try");
          }}
        >
          Try
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
