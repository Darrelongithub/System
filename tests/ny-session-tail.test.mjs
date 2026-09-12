/**
 * F6 regression — the NY session runs 16:00-00:59 EAT. Its 00:00-00:59 tail
 * belongs to the session that opened the previous EAT day. Pre-fix, those
 * tail candles were keyed to their CALENDAR day, pointing at a range that
 * opens 15+ hours in their future, so the last NY hour could never trade.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { openingRanges, openingRangeFor, openingSessionDay } from "../src/lib/analyzer/daily.ts";

const mk = (index, datetime, o, h, l, c, session) => ({
  index,
  datetime,
  open: o,
  high: h,
  low: l,
  close: c,
  session,
  similarSwingRefs: [],
  unresolvedRefs: [],
  trend: "ranging",
  raw: {},
});

test("F6: NY tail hour keys to the session's opening day", () => {
  assertEqual(openingSessionDay("2025-01-07 00:30:00", "ny"), "2025-01-06", "00:30 tail");
  assertEqual(openingSessionDay("2025-01-07 00:00:00", "ny"), "2025-01-06", "00:00 tail");
  assertEqual(openingSessionDay("2025-01-06 23:59:00", "ny"), "2025-01-06", "23:59 same day");
  assertEqual(openingSessionDay("2025-01-06 16:30:00", "ny"), "2025-01-06", "same-day ny");
  assertEqual(openingSessionDay("2025-01-07 00:30:00", "london"), "2025-01-07", "london untouched");
  assertEqual(openingSessionDay("2025-01-07 00:30:00", "asian"), "2025-01-07", "asian untouched");
  // Month boundary: tail of the session that opened Jan 31 runs into Feb 1.
  assertEqual(openingSessionDay("2025-02-01 00:15:00", "ny"), "2025-01-31", "month rollover");
});

test("F6: opening ranges make the NY tail hour tradeable", () => {
  const candles = [
    mk(0, "2025-01-06 16:00:00", 100, 105, 99, 102, "ny"),
    mk(1, "2025-01-06 16:30:00", 102, 104, 101, 103, "ny"),
    mk(2, "2025-01-06 17:00:00", 103, 106, 102, 105, "ny"),
    mk(3, "2025-01-07 00:00:00", 104, 104.5, 103.5, 104, "ny"),
    mk(4, "2025-01-07 00:30:00", 104, 104.6, 103.6, 104.1, "ny"),
  ];
  const ranges = openingRanges(candles);
  assertEqual(ranges.size, 1, "exactly one NY opening range");
  const tail = openingRangeFor(ranges, candles[4]);
  assert(tail, "tail-hour candle must find its session's range");
  assertEqual(tail.day, "2025-01-06", "range keyed by opening day");
  assert(tail.afterWindow <= candles[4].index, "range must be in the tail candle's past");
});
