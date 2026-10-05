import type { Stage2BRegimeId } from "../stage2b-types";

export const STAGE3_ALL_REGIMES: readonly Stage2BRegimeId[] = [
  "quiet_range",
  "normal_chop",
  "trend_up",
  "trend_down",
  "whipsaw",
  "expansion_up",
  "expansion_down",
] as const;

export const STAGE3_HEADLINE_REGIMES: readonly Stage2BRegimeId[] = [
  "normal_chop",
  "trend_up",
  "whipsaw",
  "expansion_up",
  "expansion_down",
] as const;

export const STAGE3_EXCLUDED_REGIMES: readonly Stage2BRegimeId[] = [
  "quiet_range",
  "trend_down",
] as const;

export interface Stage3FeatureVector {
  log_atr_5: number;
  log_atr_20: number;
  log_atr_60: number;
  drift_z_10: number;
  drift_z_20: number;
  drift_z_60: number;
  vr8_20: number;
  vr16_20: number;
  vr8_60: number;
  vr16_60: number;
  max_range_atr_5: number;
  max_gap_atr_5: number;
}

export const STAGE3_FEATURE_NAMES: readonly (keyof Stage3FeatureVector)[] = [
  "log_atr_5",
  "log_atr_20",
  "log_atr_60",
  "drift_z_10",
  "drift_z_20",
  "drift_z_60",
  "vr8_20",
  "vr16_20",
  "vr8_60",
  "vr16_60",
  "max_range_atr_5",
  "max_gap_atr_5",
] as const;

export interface Stage3FeatureStats {
  means: Record<keyof Stage3FeatureVector, number>;
  sds: Record<keyof Stage3FeatureVector, number>;
}

export interface Stage3WeekdaySample {
  pathIndex: number;
  seed: number;
  weekday: number;
  features: Stage3FeatureVector;
  regimeId: Stage2BRegimeId;
  inBlend: boolean;
  isBoundaryBuffer: boolean; // within 5 weekdays of regime transition
  overlays: string[];
}

export interface Stage3HysteresisConfig {
  k: number; // 1, 3, or 5 consecutive weekdays
  d: number; // probability margin 0.0, 0.1, or 0.2
}

export interface Stage3ModelVariant {
  name: string;
  type: "multinomial_logistic" | "decision_tree";
  cParam?: number;
  maxDepth?: number;
  hysteresis: Stage3HysteresisConfig;
  weights?: number[][]; // [num_classes][num_features + 1] (including bias)
  treeNode?: Stage3TreeNode;
  featureStats: Stage3FeatureStats;
}

export interface Stage3TreeNode {
  isLeaf: boolean;
  featureIndex?: number;
  featureName?: keyof Stage3FeatureVector;
  threshold?: number;
  probabilities?: number[];
  left?: Stage3TreeNode;
  right?: Stage3TreeNode;
}

export interface Stage3EvaluationMetrics {
  totalScoredWeekdays: number;
  balancedAccuracyHeadline: number;
  balancedAccuracyAll: number;
  perClassRecall: Record<Stage2BRegimeId, number>;
  confusionMatrixAll: Record<Stage2BRegimeId, Record<Stage2BRegimeId, number>>;
  confusionMatrixHeadline: Record<Stage2BRegimeId, Record<Stage2BRegimeId, number>>;
  medianDelayHeadline: number;
  shareDetectedBeforeEndHeadline: number;
  delaysHeadline: number[];
  nullFalseSwitchRateHeadline: number;
}
