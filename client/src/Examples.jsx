import { useEffect, useRef, useState } from "react";
import { AppShell } from "./Chrome";
import AudioPlayer from "./AudioPlayer";
import {
  FleetView,
  Report,
  sampleLabel,
  PLAYABLE_SAMPLE_LABEL,
  INDUSTRY_PACKS,
  sessionByKey,
} from "./Dashboard";
import { SAMPLE_SESSIONS, SAMPLE_AUDIO_URLS, SCRIPTED_VIOLATION_DEMO_KEYS } from "./sampleSessions";
import { saveHistoryEntry, buildHistoryEntry, findEntryBySessionId } from "./reportHistory";
import { seekAudio } from "./seek";
import { headlineVerdict } from "./compliance";
import { analyze, diarizeSample, mapWithConcurrency } from "./analyzeClient";
import { listIndustryPacks } from "./evalsClient";
import "./App.css";

const PLAYABLE_KEYS = Object.keys(PLAYABLE_SAMPLE_LABEL);

// Playable samples and scripted violation demos - relocated here from the
// Try page's tabs (PR #125) so a fresh visitor can see a full compliance
// report with zero setup, no sign-in or API key needed (see App.jsx: this
// route is deliberately not wrapped in RequireVisitor). Samples are canned
// fixtures, not live user data, so unlike Try's live/upload/paste actions
// none of the actions below gate on a consent checkbox.
export default function Examples({ navigate, path }) {
  const [selectedPacks, setSelectedPacks] = useState([]);
  const [industryPacks, setIndustryPacks] = useState(INDUSTRY_PACKS);
  const [packCatalogStale, setPackCatalogStale] = useState(false);
  const [report, setReport] = useState(null);
  const [fleetResults, setFleetResults] = useState(null);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [fleetProgress, setFleetProgress] = useState(null);
  const [fleetError, setFleetError] = useState(null);
  const [activeAudioUrl, setActiveAudioUrl] = useState(null);
  const [sampleLoadingKey, setSampleLoadingKey] = useState(null);
  const [sampleError, setSampleError] = useState(null);
  const [diarizeStatus, setDiarizeStatus] = useState("idle"); // idle | uploading | error
  const [diarizeError, setDiarizeError] = useState(null);
  const [sampleTab, setSampleTab] = useState("samples"); // samples | scripted | fleet
  const audioRef = useRef(null);

  const patternPackIds = ["generic", ...selectedPacks];

  useEffect(() => {
    let cancelled = false;
    listIndustryPacks()
      .then((packs) => {
        if (!cancelled && packs.length > 0) setIndustryPacks(packs);
      })
      .catch(() => {
        if (!cancelled) setPackCatalogStale(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const togglePack = (id) => {
    setSelectedPacks((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const showAudio = (url) => setActiveAudioUrl(url);
  const onSeek = (tMs) => seekAudio(audioRef, tMs, 0);

  const clearErrors = () => {
    setSampleError(null);
    setFleetError(null);
    setDiarizeStatus("idle");
    setDiarizeError(null);
  };

  const recordHistory = (label, report, session, opts = {}) => {
    const verdict = headlineVerdict(report.findings);
    saveHistoryEntry(buildHistoryEntry({ label, report, session, verdict, ...opts }));
  };

  const runSample = async (key) => {
    setFleetResults(null);
    clearErrors();
    setSampleLoadingKey(key);
    showAudio(SAMPLE_AUDIO_URLS[key] && PLAYABLE_SAMPLE_LABEL[key] ? SAMPLE_AUDIO_URLS[key] : null);
    try {
      const session = sessionByKey(key);
      const nextReport = await analyze(session, patternPackIds);
      setReport(nextReport);
      recordHistory(sampleLabel(key), nextReport, session, {
        audioKey: PLAYABLE_SAMPLE_LABEL[key] ? key : undefined,
      });
    } catch (err) {
      setSampleError(err.message ?? "Something went wrong generating this report.");
      setReport(null);
    } finally {
      setSampleLoadingKey(null);
    }
  };

  const openStoredOrRunSample = (key) => {
    const entry = findEntryBySessionId(SAMPLE_SESSIONS[key]?.sessionId);
    if (!entry?.report) {
      runSample(key);
      return;
    }
    setFleetResults(null);
    clearErrors();
    showAudio(entry.audioKey ? SAMPLE_AUDIO_URLS[entry.audioKey] ?? null : null);
    setReport(entry.report);
  };

  // Runs a playable sample's MP3 through the real diarization pipeline (not
  // the canned SAMPLE_SESSIONS text path) via the unauthenticated
  // /v1/examples/diarize/:key route, so the demo can prove speaker_labels
  // produces multi-turn timestamps with zero setup.
  const runDiarizedSample = async (key) => {
    const url = SAMPLE_AUDIO_URLS[key];
    if (!url) return;
    setFleetResults(null);
    clearErrors();
    setSampleLoadingKey(key);
    setDiarizeStatus("uploading");
    try {
      showAudio(url);
      const { session, report: nextReport } = await diarizeSample(key, patternPackIds);
      setReport(nextReport);
      recordHistory(`${sampleLabel(key)} (speaker-split upload)`, nextReport, session, {
        audioKey: key,
      });
      setDiarizeStatus("idle");
    } catch (err) {
      setDiarizeStatus("error");
      setDiarizeError(err.message ?? "Something went wrong loading this sample.");
    } finally {
      setSampleLoadingKey(null);
    }
  };

  const runFleetOn = async (keys) => {
    setFleetLoading(true);
    clearErrors();
    setReport(null);
    showAudio(null);
    setFleetResults([]);
    setFleetProgress({ done: 0, total: keys.length, tokensUsed: 0, costUsd: 0, costKnown: false, violationCount: 0 });
    try {
      const reports = await mapWithConcurrency(
        keys,
        2,
        (key) =>
          analyze(sessionByKey(key), patternPackIds, (event) =>
            setFleetProgress((prev) =>
              prev
                ? {
                    ...prev,
                    tokensUsed: prev.tokensUsed + (event.usage?.totalTokens ?? 0),
                    costUsd: prev.costUsd + (typeof event.costUsd === "number" ? event.costUsd : 0),
                    costKnown: prev.costKnown || typeof event.costUsd === "number",
                    violationCount: prev.violationCount + (event.status === "flag" ? 1 : 0),
                  }
                : prev
            )
          ),
        (done, total) => setFleetProgress((prev) => (prev ? { ...prev, done, total } : prev))
      );
      const results = keys.map((key, i) => ({ key, report: reports[i] }));
      setFleetResults(results);
      for (const { key, report: r } of results) {
        recordHistory(sampleLabel(key), r, sessionByKey(key), {
          audioKey: PLAYABLE_SAMPLE_LABEL[key] ? key : undefined,
        });
      }
    } catch (err) {
      setFleetError(err.message ?? "Something went wrong running the fleet analysis.");
      setFleetResults(null);
    } finally {
      setFleetLoading(false);
      setFleetProgress(null);
    }
  };

  const reportLoading = sampleLoadingKey != null || (fleetLoading && (!fleetResults || fleetResults.length === 0));
  const reportError = sampleError || (diarizeStatus === "error" ? diarizeError : null) || fleetError;
  const fleetReady = Array.isArray(fleetResults) && fleetResults.length > 0;

  return (
    <AppShell path={path} navigate={navigate} title="Examples">
      <main className="layout">
        <section className="panel session-panel">
          <p className="app-lede">
            Playable samples and scripted violation demos - no sign-in, API key, or live call needed.
            Pick one below to see a full compliance report instantly, or head to{" "}
            <a
              href="/try"
              onClick={(e) => {
                e.preventDefault();
                navigate("/try");
              }}
            >
              Try
            </a>{" "}
            for a live call, webhook sandbox, or pasted transcript.
          </p>

          <div className="section-block">
            <h2>Pattern packs</h2>
            <p className="panel-label">Industry pattern packs (in addition to the generic scan)</p>
            <div className="pack-select">
              {industryPacks.map((pack) => (
                <label className="check-row" key={pack.id}>
                  <input
                    type="checkbox"
                    checked={selectedPacks.includes(pack.id)}
                    onChange={() => togglePack(pack.id)}
                  />
                  {pack.name}
                </label>
              ))}
            </div>
            <p className="pack-note">Drop-in extensions over the generic scan — no core changes.</p>
            {packCatalogStale && (
              <p className="pack-note">
                Pack catalog did not load. Checkboxes still work. Eval coverage copy may be stale.
              </p>
            )}
          </div>
        </section>

        <section className="panel report-panel">
          <div className="try-actions">
            <div className="tab-bar">
              <button
                type="button"
                className={`tab-btn ${sampleTab === "samples" ? "is-active" : ""}`}
                onClick={() => setSampleTab("samples")}
              >
                Playable samples
              </button>
              <button
                type="button"
                className={`tab-btn ${sampleTab === "scripted" ? "is-active" : ""}`}
                onClick={() => setSampleTab("scripted")}
              >
                Scripted violation demos
              </button>
              <button
                type="button"
                className={`tab-btn ${sampleTab === "fleet" ? "is-active" : ""}`}
                onClick={() => setSampleTab("fleet")}
              >
                Analyze a fleet
              </button>
            </div>

            {sampleTab === "samples" && (
              <div className="section-block tab-panel">
                <p className="pack-note">
                  Analyze uses the canned transcript. Auto-split speakers re-uploads the MP3 so the
                  transcript shows who's talking (agent vs. caller) — use that to demo the upload
                  path without bringing your own file.
                </p>
                <div className="sample-buttons">
                  {PLAYABLE_KEYS.map((key) => (
                    <div key={key} className="sample-row">
                      <div className="sample-actions">
                        <button
                          className="btn btn-outline"
                          onClick={() => openStoredOrRunSample(key)}
                          disabled={sampleLoadingKey === key || diarizeStatus === "uploading"}
                        >
                          {sampleLoadingKey === key && diarizeStatus !== "uploading"
                            ? "Analyzing…"
                            : sampleLabel(key)}
                        </button>
                        <button
                          className="btn btn-outline sample-diarize-btn"
                          onClick={() => runDiarizedSample(key)}
                          disabled={sampleLoadingKey === key || diarizeStatus === "uploading"}
                        >
                          {sampleLoadingKey === key && diarizeStatus === "uploading"
                            ? "Splitting speakers…"
                            : "Auto-split speakers"}
                        </button>
                      </div>
                      <AudioPlayer src={SAMPLE_AUDIO_URLS[key]} compact />
                    </div>
                  ))}
                </div>
                {sampleError && <p className="error-banner">{sampleError}</p>}
                {diarizeStatus === "error" && diarizeError && (
                  <p className="error-banner">{diarizeError}</p>
                )}
              </div>
            )}

            {sampleTab === "scripted" && (
              <div className="section-block tab-panel">
                <p className="pack-note">
                  Two concrete, scripted scenarios built to trip the HIPAA and GLBA pattern packs.
                  Check the matching industry pack above, then Analyze.
                </p>
                <div className="sample-buttons">
                  {SCRIPTED_VIOLATION_DEMO_KEYS.map((key) => (
                    <div key={key} className="sample-row">
                      <div className="sample-actions">
                        <button
                          className="btn btn-outline"
                          onClick={() => openStoredOrRunSample(key)}
                          disabled={sampleLoadingKey === key || diarizeStatus === "uploading"}
                        >
                          {sampleLoadingKey === key ? "Analyzing…" : sampleLabel(key)}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sampleTab === "fleet" && (
              <div className="section-block tab-panel">
                <p className="pack-note">
                  Runs the same compliance analysis used above on all {PLAYABLE_KEYS.length} playable
                  sample calls at once, then rolls the results into one fleet-wide compliance rate and
                  a shared report - a quick way to see how a whole book of calls would score, instead
                  of checking one call at a time.
                </p>
                <button
                  className="btn btn-outline generate-btn"
                  onClick={() => runFleetOn(PLAYABLE_KEYS)}
                  disabled={fleetLoading}
                >
                  {fleetLoading ? "Analyzing…" : `Analyze ${PLAYABLE_KEYS.length} sample sessions`}
                </button>
                {fleetError && <p className="error-banner">{fleetError}</p>}
              </div>
            )}
          </div>

          {fleetReady ? (
            <>
              <h2>Fleet compliance report</h2>
              <FleetView results={fleetResults} progress={fleetProgress} navigate={navigate} />
            </>
          ) : (
            <>
              <h2 className="report-heading">Compliance report</h2>
              <Report
                report={report}
                loading={reportLoading}
                error={reportError}
                audioUrl={activeAudioUrl}
                audioRef={audioRef}
                onSeek={onSeek}
                showStorageNote={Boolean(report) && !reportLoading && !reportError}
                navigate={navigate}
                idleMessage="Pick a sample or scripted demo below to generate a report."
              />
            </>
          )}
        </section>
      </main>
    </AppShell>
  );
}
