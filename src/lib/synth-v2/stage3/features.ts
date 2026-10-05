import type { Candle } from "../types";
import type { Stage3FeatureStats, Stage3FeatureVector } from "./types";
import { STAGE3_FEATURE_NAMES } from "./types";

const ATR_PERIOD = 14;

export function wilderAtrPercent(candles: readonly Candle[]): Array<number | undefined> {
  const result: Array<number | undefined> = Array(candles.length).fill(undefined);
  if (candles.length < ATR_PERIOD) return result;
  const ranges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1]!.close;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose));
  });
  let atr = ranges.slice(0, ATR_PERIOD).reduce((sum, val) => sum + val, 0) / ATR_PERIOD;
  for (let index = ATR_PERIOD - 1; index < candles.length; index++) {
    if (index >= ATR_PERIOD) atr = (atr * 13 + ranges[index]!) / 14;
    const priorClose = candles[index - 1]?.close ?? candles[index]!.close;
    if (priorClose > 0) result[index] = atr / priorClose;
  }
  return result;
}

export function varianceRatio(returns: readonly number[], q: number): number {
  if (returns.length <= q * 2 || q < 2) return 1.0;
  const n = returns.length;
  const mean1 = returns.reduce((sum, r) => sum + r, 0) / n;
  let var1Sum = 0;
  for (let i = 0; i < n; i++) {
    const diff = returns[i]! - mean1;
    var1Sum += diff * diff;
  }
  const var1 = var1Sum / (n - 1);
  if (!(var1 > 0)) return 1.0;

  const nq = n - q + 1;
  let varQSum = 0;
  for (let i = 0; i < nq; i++) {
    let qRet = 0;
    for (let offset = 0; offset < q; offset++) qRet += returns[i + offset]!;
    const diff = qRet - q * mean1;
    varQSum += diff * diff;
  }
  const m = q * (n - q + 1) * (1 - q / n);
  const varQ = m > 0 ? varQSum / m : 0;
  return varQ / var1;
}

export function computeDailyDrifts(candles: readonly Candle[], dayIndices: readonly number[]): number {
  if (dayIndices.length === 0) return 0;
  const first = candles[dayIndices[0]!]!;
  const last = candles[dayIndices[dayIndices.length - 1]!]!;
  return Math.log(last.close / first.open);
}

export function computeStage3FeaturesForWeekday(
  candles: readonly Candle[],
  barOffsets: readonly number[],
  barCounts: readonly number[],
  atrPercent: readonly (number | undefined)[],
  targetWeekday: number,
): Stage3FeatureVector {
  if (targetWeekday < 59) {
    throw new Error(`cannot compute Stage 3 features before weekday 59 (got ${targetWeekday})`);
  }

  // Helper to get bar indices for trailing W weekdays [targetWeekday - W + 1, targetWeekday]
  const getWindowBarIndices = (w: number): number[] => {
    const startDay = targetWeekday - w + 1;
    const firstBar = barOffsets[startDay]!;
    const lastBar = barOffsets[targetWeekday]! + barCounts[targetWeekday]! - 1;
    const indices: number[] = [];
    for (let i = firstBar; i <= lastBar; i++) indices.push(i);
    return indices;
  };

  // Helper to get Wilder ATR% mean over trailing W weekdays
  const getMeanAtr = (w: number): number => {
    const indices = getWindowBarIndices(w);
    let sum = 0;
    let count = 0;
    for (const idx of indices) {
      const val = atrPercent[idx];
      if (val !== undefined && Number.isFinite(val) && val > 0) {
        sum += val;
        count++;
      }
    }
    return count > 0 ? sum / count : 0.0018;
  };

  const meanAtr5 = getMeanAtr(5);
  const meanAtr20 = getMeanAtr(20);
  const meanAtr60 = getMeanAtr(60);

  // Helper to compute drift z-score over trailing W weekdays: mean daily return / (daily sd / sqrt(w))
  const getDriftZ = (w: number): number => {
    const startDay = targetWeekday - w + 1;
    const dailyDrifts: number[] = [];
    for (let d = startDay; d <= targetWeekday; d++) {
      const bStart = barOffsets[d]!;
      const bCount = barCounts[d]!;
      const first = candles[bStart]!;
      const last = candles[bStart + bCount - 1]!;
      dailyDrifts.push(Math.log(last.close / first.open));
    }
    const meanD = dailyDrifts.reduce((a, b) => a + b, 0) / w;
    let varD = 0;
    for (const d of dailyDrifts) {
      const diff = d - meanD;
      varD += diff * diff;
    }
    const sdD = Math.sqrt(varD / (w - 1));
    const denom = sdD / Math.sqrt(w);
    return denom > 1e-12 ? meanD / denom : 0;
  };

  const driftZ10 = getDriftZ(10);
  const driftZ20 = getDriftZ(20);
  const driftZ60 = getDriftZ(60);

  // Helper to compute variance ratios over 30-min log returns in trailing W weekdays
  const getReturns = (w: number): number[] => {
    const indices = getWindowBarIndices(w);
    const rets: number[] = [];
    for (let i = 1; i < indices.length; i++) {
      const curr = candles[indices[i]!]!;
      const prev = candles[indices[i - 1]!]!;
      rets.push(Math.log(curr.close / prev.close));
    }
    return rets;
  };

  const rets20 = getReturns(20);
  const rets60 = getReturns(60);

  const vr8_20 = varianceRatio(rets20, 8);
  const vr16_20 = varianceRatio(rets20, 16);
  const vr8_60 = varianceRatio(rets60, 8);
  const vr16_60 = varianceRatio(rets60, 16);

  // Max single-bar range / ATR over trailing 5 weekdays
  const indices5 = getWindowBarIndices(5);
  let maxRangeAtr5 = 0;
  for (const idx of indices5) {
    const c = candles[idx]!;
    const priorClose = idx > 0 ? candles[idx - 1]!.close : c.open;
    const barAtr = atrPercent[idx] ?? meanAtr5;
    const atrDollars = priorClose * barAtr;
    if (atrDollars > 0) {
      const ratio = (c.high - c.low) / atrDollars;
      if (ratio > maxRangeAtr5) maxRangeAtr5 = ratio;
    }
  }

  // Max gap / ATR over trailing 5 weekdays
  const startDay5 = targetWeekday - 5 + 1;
  let maxGapAtr5 = 0;
  for (let d = startDay5 + 1; d <= targetWeekday; d++) {
    const firstBarOfDay = barOffsets[d]!;
    const lastBarOfPriorDay = barOffsets[d - 1]! + barCounts[d - 1]! - 1;
    const curr = candles[firstBarOfDay]!;
    const prev = candles[lastBarOfPriorDay]!;
    const prevAtrPct = atrPercent[lastBarOfPriorDay] ?? meanAtr5;
    if (prevAtrPct > 0) {
      const gapRatio = Math.abs(Math.log(curr.open / prev.close)) / prevAtrPct;
      if (gapRatio > maxGapAtr5) maxGapAtr5 = gapRatio;
    }
  }

  return {
    log_atr_5: Math.log(meanAtr5),
    log_atr_20: Math.log(meanAtr20),
    log_atr_60: Math.log(meanAtr60),
    drift_z_10: driftZ10,
    drift_z_20: driftZ20,
    drift_z_60: driftZ60,
    vr8_20,
    vr16_20,
    vr8_60,
    vr16_60,
    max_range_atr_5: maxRangeAtr5,
    max_gap_atr_5: maxGapAtr5,
  };
}

export function computeFeatureStats(featuresList: readonly Stage3FeatureVector[]): Stage3FeatureStats {
  const n = featuresList.length;
  if (n === 0) throw new Error("cannot compute stats on empty features list");

  const means = {} as Record<keyof Stage3FeatureVector, number>;
  const sds = {} as Record<keyof Stage3FeatureVector, number>;

  for (const name of STAGE3_FEATURE_NAMES) {
    const sum = featuresList.reduce((acc, f) => acc + f[name], 0);
    const meanVal = sum / n;
    means[name] = meanVal;

    const varSum = featuresList.reduce((acc, f) => {
      const diff = f[name] - meanVal;
      return acc + diff * diff;
    }, 0);
    const sdVal = Math.sqrt(varSum / Math.max(1, n - 1));
    sds[name] = sdVal > 1e-9 ? sdVal : 1.0;
  }

  return { means, sds };
}

export function standardizeFeatures(
  raw: Stage3FeatureVector,
  stats: Stage3FeatureStats,
): number[] {
  return STAGE3_FEATURE_NAMES.map((name) => (raw[name] - stats.means[name]) / stats.sds[name]);
}
