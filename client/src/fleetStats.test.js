import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summarizeFleet, monitorTiles } from "./fleetStats.js";

function finding(check, status) {
  return { check, status };
}

function report(sessionId, findings) {
  return { sessionId, findings };
}

describe("summarizeFleet", () => {
  it("counts 10 of 12 passed, 2 flagged, 83%", () => {
    const results = [
      ...Array.from({ length: 10 }, (_, i) => ({
        key: `sess_clean_0${i + 1}`,
        report: report(`sess_clean_0${i + 1}`, [
          finding("consent", "pass"),
          finding("ai_disclosure", "pass"),
        ]),
      })),
      {
        key: "sess_tcpa_04",
        report: report("sess_tcpa_04", [finding("consent", "flag"), finding("ai_disclosure", "pass")]),
      },
      {
        key: "sess_late_01",
        report: report("sess_late_01", [finding("consent", "pass"), finding("ai_disclosure", "flag")]),
      },
    ];
    const stats = summarizeFleet(results);
    assert.equal(stats.total, 12);
    assert.equal(stats.passed, 10);
    assert.equal(stats.flagged, 2);
    assert.equal(stats.complianceRate, 83);
    assert.equal(stats.perCheck.consent.flag, 1);
    assert.equal(stats.perCheck.ai_disclosure.flag, 1);
    assert.deepEqual(
      stats.flaggedRows.map((r) => r.report.sessionId),
      ["sess_tcpa_04", "sess_late_01"]
    );
    const tiles = monitorTiles(stats.perCheck);
    assert.equal(tiles[0].check, "consent");
    assert.equal(tiles[0].flag, 1);
    assert.equal(tiles[1].flag, 1);
    assert.notEqual(tiles[0].flag, 2);
  });
});
