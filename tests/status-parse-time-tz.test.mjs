/**
 * v1.7 regression — status.ts#parseTime must interpret offset-less candle
 * timestamps as EAT (+03:00) whether the date/time separator is a space or a
 * `T`, and must be independent of the host machine's timezone.
 *
 * Pre-fix, `T`-separated strings were handed to Date.parse() bare, which the
 * ECMAScript spec interprets as HOST-LOCAL time. On a UTC host that put a
 * `T` candle 3h later than the same wall-clock space-separated candle, so the
 * Crabel ORB one-hour breakeven clock saw 180 min elapsed after 30 real
 * minutes and moved the stop to entry three candles early.
 *
 * The golden fixture cannot catch this (all space-separated), so this test:
 *   1. builds a synthetic Crabel ORB fill where the fill candle uses a space
 *      and the following candles use `T`;
 *   2. asserts the breakeven stop is NOT active on the +30 min candle and IS
 *      active on the +60 min candle;
 *   3. runs the same scenario under several host TZ values (via the Date
 *      constructor's local-time behaviour) — the assertions must hold in all.
 *
 * Note: process.env.TZ must be set BEFORE any Date parsing happens in a Node
 * process for V8 to honour it, so tests/run.mjs spawns this file separately
 * for each TZ rather than mutating TZ in-process.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { evaluateSetupStatus } from "../src/lib/analyzer/status.ts";
import { CRABEL_ORB_BREAKEVEN_MINUTES } from "../src/lib/strategies/crabel-orb.ts";

function candle(index, datetime, o, h, l, c) {
  return {
    index,
    datetime,
    open: o,
    high: h,
    low: l,
    close: c,
    isReliable: true,
    similarSwingRefs: [],
  };
}

/**
 * Long ORB: entry 100, initial SL 90. Fill candle trades through entry.
 * Subsequent candles dip to 99 (between entry and SL). If breakeven is
 * wrongly active, 99 <= 100 touches the "stop at entry" and the trade
 * resolves early. If correct, only the candle at +60 min resolves it.
 */
function scenario(sepFill, sepAfter) {
  const t = (hh, mm, sep) => `2025-01-06${sep}${hh}:${mm}:00`;
  const candles = [
    candle(0, t("11", "00", sepFill), 98, 99, 97, 98), // setup / trigger bar
    candle(1, t("11", "30", sepFill), 99, 101, 98.5, 100.5), // fills at 100 (touches entry)
    candle(2, t("12", "00", sepAfter), 100.5, 101, 99, 100.2), // +30 min: dips to 99
    candle(3, t("12", "30", sepAfter), 100.2, 101, 99, 100.1), // +60 min: dips to 99 -> breakeven stop
    candle(4, t("13", "00", sepAfter), 100.1, 101, 99, 100), // +90 min
  ];
  const row = {
    strategyId: "opening-range-breakout",
    index: 0,
    side: "long",
    orderType: "stop",
    entry: 100,
    sl: 90,
    tp: 120,
  };
  return { candles, row };
}

test(`parseTime: mixed space/T separators keep Crabel breakeven at +${CRABEL_ORB_BREAKEVEN_MINUTES} min (TZ=${process.env.TZ ?? "host"})`, () => {
  for (const [sepFill, sepAfter] of [
    [" ", " "],
    [" ", "T"],
    ["T", " "],
    ["T", "T"],
  ]) {
    const { candles, row } = scenario(sepFill, sepAfter);
    const result = evaluateSetupStatus(row, candles);
    const label = `fill sep=${JSON.stringify(sepFill)} after sep=${JSON.stringify(sepAfter)}`;

    assertEqual(result.setupStatus, "RESOLVED", `${label}: should resolve via breakeven stop`);
    assertEqual(result.resolutionLevel, "SL", `${label}: resolution level`);
    assertEqual(result.resolutionPrice, 100, `${label}: breakeven stop = entry`);
    // Must resolve on the +60 min candle (index 3), NOT the +30 min candle (index 2).
    assertEqual(
      result.resolutionCandle?.index,
      3,
      `${label}: breakeven must activate at +60 min, not earlier/later (got candle ${result.resolutionCandle?.index})`,
    );
    assert(
      /breakeven stop hit/.test(result.statusNote),
      `${label}: note should say breakeven stop, got: ${result.statusNote}`,
    );
  }
});

test("parseTime: explicit offsets are respected, not double-applied", () => {
  // Same instants expressed three ways. If any is mis-parsed the elapsed
  // clock is wrong and resolution lands on a different candle.
  const variants = [
    ["2025-01-06 11:30:00", "2025-01-06T12:00:00+03:00", "2025-01-06T09:30:00Z"], // +30 EAT, then +60 as UTC
  ];
  for (const [fillDt, plus30, plus60] of variants) {
    const candles = [
      candle(0, "2025-01-06 11:00:00", 98, 99, 97, 98),
      candle(1, fillDt, 99, 101, 98.5, 100.5),
      candle(2, plus30, 100.5, 101, 99, 100.2),
      candle(3, plus60, 100.2, 101, 99, 100.1),
    ];
    const row = {
      strategyId: "opening-range-breakout",
      index: 0,
      side: "long",
      orderType: "stop",
      entry: 100,
      sl: 90,
      tp: 120,
    };
    const result = evaluateSetupStatus(row, candles);
    assertEqual(result.setupStatus, "RESOLVED", "offset variants resolve");
    assertEqual(
      result.resolutionCandle?.index,
      3,
      `offset variants: breakeven on +60 candle (got ${result.resolutionCandle?.index})`,
    );
  }
});
