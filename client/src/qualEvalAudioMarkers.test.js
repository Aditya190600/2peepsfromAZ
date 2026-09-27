import { test } from "node:test";
import assert from "node:assert/strict";
import { runToAudioMarkers } from "./qualEvalAudioMarkers.js";

test("runToAudioMarkers maps turns to turn markers and failed criteria to flag markers", () => {
  const markers = runToAudioMarkers({
    transcript: {
      turns: [
        { role: "user", text: "Hello", tMs: 0 },
        { role: "agent", text: "Hi there", tMs: 2000 },
      ],
    },
    criterionResults: [
      { criterion: "Greets caller", met: true, explanation: "Agent responded promptly." },
      {
        criterion: "Verifies identity",
        met: false,
        explanation: 'Turn 1: agent said "Hi there" without verifying the caller.',
      },
    ],
    evidenceQuotes: [{ quote: "Hi there", turnIndex: 1 }],
  });

  assert.deepEqual(markers, [
    { tMs: 0, kind: "turn", label: "Caller: Hello" },
    { tMs: 2000, kind: "turn", label: "Agent: Hi there" },
    {
      tMs: 2000,
      kind: "flag",
      label: 'Turn 1: agent said "Hi there" without verifying the caller.',
    },
  ]);
});
