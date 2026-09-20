import { useRef, useState } from "react";
import { AppShell } from "./Chrome";
import { findEntryBySessionId } from "./reportHistory";
import { SAMPLE_AUDIO_URLS } from "./sampleSessions";
import { getLiveAudioBlob } from "./liveAudioBlobs";
import { Report, Timestamp, formatTMs } from "./Dashboard";
import AudioPlayer from "./AudioPlayer";
import { SEVERITY_LABEL, VERDICT_CLASS } from "./compliance";
import "./App.css";

function formatWhen(iso) {
  if (!iso) return "unknown start time";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function resolveAudioUrl(entry) {
  if (!entry) return null;
  if (entry.audioKey) return SAMPLE_AUDIO_URLS[entry.audioKey] ?? null;
  return getLiveAudioBlob(entry.sessionId);
}

function CallTab({ entry, audioUrl, audioRef, onSeek }) {
  return (
    <div className="section-block">
      {audioUrl ? (
        <div className="report-audio">
          <AudioPlayer src={audioUrl} audioRef={audioRef} />
        </div>
      ) : entry.source === "live" ? (
        <p className="hint">This was a live call - audio is never stored, only the transcript.</p>
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
  const [entry] = useState(() => findEntryBySessionId(sessionId));
  const [tab, setTab] = useState("call");
  const [shareCopied, setShareCopied] = useState(false);
  const audioRef = useRef(null);

  const audioUrl = resolveAudioUrl(entry);

  const onSeek = (tMs) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = tMs / 1000;
    audio.play();
  };

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
              {SEVERITY_LABEL[entry.verdictLevel] ?? entry.verdictLabel}
            </span>
          </div>
          <div className="sample-actions">
            <button type="button" className="btn btn-outline" onClick={onShare}>
              {shareCopied ? "Copied!" : "Share"}
            </button>
            <button type="button" className="btn btn-outline" onClick={onDownload}>
              Download JSON
            </button>
          </div>
        </div>
        <p className="hint">Share copies a link that only opens this session's report in this browser.</p>

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
          <Report report={entry.report} />
        )}
      </section>
    </AppShell>
  );
}
