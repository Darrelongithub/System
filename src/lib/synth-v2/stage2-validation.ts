import { quantile } from "./random";
import { REGIME_IDS } from "./regimes";
import type { Stage2Path, Stage2RegimeId } from "./regimes";
import type { Candle, RawCandle } from "./types";

export interface Band {
  p10: number;
  p50: number;
  p90: number;
  samples: number;
}
export interface Stage2RealBands {
  definition: string;
  windowWeekdays: number;
  atrPercentPerBar: Band;
  dailyDrift: Band;
  varianceRatio8: Band;
  varianceRatio16: Band;
}
export interface MetricCoverage {
  inBand: number;
  samples: number;
  coverage: number;
}
export interface SegmentAttainment {
  set: "DESIGN" | "NULL";
  seed: number;
  segmentIndex: number;
  regimeId: Stage2RegimeId;
  weekdays: number;
  coverage: {
    atrPercentPerBar: MetricCoverage;
    dailyDrift: MetricCoverage;
    varianceRatio8: MetricCoverage;
    varianceRatio16: MetricCoverage;
  };
  attained: boolean;
  status: "PASS" | "DEGRADED";
}
export interface RegimeAttainment {
  regimeId: Stage2RegimeId;
  segmentCount: number;
  segmentsMeetingNinetyPercent: number;
  segmentAttainmentRate: number;
  averageCoverage: Record<keyof SegmentAttainment["coverage"], number>;
  status: "PASS" | "DEGRADED";
}
export interface CausalFeatureVector {
  rolling48AtrPercent?: number;
  rolling48DriftZ?: number;
  rolling240VarianceRatio8?: number;
  rolling240VarianceRatio16?: number;
}
export interface PairwiseAucRow {
  regimeA: Stage2RegimeId;
  regimeB: Stage2RegimeId;
  sampleCountA: number;
  sampleCountB: number;
  featureAucs: Record<string, number>;
  bestFeature: string;
  bestSingleFeatureAuc: number;
  status: "SEPARABLE" | "INSEPARABLE";
}
export interface PairwiseAucAccumulator {
  byRegime: Record<Stage2RegimeId, Record<string, number[]>>;
  samples: Record<Stage2RegimeId, number>;
}

const FEATURE_NAMES = [
  "rolling48AtrPercent",
  "rolling48DriftZ",
  "rolling240VarianceRatio8",
  "rolling240VarianceRatio16",
] as const;
const DEFAULT_VR_WINDOW_WEEKDAYS = 5;
const INSEPARABLE_AUC_THRESHOLD = 0.6;

function band(values: readonly number[]): Band {
  if (values.length === 0) throw new Error("cannot derive a Stage 2 band from an empty sample");
  return { p10: quantile(values, 0.1), p50: quantile(values, 0.5), p90: quantile(values, 0.9), samples: values.length };
}
function inBand(value: number | undefined, target: Band): boolean {
  return value !== undefined && Number.isFinite(value) && value >= target.p10 && value <= target.p90;
}
function coverage(values: readonly number[], target: Band): MetricCoverage {
  let inBandCount = 0;
  for (const value of values) if (inBand(value, target)) inBandCount++;
  return { inBand: inBandCount, samples: values.length, coverage: values.length === 0 ? 0 : inBandCount / values.length };
}
function variance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}
function varianceRatio(returns: readonly number[], horizon: number): number | undefined {
  if (returns.length < horizon * 4) return undefined;
  const oneVariance = variance(returns);
  if (!(oneVariance > 0)) return undefined;
  const sums: number[] = [];
  for (let index = 0; index + horizon <= returns.length; index++) {
    let total = 0;
    for (let step = 0; step < horizon; step++) total += returns[index + step]!;
    sums.push(total);
  }
  const qVariance = variance(sums);
  return qVariance / (horizon * oneVariance);
}
function trueRanges(candles: readonly Candle[]): number[] {
  const values: number[] = [];
  for (let index = 0; index < candles.length; index++) {
    const candle = candles[index]!;
    const previousClose = candles[index - 1]?.close;
    values.push(previousClose === undefined
      ? candle.high - candle.low
      : Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose)));
  }
  return values;
}
function wilderAtrPercent(candles: readonly Candle[]): Array<number | undefined> {
  const ranges = trueRanges(candles);
  const values: Array<number | undefined> = Array(candles.length).fill(undefined);
  if (ranges.length < 14) return values;
  let atr = ranges.slice(0, 14).reduce((sum, value) => sum + value, 0) / 14;
  for (let index = 13; index < candles.length; index++) {
    if (index > 13) atr = (atr * 13 + ranges[index]!) / 14;
    const denominator = candles[index - 1]?.close ?? candles[index]!.close;
    if (denominator > 0) values[index] = atr / denominator;
  }
  return values;
}
function logReturns(candles: readonly Candle[]): number[] {
  return candles.map((candle, index) => index === 0 ? 0 : Math.log(candle.close / candles[index - 1]!.close));
}

export function deriveStage2Bands(source: readonly RawCandle[], windowWeekdays = DEFAULT_VR_WINDOW_WEEKDAYS): Stage2RealBands {
  const byDate = new Map<string, RawCandle[]>();
  for (const candle of source) {
    if (candle.weekday === 0 || candle.weekday === 6) continue;
    const group = byDate.get(candle.date) ?? [];
    group.push(candle);
    byDate.set(candle.date, group);
  }
  const eligibleDays = [...byDate.entries()].filter(([, candles]) => candles.length >= 24);
  if (eligibleDays.length < windowWeekdays + 2) throw new Error("source has too few complete weekdays for Stage 2 bands");
  const eligibleDates = new Set(eligibleDays.map(([date]) => date));
  const sourceCandles = source.filter((candle) => eligibleDates.has(candle.date));
  const atrValues = wilderAtrPercent(sourceCandles).filter((value): value is number => value !== undefined && Number.isFinite(value));
  const dailyDrifts = eligibleDays.map(([, day]) => Math.log(day[day.length - 1]!.close / day[0]!.open));
  const returns = logReturns(sourceCandles);
  const dates = eligibleDays.map(([date]) => date);
  const dayToReturnIndices = new Map<string, number[]>();
  for (let index = 0; index < sourceCandles.length; index++) {
    const group = dayToReturnIndices.get(sourceCandles[index]!.date) ?? [];
    group.push(index);
    dayToReturnIndices.set(sourceCandles[index]!.date, group);
  }
  const vr8: number[] = [];
  const vr16: number[] = [];
  for (let start = 0; start + windowWeekdays <= dates.length; start++) {
    const windowDates = dates.slice(start, start + windowWeekdays);
    const indices = windowDates.flatMap((date) => dayToReturnIndices.get(date) ?? []);
    // Drop the first close-to-close return so each rolling window begins inside its first weekday.
    const windowReturns = indices.slice(1).map((index) => returns[index]!);
    const value8 = varianceRatio(windowReturns, 8);
    const value16 = varianceRatio(windowReturns, 16);
    if (value8 !== undefined && Number.isFinite(value8)) vr8.push(value8);
    if (value16 !== undefined && Number.isFinite(value16)) vr16.push(value16);
  }
  return {
    definition: `Empirical source p10-p90 bands: Wilder ATR(14)/close per eligible weekday bar; one-weekday close/open log drift; overlapping ${windowWeekdays}-weekday rolling VR8/VR16.`,
    windowWeekdays,
    atrPercentPerBar: band(atrValues),
    dailyDrift: band(dailyDrifts),
    varianceRatio8: band(vr8),
    varianceRatio16: band(vr16),
  };
}

export function computeCausalFeatures(candles: readonly Candle[]): CausalFeatureVector[] {
  const atr = wilderAtrPercent(candles);
  const returns = logReturns(candles);
  const result: CausalFeatureVector[] = Array(candles.length);
  for (let index = 0; index < candles.length; index++) {
    const feature: CausalFeatureVector = {};
    if (index >= 48) {
      const start = index - 48;
      const atrValues = atr.slice(start, index).filter((value): value is number => value !== undefined);
      if (atrValues.length === 48) feature.rolling48AtrPercent = atrValues.reduce((sum, value) => sum + value, 0) / 48;
      const priorReturns = returns.slice(start, index);
      if (priorReturns.length === 48) {
        const mean = priorReturns.reduce((sum, value) => sum + value, 0) / 48;
        const sd = Math.sqrt(variance(priorReturns));
        if (sd > 0) feature.rolling48DriftZ = mean / sd;
      }
    }
    if (index >= 240) {
      const priorReturns = returns.slice(index - 240, index);
      const vr8 = varianceRatio(priorReturns, 8);
      const vr16 = varianceRatio(priorReturns, 16);
      if (vr8 !== undefined) feature.rolling240VarianceRatio8 = vr8;
      if (vr16 !== undefined) feature.rolling240VarianceRatio16 = vr16;
    }
    result[index] = feature;
  }
  return result;
}

function dayGroupsForSegment(path: Stage2Path, segmentIndex: number): Array<{ date: string; indices: number[] }> {
  const days = new Map<string, number[]>();
  for (let index = 0; index < path.synthetic.candles.length; index++) {
    const label = path.synthetic.labels[index]!;
    if (label.segmentIndex !== segmentIndex || label.inBlend) continue;
    const date = label.datetime.slice(0, 10);
    const group = days.get(date) ?? [];
    group.push(index);
    days.set(date, group);
  }
  return [...days.entries()].map(([date, indices]) => ({ date, indices }));
}

export function summarizeStage2Realism(path: Stage2Path, real: Stage2RealBands): SegmentAttainment[] {
  const candles = path.synthetic.candles;
  const labels = path.synthetic.labels;
  const atr = wilderAtrPercent(candles);
  const returns = logReturns(candles);
  const rows: SegmentAttainment[] = [];
  for (const segment of path.segments) {
    const indices = Array.from({ length: segment.endBarExclusive - segment.startBar }, (_, offset) => segment.startBar + offset)
      .filter((index) => labels[index]!.segmentIndex === segment.segmentIndex && !labels[index]!.inBlend);
    const atrSample = indices.map((index) => atr[index]).filter((value): value is number => value !== undefined);
    const dateGroups = dayGroupsForSegment(path, segment.segmentIndex).filter((group) => group.indices.length >= 24);
    const driftSample = dateGroups.map((group) => {
      const first = candles[group.indices[0]!]!;
      const last = candles[group.indices[group.indices.length - 1]!]!;
      return Math.log(last.close / first.open);
    });
    const vr8Sample: number[] = [];
    const vr16Sample: number[] = [];
    for (let start = 0; start + real.windowWeekdays <= dateGroups.length; start++) {
      const window = dateGroups.slice(start, start + real.windowWeekdays);
      const windowDates = new Set(window.map((day) => day.date));
      const firstIndex = window[0]!.indices[0]!;
      const lastDayIndices = window[window.length - 1]!.indices;
      const lastIndex = lastDayIndices[lastDayIndices.length - 1]!;
      const windowReturns: number[] = [];
      // Keep only close-to-close returns whose current and previous bars are clean, in-segment bars.
      for (let index = firstIndex + 1; index <= lastIndex; index++) {
        const current = labels[index]!;
        const previous = labels[index - 1]!;
        if (
          windowDates.has(current.datetime.slice(0, 10)) &&
          current.segmentIndex === segment.segmentIndex && !current.inBlend &&
          previous.segmentIndex === segment.segmentIndex && !previous.inBlend
        ) windowReturns.push(returns[index]!);
      }
      const vr8 = varianceRatio(windowReturns, 8);
      const vr16 = varianceRatio(windowReturns, 16);
      if (vr8 !== undefined) vr8Sample.push(vr8);
      if (vr16 !== undefined) vr16Sample.push(vr16);
    }
    const coverageValues = {
      atrPercentPerBar: coverage(atrSample, real.atrPercentPerBar),
      dailyDrift: coverage(driftSample, real.dailyDrift),
      varianceRatio8: coverage(vr8Sample, real.varianceRatio8),
      varianceRatio16: coverage(vr16Sample, real.varianceRatio16),
    };
    const attained = Object.values(coverageValues).every((item) => item.coverage >= 0.9);
    rows.push({
      set: path.set === "NULL" ? "NULL" : "DESIGN",
      seed: path.seed,
      segmentIndex: segment.segmentIndex,
      regimeId: segment.regimeId,
      weekdays: segment.weekdays,
      coverage: coverageValues,
      attained,
      status: attained ? "PASS" : "DEGRADED",
    });
  }
  return rows;
}

export function summarizeStage2Attainment(rows: readonly SegmentAttainment[]): RegimeAttainment[] {
  return REGIME_IDS.map((regimeId) => {
    const selected = rows.filter((row) => row.regimeId === regimeId);
    const passed = selected.filter((row) => row.attained).length;
    const average = (key: keyof SegmentAttainment["coverage"]) => selected.length
      ? selected.reduce((sum, row) => sum + row.coverage[key].coverage, 0) / selected.length
      : 0;
    const averageCoverage = {
      atrPercentPerBar: average("atrPercentPerBar"),
      dailyDrift: average("dailyDrift"),
      varianceRatio8: average("varianceRatio8"),
      varianceRatio16: average("varianceRatio16"),
    };
    return {
      regimeId,
      segmentCount: selected.length,
      segmentsMeetingNinetyPercent: passed,
      segmentAttainmentRate: selected.length ? passed / selected.length : 0,
      averageCoverage,
      status: selected.length > 0 && passed === selected.length ? "PASS" : "DEGRADED",
    };
  });
}

export function createPairwiseAucAccumulator(): PairwiseAucAccumulator {
  const byRegime = {} as PairwiseAucAccumulator["byRegime"];
  const samples = {} as PairwiseAucAccumulator["samples"];
  for (const regime of REGIME_IDS) {
    byRegime[regime] = Object.fromEntries(FEATURE_NAMES.map((name) => [name, []])) as Record<string, number[]>;
    samples[regime] = 0;
  }
  return { byRegime, samples };
}

export function addDesignPathToPairwiseAuc(accumulator: PairwiseAucAccumulator, path: Stage2Path, stride = 4): void {
  if (path.set !== "DESIGN") throw new Error("pairwise AUC is DESIGN-only; LOCKED TEST/NULL paths are refused");
  const features = computeCausalFeatures(path.synthetic.candles);
  for (let index = 240; index < features.length; index += stride) {
    const label = path.synthetic.labels[index]!;
    if (label.inBlend) continue;
    const regime = label.regimeId as Stage2RegimeId;
    if (!REGIME_IDS.includes(regime)) throw new Error(`unknown regime in DESIGN label: ${label.regimeId}`);
    const vector = features[index]!;
    let added = false;
    for (const name of FEATURE_NAMES) {
      const value = vector[name];
      if (value !== undefined && Number.isFinite(value)) {
        accumulator.byRegime[regime][name].push(value);
        added = true;
      }
    }
    if (added) accumulator.samples[regime]++;
  }
}

function orientedAuc(a: readonly number[], b: readonly number[]): number {
  const joined = [
    ...a.map((value) => ({ value, group: 1 })),
    ...b.map((value) => ({ value, group: 0 })),
  ].sort((left, right) => left.value - right.value);
  let rankSum = 0;
  for (let index = 0; index < joined.length;) {
    let end = index + 1;
    while (end < joined.length && joined[end]!.value === joined[index]!.value) end++;
    const averageRank = ((index + 1) + end) / 2;
    for (let current = index; current < end; current++) if (joined[current]!.group === 1) rankSum += averageRank;
    index = end;
  }
  const raw = (rankSum - (a.length * (a.length + 1)) / 2) / (a.length * b.length);
  return Math.max(raw, 1 - raw);
}

export function finishPairwiseAuc(accumulator: PairwiseAucAccumulator): PairwiseAucRow[] {
  const rows: PairwiseAucRow[] = [];
  for (let left = 0; left < REGIME_IDS.length; left++) {
    for (let right = left + 1; right < REGIME_IDS.length; right++) {
      const regimeA = REGIME_IDS[left]!;
      const regimeB = REGIME_IDS[right]!;
      const featureAucs: Record<string, number> = {};
      for (const feature of FEATURE_NAMES) {
        const a = accumulator.byRegime[regimeA][feature];
        const b = accumulator.byRegime[regimeB][feature];
        featureAucs[feature] = a.length && b.length ? orientedAuc(a, b) : 0.5;
      }
      const bestFeature = FEATURE_NAMES.reduce((best, feature) => featureAucs[feature] > featureAucs[best] ? feature : best, FEATURE_NAMES[0]);
      const bestSingleFeatureAuc = featureAucs[bestFeature]!;
      rows.push({
        regimeA,
        regimeB,
        sampleCountA: accumulator.samples[regimeA],
        sampleCountB: accumulator.samples[regimeB],
        featureAucs,
        bestFeature,
        bestSingleFeatureAuc,
        status: bestSingleFeatureAuc < INSEPARABLE_AUC_THRESHOLD ? "INSEPARABLE" : "SEPARABLE",
      });
    }
  }
  return rows;
}

export function summarizePairwiseAuc(rows: readonly PairwiseAucRow[]) {
  return {
    featureNames: [...FEATURE_NAMES],
    inseparableThreshold: INSEPARABLE_AUC_THRESHOLD,
    pairs: rows,
    inseparablePairs: rows.filter((row) => row.status === "INSEPARABLE").map((row) => `${row.regimeA} vs ${row.regimeB}`),
  };
}
