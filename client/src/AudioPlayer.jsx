import { useEffect, useRef, useState } from "react";

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// One shared, styled compact player replacing raw browser <audio controls>
// widgets throughout the app - see judging-criteria-and-enterprise-gap-assessment.md
// item 7 (seven stacked default grey pills read as a debug scaffold).
export default function AudioPlayer({ src, audioRef, compact = false }) {
  const internalRef = useRef(null);
  const ref = audioRef ?? internalRef;
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

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

  const togglePlay = () => {
    const audio = ref.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch((err) => console.error("Audio playback failed:", err));
    else audio.pause();
  };

  const onScrub = (e) => {
    const audio = ref.current;
    if (!audio || !duration) return;
    audio.currentTime = (Number(e.target.value) / 100) * duration;
  };

  const progress = duration ? (current / duration) * 100 : 0;

  return (
    <div className={`audio-player ${compact ? "audio-player-compact" : ""}`}>
      <audio ref={ref} src={src} preload={compact ? "none" : "metadata"} hidden />
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
      {!compact && (
        <span className="audio-player-time">
          {formatTime(current)} / {formatTime(duration)}
        </span>
      )}
    </div>
  );
}
