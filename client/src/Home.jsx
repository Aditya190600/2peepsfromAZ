import { useEffect, useRef, useState } from "react";
import { NORTHSTAR_SESSIONS, NORTHSTAR_SESSION_KEYS } from "./sampleSessions";
import { Nav, Footer } from "./Chrome";
import { saveHistoryEntry } from "./reportHistory";
import { headlineVerdict } from "./compliance";
import { analyze, mapWithConcurrency, fetchBootStatus } from "./analyzeClient";
import { FleetView, Report, sampleLabel } from "./Dashboard";
import "./App.css";

const GENERIC_PACKS = ["generic"];

export default function Home({ navigate, path }) {
  const [fleetResults, setFleetResults] = useState([]);
  const [fleetLoading, setFleetLoading] = useState(true);
  const [fleetProgress, setFleetProgress] = useState({ done: 0, total: NORTHSTAR_SESSION_KEYS.length });
  const [fleetError, setFleetError] = useState(null);
  const [bootWarning, setBootWarning] = useState(null);
  const started = useRef(false);

  useEffect(() => {
    document.title = "ComplyLine";
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function runNorthstar() {
      setFleetLoading(true);
      setFleetError(null);
      setFleetResults([]);
      setFleetProgress({ done: 0, total: NORTHSTAR_SESSION_KEYS.length });
      try {
        const boot = await fetchBootStatus();
        if (boot && boot.ok === false) {
          setBootWarning(boot.error ?? "The Northstar program cache is not ready.");
        }
        const reports = await mapWithConcurrency(
          NORTHSTAR_SESSION_KEYS,
          2,
          async (key) => {
            try {
              return { key, report: await analyze(NORTHSTAR_SESSIONS[key], GENERIC_PACKS) };
            } catch (err) {
              return { key, error: err.message ?? "This session could not be analyzed." };
            }
          },
          (done, total) => setFleetProgress({ done, total })
        );
        const results = reports.filter((row) => row.report);
        if (results.length === 0) {
          setFleetError(
            boot?.error ?? "The program could not be analyzed. No session reports were returned."
          );
          setFleetResults(null);
          return;
        }
        if (results.length === NORTHSTAR_SESSION_KEYS.length) {
          setBootWarning(null);
        }
        setFleetResults(results);
        for (const { key, report } of results) {
          const verdict = headlineVerdict(report.findings);
          saveHistoryEntry({
            timestamp: new Date().toISOString(),
            label: sampleLabel(key),
            sessionId: report.sessionId,
            verdictLevel: verdict.level,
            verdictLabel: verdict.label,
            report,
          });
        }
      } catch (err) {
        setFleetError(err.message ?? "Something went wrong running the fleet analysis.");
        setFleetResults(null);
      } finally {
        setFleetLoading(false);
        setFleetProgress(null);
      }
    }

    runNorthstar();
  }, []);

  return (
    <div className="page">
      <Nav path={path} navigate={navigate} />
      <header className="masthead">
        <p className="tenant-line">
          Reviewing sessions for <strong>Northstar Voice</strong> ·{" "}
          <span className="tenant-contact">legal@northstarvoice.com</span>
        </p>
        <p className="tagline">
          Post-call compliance review for AI voice agents. This page is the program queue. Live
          calls, uploads, and samples live on Try.
        </p>
      </header>

      <main className="layout">
        <section className="panel report-panel">
          <h2>Fleet compliance report</h2>
          {bootWarning && fleetResults?.length > 0 && (
            <p className="error-banner">{bootWarning}</p>
          )}
          {fleetError ? (
            <Report report={null} error={fleetError} />
          ) : fleetLoading && fleetResults.length === 0 ? (
            <Report report={null} loading />
          ) : fleetResults?.length ? (
            <FleetView results={fleetResults} progress={fleetProgress} />
          ) : (
            <Report report={null} idleMessage="The program could not be analyzed." />
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
