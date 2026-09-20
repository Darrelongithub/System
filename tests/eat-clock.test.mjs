/**
 * The EAT clock, and what a row whose `session` column contradicts its own
 * timestamp does to the opening ranges.
 *
 * 1. `todayEat()` — the pages' date defaults, the snapshot's timestamp and the
 *    requested OHLC window must all describe the same day the EAT clock shows.
 *    A browser-local `new Date()` formatted locally is *yesterday* in EAT for
 *    the first hours of the EAT day on any client west of UTC+3, which would
 *    default a fetch to a series ending one day before the newest bar. That was
 *    a real defect; the fix routes every default through the shared helper.
 *
 * 2. Session labels vs the clock. `minutesIntoSession` wraps past midnight
 *    (the NY session runs 16:00-00:59 EAT), so a label contradicted by the
 *    timestamp — a "ny" row at midday — reports 8+ hours elapsed and therefore
 *    falls outside the 30-minute opening window. The range builder was audited
 *    against this and needs no guard: such a row can neither widen an existing
 *    range nor create a phantom one. These tests pin that behaviour so a future
 *    "helpful" wrap change cannot quietly start widening ORB levels.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { repoPath } from "./fixtures.mjs";
import { readFileSync } from "node:fs";
import { todayEat, minutesIntoSession, sessionOf } from "../src/lib/analyzer/time.ts";
import { openingRanges, openingRangeFor } from "../src/lib/analyzer/daily.ts";

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

test("eat clock: todayEat flips exactly at EAT midnight", () => {
  // 20:59 UTC = 23:59 EAT on Jan 1; one minute later it is Jan 2 in EAT.
  assertEqual(todayEat(Date.UTC(2026, 0, 1, 20, 59)), "2026-01-01", "23:59 EAT");
  assertEqual(todayEat(Date.UTC(2026, 0, 1, 21, 0)), "2026-01-02", "00:00 EAT");
  // EAT has no DST: the offset is +03:00 all year.
  assertEqual(todayEat(Date.UTC(2026, 6, 1, 21, 0)), "2026-07-02", "July midnight");
  assertEqual(todayEat(Date.UTC(2026, 11, 31, 21, 0)), "2027-01-01", "year rollover");
  // Leap day.
  assertEqual(todayEat(Date.UTC(2028, 1, 28, 21, 0)), "2028-02-29", "leap day");
});

test("eat clock: the pages derive their date defaults from the shared EAT helper", () => {
  // Source-level check (the same technique the generator suites use): the
  // browser-local default is the bug, so its absence is part of the contract.
  const generator = readFileSync(repoPath("src/pages/DataGenerator.tsx"), "utf8");
  assert(
    !generator.includes('format(new Date(), "yyyy-MM-dd")'),
    "DataGenerator must not default dates from the browser-local clock",
  );
  assert(
    /useState\(\(\) => todayEat\(\)\)/.test(generator),
    "DataGenerator must default its date fields with todayEat()",
  );
  assert(
    /createdAt: `\$\{todayEat\(\)\}/.test(generator),
    "the analysis snapshot must date itself in EAT",
  );
  const backtest = readFileSync(repoPath("src/pages/Backtest.tsx"), "utf8");
  assert(
    backtest.includes('from "@/lib/analyzer/time"') && /todayEat\(\)/.test(backtest),
    "Backtest must use the shared EAT today helper",
  );
  assert(
    !backtest.includes("Intl.DateTimeFormat"),
    "no second, independently-maintained EAT clock",
  );
});

test("eat clock: minutes-into-session never goes negative, it wraps", () => {
  // Windows: asian 01:00-10:59, london 11:00-15:59, ny 16:00-00:59 EAT.
  assertEqual(minutesIntoSession("2026-01-05 16:30:00", "ny"), 30, "ny open + 30m");
  assertEqual(minutesIntoSession("2026-01-06 00:30:00", "ny"), 510, "ny tail is 8.5h in");
  assertEqual(minutesIntoSession("2026-01-05 11:00:00", "london"), 0, "london open");
  assertEqual(minutesIntoSession("2026-01-05 15:59:00", "london"), 299, "london close");
  // Contradictions do not produce a negative: they wrap past midnight, which is
  // exactly why the range builder has to compare against the window, not zero.
  assertEqual(minutesIntoSession("2026-01-05 12:00:00", "ny"), 1200, "midday labelled ny");
  assertEqual(minutesIntoSession("2026-01-05 09:00:00", "london"), 1320, "morning labelled london");
  assertEqual(sessionOf("2026-01-05 12:00:00"), "london", "the clock is the authority here");
  assert(minutesIntoSession("2026-01-05 12:00:00", "ny") > 30, "outside any 30m opening window");
});

test("eat clock: a contradictory session label cannot widen an opening range", () => {
  const candles = [
    // A legitimate NY opening range on Jan 6 (16:00-16:29 EAT).
    mk(0, "2026-01-06 16:00:00", 100, 101, 99, 100.5, "ny"),
    mk(1, "2026-01-06 16:15:00", 100.5, 101.5, 99.5, 101, "ny"),
    // Corrupt row: labelled "ny" at midday on Jan 7, so it keys to Jan 6 and
    // would widen that range (high 120 / low 90) if the window test were wrong.
    mk(2, "2026-01-07 12:00:00", 110, 120, 90, 115, "ny"),
    // A genuine Jan 7 tail-hour row: 00:30 on Jan 8 opened on Jan 7, so with no
    // Jan 7 range it must resolve to nothing rather than to Jan 6's level.
    mk(3, "2026-01-08 00:30:00", 101, 101.5, 100.5, 101.2, "ny"),
  ];
  const ranges = openingRanges(candles);
  const j6 = ranges.get("2026-01-06|ny");
  assert(j6, "the Jan 6 range exists");
  assertEqual(j6.high, 101.5, "the contradictory row did not widen the range high");
  assertEqual(j6.low, 99, "the contradictory row did not widen the range low");
  assertEqual(j6.end, 1, "the +15m row is inside the window, the corrupt one is not");
  assertEqual(ranges.size, 1, "and it created no phantom range of its own");
  assertEqual(openingRangeFor(ranges, candles[3]), undefined, "no Jan 7 range exists");
  assertEqual(openingRangeFor(ranges, candles[1])?.day, "2026-01-06", "same-day lookup works");
});
