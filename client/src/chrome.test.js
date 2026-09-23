import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_NAV } from "./chromeNav.js";

describe("PRODUCT_NAV", () => {
  it("is Home, Sessions, Try, Numbers, API Keys, Evals", () => {
    assert.deepEqual(
      PRODUCT_NAV.map((item) => item.label),
      ["Home", "Sessions", "Try", "Numbers", "API Keys", "Evals"]
    );
  });

  it("marks Sessions active on a session report URL", () => {
    const sessions = PRODUCT_NAV.find((item) => item.href === "/sessions");
    assert.equal(sessions.match("/sessions"), true);
    assert.equal(sessions.match("/sessions/sess_tcpa_04"), true);
    assert.equal(sessions.match("/home"), false);
  });

  it("does not invent Login or Pattern packs", () => {
    const labels = PRODUCT_NAV.map((item) => item.label).join(" ");
    assert.equal(/Login|Integrations|Reports|Pattern/.test(labels), false);
  });
});
