/**
 * Day-indexed backtest lookups.
 *
 * The backtest day loop used to re-filter the full trigger, context, and
 * result arrays once per calendar day (O(days × rows) on the UI thread).
 * These tests pin that the indexed path is the same rows, in the same order,
 * as that naive filter — and that the buckets partition the full sets.
 */
import { test, assert, assertEqual, assertDeepEqual } from "./tiny.mjs";
import { analyseContinuous, contextLogForDay } from "../src/lib/pipeline/continuous.ts";
import {
  buildStrategyBreakdown,
  dayKeyOf,
  indexRowsByDay,
  rangeDays,
  rowsOnDay,
} from "../src/lib/backtest/engine.ts";
import { loadBaselineCsv } from "./fixtures.mjs";

let cached = null;
function continuous() {
  if (!cached) {
    cached = analyseContinuous(loadBaselineCsv(), { seriesEndsComplete: true });
    assert(cached.ok, `baseline continuous analysis succeeds (${cached.ok ? "" : cached.error})`);
  }
  return cached;
}

function naiveOnDay(rows, day) {
  return rows.filter((row) => row.datetime.startsWith(day));
}

function assertSameRows(actual, expected, label) {
  assertEqual(actual.length, expected.length, `${label} length`);
  for (let i = 0; i < expected.length; i++) {
    assert(actual[i] === expected[i], `${label} row ${i} is the same object in the same order`);
  }
}

function spanDays(rows) {
  let min = dayKeyOf(rows[0].datetime);
  let max = min;
  for (const row of rows) {
    const day = dayKeyOf(row.datetime);
    if (day < min) min = day;
    if (day > max) max = day;
  }
  return rangeDays(min, max);
}

test("day-index: tradesOnDay matches the naive per-day filter row-for-row", () => {
  const cont = continuous();
  const days = new Set(cont.tradeTriggers.map((row) => dayKeyOf(row.datetime)));
  days.add("1999-01-01");
  for (const day of days) {
    assertSameRows(
      cont.tradesOnDay(day),
      naiveOnDay(cont.tradeTriggers, day),
      `tradesOnDay ${day}`,
    );
  }

  // Non-canonical prefix keeps the historical startsWith scan (not a silent drop).
  const prefix = cont.tradeTriggers[0].datetime.slice(0, 7);
  assert(prefix.length !== 10, "month prefix is not a calendar-day key");
  assertSameRows(
    cont.tradesOnDay(prefix),
    naiveOnDay(cont.tradeTriggers, prefix),
    `tradesOnDay prefix ${prefix}`,
  );
  assert(cont.tradesOnDay(prefix).length > 0, "prefix lookup still finds rows");
});

test("day-index: contextOnDay and contextLogOnDay match the naive filter row-for-row", () => {
  const cont = continuous();
  const days = new Set(cont.contextEvents.map((row) => dayKeyOf(row.datetime)));
  days.add("1999-01-01");
  for (const day of days) {
    const indexed = cont.contextOnDay(day);
    assertSameRows(indexed, naiveOnDay(cont.contextEvents, day), `contextOnDay ${day}`);
    assertEqual(
      cont.contextLogOnDay(day),
      contextLogForDay(cont.contextEvents, day),
      `contextLogOnDay ${day} matches the unindexed formatter`,
    );
  }
  assertEqual(
    cont.contextLogOnDay("1999-01-01"),
    "[CONTEXT]\n(none)",
    "a day with no context events formats the empty channel",
  );
});

test("day-index: buildStrategyBreakdown(rowsForDay) matches the naive scan and does not rescan", () => {
  // Synthetic short-circuit: an explicit slice is the day's rows, even when
  // it would not match `datetime.startsWith(day)`.
  const synthetic = [
    {
      strategyId: "macd-cross",
      strategy: "MACD Cross",
      datetime: "2026-03-02 10:00:00",
      result: "PASS",
      reason: "breakout",
    },
    {
      strategyId: "macd-cross",
      strategy: "MACD Cross",
      datetime: "2026-03-02 10:30:00",
      result: "FAIL",
      reason: "no trend",
    },
    {
      strategyId: "macd-cross",
      strategy: "MACD Cross",
      datetime: "2026-03-02 11:00:00",
      result: "FAIL",
      reason: "no trend",
    },
    {
      strategyId: "dual-thrust",
      strategy: "Dual Thrust",
      datetime: "2026-03-03 09:00:00",
      result: "FAIL",
      reason: "inside range",
    },
  ];
  const day = "2026-03-02";
  const naiveSynthetic = buildStrategyBreakdown(synthetic, day);
  const indexedSynthetic = buildStrategyBreakdown(
    synthetic,
    day,
    synthetic.filter((row) => row.datetime.startsWith(day)),
  );
  assertDeepEqual(indexedSynthetic, naiveSynthetic, "pre-sliced rows match the full scan");
  const macd = naiveSynthetic.find((entry) => entry.strategyId === "macd-cross");
  assert(macd, "production set includes macd-cross");
  assertEqual(macd.passCount, 1, "synthetic PASS counted");
  assertEqual(macd.evaluatedBars, 3, "synthetic bars counted");
  assertEqual(macd.topFailReasons[0].reason, "no trend", "top fail reason");
  assertEqual(macd.topFailReasons[0].count, 2, "top fail count");

  const forcedEmpty = buildStrategyBreakdown(synthetic, day, []);
  assert(
    forcedEmpty.every((entry) => entry.evaluatedBars === 0 && entry.passCount === 0),
    "an empty rowsForDay must not fall through to scanning results",
  );
  const forced = buildStrategyBreakdown(synthetic, day, [synthetic[3]]);
  assertEqual(
    forced.find((entry) => entry.strategyId === "dual-thrust").evaluatedBars,
    1,
    "rowsForDay is consumed as-is",
  );
  assertEqual(
    forced.find((entry) => entry.strategyId === "macd-cross").evaluatedBars,
    0,
    "rows absent from rowsForDay are not pulled back out of results",
  );

  // Golden window: every calendar day, indexed slice vs the old full-array filter.
  const cont = continuous();
  const results = cont.analysis.results;
  const byDay = indexRowsByDay(results);
  const days = new Set(byDay.keys());
  days.add("1999-01-01");
  for (const probe of days) {
    assertDeepEqual(
      buildStrategyBreakdown(results, probe, byDay.get(probe) ?? []),
      buildStrategyBreakdown(results, probe),
      `breakdown parity ${probe}`,
    );
  }
});

test("day-index: day buckets partition triggers, context events, and result rows", () => {
  const cont = continuous();

  function assertPartition(rows, lookup, label) {
    const seen = new Set();
    let accounted = 0;
    for (const day of new Set(rows.map((row) => dayKeyOf(row.datetime)))) {
      for (const row of lookup(day)) {
        assert(!seen.has(row), `${label} row is in more than one day bucket`);
        seen.add(row);
        assert(row.datetime.startsWith(day), `${label} ${day} bucket contains a foreign row`);
        accounted += 1;
      }
    }
    assertEqual(accounted, rows.length, `${label} every row is in exactly one bucket`);
    assertEqual(seen.size, rows.length, `${label} partition covers distinct rows`);

    let summed = 0;
    for (const day of spanDays(rows)) summed += lookup(day).length;
    assertEqual(summed, rows.length, `${label} calendar-day lookups partition the set`);
  }

  assertPartition(cont.tradeTriggers, (day) => cont.tradesOnDay(day), "triggers");
  assertPartition(cont.contextEvents, (day) => cont.contextOnDay(day), "context");

  const results = cont.analysis.results;
  const byDay = indexRowsByDay(results);
  // The page builds the same index in one pass with dayKeyOf. Pin that the
  // helper and that loop agree, then that the buckets partition the table.
  const viaPage = new Map();
  for (const row of results) {
    const day = dayKeyOf(row.datetime);
    let bucket = viaPage.get(day);
    if (!bucket) {
      bucket = [];
      viaPage.set(day, bucket);
    }
    bucket.push(row);
  }
  assertEqual(viaPage.size, byDay.size, "page loop and indexRowsByDay see the same days");
  for (const [day, rows] of byDay) {
    assertSameRows(viaPage.get(day), rows, `page index ${day}`);
    assertSameRows(rowsOnDay(byDay, results, day), naiveOnDay(results, day), `rowsOnDay ${day}`);
  }
  assertPartition(results, (day) => byDay.get(day) ?? [], "results");
});
