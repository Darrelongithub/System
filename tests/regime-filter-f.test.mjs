/**
 * Filter F — counter-trend momentum-bar fade (v1.8 product decision).
 *
 * Filter F rejects a PASS candidate when the signal bar is a strong momentum
 * bar closing on its high (body ≥ 80% of range, upper wick ≤ 2% of range) while
 * the candidate is fading the local swing structure:
 *
 *   reject ⟺ counter-trend(local trend, side)
 *             ∧ body/range ≥ 0.8
 *             ∧ upperWick/range ≤ 0.02
 *
 * These tests pin three properties:
 *   1. the predicate itself (including fail-open behaviour on missing inputs),
 *   2. soundness + completeness on the locked baseline (no candidate is rejected
 *      that does not satisfy the rule, and every rule-satisfying candidate in the
 *      unfiltered run is rejected — by F, or earlier by Filter C),
 *   3. entry-time-only causality: the decision is identical when the series is
 *      truncated at the signal bar, so no later bar can influence it.
 *
 * The opt-out path is pinned too: `enableFilterF: false` must restore exactly
 * the v1.4/v1.7 Filter-C-only book (2,323 trades / R 523.6813503963194).
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { loadBaselineCsv } from "./fixtures.mjs";
import { rejectFilterF, rejectFilterC } from "../src/lib/analyzer/regime-filters.ts";
import { runAnalysis } from "../src/lib/analyzer/run.ts";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import { isTradeStrategy } from "../src/lib/analyzer/strategy-kind.ts";

const BULL = { open: 100, high: 110, low: 100, close: 110 };
const ctxOf = (candles, atr = candles.map(() => 5)) => ({ candles, atr });
const candleOf = (o, h, l, c, extra = {}) => ({
  index: 0,
  datetime: "2025-01-01 00:00:00",
  open: o,
  high: h,
  low: l,
  close: c,
  invalid: undefined,
  ...extra,
});

test("filter F: fires only on a counter-trend momentum bar closing on its high", () => {
  // Counter-trend long (local structure bearish) + body 100% + zero upper wick.
  assert(
    rejectFilterF(ctxOf([candleOf(100, 110, 100, 110)]), 0, "bearish", "long"),
    "counter-trend long on a full-bodied bar closing at its high must be rejected",
  );
  // Counter-trend short (local structure bullish) on the same bar — the rule is
  // asymmetric by design: it keys on a bar closing at its HIGH.
  assert(
    rejectFilterF(ctxOf([candleOf(100, 110, 100, 110)]), 0, "bullish", "short"),
    "counter-trend short on a bar closing at its high must be rejected",
  );
  // Trend-aligned candidates are untouched, in either direction.
  assert(
    !rejectFilterF(ctxOf([candleOf(100, 110, 100, 110)]), 0, "bullish", "long"),
    "trend-aligned long must not be rejected",
  );
  assert(
    !rejectFilterF(ctxOf([candleOf(100, 110, 100, 110)]), 0, "bearish", "short"),
    "trend-aligned short must not be rejected",
  );
  // Ranging structure is not counter-trend.
  assert(
    !rejectFilterF(ctxOf([candleOf(100, 110, 100, 110)]), 0, "ranging", "long"),
    "ranging structure must not be rejected",
  );
  // Missing side (diagnostic rows) never rejects.
  assert(
    !rejectFilterF(ctxOf([candleOf(100, 110, 100, 110)]), 0, "bearish", undefined),
    "a candidate without a side must not be rejected",
  );
  // Body below the 80% floor (o=100 h=110 l=100 c=105 → body 0.5).
  assert(
    !rejectFilterF(ctxOf([candleOf(100, 110, 100, 105)]), 0, "bearish", "long"),
    "body 50% must not be rejected",
  );
  // Body just above the floor (range 10, body 8.1 → 81%) with no upper wick fires.
  assert(
    rejectFilterF(ctxOf([candleOf(100, 108.1, 98.1, 108.1)]), 0, "bearish", "long"),
    "body 81% closing at its high must be rejected",
  );
  // Body just below the floor (range 10, body 7.9 → 79%) does not.
  assert(
    !rejectFilterF(ctxOf([candleOf(100, 107.9, 97.9, 107.9)]), 0, "bearish", "long"),
    "body 79% must not be rejected",
  );
  // Upper wick above the 2% ceiling (o=100 h=112 l=100 c=110 → uw 0.1667).
  assert(
    !rejectFilterF(ctxOf([candleOf(100, 112, 100, 110)]), 0, "bearish", "long"),
    "upper wick 16.7% must not be rejected",
  );
  // Upper wick exactly at the ceiling (o=100 h=111 l=99 c=111 → uw 0.0) fires;
  // a 2.5% wick (range 40 → 1/40) does not.
  assert(
    rejectFilterF(ctxOf([candleOf(100, 111, 99, 111)]), 0, "bearish", "long"),
    "bar closing exactly at its high with a strong body must be rejected",
  );
  assert(
    !rejectFilterF(ctxOf([candleOf(100, 141, 100, 140)]), 0, "bearish", "long"),
    "upper wick above the ceiling must not be rejected",
  );
});

test("filter F: fails open when the bar's inputs are missing or degenerate", () => {
  const cases = [
    ["missing open", candleOf(undefined, 110, 100, 110)],
    ["missing high", candleOf(100, undefined, 100, 110)],
    ["missing low", candleOf(100, 110, undefined, 110)],
    ["missing close", candleOf(100, 110, 100, undefined)],
    ["zero range", candleOf(100, 100, 100, 100)],
    ["invalid row", candleOf(100, 110, 100, 110, { invalid: "corrupt row" })],
  ];
  for (const [label, candle] of cases) {
    assert(
      !rejectFilterF(ctxOf([candle]), 0, "bearish", "long"),
      `${label}: must fail open (no rejection)`,
    );
  }
  // Filter F reads the bar only — an absent ATR neither blocks nor changes it.
  assert(
    rejectFilterF(
      { candles: [candleOf(100, 110, 100, 110)], atr: [undefined] },
      0,
      "bearish",
      "long",
    ),
    "missing ATR must not change the decision (F reads the bar, not the ATR)",
  );
  assert(
    !rejectFilterF(ctxOf([]), 0, "bearish", "long"),
    "missing candle must not throw or reject",
  );
  // Filter C still requires extreme vol; on this stub (no percentile history) it never fires.
  assert(
    !rejectFilterC(ctxOf([candleOf(100, 110, 100, 110)]), 0, "bearish", "long"),
    "Filter C must not fire without a full 50-bar prior window",
  );
});

const RULE_HOLDS = (side, trend, candle) => {
  if (!candle) return false;
  const range = (candle.high ?? 0) - (candle.low ?? 0);
  if (!(range > 0)) return false;
  if (candle.open === undefined || candle.close === undefined) return false;
  const counterTrend =
    (side === "long" && trend === "bearish") || (side === "short" && trend === "bullish");
  const bodyPct = Math.abs(candle.close - candle.open) / range;
  const upperWickPct = (candle.high - Math.max(candle.open, candle.close)) / range;
  return counterTrend && bodyPct >= 0.8 && upperWickPct <= 0.02;
};

const keyOf = (r) => `${r.strategyId}|${r.datetime}|${r.index}|${r.side ?? ""}`;

test("filter F: baseline run rejects exactly the rule-satisfying candidates", () => {
  const csv = loadBaselineCsv();
  const candles = parseCsv(csv).candles;
  const withFilters = runAnalysis(csv, { seriesEndsComplete: true });
  const withoutFilters = runAnalysis(csv, {
    seriesEndsComplete: true,
    enableFilterC: false,
    enableFilterF: false,
  });
  assert(withFilters.ok && withoutFilters.ok, "both baseline runs must parse");

  // Soundness: never reject a candidate that does not satisfy the rule.
  const fRows = withFilters.analysis.results.filter(
    (r) => r.result === "FAIL" && /^FILTER_F/.test(r.reason),
  );
  assertEqual(fRows.length, 92, "expected Filter F rejection count on the locked baseline");
  for (const row of fRows) {
    assert(
      RULE_HOLDS(row.side, row.trend, candles[row.index]),
      `spurious Filter F rejection at ${row.datetime} (${row.strategyId})`,
    );
  }

  // Completeness: every unfiltered PASS candidate that satisfies the rule is
  // rejected in the filtered run — by F, or earlier by Filter C (C runs first).
  const defByKey = new Map(withFilters.analysis.results.map((r) => [keyOf(r), r]));
  let eligible = 0;
  for (const row of withoutFilters.analysis.results) {
    if (row.result !== "PASS" || !isTradeStrategy(row.strategyId)) continue;
    if (!RULE_HOLDS(row.side, row.trend, candles[row.index])) continue;
    eligible++;
    const filtered = defByKey.get(keyOf(row));
    assert(filtered, `candidate ${keyOf(row)} disappeared from the filtered run`);
    assertEqual(
      filtered.result,
      "FAIL",
      `rule-satisfying candidate ${keyOf(row)} was not rejected`,
    );
    assert(
      /^FILTER_[CF]/.test(filtered.reason),
      `rule-satisfying candidate ${keyOf(row)} must be rejected by Filter C or F, got: ${filtered.reason}`,
    );
  }
  assertEqual(eligible, 92, "expected 92 rule-satisfying candidates in the unfiltered run");
  assertEqual(
    fRows.filter((r) => defByKey.get(keyOf(r)) === r).length,
    fRows.length,
    "Filter F rows must belong to the filtered run",
  );
});

test("filter F: opt-out restores the Filter-C-only book exactly", () => {
  const csv = loadBaselineCsv();
  const filtered = runAnalysis(csv, { seriesEndsComplete: true });
  const cOnly = runAnalysis(csv, { seriesEndsComplete: true, enableFilterF: false });
  assert(filtered.ok && cOnly.ok, "both runs must parse");

  const rSum = (analysis) =>
    analysis.tradePasses
      .filter((t) => isTradeStrategy(t.strategyId))
      .reduce((s, t) => s + (t.rMultiple ?? 0), 0);

  // Locked v1.8.2 numbers: default (C+F) 2,286 trades / R 527.6272857378555;
  // Filter-C-only 2,323 trades / R 507.93925691611344. (Both re-baselined by the
  // v1.8.2 gap-fill fix; the trade SET is unchanged, only gap-skipped exits move.)
  assertEqual(cOnly.analysis.tradePasses.length, 2323, "C-only trade count");
  assert(
    Math.abs(rSum(cOnly.analysis) - 507.93925691611344) < 1e-6,
    `C-only rSum drift: ${rSum(cOnly.analysis)}`,
  );
  assertEqual(filtered.analysis.tradePasses.length, 2286, "default (C+F) trade count");
  assert(
    Math.abs(rSum(filtered.analysis) - 527.6272857378555) < 1e-6,
    `default (C+F) rSum drift: ${rSum(filtered.analysis)}`,
  );
  assert(
    rSum(filtered.analysis) > rSum(cOnly.analysis),
    "the shipped default must beat Filter-C-only on the locked baseline",
  );
});

test("filter F: the decision is computed from the signal bar alone (no future bars)", () => {
  const csv = loadBaselineCsv();
  const full = runAnalysis(csv, { seriesEndsComplete: true });
  assert(full.ok, "baseline must parse");
  const firstF = full.analysis.results.find(
    (r) => r.result === "FAIL" && /^FILTER_F/.test(r.reason),
  );
  assert(firstF, "the locked baseline must contain at least one Filter F rejection");

  const lines = csv.split("\n");
  // Row index equals the candle index on this file (no dividers, no invalid rows).
  const truncated = lines.slice(0, 2 + firstF.index + 1).join("\n");
  const rerun = runAnalysis(truncated, { seriesEndsComplete: true });
  assert(rerun.ok, "truncated series must parse");

  const sameRow = rerun.analysis.results.find((r) => keyOf(r) === keyOf(firstF));
  assert(sameRow, "the rejected candidate must still be generated at the truncated end");
  assertEqual(sameRow.result, "FAIL", "rejection must be reproduced without any later bar");
  assertEqual(sameRow.reason, firstF.reason, "rejection reason must be identical");
  for (const row of rerun.analysis.results) {
    assert(row.index <= firstF.index, `truncated run produced a row beyond the cut (${row.index})`);
  }
});
