import { useEffect, useRef, useState } from "react";
import { AppShell } from "./Chrome";
import {
  buildHistoryEntry,
  findEntryBySessionId,
  historyEntrySession,
  saveHistoryEntry,
} from "./reportHistory";
import { analyze, shareRecording } from "./analyzeClient";
import { resolveAudioUrl } from "./audioResolve";
import { seekAudio } from "./seek";
import { Report, Timestamp, formatTMs } from "./Dashboard";
import AudioPlayer from "./AudioPlayer";
import { VERDICT_CLASS, headlineVerdict } from "./compliance";
import "./App.css";

function formatWhen(iso) {
  if (!iso) return "unknown start time";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function CallTab({ entry, audioUrl, audioRef, onSeek }) {
  return (
    <div className="section-block">
      {audioUrl ? (
        <div className="report-audio">
          <AudioPlayer src={audioUrl} audioRef={audioRef} />
        </div>
      ) : entry.source === "live" ? (
        <p className="hint">
          This was a live call - audio is stored only when "Record this call" is checked, so only
          the transcript is available here.
        </p>
      ) : entry.source === "pstn" ? (
        <p className="hint">Phone audio is not stored. This is the transcript posted when the call ended.</p>
      ) : null}
      <ul className="transcript">
        {(entry.turns ?? []).map((t, i) => (
          <li key={i}>
            <span className="transcript-role">{t.role}</span>
            {t.text}
            <Timestamp tMs={t.tMs} onSeek={audioUrl ? onSeek : null} />
          </li>
        ))}
      </ul>
      {(entry.turns ?? []).length === 0 && <p className="transcript-empty">No turns recorded.</p>}
    </div>
  );
}

export default function SessionInspector({ navigate, path, sessionId }) {
  const [entry, setEntry] = useState(() => findEntryBySessionId(sessionId));
  const [loading, setLoading] = useState(() => !findEntryBySessionId(sessionId));
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [tab, setTab] = useState("call");

  useEffect(() => {
    const local = findEntryBySessionId(sessionId);
    if (local) {
      setEntry(local);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/v1/telephony/sessions/${encodeURIComponent(sessionId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setEntry(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setEntry(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);
  const [shareCopied, setShareCopied] = useState(false);
  const [audioShareStatus, setAudioShareStatus] = useState(null);
  const audioRef = useRef(null);

  const audioUrl = resolveAudioUrl(entry);

  const onSeek = (tMs) => seekAudio(audioRef, tMs);

  const onShare = async () => {
    const url = `${window.location.origin}/sessions/${encodeURIComponent(sessionId ?? "")}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // clipboard API unavailable (permissions, insecure context) - the URL is
      // still shown in the address bar, this is a convenience copy only
    }
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  const onGenerateReport = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const session = historyEntrySession(entry);
      const report = await analyze(session, entry.patternPackIds ?? ["generic"]);
      const nextEntry = {
        ...buildHistoryEntry({
          label: entry.label,
          session,
          report,
          verdict: headlineVerdict(report.findings),
          durationMs: entry.durationMs,
          source: entry.source,
          patternPackIds: entry.patternPackIds,
          recordingUrl: entry.recordingUrl,
        }),
        id: entry.id,
      };
      saveHistoryEntry(nextEntry);
      setEntry(nextEntry);
    } catch (err) {
      setGenerateError(err.message ?? "Something went wrong generating this report.");
    } finally {
      setGenerating(false);
    }
  };

  const onShareWithAudio = async () => {
    try {
      const url = `${window.location.origin}${await shareRecording(entry.sessionId)}`;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        window.prompt("Copy this play-only recording link:", url);
      }
      setAudioShareStatus("Copied!");
    } catch (err) {
      setAudioShareStatus(err.message);
    }
    setTimeout(() => setAudioShareStatus(null), 2000);
  };

  const onDownload = () => {
    const payload = {
      sessionId: entry.sessionId,
      label: entry.label,
      startedAt: entry.startedAt,
      durationMs: entry.durationMs,
      turnCount: entry.turnCount,
      turns: entry.turns,
      findings: entry.findings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-${entry.sessionId ?? sessionId ?? "export"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const actions = (
    <a
      className="btn btn-outline"
      href="/sessions"
      onClick={(e) => {
        e.preventDefault();
        navigate("/sessions");
      }}
    >
      Back to sessions
    </a>
  );

  if (loading) {
    return (
      <AppShell path={path} navigate={navigate} title="Session" actions={actions}>
        <p className="app-lede">Loading session.</p>
      </AppShell>
    );
  }

  if (!entry) {
    return (
      <AppShell path={path} navigate={navigate} title="Session" actions={actions}>
        <div className="report-state is-idle">
          <span className="report-verdict finding-status is-idle">Not found</span>
          <p>
            No stored session found for id {sessionId || "(none)"}. It may have been cleared from
            history, or never analyzed in this browser - history is per-browser, not shared.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell path={path} navigate={navigate} title={entry.label ?? "Session"} actions={actions}>
      <section className="panel report-panel">
        <div className="report-toolbar">
          <div>
            <p className="report-meta mono">{entry.sessionId ?? "no session id"}</p>
            <p className="report-meta">
              Started {formatWhen(entry.startedAt)} · duration {formatTMs(entry.durationMs ?? 0)} ·{" "}
              {entry.turnCount ?? (entry.turns ?? []).length} turns
            </p>
            <span className={`finding-status ${VERDICT_CLASS[entry.verdictLevel] ?? "is-review"}`}>
              {entry.verdictLabel}
            </span>
          </div>
          <div className="sample-actions">
            {entry.pending && (
              <button type="button" className="btn btn-outline" onClick={onGenerateReport} disabled={generating}>
                {generating ? "Generating report…" : "Generate report"}
              </button>
            )}
            <button type="button" className="btn btn-outline" onClick={onShare}>
              {shareCopied ? "Copied!" : "Share"}
            </button>
            {entry.recordingUrl && (
              <button type="button" className="btn btn-outline" onClick={onShareWithAudio}>
                {audioShareStatus ?? "Share with audio"}
              </button>
            )}
            <button type="button" className="btn btn-outline" onClick={onDownload}>
              Download JSON
            </button>
          </div>
        </div>
        {generateError && <p className="error-banner">{generateError}</p>}
        <p className="hint">
          {entry.source === "pstn"
            ? "This link reopens the phone session from this server."
            : "Share copies a link that only opens this session's report in this browser."}
          {entry.recordingUrl && " Share with audio copies a private, play-only link to this call's recording."}
        </p>

        <div className="tab-bar">
          <button
            type="button"
            className={`tab-btn ${tab === "call" ? "is-active" : ""}`}
            onClick={() => setTab("call")}
          >
            Call
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === "evaluation" ? "is-active" : ""}`}
            onClick={() => setTab("evaluation")}
          >
            Evaluation
          </button>
        </div>

        {tab === "call" ? (
          <CallTab entry={entry} audioUrl={audioUrl} audioRef={audioRef} onSeek={onSeek} />
        ) : (
          <Report
            report={entry.report}
            loading={generating}
            idleMessage="This call's report hasn't been generated yet. Click Generate report above."
          />
        )}
      </section>
    </AppShell>
  );
}
