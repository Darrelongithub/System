import type {
  CalibrationProfile,
  Candle,
  DistributionSummary,
  ResampleBlock,
  StandardizedBar,
} from "./types";
import {
  addCalendarDays,
  autocorrelation,
  mean,
  parseEatDatetime,
  quantile,
  summarize,
  timeOfDayString,
  varianceRatio,
} from "./math";
import { hashCanonical } from "./hash";

const ATR_PERIOD = 14;
const TREND_WINDOW_BARS = 240;
const TREND_WINDOW_STEP_BARS = 48;
const SCHEDULED_SPIKE_MARGIN = 0.25;
const ABSOLUTE_RETURN_LAGS = [1, 2, 4, 8, 16, 24, 48] as const;
// A non-weekend gap is called a recurring session break only when the exact
// EAT weekday/time pair and duration recur at least 40 times in the source.
const SESSION_BREAK_MIN_MINUTES = 60;
const SESSION_BREAK_MAX_MINUTES = 4 * 60;
const SESSION_BREAK_MIN_OCCURRENCES = 40;
const WEEKLY_SCHEDULE_VARIANT_LIMIT = 5;
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const DAY_MS = 24 * 60 * 60 * 1000;

interface ParsedBar {
  candle: Candle;
  epochMs: number;
  weekday: number;
  minuteOfDay: number;
  trueRange: number;
  atr: number | undefined;
  priorAtr: number | undefined;
  closeReturnAtr: number | undefined;
  openGapAtr: number | undefined;
  bodyReturnAtr: number | undefined;
  weekId: string;
  deltaMinutes: number | undefined;
  gapKind: StandardizedBar["calendarGapKind"];
}

interface ScheduledSessionBreak {
  previousWeekday: number;
  previousMinuteOfDay: number;
  nextWeekday: number;
  nextMinuteOfDay: number;
  gapMinutes: number;
  occurrences: number;
}

interface WeeklyScheduleVariant {
  id: string;
  occurrenceWeeks: number;
  firstWeek: string;
  lastWeek: string;
  barCount: number;
  barSlotsByWeekday: Array<{ weekday: number; minuteOfDay: number }[]>;
  signature: string;
}

function calendarGapKey(
  previousWeekday: number,
  previousMinuteOfDay: number,
  nextWeekday: number,
  nextMinuteOfDay: number,
  gapMinutes: number,
): string {
  return `${previousWeekday}:${previousMinuteOfDay}>${nextWeekday}:${nextMinuteOfDay}:${gapMinutes}`;
}

function isWeekendClosure(
  previousWeekday: number,
  nextWeekday: number,
  gapMinutes: number,
): boolean {
  return (
    gapMinutes <= 4 * 24 * 60 &&
    nextWeekday === 1 &&
    (previousWeekday === 5 || previousWeekday === 6)
  );
}

function wallClockParts(epochMs: number) {
  const wallClock = new Date(epochMs + 3 * 60 * 60 * 1000);
  return {
    weekday: wallClock.getUTCDay(),
    minuteOfDay: wallClock.getUTCHours() * 60 + wallClock.getUTCMinutes(),
  };
}

function detectScheduledSessionBreaks(
  candles: readonly Candle[],
  timestamps: readonly (number | undefined)[],
): { keys: Set<string>; breaks: ScheduledSessionBreak[] } {
  const counts = new Map<string, ScheduledSessionBreak>();
  for (let index = 1; index < candles.length; index++) {
    const previousTimestamp = timestamps[index - 1];
    const nextTimestamp = timestamps[index];
    if (previousTimestamp === undefined || nextTimestamp === undefined) continue;
    const gapMinutes = (nextTimestamp - previousTimestamp) / 60_000;
    if (
      !Number.isInteger(gapMinutes) ||
      gapMinutes < SESSION_BREAK_MIN_MINUTES ||
      gapMinutes > SESSION_BREAK_MAX_MINUTES
    ) {
      continue;
    }
    const previous = wallClockParts(previousTimestamp);
    const next = wallClockParts(nextTimestamp);
    if (isWeekendClosure(previous.weekday, next.weekday, gapMinutes)) continue;
    const key = calendarGapKey(
      previous.weekday,
      previous.minuteOfDay,
      next.weekday,
      next.minuteOfDay,
      gapMinutes,
    );
    const entry = counts.get(key) ?? {
      previousWeekday: previous.weekday,
      previousMinuteOfDay: previous.minuteOfDay,
      nextWeekday: next.weekday,
      nextMinuteOfDay: next.minuteOfDay,
      gapMinutes,
      occurrences: 0,
    };
    entry.occurrences++;
    counts.set(key, entry);
  }
  const breaks = [...counts.entries()]
    .filter(([, entry]) => entry.occurrences >= SESSION_BREAK_MIN_OCCURRENCES)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([, entry]) => entry);
  return {
    keys: new Set(
      breaks.map((entry) =>
        calendarGapKey(
          entry.previousWeekday,
          entry.previousMinuteOfDay,
          entry.nextWeekday,
          entry.nextMinuteOfDay,
          entry.gapMinutes,
        ),
      ),
    ),
    breaks,
  };
}

function mondayDate(datetime: string, weekday: number): string {
  const date = datetime.slice(0, 10);
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addCalendarDays(date, offset);
}

function safeLogRatio(numerator: number, denominator: number): number {
  return Math.log(numerator / denominator);
}

function meanOrZero(values: readonly number[]): number {
  return values.length ? mean(values) : 0;
}

function finiteSummary(values: readonly number[]): DistributionSummary {
  const finite = values.filter(Number.isFinite);
  return summarize(finite);
}

function sessionForMinute(minuteOfDay: number): "asia" | "london" | "newYork" {
  if (minuteOfDay >= 60 && minuteOfDay <= 659) return "asia";
  if (minuteOfDay >= 660 && minuteOfDay <= 959) return "london";
  return "newYork";
}

function varianceAndMoments(values: readonly number[]) {
  if (values.length === 0) return { skewness: 0, kurtosis: 0 };
  const center = mean(values);
  let second = 0;
  let third = 0;
  let fourth = 0;
  for (const value of values) {
    const d = value - center;
    const d2 = d * d;
    second += d2;
    third += d2 * d;
    fourth += d2 * d2;
  }
  second /= values.length;
  third /= values.length;
  fourth /= values.length;
  if (second <= Number.EPSILON) return { skewness: 0, kurtosis: 0 };
  return { skewness: third / Math.pow(second, 1.5), kurtosis: fourth / (second * second) };
}

function returnWindowStats(values: readonly number[]) {
  return {
    varianceRatio8: varianceRatio(values, 8),
    varianceRatio16: varianceRatio(values, 16),
    lag1Autocorrelation: autocorrelation(values, 1),
  };
}

function countMissingDates(candles: readonly Candle[]): string[] {
  const observed = new Set(candles.map((candle) => candle.datetime.slice(0, 10)));
  const first = candles[0]!.datetime.slice(0, 10);
  const last = candles[candles.length - 1]!.datetime.slice(0, 10);
  const missing: string[] = [];
  for (let day = addCalendarDays(first, 1); day < last; day = addCalendarDays(day, 1)) {
    if (!observed.has(day)) missing.push(day);
  }
  return missing;
}

function distributionForAbsolute(values: readonly number[]): DistributionSummary {
  return finiteSummary(values.map(Math.abs));
}

function buildWeeklyScheduleVariants(parsed: readonly ParsedBar[]): WeeklyScheduleVariant[] {
  const slotsByWeek = new Map<string, Map<number, number[]>>();
  for (const bar of parsed) {
    const days = slotsByWeek.get(bar.weekId) ?? new Map<number, number[]>();
    const slots = days.get(bar.weekday) ?? [];
    slots.push(bar.minuteOfDay);
    days.set(bar.weekday, slots);
    slotsByWeek.set(bar.weekId, days);
  }

  const bySignature = new Map<string, { slots: number[][]; weeks: string[]; barCount: number }>();
  for (const [weekId, days] of slotsByWeek) {
    // A recurring template must contain every Monday-Friday date. Missing days
    // remain visible as closures, but cannot define the representative schedule.
    if ([1, 2, 3, 4, 5].some((weekday) => (days.get(weekday)?.length ?? 0) === 0)) continue;
    const slots = Array.from({ length: 7 }, (_, weekday) =>
      [...(days.get(weekday) ?? [])].sort((a, b) => a - b),
    );
    const signature = slots.map((daySlots) => daySlots.join(",")).join("|");
    const variant = bySignature.get(signature) ?? { slots, weeks: [], barCount: 0 };
    variant.weeks.push(weekId);
    variant.barCount += slots.reduce((sum, daySlots) => sum + daySlots.length, 0);
    bySignature.set(signature, variant);
  }

  return [...bySignature.entries()]
    .map(([signature, variant]) => ({
      signature,
      occurrenceWeeks: variant.weeks.length,
      firstWeek: [...variant.weeks].sort()[0]!,
      lastWeek: [...variant.weeks].sort().at(-1)!,
      barCount: variant.slots.reduce((sum, daySlots) => sum + daySlots.length, 0),
      barSlotsByWeekday: variant.slots.map((daySlots, weekday) =>
        daySlots.map((minuteOfDay) => ({ weekday, minuteOfDay })),
      ),
    }))
    .sort(
      (a, b) =>
        b.occurrenceWeeks - a.occurrenceWeeks ||
        b.barCount - a.barCount ||
        a.signature.localeCompare(b.signature),
    )
    .slice(0, WEEKLY_SCHEDULE_VARIANT_LIMIT)
    .map((variant, index) => ({ ...variant, id: `schedule-${index + 1}` }));
}

function buildCalendarSummary(
  parsed: readonly ParsedBar[],
  candles: readonly Candle[],
  scheduledSessionBreaks: ScheduledSessionBreak[],
) {
  const datesByWeekday = new Map<number, Map<string, number>>();
  for (const bar of parsed) {
    const date = bar.candle.datetime.slice(0, 10);
    const dateMap = datesByWeekday.get(bar.weekday) ?? new Map<string, number>();
    dateMap.set(date, (dateMap.get(date) ?? 0) + 1);
    datesByWeekday.set(bar.weekday, dateMap);
  }

  const barsByWeekday: CalibrationProfile["sample"]["calendar"]["barsByWeekday"] = [];
  const fallbackSlotsByWeekday: CalibrationProfile["sample"]["calendar"]["barSlotsByWeekday"] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    const dates = datesByWeekday.get(weekday) ?? new Map<string, number>();
    const counts = [...dates.values()];
    const countFrequencies = new Map<number, number>();
    for (const count of counts) countFrequencies.set(count, (countFrequencies.get(count) ?? 0) + 1);
    const modalCount =
      [...countFrequencies.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
    barsByWeekday.push({
      weekday,
      countPerObservedDay: modalCount,
      observedDates: dates.size,
    });

    const slotsByDay = new Map<string, number[]>();
    for (const bar of parsed) {
      if (bar.weekday !== weekday) continue;
      const date = bar.candle.datetime.slice(0, 10);
      const slots = slotsByDay.get(date) ?? [];
      slots.push(bar.minuteOfDay);
      slotsByDay.set(date, slots);
    }
    const typicalDate = [...slotsByDay.entries()]
      .filter(([, slots]) => slots.length === modalCount)
      .sort((a, b) => a[0].localeCompare(b[0]))[0];
    const slots = typicalDate ? [...typicalDate[1]].sort((a, b) => a - b) : [];
    fallbackSlotsByWeekday.push(slots.map((minuteOfDay) => ({ weekday, minuteOfDay })));
  }

  const weeklyScheduleVariants = buildWeeklyScheduleVariants(parsed);
  const primarySchedule = weeklyScheduleVariants[0];
  const barSlotsByWeekday = primarySchedule?.barSlotsByWeekday ?? fallbackSlotsByWeekday;
  const standardWeekBarCount =
    primarySchedule?.barCount ?? barSlotsByWeekday.reduce((sum, slots) => sum + slots.length, 0);

  const longClosures: CalibrationProfile["sample"]["calendar"]["longClosures"] = [];
  for (let i = 1; i < parsed.length; i++) {
    const current = parsed[i]!;
    const previous = parsed[i - 1]!;
    if ((current.deltaMinutes ?? 30) <= 30) continue;
    const missingDates: string[] = [];
    let date = addCalendarDays(previous.candle.datetime.slice(0, 10), 1);
    const endDate = current.candle.datetime.slice(0, 10);
    while (date < endDate) {
      missingDates.push(date);
      date = addCalendarDays(date, 1);
    }
    longClosures.push({
      priorBar: previous.candle.datetime,
      nextBar: current.candle.datetime,
      minutes: current.deltaMinutes!,
      missingDates,
      classification:
        current.gapKind === "weekend"
          ? "weekend"
          : current.gapKind === "scheduled-session-break"
            ? "scheduled-session-break"
            : "unclassified-closure",
    });
  }
  const unclassified = longClosures.filter((gap) => gap.classification === "unclassified-closure");
  const activeWeekdays = new Set(
    parsed
      .filter((bar) => bar.weekday >= 1 && bar.weekday <= 5)
      .map((bar) => bar.candle.datetime.slice(0, 10)),
  ).size;
  const firstObservedMonday = candles
    .find((candle) => {
      const date = candle.datetime.slice(0, 10);
      const parsedDate = parseEatDatetime(`${date} 00:00:00`);
      return (
        parsedDate !== undefined && new Date(parsedDate + 3 * 60 * 60 * 1000).getUTCDay() === 1
      );
    })
    ?.datetime.slice(0, 10);

  return {
    barsByWeekday,
    barSlotsByWeekday,
    weeklyScheduleVariants,
    scheduledSessionBreaks,
    longClosures,
    standardWeekBarCount,
    representativeStartDate:
      primarySchedule?.firstWeek ?? firstObservedMonday ?? candles[0]!.datetime.slice(0, 10),
    unclassifiedClosureRatePerTradingDay:
      activeWeekdays > 0 ? unclassified.length / activeWeekdays : 0,
    missingCalendarDates: countMissingDates(candles),
  };
}

function buildCompleteWeeks(
  bars: readonly StandardizedBar[],
  expectedBars: number,
  expectedSlots: CalibrationProfile["sample"]["calendar"]["barSlotsByWeekday"],
): ResampleBlock[] {
  const groups = new Map<string, { start: number; end: number; indexes: number[] }>();
  for (let index = 0; index < bars.length; index++) {
    const bar = bars[index]!;
    const group = groups.get(bar.weekId) ?? { start: index, end: index + 1, indexes: [] };
    group.start = Math.min(group.start, index);
    group.end = Math.max(group.end, index + 1);
    group.indexes.push(index);
    groups.set(bar.weekId, group);
  }
  const result: ResampleBlock[] = [];
  for (const [weekId, group] of groups) {
    if (group.indexes.length !== expectedBars || group.end - group.start !== expectedBars) continue;
    const weekBars = group.indexes.map((index) => bars[index]!);
    if (weekBars.some((bar) => bar.calendarGapKind === "unclassified-closure")) continue;
    const matchesTemplate = expectedSlots.every((expectedDay, weekday) => {
      const expected = expectedDay.map((entry) => entry.minuteOfDay);
      const actual = weekBars
        .filter((bar) => bar.weekday === weekday)
        .map((bar) => bar.minuteOfDay);
      return (
        expected.length === actual.length &&
        expected.every((minute, index) => minute === actual[index])
      );
    });
    if (!matchesTemplate) continue;
    const returns = weekBars.map((bar) => bar.closeReturnAtr);
    const stats = returnWindowStats(returns);
    result.push({
      weekId,
      startBar: group.start,
      endBarExclusive: group.end,
      barCount: group.indexes.length,
      varianceRatio8: stats.varianceRatio8,
      varianceRatio16: stats.varianceRatio16,
      lag1Autocorrelation: stats.lag1Autocorrelation,
      meanCloseReturnAtr: mean(returns),
    });
  }
  return result.sort((a, b) => a.weekId.localeCompare(b.weekId));
}

/**
 * Calibrate only from OHLC/time structure. No strategy, trade, R, or P&L field is
 * read. ATR is deliberately recomputed as Wilder ATR(14), ignoring any supplied
 * `atr_30m` research column.
 */
export function calibrate(realCandles: Candle[]): CalibrationProfile {
  if (realCandles.length < ATR_PERIOD + 1) {
    throw new Error(`calibrate needs at least ${ATR_PERIOD + 1} candles`);
  }

  const candles = realCandles.map((candle) => ({ ...candle }));
  const timestamps = candles.map((candle) => parseEatDatetime(candle.datetime));
  let duplicateTimestamps = 0;
  let nonIncreasingTimestamps = 0;
  let ohlcInvariantViolations = 0;
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i]!;
    const timestamp = timestamps[i];
    if (timestamp === undefined)
      throw new Error(`invalid EAT timestamp at row ${i}: ${candle.datetime}`);
    if (
      ![candle.open, candle.high, candle.low, candle.close].every(Number.isFinite) ||
      candle.open <= 0 ||
      candle.high <= 0 ||
      candle.low <= 0 ||
      candle.close <= 0 ||
      candle.low > candle.open ||
      candle.open > candle.high ||
      candle.low > candle.close ||
      candle.close > candle.high
    ) {
      ohlcInvariantViolations++;
      throw new Error(
        `invalid OHLC geometry at row ${i} (${candle.datetime}); input was not altered`,
      );
    }
    if (i > 0) {
      if (timestamp === timestamps[i - 1]) duplicateTimestamps++;
      if (timestamp <= timestamps[i - 1]!) nonIncreasingTimestamps++;
    }
  }
  if (duplicateTimestamps || nonIncreasingTimestamps) {
    throw new Error(
      `timestamps are not strictly increasing (${duplicateTimestamps} duplicate, ${nonIncreasingTimestamps} non-increasing); input was not sorted or deduplicated`,
    );
  }
  const sessionBreakDetection = detectScheduledSessionBreaks(candles, timestamps);

  const trueRanges = new Array<number>(candles.length);
  const atr = new Array<number | undefined>(candles.length).fill(undefined);
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i]!;
    const previousClose = i > 0 ? candles[i - 1]!.close : undefined;
    trueRanges[i] =
      previousClose === undefined
        ? candle.high - candle.low
        : Math.max(
            candle.high - candle.low,
            Math.abs(candle.high - previousClose),
            Math.abs(candle.low - previousClose),
          );
  }
  if (candles.length >= ATR_PERIOD) {
    let smoothed = mean(trueRanges.slice(0, ATR_PERIOD));
    atr[ATR_PERIOD - 1] = smoothed;
    for (let i = ATR_PERIOD; i < candles.length; i++) {
      smoothed = (smoothed * (ATR_PERIOD - 1) + trueRanges[i]!) / ATR_PERIOD;
      atr[i] = smoothed;
    }
  }

  const parsed: ParsedBar[] = [];
  const returns: number[] = [];
  const absoluteReturns: number[] = [];
  const atrPercents: number[] = [];
  const trueRangeToAtr: number[] = [];
  const rangeAtr: number[] = [];
  const bodyShares: number[] = [];
  const upperWickShares: number[] = [];
  const lowerWickShares: number[] = [];
  const closePositions: number[] = [];
  const yearCounts: Record<string, number> = {};
  const weekdayCounts: Record<string, number> = {};
  const hourlyReturns = Array.from({ length: 24 }, () => [] as number[]);
  const hourlyAtr = Array.from({ length: 24 }, () => [] as number[]);
  const weekdayReturns = Array.from({ length: 7 }, () => [] as number[]);
  const weekdayAtr = Array.from({ length: 7 }, () => [] as number[]);
  const sessionRows = {
    asia: { returns: [] as number[], atr: [] as number[], tr: [] as number[] },
    london: { returns: [] as number[], atr: [] as number[], tr: [] as number[] },
    newYork: { returns: [] as number[], atr: [] as number[], tr: [] as number[] },
  };
  const slotAbsReturns = new Map<number, number[]>();
  const gaps: number[] = [];
  const weekendGaps: number[] = [];
  const closureGaps: number[] = [];
  const closureDurations: number[] = [];
  let temporalGapCount = 0;
  let missing30mIntervals = 0;
  let barsPer60DaySamples: number[] = [];
  let drift60Day: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i]!;
    const epochMs = timestamps[i]!;
    const eatWallClock = new Date(epochMs + 3 * 60 * 60 * 1000);
    const { weekday, minuteOfDay } = wallClockParts(epochMs);
    const weekId = mondayDate(candle.datetime, weekday);
    const previous = i > 0 ? candles[i - 1] : undefined;
    const deltaMinutes = i > 0 ? (epochMs - timestamps[i - 1]!) / 60_000 : undefined;
    let gapKind: ParsedBar["gapKind"] = "none";
    if (deltaMinutes !== undefined && deltaMinutes > 30) {
      temporalGapCount++;
      if (Number.isInteger(deltaMinutes / 30))
        missing30mIntervals += Math.max(0, deltaMinutes / 30 - 1);
      const previousParts = wallClockParts(timestamps[i - 1]!);
      const weekendClosure = isWeekendClosure(previousParts.weekday, weekday, deltaMinutes);
      const gapKey = calendarGapKey(
        previousParts.weekday,
        previousParts.minuteOfDay,
        weekday,
        minuteOfDay,
        deltaMinutes,
      );
      gapKind = weekendClosure
        ? "weekend"
        : sessionBreakDetection.keys.has(gapKey)
          ? "scheduled-session-break"
          : "unclassified-closure";
    }

    const currentAtr = atr[i];
    const priorAtr = (i > 0 ? atr[i - 1] : undefined) ?? currentAtr;
    const priorClose = previous?.close;
    const closeReturnAtr =
      priorClose !== undefined && priorAtr !== undefined
        ? safeLogRatio(candle.close, priorClose) / (priorAtr / priorClose)
        : undefined;
    const openGapAtr =
      priorClose !== undefined && priorAtr !== undefined
        ? safeLogRatio(candle.open, priorClose) / (priorAtr / priorClose)
        : 0;
    const bodyReturnAtr =
      priorClose !== undefined && priorAtr !== undefined
        ? safeLogRatio(candle.close, candle.open) / (priorAtr / priorClose)
        : 0;

    parsed.push({
      candle,
      epochMs,
      weekday,
      minuteOfDay,
      trueRange: trueRanges[i]!,
      atr: currentAtr,
      priorAtr,
      closeReturnAtr,
      openGapAtr,
      bodyReturnAtr,
      weekId,
      deltaMinutes,
      gapKind,
    });
    yearCounts[String(eatWallClock.getUTCFullYear())] =
      (yearCounts[String(eatWallClock.getUTCFullYear())] ?? 0) + 1;
    weekdayCounts[WEEKDAY_NAMES[weekday]!] = (weekdayCounts[WEEKDAY_NAMES[weekday]!] ?? 0) + 1;

    if (currentAtr !== undefined) {
      atrPercents.push(currentAtr / candle.close);
      trueRangeToAtr.push(trueRanges[i]! / currentAtr);
      const totalRange = candle.high - candle.low;
      const body = Math.abs(candle.close - candle.open);
      const upperWick = candle.high - Math.max(candle.open, candle.close);
      const lowerWick = Math.min(candle.open, candle.close) - candle.low;
      rangeAtr.push(totalRange / currentAtr);
      bodyShares.push(totalRange > 0 ? body / totalRange : 0);
      upperWickShares.push(totalRange > 0 ? upperWick / totalRange : 0);
      lowerWickShares.push(totalRange > 0 ? lowerWick / totalRange : 0);
      closePositions.push(totalRange > 0 ? (candle.close - candle.low) / totalRange : 0.5);
    }
    if (closeReturnAtr !== undefined) {
      returns.push(closeReturnAtr);
      absoluteReturns.push(Math.abs(closeReturnAtr));
      const hour = Math.floor(minuteOfDay / 60);
      hourlyReturns[hour]!.push(Math.abs(closeReturnAtr));
      weekdayReturns[weekday]!.push(Math.abs(closeReturnAtr));
      const slotValues = slotAbsReturns.get(minuteOfDay) ?? [];
      slotValues.push(Math.abs(closeReturnAtr));
      slotAbsReturns.set(minuteOfDay, slotValues);
    }
    if (currentAtr !== undefined) {
      const hour = Math.floor(minuteOfDay / 60);
      hourlyAtr[hour]!.push(currentAtr / candle.close);
      weekdayAtr[weekday]!.push(currentAtr / candle.close);
      const session = sessionForMinute(minuteOfDay);
      sessionRows[session].atr.push(currentAtr / candle.close);
      sessionRows[session].tr.push(trueRanges[i]! / currentAtr);
      if (closeReturnAtr !== undefined) sessionRows[session].returns.push(Math.abs(closeReturnAtr));
    }
    if (i > 0 && priorAtr !== undefined && priorClose !== undefined) {
      const gapAtr = safeLogRatio(candle.open, priorClose) / (priorAtr / priorClose);
      if ((deltaMinutes ?? 30) <= 30) {
        gaps.push(gapAtr);
      } else if (gapKind === "weekend") {
        weekendGaps.push(gapAtr);
      } else if (gapKind === "unclassified-closure") {
        closureGaps.push(gapAtr);
        const missingDays = Math.max(0, Math.floor((epochMs - timestamps[i - 1]! - 1) / DAY_MS));
        closureDurations.push(missingDays);
      }
    }
  }

  const standardBars: StandardizedBar[] = parsed
    .filter(
      (
        bar,
      ): bar is ParsedBar & {
        atr: number;
        priorAtr: number;
        closeReturnAtr: number;
        openGapAtr: number;
        bodyReturnAtr: number;
      } => bar.atr !== undefined && bar.priorAtr !== undefined && bar.closeReturnAtr !== undefined,
    )
    .map((bar) => {
      const candle = bar.candle;
      const totalRange = candle.high - candle.low;
      const upperWick = candle.high - Math.max(candle.open, candle.close);
      const lowerWick = Math.min(candle.open, candle.close) - candle.low;
      return {
        minuteOfDay: bar.minuteOfDay,
        weekday: bar.weekday,
        openGapAtr: bar.openGapAtr,
        bodyReturnAtr: bar.bodyReturnAtr,
        trueRangeAtr: bar.trueRange / bar.atr,
        rangeAtr: totalRange / bar.atr,
        bodyShare: totalRange > 0 ? Math.abs(candle.close - candle.open) / totalRange : 0,
        upperWickShare: totalRange > 0 ? upperWick / totalRange : 0,
        lowerWickShare: totalRange > 0 ? lowerWick / totalRange : 0,
        closePosition: totalRange > 0 ? (candle.close - candle.low) / totalRange : 0.5,
        closeReturnAtr: bar.closeReturnAtr,
        atrPercent: bar.atr / candle.close,
        weekId: bar.weekId,
        calendarGapBefore: (bar.deltaMinutes ?? 30) > 30,
        calendarGapKind: bar.gapKind,
      };
    });

  // Rolling 60-calendar-day close-to-close log returns. The previous sample is
  // the last observed bar at or before the exact 60-day cutoff; no bar is filled.
  let left = 0;
  drift60Day = [];
  barsPer60DaySamples = [];
  for (let i = 0; i < candles.length; i++) {
    const target = timestamps[i]! - 60 * DAY_MS;
    while (left + 1 <= i && timestamps[left + 1]! <= target) left++;
    if (target < timestamps[0]! || left >= i) continue;
    drift60Day.push(safeLogRatio(candles[i]!.close, candles[left]!.close));
    barsPer60DaySamples.push(i - left);
  }

  const trendVr8: number[] = [];
  const trendVr16: number[] = [];
  const trendAc1: number[] = [];
  for (
    let start = 0;
    start + TREND_WINDOW_BARS <= standardBars.length;
    start += TREND_WINDOW_STEP_BARS
  ) {
    const window = standardBars.slice(start, start + TREND_WINDOW_BARS);
    if (window.some((bar) => bar.calendarGapKind === "unclassified-closure")) continue;
    const stats = returnWindowStats(window.map((bar) => bar.closeReturnAtr));
    trendVr8.push(stats.varianceRatio8);
    trendVr16.push(stats.varianceRatio16);
    trendAc1.push(stats.lag1Autocorrelation);
  }

  const moments = varianceAndMoments(returns);
  const absReturnAcf: Record<string, number> = {};
  for (const lag of ABSOLUTE_RETURN_LAGS) {
    absReturnAcf[String(lag)] = autocorrelation(absoluteReturns, lag);
  }

  const hourlyVolatilityEAT = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    bars: hourlyReturns[hour]!.length,
    meanAbsoluteReturnAtr: meanOrZero(hourlyReturns[hour]!),
    meanAtrPercent: meanOrZero(hourlyAtr[hour]!),
  }));
  const dayOfWeekVolatilityEAT = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    weekdayName: WEEKDAY_NAMES[weekday]!,
    bars: weekdayReturns[weekday]!.length,
    meanAbsoluteReturnAtr: meanOrZero(weekdayReturns[weekday]!),
    meanAtrPercent: meanOrZero(weekdayAtr[weekday]!),
  }));
  const sessionVolatility = {
    asia: {
      bars: sessionRows.asia.returns.length,
      meanAbsoluteReturnAtr: meanOrZero(sessionRows.asia.returns),
      meanAtrPercent: meanOrZero(sessionRows.asia.atr),
      meanTrueRangeAtr: meanOrZero(sessionRows.asia.tr),
    },
    london: {
      bars: sessionRows.london.returns.length,
      meanAbsoluteReturnAtr: meanOrZero(sessionRows.london.returns),
      meanAtrPercent: meanOrZero(sessionRows.london.atr),
      meanTrueRangeAtr: meanOrZero(sessionRows.london.tr),
    },
    newYork: {
      bars: sessionRows.newYork.returns.length,
      meanAbsoluteReturnAtr: meanOrZero(sessionRows.newYork.returns),
      meanAtrPercent: meanOrZero(sessionRows.newYork.atr),
      meanTrueRangeAtr: meanOrZero(sessionRows.newYork.tr),
    },
  };

  const slotMeans = [...slotAbsReturns.entries()].map(([minuteOfDay, values]) => ({
    minuteOfDay,
    sampleCount: values.length,
    mean: mean(values),
  }));
  const medianSlotMean = quantile(
    slotMeans.map((slot) => slot.mean),
    0.5,
  );
  const scheduledSpikeThresholdAbsReturnAtr = medianSlotMean * (1 + SCHEDULED_SPIKE_MARGIN);
  const scheduledSpikeWindows = slotMeans
    .filter((slot) => slot.mean > scheduledSpikeThresholdAbsReturnAtr)
    .sort((a, b) => a.minuteOfDay - b.minuteOfDay)
    .map((slot) => ({
      minuteOfDay: slot.minuteOfDay,
      timeEAT: timeOfDayString(slot.minuteOfDay),
      sampleCount: slot.sampleCount,
      meanAbsoluteReturnAtr: slot.mean,
      medianSlotMean,
      fixedMarginFractionOfMedian: 0.25 as const,
    }));

  const tailEntries: Array<{
    index: number;
    returnAtr: number;
    followThroughRatio12: number;
    horizonBars: number;
  }> = [];
  for (let i = 0; i < standardBars.length; i++) {
    const current = standardBars[i]!;
    if (Math.abs(current.closeReturnAtr) <= 4) continue;
    let forward = 0;
    let horizonBars = 12;
    const direction = Math.sign(current.closeReturnAtr);
    for (let h = 1; h <= 12 && i + h < standardBars.length; h++) {
      const next = standardBars[i + h]!;
      if (next.calendarGapKind === "unclassified-closure") break;
      forward += next.closeReturnAtr * direction;
      if (forward <= 0 && horizonBars === 12) horizonBars = h;
    }
    tailEntries.push({
      index: i,
      returnAtr: current.closeReturnAtr,
      followThroughRatio12: forward / Math.abs(current.closeReturnAtr),
      horizonBars,
    });
  }
  const continuationSamples = tailEntries
    .map((entry) => entry.followThroughRatio12)
    .filter((value) => value > 0);
  const reversionSamples = tailEntries
    .map((entry) => -entry.followThroughRatio12)
    .filter((value) => value > 0);
  const horizonDistribution = Array.from(
    { length: 12 },
    (_, index) => tailEntries.filter((entry) => entry.horizonBars === index + 1).length,
  );
  const followThroughShare =
    tailEntries.length > 0
      ? tailEntries.filter((entry) => entry.followThroughRatio12 > 0).length / tailEntries.length
      : 0.5;

  const absIntradayGaps = gaps.map(Math.abs);
  const intradayGapP75 = quantile(absIntradayGaps, 0.75);
  const intradayGapP90 = quantile(absIntradayGaps, 0.9);
  const calendar = buildCalendarSummary(parsed, candles, sessionBreakDetection.breaks);
  const standardWeekBarCount = calendar.standardWeekBarCount;
  const completeWeeks = buildCompleteWeeks(
    standardBars,
    standardWeekBarCount,
    calendar.barSlotsByWeekday,
  );
  const weeklyHeavyGapCounts: number[] = [];
  for (const block of completeWeeks) {
    const weekBars = standardBars.slice(block.startBar, block.endBarExclusive);
    const count = weekBars.filter(
      (bar) => !bar.calendarGapBefore && Math.abs(bar.openGapAtr) > intradayGapP90,
    ).length;
    weeklyHeavyGapCounts.push(count);
  }
  const heavyGapFrequencyPerWeek = quantile(weeklyHeavyGapCounts, 0.9);
  const heavyIntradayGapProbability =
    standardWeekBarCount > 0 ? Math.min(1, heavyGapFrequencyPerWeek / standardWeekBarCount) : 0;

  const scheduledSlots = new Set(scheduledSpikeWindows.map((window) => window.minuteOfDay));
  const eligibleScheduledBars = standardBars.filter((bar) => scheduledSlots.has(bar.minuteOfDay));
  const scheduledEvents = eligibleScheduledBars.filter(
    (bar) => Math.abs(bar.closeReturnAtr) > scheduledSpikeThresholdAbsReturnAtr,
  ).length;
  const scheduledWeeklyRates = completeWeeks.map((block) => {
    const weekBars = standardBars.slice(block.startBar, block.endBarExclusive);
    const eligible = weekBars.filter((bar) => scheduledSlots.has(bar.minuteOfDay));
    const events = eligible.filter(
      (bar) => Math.abs(bar.closeReturnAtr) > scheduledSpikeThresholdAbsReturnAtr,
    ).length;
    return eligible.length > 0 ? events / eligible.length : 0;
  });
  const tailWeeklyRates = completeWeeks.map((block) => {
    const weekBars = standardBars.slice(block.startBar, block.endBarExclusive);
    return (
      weekBars.filter((bar) => Math.abs(bar.closeReturnAtr) > 4).length /
      Math.max(1, weekBars.length)
    );
  });
  const newsIntensity = {
    scheduledEventRatePerEligibleBar: {
      light: quantile(scheduledWeeklyRates, 0.1),
      normal: eligibleScheduledBars.length > 0 ? scheduledEvents / eligibleScheduledBars.length : 0,
      heavy: quantile(scheduledWeeklyRates, 0.9),
    },
    unscheduledShockRatePerBar: {
      light: quantile(tailWeeklyRates, 0.1),
      normal: standardBars.length > 0 ? tailEntries.length / standardBars.length : 0,
      heavy: quantile(tailWeeklyRates, 0.9),
    },
  };

  const absWeekendGaps = weekendGaps.map(Math.abs);
  const absClosureGaps = closureGaps.map(Math.abs);
  const priceValues = candles.map((candle) => candle.close);
  const sortedPriceValues = [...priceValues].sort((a, b) => a - b);
  const driftSummary = finiteSummary(drift60Day);
  const trendSummary = (values: readonly number[]) => finiteSummary(values);
  const sourceHash = hashCanonical(
    candles.map(({ datetime, open, high, low, close }) => [datetime, open, high, low, close]),
  );
  const firstDate = candles[0]!.datetime;
  const lastDate = candles[candles.length - 1]!.datetime;
  const firstWall = new Date(timestamps[0]! + 3 * 60 * 60 * 1000);
  const lastWall = new Date(timestamps[timestamps.length - 1]! + 3 * 60 * 60 * 1000);
  const years = Object.keys(yearCounts).sort();
  const tradingWeeks = new Set(parsed.map((bar) => bar.weekId)).size;
  const weekendFrequency = tradingWeeks > 0 ? weekendGaps.length / tradingWeeks : 0;
  const countOfReturnsOverFour = tailEntries.length;
  const countOfReturns = returns.length;

  // Keep only compatible modal-template weeks in the runtime donor library. All
  // summary statistics above still use every valid input candle.
  const resamplingBars: StandardizedBar[] = [];
  const resamplingBlocks: ResampleBlock[] = completeWeeks.map((block) => {
    const startBar = resamplingBars.length;
    resamplingBars.push(...standardBars.slice(block.startBar, block.endBarExclusive));
    return { ...block, startBar, endBarExclusive: resamplingBars.length };
  });
  const meanTrToAtr = mean(trueRangeToAtr);
  const barsPer60CalendarDays = Math.max(1, mean(barsPer60DaySamples));
  const calendarProfile = {
    firstWeekday: firstWall.getUTCDay(),
    lastWeekday: lastWall.getUTCDay(),
    barsByWeekday: calendar.barsByWeekday,
    barSlotsByWeekday: calendar.barSlotsByWeekday,
    weeklyScheduleVariants: calendar.weeklyScheduleVariants.map(
      ({ signature: _signature, ...variant }) => variant,
    ),
    scheduledSessionBreaks: calendar.scheduledSessionBreaks,
    missingCalendarDates: calendar.missingCalendarDates,
    longClosures: calendar.longClosures,
    standardWeekBarCount: calendar.standardWeekBarCount,
    representativeStartDate: calendar.representativeStartDate,
    unclassifiedClosureRatePerTradingDay: calendar.unclassifiedClosureRatePerTradingDay,
    note: "The primary week template is the most frequent exact Monday-Friday slot pattern; up to five recurring templates are summarized separately. Repeated non-weekend gaps of 60-240 minutes are classified as scheduled session breaks only when the exact EAT weekday/time pair and duration occur at least 40 times. All source bars and timestamps remain unchanged; other gaps are unclassified closures, not verified holidays or feed outages.",
  };

  return {
    schemaVersion: 1,
    instrument: "XAUUSD",
    timeframe: "30m",
    timestampConvention: "EAT wall-clock (UTC+03:00), no offset in CSV",
    source: {
      canonicalCandlesSha256: sourceHash,
      files: [],
      span: { start: firstDate, end: lastDate },
      barsPerYear: years.reduce<Record<string, number>>((out, year) => {
        out[year] = yearCounts[year]!;
        return out;
      }, {}),
      provenance: "user-supplied-local-data",
      coverageWarning:
        "Calibration scope must be reviewed against the requested 2020-2026 archive; calibrate() can only see the candles passed to it.",
    },
    sample: {
      bars: candles.length,
      validBars: candles.length,
      duplicateTimestamps,
      nonIncreasingTimestamps,
      ohlcInvariantViolations,
      weekdayCounts,
      price: {
        minimum: Math.min(...candles.map((candle) => candle.low)),
        maximum: Math.max(...candles.map((candle) => candle.high)),
        median: quantile(sortedPriceValues, 0.5),
        lastClose: candles[candles.length - 1]!.close,
      },
      atrMethod: "Wilder ATR(14), first value = SMA of first 14 true ranges",
      atrPercent: finiteSummary(atrPercents),
      rolling60DayDriftLogReturn: driftSummary,
      trendWindowBars: TREND_WINDOW_BARS,
      trendWindowStepBars: TREND_WINDOW_STEP_BARS,
      varianceRatio8: trendSummary(trendVr8),
      varianceRatio16: trendSummary(trendVr16),
      lag1ReturnAutocorrelation: trendSummary(trendAc1),
      standardizedReturns: {
        ...finiteSummary(returns),
        skewness: moments.skewness,
        kurtosisPearson: moments.kurtosis,
        excessKurtosis: moments.kurtosis - 3,
        autocorrelationAbsoluteReturns: absReturnAcf,
      },
      barShape: {
        rangeAtr: finiteSummary(rangeAtr),
        bodyShare: finiteSummary(bodyShares),
        upperWickShare: finiteSummary(upperWickShares),
        lowerWickShare: finiteSummary(lowerWickShares),
        closePositionInRange: finiteSummary(closePositions),
      },
      sessionVolatility,
      hourlyVolatilityEAT,
      dayOfWeekVolatilityEAT,
      scheduledSpikeWindows,
      scheduledSpikeThresholdAbsReturnAtr,
      newsIntensity,
      unscheduledShocks: {
        definition: "absolute close-to-close return > 4 prior Wilder ATR",
        count: countOfReturnsOverFour,
        frequencyPerBar: countOfReturns > 0 ? countOfReturnsOverFour / countOfReturns : 0,
        sizeAbsoluteReturnAtr: distributionForAbsolute(tailEntries.map((entry) => entry.returnAtr)),
        samples: tailEntries.map(({ returnAtr, followThroughRatio12, horizonBars }) => ({
          returnAtr,
          followThroughRatio12,
          horizonBars,
        })),
        followThroughShare,
        medianContinuationRatio: quantile(continuationSamples, 0.5),
        medianReversionRatio: quantile(reversionSamples, 0.5),
        horizonDistribution,
      },
      gaps: {
        temporalGapCount,
        duplicateOrMissing30mIntervals: missing30mIntervals,
        weekendGapCount: weekendGaps.length,
        weekendGapFrequencyPerTradingWeek: weekendFrequency,
        weekendGapLogSizeAtr: distributionForAbsolute(absWeekendGaps),
        unclassifiedClosureCount: closureGaps.length,
        unclassifiedClosureLogSizeAtr: distributionForAbsolute(absClosureGaps),
        intradayOpenGapLogSizeAtr: distributionForAbsolute(gaps),
        intradayOpenGapAbsoluteP75: intradayGapP75,
        intradayOpenGapAbsoluteP90: intradayGapP90,
        heavyIntradayGapProbability,
        heavyGapFrequencyPerWeek,
        weekendGapSamplesAtr: weekendGaps,
        unclassifiedClosureDurationsCalendarDays: closureDurations,
        intradayGapSamplesAtr: gaps,
      },
      calendar: calendarProfile,
    },
    resampling: {
      standardBars: resamplingBars,
      completeWeeks: resamplingBlocks,
      meanTrueRangeToWilderAtr: meanTrToAtr,
      barsPer60CalendarDays,
    },
  };
}
