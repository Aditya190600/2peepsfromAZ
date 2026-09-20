// Guards the audioKey wiring behind the Call tab's audio player
// (SessionInspector.jsx's resolveAudioUrl, issue #73): SAMPLE_AUDIO_URLS must
// only ever point at a real mp3, and every playable key must have a session
// and a resolvable buildHistoryEntry audioKey (reportHistory.js, issue #72),
// or the player silently never appears.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SAMPLE_SESSIONS, SAMPLE_AUDIO_URLS, PLAYABLE_SAMPLE_KEYS } from "./sampleSessions.js";
import { buildHistoryEntry } from "./reportHistory.js";

const SAMPLES_DIR = fileURLToPath(new URL("../public/samples/", import.meta.url));

test("every SAMPLE_AUDIO_URLS entry has a real mp3 and a matching session", () => {
  assert.ok(Object.keys(SAMPLE_AUDIO_URLS).length > 0);
  for (const [key, url] of Object.entries(SAMPLE_AUDIO_URLS)) {
    assert.equal(url, `/samples/${key}.mp3`);
    assert.ok(SAMPLE_SESSIONS[key], `${key} must exist in SAMPLE_SESSIONS`);
    assert.ok(existsSync(`${SAMPLES_DIR}${key}.mp3`), `${key}.mp3 must exist in public/samples`);
  }
});

test("every recorded sample mp3 is wired into SAMPLE_AUDIO_URLS", () => {
  const mp3Keys = readdirSync(SAMPLES_DIR)
    .filter((f) => f.endsWith(".mp3"))
    .map((f) => f.replace(/\.mp3$/, ""));
  assert.ok(mp3Keys.length > 0);
  for (const key of mp3Keys) {
    assert.ok(SAMPLE_AUDIO_URLS[key], `${key}.mp3 exists on disk but has no SAMPLE_AUDIO_URLS entry`);
  }
});

test("a playable sample's history entry carries an audioKey that resolves to a real URL", () => {
  for (const key of PLAYABLE_SAMPLE_KEYS) {
    const session = SAMPLE_SESSIONS[key];
    const report = { sessionId: session.sessionId, findings: [] };
    const entry = buildHistoryEntry({
      label: key,
      report,
      session,
      verdict: { level: "clear", label: "Clear" },
      audioKey: key,
    });
    assert.equal(entry.audioKey, key);
    assert.ok(SAMPLE_AUDIO_URLS[entry.audioKey], `${key}'s audioKey must resolve via SAMPLE_AUDIO_URLS`);
  }
});
