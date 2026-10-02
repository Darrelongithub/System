import type {
  BarLabel,
  CalibrationProfile,
  Candle,
  DialName,
  DialValues,
  GenerateConfig,
  ShapeSample,
  SyntheticPath,
} from "./types";
import { createRandom, pickIndex } from "./random";
import { eatEpochForDateSlot, exchangeSlots, formatEatDatetime, weekdayDates } from "./time";
import { serializeEngineCsv } from "./csv";

const HALF_HOUR_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DIAL_NAMES: DialName[] = [
  "volatilityLevel",
  "drift",
  "trendiness",
  "gapSize",
  "newsSpikeIntensity",
];

function roundToCent(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalRandom(random: () => number): number {
  const first = Math.max(random(), Number.MIN_VALUE);
  const second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function resolveDials(profile: CalibrationProfile, supplied: Partial<DialValues> | undefined): DialValues {
  const dials: DialValues = { ...profile.defaultDials, ...supplied };
  for (const name of DIAL_NAMES) {
    if (!Number.isFinite(dials[name])) throw new Error(`${name} dial must be finite`);
  }
  if (!(dials.volatilityLevel > 0)) throw new Error("volatilityLevel must be greater than zero");
  if (Math.abs(dials.drift) > 0.25) throw new Error("drift exceeds the safe log-return range");
  if (Math.abs(dials.trendiness) >= 0.95) throw new Error("trendiness must have absolute value below 0.95");
  if (dials.gapSize < 0) throw new Error("gapSize cannot be negative");
  if (dials.newsSpikeIntensity < 0 || dials.newsSpikeIntensity > 1) {
    throw new Error("newsSpikeIntensity must be a probability in [0, 1]");
  }
  return dials;
}

function extrapolationFlags(profile: CalibrationProfile, dials: DialValues): string[] {
  const outside = DIAL_NAMES.filter((name) => {
    const band = profile.dialBands[name];
    return dials[name] < band.p10 || dials[name] > band.p90;
  });
  return outside.length ? ["EXTRAPOLATION", ...outside.map((name) => `EXTRAPOLATION:${name}`)] : [];
}

function selectTemplate(profile: CalibrationProfile, weekday: number, random: () => number) {
  const sameWeekday = profile.dayTemplates.filter((template) => template.weekday === weekday);
  const candidates = sameWeekday.length ? sameWeekday : profile.dayTemplates;
  if (candidates.length === 0) throw new Error("calibration profile has no weekday schedule templates");
  return candidates[pickIndex(random, candidates.length)]!;
}

function seasonality(profile: CalibrationProfile, epochMs: number): number {
  const slots = exchangeSlots(epochMs);
  const combined = Math.sqrt(
    profile.sourceMetrics.seasonalLondon[slots.london]! *
      profile.sourceMetrics.seasonalNewYork[slots.newYork]!,
  );
  const value = combined / profile.seasonalNormalization;
  if (!(value > 0 && Number.isFinite(value))) throw new Error("invalid exchange-local seasonal factor");
  return value;
}

function selectShape(
  profile: CalibrationProfile,
  estimatedRangeAtr: number,
  bullish: boolean,
  hasBody: boolean,
  random: () => number,
): ShapeSample {
  const bin = estimatedRangeAtr <= profile.shapeBinEdges[0]! ? 0 : estimatedRangeAtr <= profile.shapeBinEdges[1]! ? 1 : 2;
  const pool = (hasBody ? profile.nonDojiShapeBins : profile.shapeBins)[bin]!;
  if (pool.length === 0) throw new Error(`shape calibration bin ${bin} is empty`);
  const sample = pool[pickIndex(random, pool.length)]!;
  if (sample.bullish === bullish) return sample;
  return {
    ...sample,
    upperWickShare: sample.lowerWickShare,
    lowerWickShare: sample.upperWickShare,
    bullish,
  };
}

function drawGap(
  profile: CalibrationProfile,
  gapKind: BarLabel["gapKind"],
  dials: DialValues,
  atrState: number,
  previousClose: number,
  random: () => number,
): number {
  if (gapKind === "none") {
    if (profile.continuousGapPool.length === 0) return 0;
    const sample = profile.continuousGapPool[pickIndex(random, profile.continuousGapPool.length)]!;
    return sample * (atrState / previousClose);
  }
  const pool = gapKind === "weekend" ? profile.weekendGapPool : profile.sessionGapPool;
  if (pool.length === 0) throw new Error(`calibration profile has no ${gapKind} gap pool`);
  const sample = pool[pickIndex(random, pool.length)]!;
  const scale = profile.medianEventGapAtr > 0 ? dials.gapSize / profile.medianEventGapAtr : 1;
  return sample * scale * (atrState / previousClose);
}

function validateProfile(profile: CalibrationProfile): void {
  if (profile.schemaVersion !== 2) throw new Error(`unsupported synth-v2 profile version: ${profile.schemaVersion}`);
  if (!/^[a-f0-9]{64}$/i.test(profile.sourceSha256)) throw new Error("profile has no source SHA-256");
  if (profile.dayTemplates.length === 0 || profile.coreReturns.length === 0 || profile.spikeReturns.length === 0) {
    throw new Error("calibration profile is incomplete");
  }
}

export function generatePath(profile: CalibrationProfile, config: GenerateConfig): SyntheticPath {
  validateProfile(profile);
  const dials = resolveDials(profile, config.dials);
  const flags = extrapolationFlags(profile, dials);
  const dates = weekdayDates(config.startDate ?? "2026-01-05", config.weekdays ?? 120);
  const startPrice = roundToCent(config.startPrice ?? profile.sourceMetrics.medianPrice);
  if (!(startPrice > 0 && Number.isFinite(startPrice))) throw new Error("startPrice must be finite and positive");

  const scheduleRandom = createRandom(config.seed, "schedule");
  const volatilityRandom = createRandom(config.seed, "volatility");
  const returnRandom = createRandom(config.seed, "returns");
  const newsRandom = createRandom(config.seed, "news-selection");
  const gapRandom = createRandom(config.seed, "gaps");
  const shapeRandom = createRandom(config.seed, "bar-shapes");

  const templates = dates.map((date) => {
    const parts = new Date(`${date}T00:00:00Z`).getUTCDay();
    return selectTemplate(profile, parts, scheduleRandom);
  });
  let priorLogVolatility = Math.log(dials.volatilityLevel);
  let priorClose: number | undefined;
  let priorEpoch: number | undefined;
  let atrState = startPrice * profile.initialAtrPct;
  let priorInnovation = 0;
  const candles: Candle[] = [];
  const labels: BarLabel[] = [];

  for (let dayIndex = 0; dayIndex < dates.length; dayIndex++) {
    const date = dates[dayIndex]!;
    const template = templates[dayIndex]!;
    const logTarget = Math.log(dials.volatilityLevel);
    const dailyLogVolatility =
      dayIndex === 0
        ? logTarget
        : logTarget +
          profile.volatilityModel.persistence * (priorLogVolatility - logTarget) +
          profile.volatilityModel.innovationSd * normalRandom(volatilityRandom);
    const dailyVolatility = Math.exp(dailyLogVolatility);
    if (!(dailyVolatility > 0 && Number.isFinite(dailyVolatility))) {
      throw new Error(`invalid simulated daily volatility on ${date}`);
    }
    priorLogVolatility = dailyLogVolatility;
    priorInnovation = 0;
    const slots = template.slots;
    if (slots.length < 24) throw new Error(`weekday schedule template is too short: ${template.sourceDate}`);
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      const minuteOfDay = slots[slotIndex]!;
      const epochMs = eatEpochForDateSlot(date, minuteOfDay);
      const datetime = formatEatDatetime(epochMs);
      if (priorEpoch !== undefined && epochMs <= priorEpoch) {
        throw new Error(`generated timestamps are not strictly increasing at ${datetime}`);
      }
      if (slotIndex > 0 && minuteOfDay <= slots[slotIndex - 1]!) {
        throw new Error(`source schedule is duplicate or out of order for ${template.sourceDate}`);
      }
      const elapsed = priorEpoch === undefined ? 0 : epochMs - priorEpoch;
      const gapKind: BarLabel["gapKind"] =
        priorEpoch === undefined
          ? "none"
          : elapsed > DAY_MS
            ? "weekend"
            : elapsed > HALF_HOUR_MS
              ? "session"
              : "none";
      const previousClose = priorClose;
      const gapLog =
        previousClose === undefined
          ? 0
          : drawGap(profile, gapKind, dials, atrState, previousClose, gapRandom);
      const open = roundToCent(previousClose === undefined ? startPrice : previousClose * Math.exp(gapLog));
      if (!(open > 0 && Number.isFinite(open))) throw new Error(`invalid open price at ${datetime}`);

      const seasonal = seasonality(profile, epochMs);
      const spike = newsRandom() < dials.newsSpikeIntensity;
      const returnPool = spike ? profile.spikeReturns : profile.coreReturns;
      const rawInnovation = returnPool[pickIndex(returnRandom, returnPool.length)]!;
      const trendScale = Math.sqrt(1 - dials.trendiness * dials.trendiness);
      const innovation = dials.trendiness * priorInnovation + trendScale * rawInnovation;
      priorInnovation = innovation;
      const perBarDrift = dials.drift / slots.length;
      const barLogReturn = innovation * dailyVolatility * seasonal + perBarDrift;
      const close = roundToCent(open * Math.exp(barLogReturn));
      if (!(close > 0 && Number.isFinite(close))) throw new Error(`invalid close price at ${datetime}`);

      const body = Math.abs(close - open);
      const bodyAtr = body / Math.max(atrState, 0.01);
      const estimatedRangeAtr = bodyAtr / Math.max(profile.medianBodyShare, 0.05);
      const shape = selectShape(profile, estimatedRangeAtr, close >= open, body > 0, shapeRandom);
      const sampledRange = Math.max(0, shape.rangeAtr * atrState);
      const shapeBodyShare = Math.max(0.05, Math.min(1, shape.bodyShare));
      // Structural repair 1: keep the sampled body/wick proportions coupled.
      // The prior independent range floor drowned the empirical body share in extra wicks.
      const barRange = body > 0 ? Math.max(body, body / shapeBodyShare) : sampledRange;
      const wickTotal = Math.max(0, barRange - body);
      const upperPool = shape.upperWickShare + shape.lowerWickShare;
      const upperFraction = upperPool > 0 ? shape.upperWickShare / upperPool : 0.5;
      let high = roundToCent(Math.max(open, close) + wickTotal * upperFraction);
      let low = roundToCent(Math.min(open, close) - wickTotal * (1 - upperFraction));
      high = Math.max(high, open, close);
      low = Math.min(low, open, close);
      if (!(low > 0 && high >= low && Number.isFinite(high) && Number.isFinite(low))) {
        throw new Error(`bar-shape construction produced invalid OHLC at ${datetime}`);
      }

      const candle: Candle = { datetime, open, high, low, close };
      candles.push(candle);
      labels.push({
        datetime,
        dials,
        flags,
        gapKind,
        newsSpike: spike,
        dailyVolatility,
      });
      const trueRange =
        previousClose === undefined
          ? high - low
          : Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
      atrState = (atrState * 13 + trueRange) / 14;
      priorClose = close;
      priorEpoch = epochMs;
    }
  }
  const csv = serializeEngineCsv(candles);
  return { candles, labels, csv };
}
