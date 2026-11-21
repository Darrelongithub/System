/**
 * G1 regression — Saturday session tails (Forex weeks close Saturday ~01:00
 * EAT) carry real candles and real trade triggers. Pre-fix, the backtest day
 * loop short-circuited on `isWeekend(day) || (no data)`, so every Saturday
 * emitted a SKIPPED report and its triggers never entered the rolling
 * strategy stats: the report silently undercounted the engine's own
 * continuous pass. These tests pin the predicate and prove day-supplied
 * accounting now equals the continuous total over the full baseline series.
 *
 * Re-based to the v2.0 ruleset (regime-routed bots): the locked baseline now
 * contains 0 weekend trigger-bearing days — every trigger lands Monday,
 * Tuesday, Wednesday, Thursday or Friday (M 47 / T 35 / W 42 / Th 31 / F 31)
 * — so the old "37 Saturday-tail Saturdays" anchor is replaced by an explicit
 * 0-trigger assertion over the same map.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { dayReportSkipReason, isSunday, isWeekend, rangeDays } from "../src/lib/backtest/engine.ts";
import { analyseContinuous } from "../src/lib/pipeline/continuous.ts";
import { loadBaselineCsv } from "./fixtures.mjs";

test("G1: dayReportSkipReason predicate — every day class is classified correctly", () => {
  // Sunday 2025-11-09 / Saturday 2025-11-08 are weekends; Friday 2025-11-07 is not.
  assert(!isWeekend("2025-11-07"), "friday sanity");
  assert(isWeekend("2025-11-08"), "saturday sanity");
  assert(isWeekend("2025-11-09"), "sunday sanity");

  // Weekend, nothing at all: skip, weekend wording.
  assertEqual(
    dayReportSkipReason("2025-11-09", false, 0, 0),
    "weekend — no market session / no OHLC expected",
  );
  // Weekday, nothing at all: skip, honest no-bars wording (no invented data).
  assertEqual(
    dayReportSkipReason("2025-11-04", false, 0, 0),
    "no OHLC bars for this calendar day in the continuous series",
  );
  // Weekend with session-tail candles but no triggers: still skipped, but the
  // reason must not claim "no market session" — the tail session existed.
  assertEqual(
    dayReportSkipReason("2025-11-08", true, 0, 0),
    "weekend — session tail candles only, no trade triggers",
  );
  // THE FIX: a weekend day carrying trade triggers is processed, never skipped.
  assertEqual(dayReportSkipReason("2025-11-08", true, 2, 0), null, "saturday with triggers");
  assertEqual(
    dayReportSkipReason("2025-11-08", true, 2, 3),
    null,
    "saturday with triggers+context",
  );
  // Context-only weekend (candles implied absent) stays skipped.
  assertEqual(
    dayReportSkipReason("2025-11-08", false, 0, 1),
    "weekend — session tail candles only, no trade triggers",
  );
  // Weekdays with any content are processed (unchanged pre-fix behavior).
  assertEqual(dayReportSkipReason("2025-11-07", true, 0, 0), null, "weekday with candles");
  assertEqual(dayReportSkipReason("2025-11-07", false, 1, 0), null, "weekday with triggers");

  // Range gate: only Sunday-only selections are refused up front — a
  // Saturday-containing range is runnable because the Friday session tail may
  // trade (the old all-weekend gate contradicted the fixed loop).
  assert(isSunday("2025-11-09"), "sunday detected");
  assert(!isSunday("2025-11-08"), "saturday not sunday");
  const sunOnly = ["2025-11-02", "2025-11-09"];
  const satSun = ["2025-11-08", "2025-11-09"];
  assert(sunOnly.every(isSunday), "sunday-only range is refused");
  assert(!satSun.every(isSunday), "sat+sun range is allowed to run");
});

test("G1: day-supplied trigger accounting matches the continuous engine over the full baseline", async () => {
  const continuous = analyseContinuous(loadBaselineCsv(), { seriesEndsComplete: true });
  assert(continuous.ok, "baseline continuous analysis succeeds");

  const rows = continuous.analysis.results;
  const daysWithCandles = new Set(rows.map((c) => c.datetime.slice(0, 10)));
  const [firstRow, lastRow] = [rows[0], rows[rows.length - 1]];
  assert(lastRow.datetime.slice(0, 10) >= firstRow.datetime.slice(0, 10), "chronological");

  let applied = 0;
  let skippedDays = 0;
  let weekendTriggerBearing = new Map(); // day -> trigger count (must all be processed)
  for (const day of rangeDays(firstRow.datetime.slice(0, 10), lastRow.datetime.slice(0, 10))) {
    const triggers = continuous.tradesOnDay(day);
    const ctx = continuous.contextOnDay(day);
    if (isWeekend(day) && triggers.length > 0) {
      weekendTriggerBearing.set(day, triggers.length);
    }
    const reason = dayReportSkipReason(day, daysWithCandles.has(day), triggers.length, ctx.length);
    if (reason !== null) {
      skippedDays += 1;
      assert(triggers.length === 0, `skipped day ${day} carried no triggers`);
      continue;
    }
    applied += triggers.length;
  }

  assertEqual(applied, continuous.tradeTriggers.length, "every engine trigger is applied");
  assert(skippedDays > 0, "true empty days are still skipped");
  // v2.0 locked baseline: no trigger-bearing weekend days at all (the old
  // v1.8 ruleset had 37 Saturday-tail triggers); the G1 fix keeps any
  // future Saturday-tail triggers in the day loop rather than skipping them.
  assertEqual(
    [...weekendTriggerBearing.values()].reduce((a, b) => a + b, 0),
    0,
    "all 0 weekend-tail triggers accounted",
  );
  assert(!weekendTriggerBearing.has("9999-01-01"), "map is real");
});
