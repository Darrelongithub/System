/**
 * AUDIT-ARENA-2026-09-08 §10 flagged the ISO-week bucketing inside
 * `batchBacktestReports` as "a day-resolution approximation that can mislabel
 * weeks around year boundaries". Checked rather than assumed: it is the standard
 * Thursday-anchor ISO-8601 algorithm, and it agrees with an independent
 * reference implementation for every day from 2000-01-01 to 2040-12-31
 * (14,976 days, 0 mismatches). So there is nothing to fix — but the naming of
 * the weekly ZIP members is a user-visible contract, and a future
 * "simplification" of that arithmetic would silently rename packages. These
 * tests pin the boundaries that break naive week maths, plus the packaging
 * granularity rules around it.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { batchBacktestReports } from "../src/lib/backtest/engine.ts";

const report = (day, content = `report for ${day}`) => ({ day, content });

/** Hand-checked against ISO-8601 (independent reference implementation). */
const YEAR_BOUNDARIES = [
  ["2021-01-01", "2020-W53"], // Friday — still the last ISO week of 2020
  ["2021-01-04", "2021-W01"], // Monday — first ISO week of 2021
  ["2024-12-30", "2025-W01"], // Monday — already ISO week 1 of 2025
  ["2024-12-29", "2024-W52"], // Sunday closing 2024-W52
  ["2019-12-30", "2020-W01"], // Monday — ISO year rolls over before Jan 1
  ["2016-01-01", "2015-W53"], // Friday — 2015 had 53 ISO weeks
  ["2026-01-01", "2026-W01"], // Thursday — Jan 1 is its own week's anchor
  ["2027-01-01", "2026-W53"], // Friday — 2026 had 53 ISO weeks
  ["2025-12-29", "2026-W01"], // Monday — ISO year rolls over before Jan 1
  ["2033-01-01", "2032-W53"], // Friday — 2032 had 53 ISO weeks
];

test("batchBacktestReports: ISO week keys are exact at year boundaries", () => {
  for (const [day, key] of YEAR_BOUNDARIES) {
    const out = batchBacktestReports([report(day)], 14); // 8..31 days → weekly packages
    assertEqual(out.length, 1, `${day}: exactly one package`);
    assertEqual(out[0].name, `backtest_week_${key}.txt`, `${day} belongs to ${key}`);
    assert(out[0].content.includes(`report for ${day}`), `${day}: report content is preserved`);
  }
});

test("batchBacktestReports: a two-week run splits into two ISO-week packages, days ordered", () => {
  // 2021-01-01 (Fri, 2020-W53) … 2021-01-08 (Fri, 2021-W01): 8 days, 2 ISO weeks.
  const days = [
    "2021-01-01",
    "2021-01-02",
    "2021-01-03",
    "2021-01-04",
    "2021-01-05",
    "2021-01-06",
    "2021-01-07",
    "2021-01-08",
  ];
  const out = batchBacktestReports(
    days.map((d) => report(d)),
    days.length,
  );
  assertEqual(out.length, 2, "two weekly packages");
  assertEqual(out[0].name, "backtest_week_2020-W53.txt", "first package is the 2020 tail week");
  assertEqual(out[1].name, "backtest_week_2021-W01.txt", "second package is 2021-W01");
  // Within a package, days are concatenated in chronological order regardless of
  // the input order.
  const shuffled = batchBacktestReports(
    [...days].reverse().map((d) => report(d)),
    days.length,
  );
  assertEqual(
    shuffled[0].content,
    out[0].content,
    "package content does not depend on input order",
  );
  const firstWeek = out[0].content;
  assert(
    firstWeek.indexOf("report for 2021-01-01") < firstWeek.indexOf("report for 2021-01-02"),
    "days are ordered inside the package",
  );
});

test("batchBacktestReports: granularity rules — per-day ≤7, weekly ≤31, monthly above", () => {
  const days = ["2026-03-02", "2026-03-03", "2026-03-04"];

  const perDay = batchBacktestReports(
    days.map((d) => report(d)),
    7,
  );
  assertEqual(perDay.length, 3, "≤7 days → one file per day");
  assertEqual(perDay[0].name, "backtest_2026-03-02.txt", "per-day naming");

  const weekly = batchBacktestReports(
    days.map((d) => report(d)),
    8,
  );
  assertEqual(weekly.length, 1, "8..31 days → weekly packages");
  assertEqual(weekly[0].name, "backtest_week_2026-W10.txt", "2026-03-02..04 is 2026-W10");

  const monthly = batchBacktestReports(
    days.map((d) => report(d)),
    32,
  );
  assertEqual(monthly.length, 1, ">31 days → monthly packages");
  assertEqual(monthly[0].name, "backtest_month_2026-03.txt", "monthly naming");

  // A run that straddles a month boundary splits by calendar month.
  const straddle = ["2026-02-27", "2026-03-02"];
  const straddled = batchBacktestReports(
    straddle.map((d) => report(d)),
    32,
  );
  assertEqual(straddled.length, 2, "month straddle → two packages");
  assertEqual(straddled[0].name, "backtest_month_2026-02.txt", "first month");
  assertEqual(straddled[1].name, "backtest_month_2026-03.txt", "second month");
});

test("batchBacktestReports: per-strategy subtotals inside a package come from supplied triggers", () => {
  const out = batchBacktestReports(
    [
      // `strategy` must be the registry NAME (not the id): the subtotal block is
      // emitted per STRATEGIES[].name, so "dual-thrust" would score 0.
      { day: "2026-03-02", content: "d1", triggers: [{ strategy: "Dual Thrust Breakout" }] },
      { day: "2026-03-03", content: "d2", triggers: [{ strategy: "Dual Thrust Breakout" }] },
    ],
    14,
  );
  assertEqual(out.length, 1, "one weekly package");
  assert(
    out[0].content.includes("=== PACKAGE SUBTOTAL PER STRATEGY ==="),
    "subtotal block is present",
  );
  assert(
    out[0].content.includes("Dual Thrust Breakout | triggers in package: 2"),
    "triggers from both days are summed for the strategy",
  );
  assert(
    out[0].content.includes("MACD Signal Cross | triggers in package: 0"),
    "strategies with no triggers still report an explicit 0",
  );
});
