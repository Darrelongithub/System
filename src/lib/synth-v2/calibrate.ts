import type {
  CalibrationProfile,
  DailyMetric,
  DayTemplate,
  DialBands,
  RawCandle,
  ShapeSample,
} from "./types";
import { mean, quantile, sampleSd } from "./random";
import { exchangeSlots } from "./time";
import { parseSourceCsv } from "./csv";

const ATR_PERIOD = 14;
const MIN_DONOR_BARS = 24;
const ROLLING_WINDOW_DAYS = 20;
const NEWS_TAIL_PROBABILITY = 0.025;
// Uniform model-level shrinkage: the raw daily fit slightly over-clustered abs(ATR) returns at 6 bars.
const LOG_VOL_INNOVATION_SHRINK = 0.88;
const HALF_HOUR_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface DailyWork extends DailyMetric {
  candles: RawCandle[];
  meanBarReturn: number;
  logVolatility: number;
}

interface WorkBar {
  candle: RawCandle;
  atr: number | undefined;
  barReturn: number;
  dailyVol: number;
  dailyMean: number;
}

function trueRange(candle: RawCandle, previousClose: number | undefined): number {
  if (previousClose === undefined) return candle.high - candle.low;
  return Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - previousClose),
    Math.abs(candle.low - previousClose),
  );
}

function wilderAtr(candles: readonly RawCandle[]): (number | undefined)[] {
  const output: (number | undefined)[] = Array(candles.length).fill(undefined);
  const ranges = candles.map((candle, index) =>
    trueRange(candle, index === 0 ? undefined : candles[index - 1]!.close),
  );
  if (candles.length < ATR_PERIOD) return output;
  let current = mean(ranges.slice(0, ATR_PERIOD));
  output[ATR_PERIOD - 1] = current;
  for (let i = ATR_PERIOD; i < candles.length; i++) {
    current = (current * (ATR_PERIOD - 1) + ranges[i]!) / ATR_PERIOD;
    output[i] = current;
  }
  return output;
}

function variance(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const average = mean(values);
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
}

function autocorrelation(values: readonly number[], lag: number): number {
  if (lag < 1 || values.length <= lag + 1) return 0;
  const average = mean(values);
  let numerator = 0;
  let denominator = 0;
  for (const value of values) denominator += (value - average) ** 2;
  for (let i = lag; i < values.length; i++) {
    numerator += (values[i]! - average) * (values[i - lag]! - average);
  }
  return denominator > 0 ? numerator / denominator : 0;
}

function quantileBand(values: readonly number[], unit: string) {
  return {
    p10: quantile(values, 0.1),
    p50: quantile(values, 0.5),
    p90: quantile(values, 0.9),
    unit,
  };
}

function rollingWindowValues<T>(values: readonly T[], width: number, measure: (slice: readonly T[]) => number): number[] {
  const output: number[] = [];
  if (values.length < width) return output;
  for (let i = 0; i + width <= values.length; i++) output.push(measure(values.slice(i, i + width)));
  return output;
}

function getDailyMetrics(candles: readonly RawCandle[]): DailyWork[] {
  const groups = new Map<string, RawCandle[]>();
  for (const candle of candles) {
    if (candle.weekday < 1 || candle.weekday > 5) continue;
    const group = groups.get(candle.date) ?? [];
    group.push(candle);
    groups.set(candle.date, group);
  }
  const output: DailyWork[] = [];
  for (const [date, day] of groups) {
    day.sort((a, b) => a.epochMs - b.epochMs);
    if (day.length < MIN_DONOR_BARS) continue;
    const returns = day.map((candle) => Math.log(candle.close / candle.open));
    const meanBarReturn = mean(returns);
    const volatility = Math.sqrt(variance(returns));
    const drift = Math.log(day[day.length - 1]!.close / day[0]!.open);
    const gapCount = day.slice(1).reduce((count, candle, index) => {
      const previous = day[index]!;
      return count + (candle.epochMs - previous.epochMs > HALF_HOUR_MS ? 1 : 0);
    }, 0);
    output.push({
      date,
      barCount: day.length,
      volatility,
      drift,
      gapRate: gapCount / Math.max(1, day.length - 1),
      candles: day,
      meanBarReturn,
      logVolatility: Math.log(Math.max(volatility, Number.MIN_VALUE)),
    });
  }
  return output.sort((a, b) => a.date.localeCompare(b.date));
}

function buildSeasonality(workBars: readonly WorkBar[]): {
  london: number[];
  newYork: number[];
  normalization: number;
} {
  const accumulators = [Array(48).fill(0) as number[], Array(48).fill(0) as number[]];
  const counts = [Array(48).fill(0) as number[], Array(48).fill(0) as number[]];
  for (const item of workBars) {
    if (!(item.dailyVol > 0)) continue;
    const slots = exchangeSlots(item.candle.epochMs);
    const standardized = (item.barReturn - item.dailyMean) / item.dailyVol;
    const energy = standardized * standardized;
    accumulators[0]![slots.london]! += energy;
    counts[0]![slots.london]!++;
    accumulators[1]![slots.newYork]! += energy;
    counts[1]![slots.newYork]!++;
  }
  const profiles = accumulators.map((accumulator, zoneIndex) => {
    const means = accumulator.map((sum, slot) => (counts[zoneIndex]![slot]! ? sum / counts[zoneIndex]![slot]! : 0));
    const fallback = means.filter((value) => value > 0);
    const center = mean(fallback);
    return means.map((value) => (value > 0 && center > 0 ? Math.sqrt(value / center) : 1));
  });
  const london = profiles[0]!;
  const newYork = profiles[1]!;
  let sumSquares = 0;
  let count = 0;
  for (const item of workBars) {
    if (!(item.dailyVol > 0)) continue;
    const slots = exchangeSlots(item.candle.epochMs);
    const raw = Math.sqrt(london[slots.london]! * newYork[slots.newYork]!);
    sumSquares += raw * raw;
    count++;
  }
  const normalization = count > 0 ? Math.sqrt(sumSquares / count) : 1;
  return { london, newYork, normalization: normalization > 0 ? normalization : 1 };
}

function makeTemplates(daily: readonly DailyWork[]): DayTemplate[] {
  return daily.map((day) => ({
    sourceDate: day.date,
    weekday: day.candles[0]!.weekday,
    slots: day.candles.map((candle) => candle.minuteOfDay),
  }));
}

function makeShapeBins(
  candles: readonly RawCandle[],
  atr: readonly (number | undefined)[],
): { bins: ShapeSample[][]; nonDojiBins: ShapeSample[][]; edges: number[]; medianBodyShare: number } {
  const records: ShapeSample[] = [];
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i]!;
    if (candle.weekday < 1 || candle.weekday > 5) continue;
    const currentAtr = atr[i];
    const range = candle.high - candle.low;
    if (!(currentAtr && currentAtr > 0 && range > 0)) continue;
    const body = Math.abs(candle.close - candle.open);
    records.push({
      rangeAtr: range / currentAtr,
      bodyShare: body / range,
      upperWickShare: (candle.high - Math.max(candle.open, candle.close)) / range,
      lowerWickShare: (Math.min(candle.open, candle.close) - candle.low) / range,
      bullish: candle.close >= candle.open,
    });
  }
  if (records.length < 100) throw new Error("not enough real bar shapes to calibrate");
  const edges = [quantile(records.map((record) => record.rangeAtr), 1 / 3), quantile(records.map((record) => record.rangeAtr), 2 / 3)];
  const bins: ShapeSample[][] = [[], [], []];
  for (const record of records) {
    const index = record.rangeAtr <= edges[0]! ? 0 : record.rangeAtr <= edges[1]! ? 1 : 2;
    bins[index]!.push(record);
  }
  for (let i = 0; i < bins.length; i++) {
    if (bins[i]!.length === 0) bins[i] = records;
  }
  const nonDojiBins = bins.map((bin) => {
    const nonDoji = bin.filter((record) => record.bodyShare >= 0.05);
    return nonDoji.length > 0 ? nonDoji : records.filter((record) => record.bodyShare >= 0.05);
  });
  const nonDojiBodyShares = records.map((record) => record.bodyShare).filter((value) => value >= 0.05);
  return { bins, nonDojiBins, edges, medianBodyShare: quantile(nonDojiBodyShares, 0.5) };
}

function fitVolatilityModel(daily: readonly DailyWork[], atr: readonly (number | undefined)[], candles: readonly RawCandle[]) {
  const logs = daily.map((day) => day.logVolatility);
  const meanLogVolatility = mean(logs);
  let numerator = 0;
  let denominator = 0;
  for (let i = 1; i < logs.length; i++) {
    numerator += (logs[i - 1]! - meanLogVolatility) * (logs[i]! - meanLogVolatility);
    denominator += (logs[i - 1]! - meanLogVolatility) ** 2;
  }
  const persistence = Math.max(0, Math.min(0.995, denominator > 0 ? numerator / denominator : 0));
  const innovations = logs.slice(1).map((value, i) => value - meanLogVolatility - persistence * (logs[i]! - meanLogVolatility));
  const innovationSd = sampleSd(innovations);
  const atrPercentages = candles.flatMap((candle, index) => {
    const value = atr[index];
    return candle.weekday >= 1 && candle.weekday <= 5 && value && value > 0
      ? [value / candle.close]
      : [];
  });
  return {
    meanLogVolatility,
    persistence,
    innovationSd: innovationSd * LOG_VOL_INNOVATION_SHRINK,
    medianAtrPct: quantile(atrPercentages, 0.5),
  };
}

export function calibrateSourceCsv(text: string, sourceSha256: string): CalibrationProfile {
  const candles = parseSourceCsv(text);
  const weekdayCandles = candles.filter((candle) => candle.weekday >= 1 && candle.weekday <= 5);
  const daily = getDailyMetrics(weekdayCandles);
  if (daily.length < 120) throw new Error(`only ${daily.length} usable weekdays; at least 120 are required`);
  const dailyByDate = new Map(daily.map((day) => [day.date, day]));
  const atrAll = wilderAtr(candles);
  const atrByEpoch = new Map<number, number | undefined>();
  candles.forEach((candle, index) => atrByEpoch.set(candle.epochMs, atrAll[index]));
  const workBars: WorkBar[] = [];
  for (let index = 0; index < candles.length; index++) {
    const candle = candles[index]!;
    if (candle.weekday < 1 || candle.weekday > 5) continue;
    const day = dailyByDate.get(candle.date);
    if (!day) continue;
    workBars.push({
      candle,
      atr: atrAll[index],
      barReturn: Math.log(candle.close / candle.open),
      dailyVol: day.volatility,
      dailyMean: day.meanBarReturn,
    });
  }
  const seasonality = buildSeasonality(workBars);
  const rawStandardized: number[] = [];
  for (const item of workBars) {
    if (!(item.dailyVol > 0)) continue;
    const slots = exchangeSlots(item.candle.epochMs);
    const seasonal =
      Math.sqrt(seasonality.london[slots.london]! * seasonality.newYork[slots.newYork]!) /
      seasonality.normalization;
    const value = (item.barReturn - item.dailyMean) / (item.dailyVol * seasonal);
    if (!Number.isFinite(value)) continue;
    rawStandardized.push(value);
  }
  const residualMean = mean(rawStandardized);
  const residualSd = sampleSd(rawStandardized);
  if (!(residualSd > 0)) throw new Error("standardized return pool has no variance");
  const standardizedByIndex = new Map<number, number>();
  const standardizedByDateFinal = new Map<string, number[]>();
  let cursor = 0;
  for (const item of workBars) {
    if (!(item.dailyVol > 0)) continue;
    const slots = exchangeSlots(item.candle.epochMs);
    const seasonal =
      Math.sqrt(seasonality.london[slots.london]! * seasonality.newYork[slots.newYork]!) /
      seasonality.normalization;
    const value = (item.barReturn - item.dailyMean) / (item.dailyVol * seasonal);
    const standardized = (value - residualMean) / residualSd;
    standardizedByIndex.set(item.candle.epochMs, standardized);
    const group = standardizedByDateFinal.get(item.candle.date) ?? [];
    group.push(standardized);
    standardizedByDateFinal.set(item.candle.date, group);
    cursor++;
  }
  if (cursor !== rawStandardized.length) throw new Error("internal standardized-return alignment error");
  const allStandardized = [...standardizedByIndex.values()];
  const returnTailThreshold = quantile(allStandardized.map(Math.abs), 1 - NEWS_TAIL_PROBABILITY);
  const coreReturns = allStandardized.filter((value) => Math.abs(value) <= returnTailThreshold);
  const spikeReturns = allStandardized.filter((value) => Math.abs(value) > returnTailThreshold);
  if (coreReturns.length < 100 || spikeReturns.length < 10) throw new Error("return pools are unexpectedly small");

  const dailyDates = daily.map((day) => day.date);
  const trendWindows = rollingWindowValues(dailyDates, ROLLING_WINDOW_DAYS, (dates) => {
    const returns = dates.flatMap((date) => standardizedByDateFinal.get(date) ?? []);
    return autocorrelation(returns, 1);
  });
  const newsWindows = rollingWindowValues(dailyDates, ROLLING_WINDOW_DAYS, (dates) => {
    let tail = 0;
    let total = 0;
    for (const date of dates) {
      for (const value of standardizedByDateFinal.get(date) ?? []) {
        total++;
        if (Math.abs(value) > returnTailThreshold) tail++;
      }
    }
    return total > 0 ? tail / total : 0;
  });
  const trendBand = quantileBand(trendWindows, "rolling 20-weekday lag-1 ACF of standardized returns");
  const newsBand = quantileBand(newsWindows, "fraction of bars above the empirical |z| 97.5th-percentile tail threshold");

  const weekdayIndexes = candles
    .map((candle, index) => ({ candle, index }))
    .filter(({ candle }) => candle.weekday >= 1 && candle.weekday <= 5);
  const continuousGapPool: number[] = [];
  const sessionGapPool: number[] = [];
  const weekendGapPool: number[] = [];
  for (let i = 1; i < weekdayIndexes.length; i++) {
    const current = weekdayIndexes[i]!;
    const previous = weekdayIndexes[i - 1]!;
    const elapsed = current.candle.epochMs - previous.candle.epochMs;
    const previousAtr = atrByEpoch.get(previous.candle.epochMs);
    if (!(previousAtr && previousAtr > 0)) continue;
    const value = Math.log(current.candle.open / previous.candle.close) / (previousAtr / previous.candle.close);
    if (!Number.isFinite(value)) continue;
    if (elapsed <= HALF_HOUR_MS) continuousGapPool.push(value);
    else if (elapsed <= DAY_MS) sessionGapPool.push(value);
    else weekendGapPool.push(value);
  }
  const eventGapAbs = [...sessionGapPool, ...weekendGapPool].map(Math.abs);
  if (sessionGapPool.length < 10 || weekendGapPool.length < 10 || eventGapAbs.length < 20) {
    throw new Error("not enough session/weekend gaps to calibrate the requested gap dial");
  }
  const medianEventGapAtr = quantile(eventGapAbs, 0.5);

  const dailyVols = daily.map((day) => day.volatility);
  const dailyDrifts = daily.map((day) => day.drift);
  const gapBand = quantileBand(eventGapAbs, "absolute session/weekend gap divided by prior Wilder ATR(14)");
  const newsSpikeIntensity = newsBand;
  const dialBands: DialBands = {
    volatilityLevel: quantileBand(dailyVols, "daily standard deviation of 30-minute close/open log returns"),
    drift: quantileBand(dailyDrifts, "within-session daily log return, log(last close / first open)"),
    trendiness: trendBand,
    gapSize: gapBand,
    newsSpikeIntensity,
  };

  const atr = atrAll;
  const {
    bins: shapeBins,
    nonDojiBins: nonDojiShapeBins,
    edges: shapeBinEdges,
    medianBodyShare,
  } = makeShapeBins(candles, atr);
  const volatilityModel = fitVolatilityModel(daily, atr, candles);
  const templates = makeTemplates(daily);
  const dailySigma = daily.map((day) => day.volatility * Math.sqrt(day.barCount));
  const nearFlatDriftThreshold = quantile(dailySigma, 0.5) * 0.1;
  const medianDailyDrift = quantile(dailyDrifts, 0.5);
  const dailyNegativeDriftShare = dailyDrifts.filter((value) => value < 0).length / dailyDrifts.length;
  const dailyNearFlatDriftShare = dailyDrifts.filter((value) => Math.abs(value) <= nearFlatDriftThreshold).length / dailyDrifts.length;

  const sourceMetrics = {
    weekdayBars: workBars.length,
    weekdayDates: daily.length,
    donorDays: templates.length,
    dailyVolatility: { p10: dialBands.volatilityLevel.p10, p50: dialBands.volatilityLevel.p50, p90: dialBands.volatilityLevel.p90 },
    dailyDrift: { p10: dialBands.drift.p10, p50: dialBands.drift.p50, p90: dialBands.drift.p90 },
    eventGapCount: sessionGapPool.length + weekendGapPool.length,
    weekendGapCount: weekendGapPool.length,
    newsThreshold: returnTailThreshold,
    seasonalLondon: seasonality.london,
    seasonalNewYork: seasonality.newYork,
    dailyNegativeDriftShare,
    dailyNearFlatDriftShare,
    nearFlatDriftThreshold,
    medianPrice: quantile(weekdayCandles.map((candle) => candle.close), 0.5),
  };
  const defaultDials = {
    volatilityLevel: dialBands.volatilityLevel.p50,
    drift: dialBands.drift.p50,
    trendiness: dialBands.trendiness.p50,
    gapSize: dialBands.gapSize.p50,
    newsSpikeIntensity: dialBands.newsSpikeIntensity.p50,
  };
  const shapeAbs = shapeBins.flat().map((sample) => sample.rangeAtr);
  const initialAtrPct = volatilityModel.medianAtrPct;
  if (!(initialAtrPct > 0 && shapeAbs.length > 0 && medianEventGapAtr > 0 && medianDailyDrift !== undefined)) {
    throw new Error("calibration profile has an invalid scale");
  }
  return {
    schemaVersion: 2,
    sourceSha256,
    sourceFile: "XAUUSD_30min_2020-01-24_to_2026-10-01.csv",
    sourceMetrics,
    dialBands,
    defaultDials,
    volatilityModel,
    coreReturns,
    spikeReturns,
    returnTailThreshold,
    seasonalNormalization: seasonality.normalization,
    dayTemplates: templates,
    shapeBins,
    nonDojiShapeBins,
    shapeBinEdges,
    medianBodyShare,
    continuousGapPool,
    sessionGapPool,
    weekendGapPool,
    medianEventGapAtr,
    initialAtrPct,
  };
}
