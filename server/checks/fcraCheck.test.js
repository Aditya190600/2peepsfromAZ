import { test } from "node:test";
import assert from "node:assert/strict";
import { fcraAdverseActionDisclosureCheck, fcraCreditPullPermissiblePurposeCheck } from "./fcraCheck.js";

function session(turns) {
  return { turns: turns.map((text, i) => ({ role: i % 2 === 0 ? "agent" : "user", text, tMs: i * 1000 })) };
}

test("fcraAdverseActionDisclosureCheck flags adverse action with no disclosure anywhere in the call", () => {
  const finding = fcraAdverseActionDisclosureCheck(
    session(["We are denying your loan application based on your credit report."]),
  );
  assert.equal(finding.status, "flag");
});

test("fcraAdverseActionDisclosureCheck passes when the disclosure is spoken in a later turn", () => {
  const finding = fcraAdverseActionDisclosureCheck(
    session([
      "We are denying your loan application based on your credit report.",
      "ok",
      "You have the right to dispute the accuracy of this with the reporting agency and get a free copy of your report.",
    ]),
  );
  assert.equal(finding.status, "pass");
});

test("fcraAdverseActionDisclosureCheck is n/a when there is no adverse action language", () => {
  const finding = fcraAdverseActionDisclosureCheck(session(["Thanks for calling, how can I help?"]));
  assert.equal(finding.status, "n/a");
});

test("fcraCreditPullPermissiblePurposeCheck flags a credit pull with no authorization language anywhere", () => {
  const finding = fcraCreditPullPermissiblePurposeCheck(
    session(["I'm going to pull your credit report now to check your application."]),
  );
  assert.equal(finding.status, "flag");
});

test("fcraCreditPullPermissiblePurposeCheck passes when authorization language is spoken in a later turn", () => {
  const finding = fcraCreditPullPermissiblePurposeCheck(
    session([
      "I'm going to pull your credit report now to check your application.",
      "ok",
      "This is with your authorization for this loan application.",
    ]),
  );
  assert.equal(finding.status, "pass");
});

test("fcraCreditPullPermissiblePurposeCheck is n/a when there is no credit pull language", () => {
  const finding = fcraCreditPullPermissiblePurposeCheck(session(["Thanks for calling, how can I help?"]));
  assert.equal(finding.status, "n/a");
});
