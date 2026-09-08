/**
 * F7 regression — journal MAE/MFE must measure excursion from the actual
 * FILL, not from the trigger bar. Pre-fix, walkTradePath started at the
 * trigger bar: pre-fill spikes inflated MFE (and the pre-close body of a
 * market fill bar inflated both sides).
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { walkTradePath } from "../src/lib/journal/path-walker.ts";

const mk = (index, dt, o, h, l, c) => ({
  index, datetime: dt, open: o, high: h, low: l, close: c,
  similarSwingRefs: [], unresolvedRefs: [], trend: "ranging", raw: {},
});

test("F7: market-order excursion excludes the pre-close body of the fill bar", () => {
  const candles = [
    mk(0, "2025-01-01 00:00:00", 98, 110, 90, 100), // trigger; fill at close 100. Pre-close excursion must not count.
    mk(1, "2025-01-01 00:30:00", 100, 101, 99, 100),
    mk(2, "2025-01-01 01:00:00", 100, 101, 94, 95), // SL 95
  ];
  const rec = walkTradePath(
    { strategyId: "x", strategy: "X", datetime: "2025-01-01 00:00:00", index: 0, side: "long", entry: 100, sl: 95, tp: 120, orderType: "market", rMultiple: -1 },
    candles,
  );
  assert(rec, "journal record");
  assertEqual(rec.outcome, "SL", "outcome");
  // risk = 5. From fill: adverse low 94 -> (100-94)/5 = 1.2; favorable high 101 -> 0.2.
  assertEqual(rec.maeR, 1.2, "mae excludes trigger bar's deeper low 90");
  assertEqual(rec.mfeR, 0.2, "mfe excludes trigger bar's higher high 110");
});

test("F7: stop/limit excursion excludes pre-fill bars, includes the fill bar", () => {
  const candles = [
    mk(0, "2025-01-01 00:00:00", 96, 97, 95, 96), // trigger; limit short at 100 is above market
    mk(1, "2025-01-01 00:30:00", 96, 97, 85.2, 96), // pre-fill favorable dip (old code: mfe 2.96R)
    mk(2, "2025-01-01 01:00:00", 96, 100.5, 95, 99), // fills at 100 touch; no TP/SL same bar
    mk(3, "2025-01-01 01:30:00", 99, 105.5, 98, 105), // SL 105
  ];
  const rec = walkTradePath(
    { strategyId: "x", strategy: "X", datetime: "2025-01-01 00:00:00", index: 0, side: "short", entry: 100, sl: 105, tp: 85, orderType: "limit", rMultiple: -1 },
    candles,
  );
  assert(rec, "journal record");
  assertEqual(rec.outcome, "SL", "outcome");
  // From the fill bar onward: favorable = 100-95 = 5 -> 1.0R (fill bar's own
  // range counts; intrabar order is unknowable — documented convention).
  // Pre-fill dip to 85.2 (2.96R) must NOT appear.
  assertEqual(rec.mfeR, 1.0, "mfe from fill bar onward");
  assertEqual(rec.maeR, 1.1, "mae from fill bar onward");
});

test("F7: never-filled trades carry no excursion", () => {
  const candles = [mk(0, "2025-01-01 00:00:00", 100, 101, 99, 100)];
  for (let i = 1; i <= 25; i++) {
    const day = 1 + Math.floor(i / 48);
    const slot = i % 48;
    const hh = String(Math.floor(slot / 2)).padStart(2, "0");
    const mm = slot % 2 === 0 ? "00" : "30";
    candles.push(mk(i, `2025-01-${String(day).padStart(2, "0")} ${hh}:${mm}:00`, 100, 101, 99, 100));
  }
  const rec = walkTradePath(
    { strategyId: "x", strategy: "X", datetime: "2025-01-01 00:00:00", index: 0, side: "long", entry: 110, sl: 95, tp: 120, orderType: "limit" },
    candles,
  );
  assert(rec, "journal record");
  assertEqual(rec.outcome, "no_fill", "expired limit = no_fill");
  assertEqual(rec.maeR, 0, "no adverse excursion without a fill");
  assertEqual(rec.mfeR, 0, "no favorable excursion without a fill");
});
