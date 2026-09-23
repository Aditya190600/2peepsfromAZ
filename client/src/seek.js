// Shared by Dashboard's live/sample report and SessionInspector's stored
// report - clicking a finding's timestamp (Timestamp component in
// Dashboard.jsx) jumps the audio player there and resumes playback.
// `offsetMs` is how far into the session the audio starts (a live-call
// recording only begins once the mic is live, after connect latency).
export function seekAudio(audioRef, tMs, offsetMs = 0) {
  const audio = audioRef.current;
  if (!audio) return;
  audio.currentTime = Math.max(0, tMs - offsetMs) / 1000;
  audio.play();
}
