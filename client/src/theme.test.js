import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getClerkAppearance, resolveTheme } from "./theme.js";

describe("resolveTheme", () => {
  it("returns light or dark for explicit preferences", () => {
    assert.equal(resolveTheme("light"), "light");
    assert.equal(resolveTheme("dark"), "dark");
  });
});

describe("getClerkAppearance", () => {
  it("uses dark palette tokens when resolved theme is dark", () => {
    const appearance = getClerkAppearance("dark");
    assert.equal(appearance.variables.colorBackground, "#1a1d25");
    assert.equal(appearance.variables.colorPrimary, "#6b9fd4");
  });

  it("uses light palette tokens when resolved theme is light", () => {
    const appearance = getClerkAppearance("light");
    assert.equal(appearance.variables.colorBackground, "#ffffff");
    assert.equal(appearance.variables.colorPrimary, "#1f3a5f");
  });
});
