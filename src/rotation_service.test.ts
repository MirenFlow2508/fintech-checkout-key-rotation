import { strict as assert } from "node:assert";
import { shouldSwitchToNewKey } from "./rotation_service.ts";

assert.equal(shouldSwitchToNewKey(0, 24), true);
assert.equal(shouldSwitchToNewKey(2, 24), false);
assert.equal(shouldSwitchToNewKey(0, 0), false);
console.log("rotation decision tests passed");
