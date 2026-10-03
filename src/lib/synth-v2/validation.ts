import type {
  CalibrationProfile,
  Candle,
  DialName,
  DialValues,
  GateMetric,
  MetricSet,
  RawCandle,
} from "./types";
import { computeMetricSet, metricRecord } from "./metrics";
import { createRandom, pickIndex, quantile } from "./random";
import { generatePath } from "./generate";

export interface BootstrapIntervals {
  replicates: number;
  byStatistic: Record<string, { low: number; high: number; p10: number; p90: number }>;
}

export interface DialCheck {
  dial: DialName;
  targetStatistic: string;
  lowSetting: number;
  highSetting: number;
  observedLow: number;
  observedHigh: number;
  move: number;
  requiredMove: number;
  monotone: boolean;
  pass: boolean;
  nonTargetChanges: Record<string, number>;
  nonTargetLow: Record<string, number>;
  nonTargetHigh: Record<string, number>;
}

export function realWeekdayGroups(raw: readonly RawCandle[]): Candle[][] {
  const grouped = new Map<string, RawCandle[]>();
  for (const candle of raw) {
    if (candle.weekday < 1 || candle.weekday > 5) continue;
    const group = grouped.get(candle.date) ?? [];
    group.push(candle);
    grouped.set(candle.date, group);
  }
  return [...grouped.values()]
    .filter((group) => group.length >= 24)
    .sort((left, right) => left[0]!.date.localeCompare(right[0]!.date))
    .map((group) => group.map(({ datetime, open, high, low, close }) => ({ datetime, open, high, low, close })));
}

export function assertPathInvariants(candles: readonly Candle[], expectedWeekdays?: number): void {
  if (candles.length < 24) throw new Error("generated path has fewer than 24 candles");
  let priorDatetime = "";
  const dates = new Set<string>();
  for (const candle of candles) {
    if (candle.datetime <= priorDatetime) throw new Error(`non-increasing timestamp: ${candle.datetime}`);
    priorDatetime = candle.datetime;
    const date = candle.datetime.slice(0, 10);
    const parts = date.split("-").map(Number);
    const weekday = new Date(Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!)).getUTCDay();
    if (weekday < 1 || weekday > 5) throw new Error(`non-weekday candle timestamp: ${candle.datetime}`);
    const minute = Number(candle.datetime.slice(14, 16));
    if (minute !== 0 && minute !== 30) throw new Error(`timestamp is not on a half-hour boundary: ${candle.datetime}`);
    dates.add(date);
    if (![candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)) {
      throw new Error(`non-finite OHLC at ${candle.datetime}`);
    }
    if (
      candle.open <= 0 ||
      candle.high <= 0 ||
      candle.low <= 0 ||
      candle.close <= 0 ||
      candle.low > Math.min(candle.open, candle.close) ||
      candle.high < Math.max(candle.open, candle.close)
    ) {
      throw new Error(`invalid positive OHLC geometry at ${candle.datetime}`);
    }
  }
  if (expectedWeekdays !== undefined && dates.size !== expectedWeekdays) {
    throw new Error(`expected ${expectedWeekdays} weekdays, received ${dates.size}`);
  }
}

export function bootstrapRealIntervals(
  realDays: readonly Candle[][],
  profile: CalibrationProfile,
  replicates = 300,
  blockWeekdays = 120,
): BootstrapIntervals {
  if (realDays.length < blockWeekdays) throw new Error("real data has too few weekdays for the requested bootstrap");
  if (!Number.isInteger(replicates) || replicates < 20) throw new Error("bootstrap needs at least 20 replicates");
  const random = createRandom(profile.sourceSha256, "synth-v2-real-moving-window-bootstrap");
  const series = new Map<string, number[]>();
  const lastStart = realDays.length - blockWeekdays;
  for (let replicate = 0; replicate < replicates; replicate++) {
    const start = pickIndex(random, lastStart + 1);
    const path = realDays.slice(start, start + blockWeekdays).flat();
    const record = metricRecord(computeMetricSet([path], profile));
    for (const [key, value] of Object.entries(record)) {
      const values = series.get(key) ?? [];
      values.push(value);
      series.set(key, values);
    }
  }
  return {
    replicates,
    byStatistic: Object.fromEntries(
      [...series].map(([key, values]) => [
        key,
        {
          low: quantile(values, 0.025),
          high: quantile(values, 0.975),
          p10: quantile(values, 0.1),
          p90: quantile(values, 0.9),
        },
      ]),
    ),
  };
}

export function compareGateMetrics(
  real: MetricSet,
  synthetic: MetricSet,
  bootstrap: BootstrapIntervals,
): GateMetric[] {
  const realRecord = metricRecord(real);
  const syntheticRecord = metricRecord(synthetic);
  const rows: GateMetric[] = [];
  for (const [id, realValue] of Object.entries(realRecord)) {
    const syntheticValue = syntheticRecord[id];
    if (syntheticValue === undefined) throw new Error(`synthetic statistic missing: ${id}`);
    const isVarianceRatio = id.startsWith("G6_");
    const interval = bootstrap.byStatistic[id];
    const percentDelta = Math.abs(realValue) * 0.2;
    const ciLow = interval?.low;
    const ciHigh = interval?.high;
    const allowedLow = isVarianceRatio
      ? realValue - 0.05
      : Math.min(realValue - percentDelta, ciLow ?? Number.POSITIVE_INFINITY);
    const allowedHigh = isVarianceRatio
      ? realValue + 0.05
      : Math.max(realValue + percentDelta, ciHigh ?? Number.NEGATIVE_INFINITY);
    const tolerance = isVarianceRatio
      ? "fixed ±0.05 absolute"
      : `wider of ±20% (${percentDelta.toPrecision(4)}) or real-data 120-weekday moving-window bootstrap 95% CI`;
    rows.push({
      id,
      statistic: id.replaceAll("_", " "),
      real: realValue,
      bootstrapLow: ciLow,
      bootstrapHigh: ciHigh,
      synthetic: syntheticValue,
      tolerance,
      allowedLow,
      allowedHigh,
      pass: syntheticValue >= allowedLow && syntheticValue <= allowedHigh,
    });
  }
  return rows;
}

function metricTarget(metrics: MetricSet, dial: DialName): number {
  switch (dial) {
    case "volatilityLevel":
      return metrics.dailyVolatilityMedian;
    case "drift":
      return metrics.dailyDriftMean;
    case "trendiness":
      return metrics.trendinessAcf1;
    case "gapSize":
      return metrics.gapMedianAtr;
    case "newsSpikeIntensity":
      return metrics.newsTailFrequency;
  }
}

function otherStatisticChanges(low: MetricSet, high: MetricSet): Record<string, number> {
  const lowRecord = metricRecord(low);
  const highRecord = metricRecord(high);
  return Object.fromEntries(
    Object.keys(lowRecord).map((key) => [key, highRecord[key]! - lowRecord[key]!]),
  );
}

export function checkDials(
  profile: CalibrationProfile,
  seeds: readonly (string | number)[],
  weekdays = 120,
): DialCheck[] {
  if (seeds.length < 10) throw new Error("dial check needs at least 10 matched seeds");
  const dialNames: DialName[] = [
    "volatilityLevel",
    "drift",
    "trendiness",
    "gapSize",
    "newsSpikeIntensity",
  ];
  const checks: DialCheck[] = [];
  for (const dial of dialNames) {
    const observedBand = profile.dialBands[dial];
    const band =
      dial === "trendiness" && profile.trendinessBounds
        ? { ...observedBand, p10: profile.trendinessBounds.p10, p90: profile.trendinessBounds.p90 }
        : observedBand;
    const lowDials: DialValues = { ...profile.defaultDials, [dial]: band.p10 };
    const highDials: DialValues = { ...profile.defaultDials, [dial]: band.p90 };
    const lowGenerated = seeds.map((seed) => generatePath(profile, { seed, weekdays, dials: lowDials }));
    const highGenerated = seeds.map((seed) => generatePath(profile, { seed, weekdays, dials: highDials }));
    const lowMetrics = computeMetricSet(lowGenerated.map((path) => path.candles), profile);
    const highMetrics = computeMetricSet(highGenerated.map((path) => path.candles), profile);
    const labelRate = (paths: typeof lowGenerated) => {
      const labels = paths.flatMap((path) => path.labels);
      return labels.filter((label) => label.newsSpike).length / labels.length;
    };
    const observedLow = dial === "newsSpikeIntensity" ? labelRate(lowGenerated) : metricTarget(lowMetrics, dial);
    const observedHigh = dial === "newsSpikeIntensity" ? labelRate(highGenerated) : metricTarget(highMetrics, dial);
    const move = observedHigh - observedLow;
    const requiredMove = Math.abs(observedBand.p90 - observedBand.p10) * 0.5;
    const nonTargetChanges = otherStatisticChanges(lowMetrics, highMetrics);
    const nonTargetLow = metricRecord(lowMetrics);
    const nonTargetHigh = metricRecord(highMetrics);
    checks.push({
      dial,
      targetStatistic: {
        volatilityLevel: "median daily log-return volatility",
        drift: "mean within-session daily log return",
        trendiness: "lag-1 ACF of standardized returns",
        gapSize: "median absolute event gap / ATR",
        newsSpikeIntensity: "fraction of bars routed to the real standardized-return tail pool (per-bar labels)",
      }[dial],
      lowSetting: band.p10,
      highSetting: band.p90,
      observedLow,
      observedHigh,
      move,
      requiredMove,
      monotone: observedHigh > observedLow,
      pass: observedHigh > observedLow && move >= requiredMove,
      nonTargetChanges,
      nonTargetLow,
      nonTargetHigh,
    });
  }
  return checks;
}

export function gateSummary(rows: readonly GateMetric[]) {
  return {
    passed: rows.filter((row) => row.pass).length,
    total: rows.length,
    allPass: rows.every((row) => row.pass),
  };
}
