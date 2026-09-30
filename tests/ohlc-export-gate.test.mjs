/**
 * Export gate: what counts as a market closure, and how much missing data is
 * allowed to abort an export.
 *
 * A 66-hour run of the generator died on 131 bars out of ~50,000 (0.26%):
 *
 *   📋 Weekend gaps: FAIL (267 weekend closures + 5 holiday closures accepted,
 *      1 unexpected long gaps; 270 total; unexpected:
 *      2025-04-14 13:00:00 -> 2025-04-17 07:00:00)
 *   ❌ Validation FAILED: Weekend gaps
 *
 * Three separate defects were behind that one message, and all three are pinned
 * here:
 *
 *   1. The holiday allow-list was three hard-coded dates (weekend, 1 Jan,
 *      25/26 Dec). Good Friday, Easter Monday, Memorial Day, 4 Jul, Labor Day
 *      and Thanksgiving were all billed as missing data, so a legitimate
 *      ~25h post-holiday reopening gap failed the export.
 *   2. One unexpected gap was fatal regardless of scale — a single bad candle
 *      anywhere killed a 66-hour run.
 *   3. A gap counted as "expected" if it merely CONTAINED a closure day, so an
 *      outage swallowing a weekend was invisible however large.
 *
 * These tests are written against the desired behaviour. They are expected to
 * fail until the gate is rebuilt.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import * as gen from "../src/lib/ohlc-generator.ts";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import { loadBaselineCsv } from "./fixtures.mjs";

const BAR_MINUTES = 30;
const BARS_PER_SESSION_DAY = 48;

/** A two-row timeline bracketing [from, to] EAT wall-clock labels. */
const timeline = (from, to) => [{ datetimeEAT: from }, { datetimeEAT: to }];

/** Classify the single >24h gap between two EAT labels. */
const gapBetween = (from, to) => {
  const gaps = gen.analyzeTimelineGaps(timeline(from, to));
  assertEqual(gaps.length, 1, `expected exactly one long gap between ${from} and ${to}`);
  return gaps[0];
};

/** ISO `YYYY-MM-DD` day labels the gap credits as closures. */
const closureDays = (gap) => gap.closureDates.map((entry) => entry.slice(entry.indexOf(":") + 1));

// --- Defect 1: the holiday calendar -------------------------------------

test("export gate: Good Friday and Easter Monday are recognised closures", () => {
  // Easter 2025 falls on 20 April. Both surrounding closures are single
  // weekdays, so under the old three-date allow-list each one was a 48h gap
  // with no weekend in it — a guaranteed FAIL.
  const goodFriday = gapBetween("2025-04-17 12:00:00", "2025-04-19 12:00:00");
  assert(
    closureDays(goodFriday).includes("2025-04-18"),
    `Good Friday 2025-04-18 must be credited as a closure, got ${JSON.stringify(goodFriday.closureDates)}`,
  );
  assert(goodFriday.expectedClosure, "a Good Friday reopening gap must be expected");

  const easterMonday = gapBetween("2025-04-20 12:00:00", "2025-04-22 12:00:00");
  assert(
    closureDays(easterMonday).includes("2025-04-21"),
    `Easter Monday 2025-04-21 must be credited as a closure, got ${JSON.stringify(easterMonday.closureDates)}`,
  );
  assert(easterMonday.expectedClosure, "an Easter Monday reopening gap must be expected");
});

test("export gate: anonymous Gregorian computus places Easter 2023-2028", () => {
  // Verified independently against published Easter dates. This is the only
  // movable part of the calendar — everything else is a fixed rule.
  const expected = {
    2023: "2023-04-09",
    2024: "2024-03-31",
    2025: "2025-04-20",
    2026: "2026-04-05",
    2027: "2027-03-28",
    2028: "2028-04-16",
  };
  for (const [year, easterSunday] of Object.entries(expected)) {
    const easter = gen.easterSundayUtcDate(Number(year));
    const got = [
      easter.getUTCFullYear(),
      String(easter.getUTCMonth() + 1).padStart(2, "0"),
      String(easter.getUTCDate()).padStart(2, "0"),
    ].join("-");
    assertEqual(got, easterSunday, `Easter ${year}`);
    assertEqual(easter.getUTCDay(), 0, `Easter ${year} must fall on a Sunday`);
  }
});

test("export gate: US full-market holidays are recognised closures", () => {
  const cases = [
    // [label, day before, holiday, day after]
    ["Memorial Day 2025", "2025-05-25 12:00:00", "2025-05-26", "2025-05-27 12:00:00"],
    ["Independence Day 2025", "2025-07-03 12:00:00", "2025-07-04", "2025-07-05 12:00:00"],
    ["Labor Day 2025", "2025-08-31 12:00:00", "2025-09-01", "2025-09-02 12:00:00"],
    ["Thanksgiving 2025", "2025-11-26 12:00:00", "2025-11-27", "2025-11-28 12:00:00"],
    ["Christmas 2025", "2025-12-24 12:00:00", "2025-12-25", "2025-12-26 12:00:00"],
  ];
  for (const [label, before, holiday, after] of cases) {
    const gap = gapBetween(before, after);
    assert(
      closureDays(gap).includes(holiday),
      `${label}: ${holiday} must be credited, got ${JSON.stringify(gap.closureDates)}`,
    );
    assert(gap.expectedClosure, `${label}: reopening gap must be expected`);
  }
});

test("export gate: weekend holidays are observed on the adjacent weekday", () => {
  // 4 Jul 2026 is a Saturday; US markets observe it on Friday 3 July.
  const gap = gapBetween("2026-07-02 12:00:00", "2026-07-06 12:00:00");
  assert(
    closureDays(gap).includes("2026-07-03"),
    `the observed 2026-07-03 closure must be credited, got ${JSON.stringify(gap.closureDates)}`,
  );
  // 1 Jan 2023 is a Sunday, so New Year's Day is observed on Monday 2 January.
  const newYear = gapBetween("2022-12-31 12:00:00", "2023-01-03 12:00:00");
  assert(
    closureDays(newYear).includes("2023-01-02"),
    `the observed 2023-01-02 closure must be credited, got ${JSON.stringify(newYear.closureDates)}`,
  );
  // Christmas 2026 is a Friday and Boxing Day a Saturday, so both observe onto
  // 25 December — there is no extra Monday closure to invent here.
  const boxing = gapBetween("2026-12-24 12:00:00", "2026-12-28 12:00:00");
  assertEqual(
    closureDays(boxing)
      .filter((d) => gen.isMarketClosureDay(d))
      .sort()
      .join(","),
    "2026-12-25,2026-12-26,2026-12-27",
    "only the Friday + weekend closure may be credited",
  );
});

test("export gate: an ordinary weekday is never a closure", () => {
  const gap = gapBetween("2025-04-15 12:00:00", "2025-04-17 12:00:00");
  assertEqual(gap.expectedClosure, false, "a plain mid-week outage is not a closure");
  assertEqual(gap.closureDates.length, 0, "and must credit no closure day");
});

// --- Defect 3: closure days are credited, only the residue is billed -----

test("export gate: a weekend-spanning outage is billed for its residue", () => {
  // The locked baseline's own hole. Under the old rule this passed because it
  // contained two Saturdays; the residue is the number that matters.
  const gap = gapBetween("2026-04-30 23:30:00", "2026-05-11 03:00:00");
  const credited = closureDays(gap).filter((d) => gen.isMarketClosureDay(d)).length;
  assertEqual(credited, 4, "2026-05-02/03 and 2026-05-09/10 are the only closure days here");
  assertEqual(gap.missingBars, 486, "486 bars are absent across this hole");
  assertEqual(
    gap.creditedClosureBars,
    4 * BARS_PER_SESSION_DAY,
    "closure days credit 48 bars each",
  );
  assertEqual(gap.residualMissingBars, 294, "only the residue is billed, not the whole hole");
});

test("export gate: a pure weekend gap bills nothing", () => {
  // Every weekend in every export lands here — it must contribute zero.
  const gap = gapBetween("2025-04-12 00:30:00", "2025-04-14 00:30:00");
  assertEqual(gap.expectedClosure, true, "a weekly closure is expected");
  assertEqual(gap.residualMissingBars, 0, "a clean weekend must not be billed as missing data");
});

// --- Defect 2: a missing-data budget, not a binary gate -------------------

test("export gate: a small outage is tolerated but still reported", () => {
  // The user's actual failure: 131 bars, 0.26% of a ~37,760-row file.
  const gap = gapBetween("2025-04-14 13:00:00", "2025-04-17 07:00:00");
  assertEqual(gap.missingBars, 131, "the reported hole is 131 bars");
  const budget = gen.assessMissingDataBudget([gap], 37_760);
  assertEqual(budget.missingBars, 131, "the whole hole is billed — it spans no closure day");
  assertEqual(budget.budgetBars, 1888, "5% of 37,760");
  assert(budget.tolerated, `131/37760 must be tolerated, budget was ${budget.budgetBars}`);
  // The hole is still named, not swallowed.
  assert(
    budget.detail.some((line) => line.includes("2025-04-14 13:00:00 -> 2025-04-17 07:00:00")),
    `the hole must still be printed, got ${JSON.stringify(budget.detail)}`,
  );
});

test("export gate: an outage beyond the budget still fails the export", () => {
  // A year-long hole. Weekends are credited, so the billed residue is still far
  // past any plausible budget — this is the case the binary gate was right to
  // reject, and the budget must not have swallowed it.
  const gap = gapBetween("2025-04-14 13:00:00", "2026-04-14 07:00:00");
  const budget = gen.assessMissingDataBudget([gap], 37_760);
  assertEqual(budget.tolerated, false, "a year-long hole must not be tolerated");
  assertEqual(
    budget.missingBars,
    gap.residualMissingBars,
    "the billed total is the sum of residues",
  );
  assert(
    budget.missingBars > budget.budgetBars,
    `expected the year hole (${budget.missingBars}) to blow the ${budget.budgetBars} budget`,
  );
});

test("export gate: the budget is a floor of 12 bars plus 5% of the file", () => {
  const small = gen.assessMissingDataBudget([], 1_000);
  assertEqual(small.budgetBars, 50, "5% of 1000 rows");
  const tiny = gen.assessMissingDataBudget([], 10);
  assertEqual(tiny.budgetBars, 12, "the 12-bar floor covers short files");
});

// --- Calibration: the locked baseline must still validate ----------------

test("export gate: the locked baseline still validates under the 5% budget", () => {
  const { candles } = parseCsv(loadBaselineCsv());
  const rows = gen.selectExportedOhlcRows(candles.map((c) => ({ datetimeEAT: c.datetime })));
  const budget = gen.assessMissingDataBudget(gen.analyzeTimelineGaps(rows), rows.length);
  assert(
    budget.tolerated,
    `baseline must stay green: billed ${budget.missingBars} of ${rows.length} ` +
      `(${(budget.missingShare * 100).toFixed(2)}%), budget ${budget.budgetBars}`,
  );
  // 294 of these are the single real hole at 2026-04-30 -> 2026-05-11. The other
  // 152 are 38 weekends x 4 bars: the artifact's Mondays start at EAT 03:00
  // rather than 00:00, so each weekly open is genuinely short. That residue is
  // why the budget must be 5% and not the 3.02% the ten-day hole alone needs.
  assertEqual(budget.missingBars, 446, "294 hole + 38 weekends x 4 = 446");
  assertEqual(rows.length, 9_578, "the baseline exports 9,578 rows after closure trimming");
  assertEqual(budget.budgetBars, 479, "5% of 9,578");
});

test("export gate: every weekend in the baseline bills exactly 4 bars", () => {
  // The weekly closure is [Fri 22:00, Sun 21:00) UTC, but the shipped artifact's
  // Mondays begin at EAT 03:00 = Mon 00:00 UTC, not at the 00:00 EAT weekly
  // open. So each weekend gap spans 50.5h against a 48h two-day credit, leaving
  // 100 missing - 96 credited = 4 billed. Pinned because this, not the ten-day
  // hole, is what actually sets how tight the budget has to be.
  const { candles } = parseCsv(loadBaselineCsv());
  const rows = gen.selectExportedOhlcRows(candles.map((c) => ({ datetimeEAT: c.datetime })));
  const plainWeekends = gen.analyzeTimelineGaps(rows).filter((gap) => gap.closureDayCount === 2);
  assert(plainWeekends.length > 30, `expected many weekend gaps, got ${plainWeekends.length}`);
  for (const gap of plainWeekends) {
    assertEqual(
      gap.residualMissingBars,
      4,
      `weekend ${gap.previousTimestamp} -> ${gap.currentTimestamp} should bill 4 bars`,
    );
  }
});
