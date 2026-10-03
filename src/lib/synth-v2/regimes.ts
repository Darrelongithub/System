import { createRandom, pickIndex } from "./random";
import { createPathSchedule, generatePathWithSchedule } from "./generate";
import type {
  CalibrationProfile,
  DialName,
  DialValues,
  GenerateConfig,
  PathSchedule,
  ScenarioBarLabel,
  SyntheticPath,
} from "./types";

export const REGIME_IDS = [
  "quiet_range",
  "normal_chop",
  "trend_up",
  "trend_down",
  "whipsaw",
  "expansion_up",
  "expansion_down",
] as const;
export type Stage2RegimeId = (typeof REGIME_IDS)[number];
export type Stage2Set = "DESIGN" | "LOCKED TEST" | "NULL";
export type OverlayId = "news_storm" | "gap_shocks";
export const OVERLAY_IDS: readonly OverlayId[] = ["news_storm", "gap_shocks"];

export interface OverlayEpisode {
  overlayId: OverlayId;
  startDay: number;
  endDayExclusive: number;
}
export interface PlantedSegment {
  segmentIndex: number;
  regimeId: Stage2RegimeId;
  startDay: number;
  endDayExclusive: number;
  startBar: number;
  endBarExclusive: number;
  weekdays: number;
  baseDials: DialValues;
  blendBarsFromPrevious: number;
  overlays: OverlayEpisode[];
}
export interface Stage2Path {
  set: Stage2Set;
  seed: number;
  startDate: string;
  weekdays: number;
  segments: PlantedSegment[];
  schedule: PathSchedule;
  barDials: DialValues[];
  scenarioLabels: ScenarioBarLabel[];
  synthetic: SyntheticPath;
}
export interface GenerateStage2Options {
  seed: number;
  set: Stage2Set;
  regimeId?: Stage2RegimeId;
}

const DIAL_NAMES: readonly DialName[] = [
  "volatilityLevel",
  "drift",
  "trendiness",
  "gapSize",
  "newsSpikeIntensity",
];
const MIN_SEGMENT_WEEKDAYS = 10;
const MAX_SEGMENT_WEEKDAYS = 60;
const MIN_TRANSITION_BARS = 48;
const MAX_TRANSITION_BARS = 200;
const OVERLAY_PROBABILITY_PER_SEGMENT = 0.25;
const MIN_OVERLAY_WEEKDAYS = 2;
const MAX_OVERLAY_WEEKDAYS = 5;
const WOBBLE_FRACTION_OF_SOURCE_BAND = 0.1;

/** Base settings follow the frozen seven-regime library. Trend p10/p90 use Stage 1b's VR-constrained endpoints. */
export function getRegimeBaseDials(profile: CalibrationProfile, regimeId: Stage2RegimeId): DialValues {
  const bands = profile.dialBands;
  const lowTrend = profile.trendinessBounds?.p10 ?? bands.trendiness.p10;
  const highTrend = profile.trendinessBounds?.p90 ?? bands.trendiness.p90;
  const dials: DialValues = {
    volatilityLevel: bands.volatilityLevel.p50,
    drift: bands.drift.p50,
    trendiness: bands.trendiness.p50,
    gapSize: bands.gapSize.p50,
    newsSpikeIntensity: bands.newsSpikeIntensity.p50,
  };
  switch (regimeId) {
    case "quiet_range":
      dials.volatilityLevel = bands.volatilityLevel.p10;
      dials.trendiness = lowTrend;
      break;
    case "normal_chop":
      break;
    case "trend_up":
      dials.drift = bands.drift.p90;
      dials.trendiness = highTrend;
      break;
    case "trend_down":
      dials.drift = bands.drift.p10;
      dials.trendiness = highTrend;
      break;
    case "whipsaw":
      dials.volatilityLevel = bands.volatilityLevel.p90;
      dials.trendiness = lowTrend;
      break;
    case "expansion_up":
      dials.volatilityLevel = bands.volatilityLevel.p90;
      dials.drift = bands.drift.p90;
      dials.trendiness = highTrend;
      break;
    case "expansion_down":
      dials.volatilityLevel = bands.volatilityLevel.p90;
      dials.drift = bands.drift.p10;
      dials.trendiness = highTrend;
      break;
  }
  return dials;
}

function drawLogUniformWeekdays(random: () => number): number {
  const value = Math.exp(
    Math.log(MIN_SEGMENT_WEEKDAYS) + random() * Math.log(MAX_SEGMENT_WEEKDAYS / MIN_SEGMENT_WEEKDAYS),
  );
  return Math.max(MIN_SEGMENT_WEEKDAYS, Math.min(MAX_SEGMENT_WEEKDAYS, Math.round(value)));
}

function drawRegimeChain(seed: number): Array<{ regimeId: Stage2RegimeId; weekdays: number }> {
  const random = createRandom(seed, "stage2-segment-plan");
  const count = 3 + pickIndex(random, 4);
  const result: Array<{ regimeId: Stage2RegimeId; weekdays: number }> = [];
  for (let index = 0; index < count; index++) {
    const choices = REGIME_IDS.filter((id) => id !== result[index - 1]?.regimeId);
    result.push({ regimeId: choices[pickIndex(random, choices.length)]!, weekdays: drawLogUniformWeekdays(random) });
  }
  return result;
}

function drawOverlayEpisodes(
  seed: number,
  segments: PlantedSegment[],
  schedule: PathSchedule,
  enabled: boolean,
): void {
  if (!enabled) return;
  const random = createRandom(seed, "stage2-overlay-plan");
  const dayStarts: number[] = [];
  let barOffset = 0;
  for (const count of schedule.barCounts) {
    dayStarts.push(barOffset);
    barOffset += count;
  }
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!;
    const nextBlendBars = segments[index + 1]?.blendBarsFromPrevious ?? 0;
    const safeStartBar = segment.startBar + Math.ceil(segment.blendBarsFromPrevious / 2);
    const safeEndBar = segment.endBarExclusive - Math.floor(nextBlendBars / 2);
    const safeDays: number[] = [];
    for (let day = segment.startDay; day < segment.endDayExclusive; day++) {
      const dayStart = dayStarts[day]!;
      const dayEnd = dayStart + schedule.barCounts[day]!;
      if (dayStart >= safeStartBar && dayEnd <= safeEndBar) safeDays.push(day);
    }
    for (const overlayId of OVERLAY_IDS) {
      if (random() >= OVERLAY_PROBABILITY_PER_SEGMENT || safeDays.length < MIN_OVERLAY_WEEKDAYS) continue;
      const maxDuration = Math.min(MAX_OVERLAY_WEEKDAYS, safeDays.length);
      const duration = MIN_OVERLAY_WEEKDAYS + pickIndex(random, maxDuration - MIN_OVERLAY_WEEKDAYS + 1);
      const startOffset = pickIndex(random, safeDays.length - duration + 1);
      const startDay = safeDays[startOffset]!;
      segment.overlays.push({ overlayId, startDay, endDayExclusive: startDay + duration });
    }
  }
}

function mixDials(from: DialValues, to: DialValues, amount: number): DialValues {
  return {
    volatilityLevel: from.volatilityLevel + (to.volatilityLevel - from.volatilityLevel) * amount,
    drift: from.drift + (to.drift - from.drift) * amount,
    trendiness: from.trendiness + (to.trendiness - from.trendiness) * amount,
    gapSize: from.gapSize + (to.gapSize - from.gapSize) * amount,
    newsSpikeIntensity: from.newsSpikeIntensity + (to.newsSpikeIntensity - from.newsSpikeIntensity) * amount,
  };
}

function pickStartDate(seed: number, profile: CalibrationProfile): string {
  const random = createRandom(seed, "stage2-calendar-start");
  const template = profile.dayTemplates[pickIndex(random, profile.dayTemplates.length)];
  if (!template) throw new Error("calibration profile has no weekday schedule templates");
  return template.sourceDate;
}

function buildSegments(
  profile: CalibrationProfile,
  chain: readonly { regimeId: Stage2RegimeId; weekdays: number }[],
  schedule: PathSchedule,
): PlantedSegment[] {
  let startDay = 0;
  let startBar = 0;
  const segments: PlantedSegment[] = chain.map((item, segmentIndex) => {
    let barCount = 0;
    for (let day = 0; day < item.weekdays; day++) {
      const count = schedule.barCounts[startDay + day];
      if (count === undefined) throw new Error("segment length exceeds the generated path schedule");
      barCount += count;
    }
    const result: PlantedSegment = {
      segmentIndex,
      regimeId: item.regimeId,
      startDay,
      endDayExclusive: startDay + item.weekdays,
      startBar,
      endBarExclusive: startBar + barCount,
      weekdays: item.weekdays,
      baseDials: getRegimeBaseDials(profile, item.regimeId),
      blendBarsFromPrevious: 0,
      overlays: [],
    };
    startDay += item.weekdays;
    startBar += barCount;
    return result;
  });
  if (startDay !== schedule.dates.length || startBar !== schedule.totalBars) {
    throw new Error("segment plan does not partition the path schedule");
  }
  return segments;
}

function buildBlendWindows(seed: number, segments: PlantedSegment[]): Array<{ start: number; end: number }> {
  const random = createRandom(seed, "stage2-transition-plan");
  const windows: Array<{ start: number; end: number }> = [];
  for (let index = 1; index < segments.length; index++) {
    const previous = segments[index - 1]!;
    const current = segments[index]!;
    const previousBars = previous.endBarExclusive - previous.startBar;
    const currentBars = current.endBarExclusive - current.startBar;
    const maxWidth = Math.min(MAX_TRANSITION_BARS, Math.floor(Math.min(previousBars, currentBars) / 2));
    if (maxWidth < MIN_TRANSITION_BARS) throw new Error("segment is too short for a 48-bar transition");
    const width = MIN_TRANSITION_BARS + pickIndex(random, maxWidth - MIN_TRANSITION_BARS + 1);
    const start = current.startBar - Math.floor(width / 2);
    windows.push({ start, end: start + width });
    current.blendBarsFromPrevious = width;
  }
  return windows;
}

function overlayFlags(segment: PlantedSegment, dayIndex: number): OverlayId[] {
  return segment.overlays
    .filter((episode) => dayIndex >= episode.startDay && dayIndex < episode.endDayExclusive)
    .map((episode) => episode.overlayId);
}

function buildBarDialsAndLabels(
  profile: CalibrationProfile,
  seed: number,
  schedule: PathSchedule,
  segments: PlantedSegment[],
  blends: readonly { start: number; end: number }[],
): { barDials: DialValues[]; scenarioLabels: ScenarioBarLabel[] } {
  const totalBars = schedule.totalBars;
  const dialsByBar: DialValues[] = Array(totalBars);
  const segmentByBar: number[] = Array(totalBars);
  const blendBits = new Uint8Array(totalBars);
  for (const segment of segments) {
    for (let bar = segment.startBar; bar < segment.endBarExclusive; bar++) {
      dialsByBar[bar] = segment.baseDials;
      segmentByBar[bar] = segment.segmentIndex;
    }
  }
  for (let index = 1; index < segments.length; index++) {
    const from = segments[index - 1]!;
    const to = segments[index]!;
    const window = blends[index - 1]!;
    const length = window.end - window.start;
    for (let bar = window.start; bar < window.end; bar++) {
      const amount = (bar - window.start) / Math.max(1, length - 1);
      dialsByBar[bar] = mixDials(from.baseDials, to.baseDials, amount);
      blendBits[bar] = 1;
    }
  }

  const random = createRandom(seed, "stage2-dial-wobble");
  const knots = Object.fromEntries(DIAL_NAMES.map((name) => {
    const band = profile.dialBands[name];
    const amplitude = (band.p90 - band.p10) * WOBBLE_FRACTION_OF_SOURCE_BAND;
    return [name, Array.from({ length: schedule.dates.length + 1 }, () => (random() * 2 - 1) * amplitude)];
  })) as Record<DialName, number[]>;
  const barDials: DialValues[] = [];
  const scenarioLabels: ScenarioBarLabel[] = [];
  let barIndex = 0;
  for (let day = 0; day < schedule.dates.length; day++) {
    const slots = schedule.templates[day]!.slots;
    for (let slot = 0; slot < slots.length; slot++) {
      const segment = segments[segmentByBar[barIndex]!]!;
      const base = dialsByBar[barIndex]!;
      const fraction = slot / Math.max(1, slots.length);
      const wobble = Object.fromEntries(DIAL_NAMES.map((name) => {
        const start = knots[name][day]!;
        const end = knots[name][day + 1]!;
        return [name, start + (end - start) * fraction];
      })) as Record<DialName, number>;
      const overlays = overlayFlags(segment, day);
      const gapBase = overlays.includes("gap_shocks") ? profile.dialBands.gapSize.p90 : base.gapSize;
      const newsBase = overlays.includes("news_storm") ? profile.dialBands.newsSpikeIntensity.p90 : base.newsSpikeIntensity;
      const values: DialValues = {
        volatilityLevel: base.volatilityLevel + wobble.volatilityLevel,
        drift: base.drift + wobble.drift,
        trendiness: base.trendiness + wobble.trendiness,
        gapSize: Math.max(0, gapBase + wobble.gapSize),
        newsSpikeIntensity: Math.max(0, Math.min(1, newsBase + wobble.newsSpikeIntensity)),
      };
      if (!(values.volatilityLevel > 0)) throw new Error("wobble produced non-positive volatility");
      barDials.push(values);
      scenarioLabels.push({
        regimeId: segment.regimeId,
        segmentIndex: segment.segmentIndex,
        inBlend: blendBits[barIndex] === 1,
        overlays,
      });
      barIndex++;
    }
  }
  if (barIndex !== totalBars) throw new Error("Stage 2 label count differs from scheduled bars");
  return { barDials, scenarioLabels };
}

export function generateStage2Path(profile: CalibrationProfile, options: GenerateStage2Options): Stage2Path {
  if (!Number.isSafeInteger(options.seed) || options.seed < 0) throw new Error("Stage 2 seed must be a non-negative safe integer");
  let chain: Array<{ regimeId: Stage2RegimeId; weekdays: number }>;
  if (options.set === "NULL") {
    if (!options.regimeId) throw new Error("NULL paths require a single regime id");
    chain = [{ regimeId: options.regimeId, weekdays: 140 }];
  } else {
    if (options.regimeId) throw new Error("only NULL paths accept a fixed regime id");
    chain = drawRegimeChain(options.seed);
  }
  const weekdays = chain.reduce((total, segment) => total + segment.weekdays, 0);
  const startDate = pickStartDate(options.seed, profile);
  const config: GenerateConfig = { seed: options.seed, weekdays, startDate };
  const schedule = createPathSchedule(profile, config);
  const segments = buildSegments(profile, chain, schedule);
  const blends = buildBlendWindows(options.seed, segments);
  drawOverlayEpisodes(options.seed, segments, schedule, options.set !== "NULL");
  const { barDials, scenarioLabels } = buildBarDialsAndLabels(profile, options.seed, schedule, segments, blends);
  const synthetic = generatePathWithSchedule(profile, { ...config, barDials, scenarioLabels }, schedule);
  return { set: options.set, seed: options.seed, startDate, weekdays, segments, schedule, barDials, scenarioLabels, synthetic };
}
