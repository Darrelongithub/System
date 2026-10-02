import type { DistributionSummary, IntradayClock, IntradayClockSlot, Quantiles } from "./types";

export const LONDON_TIME_ZONE = "Europe/London";
export const NEW_YORK_TIME_ZONE = "America/New_York";

const ZONED_CLOCK_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

export interface ZonedClockParts {
  weekday: number;
  minuteOfDay: number;
}

interface ZonedDateTimeParts extends ZonedClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function zonedDateTimeParts(epochMs: number, timeZone: string): ZonedDateTimeParts {
  if (!Number.isFinite(epochMs)) throw new Error("exchange-clock timestamp must be finite");
  let formatter = ZONED_CLOCK_FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    ZONED_CLOCK_FORMATTERS.set(timeZone, formatter);
  }
  const parts = new Map(
    formatter
      .formatToParts(new Date(epochMs))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const year = parts.get("year");
  const month = parts.get("month");
  const day = parts.get("day");
  const hour = parts.get("hour");
  const minute = parts.get("minute");
  if ([year, month, day, hour, minute].some((value) => value === undefined)) {
    throw new Error(`could not resolve exchange-local clock in ${timeZone}`);
  }
  return {
    year: year!,
    month: month!,
    day: day!,
    hour: hour!,
    minute: minute!,
    weekday: new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay(),
    minuteOfDay: hour! * 60 + minute!,
  };
}

/** Convert an absolute instant to an IANA-zone weekday and minute-of-day. */
export function exchangeClockParts(epochMs: number, timeZone: string): ZonedClockParts {
  const { weekday, minuteOfDay } = zonedDateTimeParts(epochMs, timeZone);
  return { weekday, minuteOfDay };
}

function exchangeUtcOffsetMinutes(epochMs: number, timeZone: string): number {
  const parts = zonedDateTimeParts(epochMs, timeZone);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return (localAsUtc - Math.floor(epochMs / 60_000) * 60_000) / 60_000;
}

/** Resolve daylight-saving state from the zone's IANA rules, not a fixed calendar flag. */
export function isDaylightSavingTime(epochMs: number, timeZone: string): boolean {
  const localYear = zonedDateTimeParts(epochMs, timeZone).year;
  const JanuaryStandardInstant = Date.UTC(localYear, 0, 15, 12);
  return (
    exchangeUtcOffsetMinutes(epochMs, timeZone) !==
    exchangeUtcOffsetMinutes(JanuaryStandardInstant, timeZone)
  );
}

/**
 * Use New York's 08:00-16:00 clock for its session, then London's 08:00-13:00
 * clock, and EAT outside those local windows. The NY-first precedence preserves
 * the London/NY overlap during the weeks their DST calendars are offset.
 */
export function intradayClockSlot(
  eatWeekday: number,
  eatMinuteOfDay: number,
  london: ZonedClockParts,
  newYork: ZonedClockParts,
): IntradayClockSlot {
  if (newYork.minuteOfDay >= 8 * 60 && newYork.minuteOfDay < 16 * 60) {
    return {
      clock: NEW_YORK_TIME_ZONE as IntradayClock,
      weekday: newYork.weekday,
      minuteOfDay: newYork.minuteOfDay,
    };
  }
  if (london.minuteOfDay >= 8 * 60 && london.minuteOfDay < 13 * 60) {
    return {
      clock: LONDON_TIME_ZONE as IntradayClock,
      weekday: london.weekday,
      minuteOfDay: london.minuteOfDay,
    };
  }
  return { clock: "EAT", weekday: eatWeekday, minuteOfDay: eatMinuteOfDay };
}

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
