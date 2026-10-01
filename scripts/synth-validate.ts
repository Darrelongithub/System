import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import type { Candle as EngineCandle } from "../src/lib/analyzer/types.ts";
import { DEFAULT_PROFILE, generateSynthetic } from "../src/lib/synth/index.ts";
import {
  autocorrelation,
  mean,
  parseEatDatetime,
  quantile,
  varianceRatio,
} from "../src/lib/synth/math.ts";
import { SeededRandom } from "../src/lib/synth/random.ts";
import type { Candle, StandardizedBar } from "../src/lib/synth/types.ts";

const SOURCE_PATH = process.argv[2];
if (!SOURCE_PATH) {
  throw new Error("Pass a source CSV whose raw SHA-256 matches the calibrated profile.");
}
const PROFILE_PATH = "src/lib/synth/profile.json";
const OUTPUT_PATH = "src/lib/synth/validation-report.json";
const BOOTSTRAP_REPLICATES = 200;
const NORMAL_SEED = 20261001;
const BOOTSTRAP_SEED = 0x0d1;
const BLOCK_COUNT = 24; // 120 Mon-Fri trading days, in 24 empirical calendar-week blocks.
const WINDOW_BARS = 240;
const WINDOW_STEP = 48;

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function toSyntheticCandle(candle: EngineCandle): Candle {
  if (
    candle.open === undefined ||
    candle.high === undefined ||
    candle.low === undefined ||
    candle.close === undefined ||
    candle.invalid
  ) {
    throw new Error(
      `invalid source OHLC at ${candle.datetime}: ${candle.invalid ?? "missing OHLC"}`,
    );
  }
  return {
    datetime: candle.datetime,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

interface Observation {
  candle: Candle;
  timestamp: number;
  atr: number | undefined;
  priorAtr: number | undefined;
  returnAtr: number | undefined;
  trueRange: number;
}

interface MetricSet {
  returnKurtosisExcess: number;
  volatilityClusteringLag1: number;
  meanRangeAtr: number;
  meanWickShare: number;
  weekendGapFrequencyPerWeek: number;
  meanWeekendGapSizeAtr: number;
  varianceRatio8: number;
  varianceRatio16: number;
  hourlyVolatility: number[];
}

function moments(values: readonly number[]) {
  const center = mean(values);
  let second = 0;
  let fourth = 0;
  for (const value of values) {
    const d2 = (value - center) ** 2;
    second += d2;
    fourth += d2 * d2;
  }
  second /= Math.max(1, values.length);
  fourth /= Math.max(1, values.length);
  return second > Number.EPSILON ? fourth / (second * second) - 3 : 0;
}

function computeMetrics(candles: readonly Candle[]): MetricSet {
  const observations: Observation[] = [];
  const trueRanges: number[] = [];
  let previousClose: number | undefined;
  for (const candle of candles) {
    const trueRange =
      previousClose === undefined
        ? candle.high - candle.low
        : Math.max(
            candle.high - candle.low,
            Math.abs(candle.high - previousClose),
            Math.abs(candle.low - previousClose),
          );
    trueRanges.push(trueRange);
    previousClose = candle.close;
  }
  const atr: Array<number | undefined> = new Array(candles.length).fill(undefined);
  if (candles.length >= 14) {
    let smoothed = mean(trueRanges.slice(0, 14));
    atr[13] = smoothed;
    for (let index = 14; index < candles.length; index++) {
      smoothed = (smoothed * 13 + trueRanges[index]!) / 14;
      atr[index] = smoothed;
    }
  }

  const returns: number[] = [];
  const absoluteReturns: number[] = [];
  const rangeAtr: number[] = [];
  const wickShares: number[] = [];
  const hourly: number[][] = Array.from({ length: 24 }, () => []);
  const weekdays = new Set<string>();
  const weekendGaps: number[] = [];
  let weekendCount = 0;
  for (let index = 0; index < candles.length; index++) {
    const candle = candles[index]!;
    const timestamp = parseEatDatetime(candle.datetime);
    const previous = index > 0 ? candles[index - 1] : undefined;
    const previousAtr = index > 0 ? atr[index - 1] : undefined;
    const priorAtr = previousAtr ?? atr[index];
    let returnAtr: number | undefined;
    if (previous && priorAtr !== undefined) {
      returnAtr = Math.log(candle.close / previous.close) / (priorAtr / previous.close);
      returns.push(returnAtr);
      absoluteReturns.push(Math.abs(returnAtr));
      if (timestamp !== undefined) {
        const eat = new Date(timestamp + 3 * 60 * 60 * 1000);
        hourly[eat.getUTCHours()]!.push(Math.abs(returnAtr));
      }
    }
    if (timestamp !== undefined) {
      const eat = new Date(timestamp + 3 * 60 * 60 * 1000);
      const weekday = eat.getUTCDay();
      if (weekday >= 1 && weekday <= 5) weekdays.add(candle.datetime.slice(0, 10));
      if (atr[index] !== undefined) {
        const totalRange = candle.high - candle.low;
        const upper = candle.high - Math.max(candle.open, candle.close);
        const lower = Math.min(candle.open, candle.close) - candle.low;
        rangeAtr.push(totalRange / atr[index]!);
        wickShares.push(totalRange > 0 ? (upper + lower) / totalRange : 0);
      }
      if (previous && timestamp !== undefined && index > 0) {
        const priorTime = parseEatDatetime(previous.datetime);
        const priorWeekday =
          priorTime === undefined ? -1 : new Date(priorTime + 3 * 60 * 60 * 1000).getUTCDay();
        if (
          priorTime !== undefined &&
          timestamp - priorTime > 24 * 60 * 60 * 1000 &&
          timestamp - priorTime <= 4 * 24 * 60 * 60 * 1000 &&
          weekday === 1 &&
          (priorWeekday === 5 || priorWeekday === 6)
        ) {
          weekendCount++;
          if (priorAtr !== undefined) {
            weekendGaps.push(
              Math.abs(Math.log(candle.open / previous.close) / (priorAtr / previous.close)),
            );
          }
        }
      }
    }
    observations.push({
      candle,
      timestamp: timestamp ?? 0,
      atr: atr[index],
      priorAtr,
      returnAtr,
      trueRange: trueRanges[index]!,
    });
  }

  const trendVr8: number[] = [];
  const trendVr16: number[] = [];
  const standardized = observations
    .filter((row) => row.returnAtr !== undefined)
    .map((row) => row.returnAtr!);
  for (let start = 0; start + WINDOW_BARS <= standardized.length; start += WINDOW_STEP) {
    const window = standardized.slice(start, start + WINDOW_BARS);
    trendVr8.push(varianceRatio(window, 8));
    trendVr16.push(varianceRatio(window, 16));
  }
  return {
    returnKurtosisExcess: moments(returns),
    volatilityClusteringLag1: autocorrelation(absoluteReturns, 1),
    meanRangeAtr: mean(rangeAtr),
    meanWickShare: mean(wickShares),
    weekendGapFrequencyPerWeek: weekdays.size > 0 ? weekendCount / (weekdays.size / 5) : 0,
    meanWeekendGapSizeAtr: mean(weekendGaps),
    varianceRatio8: mean(trendVr8),
    varianceRatio16: mean(trendVr16),
    hourlyVolatility: hourly.map((values) => mean(values)),
  };
}

function computeBootstrapMetrics(blocks: readonly StandardizedBar[][], replicates: number) {
  const random = new SeededRandom(BOOTSTRAP_SEED);
  const series: Record<string, number[]> = {
    returnKurtosisExcess: [],
    volatilityClusteringLag1: [],
    meanRangeAtr: [],
    meanWickShare: [],
    weekendGapFrequencyPerWeek: [],
    meanWeekendGapSizeAtr: [],
    varianceRatio8: [],
    varianceRatio16: [],
  };
  const hourly = Array.from({ length: 24 }, () => [] as number[]);
  for (let replicate = 0; replicate < replicates; replicate++) {
    const selectedBlocks = Array.from({ length: BLOCK_COUNT }, () => random.pick(blocks));
    const bars = selectedBlocks.flat();
    const returns = bars.map((bar) => bar.closeReturnAtr);
    const absReturns = returns.map(Math.abs);
    const weekendGaps = bars
      .filter((bar) => bar.calendarGapKind === "weekend")
      .map((bar) => Math.abs(bar.openGapAtr));
    series.returnKurtosisExcess!.push(moments(returns));
    series.volatilityClusteringLag1!.push(autocorrelation(absReturns, 1));
    series.meanRangeAtr!.push(mean(bars.map((bar) => bar.rangeAtr)));
    series.meanWickShare!.push(mean(bars.map((bar) => bar.upperWickShare + bar.lowerWickShare)));
    series.weekendGapFrequencyPerWeek!.push(weekendGaps.length / BLOCK_COUNT);
    series.meanWeekendGapSizeAtr!.push(mean(weekendGaps));
    series.varianceRatio8!.push(
      mean(
        selectedBlocks.map((block) => {
          const returnsInBlock = block.map((bar) => bar.closeReturnAtr);
          return varianceRatio(returnsInBlock, 8);
        }),
      ),
    );
    series.varianceRatio16!.push(
      mean(
        selectedBlocks.map((block) => {
          const returnsInBlock = block.map((bar) => bar.closeReturnAtr);
          return varianceRatio(returnsInBlock, 16);
        }),
      ),
    );
    for (let hour = 0; hour < 24; hour++) {
      const hourlyReturns = bars
        .filter((bar) => Math.floor(bar.minuteOfDay / 60) === hour)
        .map((bar) => Math.abs(bar.closeReturnAtr));
      hourly[hour]!.push(mean(hourlyReturns));
    }
  }
  return { series, hourly };
}

function confidenceInterval(values: readonly number[]): [number, number] {
  return [quantile(values, 0.025), quantile(values, 0.975)];
}

function comparison(name: string, real: number, synthetic: number, ci: [number, number]) {
  const twentyPercent = Math.abs(real) * 0.2;
  const allowed: [number, number] = [
    Math.min(ci[0], real - twentyPercent),
    Math.max(ci[1], real + twentyPercent),
  ];
  return {
    statistic: name,
    real,
    synthetic,
    bootstrap95Ci: ci,
    plusMinus20Percent: [real - twentyPercent, real + twentyPercent],
    allowedInterval: allowed,
    withinAvailableSampleTolerance: synthetic >= allowed[0] && synthetic <= allowed[1],
    relativeDifferencePercent:
      Math.abs(real) > Number.EPSILON ? ((synthetic - real) / Math.abs(real)) * 100 : null,
  };
}

const sourceText = readFileSync(SOURCE_PATH, "utf8");
const parsed = parseCsv(sourceText);
if (parsed.metadataError) throw new Error(parsed.metadataError);
const realCandles = parsed.candles.map(toSyntheticCandle);
const synthetic = generateSynthetic(
  { scenario: "normal_chop", pathLengthTradingDays: 120 },
  NORMAL_SEED,
);
const realMetrics = computeMetrics(realCandles);
const syntheticMetrics = computeMetrics(synthetic.candles);
const donorWeeks = DEFAULT_PROFILE.resampling.completeWeeks.map((block) =>
  DEFAULT_PROFILE.resampling.standardBars.slice(block.startBar, block.endBarExclusive),
);
const bootstrap = computeBootstrapMetrics(donorWeeks, BOOTSTRAP_REPLICATES);

const scalarComparisons = [
  comparison(
    "excess return kurtosis",
    realMetrics.returnKurtosisExcess,
    syntheticMetrics.returnKurtosisExcess,
    confidenceInterval(bootstrap.series.returnKurtosisExcess!),
  ),
  comparison(
    "absolute-return autocorrelation lag 1",
    realMetrics.volatilityClusteringLag1,
    syntheticMetrics.volatilityClusteringLag1,
    confidenceInterval(bootstrap.series.volatilityClusteringLag1!),
  ),
  comparison(
    "mean range / Wilder ATR",
    realMetrics.meanRangeAtr,
    syntheticMetrics.meanRangeAtr,
    confidenceInterval(bootstrap.series.meanRangeAtr!),
  ),
  comparison(
    "combined wick share",
    realMetrics.meanWickShare,
    syntheticMetrics.meanWickShare,
    confidenceInterval(bootstrap.series.meanWickShare!),
  ),
  comparison(
    "weekend gaps per five trading days",
    realMetrics.weekendGapFrequencyPerWeek,
    syntheticMetrics.weekendGapFrequencyPerWeek,
    confidenceInterval(bootstrap.series.weekendGapFrequencyPerWeek!),
  ),
  comparison(
    "mean absolute weekend open gap / prior ATR",
    realMetrics.meanWeekendGapSizeAtr,
    syntheticMetrics.meanWeekendGapSizeAtr,
    confidenceInterval(bootstrap.series.meanWeekendGapSizeAtr!),
  ),
  comparison(
    "variance ratio q=8 (mean 240-bar windows)",
    realMetrics.varianceRatio8,
    syntheticMetrics.varianceRatio8,
    confidenceInterval(bootstrap.series.varianceRatio8!),
  ),
  comparison(
    "variance ratio q=16 (mean 240-bar windows)",
    realMetrics.varianceRatio16,
    syntheticMetrics.varianceRatio16,
    confidenceInterval(bootstrap.series.varianceRatio16!),
  ),
];
const hourlyComparisons = realMetrics.hourlyVolatility.map((realValue, hour) =>
  comparison(
    `EAT ${String(hour).padStart(2, "0")}:00 mean |return| / ATR`,
    realValue,
    syntheticMetrics.hourlyVolatility[hour]!,
    confidenceInterval(bootstrap.hourly[hour]!),
  ),
);
const comparisonsAll = [...scalarComparisons, ...hourlyComparisons];
const metricsPass = comparisonsAll.every((row) => row.withinAvailableSampleTolerance);
const sourceRawFileSha256 = sha256(sourceText);
const sourceMatchesProfile = DEFAULT_PROFILE.source.files.some(
  (file) => file.sha256 === sourceRawFileSha256,
);
const requiredCoveragePresent =
  DEFAULT_PROFILE.source.span.start.slice(0, 10) <= "2020-01-24" &&
  DEFAULT_PROFILE.source.span.end.slice(0, 10) >= "2026-10-01";
const gatePass = requiredCoveragePresent && sourceMatchesProfile && metricsPass;
const fullOutputHash = sha256(JSON.stringify(synthetic));
const profileRaw = readFileSync(PROFILE_PATH, "utf8");
const profileFileHash = sha256(profileRaw);
const report = {
  generatedAt: "2026-10-01",
  scope:
    "D1 normal-cell market-statistics check only; no strategy engine calls or strategy results.",
  input: {
    sourcePath: SOURCE_PATH,
    rawFileSha256: sourceRawFileSha256,
    profilePath: PROFILE_PATH,
    profileFileSha256: profileFileHash,
    profileCanonicalCandlesSha256: DEFAULT_PROFILE.source.canonicalCandlesSha256,
    profileSourceFiles: DEFAULT_PROFILE.source.files,
    sourceMatchesCalibrationProfile: sourceMatchesProfile,
    span: DEFAULT_PROFILE.source.span,
    bars: DEFAULT_PROFILE.sample.bars,
    requestedArchiveCoveragePresent: requiredCoveragePresent,
    coverageWarning: DEFAULT_PROFILE.source.coverageWarning,
  },
  preRegisteredTolerance:
    "For each statistic, the allowed interval is the wider of the 95% moving-week block-bootstrap CI and real value ±20%; no tolerance was changed.",
  bootstrap: {
    replicates: BOOTSTRAP_REPLICATES,
    resamplingUnit: `one complete ${DEFAULT_PROFILE.sample.calendar.standardWeekBarCount}-bar modal calendar-week block, sampled with replacement`,
    sampledBlocksPerReplicate: BLOCK_COUNT,
    seed: BOOTSTRAP_SEED,
  },
  normalCell: {
    config: { scenario: "normal_chop", pathLengthTradingDays: 120 },
    seed: NORMAL_SEED,
    candles: synthetic.candles.length,
    labels: synthetic.labels.length,
    outputJsonSha256: fullOutputHash,
    realMetrics,
    syntheticMetrics,
    comparisons: scalarComparisons,
    hourlyComparisons,
    availableSampleMetricChecksPass: metricsPass,
  },
  gates: {
    D1: {
      result: gatePass ? "PASS" : "FAIL",
      fullPeriodCoverage: requiredCoveragePresent ? "PASS" : "FAIL",
      sourceProfileMatch: sourceMatchesProfile ? "PASS" : "FAIL",
      availableSampleMetrics: metricsPass ? "PASS" : "FAIL",
      reason: !requiredCoveragePresent
        ? "the calibration profile does not cover the registered 2020-01-24 through 2026-10-01 archive window"
        : !sourceMatchesProfile
          ? "the validation CSV raw SHA-256 does not match a source file recorded in the calibration profile"
          : metricsPass
            ? "all available-sample realism measures fall within the registered interval"
            : "one or more available-sample realism measures exceed the registered interval",
    },
    D2: { result: "NOT RUN", reason: "stopped at D1 per the fixed gate rule" },
    D3: { result: "NOT RUN", reason: "stopped at D1; no engine behaviour results were computed" },
    D4: { result: "NOT RUN", reason: "stopped at D1" },
    D5: {
      result: "TESTED IN UNIT SUITE",
      outputJsonSha256: fullOutputHash,
      profileFileSha256: profileFileHash,
    },
    D6: { result: "TESTED IN UNIT SUITE", testFile: "tests/synth.test.mjs" },
    D7: { result: "NOT RUN", reason: "stopped at D1; no 200-seed scenario checks were started" },
  },
  stopAfter: "D1",
  strategyResultsComputed: false,
};

writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
