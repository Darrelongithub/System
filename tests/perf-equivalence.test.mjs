/**
 * PERFORMANCE-REFACTOR EQUIVALENCE.
 *
 * The v1.10 lag fix replaced three superlinear scans in the engine pass with
 * indexed lookups. None of them was allowed to change a single decision, and
 * these tests pin that by running the replaced algorithm (copied verbatim
 * below) next to the shipped one on the same inputs:
 *
 *   1. structure.ts#precomputeTrendsAtCompletions — the incremental confirmed-
 *      pivot walk replaces a per-completion full-prefix pivot scan (O(bars²)).
 *   2. day-lookup.ts — binary search replaces `ctx.daily.filter(...)` per
 *      candle (O(candles × days)) in the production strategies and filters.
 *   3. status.ts#countForwardValid — suffix counts replace a walk to the end of
 *      the file per PASS row.
 *
 * The golden lock pins the resulting book; this file pins the mechanism, so a
 * future edit to the fast paths fails loudly instead of silently shifting a
 * trend or a prior-day level.
 */
import { test, assert, assertEqual, assertDeepEqual } from "./tiny.mjs";
import { aggregate30m, precomputeTrendsAtCompletions } from "../src/lib/analyzer/structure.ts";
import {
  daysBefore,
  daysBeforeTail,
  indexOfDay,
  lastDayBefore,
  lastDayBeforeIndex,
} from "../src/lib/analyzer/day-lookup.ts";
import { dailyAggregates } from "../src/lib/analyzer/daily.ts";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import { runAnalysis } from "../src/lib/analyzer/run.ts";
import { ANALYZER_CERTIFIED_OPTIONS } from "../src/lib/analyzer/config.ts";
import { loadBaselineCsv } from "./fixtures.mjs";

// ---------------------------------------------------------------------------
// The replaced implementations, verbatim from the pre-v1.10 sources.
// ---------------------------------------------------------------------------

function rising(values) {
  return values.length >= 2 && values.every((v, i) => i === 0 || v > values[i - 1]);
}
function falling(values) {
  return values.length >= 2 && values.every((v, i) => i === 0 || v < values[i - 1]);
}
function naiveTrendFrom(highs, lows) {
  const h = highs.slice(-2);
  const l = lows.slice(-2);
  if (h.length < 2 || l.length < 2) return "ranging";
  if (rising(h) && rising(l)) return "bullish";
  if (falling(h) && falling(l)) return "bearish";
  return "ranging";
}
function naiveTrendFromCompletedPrefix(bars, count) {
  if (count < 7) return "ranging";
  const highsArr = new Array(count);
  const lowsArr = new Array(count);
  for (let i = 0; i < count; i++) {
    highsArr[i] = bars[i].high;
    lowsArr[i] = bars[i].low;
  }
  const k = 2;
  const pivotHighs = [];
  const pivotLows = [];
  for (let i = k; i < count - k; i++) {
    const h = highsArr[i];
    const l = lowsArr[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (highsArr[j] >= h) isHigh = false;
      if (lowsArr[j] <= l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) pivotHighs.push(h);
    if (isLow) pivotLows.push(l);
  }
  return naiveTrendFrom(pivotHighs.slice(-5), pivotLows.slice(-5));
}
function naiveCompletions(bars) {
  return bars.map((bar, j) => ({
    endMs: bar.endMs,
    trend: naiveTrendFromCompletedPrefix(bars, j + 1),
  }));
}
function naiveLastBefore(rows, day) {
  return rows.filter((row) => row.day < day).at(-1);
}
function naiveLastBeforeIndex(rows, day) {
  let found = -1;
  for (let i = 0; i < rows.length; i++) if (rows[i].day < day) found = i;
  return found;
}
function naiveTailBefore(rows, day, n) {
  return rows.filter((row) => row.day < day).slice(-n);
}
function naiveDaysBefore(rows, day) {
  return rows.filter((row) => row.day < day);
}

// ---------------------------------------------------------------------------

/** Deterministic pseudo-random HTF bars, including plateaus that create ties. */
function syntheticBars(count, seed = 7) {
  let state = seed;
  const rand = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const bars = [];
  let price = 2000;
  for (let i = 0; i < count; i++) {
    // Every 11th bar is a flat plateau: equal highs/lows must not be a pivot.
    const flat = i % 11 === 5;
    const open = price;
    const close = flat ? open : open + (rand() - 0.5) * 4;
    const high = flat ? open + 1 : Math.max(open, close) + rand() * 1.5;
    const low = flat ? open - 1 : Math.min(open, close) - rand() * 1.5;
    bars.push({ startMs: i * 3600_000, endMs: (i + 1) * 3600_000, open, high, low, close });
    price = close;
  }
  return bars;
}

test("equivalence: incremental completion trends equal the prefix-scan they replaced", () => {
  for (const count of [0, 1, 4, 6, 7, 8, 9, 40, 250]) {
    const bars = syntheticBars(count);
    assertDeepEqual(
      precomputeTrendsAtCompletions(bars),
      naiveCompletions(bars),
      `synthetic ${count}-bar completion trends`,
    );
  }
  // A monotone run produces a pivot every other bar; a permanent plateau
  // produces none. Both must agree with the prefix scan bar-for-bar.
  const monotone = syntheticBars(60).map((bar, i) => ({
    ...bar,
    low: 100 + i,
    high: 101 + i,
    open: 100.5 + i,
    close: 100.8 + i,
  }));
  assertDeepEqual(
    precomputeTrendsAtCompletions(monotone),
    naiveCompletions(monotone),
    "monotone completion trends",
  );
});

test("equivalence: completion trends on the real baseline match the prefix scan", () => {
  const { candles } = parseCsv(loadBaselineCsv());
  for (const key of ["h1", "h4", "d1"]) {
    const bars = aggregate30m(candles, key);
    assert(bars.length > 100, `${key} aggregation produced bars`);
    assertDeepEqual(
      precomputeTrendsAtCompletions(bars),
      naiveCompletions(bars),
      `${key} completion trends on the locked baseline`,
    );
  }
});

test("equivalence: day lookups match filter/at/slice/findIndex on the baseline", () => {
  // The same aggregates runAnalysis hands to the strategies as `ctx.daily`.
  const daily = dailyAggregates(parseCsv(loadBaselineCsv()).candles);
  assert(daily.length > 100, "daily aggregates present");

  const days = [
    daily[0].day,
    daily[1].day,
    daily[Math.floor(daily.length / 2)].day,
    daily[daily.length - 1].day,
    "1999-01-01",
    "2999-01-01",
  ];
  for (const day of days) {
    assertEqual(lastDayBeforeIndex(daily, day), naiveLastBeforeIndex(daily, day), `index ${day}`);
    assertDeepEqual(lastDayBefore(daily, day), naiveLastBefore(daily, day), `prior ${day}`);
    assertDeepEqual(daysBefore(daily, day), naiveDaysBefore(daily, day), `days before ${day}`);
    for (const n of [0, 1, 5, 10, 60]) {
      assertDeepEqual(
        daysBeforeTail(daily, day, n),
        naiveTailBefore(daily, day, n),
        `tail ${day}/${n}`,
      );
    }
  }

  // Exact-day lookup used by the research filters' priorDayPos.
  for (const day of days) {
    assertEqual(
      indexOfDay(daily, day),
      daily.findIndex((d) => d.day === day),
      `indexOfDay ${day}`,
    );
  }

  // The fallback path must reproduce the array-order semantics of the original
  // filter, so a non-ascending array cannot silently return a different day.
  const unsorted = [...daily.slice(0, 30)].reverse();
  assertEqual(
    lastDayBeforeIndex(unsorted, days[1]),
    naiveLastBeforeIndex(unsorted, days[1]),
    "unsorted fallback index",
  );
  assertDeepEqual(
    lastDayBefore(unsorted, days[1]),
    naiveLastBefore(unsorted, days[1]),
    "unsorted fallback prior day",
  );
  assertDeepEqual(
    daysBefore(unsorted, days[1]),
    naiveDaysBefore(unsorted, days[1]),
    "unsorted days",
  );
  assertDeepEqual(
    daysBeforeTail(unsorted, days[1], 5),
    naiveTailBefore(unsorted, days[1], 5),
    "unsorted tail",
  );
  assertEqual(
    indexOfDay(unsorted, daily[3].day),
    unsorted.findIndex((d) => d.day === daily[3].day),
    "unsorted indexOfDay",
  );
});

test("equivalence: candlesSinceTrigger equals a naive count to the end of the series", () => {
  const { candles } = parseCsv(loadBaselineCsv());
  const analysis = runAnalysis(loadBaselineCsv(), ANALYZER_CERTIFIED_OPTIONS);
  assert(analysis.ok, "baseline run ok");
  const naive = (fromIndex) => {
    let n = 0;
    for (let i = fromIndex + 1; i < candles.length; i++) if (!candles[i].invalid) n++;
    return n;
  };
  const rows = analysis.analysis.tradePasses;
  assert(rows.length === 2286, "golden trade rows");
  for (const row of rows) {
    assertEqual(row.candlesSinceTrigger, naive(row.index), `candlesSinceTrigger @ ${row.datetime}`);
  }
});
