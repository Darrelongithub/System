import type { DialValues } from "./types";

export const STAGE2B_REGIMES = [
  { id: "quiet_range", volatility: "LOW", drift: "NORMAL", trend: "LOW" },
  { id: "normal_chop", volatility: "NORMAL", drift: "NORMAL", trend: "NORMAL" },
  { id: "trend_up", volatility: "NORMAL", drift: "HIGH", trend: "HIGH" },
  { id: "trend_down", volatility: "NORMAL", drift: "LOW", trend: "HIGH" },
  { id: "whipsaw", volatility: "HIGH", drift: "NORMAL", trend: "LOW" },
  { id: "expansion_up", volatility: "HIGH", drift: "HIGH", trend: "HIGH" },
  { id: "expansion_down", volatility: "HIGH", drift: "LOW", trend: "HIGH" },
] as const;

export type Stage2BRegimeId = (typeof STAGE2B_REGIMES)[number]["id"];
export type Stage2BLevel = "LOW" | "NORMAL" | "HIGH";
export type Stage2BMetric = "atrPercent" | "drift" | "varianceRatio8" | "varianceRatio16";
export type Stage2BAuxMetric = "gapSize" | "newsSpikeIntensity";
export type Stage2BAnyMetric = Stage2BMetric | Stage2BAuxMetric;
export type Stage2BSet = "DESIGN" | "LOCKED TEST" | "NULL";

export interface Stage2BDistribution {
  p5: number;
  p17: number;
  p33: number;
  p50: number;
  p67: number;
  p83: number;
  p90: number;
  p95: number;
  samples: number;
}

export interface Stage2BWindowStats {
  atrPercent: number;
  drift: number;
  varianceRatio8: number;
  varianceRatio16: number;
  gapSize: number;
  newsSpikeIntensity: number;
}

export interface Stage2BRealCeiling {
  n: number;
  ceiling: number;
  thin: boolean;
}

export interface Stage2BTrendControl {
  phi: number;
  targetVR8: number;
  targetVR16: number;
  achievedVR8: number;
  achievedVR16: number;
  normalizedSquaredError: number;
}

export interface Stage2CVolatilityMap {
  p5: number;
  p17: number;
  p33: number;
  p50: number;
  p67: number;
  p83: number;
  p90: number;
  p95: number;
  wobbleWidth: number;
  grid: Array<{ dial: number; realizedMedianAtr: number; p10: number; p90: number }>;
  calibrationSeeds: { start: number; count: number; weekdays: number };
}

export interface Stage2BRealCalibration {
  schemaVersion: 1;
  sourceSha256: string;
  profileSha256: string;
  specSha256: string;
  windowWeekdays: 20;
  quantileMethod: "linear-(n-1)*p";
  sourceWindowCount: number;
  sourceStretchCount: number;
  distributions: Record<Stage2BAnyMetric, Stage2BDistribution>;
  volatilityMap?: Stage2CVolatilityMap;
  realCeilings: Record<Stage2BMetric, Record<Stage2BLevel, Stage2BRealCeiling>>;
  trendControls: Record<Stage2BLevel, Stage2BTrendControl>;
  newsStandardization: {
    residualMean: number;
    residualSd: number;
    tailThreshold: number;
  };
}

export interface Stage2BSettings {
  regimeId: Stage2BRegimeId;
  levels: { volatility: Stage2BLevel; drift: Stage2BLevel; trend: Stage2BLevel };
  planted: Pick<Stage2BWindowStats, "atrPercent" | "drift" | "varianceRatio8" | "varianceRatio16">;
  wobbleWidths: DialValues;
  overlayHighs: Pick<DialValues, "gapSize" | "newsSpikeIntensity">;
  dials: DialValues;
}

export interface Stage2BWindowRecord extends Stage2BWindowStats {
  set: "DESIGN" | "NULL";
  seed: number;
  regimeId: Stage2BRegimeId;
  segmentIndex: number;
  startDate: string;
}

export interface Stage2BMetricCheck {
  metric: Stage2BMetric;
  intendedLevel: Stage2BLevel;
  plantedSetting: number;
  realizedMedian: number | null;
  windowCount: number;
  realTercileCeiling: number | null;
  realStretchCount: number;
  thin: boolean;
  realizedTercileShare: number | null;
  c1Difference: number | null;
  c1Status: "PASS" | "TOO CLEAN" | "TOO NOISY" | "THIN" | "NO_WINDOWS";
  c2NormalizedError: number | null;
  c2Status: "PASS" | "FAIL" | "NO_WINDOWS";
  c3Status: "PASS" | "FAIL";
}

export interface Stage2BRegimeCheck {
  regimeId: Stage2BRegimeId;
  windowCount: number;
  metricChecks: Record<Stage2BMetric, Stage2BMetricCheck>;
  status: "PASS" | "DEGRADED";
  degradedReasons: string[];
}

export interface Stage2BCausalFeatures {
  rolling48AtrPercent?: number;
  rolling48DriftZ?: number;
  rolling48VarianceRatio8?: number;
  rolling48VarianceRatio16?: number;
}

export interface Stage2BPairwiseAucRow {
  regimeA: Stage2BRegimeId;
  regimeB: Stage2BRegimeId;
  sampleCountA: number;
  sampleCountB: number;
  featureAucs: Record<keyof Stage2BCausalFeatures, number>;
  bestFeature: keyof Stage2BCausalFeatures;
  bestSingleFeatureAuc: number;
  status: "SEPARABLE" | "INSEPARABLE";
}
