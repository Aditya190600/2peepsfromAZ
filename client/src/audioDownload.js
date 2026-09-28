export function buildDownloadJson(turns, markers, downloadJson) {
  if (downloadJson) return downloadJson;
  return {
    turns: turns ?? [],
    markers: markers ?? [],
  };
}

export function guessAudioExtension(src, blob) {
  if (blob?.type) {
    const fromType = {
      "audio/webm": "webm",
      "audio/wav": "wav",
      "audio/x-wav": "wav",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
    }[blob.type];
    if (fromType) return fromType;
  }
  try {
    const base = typeof window !== "undefined" ? window.location.href : "https://example.com";
    const pathname = new URL(src, base).pathname;
    const ext = pathname.split(".").pop()?.toLowerCase();
    if (ext && ext.length <= 5 && !ext.includes("/")) return ext;
  } catch {
    // relative or invalid URL - fall through
  }
  return "audio";
}

export function triggerBrowserDownload(url, filename) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export async function resolveAudioBlob(src, waveformBlob) {
  if (waveformBlob) return waveformBlob;
  const response = await fetch(src);
  if (!response.ok) throw new Error("Could not fetch audio for download.");
  return response.blob();
}
