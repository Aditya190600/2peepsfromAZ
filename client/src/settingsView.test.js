import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPhoneNumberOptions,
  CUSTOM_PHONE_OPTION,
  formatPhoneNumber,
  groupByDomain,
  resolvePhoneMenuSelection,
} from "./settingsView.js";

test("formatPhoneNumber pretty-prints a US E.164 number and passes anything else through", () => {
  assert.equal(formatPhoneNumber("+18038245760"), "(803) 824-5760");
  assert.equal(formatPhoneNumber("+447700900123"), "+447700900123");
  assert.equal(formatPhoneNumber(null), null);
});

test("groupByDomain keeps server order and each domain's agents together", () => {
  const groups = groupByDomain([
    { key: "compliant", domain: "banking", domainLabel: "Banking" },
    { key: "flawed", domain: "banking", domainLabel: "Banking" },
    { key: "healthcare-compliant", domain: "healthcare", domainLabel: "Healthcare" },
  ]);
  assert.deepEqual(
    groups.map((g) => [g.label, g.agents.map((a) => a.key)]),
    [
      ["Banking", ["compliant", "flawed"]],
      ["Healthcare", ["healthcare-compliant"]],
    ],
  );
});

test("buildPhoneNumberOptions lists deployment and imported numbers without duplicates", () => {
  const options = buildPhoneNumberOptions({
    agentPhoneNumber: "+18038245760",
    personaPhoneNumber: "+15550000002",
    importedNumbers: [{ e164: "+18038245760", label: "Dup" }, { e164: "+15551212000", label: "Support" }],
  });
  assert.deepEqual(
    options.map((option) => [option.id, option.label]),
    [
      ["+18038245760", "Demo target agent"],
      ["+15551212000", "Support"],
      ["+15550000002", "QualEval caller number"],
      [CUSTOM_PHONE_OPTION, "Custom number…"],
    ],
  );
});

test("resolvePhoneMenuSelection picks a stored custom number", () => {
  const options = buildPhoneNumberOptions({ agentPhoneNumber: "+18038245760" });
  assert.deepEqual(resolvePhoneMenuSelection(options, "+19998887777"), {
    selectedId: CUSTOM_PHONE_OPTION,
    customValue: "+19998887777",
    resolvedNumber: "+19998887777",
  });
});
