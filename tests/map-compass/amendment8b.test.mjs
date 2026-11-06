import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { test, assert, assertEqual } from "../tiny.mjs";
import {
  A8_CONSTANTS_ASSERTED,
  A8_DEV_SEGMENTS,
  A8_SEGMENT_WARMUP_BARS,
  A8_SEGMENT_TAIL_BARS,
  A8_SWEEP_GRID,
  MAP,
  ROLES,
  EXIT_HARNESS,
} from "../../scripts/map-compass/frozen.mjs";
import { assertA8OutputState } from "./a8-helpers.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ART = join(ROOT, "artifacts/map-compass");

test("A8B frozen additions exactly encode DEV segments, warm-up, tail, and 25-cell grid", () => {
  assertEqual(A8_CONSTANTS_ASSERTED, true);
  assertEqual(A8_SEGMENT_WARMUP_BARS, MAP.warmupBars);
  assertEqual(A8_SEGMENT_TAIL_BARS, EXIT_HARNESS.maxHoldBars);
  const years = A8_DEV_SEGMENTS.flatMap(s => Array.from({ length: s.lastYear-s.firstYear+1 },(_,i)=>s.firstYear+i));
  assertEqual(JSON.stringify(years), JSON.stringify(ROLES.DEV));
  assertEqual(A8_SWEEP_GRID.length, 25);
  assert(A8_SWEEP_GRID.some(x => x.erCutoff===0.35 && x.atrPercentile===70));
});

test("A8B prior baseline, power, signal, coverage, and slot artifacts are superseded history", () => {
  for (const name of ["random-baseline", "power-curve", "signal-counts", "baseline-coverage", "slot-model"]) {
    const x=JSON.parse(readFileSync(join(ART,`${name}.json`),"utf8"));
    assertEqual(x.supersession.status,"SUPERSEDED_FOR_A8_A9");
    assertEqual(x.supersession.historyOnly,true);
    assertEqual(x.supersession.computedAcrossDevSegmentBoundaries,true);
    assertEqual(x.supersession.usedAsInputToAnyA8A9Verdict,false);
    assert(x.supersession.note.includes("NOT an input"));
  }
});

test("A8B Stage 4 outputs remain absent until separately authorized", () => {
  assertA8OutputState(ART);
});
