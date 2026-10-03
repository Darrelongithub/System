export { calibrateSourceCsv } from "./calibrate";
export { createPathSchedule, generatePath, generatePathWithSchedule } from "./generate";
export { generateStage2Path, getRegimeBaseDials, REGIME_IDS, OVERLAY_IDS } from "./regimes";
export {
  addDesignPathToPairwiseAuc,
  computeCausalFeatures,
  createPairwiseAucAccumulator,
  deriveStage2Bands,
  finishPairwiseAuc,
  summarizePairwiseAuc,
  summarizeStage2Attainment,
  summarizeStage2Realism,
} from "./stage2-validation";
export { decodeStage2Artifact, encodeStage2Artifact } from "./stage2-artifacts";
export { computeMetricSet, metricRecord } from "./metrics";
export {
  assertPathInvariants,
  bootstrapRealIntervals,
  checkDials,
  compareGateMetrics,
  gateSummary,
  realWeekdayGroups,
} from "./validation";
export { parseSourceCsv, serializeEngineCsv } from "./csv";
export { parseEatDatetime, formatEatDatetime, weekdayDates } from "./time";
export { quantile } from "./random";
export type {
  BarLabel,
  CalibrationProfile,
  Candle,
  DialBand,
  DialBands,
  DialName,
  DialValues,
  GateMetric,
  GenerateConfig,
  MetricSet,
  RawCandle,
  SyntheticPath,
  ScenarioBarLabel,
  PathSchedule,
} from "./types";
export type { GenerateStage2Options, OverlayEpisode, OverlayId, PlantedSegment, Stage2Path, Stage2RegimeId, Stage2Set } from "./regimes";
export type {
  CausalFeatureVector,
  PairwiseAucAccumulator,
  PairwiseAucRow,
  RegimeAttainment,
  SegmentAttainment,
  Stage2RealBands,
} from "./stage2-validation";
export type { DecodedStage2Artifact, DecodedStage2Label } from "./stage2-artifacts";
