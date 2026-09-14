import { test } from "node:test";
import assert from "node:assert/strict";
import { headlineVerdict, reportView, VERDICT_CLASS } from "./compliance.js";

test("reportView prefers error, then loading, then idle, then ready", () => {
  assert.equal(reportView({ error: "failed" }).kind, "error");
  assert.equal(reportView({ error: "failed" }).className, "is-error");
  assert.notEqual(reportView({ error: "failed" }).className, VERDICT_CLASS.clear);

  assert.equal(reportView({ loading: true }).kind, "loading");
  assert.equal(reportView({ loading: true }).className, "is-loading");
  assert.notEqual(reportView({ loading: true }).className, VERDICT_CLASS.clear);

  assert.equal(reportView({}).kind, "idle");
  assert.equal(reportView({ report: null }).kind, "idle");
  assert.equal(reportView({}).className, "is-idle");
  assert.notEqual(reportView({}).className, VERDICT_CLASS.clear);

  const ready = reportView({ report: { findings: [] } });
  assert.equal(ready.kind, "ready");
  assert.equal(ready.className, VERDICT_CLASS.clear);
});

test("error wins over loading and a leftover report", () => {
  const view = reportView({
    report: { findings: [] },
    loading: true,
    error: "upstream down",
  });
  assert.equal(view.kind, "error");
  assert.match(view.message, /upstream down/);
});

test("dropping a leftover error lets a later ready report paint", () => {
  const masked = reportView({
    report: { findings: [{ status: "pass", check: "consent" }] },
    error: "live failed",
  });
  assert.equal(masked.kind, "error");

  const afterClear = reportView({
    report: { findings: [{ status: "pass", check: "consent" }] },
  });
  assert.equal(afterClear.kind, "ready");
  assert.equal(afterClear.className, VERDICT_CLASS.clear);
});

test("pinned session findings map to Critical, High, and Clear classes", () => {
  const tcpa04 = headlineVerdict([{ status: "flag", check: "consent" }]);
  const late01 = headlineVerdict([{ status: "flag", check: "ai_disclosure" }]);
  const clean01 = headlineVerdict([{ status: "pass", check: "consent" }]);

  assert.equal(tcpa04.level, "critical");
  assert.equal(late01.level, "high");
  assert.equal(clean01.level, "clear");

  assert.equal(
    reportView({ report: { findings: [{ status: "flag", check: "consent" }] } }).className,
    "is-critical"
  );
  assert.equal(
    reportView({ report: { findings: [{ status: "flag", check: "ai_disclosure" }] } }).className,
    "is-high"
  );
  assert.equal(
    reportView({ report: { findings: [{ status: "pass", check: "consent" }] } }).className,
    "is-clear"
  );
  assert.notEqual(VERDICT_CLASS.critical, VERDICT_CLASS.high);
});
