import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDownloadJson, guessAudioExtension } from "./audioDownload.js";

describe("audioDownload", () => {
  it("builds default JSON from turns and markers", () => {
    assert.deepEqual(buildDownloadJson([{ role: "user", text: "hi" }], [{ tMs: 0 }], null), {
      turns: [{ role: "user", text: "hi" }],
      markers: [{ tMs: 0 }],
    });
  });

  it("uses a caller override payload when provided", () => {
    assert.deepEqual(buildDownloadJson([], [], { sessionId: "abc" }), { sessionId: "abc" });
  });

  it("guesses audio extensions from blob type or URL", () => {
    assert.equal(guessAudioExtension("/x", { type: "audio/webm" }), "webm");
    assert.equal(guessAudioExtension("/x", { type: "audio/webm;codecs=opus" }), "webm");
    assert.equal(guessAudioExtension("/v1/qualeval/runs/run_1/audio.wav", null), "wav");
    assert.equal(guessAudioExtension("/stream", null), "audio");
  });
});
