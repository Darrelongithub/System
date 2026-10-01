import type { DistributionSummary, Quantiles } from "./types";

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

export function sampleVariance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const center = mean(values);
  let sum = 0;
  for (const value of values) sum += (value - center) ** 2;
  return sum / (values.length - 1);
}

export function standardDeviation(values: readonly number[]): number {
  return Math.sqrt(Math.max(0, sampleVariance(values)));
}

export function quantile(values: readonly number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, (sorted.length - 1) * percentile));
  const lower = Math.floor(index);
  const upper = Math.min(sorted.length - 1, lower + 1);
  const fraction = index - lower;
  return sorted[lower]! * (1 - fraction) + sorted[upper]! * fraction;
}

export function quantiles(values: readonly number[]): Quantiles {
  if (values.length === 0) {
    return { p5: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, p95: 0, min: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p5: quantile(sorted, 0.05),
    p10: quantile(sorted, 0.1),
    p25: quantile(sorted, 0.25),
    p50: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    p95: quantile(sorted, 0.95),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  };
}

export function summarize(values: readonly number[]): DistributionSummary {
  return {
    count: values.length,
    mean: mean(values),
    standardDeviation: standardDeviation(values),
    quantiles: quantiles(values),
  };
}

export function correlation(left: readonly number[], right: readonly number[]): number {
  const count = Math.min(left.length, right.length);
  if (count < 2) return 0;
  const a = left.slice(0, count);
  const b = right.slice(0, count);
  const meanA = mean(a);
  const meanB = mean(b);
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let i = 0; i < count; i++) {
    const da = a[i]! - meanA;
    const db = b[i]! - meanB;
    covariance += da * db;
    varianceA += da * da;
    varianceB += db * db;
  }
  const denominator = Math.sqrt(varianceA * varianceB);
  return denominator === 0 ? 0 : covariance / denominator;
}

/** Overlapping q-bar variance ratio using sample variances and demeaned returns. */
export function varianceRatio(returns: readonly number[], horizon: number): number {
  if (horizon < 2 || returns.length <= horizon) return 1;
  const oneBarVariance = sampleVariance(returns);
  if (oneBarVariance <= Number.EPSILON) return 1;
  const aggregated: number[] = [];
  let rolling = 0;
  for (let i = 0; i < returns.length; i++) {
    rolling += returns[i]!;
    if (i >= horizon) rolling -= returns[i - horizon]!;
    if (i >= horizon - 1) aggregated.push(rolling);
  }
  return sampleVariance(aggregated) / (horizon * oneBarVariance);
}

export function autocorrelation(values: readonly number[], lag: number): number {
  if (lag < 1 || values.length <= lag + 1) return 0;
  return correlation(values.slice(lag), values.slice(0, values.length - lag));
}

export function parseEatDatetime(value: string): number | undefined {
  const match = value
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  const millis = Number((match[7] ?? "0").padEnd(3, "0"));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return undefined;
  }
  const utcWall = Date.UTC(year, month - 1, day, hour, minute, second, millis);
  const date = new Date(utcWall);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  // The engine treats an unzoned wall-clock stamp as EAT (+03:00).
  return utcWall - 3 * 60 * 60 * 1000;
}

export function formatEatDatetime(epochMs: number): string {
  const eat = new Date(epochMs + 3 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${eat.getUTCFullYear()}-${pad(eat.getUTCMonth() + 1)}-${pad(eat.getUTCDate())} ${pad(eat.getUTCHours())}:${pad(eat.getUTCMinutes())}:${pad(eat.getUTCSeconds())}`;
}

export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function weekdayOfDate(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function timeOfDayString(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}
