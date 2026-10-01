import { DEFAULT_PROFILE } from "./profile-default";
import { SeededRandom } from "./random";
import { addCalendarDays, formatEatDatetime, parseEatDatetime, weekdayOfDate } from "./math";
import { SCENARIOS } from "./scenarios";
import type {
  ActiveDialValues,
  CalibrationProfile,
  Candle,
  EventFlag,
  RegimeLabel,
  ResampleBlock,
  ScenarioName,
  SegmentLengthDistribution,
  StandardizedBar,
  SynthConfig,
  SynthDials,
  SyntheticMeta,
  SyntheticResult,
  TrendinessDial,
  VolatilityShape,
} from "./types";

const DEFAULT_TRADING_DAYS = 120;
const DEFAULT_MIN_SEGMENT_DAYS = 20;
const DEFAULT_MAX_SEGMENT_DAYS = 60;
const DEFAULT_SHORT_SEGMENT_MAX_DAYS = 30;
const DEFAULT_TRANSITION_MIN_BARS = 48;
const DEFAULT_TRANSITION_MAX_BARS = 200;
const DEFAULT_WOBBLE_PERCENT = 0.1;
const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_HOUR_MS = 30 * 60 * 1000;
const WEEKDAY_TO_NAME: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

interface ResolvedDials {
  volatilityAtrPercent: number;
  driftLogReturn60d: number;
  targetVarianceRatio8: number;
  targetVarianceRatio16: number;
  targetLag1Autocorrelation: number;
  volatilityShape: VolatilityShape;
  trendiness: TrendinessDial;
  gaps: SynthDials["gaps"];
  news: SynthDials["news"];
  shockFollowThrough: SynthDials["shockFollowThrough"];
}

interface Segment {
  id: string;
  startBar: number;
  endBarExclusive: number;
  dials: SynthDials;
}

interface CalendarSlot {
  datetime: string;
  epochMs: number;
  date: string;
  weekday: number;
  minuteOfDay: number;
  weekId: string;
  tradingDayIndex: number;
  calendarGapBefore: boolean;
  calendarGapKind: "none" | "weekend" | "scheduled-session-break" | "unclassified-closure";
}

interface DonorWeek {
  block: ResampleBlock;
  barsBySlot: Map<string, StandardizedBar>;
  bars: StandardizedBar[];
}

interface WobbleState {
  volatility: number;
  drift: number;
  varianceRatio8: number;
  varianceRatio16: number;
  autocorrelation: number;
}

function baseScenarioDials(name: ScenarioName): SynthDials {
  const preset = SCENARIOS[name];
  if (preset.kind === "single") return { ...preset.dials };
  const fallback = SCENARIOS.normal_chop;
  if (fallback.kind !== "single")
    throw new Error("normal_chop must remain a single-condition scenario");
  return { ...fallback.dials };
}

function globalOverrides(config: SynthConfig): Partial<SynthDials> {
  const out: Partial<SynthDials> = {};
  if (config.volatility !== undefined) out.volatility = config.volatility;
  if (config.volatilityShape !== undefined) out.volatilityShape = config.volatilityShape;
  if (config.drift !== undefined) out.drift = config.drift;
  if (config.trendiness !== undefined) out.trendiness = config.trendiness;
  if (config.gaps !== undefined) out.gaps = config.gaps;
  if (config.news !== undefined) out.news = config.news;
  if (config.shockFollowThrough !== undefined) out.shockFollowThrough = config.shockFollowThrough;
  return out;
}

function percentileValue(
  value: number | string,
  distribution: CalibrationProfile["sample"]["atrPercent"],
): number {
  if (typeof value === "number") return value;
  switch (value) {
    case "low":
      return distribution.quantiles.p10;
    case "normal":
      return distribution.quantiles.p50;
    case "high":
      return distribution.quantiles.p90;
    case "p5":
      return distribution.quantiles.p5;
    default:
      throw new Error(`unsupported volatility dial: ${String(value)}`);
  }
}

function resolveDials(dials: SynthDials, profile: CalibrationProfile): ResolvedDials {
  const vol = percentileValue(dials.volatility, profile.sample.atrPercent);
  const drift =
    typeof dials.drift === "number"
      ? dials.drift
      : dials.drift === "down"
        ? profile.sample.rolling60DayDriftLogReturn.quantiles.p10
        : dials.drift === "flat"
          ? profile.sample.rolling60DayDriftLogReturn.quantiles.p50
          : profile.sample.rolling60DayDriftLogReturn.quantiles.p90;
  const percentile =
    dials.trendiness === "mean-reverting" ? 10 : dials.trendiness === "random" ? 50 : 90;
  const trendQuantileKey = percentile === 10 ? "p10" : percentile === 50 ? "p50" : "p90";
  return {
    volatilityAtrPercent: vol,
    driftLogReturn60d: drift,
    targetVarianceRatio8: profile.sample.varianceRatio8.quantiles[trendQuantileKey],
    targetVarianceRatio16: profile.sample.varianceRatio16.quantiles[trendQuantileKey],
    targetLag1Autocorrelation: profile.sample.lag1ReturnAutocorrelation.quantiles[trendQuantileKey],
    volatilityShape: dials.volatilityShape,
    trendiness: dials.trendiness,
    gaps: dials.gaps,
    news: dials.news,
    shockFollowThrough: dials.shockFollowThrough,
  };
}

function isOutside(
  value: number,
  distribution: CalibrationProfile["sample"]["atrPercent"],
): boolean {
  return value < distribution.quantiles.min || value > distribution.quantiles.max;
}

function resolveSegmentDials(dials: SynthDials, profile: CalibrationProfile): ResolvedDials {
  const result = resolveDials(dials, profile);
  if (!Number.isFinite(result.volatilityAtrPercent) || result.volatilityAtrPercent <= 0) {
    throw new Error("volatility must resolve to a finite, positive ATR/price value");
  }
  if (!Number.isFinite(result.driftLogReturn60d))
    throw new Error("drift must resolve to a finite 60-day log return");
  if (result.gaps !== "normal" && result.gaps !== "heavy")
    throw new Error(`unsupported gap dial: ${result.gaps}`);
  if (!(["light", "normal", "heavy"] as const).includes(result.news))
    throw new Error(`unsupported news dial: ${result.news}`);
  return result;
}

function defaultSlotsForWeekday(weekday: number): number[] {
  if (weekday === 0) return [];
  const start = weekday === 1 ? 180 : 0;
  const count = weekday === 6 ? 6 : weekday === 1 ? 42 : 48;
  return Array.from({ length: count }, (_, index) => start + index * 30);
}

function weekIdFor(date: string): string {
  const weekday = weekdayOfDate(date);
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addCalendarDays(date, offset);
}

function makeTimestamp(date: string, minuteOfDay: number): { datetime: string; epochMs: number } {
  const [year, month, day] = date.split("-").map(Number);
  const wallClockAsUtc = Date.UTC(
    year!,
    month! - 1,
    day!,
    Math.floor(minuteOfDay / 60),
    minuteOfDay % 60,
  );
  const epochMs = wallClockAsUtc - 3 * 60 * 60 * 1000;
  return { datetime: formatEatDatetime(epochMs), epochMs };
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

function buildCalendar(
  profile: CalibrationProfile,
  startDate: string,
  tradingDays: number,
  random: SeededRandom,
): { slots: CalendarSlot[]; sampledClosures: number } {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    parseEatDatetime(`${startDate} 00:00:00`) === undefined
  ) {
    throw new Error(`startDate must be a valid EAT date in YYYY-MM-DD form: ${startDate}`);
  }
  const slotsByWeekday = new Map<number, number[]>();
  profile.sample.calendar.barSlotsByWeekday.forEach((row, weekdayIndex) => {
    slotsByWeekday.set(
      row[0]?.weekday ?? weekdayIndex,
      row.map((slot) => slot.minuteOfDay),
    );
  });
  const scheduledSessionBreakKeys = new Set(
    profile.sample.calendar.scheduledSessionBreaks.map((gap) =>
      calendarGapKey(
        gap.previousWeekday,
        gap.previousMinuteOfDay,
        gap.nextWeekday,
        gap.nextMinuteOfDay,
        gap.gapMinutes,
      ),
    ),
  );
  const closureRate = Math.max(0, profile.sample.calendar.unclassifiedClosureRatePerTradingDay);
  const closureDurations = profile.sample.gaps.unclassifiedClosureDurationsCalendarDays.filter(
    (days) => Number.isFinite(days) && days > 0,
  );
  const slots: CalendarSlot[] = [];
  let activeTradingDays = 0;
  let currentDate = startDate;
  let closedUntil: string | undefined;
  let sampledClosures = 0;
  let previousWasOpenFriday = false;
  let lastOpenTradingDay = -1;
  let completedOnFriday = false;
  let guard = 0;

  while (activeTradingDays < tradingDays || completedOnFriday) {
    guard++;
    if (guard > tradingDays * 10 + 400)
      throw new Error("calendar generation exceeded its safety bound");
    const weekday = weekdayOfDate(currentDate);
    const isBusinessDay = weekday >= 1 && weekday <= 5;
    const isClosed = closedUntil !== undefined && currentDate < closedUntil;

    if (isBusinessDay && activeTradingDays < tradingDays && !isClosed) {
      if (closureDurations.length > 0 && random.next() < closureRate) {
        const duration = Math.max(1, Math.round(random.pick(closureDurations)));
        closedUntil = addCalendarDays(currentDate, duration);
        sampledClosures++;
      } else {
        const dayIndex = activeTradingDays;
        const daySlots = slotsByWeekday.get(weekday) ?? defaultSlotsForWeekday(weekday);
        for (const minuteOfDay of daySlots) {
          const timestamp = makeTimestamp(currentDate, minuteOfDay);
          slots.push({
            ...timestamp,
            date: currentDate,
            weekday,
            minuteOfDay,
            weekId: weekIdFor(currentDate),
            tradingDayIndex: dayIndex,
            calendarGapBefore: false,
            calendarGapKind: "none",
          });
        }
        activeTradingDays++;
        lastOpenTradingDay = dayIndex;
        previousWasOpenFriday = weekday === 5;
        if (activeTradingDays === tradingDays && weekday === 5) completedOnFriday = true;
      }
    } else if (weekday === 6 && previousWasOpenFriday && !isClosed && lastOpenTradingDay >= 0) {
      const daySlots = slotsByWeekday.get(weekday) ?? defaultSlotsForWeekday(weekday);
      for (const minuteOfDay of daySlots) {
        const timestamp = makeTimestamp(currentDate, minuteOfDay);
        slots.push({
          ...timestamp,
          date: currentDate,
          weekday,
          minuteOfDay,
          weekId: weekIdFor(currentDate),
          tradingDayIndex: lastOpenTradingDay,
          calendarGapBefore: false,
          calendarGapKind: "none",
        });
      }
      previousWasOpenFriday = false;
      if (completedOnFriday) break;
    } else if (weekday !== 5) {
      previousWasOpenFriday = false;
    }

    if (activeTradingDays >= tradingDays && !completedOnFriday) break;
    currentDate = addCalendarDays(currentDate, 1);
  }

  for (let i = 1; i < slots.length; i++) {
    const current = slots[i]!;
    const previous = slots[i - 1]!;
    const deltaMs = current.epochMs - previous.epochMs;
    if (deltaMs <= 0)
      throw new Error(`calendar timestamps are not increasing at ${current.datetime}`);
    if (deltaMs > HALF_HOUR_MS) {
      current.calendarGapBefore = true;
      const gapMinutes = deltaMs / 60_000;
      const weekend =
        current.weekday === 1 &&
        (previous.weekday === 5 || previous.weekday === 6) &&
        deltaMs <= 4 * DAY_MS;
      const scheduledSessionBreak = scheduledSessionBreakKeys.has(
        calendarGapKey(
          previous.weekday,
          previous.minuteOfDay,
          current.weekday,
          current.minuteOfDay,
          gapMinutes,
        ),
      );
      current.calendarGapKind = weekend
        ? "weekend"
        : scheduledSessionBreak
          ? "scheduled-session-break"
          : "unclassified-closure";
    }
  }
  if (slots.length === 0) throw new Error("calendar produced no candle timestamps");
  return { slots, sampledClosures };
}

function completeWeekDonors(profile: CalibrationProfile): DonorWeek[] {
  const standardBars = profile.resampling.standardBars;
  return profile.resampling.completeWeeks.map((block) => {
    const bars = standardBars.slice(block.startBar, block.endBarExclusive);
    const barsBySlot = new Map<string, StandardizedBar>();
    for (const bar of bars) barsBySlot.set(`${bar.weekday}:${bar.minuteOfDay}`, bar);
    return { block, barsBySlot, bars };
  });
}

function selectDonorWeek(
  donors: readonly DonorWeek[],
  profile: CalibrationProfile,
  target: ResolvedDials,
  random: SeededRandom,
): DonorWeek {
  if (donors.length === 0)
    throw new Error("profile has no complete, standard calendar weeks to resample");
  const vr8Spread = Math.max(
    Number.EPSILON,
    profile.sample.varianceRatio8.quantiles.p90 - profile.sample.varianceRatio8.quantiles.p10,
  );
  const vr16Spread = Math.max(
    Number.EPSILON,
    profile.sample.varianceRatio16.quantiles.p90 - profile.sample.varianceRatio16.quantiles.p10,
  );
  const acSpread = Math.max(
    Number.EPSILON,
    profile.sample.lag1ReturnAutocorrelation.quantiles.p90 -
      profile.sample.lag1ReturnAutocorrelation.quantiles.p10,
  );
  const ranked = donors
    .map((donor) => ({
      donor,
      distance:
        Math.abs(donor.block.varianceRatio8 - target.targetVarianceRatio8) / vr8Spread +
        Math.abs(donor.block.varianceRatio16 - target.targetVarianceRatio16) / vr16Spread +
        Math.abs(donor.block.lag1Autocorrelation - target.targetLag1Autocorrelation) / acSpread,
    }))
    .sort(
      (a, b) => a.distance - b.distance || a.donor.block.weekId.localeCompare(b.donor.block.weekId),
    );
  const candidateCount = Math.max(1, Math.min(ranked.length, Math.ceil(ranked.length * 0.2)));
  return random.pick(ranked.slice(0, candidateCount).map((entry) => entry.donor));
}

function setDialsForWindow(
  base: SynthDials,
  config: SynthConfig,
  custom?: Partial<SynthDials>,
): SynthDials {
  return { ...base, ...custom, ...globalOverrides(config) };
}

function barIndexForTradingDay(slots: readonly CalendarSlot[], day: number): number {
  const found = slots.findIndex((slot) => slot.tradingDayIndex >= day);
  return found < 0 ? slots.length : found;
}

function segmentSchedule(
  scenario: ScenarioName,
  config: SynthConfig,
  slots: readonly CalendarSlot[],
  tradingDays: number,
  random: SeededRandom,
): Segment[] {
  const preset = SCENARIOS[scenario];
  const base = baseScenarioDials(scenario);
  const baseWithOverrides = setDialsForWindow(base, config);

  if (config.plantedRegimes && config.plantedRegimes.length > 0) {
    const custom = config.plantedRegimes.map((window) => {
      const hasBars = window.startBar !== undefined || window.endBar !== undefined;
      const hasDays = window.startTradingDay !== undefined || window.endTradingDay !== undefined;
      if (hasBars === hasDays) {
        throw new Error(
          `planted regime ${window.id} must use exactly one complete coordinate pair`,
        );
      }
      let start: number;
      let end: number;
      if (hasBars) {
        if (window.startBar === undefined || window.endBar === undefined) {
          throw new Error(`planted regime ${window.id} needs both startBar and endBar`);
        }
        start = window.startBar;
        end = window.endBar;
      } else {
        if (window.startTradingDay === undefined || window.endTradingDay === undefined) {
          throw new Error(
            `planted regime ${window.id} needs both startTradingDay and endTradingDay`,
          );
        }
        if (
          !Number.isInteger(window.startTradingDay) ||
          !Number.isInteger(window.endTradingDay) ||
          window.startTradingDay < 0 ||
          window.endTradingDay > tradingDays ||
          window.endTradingDay <= window.startTradingDay
        ) {
          throw new Error(`planted regime ${window.id} has an invalid trading-day interval`);
        }
        start = barIndexForTradingDay(slots, window.startTradingDay);
        end = barIndexForTradingDay(slots, window.endTradingDay);
      }
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end > slots.length ||
        end <= start
      ) {
        throw new Error(`planted regime ${window.id} has an invalid bar interval`);
      }
      return {
        id: window.id,
        startBar: start,
        endBarExclusive: end,
        dials: setDialsForWindow(base, config, window.dials),
      };
    });
    custom.sort((a, b) => a.startBar - b.startBar || a.endBarExclusive - b.endBarExclusive);
    for (let i = 1; i < custom.length; i++) {
      if (custom[i]!.startBar < custom[i - 1]!.endBarExclusive) {
        throw new Error(`planted regimes ${custom[i - 1]!.id} and ${custom[i]!.id} overlap`);
      }
    }
    const complete: Segment[] = [];
    let cursor = 0;
    for (const window of custom) {
      if (cursor < window.startBar) {
        complete.push({
          id: `${scenario}:baseline`,
          startBar: cursor,
          endBarExclusive: window.startBar,
          dials: baseWithOverrides,
        });
      }
      complete.push(window);
      cursor = window.endBarExclusive;
    }
    if (cursor < slots.length) {
      complete.push({
        id: `${scenario}:baseline`,
        startBar: cursor,
        endBarExclusive: slots.length,
        dials: baseWithOverrides,
      });
    }
    return complete.length
      ? complete
      : [{ id: scenario, startBar: 0, endBarExclusive: slots.length, dials: baseWithOverrides }];
  }

  if (preset.kind === "single") {
    return [
      {
        id: scenario,
        startBar: 0,
        endBarExclusive: slots.length,
        dials: setDialsForWindow(preset.dials, config),
      },
    ];
  }

  const lengthConfig: Required<SegmentLengthDistribution> = {
    minimumTradingDays: config.segmentLengths?.minimumTradingDays ?? DEFAULT_MIN_SEGMENT_DAYS,
    maximumTradingDays: config.segmentLengths?.maximumTradingDays ?? DEFAULT_MAX_SEGMENT_DAYS,
    shortMaximumTradingDays:
      config.segmentLengths?.shortMaximumTradingDays ?? DEFAULT_SHORT_SEGMENT_MAX_DAYS,
  };
  const lengths = drawSegmentLengths(preset.segments, tradingDays, lengthConfig, random);
  let dayCursor = 0;
  return preset.segments.map((segment, index) => {
    const startTradingDay = dayCursor;
    const endTradingDay = dayCursor + lengths[index]!;
    dayCursor = endTradingDay;
    return {
      id: `${scenario}:${index + 1}:${segment.name}`,
      startBar: barIndexForTradingDay(slots, startTradingDay),
      endBarExclusive: barIndexForTradingDay(slots, endTradingDay),
      dials: setDialsForWindow(segment.dials, config),
    };
  });
}

function drawSegmentLengths(
  sourceSegments: ReadonlyArray<{ short?: boolean }>,
  total: number,
  distribution: Required<SegmentLengthDistribution>,
  random: SeededRandom,
): number[] {
  const minimum = distribution.minimumTradingDays;
  const maximum = distribution.maximumTradingDays;
  if (
    !Number.isInteger(minimum) ||
    !Number.isInteger(maximum) ||
    !Number.isInteger(distribution.shortMaximumTradingDays) ||
    minimum < 1 ||
    maximum < minimum ||
    distribution.shortMaximumTradingDays < minimum
  ) {
    throw new Error("segment length distribution must use positive ordered integer bounds");
  }
  const caps = sourceSegments.map((segment) =>
    segment.short ? Math.min(maximum, distribution.shortMaximumTradingDays) : maximum,
  );
  if (
    total < sourceSegments.length * minimum ||
    total > caps.reduce((sum, value) => sum + value, 0)
  ) {
    throw new Error(
      `pathLengthTradingDays=${total} cannot satisfy the registered segment bounds (${minimum}..${caps.join(",")})`,
    );
  }
  const lengths = sourceSegments.map(() => minimum);
  let remaining = total - lengths.reduce((sum, value) => sum + value, 0);
  const order = random.shuffle(sourceSegments.map((_, index) => index));
  while (remaining > 0) {
    let available = false;
    for (const index of order) {
      if (remaining === 0) break;
      if (lengths[index]! >= caps[index]!) continue;
      lengths[index] = lengths[index]! + 1;
      remaining--;
      available = true;
    }
    if (!available) throw new Error("segment length bounds cannot fill the requested path");
  }
  return lengths;
}

function smoothStep(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

function interpolateNumber(from: number, to: number, fraction: number): number {
  return from + (to - from) * fraction;
}

function blendResolved(from: ResolvedDials, to: ResolvedDials, fraction: number): ResolvedDials {
  const target = fraction < 0.5 ? from : to;
  return {
    volatilityAtrPercent: interpolateNumber(
      from.volatilityAtrPercent,
      to.volatilityAtrPercent,
      fraction,
    ),
    driftLogReturn60d: interpolateNumber(from.driftLogReturn60d, to.driftLogReturn60d, fraction),
    targetVarianceRatio8: interpolateNumber(
      from.targetVarianceRatio8,
      to.targetVarianceRatio8,
      fraction,
    ),
    targetVarianceRatio16: interpolateNumber(
      from.targetVarianceRatio16,
      to.targetVarianceRatio16,
      fraction,
    ),
    targetLag1Autocorrelation: interpolateNumber(
      from.targetLag1Autocorrelation,
      to.targetLag1Autocorrelation,
      fraction,
    ),
    volatilityShape: target.volatilityShape,
    trendiness: target.trendiness,
    gaps: target.gaps,
    news: target.news,
    shockFollowThrough: target.shockFollowThrough,
  };
}

function readSegmentAt(segments: readonly Segment[], index: number): Segment {
  return (
    segments.find((segment) => index >= segment.startBar && index < segment.endBarExclusive) ??
    segments[segments.length - 1]!
  );
}

function transitionDialsAt(
  segments: readonly Segment[],
  resolved: readonly ResolvedDials[],
  index: number,
  transitionBars: readonly number[],
): ResolvedDials {
  const segmentIndex = segments.findIndex(
    (segment) => index >= segment.startBar && index < segment.endBarExclusive,
  );
  const safeIndex = segmentIndex < 0 ? segments.length - 1 : segmentIndex;
  let active = resolved[safeIndex]!;
  for (let boundaryIndex = 1; boundaryIndex < segments.length; boundaryIndex++) {
    const boundary = segments[boundaryIndex]!.startBar;
    const width = transitionBars[boundaryIndex - 1] ?? 0;
    if (width <= 0) continue;
    const start = boundary - Math.floor(width / 2);
    const fraction = (index - start) / Math.max(1, width - 1);
    if (fraction >= 0 && fraction <= 1) {
      active = blendResolved(
        resolved[boundaryIndex - 1]!,
        resolved[boundaryIndex]!,
        smoothStep(fraction),
      );
      break;
    }
  }
  return active;
}

function updateWobble(state: WobbleState, random: SeededRandom): WobbleState {
  const step = (previous: number) =>
    Math.max(-1, Math.min(1, previous * 0.72 + (random.next() * 2 - 1) * 0.48));
  return {
    volatility: step(state.volatility),
    drift: step(state.drift),
    varianceRatio8: step(state.varianceRatio8),
    varianceRatio16: step(state.varianceRatio16),
    autocorrelation: step(state.autocorrelation),
  };
}

function activeDialsWithWobble(
  resolved: ResolvedDials,
  profile: CalibrationProfile,
  index: number,
  candleCount: number,
  wobblePercent: number,
  state: WobbleState,
): { active: ActiveDialValues; extrapolation: boolean } {
  const p10 = profile.sample.atrPercent.quantiles.p10;
  const p90 = profile.sample.atrPercent.quantiles.p90;
  const progress = candleCount <= 1 ? 0.5 : index / (candleCount - 1);
  let volatility = resolved.volatilityAtrPercent;
  if (resolved.volatilityShape !== "stable") {
    const lower = (resolved.volatilityAtrPercent + p10) / 2;
    const upper = (resolved.volatilityAtrPercent + p90) / 2;
    volatility =
      resolved.volatilityShape === "expanding"
        ? interpolateNumber(lower, upper, progress)
        : interpolateNumber(upper, lower, progress);
  }
  volatility *= 1 + wobblePercent * state.volatility;
  const driftSpan =
    profile.sample.rolling60DayDriftLogReturn.quantiles.p90 -
    profile.sample.rolling60DayDriftLogReturn.quantiles.p10;
  const drift = resolved.driftLogReturn60d + wobblePercent * driftSpan * state.drift;
  const vr8Span =
    profile.sample.varianceRatio8.quantiles.p90 - profile.sample.varianceRatio8.quantiles.p10;
  const vr16Span =
    profile.sample.varianceRatio16.quantiles.p90 - profile.sample.varianceRatio16.quantiles.p10;
  const acSpan =
    profile.sample.lag1ReturnAutocorrelation.quantiles.p90 -
    profile.sample.lag1ReturnAutocorrelation.quantiles.p10;
  const vr8 = resolved.targetVarianceRatio8 + wobblePercent * vr8Span * state.varianceRatio8;
  const vr16 = resolved.targetVarianceRatio16 + wobblePercent * vr16Span * state.varianceRatio16;
  const ac = resolved.targetLag1Autocorrelation + wobblePercent * acSpan * state.autocorrelation;
  const active: ActiveDialValues = {
    volatilityAtrPercent: volatility,
    driftLogReturn60d: drift,
    targetVarianceRatio8: vr8,
    targetVarianceRatio16: vr16,
    targetLag1Autocorrelation: ac,
    volatilityShape: resolved.volatilityShape,
    trendiness: resolved.trendiness,
    gaps: resolved.gaps,
    news: resolved.news,
    shockFollowThrough: resolved.shockFollowThrough,
  };
  const outside =
    isOutside(volatility, profile.sample.atrPercent) ||
    isOutside(drift, profile.sample.rolling60DayDriftLogReturn) ||
    isOutside(vr8, profile.sample.varianceRatio8) ||
    isOutside(vr16, profile.sample.varianceRatio16) ||
    isOutside(ac, profile.sample.lag1ReturnAutocorrelation);
  return { active, extrapolation: outside };
}

function quantileKeyForNews(news: SynthDials["news"]): "light" | "normal" | "heavy" {
  return news;
}

function topQuartile<T>(values: readonly T[], score: (value: T) => number): T[] {
  if (values.length === 0) return [];
  const ranked = values.map((value, index) => ({ value, index, score: score(value) }));
  ranked.sort((a, b) => a.score - b.score || a.index - b.index);
  const start = Math.floor(ranked.length * 0.75);
  return ranked.slice(start).map((entry) => entry.value);
}

function chooseTailSample(profile: CalibrationProfile, random: SeededRandom, heavy: boolean) {
  const samples = profile.sample.unscheduledShocks.samples;
  if (samples.length === 0) return undefined;
  const candidates = heavy ? topQuartile(samples, (sample) => Math.abs(sample.returnAtr)) : samples;
  return random.pick(candidates);
}

function chooseScheduledSample(
  profile: CalibrationProfile,
  minuteOfDay: number,
  random: SeededRandom,
) {
  const sourceBars = profile.resampling.standardBars.filter(
    (bar) =>
      bar.minuteOfDay === minuteOfDay &&
      Math.abs(bar.closeReturnAtr) > profile.sample.scheduledSpikeThresholdAbsReturnAtr,
  );
  const fallbackBars = profile.resampling.standardBars.filter(
    (bar) => bar.minuteOfDay === minuteOfDay,
  );
  const candidates = sourceBars.length ? sourceBars : fallbackBars;
  if (candidates.length === 0) return undefined;
  return random.pick(candidates).closeReturnAtr;
}

function chooseHorizon(
  profile: CalibrationProfile,
  random: SeededRandom,
  fallback: number,
): number {
  const counts = profile.sample.unscheduledShocks.horizonDistribution;
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total <= 0) return fallback;
  let pick = random.integer(1, total);
  for (let index = 0; index < counts.length; index++) {
    pick -= counts[index]!;
    if (pick <= 0) return index + 1;
  }
  return 12;
}

function isExtrapolation(
  active: ActiveDialValues,
  profile: CalibrationProfile,
  priceLevelOutsideObserved: boolean,
): boolean {
  return (
    priceLevelOutsideObserved ||
    isOutside(active.volatilityAtrPercent, profile.sample.atrPercent) ||
    isOutside(active.driftLogReturn60d, profile.sample.rolling60DayDriftLogReturn) ||
    isOutside(active.targetVarianceRatio8, profile.sample.varianceRatio8) ||
    isOutside(active.targetVarianceRatio16, profile.sample.varianceRatio16) ||
    isOutside(active.targetLag1Autocorrelation, profile.sample.lag1ReturnAutocorrelation)
  );
}

function validateProfile(profile: CalibrationProfile): void {
  if (profile.schemaVersion !== 1)
    throw new Error(`unsupported profile schema ${profile.schemaVersion}`);
  if (profile.resampling.standardBars.length < 100)
    throw new Error("profile is missing standardized real bars");
  if (profile.resampling.completeWeeks.length === 0)
    throw new Error("profile is missing complete weekly resampling blocks");
  if (!(profile.resampling.meanTrueRangeToWilderAtr > 0)) {
    throw new Error("profile has invalid true-range/Wilder-ATR scale calibration");
  }
}

/**
 * Generate a deterministic market from calibrated real-bar blocks. The week
 * bootstrap preserves real EAT rhythm, gaps, wick geometry, and volatility
 * clustering; target trendiness chooses empirical weeks by observed VR/ACF
 * percentiles rather than adding a synthetic trend overlay.
 */
export function generateSynthetic(
  config: SynthConfig,
  seed: number,
  profile: CalibrationProfile = DEFAULT_PROFILE,
): SyntheticResult {
  validateProfile(profile);
  const scenario = config.scenario ?? "normal_chop";
  if (!(scenario in SCENARIOS)) throw new Error(`unknown scenario: ${String(scenario)}`);
  const random = new SeededRandom(seed);
  const tradingDays = config.pathLengthTradingDays ?? DEFAULT_TRADING_DAYS;
  if (!Number.isInteger(tradingDays) || tradingDays < 1 || tradingDays > 2000) {
    throw new Error("pathLengthTradingDays must be an integer from 1 to 2000");
  }
  const minTransitionBars = config.transitionBars ?? undefined;
  if (
    minTransitionBars !== undefined &&
    (!Number.isInteger(minTransitionBars) ||
      minTransitionBars < DEFAULT_TRANSITION_MIN_BARS ||
      minTransitionBars > DEFAULT_TRANSITION_MAX_BARS)
  ) {
    throw new Error(
      `transitionBars must be between ${DEFAULT_TRANSITION_MIN_BARS} and ${DEFAULT_TRANSITION_MAX_BARS}`,
    );
  }
  const wobblePercent = config.wobblePercent ?? DEFAULT_WOBBLE_PERCENT;
  if (!Number.isFinite(wobblePercent) || wobblePercent < 0 || wobblePercent > 0.5) {
    throw new Error("wobblePercent must be finite and between 0 and 0.5");
  }
  const priceLevel = config.priceLevel ?? profile.sample.price.median;
  if (!Number.isFinite(priceLevel) || priceLevel <= 0)
    throw new Error("priceLevel must be finite and positive");
  const spreadMult = config.spreadMultPerEvent ?? 1;
  if (!Number.isFinite(spreadMult) || spreadMult < 0)
    throw new Error("spreadMultPerEvent must be finite and non-negative");

  const startDate = config.startDate ?? profile.sample.calendar.representativeStartDate;
  const calendar = buildCalendar(profile, startDate, tradingDays, random);
  const segments = segmentSchedule(scenario, config, calendar.slots, tradingDays, random);
  const resolvedSegments = segments.map((segment) => resolveSegmentDials(segment.dials, profile));
  const transitions = segments
    .slice(1)
    .map(
      () =>
        minTransitionBars ??
        random.integer(DEFAULT_TRANSITION_MIN_BARS, DEFAULT_TRANSITION_MAX_BARS),
    );
  const donors = completeWeekDonors(profile);
  const donorByWeek = new Map<string, DonorWeek>();
  const candles: Candle[] = [];
  const labels: RegimeLabel[] = [];
  const wobbleState: WobbleState = {
    volatility: 0,
    drift: 0,
    varianceRatio8: 0,
    varianceRatio16: 0,
    autocorrelation: 0,
  };
  const pendingFollowThrough = new Array<number>(calendar.slots.length).fill(0);
  const barDials: Array<{ active: ActiveDialValues; extrapolation: boolean; regimeId: string }> =
    [];
  let previousClose = priceLevel;
  let extrapolationBars = 0;
  let priorDonorWeek: DonorWeek | undefined;
  let currentDonorMeanReturnAtr = 0;
  const driftPerCalendarBar = (drift60d: number) =>
    drift60d / Math.max(1, profile.resampling.barsPer60CalendarDays);
  const priceLevelOutsideObserved =
    priceLevel < profile.sample.price.minimum || priceLevel > profile.sample.price.maximum;

  for (let index = 0; index < calendar.slots.length; index++) {
    const slot = calendar.slots[index]!;
    const segment = readSegmentAt(segments, index);
    const resolved = transitionDialsAt(segments, resolvedSegments, index, transitions);
    const nextWobble = updateWobble(wobbleState, random);
    Object.assign(wobbleState, nextWobble);
    const dialResult = activeDialsWithWobble(
      resolved,
      profile,
      index,
      calendar.slots.length,
      wobblePercent,
      wobbleState,
    );
    const active = dialResult.active;
    const extrapolation =
      dialResult.extrapolation || isExtrapolation(active, profile, priceLevelOutsideObserved);
    if (extrapolation) extrapolationBars++;
    barDials.push({ active, extrapolation, regimeId: segment.id });

    let donor = donorByWeek.get(slot.weekId);
    if (!donor) {
      donor = selectDonorWeek(donors, profile, resolved, random);
      donorByWeek.set(slot.weekId, donor);
      if (priorDonorWeek !== donor) {
        currentDonorMeanReturnAtr = donor.block.meanCloseReturnAtr;
        priorDonorWeek = donor;
      }
    }
    const donorBar = donor.barsBySlot.get(`${slot.weekday}:${slot.minuteOfDay}`);
    if (!donorBar) {
      throw new Error(
        `profile has no donor bar for observed EAT calendar slot ${WEEKDAY_TO_NAME[slot.weekday]} ${slot.datetime.slice(11, 16)}`,
      );
    }

    const targetAtrPercent = active.volatilityAtrPercent;
    const atrUnitPercent = targetAtrPercent / profile.resampling.meanTrueRangeToWilderAtr;
    if (!Number.isFinite(atrUnitPercent) || atrUnitPercent <= 0) {
      throw new Error(`invalid ATR scale at bar ${index}`);
    }
    const desiredDriftPerBar = driftPerCalendarBar(active.driftLogReturn60d);
    const driftInAtrUnits = desiredDriftPerBar / atrUnitPercent;
    let openGapAtr = donorBar.openGapAtr;
    let closeReturnAtr =
      donorBar.closeReturnAtr -
      currentDonorMeanReturnAtr +
      driftInAtrUnits +
      pendingFollowThrough[index]!;
    let eventFlag: EventFlag = "none";
    let gapFlag = slot.calendarGapBefore;

    if (
      active.gaps === "heavy" &&
      !slot.calendarGapBefore &&
      random.next() < profile.sample.gaps.heavyIntradayGapProbability
    ) {
      const candidates = topQuartile(profile.sample.gaps.intradayGapSamplesAtr, Math.abs);
      if (candidates.length > 0) {
        openGapAtr += random.pick(candidates);
        gapFlag = true;
      }
    }
    if (gapFlag) eventFlag = "gap";

    const newsKey = quantileKeyForNews(active.news);
    const unscheduledRate = profile.sample.newsIntensity.unscheduledShockRatePerBar[newsKey];
    let unscheduledSample:
      { returnAtr: number; followThroughRatio12: number; horizonBars: number } | undefined;
    if (profile.sample.unscheduledShocks.samples.length > 0 && random.next() < unscheduledRate) {
      unscheduledSample = chooseTailSample(profile, random, active.news === "heavy");
      if (unscheduledSample) {
        closeReturnAtr = unscheduledSample.returnAtr + driftInAtrUnits;
        eventFlag = "unscheduled-shock";
        const followThrough =
          active.shockFollowThrough === "mixed"
            ? random.next() < profile.sample.unscheduledShocks.followThroughShare
              ? "continue"
              : "revert"
            : active.shockFollowThrough;
        const horizon = chooseHorizon(profile, random, unscheduledSample.horizonBars);
        const rawRatio =
          followThrough === "continue"
            ? profile.sample.unscheduledShocks.medianContinuationRatio
            : Math.max(1, profile.sample.unscheduledShocks.medianReversionRatio);
        const ratio = followThrough === "continue" ? Math.max(0, rawRatio) : rawRatio;
        const direction =
          Math.sign(unscheduledSample.returnAtr) * (followThrough === "continue" ? 1 : -1);
        const amountPerBar = (Math.abs(unscheduledSample.returnAtr) * ratio) / horizon;
        for (let step = 1; step <= horizon && index + step < pendingFollowThrough.length; step++) {
          pendingFollowThrough[index + step]! += direction * amountPerBar;
        }
      }
    } else if (
      profile.sample.scheduledSpikeWindows.some(
        (window) => window.minuteOfDay === slot.minuteOfDay,
      ) &&
      random.next() < profile.sample.newsIntensity.scheduledEventRatePerEligibleBar[newsKey]
    ) {
      const scheduledReturn = chooseScheduledSample(profile, slot.minuteOfDay, random);
      if (scheduledReturn !== undefined) {
        closeReturnAtr = scheduledReturn + driftInAtrUnits;
        eventFlag = "scheduled-news";
      }
    }

    // The block's mean is removed and the calibrated 60-day drift is added as a
    // constant in return space. This keeps variance ratios and ACFs unchanged
    // by the mean adjustment while isolating the drift dial.
    const open = previousClose * Math.exp(openGapAtr * atrUnitPercent);
    const bodyReturnAtr = closeReturnAtr - openGapAtr;
    const close = open * Math.exp(bodyReturnAtr * atrUnitPercent);
    const bodyMagnitudeAtr = Math.abs(bodyReturnAtr);
    const rangeMagnitudeAtr = Math.max(donorBar.rangeAtr, bodyMagnitudeAtr);
    const remainingWickAtr = Math.max(0, rangeMagnitudeAtr - bodyMagnitudeAtr);
    const totalDonorWickShare = donorBar.upperWickShare + donorBar.lowerWickShare;
    const upperFraction =
      totalDonorWickShare > Number.EPSILON ? donorBar.upperWickShare / totalDonorWickShare : 0;
    const lowerFraction =
      totalDonorWickShare > Number.EPSILON ? donorBar.lowerWickShare / totalDonorWickShare : 0;
    const scaleDollars = previousClose * atrUnitPercent;
    const high = Math.max(open, close) + upperFraction * remainingWickAtr * scaleDollars;
    const low = Math.min(open, close) - lowerFraction * remainingWickAtr * scaleDollars;
    const candle: Candle = {
      datetime: slot.datetime,
      open,
      high,
      low,
      close,
    };
    if (
      ![candle.open, candle.high, candle.low, candle.close].every(Number.isFinite) ||
      candle.low <= 0 ||
      candle.low > candle.open ||
      candle.open > candle.high ||
      candle.low > candle.close ||
      candle.close > candle.high
    ) {
      throw new Error(`generated OHLC invariant failed at ${slot.datetime}`);
    }
    candles.push(candle);
    labels.push({
      datetime: slot.datetime,
      regimeId: segment.id,
      activeDialValues: active,
      eventFlag,
      gapFlag,
      extrapolationFlag: extrapolation,
      spreadMult: eventFlag === "none" ? 1 : spreadMult,
      spreadMultAssumption: true,
    });
    previousClose = close;
  }

  // A public invariant check is intentionally redundant with the construction
  // checks above; it protects future extensions that add candle-shape transforms.
  for (let index = 1; index < candles.length; index++) {
    const current = candles[index]!;
    const previous = candles[index - 1]!;
    if (current.datetime <= previous.datetime)
      throw new Error(`timestamps are not increasing at ${current.datetime}`);
  }
  const assumptions = [
    "Spread data is absent; spreadMult defaults to 1 and is descriptive only.",
    "Observed long calendar closure(s) cannot be distinguished from exchange holidays or data-feed outages.",
    "Weekly standardized bars are block-resampled from the calibration profile; no strategy data enters calibration.",
    `Volatility and drift wobbles are seeded at ±${(wobblePercent * 100).toFixed(1)}% (drift wobble uses 10% of the observed p10-p90 span).`,
    "A numeric dial outside the profile's observed min/max is flagged EXTRAPOLATION per bar.",
  ];
  const meta: SyntheticMeta = {
    scenario,
    seed: Math.trunc(seed),
    pathLengthTradingDays: tradingDays,
    priceLevel,
    sourceHash: profile.source.canonicalCandlesSha256,
    profileSchemaVersion: profile.schemaVersion,
    assumptions,
    calendarBars: candles.length,
    sampledCalendarClosures: calendar.sampledClosures,
    transitionBars: transitions,
    extrapolationBars,
  };
  return { candles, labels, meta };
}
