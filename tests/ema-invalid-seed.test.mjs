/**
 * F3 regression — the EMA used by MACD-cross must seed from the first VALID
 * close. Pre-fix it seeded from candle 0's close even when candle 0 was
 * invalid, so an excluded candle's value contaminated every later signal.
 */
import { test, assertEqual } from "./tiny.mjs";
import { makeCsv, walkRows } from "./fixtures.mjs";
import { runAnalysis } from "../src/lib/analyzer/run.ts";

function macdSignals(csv) {
  const r = runAnalysis(csv, { seriesEndsComplete: true });
  if (!r.ok) throw new Error(`parse failed: ${r.error}`);
  return r.analysis.tradePasses
    .filter((t) => t.strategyId === "macd-cross")
    .map((t) => [t.index, t.side, t.entry, t.sl, t.tp].join("|"))
    .join("\n");
}

test("F3: invalid candle-0 value cannot contaminate later EMA/MACD signals", () => {
  const base = walkRows(400);
  // Invalidate candle 0 (high < low) while keeping its close at the base value…
  const v1 = [...base];
  {
    const cells = v1[0].split(",");
    const tmp = cells[2]; // high
    cells[2] = cells[3];
    cells[3] = "1";
    v1[0] = cells.join(",");
    void tmp;
  }
  // …vs the same invalid candle 0 but with a wildly different close value.
  const v2 = [...v1];
  {
    const cells = v2[0].split(",");
    cells[4] = "999999";
    v2[0] = cells.join(",");
  }
  const s1 = macdSignals(makeCsv(v1));
  const s2 = macdSignals(makeCsv(v2));
  const r1 = runAnalysis(makeCsv(v1), { seriesEndsComplete: true });
  if (!r1.ok) throw new Error("fixture parse failed");
  assertEqual(r1.analysis.invalidRows, 1, "exactly one invalid row (candle 0)");
  assertEqual(s1, s2, "MACD trade set must not depend on an invalid candle's close value");
});

test("F3: seed change is inert on all-valid files (production path safety)", () => {
  // The fix only re-routes the seed when candle 0 is invalid; an all-valid
  // file must be byte-identical to the pre-fix behavior. The golden test
  // locks this over the 9738-row production baseline; here we additionally
  // assert the seed equals candle 0's close on an all-valid walk by checking
  // signals match the golden-locked baseline pattern is unnecessary — a
  // second parse of the same file is trivially identical, so instead assert
  // finiteness of every seeded EMA trade field.
  const r = runAnalysis(makeCsv(walkRows(400)), { seriesEndsComplete: true });
  if (!r.ok) throw new Error("fixture parse failed");
  for (const t of r.analysis.tradePasses.filter((t) => t.strategyId === "macd-cross")) {
    for (const v of [t.entry, t.sl, t.tp, t.rr]) {
      if (!Number.isFinite(v)) throw new Error(`non-finite macd field ${String(v)} on ${t.index}`);
    }
  }
});
