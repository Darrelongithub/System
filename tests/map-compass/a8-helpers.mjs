import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { assert } from "../tiny.mjs";
import { ROLES, EXIT_HARNESS } from "../../scripts/map-compass/frozen.mjs";

export function assertA8OutputState(root) {
  const resultPath = join(root, "claim-verification.json");
  const tradesPath = join(root, "claimed-trades.jsonl");
  const hasResult = existsSync(resultPath);
  const hasTrades = existsSync(tradesPath);
  assert(hasResult === hasTrades, "A8 real output is an all-or-nothing persisted pair");
  if (!hasResult) return;
  const result = JSON.parse(readFileSync(resultPath, "utf8"));
  const trades = readFileSync(tradesPath, "utf8").split("\n").filter(Boolean).map(JSON.parse);
  assertEqualSafe(result.rows?.length, 44, "one row per 22-card claim half");
  for (const t of trades) {
    assert(ROLES.DEV.includes(t.year), `non-DEV entry in ${t.strategyId}`);
    assert(t.segmentId && Number.isInteger(t.segmentLength) && Number.isInteger(t.localIndex) && Number.isInteger(t.exitIndex));
    assert(t.localIndex + EXIT_HARNESS.maxHoldBars < t.segmentLength, "trade has 96 in-segment future bars");
    assert(t.exitIndex < t.segmentLength && t.exitIndex <= t.localIndex + EXIT_HARNESS.maxHoldBars, "exit stays in segment horizon");
  }
}
function assertEqualSafe(actual, expected, message) {
  assert(actual === expected, `${message}: ${actual} !== ${expected}`);
}
