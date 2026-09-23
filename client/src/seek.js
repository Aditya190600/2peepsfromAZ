// Shared by Dashboard's live/sample report and SessionInspector's stored
// report - clicking a finding's timestamp (Timestamp component in
// Dashboard.jsx) jumps the audio player there and resumes playback.
export function seekAudio(audioRef, tMs) {
  const audio = audioRef.current;
  if (!audio) return;
  audio.currentTime = tMs / 1000;
  audio.play();
}
