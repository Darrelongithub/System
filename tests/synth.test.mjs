import { createHash } from "node:crypto";
import { test, assert, assertEqual } from "./tiny.mjs";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import {
  calibrate,
  DEFAULT_PROFILE,
  generateSynthetic,
  SCENARIOS,
  SEQUENCE_SCENARIOS,
  SINGLE_CONDITION_SCENARIOS,
  toCsv,
} from "../src/lib/synth/index.ts";
import { sha256Hex } from "../src/lib/synth/hash.ts";

function assertInvariants(candles) {
  assert(candles.length > 0, "generator returns candles");
  let prior = "";
  for (const candle of candles) {
    assert(candle.datetime > prior, `timestamp strictly increases: ${candle.datetime}`);
    prior = candle.datetime;
    for (const value of [candle.open, candle.high, candle.low, candle.close]) {
      assert(Number.isFinite(value), `OHLC is finite at ${candle.datetime}`);
      assert(value > 0, `price is positive at ${candle.datetime}`);
    }
    assert(candle.low <= candle.open, `low <= open at ${candle.datetime}`);
    assert(candle.open <= candle.high, `open <= high at ${candle.datetime}`);
    assert(candle.low <= candle.close, `low <= close at ${candle.datetime}`);
    assert(candle.close <= candle.high, `close <= high at ${candle.datetime}`);
  }
}

function wilderAtrPercent(candles) {
  const tr = [];
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const previousClose = i ? candles[i - 1].close : undefined;
    tr.push(
      previousClose === undefined
        ? candle.high - candle.low
        : Math.max(
            candle.high - candle.low,
            Math.abs(candle.high - previousClose),
            Math.abs(candle.low - previousClose),
          ),
    );
  }
  if (candles.length < 14) return [];
  let value = tr.slice(0, 14).reduce((a, b) => a + b, 0) / 14;
  const values = [];
  for (let i = 13; i < candles.length; i++) {
    if (i > 13) value = (value * 13 + tr[i]) / 14;
    values.push(value / candles[i].close);
  }
  return values;
}

function quantile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.min(sorted.length - 1, lower + 1);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function closeLogReturn(candles) {
  return Math.log(candles.at(-1).close / candles[0].open);
}

function simpleBars(count = 32) {
  const out = [];
  let close = 4000;
  const start = Date.UTC(2026, 0, 5, 0, 0);
  for (let i = 0; i < count; i++) {
    const epoch = start + i * 30 * 60 * 1000;
    const date = new Date(epoch);
    const datetime = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}:00`;
    const open = close;
    const direction = i % 2 === 0 ? 1 : -1;
    close = open + direction * ((i % 5) + 1);
    out.push({
      datetime,
      open,
      high: Math.max(open, close) + 1,
      low: Math.min(open, close) - 1,
      close,
    });
  }
  return out;
}

function scheduleBars() {
  const scheduleA = Array.from({ length: 46 }, (_, index) => 60 + index * 30);
  const scheduleB = [0, 30, ...Array.from({ length: 44 }, (_, index) => 120 + index * 30)];
  const fullDay = Array.from({ length: 48 }, (_, index) => index * 30);
  const schedules = [
    { weeks: 50, slots: scheduleA },
    { weeks: 45, slots: scheduleB },
    { weeks: 12, slots: fullDay },
  ];
  const out = [];
  let index = 0;
  let weekNumber = 0;
  let previousClose = 4000;
  for (const schedule of schedules) {
    for (let week = 0; week < schedule.weeks; week++, weekNumber++) {
      const monday = new Date(Date.UTC(2020, 0, 6 + weekNumber * 7));
      for (let weekday = 0; weekday < 5; weekday++) {
        const date = new Date(monday.getTime() + weekday * 24 * 60 * 60 * 1000);
        const dateText = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
        for (const minuteOfDay of schedule.slots) {
          const close =
            4000 +
            Math.sin(index * 0.041) * 18 +
            Math.cos(index * 0.007) * 11 +
            Math.sin(index * 0.19) * 2;
          const open = previousClose;
          out.push({
            datetime: `${dateText} ${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}:00`,
            open,
            high: Math.max(open, close) + 0.6,
            low: Math.min(open, close) - 0.6,
            close,
          });
          previousClose = close;
          index++;
        }
      }
    }
  }
  return out;
}

test("synth calibration: input is validated without sorting, deduplication, or OHLC repair", () => {
  const bars = simpleBars(24);
  const profile = calibrate(bars);
  assertEqual(profile.sample.bars, bars.length, "all candles are counted");
  assertEqual(profile.sample.duplicateTimestamps, 0, "no duplicate timestamps in input");
  assertEqual(profile.sample.nonIncreasingTimestamps, 0, "chronology is strict");
  assertEqual(profile.sample.ohlcInvariantViolations, 0, "OHLC invariants are recorded");
  assertEqual(
    profile.sample.atrMethod,
    "Wilder ATR(14), first value = SMA of first 14 true ranges",
    "Wilder is explicit",
  );
  assertEqual(
    profile.source.canonicalCandlesSha256.length,
    64,
    "canonical source SHA-256 is present",
  );
  const duplicate = [...bars];
  duplicate[1] = { ...duplicate[0] };
  let duplicateRejected = false;
  try {
    calibrate(duplicate);
  } catch (error) {
    duplicateRejected = String(error).includes("duplicate");
  }
  assert(duplicateRejected, "duplicate timestamps fail visibly");
  const broken = [...bars];
  broken[3] = { ...broken[3], low: broken[3].high + 1 };
  let geometryRejected = false;
  try {
    calibrate(broken);
  } catch (error) {
    geometryRejected = String(error).includes("OHLC geometry");
  }
  assert(geometryRejected, "impossible OHLC is not repaired silently");
});

test("synth calendar calibration: recurring breaks stay explicit and weekly templates remain coherent", () => {
  const profile = calibrate(scheduleBars());
  const calendar = profile.sample.calendar;
  assertEqual(
    calendar.standardWeekBarCount,
    230,
    "the most frequent exact Mon-Fri template is selected",
  );
  assertEqual(
    calendar.weeklyScheduleVariants[0].occurrenceWeeks,
    50,
    "primary template frequency is reported",
  );
  assertEqual(
    calendar.weeklyScheduleVariants[1].occurrenceWeeks,
    45,
    "alternate seasonal template is reported",
  );
  assert(
    calendar.barSlotsByWeekday[1].every((slot, index) => slot.minuteOfDay === 60 + index * 30),
    "primary Monday slots come from one observed whole-week template",
  );
  assertEqual(
    calendar.barSlotsByWeekday[6].length,
    0,
    "primary template does not invent a Saturday tail",
  );
  assert(
    calendar.scheduledSessionBreaks.some((gap) => gap.gapMinutes === 90 && gap.occurrences >= 40),
    "repeated 90-minute gaps are separately classified as scheduled session breaks",
  );
  assertEqual(
    profile.sample.gaps.unclassifiedClosureCount,
    0,
    "regular breaks are not counted as outages",
  );
  assert(
    profile.resampling.completeWeeks.length >= 49,
    "only complete weeks matching the selected slot template become donors",
  );
  const generated = generateSynthetic(
    { scenario: "normal_chop", pathLengthTradingDays: 2 },
    77,
    profile,
  );
  assertEqual(
    generated.candles.length,
    92,
    "generated calendar uses the selected 46-bar weekday template",
  );
  assert(
    generated.labels.some((label) => label.gapFlag),
    "the recurring session break remains labeled",
  );
});

test("synth SHA-256: pure core implementation matches the standard known vector", () => {
  assertEqual(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    "SHA-256 known vector",
  );
});

test("synth calibration: bundled profile is self-contained, hashable, and reports percentile dial bands", () => {
  assertEqual(DEFAULT_PROFILE.instrument, "XAUUSD", "profile instrument");
  assertEqual(DEFAULT_PROFILE.timeframe, "30m", "profile timeframe");
  assertEqual(
    DEFAULT_PROFILE.sample.atrMethod,
    "Wilder ATR(14), first value = SMA of first 14 true ranges",
    "engine fallback ATR",
  );
  assert(
    DEFAULT_PROFILE.resampling.standardBars.length > 9000,
    "normalized source bar library is embedded",
  );
  assert(
    DEFAULT_PROFILE.resampling.completeWeeks.length >= 20,
    "empirical block library is embedded",
  );
  assert(
    DEFAULT_PROFILE.sample.atrPercent.quantiles.p10 <
      DEFAULT_PROFILE.sample.atrPercent.quantiles.p50 &&
      DEFAULT_PROFILE.sample.atrPercent.quantiles.p50 <
        DEFAULT_PROFILE.sample.atrPercent.quantiles.p90,
    "volatility dial cutpoints are ordered",
  );
  assertEqual(
    DEFAULT_PROFILE.source.files[0].sha256,
    "cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3",
    "full-archive raw file SHA is pinned",
  );
});

test("synth generator: every registered single-condition preset preserves OHLC and calendar invariants", () => {
  for (const scenario of SINGLE_CONDITION_SCENARIOS) {
    assert(SCENARIOS[scenario].kind === "single", `${scenario} remains a single-condition preset`);
    const result = generateSynthetic({ scenario, pathLengthTradingDays: 2 }, 4107);
    assertInvariants(result.candles);
    assertEqual(result.candles.length, result.labels.length, "one ground-truth label per candle");
    assert(
      result.labels.every((label) => label.regimeId === scenario),
      `${scenario} label id is exact`,
    );
    assert(
      result.labels.every((label) => label.spreadMultAssumption),
      "spread multiplier assumption is explicit",
    );
  }
});

test("synth generator: volatility low/normal/high is monotone and price level is independent", () => {
  const common = {
    pathLengthTradingDays: 5,
    drift: "flat",
    trendiness: "random",
    news: "light",
    gaps: "normal",
  };
  const low = generateSynthetic({ ...common, volatility: "low" }, 20261001);
  const normal = generateSynthetic({ ...common, volatility: "normal" }, 20261001);
  const high = generateSynthetic({ ...common, volatility: "high" }, 20261001);
  const lowMedian = quantile(wilderAtrPercent(low.candles), 0.5);
  const normalMedian = quantile(wilderAtrPercent(normal.candles), 0.5);
  const highMedian = quantile(wilderAtrPercent(high.candles), 0.5);
  assert(lowMedian < normalMedian, `low < normal ATR% (${lowMedian} < ${normalMedian})`);
  assert(normalMedian < highMedian, `normal < high ATR% (${normalMedian} < ${highMedian})`);
  const repriced = generateSynthetic(
    { ...common, volatility: "normal", priceLevel: 5000 },
    20261001,
  );
  assert(
    Math.abs(repriced.candles[0].open - 5000) < 200,
    "priceLevel changes dollar scale, not scenario selection",
  );
  assertEqual(repriced.meta.priceLevel, 5000, "price level is recorded independently");
});

test("synth generator: down/flat/up drift is ordered with all other dials and seed held fixed", () => {
  const common = {
    scenario: "normal_chop",
    pathLengthTradingDays: 10,
    volatility: "low",
    trendiness: "random",
    news: "light",
    gaps: "normal",
    wobblePercent: 0,
  };
  const down = generateSynthetic({ ...common, drift: "down" }, 8519);
  const flat = generateSynthetic({ ...common, drift: "flat" }, 8519);
  const up = generateSynthetic({ ...common, drift: "up" }, 8519);
  assert(
    closeLogReturn(down.candles) < closeLogReturn(flat.candles),
    "down target reduces cumulative close return",
  );
  assert(
    closeLogReturn(flat.candles) < closeLogReturn(up.candles),
    "up target increases cumulative close return",
  );
  assertEqual(
    down.labels[0].activeDialValues.driftLogReturn60d,
    DEFAULT_PROFILE.sample.rolling60DayDriftLogReturn.quantiles.p10,
    "down uses observed p10",
  );
  assertEqual(
    flat.labels[0].activeDialValues.driftLogReturn60d,
    DEFAULT_PROFILE.sample.rolling60DayDriftLogReturn.quantiles.p50,
    "flat uses observed p50",
  );
  assertEqual(
    up.labels[0].activeDialValues.driftLogReturn60d,
    DEFAULT_PROFILE.sample.rolling60DayDriftLogReturn.quantiles.p90,
    "up uses observed p90",
  );
});

test("synth generator: trendiness targets empirical p10/p50/p90 and numeric out-of-range dials are flagged", () => {
  const targets = ["mean-reverting", "random", "trending"];
  const results = targets.map((trendiness) =>
    generateSynthetic(
      { scenario: "normal_chop", trendiness, pathLengthTradingDays: 2, news: "light" },
      77,
    ),
  );
  const targetVr16 = results.map(
    (result) => result.labels[0].activeDialValues.targetVarianceRatio16,
  );
  assert(
    targetVr16[0] < targetVr16[1] && targetVr16[1] < targetVr16[2],
    "trend targets follow observed p10/p50/p90",
  );
  const extrapolated = generateSynthetic(
    {
      scenario: "normal_chop",
      volatility: DEFAULT_PROFILE.sample.atrPercent.quantiles.max * 1.5,
      pathLengthTradingDays: 1,
    },
    8,
  );
  assert(
    extrapolated.labels.every((label) => label.extrapolationFlag),
    "outside-observed volatility is labelled on every bar",
  );
  assert(extrapolated.meta.extrapolationBars > 0, "extrapolation is summarized in meta");
});

test("synth generator: expanding and contracting volatility shapes move in opposite directions", () => {
  const common = {
    scenario: "normal_chop",
    pathLengthTradingDays: 10,
    volatility: "normal",
    news: "light",
  };
  const expanding = generateSynthetic({ ...common, volatilityShape: "expanding" }, 119);
  const contracting = generateSynthetic({ ...common, volatilityShape: "contracting" }, 119);
  const last = expanding.labels.length - 1;
  assert(
    expanding.labels[0].activeDialValues.volatilityAtrPercent <
      expanding.labels[last].activeDialValues.volatilityAtrPercent,
    "expanding target rises across the path",
  );
  assert(
    contracting.labels[0].activeDialValues.volatilityAtrPercent >
      contracting.labels[last].activeDialValues.volatilityAtrPercent,
    "contracting target falls across the path",
  );
});

test("synth generator: gap, news, and shock-follow-through dials are independently labelled", () => {
  const heavyGaps = generateSynthetic({ scenario: "gap_shocks", pathLengthTradingDays: 5 }, 884);
  assert(
    heavyGaps.labels.some((label) => label.activeDialValues.gaps === "heavy"),
    "heavy gap dial is active",
  );
  assert(
    heavyGaps.labels.some((label) => label.gapFlag),
    "calendar or injected gap events are labelled",
  );
  const news = generateSynthetic({ scenario: "news_storm", pathLengthTradingDays: 10 }, 662);
  assert(
    news.labels.every((label) => label.activeDialValues.news === "heavy"),
    "heavy news dial is active",
  );
  assert(
    news.labels.some(
      (label) => label.eventFlag === "scheduled-news" || label.eventFlag === "unscheduled-shock",
    ),
    "news events come from calibrated samples",
  );
  for (const shockFollowThrough of ["continue", "revert", "mixed"]) {
    const result = generateSynthetic(
      { scenario: "crash", shockFollowThrough, pathLengthTradingDays: 3 },
      553,
    );
    assert(
      result.labels.every(
        (label) => label.activeDialValues.shockFollowThrough === shockFollowThrough,
      ),
      `${shockFollowThrough} is recorded`,
    );
  }
  assertEqual(news.labels[0].spreadMult, 1, "spread multiplier defaults to one");
  assert(news.labels[0].spreadMultAssumption, "no spread series is implied");
});

test("synth generator: all sequence scenarios plant their named windows with blended boundaries", () => {
  for (const scenario of SEQUENCE_SCENARIOS) {
    const result = generateSynthetic({ scenario, pathLengthTradingDays: 60 }, 9001);
    assertInvariants(result.candles);
    const ids = new Set(result.labels.map((label) => label.regimeId));
    assertEqual(ids.size, 3, `${scenario} has three named ground-truth segments`);
    assert(
      result.meta.transitionBars.every((bars) => bars >= 48 && bars <= 200),
      "transition blend sizes are within the registered range",
    );
    assert(
      result.labels.every((label) => label.regimeId.includes(scenario)),
      "sequence regime ids identify their preset",
    );
  }
});

test("synth generator: explicit planted windows keep exact start/end labels", () => {
  const result = generateSynthetic(
    {
      scenario: "normal_chop",
      pathLengthTradingDays: 6,
      plantedRegimes: [
        {
          id: "known-window",
          startTradingDay: 2,
          endTradingDay: 4,
          dials: { volatility: "high", drift: "up" },
        },
      ],
    },
    931,
  );
  const byDate = new Map();
  for (const label of result.labels) {
    const date = label.datetime.slice(0, 10);
    const entry = byDate.get(date) ?? new Set();
    entry.add(label.regimeId);
    byDate.set(date, entry);
  }
  const activeDates = [...byDate.keys()].filter((date) =>
    [...byDate.get(date)].includes("known-window"),
  );
  assert(activeDates.length > 0, "known planted window is represented");
  assert(
    result.labels.some(
      (label) =>
        label.regimeId === "known-window" && label.activeDialValues.volatilityAtrPercent > 0,
    ),
    "active dials are saved per bar",
  );
});

test("synth generator: same config and seed produce byte-identical JSON and SHA-256", () => {
  const config = { scenario: "whipsaw", pathLengthTradingDays: 4, startDate: "2026-01-05" };
  const first = generateSynthetic(config, 742);
  const second = generateSynthetic(config, 742);
  const firstBytes = JSON.stringify(first);
  const secondBytes = JSON.stringify(second);
  assertEqual(firstBytes, secondBytes, "result serialization is byte-identical");
  assertEqual(
    createHash("sha256").update(firstBytes).digest("hex"),
    createHash("sha256").update(secondBytes).digest("hex"),
    "result SHA-256 is deterministic",
  );
});

test("synth CSV round-trip: exact EAT wall-clock schema parses with Wilder ATR fallback", () => {
  const result = generateSynthetic({ scenario: "normal_chop", pathLengthTradingDays: 2 }, 717);
  const csv = toCsv(result.candles);
  assert(
    csv.includes("datetime,open,high,low,close,is_reliable"),
    "engine required header is emitted",
  );
  assert(!csv.split("\n")[1].includes("atr_30m"), "override column is intentionally absent");
  assert(csv.includes("Wilder ATR(14)"), "metadata names the chosen ATR method");
  const parsed = parseCsv(csv);
  assertEqual(parsed.metadataError, undefined, "CSV metadata parses");
  assertEqual(parsed.candles.length, result.candles.length, "all rows round-trip");
  assertEqual(parsed.candles[0].datetime, result.candles[0].datetime, "EAT datetime is unchanged");
  assertEqual(
    parsed.candles[0].open,
    result.candles[0].open,
    "open round-trips exactly as a Number",
  );
  assertEqual(
    parsed.candles.at(-1).close,
    result.candles.at(-1).close,
    "last close round-trips exactly",
  );
  assertEqual(
    parsed.candles[0].atr30m,
    undefined,
    "engine recomputes Wilder ATR instead of reading a simple mean",
  );
});

test("synth CSV serializer rejects duplicate timestamps and invalid OHLC instead of repairing", () => {
  const duplicate = simpleBars(16);
  duplicate[1] = { ...duplicate[0] };
  let duplicateRejected = false;
  try {
    toCsv(duplicate);
  } catch (error) {
    duplicateRejected = String(error).includes("strictly increasing");
  }
  assert(duplicateRejected, "duplicate rows fail visibly");
  const invalid = simpleBars(16);
  invalid[3].close = invalid[3].high + 10;
  let invalidRejected = false;
  try {
    toCsv(invalid);
  } catch (error) {
    invalidRejected = String(error).includes("OHLC geometry");
  }
  assert(invalidRejected, "invalid geometry fails visibly");
});
