/**
 * F1 regression — impossible price data must never surface a PASS row with
 * non-finite or non-positive entry/sl/tp/rr. Pre-fix, a 1e308-scale candle
 * produced PASS rows carrying rr=Infinity/NaN and tp/sl=±Infinity.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { makeCsv, walkRows, csvRow, eatDateTime, META, HEADER } from "./fixtures.mjs";
import { applySpreadAndRR } from "../src/lib/analyzer/math.ts";
import { runAnalysis } from "../src/lib/analyzer/run.ts";

test("F1: extreme (1e308) candle yields zero non-finite/impossible PASS rows", () => {
  const rows = walkRows(300);
  // Inject one valid-geometry but absurd candle (prices near DBL_MAX).
  const i = 150;
  const big = 1e308;
  rows[i] = csvRow(
    eatDateTime(Date.parse("2025-01-01T00:00:00+03:00") + i * 1800000),
    String(big), String(big), String(big * (1 - 1e-13)), String(big * (1 - 5e-14)),
  );
  const result = runAnalysis(makeCsv(rows), { seriesEndsComplete: true });
  assert(result.ok, "parse must succeed for finite prices");
  for (const t of result.analysis.tradePasses) {
    for (const f of ["entry", "sl", "tp", "rr", "rMultiple", "exitPrice"]) {
      const v = t[f];
      if (v === undefined || v === null) continue;
      assert(
        Number.isFinite(v),
        `non-finite ${f} (${String(v)}) on ${t.strategyId}@${t.index}`,
      );
    }
    assert(t.entry > 0 && t.sl > 0 && t.tp > 0, `non-positive price on ${t.strategyId}@${t.index}`);
  }
});

test("F1: applySpreadAndRR rejects impossible and non-finite price sets", () => {
  // NaN tp.
  const r2 = applySpreadAndRR({ side: "long", entry: 100, sl: 99, tp: Number.NaN }, 0.2);
  assert(r2 && r2.invalidReason !== undefined, "NaN tp must carry invalidReason");
  // Infinity tp (strategy arithmetic overflow).
  const rInf = applySpreadAndRR({ side: "long", entry: 100, sl: 99, tp: Infinity }, 0.2);
  assert(rInf && rInf.invalidReason !== undefined, "Infinity tp must carry invalidReason");
  // Non-positive tp (signed-negative target after arithmetic).
  const r3 = applySpreadAndRR({ side: "long", entry: 100, sl: 50, tp: -5 }, 0.2);
  assert(r3 && r3.invalidReason !== undefined, "negative tp must carry invalidReason");
  // Denormal risk: RR overflows to Infinity → rejected.
  const rDen = applySpreadAndRR({ side: "long", entry: 100, sl: 100 - 5e-324, tp: 200 }, 0);
  assert(rDen && rDen.invalidReason !== undefined, "denormal-risk Infinite-RR must carry invalidReason");
  // Astronomical-but-finite set: finite and positive → NOT impossible; it
  // fails the RR threshold downstream (rr = 0), never becomes Infinity.
  const rBig = applySpreadAndRR({ side: "long", entry: 1e308, sl: 5e307, tp: 1e308 }, 0.2);
  assert(rBig && rBig.invalidReason === undefined, "finite positive huge set is geometrically sane");
  assertEqual(rBig.rr, 0, "huge-set rr is 0 (fails the RR gate as FAIL, never non-finite)");
  // Sane trade unaffected.
  const r4 = applySpreadAndRR({ side: "long", entry: 100, sl: 99, tp: 103 }, 0.2);
  assertEqual(r4.invalidReason, undefined, "sane trade must stay valid");
  assertEqual(r4.rr, (103 - 100.2) / (100.2 - 99), "sane rr value");
});

test("F1: every PASS row in normal runs has finite, positive, threshold-respecting numbers", async () => {
  const { baselineAnalysis } = await import("./fixtures.mjs");
  const analysis = await baselineAnalysis();
  for (const t of analysis.tradePasses) {
    assert(Number.isFinite(t.entry) && t.entry > 0, `entry on ${t.strategyId}@${t.index}`);
    assert(Number.isFinite(t.sl) && t.sl > 0, `sl on ${t.strategyId}@${t.index}`);
    assert(Number.isFinite(t.tp) && t.tp > 0, `tp on ${t.strategyId}@${t.index}`);
    assert(Number.isFinite(t.rr) && t.rr > 2, `rr>2 on ${t.strategyId}@${t.index}`);
    if (t.rMultiple !== undefined) {
      assert(Number.isFinite(t.rMultiple), `rMultiple on ${t.strategyId}@${t.index}`);
    }
  }
});
