import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTourTarget, tooltipTop } from "./tourPosition.js";

const rect = (top, bottom) => ({ top, bottom });

test("tooltipTop places the tooltip below the target when it fits", () => {
  assert.equal(tooltipTop(rect(100, 200), 190, 900), 212);
});

test("tooltipTop flips above a target too close to the viewport bottom", () => {
  assert.equal(tooltipTop(rect(700, 850), 190, 900), 498);
});

test("tooltipTop clamps inside the viewport when neither side fits", () => {
  assert.equal(tooltipTop(rect(50, 850), 190, 900), 694);
});

test("tooltipTop centers the tooltip when the target is missing", () => {
  assert.equal(tooltipTop(null, 200, 900), 350);
});

test("resolveTourTarget prefers a ref, falls back to find, else null", () => {
  const node = {};
  assert.equal(resolveTourTarget({ ref: { current: node } }), node);
  assert.equal(resolveTourTarget({ ref: { current: null }, find: () => node }), node);
  assert.equal(resolveTourTarget({ find: () => null }), null);
  assert.equal(resolveTourTarget(undefined), null);
});
