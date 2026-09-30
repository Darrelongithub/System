/**
 * OHLC-ENRICHMENT EQUIVALENCE.
 *
 * `enrichOhlcRows` (src/lib/ohlc-generator.ts) computes the swing columns the
 * analyzer's entire trend layer reads. Three of its scans grew with the square
 * of the series length, which is what made a multi-year OHLC export freeze the
 * tab:
 *
 *   1. "nearest prior opposite swing"  — `[...rows.slice(0, i)].reverse().find(...)`
 *      copied and reversed the whole prefix once per swing.
 *   2. `swingInvalidated`              — `rows.slice(i + 1).some(...)` copied the
 *      whole suffix once per swing. Now a precomputed suffix extreme.
 *   3. similar-swing candidates        — `rows.filter(...)` over the full table
 *      once per swing, plus a second array and a full sort before taking five.
 *      Now one pass over the prior swings with a bounded top-five.
 *
 * None of them was allowed to change a single value. These tests re-implement
 * the replaced scans VERBATIM next to the shipped code and compare the values
 * they are allowed to affect: `swingRange` (1), `swingInvalidated` (2), and
 * `similarSwingRefs` / `similarSwingRetracePct` / `similarSwingContinuedPct` (3).
 *
 * The golden analyzer lock pins the downstream book; this file pins the
 * mechanism, so a future edit to the fast paths fails loudly instead of
 * silently shifting the swing context of every row.
 */
import { test, assert, assertEqual, assertDeepEqual } from "./tiny.mjs";
import { loadBaselineCsv } from "./fixtures.mjs";
import { enrichOhlcRows } from "../src/lib/ohlc-generator.ts";

// ---------------------------------------------------------------------------
// The replaced scans, verbatim from the pre-fix source.
// ---------------------------------------------------------------------------

function naivePriorOppositeSwingRange(enriched, index) {
  const row = enriched[index];
  const isSwingHigh = row.swingType === "high";
  const priorOpposite = [...enriched.slice(0, index)]
    .reverse()
    .find((item) => item.swingType === (isSwingHigh ? "low" : "high") && item.swingPrice !== null);
  const fallbackWindow = enriched.slice(Math.max(0, index - 20), index);
  const anchorPrice =
    priorOpposite && priorOpposite.swingPrice !== null
      ? priorOpposite.swingPrice
      : fallbackWindow.length > 0
        ? isSwingHigh
          ? Math.min(...fallbackWindow.map((item) => item.low))
          : Math.max(...fallbackWindow.map((item) => item.high))
        : null;
  return anchorPrice === null ? null : Math.abs(row.swingPrice - anchorPrice);
}

function naiveSwingInvalidated(enriched, index) {
  const row = enriched[index];
  const isSwingHigh = row.swingType === "high";
  return enriched
    .slice(index + 1)
    .some((item) => (isSwingHigh ? item.close > row.swingPrice : item.close < row.swingPrice));
}

function naiveComparableSwings(enriched, index) {
  const row = enriched[index];
  const rowSwingRange = row.swingRange;
  const withinTolerance = (candidate) => {
    if (candidate.swingRange === null || row.swingRange === null) return false;
    return (
      Math.abs(candidate.swingRange - row.swingRange) /
        Math.max(candidate.swingRange, row.swingRange) <=
      0.5
    );
  };
  const baseCandidates = enriched.filter(
    (candidate) =>
      candidate.index < row.index &&
      candidate.swingType === row.swingType &&
      candidate.swingRange !== null &&
      candidate.observedRetracePct !== null &&
      withinTolerance(candidate),
  );
  const sameSession = baseCandidates.filter((candidate) => candidate.session === row.session);
  const pool = sameSession.length > 0 ? sameSession : baseCandidates;
  return pool
    .sort((left, right) => {
      const leftDistance = Math.abs(left.swingRange - rowSwingRange);
      const rightDistance = Math.abs(right.swingRange - rowSwingRange);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return right.index - left.index;
    })
    .slice(0, 5);
}

function average(values) {
  return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A `FilteredCandle` — only the fields `enrichOhlcRows` actually reads. */
function candle(datetimeEAT, open, high, low, close) {
  return {
    datetimeEAT,
    open,
    high,
    low,
    close,
    direction: close >= open ? "Bullish" : "Bearish",
    body: Math.abs(close - open),
    upperWick: high - Math.max(open, close),
    lowerWick: Math.min(open, close) - low,
    range: high - low,
    bodyPercent: high - low > 0 ? (Math.abs(close - open) / (high - low)) * 100 : 0,
  };
}

/** Deterministic 30-minute EAT series, hour-aligned so session buckets vary. */
function syntheticSeries(count, seed = 11) {
  let state = seed;
  const rand = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const rows = [];
  let price = 2000;
  let minute = 0;
  for (let i = 0; i < count; i++) {
    // Every 11th bar is a flat plateau: equal highs/lows must not be a swing.
    const flat = i % 11 === 5;
    const open = price;
    const close = flat ? open : open + (rand() - 0.5) * 6;
    const high = flat ? open + 0.5 : Math.max(open, close) + rand() * 2;
    const low = flat ? open - 0.5 : Math.min(open, close) - rand() * 2;
    const hour = Math.floor(minute / 60) % 24;
    const day = 1 + Math.floor(minute / 1440);
    rows.push(
      candle(
        `2026-0${1 + (day % 9)}-${String((day % 28) + 1).padStart(2, "0")} ` +
          `${String(hour).padStart(2, "0")}:${minute % 60 === 0 ? "00" : "30"}:00`,
        open,
        high,
        low,
        close,
      ),
    );
    price = close;
    minute += 30;
  }
  return rows;
}

/** Baseline OHLC values are the real reference for "what healthy data looks like". */
function baselineSeries() {
  const lines = loadBaselineCsv().split("\n");
  const header = lines[1].split(",");
  const at = (name) => header.indexOf(name);
  const rows = [];
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("=")) continue;
    const cells = line.split(",");
    rows.push(
      candle(
        cells[at("datetime")],
        Number(cells[at("open")]),
        Number(cells[at("high")]),
        Number(cells[at("low")]),
        Number(cells[at("close")]),
      ),
    );
  }
  return rows;
}

/**
 * Compare the shipped enrichment against the naive scans.
 *
 * Only rows that own their swing context are comparable for (3): the
 * inheritance pass (unchanged, and deliberately so) copies a prior swing's
 * refs onto rows that found no comparable swing of their own.
 */
function assertEnrichmentMatchesNaive(rows, label) {
  const enriched = enrichOhlcRows(rows);
  assertEqual(enriched.length, rows.length, `${label}: every row survives enrichment`);

  for (let index = 0; index < enriched.length; index++) {
    const row = enriched[index];
    if (!row.swingType || row.swingPrice === null) continue;

    // (1) magnitude from the nearest prior opposite swing
    const expectedRange = naivePriorOppositeSwingRange(enriched, index);
    if (expectedRange !== null && expectedRange > 0) {
      assertEqual(
        row.swingRange,
        expectedRange,
        `${label}: swingRange @ ${index} (${row.datetimeEAT})`,
      );
    }

    // (2) invalidation by any later close past the swing price
    assertEqual(
      row.swingInvalidated,
      naiveSwingInvalidated(enriched, index),
      `${label}: swingInvalidated @ ${index} (${row.datetimeEAT})`,
    );

    // (3) the similar-swing set, and the statistics derived from it
    if (row.swingRange === null || row.swingContextSource !== "own_swing") continue;
    const expected = naiveComparableSwings(enriched, index);
    assertDeepEqual(
      row.similarSwingRefs,
      expected.map((candidate) => candidate.datetimeEAT),
      `${label}: similarSwingRefs @ ${index} (${row.datetimeEAT})`,
    );
    if (expected.length === 0) continue;
    const values = expected
      .map((candidate) => Number(candidate.observedRetracePct))
      .filter((value) => Number.isFinite(value));
    const retrace = average(values);
    assertEqual(
      row.similarSwingRetracePct,
      retrace,
      `${label}: similarSwingRetracePct @ ${index} (${row.datetimeEAT})`,
    );
    const resolved = expected.filter((candidate) => candidate.swingOutcome !== "unresolved");
    assertEqual(
      row.similarSwingContinuedPct,
      resolved.length > 0
        ? (resolved.filter((c) => c.swingOutcome === "continued").length / resolved.length) * 100
        : null,
      `${label}: similarSwingContinuedPct @ ${index} (${row.datetimeEAT})`,
    );
  }
  return enriched;
}

// ---------------------------------------------------------------------------

test("enrich: synthetic series (incl. plateaus and short prefixes) match the naive scans", () => {
  for (const count of [0, 1, 8, 9, 40, 240]) {
    assertEnrichmentMatchesNaive(syntheticSeries(count), `synthetic ${count}`);
  }
  // A monotone run: every bar is both a swing high and a swing low, so the
  // `isSwingHigh === isSwingLow` tie-break is exercised on every row.
  const monotone = [];
  let minute = 0;
  for (let i = 0; i < 120; i++) {
    const hour = Math.floor(minute / 60) % 24;
    const day = 1 + Math.floor(minute / 1440);
    monotone.push(
      candle(
        `2026-03-0${1 + (day % 9)} ${String(hour).padStart(2, "0")}:${minute % 60 === 0 ? "00" : "30"}:00`,
        100 + i,
        101 + i,
        99 + i,
        100.5 + i,
      ),
    );
    minute += 30;
  }
  assertEnrichmentMatchesNaive(monotone, "monotone");
});

test("enrich: the locked baseline matches the naive scans row-for-row", () => {
  const rows = baselineSeries();
  assert(rows.length > 9000, `baseline rows present (${rows.length})`);
  const enriched = assertEnrichmentMatchesNaive(rows, "baseline");

  // The point of the change was speed without drift: the shipped file's own
  // swing columns must still be reproduced from the same OHLC.
  const ownSwings = enriched.filter((row) => row.swingContextSource === "own_swing").length;
  assert(ownSwings > 100, `baseline still produces own-swing rows (${ownSwings})`);
  const withRefs = enriched.filter((row) => row.similarSwingRefs.length > 0).length;
  assert(
    withRefs / enriched.length > 0.9,
    `swing-reference coverage is still high (${((withRefs / enriched.length) * 100).toFixed(2)}%)`,
  );
});

test("enrich: a swing never compares against itself", () => {
  // Two identical swings: the second may reference the first, never itself.
  const rows = [
    candle("2026-03-02 00:00:00", 10, 20, 5, 12),
    candle("2026-03-02 00:30:00", 12, 14, 6, 13),
    candle("2026-03-02 01:00:00", 13, 15, 7, 14),
    candle("2026-03-02 01:30:00", 14, 30, 8, 28),
    candle("2026-03-02 02:00:00", 28, 29, 20, 21),
    candle("2026-03-02 02:30:00", 21, 22, 15, 16),
    candle("2026-03-02 03:00:00", 16, 17, 10, 11),
    candle("2026-03-02 03:30:00", 11, 40, 9, 38),
    candle("2026-03-02 04:00:00", 38, 39, 30, 31),
    candle("2026-03-02 04:30:00", 31, 32, 25, 26),
    candle("2026-03-02 05:00:00", 26, 27, 20, 21),
  ];
  const enriched = enrichOhlcRows(rows);
  for (const row of enriched) {
    assert(
      !row.similarSwingRefs.includes(row.datetimeEAT),
      `row ${row.datetimeEAT} does not reference itself`,
    );
    for (const ref of row.similarSwingRefs) {
      const target = enriched.find((candidate) => candidate.datetimeEAT === ref);
      assert(target && target.index < row.index, `ref ${ref} points strictly backwards`);
    }
  }
  assertDeepEqual(
    enriched.map((row) => row.swingInvalidated),
    enriched.map((row) =>
      row.swingType === null
        ? row.swingInvalidated
        : enriched
            .slice(row.index + 1)
            .some((later) =>
              row.swingType === "high"
                ? later.close > row.swingPrice
                : later.close < row.swingPrice,
            ),
    ),
    "tiny-series invalidation flags",
  );
});
