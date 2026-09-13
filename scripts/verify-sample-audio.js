#!/usr/bin/env node
// Regression check for the AudioPlayer "no supported sources" bug: every
// sample MP3 that client/src/sampleSessions.js expects at /samples/<key>.mp3
// must actually exist on disk (they're gitignored via *.mp3, with a
// client/public/samples/*.mp3 re-include - see scripts/generate-sample-audio.py).
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SAMPLES_DIR = path.join(ROOT, "client", "public", "samples");
const manifest = JSON.parse(fs.readFileSync(path.join(SAMPLES_DIR, "manifest.json"), "utf8"));

const missing = manifest
  .map((entry) => path.join(ROOT, entry.path))
  .filter((filePath) => !fs.existsSync(filePath) || fs.statSync(filePath).size === 0);

if (missing.length > 0) {
  console.error("Missing/empty sample audio files:");
  for (const filePath of missing) console.error(`  ${filePath}`);
  console.error("\nRun: python3 scripts/generate-sample-audio.py");
  process.exit(1);
}

console.log(`OK: all ${manifest.length} sample audio files present.`);
