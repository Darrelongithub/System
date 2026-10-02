import type { CalibrationProfile, Candle, MetricSet } from "./types";
import { mean, quantile } from "./random";
import { exchangeSlots, parseEatDatetime } from "./time";

const ATR_PERIOD = 14;
const HALF_HOUR_MS = 30 * 60 * 1000;

interface PathObservations {
  atrReturns: number[];
  absReturnSegments: number[][];
  rangeAtr: number[];
  bodyShares: number[];
  upperShares: number[];
  lowerShares: number[];
  transitions: number;
  gapEvents: number;
  eventGapAtr: number[];
  sessionShares: number[][];
  varianceRatio8: number;
  varianceRatio16: number;
  dailyRangeAtr: number[];
  dailyVolatility: number[];
  dailyDrift: number[];
  standardizedReturnSegments: number[][];
  tailCount: number;
  tailTotal: number;
}

function wilderAtr(candles: readonly Candle[]): (number | undefined)[] {
  const values: (number | undefined)[] = Array(candles.length).fill(undefined);
  if (candles.length < ATR_PERIOD) return values;
  const ranges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1]!.close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });
  let current = mean(ranges.slice(0, ATR_PERIOD));
  values[ATR_PERIOD - 1] = current;
  for (let i = ATR_PERIOD; i < ranges.length; i++) {
    current = (current * (ATR_PERIOD - 1) + ranges[i]!) / ATR_PERIOD;
    values[i] = current;
  }
  return values;
}

function pooledAutocorrelation(segments: readonly number[][], lag: number): number {
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (total <= lag + 1) return 0;
  const center = segments.flat().reduce((sum, value) => sum + value, 0) / total;
  let denominator = 0;
  let numerator = 0;
  for (const segment of segments) {
    for (const value of segment) denominator += (value - center) ** 2;
    for (let i = lag; i < segment.length; i++) {
      numerator += (segment[i]! - center) * (segment[i - lag]! - center);
    }
  }
  return denominator > 0 ? numerator / denominator : 0;
}

function kurtosis(values: readonly number[]): number {
  if (values.length < 4) return 0;
  const center = mean(values);
  let second = 0;
  let fourth = 0;
  for (const value of values) {
    const delta = value - center;
    second += delta ** 2;
    fourth += delta ** 4;
  }
  second /= values.length;
  fourth /= values.length;
  return second > 0 ? fourth / (second * second) : 0;
}

function varianceRatio(returns: readonly number[], horizon: number): number {
  if (returns.length < horizon * 3) return 1;
  const oneBarMean = mean(returns);
  let oneBarVariance = 0;
  for (const value of returns) oneBarVariance += (value - oneBarMean) ** 2;
  oneBarVariance /= returns.length - 1;
  if (!(oneBarVariance > 0)) return 1;
  const sums: number[] = [];
  for (let start = 0; start + horizon <= returns.length; start++) {
    let total = 0;
    for (let offset = 0; offset < horizon; offset++) total += returns[start + offset]!;
    sums.push(total);
  }
  const sumMean = mean(sums);
  let sumVariance = 0;
  for (const value of sums) sumVariance += (value - sumMean) ** 2;
  sumVariance /= Math.max(1, sums.length - 1);
  return sumVariance / (horizon * oneBarVariance);
}

const seasonalCache = new WeakMap<CalibrationProfile, Map<number, number>>();

function seasonalFactor(epochMs: number, profile: CalibrationProfile): number {
  let cache = seasonalCache.get(profile);
  if (!cache) {
    cache = new Map();
    seasonalCache.set(profile, cache);
  }
  const existing = cache.get(epochMs);
  if (existing !== undefined) return existing;
  const slot = exchangeSlots(epochMs);
  const raw = Math.sqrt(
    profile.sourceMetrics.seasonalLondon[slot.london]! *
      profile.sourceMetrics.seasonalNewYork[slot.newYork]!,
  );
  const value = raw / profile.seasonalNormalization;
  cache.set(epochMs, value);
  return value;
}

function inspectPath(candles: readonly Candle[], profile: CalibrationProfile): PathObservations {
  if (candles.length < 2) throw new Error("realism metrics require at least two candles");
  const epochs = candles.map((candle) => parseEatDatetime(candle.datetime));
  const atr = wilderAtr(candles);
  const atrReturns: number[] = [];
  const rawLogReturns: number[] = [];
  const absReturnSegments: number[][] = [];
  const rangeAtr: number[] = [];
  const bodyShares: number[] = [];
  const upperShares: number[] = [];
  const lowerShares: number[] = [];
  const gapRatios: number[] = [];
  let gapEvents = 0;
  let transitions = 0;

  const dayIndices = new Map<string, number[]>();
  for (let i = 0; i < candles.length; i++) {
    const date = candles[i]!.datetime.slice(0, 10);
    const values = dayIndices.get(date) ?? [];
    values.push(i);
    dayIndices.set(date, values);
    const candle = candles[i]!;
    const currentAtr = atr[i];
    const candleRange = candle.high - candle.low;
    if (currentAtr && currentAtr > 0 && candleRange > 0) {
      rangeAtr.push(candleRange / currentAtr);
      bodyShares.push(Math.abs(candle.close - candle.open) / candleRange);
      upperShares.push((candle.high - Math.max(candle.open, candle.close)) / candleRange);
      lowerShares.push((Math.min(candle.open, candle.close) - candle.low) / candleRange);
    }
    if (i > 0) {
      transitions++;
      const previous = candles[i - 1]!;
      const previousAtr = atr[i - 1];
      const returnValue = Math.log(candle.close / previous.close);
      if (Number.isFinite(returnValue)) rawLogReturns.push(returnValue);
      if (previousAtr && previousAtr > 0 && previous.close > 0) {
        const standardized = returnValue / (previousAtr / previous.close);
        if (Number.isFinite(standardized)) atrReturns.push(standardized);
        const elapsed = epochs[i]! - epochs[i - 1]!;
        if (elapsed > HALF_HOUR_MS) {
          gapEvents++;
          const gap = Math.abs(Math.log(candle.open / previous.close) / (previousAtr / previous.close));
          if (Number.isFinite(gap)) gapRatios.push(gap);
        }
      } else if (epochs[i]! - epochs[i - 1]! > HALF_HOUR_MS) {
        gapEvents++;
      }
    }
  }
  absReturnSegments.push(rawLogReturns.map(Math.abs));

  const sessionDailyShares: number[][] = [];
  const dailyRangeAtr: number[] = [];
  const dailyVolatility: number[] = [];
  const dailyDrift: number[] = [];
  const standardizedReturnSegments: number[][] = [];
  let tailCount = 0;
  let tailTotal = 0;
  for (const [date, indexes] of dayIndices) {
    if (indexes.length < 2) continue;
    const dayCandles = indexes.map((index) => candles[index]!);
    const dayReturns = dayCandles.map((candle) => Math.log(candle.close / candle.open));
    const dailyMean = mean(dayReturns);
    const dailySd = Math.sqrt(dayReturns.reduce((sum, value) => sum + (value - dailyMean) ** 2, 0) / dayReturns.length);
    dailyVolatility.push(dailySd);
    dailyDrift.push(Math.log(dayCandles[dayCandles.length - 1]!.close / dayCandles[0]!.open));

    const residuals = indexes.map((index, offset) => {
      const factor = seasonalFactor(epochs[index]!, profile);
      return dailySd > 0 ? (dayReturns[offset]! - dailyMean) / (dailySd * factor) : 0;
    });
    const residualMean = mean(residuals);
    const residualSd = Math.sqrt(residuals.reduce((sum, value) => sum + (value - residualMean) ** 2, 0) / residuals.length);
    const standardized = residualSd > 0 ? residuals.map((value) => (value - residualMean) / residualSd) : residuals;
    standardizedReturnSegments.push(standardized);
    for (const value of standardized) {
      tailTotal++;
      if (Math.abs(value) > profile.returnTailThreshold) tailCount++;
    }

    const blockRanges = Array(6).fill(0) as number[];
    let dailyRangeSum = 0;
    let dailyHigh = Number.NEGATIVE_INFINITY;
    let dailyLow = Number.POSITIVE_INFINITY;
    const atrValues: number[] = [];
    for (const index of indexes) {
      const candle = candles[index]!;
      const barRange = candle.high - candle.low;
      dailyRangeSum += barRange;
      const block = Math.min(5, Math.floor(Number(candle.datetime.slice(11, 13)) / 4));
      blockRanges[block]! += barRange;
      dailyHigh = Math.max(dailyHigh, candle.high);
      dailyLow = Math.min(dailyLow, candle.low);
      const value = atr[index];
      if (value && value > 0) atrValues.push(value);
    }
    if (dailyRangeSum > 0) sessionDailyShares.push(blockRanges.map((value) => value / dailyRangeSum));
    const dayAtr = atrValues.length ? quantile(atrValues, 0.5) : undefined;
    if (dayAtr && dayAtr > 0) dailyRangeAtr.push((dailyHigh - dailyLow) / dayAtr);
    void date;
  }
  const varianceRatios8 = varianceRatio(
    candles.slice(1).map((candle, index) => Math.log(candle.close / candles[index]!.close)),
    8,
  );
  const varianceRatios16 = varianceRatio(
    candles.slice(1).map((candle, index) => Math.log(candle.close / candles[index]!.close)),
    16,
  );
  return {
    atrReturns,
    absReturnSegments,
    rangeAtr,
    bodyShares,
    upperShares,
    lowerShares,
    transitions,
    gapEvents,
    eventGapAtr: gapRatios,
    sessionShares: sessionDailyShares,
    varianceRatio8: varianceRatios8,
    varianceRatio16: varianceRatios16,
    dailyRangeAtr,
    dailyVolatility,
    dailyDrift,
    standardizedReturnSegments,
    tailCount,
    tailTotal,
  };
}

export function computeMetricSet(paths: readonly (readonly Candle[])[], profile: CalibrationProfile): MetricSet {
  if (paths.length === 0) throw new Error("cannot compute metrics for no paths");
  const items = paths.map((path) => inspectPath(path, profile));
  const allAtrReturns = items.flatMap((item) => item.atrReturns);
  const allAbsSegments = items.flatMap((item) => item.absReturnSegments);
  const allStandardizedSegments = items.flatMap((item) => item.standardizedReturnSegments);
  const allSessionShares = items.flatMap((item) => item.sessionShares);
  const allGapRatios = items.flatMap((item) => item.eventGapAtr);
  const allDailyRangeAtr = items.flatMap((item) => item.dailyRangeAtr);
  const allDailyVolatility = items.flatMap((item) => item.dailyVolatility);
  const allDailyDrift = items.flatMap((item) => item.dailyDrift);
  const totalTransitions = items.reduce((sum, item) => sum + item.transitions, 0);
  const totalGapEvents = items.reduce((sum, item) => sum + item.gapEvents, 0);
  const totalTail = items.reduce((sum, item) => sum + item.tailCount, 0);
  const totalTailBars = items.reduce((sum, item) => sum + item.tailTotal, 0);
  const vrWeight = items.reduce((sum, item) => sum + item.atrReturns.length, 0) || 1;
  const weightedVr = (key: "varianceRatio8" | "varianceRatio16") =>
    items.reduce((sum, item) => sum + item[key] * item.atrReturns.length, 0) / vrWeight;
  const sessionShares = Array.from({ length: 6 }, (_, block) => {
    const values = allSessionShares.map((shares) => shares[block]!);
    return mean(values);
  });
  return {
    kurtosisAtr: kurtosis(allAtrReturns),
    absReturnAcf1: pooledAutocorrelation(allAbsSegments, 1),
    absReturnAcf6: pooledAutocorrelation(allAbsSegments, 6),
    absReturnAcf48: pooledAutocorrelation(allAbsSegments, 48),
    meanRangeAtr: mean(items.flatMap((item) => item.rangeAtr)),
    meanBodyShare: mean(items.flatMap((item) => item.bodyShares)),
    meanUpperWickShare: mean(items.flatMap((item) => item.upperShares)),
    meanLowerWickShare: mean(items.flatMap((item) => item.lowerShares)),
    gapFrequency: totalTransitions ? totalGapEvents / totalTransitions : 0,
    gapMedianAtr: allGapRatios.length ? quantile(allGapRatios, 0.5) : 0,
    gapP95Atr: allGapRatios.length ? quantile(allGapRatios, 0.95) : 0,
    sessionShares,
    varianceRatio8: weightedVr("varianceRatio8"),
    varianceRatio16: weightedVr("varianceRatio16"),
    dailyRangeAtrMedian: allDailyRangeAtr.length ? quantile(allDailyRangeAtr, 0.5) : 0,
    dailyRangeAtrP90: allDailyRangeAtr.length ? quantile(allDailyRangeAtr, 0.9) : 0,
    dailyVolatilityMedian: allDailyVolatility.length ? quantile(allDailyVolatility, 0.5) : 0,
    dailyDriftMean: mean(allDailyDrift),
    trendinessAcf1: pooledAutocorrelation(allStandardizedSegments, 1),
    newsTailFrequency: totalTailBars ? totalTail / totalTailBars : 0,
  };
}

export function metricRecord(metrics: MetricSet): Record<string, number> {
  return {
    G1_return_kurtosis_ATR: metrics.kurtosisAtr,
    G2_abs_return_ACF_lag1: metrics.absReturnAcf1,
    G2_abs_return_ACF_lag6: metrics.absReturnAcf6,
    G2_abs_return_ACF_lag48: metrics.absReturnAcf48,
    G3_mean_range_ATR: metrics.meanRangeAtr,
    G3_body_share: metrics.meanBodyShare,
    G3_upper_wick_share: metrics.meanUpperWickShare,
    G3_lower_wick_share: metrics.meanLowerWickShare,
    G4_gap_frequency: metrics.gapFrequency,
    G4_gap_median_ATR: metrics.gapMedianAtr,
    G4_gap_p95_ATR: metrics.gapP95Atr,
    ...Object.fromEntries(metrics.sessionShares.map((value, index) => [`G5_EAT_${index * 4}-${index * 4 + 4}_share`, value])),
    G6_variance_ratio_8: metrics.varianceRatio8,
    G6_variance_ratio_16: metrics.varianceRatio16,
    G7_daily_range_ATR_median: metrics.dailyRangeAtrMedian,
    G7_daily_range_ATR_p90: metrics.dailyRangeAtrP90,
  };
}
