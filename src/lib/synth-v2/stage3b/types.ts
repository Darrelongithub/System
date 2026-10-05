import type { Stage2BRegimeId } from "../stage2b-types";

export type DialLevel3 = "LOW" | "NORMAL" | "HIGH";
export type DriftLevel3 = "DOWN" | "FLAT" | "UP";
export type TrendLevel3 = "MEAN_REVERTING" | "RANDOM" | "TRENDING";

export interface Part0Counts {
  trainTotalPaths: number;
  trainScoredPaths: number;
  trainExcludedPaths: number;
  valTotalPaths: number;
  valScoredPaths: number;
  valExcludedPaths: number;
  trainScoredDaysByRegime: Record<Stage2BRegimeId, number>;
  trainExcludedDaysByRegime: Record<Stage2BRegimeId, number>;
  valScoredDaysByRegime: Record<Stage2BRegimeId, number>;
  valExcludedDaysByRegime: Record<Stage2BRegimeId, number>;
}

export interface Part1LagBucketResult {
  bucket: string;
  n: number;
  isThin: boolean;
  headlineBalancedAccuracy: number;
  recalls: Record<Stage2BRegimeId, number>;
}

export interface Part1Results {
  buckets: Part1LagBucketResult[];
  lagCurve: Array<{ lag: number; shareCorrect: number; totalBoundaries: number }>;
}

export interface Part2Results {
  nonExcludedHeadlineBalAcc: number;
  nonExcludedRecalls: Record<Stage2BRegimeId, number>;
  excludedHeadlineBalAcc: number;
  excludedRecalls: Record<Stage2BRegimeId, number>;
  nNonExcluded: number;
  nExcluded: number;
}

export interface Part3Results {
  frozenBalAccOverall: number;
  logisticBestC: number;
  logisticBalAccOverall: number;
  ensembleBalAccOverall: number;
  byBucket: Array<{
    bucket: string;
    frozenBalAcc: number;
    logisticBalAcc: number;
    ensembleBalAcc: number;
  }>;
  verdict: "feature-limited" | "model-limited";
  reason: string;
}

export interface Part4DialResult {
  dialName: "volatility" | "drift" | "trendiness";
  classes: string[];
  logisticBalAcc: number;
  logisticRecalls: Record<string, number>;
  ensembleBalAcc: number;
  ensembleRecalls: Record<string, number>;
  byBucket: Array<{
    bucket: string;
    logisticBalAcc: number;
    ensembleBalAcc: number;
  }>;
}

export interface Part4Results {
  dials: Record<string, Part4DialResult>;
  aucs: {
    highVolVsRest: number;
    driftUpVsDriftDown: number;
    driftUpVsFlat: number;
  };
}

export interface Part5DetectabilityRegime {
  regime: Stage2BRegimeId;
  plantedDailyDrift: number;
  realizedDailyDriftMean: number;
  realizedDailyDriftSd: number;
  snrPerSqrtDay: number;
  weekdaysNeededZ2: number;
  analyticAucByN: Record<number, number>;
}

export interface Part5Results {
  driftDetectability: Part5DetectabilityRegime[];
  volatilityEmpiricalAucByN: Record<number, { lowVsNormal: number; normalVsHigh: number; lowVsHigh: number }>;
  realGoldNoiseShare: {
    definition: string;
    completedDays: number;
    rolling20MeanSpreadReal: number;
    rolling20MeanSpreadIidShuffleMean: number;
    ratioRealToIid: number;
    rolling20MeanSpreadBlockShuffleMean: number;
    ratioRealToBlock: number;
    isMostlyNoise: boolean;
  };
}

export interface AbsurdBarRecord {
  pathSeed: number;
  cohort: string;
  barIndex: number;
  datetime: string;
  slotIndex: number;
  regime: Stage2BRegimeId;
  overlays: string[];
  open: number;
  high: number;
  low: number;
  close: number;
  range: number;
  rangeOverPrice: number;
  bodyShare: number;
  upperWickShare: number;
  lowerWickShare: number;
  trailing48AtrPercent: number;
  rangeOverAtrDollars: number;
}

export interface Part6Results {
  totalAbsurdBarsDesign: number;
  totalAbsurdBarsNull: number;
  frequenciesPerMillionByRegime: Record<Stage2BRegimeId, number>;
  frequenciesPerMillionByOverlay: Record<string, number>;
  histogramOverPriceBins: Record<string, number>;
  realGoldFreqAbove3PctPerMillion: number;
  realGoldFreqAbove5PctPerMillion: number;
  generatorCodeLocation: {
    file: string;
    lines: string;
    mechanism: string;
  };
}

export interface Stage3BFullResults {
  schemaVersion: 1;
  runDate: string;
  specSha256: string;
  part0: Part0Counts;
  part1: Part1Results;
  part2: Part2Results;
  part3: Part3Results;
  part4: Part4Results;
  part5: Part5Results;
  part6: Part6Results;
}
