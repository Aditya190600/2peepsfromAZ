import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_AGENT_DEFAULTS } from "./demoAgentDefaults.js";

// Neither variant has real account access or a transfer tool, so both must
// say so plainly instead of stalling when a caller asks for either.
for (const [key, defaults] of Object.entries(DEMO_AGENT_DEFAULTS)) {
  test(`${key} variant declines account data it can't access`, () => {
    assert.match(defaults.system_prompt, /don't have access to that specific information/);
  });

  test(`${key} variant declines transfers to a human`, () => {
    assert.match(defaults.system_prompt, /can't transfer them to a human right now/);
    assert.doesNotMatch(defaults.system_prompt, /offer to transfer/);
  });
}
