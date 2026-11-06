import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { assert } from "../tiny.mjs";
import { ROLES, EXIT_HARNESS } from "../../scripts/map-compass/frozen.mjs";

export function assertA8OutputState(root) {
  const resultPath = join(root, "claim-verification.json");
  const tradesPath = join(root, "claimed-trades.jsonl");
  assert(!existsSync(resultPath), "Stage 4 claim-verification.json must not exist before separate authorization");
  assert(!existsSync(tradesPath), "Stage 4 claimed-trades.jsonl must not exist before separate authorization");
  const rehearsalPath = join(root, "a8-dress-rehearsal.json");
  assert(existsSync(rehearsalPath), "the synthetic rehearsal record must be present");
  const rehearsal = JSON.parse(readFileSync(rehearsalPath, "utf8"));
  assertEqualSafe(rehearsal.pass, false, "failed Stage 3 rehearsal blocks Stage 4");
}
function assertEqualSafe(actual, expected, message) {
  assert(actual === expected, `${message}: ${actual} !== ${expected}`);
}
