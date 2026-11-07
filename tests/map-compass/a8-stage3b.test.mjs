import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, assert, assertEqual } from "../tiny.mjs";
import { CLAIM_CARDS } from "../../scripts/map-compass/claim-cards.draft.mjs";
import { groupByStrategyVerdictState } from "../../scripts/map-compass/lib/verification.mjs";
import { summarizeEntryStateCounts } from "../../scripts/map-compass/a8-stage3b-common.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ART = join(ROOT, "artifacts/map-compass");

 test("A8 M2 map artifact computes features only for DEV rows", () => {
  const report = JSON.parse(readFileSync(join(ART, "map-validation.json"), "utf8"));
  assertEqual(report.devOnlyFeatureComputation, true);
  assertEqual(report.computedDevBars, 131922);
  assertEqual(report.excludedNonDevRows, report.bars - report.computedDevBars);
  assertEqual(report.devSegmentBoundaries.length, 4);
  assertEqual(report.verdict, "PASS");
  const mapPath = join(ART, "normalized/xauusd-m30-map.csv");
  if (existsSync(mapPath)) {
    const lines = readFileSync(mapPath, "utf8").trimEnd().split("\n");
    const header = lines[0].split(",");
    const roleIndex = header.indexOf("role");
    const stateIndex = header.indexOf("state");
    const reasonIndex = header.indexOf("reason");
    for (const line of lines.slice(1)) {
      const row = line.split(",");
      if (row[roleIndex] !== "DEV") {
        assertEqual(row[stateIndex], "EXCLUDED");
        assertEqual(row[reasonIndex], "non_dev_not_computed");
        for (const column of header.slice(header.indexOf("er"), header.indexOf("role"))) {
          assertEqual(row[header.indexOf(column)], "", `${column} must be blank outside DEV`);
        }
      }
    }
  }
});

test("A8 Part 2 freezes its signal-selected C card, exclusions, drift and window payload", () => {
  const prep = JSON.parse(readFileSync(join(ART, "a8-part2-prep.json"), "utf8"));
  assertEqual(prep.stage, "A8_PART_2_PREREGISTRATION_AND_C_CALIBRATION");
  assertEqual(createHash("sha256").update(JSON.stringify(prep.freezePayload)).digest("hex"), prep.freezeSha256);
  assert(prep.selection.plantedCardId);
  assert(prep.selection.eligibleCandidates.some((row) => row.cardId === prep.selection.plantedCardId));
  assert([12, 24].includes(prep.calibration.edgeBars));
  assertEqual(prep.conditionCD.role, "report-only in Stage 3; no pass criterion");
  assertEqual(prep.realDevUsedOnlyForSignalTables, true);
});

test("UNKNOWN card entries count in the executed book but are unbinned from both verdict cells", () => {
  const cardId = CLAIM_CARDS[0].id;
  const trades = [
    { strategyId: cardId, state: "EXPANSION", verdictState: "EFFICIENT" },
    { strategyId: cardId, state: "QUIET", verdictState: "CHOPPY" },
    { strategyId: cardId, state: "UNKNOWN", verdictState: null },
  ];
  const counts = summarizeEntryStateCounts(trades, CLAIM_CARDS.slice(0, 1))[cardId];
  assertEqual(counts.EFFICIENT + counts.CHOPPY + counts.UNKNOWN, counts.total);
  assertEqual(counts.total, 3);
  assertEqual(counts.UNKNOWN, 1);
  const cells = groupByStrategyVerdictState(trades);
  assertEqual(cells.get(`${cardId}|EFFICIENT`).length, 1);
  assertEqual(cells.get(`${cardId}|CHOPPY`).length, 1);
  assertEqual(cells.has(`${cardId}|UNKNOWN`), false);
});

test("A8 Stage 4 outputs remain guarded before the separate authorization", () => {
  assert(!existsSync(join(ART, "claim-verification.json")));
  assert(!existsSync(join(ART, "claimed-trades.jsonl")));
});
