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
            <>
              <h2 className="report-heading">Compliance report</h2>
              <Report
                report={null}
                idleMessage={`No stored report found for session ${sessionId || "(none)"}. It may have been cleared from history, or never analyzed in this browser.`}
              />
              <p>
                <a
                  href="/sessions"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate("/sessions");
                  }}
                >
                  Back to sessions
                </a>
              </p>
            </>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
