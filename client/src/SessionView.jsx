import { Nav, Footer } from "./Chrome";
import { findEntryBySessionId } from "./reportHistory";
import { Report } from "./Dashboard";
import "./App.css";

export default function SessionView({ navigate, path, sessionId }) {
  const entry = findEntryBySessionId(sessionId);

  return (
    <div className="page">
      <Nav path={path} navigate={navigate} />
      <header className="masthead">
        <p className="tagline">Stored compliance report - reopened from history, no re-analysis.</p>
      </header>

      <main className="layout">
        <section className="panel report-panel">
          {entry?.report ? (
            <>
              <h2 className="report-heading">Compliance report</h2>
              <Report report={entry.report} />
            </>
          ) : (
            <div className="report-empty">
              <p>
                No stored report found for session <strong>{sessionId || "(none)"}</strong>. It may
                have been cleared from history, or never analyzed in this browser.
              </p>
              <p>
                <a
                  href="/history"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate("/history");
                  }}
                >
                  Back to history
                </a>
              </p>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
