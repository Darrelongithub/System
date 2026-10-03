import { mean, quantile, sampleSd } from "./random";
import { parseEatDatetime, exchangeSlots } from "./time";
import type { Stage2Path } from "./regimes";
import type { CalibrationProfile, Candle, RawCandle } from "./types";
import {
  classifyTercile,
  fitTrendinessControl,
  makeDistribution,
  median,
  populationVariance,
  varianceRatio,
} from "./stage2b-math";
import {
  STAGE2B_REGIMES,
  type Stage2BAnyMetric,
  type Stage2BCausalFeatures,
  type Stage2BLevel,
  type Stage2BMetric,
  type Stage2BPairwiseAucRow,
  type Stage2BRealCalibration,
  type Stage2BRegimeCheck,
  type Stage2BRegimeId,
  type Stage2BWindowRecord,
  type Stage2BWindowStats,
} from "./stage2b-types";

export const STAGE2B_PRIMARY_METRICS: readonly Stage2BMetric[] = [
  "atrPercent",
  "drift",
  "varianceRatio8",
  "varianceRatio16",
];
export const STAGE2B_AUX_METRICS: readonly Stage2BAnyMetric[] = ["gapSize", "newsSpikeIntensity"];
const PRIMARY_STAT_KEYS: readonly Stage2BMetric[] = STAGE2B_PRIMARY_METRICS;
const AUC_FEATURE_NAMES = [
  "rolling48AtrPercent",
  "rolling48DriftZ",
  "rolling48VarianceRatio8",
  "rolling48VarianceRatio16",
] as const;
const AUC_THRESHOLD = 0.6;
const AUC_STRIDE = 4;
const ATR_PERIOD = 14;
const AUC_FIRST_COMPLETE_INDEX = ATR_PERIOD + 47;
const HALF_HOUR_MS = 30 * 60 * 1000;

interface DayGroup {
  date: string;
  indices: number[];
}
interface NumericWindow {
  startDay: number;
  stats: Stage2BWindowStats;
}

function toCandle(raw: RawCandle): Candle {
  return { datetime: raw.datetime, open: raw.open, high: raw.high, low: raw.low, close: raw.close };
}

function groupEligibleSourceDays(source: readonly RawCandle[]): { candles: Candle[]; days: DayGroup[] } {
  const byDate = new Map<string, RawCandle[]>();
  for (const candle of source) {
    if (candle.weekday < 1 || candle.weekday > 5) continue;
    const group = byDate.get(candle.date) ?? [];
    group.push(candle);
    byDate.set(candle.date, group);
  }
  const candles: Candle[] = [];
  const days: DayGroup[] = [];
  for (const [date, group] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (group.length < 24) continue;
    group.sort((a, b) => a.epochMs - b.epochMs);
    const indices: number[] = [];
    for (const item of group) {
      indices.push(candles.length);
      candles.push(toCandle(item));
    }
    days.push({ date, indices });
  }
  return { candles, days };
}

function wilderAtrPercent(candles: readonly Candle[]): Array<number | undefined> {
  const result: Array<number | undefined> = Array(candles.length).fill(undefined);
  if (candles.length < ATR_PERIOD) return result;
  const ranges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1]!.close;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose));
  });
  let atr = mean(ranges.slice(0, ATR_PERIOD));
  for (let index = ATR_PERIOD - 1; index < candles.length; index++) {
    if (index >= ATR_PERIOD) atr = (atr * 13 + ranges[index]!) / 14;
    const priorClose = candles[index - 1]?.close ?? candles[index]!.close;
    if (priorClose > 0) result[index] = atr / priorClose;
  }
  return result;
}

function logReturn(candle: Candle, previous: Candle): number {
  return Math.log(candle.close / previous.close);
}

function dailyOpenCloseReturns(candles: readonly Candle[], indices: readonly number[]): number[] {
  return indices.map((index) => Math.log(candles[index]!.close / candles[index]!.open));
}

function rawStandardizedReturns(
  candles: readonly Candle[],
  days: readonly DayGroup[],
  profile: CalibrationProfile,
): Array<number | undefined> {
  const output: Array<number | undefined> = Array(candles.length).fill(undefined);
  for (const day of days) {
    const returns = dailyOpenCloseReturns(candles, day.indices);
    const center = mean(returns);
    const dailySd = Math.sqrt(populationVariance(returns));
    if (!(dailySd > 0)) continue;
    for (let offset = 0; offset < day.indices.length; offset++) {
      const index = day.indices[offset]!;
      const slots = exchangeSlots(parseEatDatetime(candles[index]!.datetime));
      const seasonal = Math.sqrt(
        profile.sourceMetrics.seasonalLondon[slots.london]! * profile.sourceMetrics.seasonalNewYork[slots.newYork]!,
      ) / profile.seasonalNormalization;
      if (!(seasonal > 0 && Number.isFinite(seasonal))) throw new Error("invalid EAT seasonal factor in Stage 2b calibration");
      output[index] = (returns[offset]! - center) / (dailySd * seasonal);
    }
  }
  return output;
}

function normalizeStandardizedReturns(
  raw: readonly (number | undefined)[],
  residualMean: number,
  residualSd: number,
): Array<number | undefined> {
  if (!(residualSd > 0)) throw new Error("Stage 2b source standardized-return scale must be positive");
  return raw.map((value) => value === undefined ? undefined : (value - residualMean) / residualSd);
}

function statisticForWindow(
  candles: readonly Candle[],
  atrPercent: readonly (number | undefined)[],
  standardized: readonly (number | undefined)[],
  epochs: readonly number[],
  days: readonly DayGroup[],
  profile: CalibrationProfile,
): Stage2BWindowStats {
  if (days.length !== 20) throw new Error("Stage 2b statistic window must contain exactly 20 weekdays");
  const indices = days.flatMap((day) => day.indices);
  if (indices.length < 20 * 24) throw new Error("Stage 2b window contains a weekday with fewer than 24 bars");
  const firstIndex = indices[0]!;
  const lastIndex = indices[indices.length - 1]!;
  for (let offset = 1; offset < indices.length; offset++) {
    if (indices[offset] !== indices[offset - 1]! + 1) throw new Error("Stage 2b window bars must be contiguous in the eligible series");
  }
  const atrValues = indices.map((index) => atrPercent[index]).filter((value): value is number => value !== undefined && Number.isFinite(value));
  const dailyDrifts = days.map((day) => {
    const first = candles[day.indices[0]!]!;
    const last = candles[day.indices[day.indices.length - 1]!];
    return Math.log(last.close / first.open);
  });
  const returns: number[] = [];
  const gaps: number[] = [];
  for (let index = firstIndex + 1; index <= lastIndex; index++) {
    const current = candles[index]!;
    const previous = candles[index - 1]!;
    returns.push(logReturn(current, previous));
    if (epochs[index]! - epochs[index - 1]! > HALF_HOUR_MS) {
      const previousAtrPct = atrPercent[index - 1];
      if (previousAtrPct !== undefined && previousAtrPct > 0) {
        gaps.push(Math.abs(Math.log(current.open / previous.close)) / previousAtrPct);
      }
    }
  }
  const tailCount = indices.reduce((count, index) => {
    const value = standardized[index];
    return count + (value !== undefined && Math.abs(value) > profile.returnTailThreshold ? 1 : 0);
  }, 0);
  const standardizedCount = indices.reduce((count, index) => count + Number(standardized[index] !== undefined), 0);
  const newsSpikeIntensity = standardizedCount ? tailCount / standardizedCount : 0;
  return {
    atrPercent: mean(atrValues),
    drift: mean(dailyDrifts),
    varianceRatio8: varianceRatio(returns, 8),
    varianceRatio16: varianceRatio(returns, 16),
    gapSize: gaps.length ? quantile(gaps, 0.5) : 0,
    newsSpikeIntensity,
  };
}

function buildRealWindowStats(
  candles: readonly Candle[],
  days: readonly DayGroup[],
  profile: CalibrationProfile,
  residualMean: number,
  residualSd: number,
): NumericWindow[] {
  const atr = wilderAtrPercent(candles);
  const rawStandardized = rawStandardizedReturns(candles, days, profile);
  const standardized = normalizeStandardizedReturns(rawStandardized, residualMean, residualSd);
  const epochs = candles.map((candle) => parseEatDatetime(candle.datetime));
  const windows: NumericWindow[] = [];
  for (let start = 0; start + 20 <= days.length; start++) {
    windows.push({
      startDay: start,
      stats: statisticForWindow(candles, atr, standardized, epochs, days.slice(start, start + 20), profile),
    });
  }
  return windows;
}

function calculateRealNewsNormalization(
  candles: readonly Candle[],
  days: readonly DayGroup[],
  profile: CalibrationProfile,
): { residualMean: number; residualSd: number } {
  const raw = rawStandardizedReturns(candles, days, profile).filter((value): value is number => value !== undefined && Number.isFinite(value));
  const residualMean = mean(raw);
  const residualSd = sampleSd(raw);
  if (!(residualSd > 0)) throw new Error("real source has no standardized-return variance for Stage 2b");
  return { residualMean, residualSd };
}

function realCeilings(
  windows: readonly NumericWindow[],
  sourceDayCount: number,
  distributions: Stage2BRealCalibration["distributions"],
): Stage2BRealCalibration["realCeilings"] {
  const result = {} as Stage2BRealCalibration["realCeilings"];
  const metrics = STAGE2B_PRIMARY_METRICS;
  for (const metric of metrics) {
    result[metric] = { LOW: { n: 0, ceiling: 0, thin: true }, NORMAL: { n: 0, ceiling: 0, thin: true }, HIGH: { n: 0, ceiling: 0, thin: true } };
    const shares: Record<Stage2BLevel, number[]> = { LOW: [], NORMAL: [], HIGH: [] };
    for (let start = 0; start + 60 <= sourceDayCount; start++) {
      const contained = windows.slice(start, start + 41);
      if (contained.length !== 41 || contained[0]!.startDay !== start || contained[40]!.startDay !== start + 40) continue;
      const stretchLevel = classifyTercile(median(contained.map((window) => window.stats[metric])), distributions[metric]);
      const share = contained.filter((window) => classifyTercile(window.stats[metric], distributions[metric]) === stretchLevel).length / 41;
      shares[stretchLevel].push(share);
    }
    for (const level of ["LOW", "NORMAL", "HIGH"] as const) {
      const values = shares[level];
      result[metric][level] = {
        n: values.length,
        ceiling: values.length ? mean(values) : 0,
        thin: values.length < 15,
      };
    }
  }
  return result;
}

export function deriveStage2BRealCalibration(
  source: readonly RawCandle[],
  profile: CalibrationProfile,
  specSha256: string,
): Stage2BRealCalibration {
  const { candles, days } = groupEligibleSourceDays(source);
  if (days.length < 60) throw new Error("Stage 2b requires at least one complete 60-weekday real stretch");
  const { residualMean, residualSd } = calculateRealNewsNormalization(candles, days, profile);
  const windowStats = buildRealWindowStats(candles, days, profile, residualMean, residualSd);
  const distributions = {} as Stage2BRealCalibration["distributions"];
  const allMetrics: readonly (keyof Stage2BRealCalibration["distributions"])[] = [
    ...STAGE2B_PRIMARY_METRICS,
    "gapSize",
    "newsSpikeIntensity",
  ];
  for (const metric of allMetrics) distributions[metric] = makeDistribution(windowStats.map((window) => window.stats[metric]));
  const trends = {} as Stage2BRealCalibration["trendControls"];
  for (const [level, quantileKey] of [["LOW", "p17"], ["NORMAL", "p50"], ["HIGH", "p83"]] as const) {
    const targetVR8 = distributions.varianceRatio8[quantileKey];
    const targetVR16 = distributions.varianceRatio16[quantileKey];
    const fitted = fitTrendinessControl(
      targetVR8,
      targetVR16,
      distributions.varianceRatio8.p83 - distributions.varianceRatio8.p17,
      distributions.varianceRatio16.p83 - distributions.varianceRatio16.p17,
    );
    trends[level] = { ...fitted, targetVR8, targetVR16 };
  }
  return {
    schemaVersion: 1,
    sourceSha256: profile.sourceSha256,
    profileSha256: "",
    specSha256,
    windowWeekdays: 20,
    quantileMethod: "linear-(n-1)*p",
    sourceWindowCount: windowStats.length,
    sourceStretchCount: Math.max(0, days.length - 60 + 1),
    distributions,
    realCeilings: realCeilings(windowStats, days.length, distributions),
    trendControls: trends,
    newsStandardization: { residualMean, residualSd, tailThreshold: profile.returnTailThreshold },
  };
}

export function setStage2BCalibrationProfileHash(
  calibration: Stage2BRealCalibration,
  profileSha256: string,
): Stage2BRealCalibration {
  return { ...calibration, profileSha256 };
}

function groupPathDays(candles: readonly Candle[]): DayGroup[] {
  const byDate = new Map<string, number[]>();
  for (let index = 0; index < candles.length; index++) {
    const date = candles[index]!.datetime.slice(0, 10);
    const indices = byDate.get(date) ?? [];
    indices.push(index);
    byDate.set(date, indices);
  }
  return [...byDate.entries()].map(([date, indices]) => ({ date, indices }));
}

export function computeStage2BPathWindows(
  path: Stage2Path,
  profile: CalibrationProfile,
  calibration: Stage2BRealCalibration,
): Stage2BWindowRecord[] {
  if (path.set === "LOCKED TEST") throw new Error("Stage 2b window analysis refuses LOCKED TEST");
  const candles = path.synthetic.candles;
  const atr = wilderAtrPercent(candles);
  const epochs = candles.map((candle) => parseEatDatetime(candle.datetime));
  const pathDays = groupPathDays(candles);
  const rawStandardized = rawStandardizedReturns(candles, pathDays, profile);
  const standardized = normalizeStandardizedReturns(rawStandardized, calibration.newsStandardization.residualMean, calibration.newsStandardization.residualSd);
  const daysByDate = new Map(pathDays.map((day) => [day.date, day]));
  const dayOffsets: number[] = [0];
  for (const count of path.schedule.barCounts) dayOffsets.push(dayOffsets.at(-1)! + count);
  const rows: Stage2BWindowRecord[] = [];
  for (const segment of path.segments) {
    for (let startDay = segment.startDay; startDay + 20 <= segment.endDayExclusive; startDay++) {
      const dayGroups: DayGroup[] = [];
      let clean = true;
      for (let day = startDay; day < startDay + 20; day++) {
        const date = path.schedule.dates[day]!;
        const count = path.schedule.barCounts[day]!;
        const barStart = dayOffsets[day]!;
        const grouped = daysByDate.get(date);
        if (!grouped || grouped.indices.length !== count) {
          clean = false;
          break;
        }
        const indices = grouped.indices;
        if (indices.some((index) => {
          const label = path.synthetic.labels[index]!;
          return label.segmentIndex !== segment.segmentIndex || label.inBlend;
        })) {
          clean = false;
          break;
        }
        if (indices[0] !== barStart || indices.at(-1) !== barStart + count - 1) {
          throw new Error(`Stage 2b date/bar alignment failed for ${date}`);
        }
        dayGroups.push(grouped);
      }
      if (!clean) continue;
      const stats = statisticForWindow(candles, atr, standardized, epochs, dayGroups, profile);
      rows.push({
        ...stats,
        set: path.set === "NULL" ? "NULL" : "DESIGN",
        seed: path.seed,
        regimeId: segment.regimeId,
        segmentIndex: segment.segmentIndex,
        startDate: dayGroups[0]!.date,
      });
    }
  }
  return rows;
}

function regimeLevel(regimeId: Stage2BRegimeId, axis: "volatility" | "drift" | "trend"): Stage2BLevel {
  const item = STAGE2B_REGIMES.find((candidate) => candidate.id === regimeId);
  if (!item) throw new Error(`unknown Stage 2b regime ${regimeId}`);
  return item[axis];
}

function targetForLevel(metric: Stage2BMetric, level: Stage2BLevel, calibration: Stage2BRealCalibration): number {
  const dist = calibration.distributions[metric];
  return dist[level === "LOW" ? "p17" : level === "NORMAL" ? "p50" : "p83"];
}

function c3Ordering(records: readonly Stage2BWindowRecord[], metric: Stage2BMetric): {
  lowMedian: number | null;
  normalMedian: number | null;
  highMedian: number | null;
  pass: boolean;
} {
  const levelValues: Record<Stage2BLevel, number[]> = { LOW: [], NORMAL: [], HIGH: [] };
  for (const record of records) levelValues[regimeLevel(record.regimeId, metric === "atrPercent" ? "volatility" : metric === "drift" ? "drift" : "trend")].push(record[metric]);
  const lowMedian = levelValues.LOW.length ? median(levelValues.LOW) : null;
  const normalMedian = levelValues.NORMAL.length ? median(levelValues.NORMAL) : null;
  const highMedian = levelValues.HIGH.length ? median(levelValues.HIGH) : null;
  return {
    lowMedian,
    normalMedian,
    highMedian,
    pass: lowMedian !== null && normalMedian !== null && highMedian !== null && lowMedian < normalMedian && normalMedian < highMedian,
  };
}

export function evaluateStage2BCohort(records: readonly Stage2BWindowRecord[], calibration: Stage2BRealCalibration): {
  regimes: Stage2BRegimeCheck[];
  ordering: Record<Stage2BMetric, ReturnType<typeof c3Ordering>>;
} {
  const ordering = Object.fromEntries(PRIMARY_STAT_KEYS.map((metric) => [metric, c3Ordering(records, metric)])) as Record<Stage2BMetric, ReturnType<typeof c3Ordering>>;
  const regimes = STAGE2B_REGIMES.map((definition) => {
    const selected = records.filter((record) => record.regimeId === definition.id);
    const levels: Record<Stage2BMetric, Stage2BLevel> = {
      atrPercent: definition.volatility,
      drift: definition.drift,
      varianceRatio8: definition.trend,
      varianceRatio16: definition.trend,
    };
    const metricChecks = {} as Stage2BRegimeCheck["metricChecks"];
    const degradedReasons: string[] = [];
    for (const metric of PRIMARY_STAT_KEYS) {
      const level = levels[metric];
      const distribution = calibration.distributions[metric];
      const plantedSetting = targetForLevel(metric, level, calibration);
      const values = selected.map((record) => record[metric]);
      const realCeiling = calibration.realCeilings[metric][level];
      const c3Pass = ordering[metric].pass;
      if (values.length === 0) {
        metricChecks[metric] = {
          metric,
          intendedLevel: level,
          plantedSetting,
          realizedMedian: null,
          windowCount: 0,
          realTercileCeiling: realCeiling.ceiling,
          realStretchCount: realCeiling.n,
          thin: realCeiling.thin,
          realizedTercileShare: null,
          c1Difference: null,
          c1Status: "NO_WINDOWS",
          c2NormalizedError: null,
          c2Status: "NO_WINDOWS",
          c3Status: c3Pass ? "PASS" : "FAIL",
        };
        degradedReasons.push(`${metric}:NO_WINDOWS`);
        continue;
      }
      const realizedMedian = median(values);
      const realizedTercileShare = values.filter((value) => classifyTercile(value, distribution) === level).length / values.length;
      const c1Difference = realizedTercileShare - realCeiling.ceiling;
      let c1Status: Stage2BRegimeCheck["metricChecks"][Stage2BMetric]["c1Status"];
      if (realCeiling.thin) c1Status = "THIN";
      else if (c1Difference > 0.15) c1Status = "TOO CLEAN";
      else if (c1Difference < -0.15) c1Status = "TOO NOISY";
      else c1Status = "PASS";
      const c2NormalizedError = (realizedMedian - plantedSetting) / (distribution.p83 - distribution.p17);
      const c2Status = Math.abs(c2NormalizedError) <= 0.25 ? "PASS" : "FAIL";
      metricChecks[metric] = {
        metric,
        intendedLevel: level,
        plantedSetting,
        realizedMedian,
        windowCount: values.length,
        realTercileCeiling: realCeiling.ceiling,
        realStretchCount: realCeiling.n,
        thin: realCeiling.thin,
        realizedTercileShare,
        c1Difference,
        c1Status,
        c2NormalizedError,
        c2Status,
        c3Status: c3Pass ? "PASS" : "FAIL",
      };
      if (c1Status === "TOO CLEAN" || c1Status === "TOO NOISY") degradedReasons.push(`${metric}:C1_${c1Status.replaceAll(" ", "_")}`);
      if (c2Status === "FAIL") degradedReasons.push(`${metric}:C2_FAIL`);
      if (!c3Pass) degradedReasons.push(`${metric}:C3_FAIL`);
    }
    const status: Stage2BRegimeCheck["status"] = degradedReasons.length ? "DEGRADED" : "PASS";
    return {
      regimeId: definition.id,
      windowCount: selected.length,
      metricChecks,
      status,
      degradedReasons,
    };
  });
  return { regimes, ordering };
}

function returnSeries(candles: readonly Candle[]): Array<number | undefined> {
  return candles.map((candle, index) => index === 0 ? undefined : Math.log(candle.close / candles[index - 1]!.close));
}

export function computeStage2BCausalFeatures(candles: readonly Candle[]): Stage2BCausalFeatures[] {
  const atr = wilderAtrPercent(candles);
  const returns = returnSeries(candles);
  const features: Stage2BCausalFeatures[] = Array(candles.length);
  for (let index = AUC_FIRST_COMPLETE_INDEX; index < candles.length; index += AUC_STRIDE) {
    const row: Stage2BCausalFeatures = {};
    const atrValues = atr.slice(index - 48, index).filter((value): value is number => value !== undefined && Number.isFinite(value));
    const priorReturns = returns.slice(index - 48, index).filter((value): value is number => value !== undefined && Number.isFinite(value));
    if (atrValues.length === 48) row.rolling48AtrPercent = mean(atrValues);
    if (priorReturns.length === 48) {
      const sd = sampleSd(priorReturns);
      if (sd > 0) row.rolling48DriftZ = mean(priorReturns) / sd;
      row.rolling48VarianceRatio8 = varianceRatio(priorReturns, 8);
      row.rolling48VarianceRatio16 = varianceRatio(priorReturns, 16);
    }
    features[index] = row;
  }
  return features;
}

export interface Stage2BAucAccumulator {
  byRegime: Record<string, Record<keyof Stage2BCausalFeatures, number[]>>;
  samples: Record<string, number>;
}

export function createStage2BAucAccumulator(): Stage2BAucAccumulator {
  const byRegime = {} as Stage2BAucAccumulator["byRegime"];
  const samples = {} as Stage2BAucAccumulator["samples"];
  for (const { id } of STAGE2B_REGIMES) {
    byRegime[id] = {
      rolling48AtrPercent: [],
      rolling48DriftZ: [],
      rolling48VarianceRatio8: [],
      rolling48VarianceRatio16: [],
    };
    samples[id] = 0;
  }
  return { byRegime, samples };
}

export function addStage2BDesignPathToAuc(accumulator: Stage2BAucAccumulator, path: Stage2Path): void {
  if (path.set !== "DESIGN") throw new Error("Stage 2b separability is DESIGN-only; LOCKED TEST/NULL paths are refused");
  const features = computeStage2BCausalFeatures(path.synthetic.candles);
  for (let index = AUC_FIRST_COMPLETE_INDEX; index < features.length; index += AUC_STRIDE) {
    const label = path.synthetic.labels[index]!;
    if (label.inBlend) continue;
    const regimeId = label.regimeId;
    if (!regimeId || !STAGE2B_REGIMES.some((item) => item.id === regimeId)) continue;
    const vector = features[index]!;
    let added = false;
    for (const name of AUC_FEATURE_NAMES) {
      const value = vector[name];
      if (value !== undefined && Number.isFinite(value)) {
        accumulator.byRegime[regimeId]![name].push(value);
        added = true;
      }
    }
    if (added) accumulator.samples[regimeId] = (accumulator.samples[regimeId] ?? 0) + 1;
  }
}

function orientedAuc(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0) return 0.5;
  const joined = [
    ...a.map((value) => ({ value, group: 1 })),
    ...b.map((value) => ({ value, group: 0 })),
  ].sort((left, right) => left.value - right.value);
  let rankSumA = 0;
  for (let index = 0; index < joined.length;) {
    let end = index + 1;
    while (end < joined.length && joined[end]!.value === joined[index]!.value) end++;
    const averageRank = ((index + 1) + end) / 2;
    for (let current = index; current < end; current++) if (joined[current]!.group === 1) rankSumA += averageRank;
    index = end;
  }
  const raw = (rankSumA - (a.length * (a.length + 1)) / 2) / (a.length * b.length);
  return Math.max(raw, 1 - raw);
}

export function finishStage2BAuc(accumulator: Stage2BAucAccumulator): Stage2BPairwiseAucRow[] {
  const rows: Stage2BPairwiseAucRow[] = [];
  for (let left = 0; left < STAGE2B_REGIMES.length; left++) {
    for (let right = left + 1; right < STAGE2B_REGIMES.length; right++) {
      const regimeA = STAGE2B_REGIMES[left]!.id;
      const regimeB = STAGE2B_REGIMES[right]!.id;
      const featureAucs = {} as Stage2BPairwiseAucRow["featureAucs"];
      for (const feature of AUC_FEATURE_NAMES) featureAucs[feature] = orientedAuc(accumulator.byRegime[regimeA]![feature], accumulator.byRegime[regimeB]![feature]);
      const bestFeature = AUC_FEATURE_NAMES.reduce((best, name) => featureAucs[name] > featureAucs[best] ? name : best, AUC_FEATURE_NAMES[0]);
      const bestSingleFeatureAuc = featureAucs[bestFeature];
      rows.push({
        regimeA,
        regimeB,
        sampleCountA: accumulator.samples[regimeA] ?? 0,
        sampleCountB: accumulator.samples[regimeB] ?? 0,
        featureAucs,
        bestFeature,
        bestSingleFeatureAuc,
        status: bestSingleFeatureAuc < AUC_THRESHOLD ? "INSEPARABLE" : "SEPARABLE",
      });
    }
  }
  return rows;
}

export function hardPairRows(rows: readonly Stage2BPairwiseAucRow[]): Stage2BPairwiseAucRow[] {
  const required = new Set([
    "normal_chop|trend_up",
    "normal_chop|trend_down",
    "expansion_up|trend_up",
    "normal_chop|quiet_range",
  ]);
  return rows.filter((row) => required.has([row.regimeA, row.regimeB].sort().join("|")));
}

export function stage2BExtrapolationFlags(
  dials: CalibrationProfile["defaultDials"],
  calibration: Stage2BRealCalibration,
): string[] {
  const outside: string[] = [];
  const direct: Array<[keyof CalibrationProfile["defaultDials"], Stage2BAnyMetric]> = [
    ["volatilityLevel", "atrPercent"],
    ["drift", "drift"],
    ["gapSize", "gapSize"],
    ["newsSpikeIntensity", "newsSpikeIntensity"],
  ];
  for (const [dial, metric] of direct) {
    const distribution = calibration.distributions[metric];
    if (dials[dial] < distribution.p5 || dials[dial] > distribution.p95) outside.push(dial);
  }
  const vr8 = theoreticalAr1VarianceRatioForFlags(dials.trendiness, 8);
  const vr16 = theoreticalAr1VarianceRatioForFlags(dials.trendiness, 16);
  const vr8Band = calibration.distributions.varianceRatio8;
  const vr16Band = calibration.distributions.varianceRatio16;
  if (vr8 < vr8Band.p5 || vr8 > vr8Band.p95 || vr16 < vr16Band.p5 || vr16 > vr16Band.p95) {
    outside.push("trendinessVarianceRatio");
  }
  return outside.length ? ["EXTRAPOLATION", ...outside.map((dial) => `EXTRAPOLATION:${dial}`)] : [];
}

function theoreticalAr1VarianceRatioForFlags(phi: number, horizon: number): number {
  let sum = 0;
  for (let lag = 1; lag < horizon; lag++) sum += (horizon - lag) * phi ** lag;
  return 1 + (2 / horizon) * sum;
}

export function collectExtrapolationCoverage(paths: readonly Stage2Path[]): Record<string, { bars: number; flaggedBars: number; share: number }> {
  const result: Record<string, { bars: number; flaggedBars: number; share: number }> = {};
  for (const path of paths) {
    if (path.set === "LOCKED TEST") throw new Error("Stage 2b extrapolation reporting refuses LOCKED TEST");
    for (const label of path.synthetic.labels) {
      if (!label.regimeId) continue;
      const item = result[label.regimeId] ?? { bars: 0, flaggedBars: 0, share: 0 };
      item.bars++;
      if (label.flags.includes("EXTRAPOLATION")) item.flaggedBars++;
      result[label.regimeId] = item;
    }
  }
  for (const item of Object.values(result)) item.share = item.bars ? item.flaggedBars / item.bars : 0;
  return result;
}
