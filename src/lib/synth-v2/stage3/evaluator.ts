import type { Stage2BRegimeId } from "../stage2b-types";
import type { Stage2Path } from "../regimes";
import type {
  Stage3EvaluationMetrics,
  Stage3FeatureStats,
  Stage3FeatureVector,
  Stage3ModelVariant,
  Stage3WeekdaySample,
} from "./types";
import {
  STAGE3_ALL_REGIMES,
  STAGE3_HEADLINE_REGIMES,
} from "./types";
import {
  computeFeatureStats,
  computeStage3FeaturesForWeekday,
  standardizeFeatures,
  wilderAtrPercent,
} from "./features";
import {
  predictDecisionTree,
  predictMultinomialLogistic,
  Stage3HysteresisTracker,
} from "./models";

export interface PreparedPathData {
  seed: number;
  set: string;
  isAbsurd: boolean;
  totalWeekdays: number;
  samples: Stage3WeekdaySample[];
  boundaries: Array<{
    segmentIndex: number;
    startDay: number;
    endDayExclusive: number;
    targetRegime: Stage2BRegimeId;
    isHeadline: boolean;
  }>;
}

export function preparePathData(path: Stage2Path): PreparedPathData {
  const candles = path.synthetic.candles;
  const schedule = path.schedule;
  const labels = path.synthetic.labels;

  // Check absurd bars: range / close > 0.10
  let isAbsurd = false;
  for (const c of candles) {
    if ((c.high - c.low) / c.close > 0.10) {
      isAbsurd = true;
      break;
    }
  }

  const barOffsets: number[] = [0];
  for (const count of schedule.barCounts) {
    barOffsets.push(barOffsets.at(-1)! + count);
  }

  const atrPercent = wilderAtrPercent(candles);
  const totalWeekdays = schedule.barCounts.length;

  // Track boundaries
  const boundaries: PreparedPathData["boundaries"] = [];
  for (let sIdx = 1; sIdx < path.segments.length; sIdx++) {
    const seg = path.segments[sIdx]!;
    const priorSeg = path.segments[sIdx - 1]!;
    if (seg.regimeId !== priorSeg.regimeId) {
      boundaries.push({
        segmentIndex: seg.segmentIndex,
        startDay: seg.startDay,
        endDayExclusive: seg.endDayExclusive,
        targetRegime: seg.regimeId,
        isHeadline: (STAGE3_HEADLINE_REGIMES as readonly string[]).includes(seg.regimeId),
      });
    }
  }

  // Pre-calculate boundary days (first 5 weekdays after each boundary)
  const boundaryBufferDays = new Set<number>();
  for (const b of boundaries) {
    for (let d = b.startDay; d < Math.min(b.endDayExclusive, b.startDay + 5); d++) {
      boundaryBufferDays.add(d);
    }
  }

  // Compute samples for each weekday t >= 59
  const samples: Stage3WeekdaySample[] = [];

  for (let day = 59; day < totalWeekdays; day++) {
    const bStart = barOffsets[day]!;
    const bCount = schedule.barCounts[day]!;
    const lastBarOfDay = bStart + bCount - 1;
    const endLabel = labels[lastBarOfDay]!;

    let inBlend = false;
    for (let b = bStart; b <= lastBarOfDay; b++) {
      if (labels[b]!.inBlend) {
        inBlend = true;
        break;
      }
    }

    const features = computeStage3FeaturesForWeekday(candles, barOffsets, schedule.barCounts, atrPercent, day);
    const regimeId = endLabel.regimeId as Stage2BRegimeId;

    samples.push({
      pathIndex: 0,
      seed: path.seed,
      weekday: day,
      features,
      regimeId,
      inBlend,
      isBoundaryBuffer: boundaryBufferDays.has(day),
      overlays: [],
    });
  }

  return {
    seed: path.seed,
    set: path.set,
    isAbsurd,
    totalWeekdays,
    samples,
    boundaries,
  };
}

export function extractTrainingDataset(preparedPaths: readonly PreparedPathData[]): {
  X: number[][];
  y: number[];
  featureStats: Stage3FeatureStats;
} {
  const eligibleSamples: Stage3WeekdaySample[] = [];

  for (const p of preparedPaths) {
    if (p.isAbsurd) continue;
    for (const s of p.samples) {
      if (s.weekday < 60) continue; // warm-up exclusion
      if (s.inBlend) continue;      // blend exclusion
      eligibleSamples.push(s);
    }
  }

  const rawFeatures = eligibleSamples.map((s) => s.features);
  const featureStats = computeFeatureStats(rawFeatures);

  const X: number[][] = rawFeatures.map((f) => standardizeFeatures(f, featureStats));
  const y: number[] = eligibleSamples.map((s) => STAGE3_ALL_REGIMES.indexOf(s.regimeId));

  return { X, y, featureStats };
}

export function predictWeekdayProbabilities(
  model: Stage3ModelVariant,
  features: Stage3FeatureVector,
): number[] {
  const xStd = standardizeFeatures(features, model.featureStats);
  if (model.type === "multinomial_logistic") {
    return predictMultinomialLogistic(model.weights!, xStd);
  }
  if (model.type === "decision_tree") {
    return predictDecisionTree(model.treeNode!, xStd);
  }
  throw new Error(`unknown model type: ${model.type}`);
}

export function evaluateModelOnCohort(
  model: Stage3ModelVariant,
  cohortPaths: readonly PreparedPathData[],
  nullPathsForFalseSwitch: readonly PreparedPathData[],
): Stage3EvaluationMetrics {
  // Confusion matrix & counts
  const matrixAll: Record<Stage2BRegimeId, Record<Stage2BRegimeId, number>> = Object.fromEntries(
    STAGE3_ALL_REGIMES.map((trueR) => [
      trueR,
      Object.fromEntries(STAGE3_ALL_REGIMES.map((predR) => [predR, 0])) as Record<Stage2BRegimeId, number>,
    ]),
  ) as any;

  let totalScoredWeekdays = 0;
  const pathPredictedStates: Map<number, Map<number, Stage2BRegimeId>> = new Map();

  for (const p of cohortPaths) {
    if (p.isAbsurd) continue;
    const tracker = new Stage3HysteresisTracker(model.hysteresis);
    const dayMap = new Map<number, Stage2BRegimeId>();

    for (const sample of p.samples) {
      const probs = predictWeekdayProbabilities(model, sample.features);
      const stateIdx = tracker.update(probs);
      const predictedRegime = STAGE3_ALL_REGIMES[stateIdx]!;
      dayMap.set(sample.weekday, predictedRegime);

      // Accuracy scoring exclusions
      if (sample.weekday < 60) continue;        // warm-up
      if (sample.inBlend) continue;             // blend zone
      if (sample.isBoundaryBuffer) continue;    // 5-day boundary buffer

      totalScoredWeekdays++;
      matrixAll[sample.regimeId][predictedRegime]++;
    }

    pathPredictedStates.set(p.seed, dayMap);
  }

  // Compute per-class recall
  const perClassRecall = {} as Record<Stage2BRegimeId, number>;
  for (const r of STAGE3_ALL_REGIMES) {
    const row = matrixAll[r];
    const totalTrue = Object.values(row).reduce((a, b) => a + b, 0);
    const correct = row[r];
    perClassRecall[r] = totalTrue > 0 ? correct / totalTrue : 0;
  }

  // Balanced accuracy
  const headlineRecalls = STAGE3_HEADLINE_REGIMES.map((r) => perClassRecall[r]);
  const balancedAccuracyHeadline = headlineRecalls.reduce((a, b) => a + b, 0) / headlineRecalls.length;

  const allRecalls = STAGE3_ALL_REGIMES.map((r) => perClassRecall[r]);
  const balancedAccuracyAll = allRecalls.reduce((a, b) => a + b, 0) / allRecalls.length;

  // Headline confusion matrix
  const matrixHeadline: Record<Stage2BRegimeId, Record<Stage2BRegimeId, number>> = Object.fromEntries(
    STAGE3_HEADLINE_REGIMES.map((trueR) => [
      trueR,
      Object.fromEntries(STAGE3_HEADLINE_REGIMES.map((predR) => [predR, matrixAll[trueR][predR]])) as Record<
        Stage2BRegimeId,
        number
      >,
    ]),
  ) as any;

  // Detection delay (D-2)
  const delaysHeadline: number[] = [];
  let totalHeadlineBoundaries = 0;
  let detectedHeadlineBoundaries = 0;

  for (const p of cohortPaths) {
    if (p.isAbsurd) continue;
    const dayMap = pathPredictedStates.get(p.seed);
    if (!dayMap) continue;

    for (const b of p.boundaries) {
      if (!b.isHeadline) continue;
      totalHeadlineBoundaries++;

      let detectedAtDay = -1;
      for (let day = b.startDay; day + 5 <= b.endDayExclusive; day++) {
        let holdsFor5 = true;
        for (let offset = 0; offset < 5; offset++) {
          if (dayMap.get(day + offset) !== b.targetRegime) {
            holdsFor5 = false;
            break;
          }
        }
        if (holdsFor5) {
          detectedAtDay = day;
          break;
        }
      }

      if (detectedAtDay !== -1) {
        detectedHeadlineBoundaries++;
        const delay = detectedAtDay - b.startDay;
        delaysHeadline.push(delay);
      }
    }
  }

  delaysHeadline.sort((a, b) => a - b);
  const medianDelayHeadline =
    delaysHeadline.length > 0 ? delaysHeadline[Math.floor(delaysHeadline.length / 2)]! : 999;
  const shareDetectedBeforeEndHeadline =
    totalHeadlineBoundaries > 0 ? detectedHeadlineBoundaries / totalHeadlineBoundaries : 0;

  // NULL false switch rate (D-3)
  let nullHeadlineSwitches = 0;
  let nullHeadlineScoredDays = 0;

  for (const p of nullPathsForFalseSwitch) {
    if (p.isAbsurd) continue;
    // Check if NULL path regime is in headline regimes
    const pathRegime = p.samples[0]?.regimeId;
    if (!pathRegime || !(STAGE3_HEADLINE_REGIMES as readonly string[]).includes(pathRegime)) continue;

    const tracker = new Stage3HysteresisTracker(model.hysteresis);
    let prevState: number | null = null;

    for (const sample of p.samples) {
      const probs = predictWeekdayProbabilities(model, sample.features);
      const currState = tracker.update(probs);

      if (sample.weekday < 60) continue; // warm-up
      nullHeadlineScoredDays++;

      if (prevState !== null && currState !== prevState) {
        nullHeadlineSwitches++;
      }
      prevState = currState;
    }
  }

  const nullFalseSwitchRateHeadline =
    nullHeadlineScoredDays > 0 ? nullHeadlineSwitches / nullHeadlineScoredDays : 0;

  return {
    totalScoredWeekdays,
    balancedAccuracyHeadline,
    balancedAccuracyAll,
    perClassRecall,
    confusionMatrixAll: matrixAll,
    confusionMatrixHeadline: matrixHeadline,
    medianDelayHeadline,
    shareDetectedBeforeEndHeadline,
    delaysHeadline,
    nullFalseSwitchRateHeadline,
  };
}

export function computePlaceboBaseline(
  model: Stage3ModelVariant,
  cohortPaths: readonly PreparedPathData[],
  numShifts: number = 1000,
): { p95: number; mean: number } {
  // Collect actual predicted sequences for each path
  const sequences: Array<{
    days: number[];
    trueRegimes: Stage2BRegimeId[];
    predRegimes: Stage2BRegimeId[];
  }> = [];

  for (const p of cohortPaths) {
    if (p.isAbsurd) continue;
    const tracker = new Stage3HysteresisTracker(model.hysteresis);
    const days: number[] = [];
    const trueRegimes: Stage2BRegimeId[] = [];
    const predRegimes: Stage2BRegimeId[] = [];

    for (const s of p.samples) {
      const probs = predictWeekdayProbabilities(model, s.features);
      const stateIdx = tracker.update(probs);
      days.push(s.weekday);
      trueRegimes.push(s.regimeId);
      predRegimes.push(STAGE3_ALL_REGIMES[stateIdx]!);
    }

    sequences.push({ days, trueRegimes, predRegimes });
  }

  const accuracies: number[] = [];

  for (let shiftIter = 0; shiftIter < numShifts; shiftIter++) {
    const classCorrect: Record<Stage2BRegimeId, number> = Object.fromEntries(
      STAGE3_HEADLINE_REGIMES.map((r) => [r, 0]),
    ) as any;
    const classTotal: Record<Stage2BRegimeId, number> = Object.fromEntries(
      STAGE3_HEADLINE_REGIMES.map((r) => [r, 0]),
    ) as any;

    for (const seq of sequences) {
      const L = seq.predRegimes.length;
      if (L <= 20) continue;
      // Random circular shift offset in [10, L - 10]
      const delta = 10 + Math.floor(Math.random() * (L - 20));

      for (let i = 0; i < L; i++) {
        const day = seq.days[i]!;
        if (day < 60) continue; // warm-up
        const trueR = seq.trueRegimes[i]!;
        if (!(STAGE3_HEADLINE_REGIMES as readonly string[]).includes(trueR)) continue;

        const shiftedPred = seq.predRegimes[(i + delta) % L]!;
        classTotal[trueR]++;
        if (shiftedPred === trueR) classCorrect[trueR]++;
      }
    }

    const recalls = STAGE3_HEADLINE_REGIMES.map((r) => (classTotal[r] > 0 ? classCorrect[r] / classTotal[r] : 0));
    const balAcc = recalls.reduce((a, b) => a + b, 0) / recalls.length;
    accuracies.push(balAcc);
  }

  accuracies.sort((a, b) => a - b);
  const p95 = accuracies[Math.floor(0.95 * accuracies.length)]!;
  const meanVal = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
  return { p95, mean: meanVal };
}
