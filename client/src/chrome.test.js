import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_NAV, PRODUCT_NAV_ALL, productNav } from "./chromeNav.js";

describe("PRODUCT_NAV", () => {
  it("hides Phone Evals until the visitor can access it", () => {
    assert.deepEqual(
      PRODUCT_NAV.map((item) => item.label),
      ["Voice Compliance", "Qualitative Evals", "Settings"]
    );
    assert.deepEqual(
      productNav({ canAccessPhoneEvals: true }).map((item) => item.label),
      ["Voice Compliance", "Qualitative Evals", "Phone Evals", "Settings"]
    );
    assert.deepEqual(
      productNav({ isOperator: true, canAccessPhoneEvals: true }).map((item) => item.label),
      ["Voice Compliance", "Qualitative Evals", "Phone Evals", "Settings"]
    );
  });

  it("keeps Compliance Examples, Sessions, Numbers, API Keys, Evals present but hidden", () => {
    const hiddenLabels = PRODUCT_NAV_ALL.filter((item) => item.hidden).map((item) => item.label);
    assert.deepEqual(hiddenLabels, ["Compliance Examples", "Sessions", "Numbers", "API Keys", "Evals"]);
  });

  it("marks Sessions active on a session report URL", () => {
    const sessions = PRODUCT_NAV_ALL.find((item) => item.href === "/sessions");
    assert.equal(sessions.match("/sessions"), true);
    assert.equal(sessions.match("/sessions/sess_tcpa_04"), true);
    assert.equal(sessions.match("/try"), false);
  });

  it("does not invent Login or Pattern packs", () => {
    const labels = PRODUCT_NAV.map((item) => item.label).join(" ");
    assert.equal(/Login|Integrations|Reports|Pattern/.test(labels), false);
  });
});
