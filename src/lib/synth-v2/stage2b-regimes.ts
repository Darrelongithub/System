import { createRandom, pickIndex } from "./random";
import { createPathSchedule, generatePathWithSchedule } from "./generate";
import { stage2BExtrapolationFlags } from "./stage2b-validation";
import { STAGE2B_REGIMES } from "./stage2b-types";
import type { Stage2BRealCalibration, Stage2BRegimeId, Stage2BSet, Stage2BSettings } from "./stage2b-types";
import type { CalibrationProfile, DialName, DialValues, GenerateConfig, PathSchedule, ScenarioBarLabel } from "./types";
import type { PlantedSegment, Stage2Path } from "./regimes";

const MIN_SEGMENT_WEEKDAYS = 20;
const MAX_SEGMENT_WEEKDAYS = 80;
const MIN_TRANSITION_BARS = 48;
const MAX_TRANSITION_BARS = 200;
const OVERLAY_PROBABILITY = 0.25;
const MIN_OVERLAY_WEEKDAYS = 2;
const MAX_OVERLAY_WEEKDAYS = 5;
const WOBBLE_FRACTION = 0.1;
const DIAL_NAMES: readonly DialName[] = ["volatilityLevel", "drift", "trendiness", "gapSize", "newsSpikeIntensity"];

function percentileValue(values: { p17: number; p50: number; p83: number }, level: "LOW" | "NORMAL" | "HIGH"): number {
  return level === "LOW" ? values.p17 : level === "NORMAL" ? values.p50 : values.p83;
}

export function getStage2BSettings(calibration: Stage2BRealCalibration, regimeId: Stage2BRegimeId): Stage2BSettings {
  const definition = STAGE2B_REGIMES.find((item) => item.id === regimeId);
  if (!definition) throw new Error(`unknown Stage 2b regime ${regimeId}`);
  const { distributions, trendControls } = calibration;
  const trend = trendControls[definition.trend];
  const dials: DialValues = {
    volatilityLevel: percentileValue(distributions.atrPercent, definition.volatility),
    drift: percentileValue(distributions.drift, definition.drift),
    trendiness: trend.phi,
    gapSize: distributions.gapSize.p50,
    newsSpikeIntensity: distributions.newsSpikeIntensity.p50,
  };
  const wobbleWidths: DialValues = {
    volatilityLevel: distributions.atrPercent.p83 - distributions.atrPercent.p17,
    drift: distributions.drift.p83 - distributions.drift.p17,
    trendiness: trendControls.HIGH.phi - trendControls.LOW.phi,
    gapSize: distributions.gapSize.p83 - distributions.gapSize.p17,
    newsSpikeIntensity: distributions.newsSpikeIntensity.p83 - distributions.newsSpikeIntensity.p17,
  };
  if (wobbleWidths.trendiness < 0) throw new Error("Stage 2b trend-control p83 must exceed p17");
  return {
    regimeId,
    levels: { volatility: definition.volatility, drift: definition.drift, trend: definition.trend },
    planted: {
      atrPercent: percentileValue(distributions.atrPercent, definition.volatility),
      drift: percentileValue(distributions.drift, definition.drift),
      varianceRatio8: trend.targetVR8,
      varianceRatio16: trend.targetVR16,
    },
    wobbleWidths,
    overlayHighs: {
      gapSize: distributions.gapSize.p90,
      newsSpikeIntensity: distributions.newsSpikeIntensity.p90,
    },
    dials,
  };
}

function drawLogUniformWeekdays(random: () => number): number {
  const sampled = Math.exp(Math.log(MIN_SEGMENT_WEEKDAYS) + random() * Math.log(MAX_SEGMENT_WEEKDAYS / MIN_SEGMENT_WEEKDAYS));
  return Math.max(MIN_SEGMENT_WEEKDAYS, Math.min(MAX_SEGMENT_WEEKDAYS, Math.round(sampled)));
}

function drawRegimeChain(seed: number): Array<{ regimeId: Stage2BRegimeId; weekdays: number }> {
  const random = createRandom(seed, "stage2b-segment-plan");
  const count = 3 + pickIndex(random, 4);
  const result: Array<{ regimeId: Stage2BRegimeId; weekdays: number }> = [];
  for (let index = 0; index < count; index++) {
    const choices = STAGE2B_REGIMES.map((item) => item.id).filter((id) => id !== result[index - 1]?.regimeId);
    result.push({ regimeId: choices[pickIndex(random, choices.length)]!, weekdays: drawLogUniformWeekdays(random) });
  }
  return result;
}

function pickStartDate(seed: number, profile: CalibrationProfile): string {
  const random = createRandom(seed, "stage2b-calendar-start");
  const template = profile.dayTemplates[pickIndex(random, profile.dayTemplates.length)];
  if (!template) throw new Error("calibration profile has no weekday schedule templates");
  return template.sourceDate;
}

function buildSegments(
  settings: ReadonlyMap<Stage2BRegimeId, Stage2BSettings>,
  chain: readonly { regimeId: Stage2BRegimeId; weekdays: number }[],
  schedule: PathSchedule,
): PlantedSegment[] {
  let startDay = 0;
  let startBar = 0;
  const segments = chain.map((item, segmentIndex): PlantedSegment => {
    let barCount = 0;
    for (let day = 0; day < item.weekdays; day++) {
      const count = schedule.barCounts[startDay + day];
      if (count === undefined) throw new Error("Stage 2b segment exceeds its path schedule");
      barCount += count;
    }
    const setting = settings.get(item.regimeId);
    if (!setting) throw new Error(`Stage 2b settings missing for ${item.regimeId}`);
    const segment: PlantedSegment = {
      segmentIndex,
      regimeId: item.regimeId,
      startDay,
      endDayExclusive: startDay + item.weekdays,
      startBar,
      endBarExclusive: startBar + barCount,
      weekdays: item.weekdays,
      baseDials: setting.dials,
      blendBarsFromPrevious: 0,
      overlays: [],
    };
    startDay += item.weekdays;
    startBar += barCount;
    return segment;
  });
  if (startDay !== schedule.dates.length || startBar !== schedule.totalBars) throw new Error("Stage 2b segments do not partition the schedule");
  return segments;
}

function buildBlendWindows(seed: number, segments: PlantedSegment[]): Array<{ start: number; end: number }> {
  const random = createRandom(seed, "stage2b-transition-plan");
  const windows: Array<{ start: number; end: number }> = [];
  for (let index = 1; index < segments.length; index++) {
    const previous = segments[index - 1]!;
    const current = segments[index]!;
    const previousBars = previous.endBarExclusive - previous.startBar;
    const currentBars = current.endBarExclusive - current.startBar;
    const maximum = Math.min(MAX_TRANSITION_BARS, Math.floor(Math.min(previousBars, currentBars) / 2));
    if (maximum < MIN_TRANSITION_BARS) throw new Error("Stage 2b segment is too short for a 48-bar blend");
    const width = MIN_TRANSITION_BARS + pickIndex(random, maximum - MIN_TRANSITION_BARS + 1);
    const start = current.startBar - Math.floor(width / 2);
    windows.push({ start, end: start + width });
    current.blendBarsFromPrevious = width;
  }
  return windows;
}

function drawOverlayEpisodes(
  seed: number,
  segments: PlantedSegment[],
  schedule: PathSchedule,
  enabled: boolean,
): void {
  if (!enabled) return;
  const random = createRandom(seed, "stage2b-overlay-plan");
  const dayStarts: number[] = [];
  let offset = 0;
  for (const count of schedule.barCounts) {
    dayStarts.push(offset);
    offset += count;
  }
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!;
    const nextBlend = segments[index + 1]?.blendBarsFromPrevious ?? 0;
    const safeStart = segment.startBar + Math.ceil(segment.blendBarsFromPrevious / 2);
    const safeEnd = segment.endBarExclusive - Math.floor(nextBlend / 2);
    const safeDays: number[] = [];
    for (let day = segment.startDay; day < segment.endDayExclusive; day++) {
      const dayStart = dayStarts[day]!;
      const dayEnd = dayStart + schedule.barCounts[day]!;
      if (dayStart >= safeStart && dayEnd <= safeEnd) safeDays.push(day);
    }
    for (const overlayId of ["news_storm", "gap_shocks"] as const) {
      if (random() >= OVERLAY_PROBABILITY || safeDays.length < MIN_OVERLAY_WEEKDAYS) continue;
      const maximum = Math.min(MAX_OVERLAY_WEEKDAYS, safeDays.length);
      const duration = MIN_OVERLAY_WEEKDAYS + pickIndex(random, maximum - MIN_OVERLAY_WEEKDAYS + 1);
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

function overlayFlags(segment: PlantedSegment, dayIndex: number): string[] {
  return segment.overlays
    .filter((episode) => dayIndex >= episode.startDay && dayIndex < episode.endDayExclusive)
    .map((episode) => episode.overlayId);
}

function buildBarDialsAndLabels(
  seed: number,
  schedule: PathSchedule,
  segments: PlantedSegment[],
  blends: readonly { start: number; end: number }[],
  settings: ReadonlyMap<Stage2BRegimeId, Stage2BSettings>,
): { barDials: DialValues[]; scenarioLabels: ScenarioBarLabel[]; blendBits: Uint8Array } {
  const dialsByBar: DialValues[] = Array(schedule.totalBars);
  const segmentByBar: number[] = Array(schedule.totalBars);
  const blendBits = new Uint8Array(schedule.totalBars);
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
      dialsByBar[bar] = mixDials(from.baseDials, to.baseDials, (bar - window.start) / Math.max(1, length - 1));
      blendBits[bar] = 1;
    }
  }
  const random = createRandom(seed, "stage2b-dial-wobble");
  const knots = Object.fromEntries(DIAL_NAMES.map((name) => {
    const widths = [...settings.values()].map((item) => item.wobbleWidths[name]);
    const width = widths[0] ?? 0;
    if (widths.some((value) => Math.abs(value - width) > 1e-12)) throw new Error(`inconsistent Stage 2b wobble width for ${name}`);
    const amplitude = WOBBLE_FRACTION * width;
    return [name, Array.from({ length: schedule.dates.length + 1 }, () => (random() * 2 - 1) * amplitude)];
  })) as Record<DialName, number[]>;
  const barDials: DialValues[] = [];
  const scenarioLabels: ScenarioBarLabel[] = [];
  let barIndex = 0;
  for (let day = 0; day < schedule.dates.length; day++) {
    const slots = schedule.templates[day]!.slots;
    for (let slot = 0; slot < slots.length; slot++) {
      const segment = segments[segmentByBar[barIndex]!]!;
      const settingsForRegime = settings.get(segment.regimeId)!;
      const base = dialsByBar[barIndex]!;
      const fraction = slot / Math.max(1, slots.length);
      const wobble = Object.fromEntries(DIAL_NAMES.map((name) => {
        const start = knots[name][day]!;
        const end = knots[name][day + 1]!;
        return [name, start + (end - start) * fraction];
      })) as Record<DialName, number>;
      const overlays = overlayFlags(segment, day);
      const gapBase = overlays.includes("gap_shocks") ? settingsForRegime.overlayHighs.gapSize : base.gapSize;
      const newsBase = overlays.includes("news_storm") ? settingsForRegime.overlayHighs.newsSpikeIntensity : base.newsSpikeIntensity;
      const values: DialValues = {
        volatilityLevel: base.volatilityLevel + wobble.volatilityLevel,
        drift: base.drift + wobble.drift,
        trendiness: base.trendiness + wobble.trendiness,
        gapSize: Math.max(0, gapBase + wobble.gapSize),
        newsSpikeIntensity: Math.max(0, Math.min(1, newsBase + wobble.newsSpikeIntensity)),
      };
      if (!(values.volatilityLevel > 0)) throw new Error("Stage 2b wobble produced non-positive volatility");
      if (Math.abs(values.drift) > 0.25) throw new Error("Stage 2b wobble exceeded the unchanged Stage 1b safe drift range");
      if (Math.abs(values.trendiness) >= 0.95) throw new Error("Stage 2b wobble exceeded the unchanged Stage 1b trendiness limit");
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
  if (barIndex !== schedule.totalBars) throw new Error("Stage 2b dial/label count differs from schedule");
  return { barDials, scenarioLabels, blendBits };
}

export interface GenerateStage2BOptions {
  seed: number;
  set: Stage2BSet;
  regimeId?: Stage2BRegimeId;
}

export function generateStage2BPath(
  profile: CalibrationProfile,
  calibration: Stage2BRealCalibration,
  options: GenerateStage2BOptions,
): Stage2Path {
  if (!Number.isSafeInteger(options.seed) || options.seed < 0) throw new Error("Stage 2b seed must be a non-negative safe integer");
  let chain: Array<{ regimeId: Stage2BRegimeId; weekdays: number }>;
  if (options.set === "NULL") {
    if (!options.regimeId) throw new Error("Stage 2b NULL path requires a regime id");
    chain = [{ regimeId: options.regimeId, weekdays: 140 }];
  } else {
    if (options.regimeId) throw new Error("only Stage 2b NULL paths accept a fixed regime id");
    chain = drawRegimeChain(options.seed);
  }
  const settings = new Map(STAGE2B_REGIMES.map(({ id }) => [id, getStage2BSettings(calibration, id)] as const));
  const weekdays = chain.reduce((sum, segment) => sum + segment.weekdays, 0);
  const startDate = pickStartDate(options.seed, profile);
  const config: GenerateConfig = { seed: options.seed, weekdays, startDate };
  const schedule = createPathSchedule(profile, config);
  const segments = buildSegments(settings, chain, schedule);
  const blends = buildBlendWindows(options.seed, segments);
  drawOverlayEpisodes(options.seed, segments, schedule, options.set !== "NULL");
  const { barDials, scenarioLabels, blendBits } = buildBarDialsAndLabels(options.seed, schedule, segments, blends, settings);
  const synthetic = generatePathWithSchedule(profile, { ...config, barDials, scenarioLabels }, schedule);
  for (let index = 0; index < synthetic.labels.length; index++) {
    synthetic.labels[index]!.flags = stage2BExtrapolationFlags(barDials[index]!, calibration);
    synthetic.labels[index]!.inBlend = blendBits[index] === 1;
    synthetic.labels[index]!.regimeId = scenarioLabels[index]!.regimeId;
    synthetic.labels[index]!.segmentIndex = scenarioLabels[index]!.segmentIndex;
    synthetic.labels[index]!.overlayFlags = [...scenarioLabels[index]!.overlays];
    synthetic.labels[index]!.dials = { ...barDials[index]! };
  }
  return { set: options.set, seed: options.seed, startDate, weekdays, segments, schedule, barDials, scenarioLabels, synthetic };
}
