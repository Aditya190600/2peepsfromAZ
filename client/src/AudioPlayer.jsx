import { useEffect, useRef, useState } from "react";
import {
  buildDownloadJson,
  guessAudioExtension,
  resolveAudioBlob,
  triggerBrowserDownload,
} from "./audioDownload.js";
import { computeDualPeaks, WAVEFORM_BUCKETS } from "./audioPeaks";
import { seekAudio } from "./seek";

const PLAYBACK_RATES = [1, 1.25, 1.5, 2];
const AGENT_COLOR = "#662222";
const USER_COLOR = "#888888";
const AGENT_DIM = "#441818";
const USER_DIM = "#555555";
const PLAYHEAD_COLOR = "#ffffff";
const SILENT_THRESHOLD = 0.02;

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function groupMarkersByTime(markers) {
  const byTime = new Map();
  for (const marker of markers) {
    if (marker.tMs == null) continue;
    const label = marker.label?.trim();
    const prev = byTime.get(marker.tMs);
    if (!prev) {
      byTime.set(marker.tMs, {
        tMs: marker.tMs,
        kind: marker.kind,
        flagLabels: marker.kind === "flag" && label ? [label] : [],
        turnLabels: marker.kind === "turn" && label ? [label] : [],
      });
      continue;
    }
    if (marker.kind === "flag") {
      if (label && !prev.flagLabels.includes(label)) prev.flagLabels.push(label);
      prev.kind = "flag";
    } else if (label && !prev.turnLabels.includes(label)) {
      prev.turnLabels.push(label);
    }
  }
  return [...byTime.values()].map((group) => ({
    tMs: group.tMs,
    kind: group.kind,
    labels: group.kind === "flag" ? group.flagLabels : group.turnLabels,
  }));
}

function drawTrackBars(ctx, peaks, xStart, trackTop, trackHeight, color, dimColor, progressX, growUp) {
  const width = ctx.canvas.width / (window.devicePixelRatio || 1);
  const barWidth = width / peaks.length;
  const baseline = growUp ? trackTop + trackHeight - 3 : trackTop + 3;
  const maxBar = trackHeight * 0.42;

  for (let i = 0; i < peaks.length; i++) {
    const x = xStart + i * barWidth + barWidth / 2;
    const peak = peaks[i];
    const played = x < progressX;
    const colorForBar = played ? color : dimColor;

    if (peak < SILENT_THRESHOLD) {
      ctx.fillStyle = played ? color : dimColor;
      ctx.beginPath();
      ctx.arc(x, baseline, 1.2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    const barH = Math.max(2, peak * maxBar);
    ctx.strokeStyle = colorForBar;
    ctx.lineWidth = Math.max(2, barWidth * 0.55);
    ctx.lineCap = "round";
    ctx.beginPath();
    if (growUp) {
      ctx.moveTo(x, baseline);
      ctx.lineTo(x, baseline - barH);
    } else {
      ctx.moveTo(x, baseline);
      ctx.lineTo(x, baseline + barH);
    }
    ctx.stroke();
  }
}

function drawDualWaveform(canvas, dualPeaks, progress) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (!dualPeaks) return;

  const gap = 4;
  const trackHeight = (height - gap) / 2;
  const progressX = width * (Number.isFinite(progress) ? progress : 0);
  const centerY = height / 2;

  drawTrackBars(ctx, dualPeaks.agent, 0, 0, trackHeight, AGENT_COLOR, AGENT_DIM, progressX, true);
  drawTrackBars(
    ctx,
    dualPeaks.user,
    0,
    trackHeight + gap,
    trackHeight,
    USER_COLOR,
    USER_DIM,
    progressX,
    false,
  );

  ctx.strokeStyle = PLAYHEAD_COLOR;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(progressX, 2);
  ctx.lineTo(progressX, height - 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(progressX, centerY, 5, 0, Math.PI * 2);
  ctx.strokeStyle = PLAYHEAD_COLOR;
  ctx.lineWidth = 2;
  ctx.fillStyle = "#1a1a1a";
  ctx.fill();
  ctx.stroke();
}

// Role and start time are the only turn fields that change speaker tracks.
// A new array with the same intervals (QualEval's poll rebuilds run objects)
// must not count as a waveform input change.
function speakerTurnsKey(turns) {
  if (!turns?.length) return "";
  return turns.map((turn) => `${turn.role}:${turn.tMs}`).join("|");
}

// One shared, styled compact player replacing raw browser <audio controls>
// widgets throughout the app - see judging-criteria-and-enterprise-gap-assessment.md
// item 7 (seven stacked default grey pills read as a debug scaffold).
//
// Full mode: dark dual-track waveform (agent upper, user lower) with click-to-seek.
// Compact mode: simple row with range scrubber for live-call previews.
export default function AudioPlayer({
  src,
  audioRef,
  compact = false,
  markers = [],
  offsetMs = 0,
  turns = null,
  // When src is a blob: URL, callers that still hold the Blob can pass it here
  // so waveform decode reads bytes directly instead of fetch(blob:).
  waveformBlob = null,
  // Base name for downloaded files (no extension). Defaults to "recording".
  downloadFilenameBase = "recording",
  // Optional JSON payload override for the download menu.
  downloadJson = null,
}) {
  const internalRef = useRef(null);
  const ref = audioRef ?? internalRef;
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const downloadWrapRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [dualPeaks, setDualPeaks] = useState(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [waveformBuffer, setWaveformBuffer] = useState(null);
  const speakerKey = speakerTurnsKey(turns);
  const drawStateRef = useRef({ dualPeaks: null, current: 0, duration: 0 });
  drawStateRef.current = { dualPeaks, current, duration };

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    const onTime = () => setCurrent(audio.currentTime);
    const onLoaded = () => setDuration(audio.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [src, ref]);

  useEffect(() => {
    const audio = ref.current;
    if (audio) audio.playbackRate = playbackRate;
  }, [playbackRate, src, ref]);

  useEffect(() => {
    setWaveformBuffer(null);
    if (compact || !src) return undefined;
    let cancelled = false;
    let ctx = null;
    (async () => {
      try {
        let buf;
        if (waveformBlob) {
          buf = await waveformBlob.arrayBuffer();
        } else {
          const res = await fetch(src);
          buf = await res.arrayBuffer();
        }
        const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextImpl) return;
        ctx = new AudioContextImpl();
        const decoded = await ctx.decodeAudioData(buf);
        if (cancelled) return;
        setWaveformBuffer(decoded);
      } catch (err) {
        console.error("Waveform decode failed:", err);
      } finally {
        ctx?.close?.().catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, compact, waveformBlob]);

  // Speaker split is cheap and uses the already-decoded buffer. `speakerKey`
  // (not the turns array) is the dependency so a new array with the same
  // intervals does not blank or re-decode the waveform. `offsetMs` lines
  // session-relative turns up with a recording that started late.
  useEffect(() => {
    if (!waveformBuffer) {
      setDualPeaks(null);
      return;
    }
    setDualPeaks(computeDualPeaks(waveformBuffer, turns, WAVEFORM_BUCKETS, undefined, offsetMs));
    // `speakerKey` is the content of `turns` this effect should react to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveformBuffer, speakerKey, offsetMs]);

  useEffect(() => {
    if (compact) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const progress = duration ? current / duration : 0;
    drawDualWaveform(canvas, dualPeaks, progress);
  }, [dualPeaks, current, duration, compact]);

  useEffect(() => {
    if (compact) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const onResize = () => {
      const { dualPeaks: p, current: c, duration: d } = drawStateRef.current;
      drawDualWaveform(canvas, p, d ? c / d : 0);
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [compact]);

  const togglePlay = () => {
    const audio = ref.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch((err) => console.error("Audio playback failed:", err));
    else audio.pause();
  };

  const cycleRate = () => {
    setPlaybackRate((prev) => {
      const idx = PLAYBACK_RATES.indexOf(prev);
      return PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
    });
  };

  useEffect(() => {
    if (!downloadMenuOpen) return undefined;
    const onPointerDown = (event) => {
      if (downloadWrapRef.current?.contains(event.target)) return;
      setDownloadMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [downloadMenuOpen]);

  const downloadPayload = buildDownloadJson(turns, markers, downloadJson);
  const filenameBase = downloadFilenameBase || "recording";

  const downloadAudioFile = async () => {
    const blob = await resolveAudioBlob(src, waveformBlob);
    const ext = guessAudioExtension(src, blob);
    const url = URL.createObjectURL(blob);
    try {
      triggerBrowserDownload(url, `${filenameBase}.${ext}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const downloadJsonFile = () => {
    const blob = new Blob([JSON.stringify(downloadPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    try {
      triggerBrowserDownload(url, `${filenameBase}.json`);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const runDownload = async (mode) => {
    setDownloadBusy(true);
    try {
      if (mode === "audio" || mode === "both") await downloadAudioFile();
      if (mode === "json" || mode === "both") downloadJsonFile();
      setDownloadMenuOpen(false);
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloadBusy(false);
    }
  };

  const onScrub = (e) => {
    const audio = ref.current;
    if (!audio || !duration) return;
    audio.currentTime = (Number(e.target.value) / 100) * duration;
  };

  const onMarkerClick = (marker) => seekAudio(ref, marker.tMs, offsetMs);

  const onWaveformClick = (e) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    seekAudio(ref, fraction * duration * 1000 + offsetMs, offsetMs);
  };

  const progress = duration ? (current / duration) * 100 : 0;
  const rateLabel = playbackRate === 1 ? "1x" : `${playbackRate}x`;

  if (compact) {
    return (
      <div className="audio-player audio-player-compact">
        <div className="audio-player-controls">
          <audio ref={ref} src={src} preload="none" hidden />
          <button
            type="button"
            className="audio-player-toggle"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <input
            type="range"
            className="audio-player-scrub"
            min="0"
            max="100"
            value={Number.isFinite(progress) ? progress : 0}
            onChange={onScrub}
            aria-label="Seek"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="audio-player audio-player-dual">
      <audio ref={ref} src={src} preload="metadata" hidden />
      <button
        type="button"
        className="audio-player-toggle audio-player-toggle-dual"
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="audio-player-waveform-wrap" ref={containerRef}>
        <canvas ref={canvasRef} className="audio-player-waveform" onClick={onWaveformClick} />
        {duration > 0 &&
          groupMarkersByTime(markers.filter((m) => m.tMs != null && m.tMs - offsetMs >= 0)).map(
            (m, i) => {
              const relSeconds = (m.tMs - offsetMs) / 1000;
              const left = `${Math.min(100, Math.max(0, (relSeconds / duration) * 100))}%`;
              const isFlag = m.kind === "flag";
              const tooltipId = `audio-marker-tip-${i}`;
              return (
                <div key={`${m.tMs}-${i}`} className="audio-marker-wrap" style={{ left }}>
                  <button
                    type="button"
                    className={`audio-marker ${isFlag ? "is-flag" : "is-turn"}`}
                    aria-describedby={isFlag && m.labels.length > 0 ? tooltipId : undefined}
                    title={
                      !isFlag || m.labels.length === 0 ? (m.labels[0] ?? formatTime(relSeconds)) : undefined
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkerClick(m);
                    }}
                  />
                  {isFlag && m.labels.length > 0 && (
                    <span id={tooltipId} role="tooltip" className="audio-marker-tooltip">
                      {m.labels.length === 1 ? (
                        m.labels[0]
                      ) : (
                        <ul>
                          {m.labels.map((label) => (
                            <li key={label}>{label}</li>
                          ))}
                        </ul>
                      )}
                    </span>
                  )}
                </div>
              );
            },
          )}
      </div>
      <span className="audio-player-time audio-player-time-dual">
        {formatTime(current)} / {formatTime(duration)}
      </span>
      <button type="button" className="audio-player-rate" onClick={cycleRate} aria-label="Playback speed">
        {rateLabel}
      </button>
      {src && (
        <div className="audio-player-download-wrap" ref={downloadWrapRef}>
          <button
            type="button"
            className="audio-player-download"
            onClick={() => setDownloadMenuOpen((open) => !open)}
            aria-label="Download"
            aria-haspopup="menu"
            aria-expanded={downloadMenuOpen}
            disabled={downloadBusy}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M7 1.5v7M4 6.5 7 9.5 10 6.5M2.5 11.5h9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {downloadMenuOpen && (
            <div className="audio-player-download-menu" role="menu">
              <button type="button" role="menuitem" disabled={downloadBusy} onClick={() => runDownload("audio")}>
                Download audio
              </button>
              <button type="button" role="menuitem" disabled={downloadBusy} onClick={() => runDownload("json")}>
                Download JSON
              </button>
              <button type="button" role="menuitem" disabled={downloadBusy} onClick={() => runDownload("both")}>
                Download both
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
