import type {
  RegimeDetectorOptions,
  RegimeFeatureGroup,
  RegimeLookbacks,
  RegimeThresholds,
  ResolvedRegimeDetectorConfig,
} from "./types";

export const DEFAULT_REGIME_LOOKBACKS: RegimeLookbacks = {
  adx: [14, 20],
  atr: [14, 20],
  movingAverages: [20, 50, 100, 200],
  efficiency: [10, 14, 20, 30],
  regression: [20, 50],
  adxSlope: 5,
  atrReference: 50,
  realizedVolatility: [10, 20, 50],
  volatilityEstimator: 20,
  bollinger: 20,
  keltner: 20,
  trueRangePercentile: 100,
  volatilityOfVolatility: 20,
  hurst: 50,
  autocorrelation: 50,
  varianceRatio: 50,
  varianceRatioHorizon: 5,
  candleOverlap: 20,
  volume: 20,
  distribution: 50,
  rangePercentile: 50,
  swingStrength: 3,
  structureWindow: 50,
};

export const DEFAULT_REGIME_THRESHOLDS: RegimeThresholds = {
  trendAdxMin: 20,
  trendAdxStrong: 35,
  trendEfficiencyMin: 0.28,
  trendEfficiencyStrong: 0.6,
  trendDirectionalMin: 0.58,
  trendSlopeAtrPerBar: 0.04,
  rangeAdxMax: 18,
  rangeEfficiencyMax: 0.25,
  highVolatilityPercentile: 0.85,
  highVolatilityAtrRatio: 1.35,
  highVolatilityRangeRatio: 1.2,
  compressionPercentile: 0.2,
  compressionRangeRatio: 0.8,
  compressionAtrRatio: 0.8,
  minimumConfidence: 0.5,
};

export const DEFAULT_ENABLED_FEATURES: Record<RegimeFeatureGroup, boolean> = {
  trend: true,
  efficiency: true,
  volatility: true,
  persistence: true,
  candleGeometry: true,
  volume: true,
  distribution: true,
};

const ARRAY_LOOKBACK_KEYS = [
  "adx",
  "atr",
  "movingAverages",
  "efficiency",
  "regression",
  "realizedVolatility",
] as const satisfies readonly (keyof RegimeLookbacks)[];

const SCALAR_LOOKBACK_KEYS = [
  "adxSlope",
  "atrReference",
  "volatilityEstimator",
  "bollinger",
  "keltner",
  "trueRangePercentile",
  "volatilityOfVolatility",
  "hurst",
  "autocorrelation",
  "varianceRatio",
  "varianceRatioHorizon",
  "candleOverlap",
  "volume",
  "distribution",
  "rangePercentile",
  "swingStrength",
  "structureWindow",
] as const satisfies readonly (keyof RegimeLookbacks)[];

function validatePeriod(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer; received ${String(value)}`);
  }
}

function validateUnitInterval(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be finite and in [0, 1]; received ${String(value)}`);
  }
}

/** Merge, clone and validate all detector settings at the public API boundary. */
export function resolveRegimeDetectorConfig(
  options: RegimeDetectorOptions = {},
): ResolvedRegimeDetectorConfig {
  const lookbacks: RegimeLookbacks = {
    ...DEFAULT_REGIME_LOOKBACKS,
    ...options.lookbacks,
    adx: [...(options.lookbacks?.adx ?? DEFAULT_REGIME_LOOKBACKS.adx)],
    atr: [...(options.lookbacks?.atr ?? DEFAULT_REGIME_LOOKBACKS.atr)],
    movingAverages: [
      ...(options.lookbacks?.movingAverages ?? DEFAULT_REGIME_LOOKBACKS.movingAverages),
    ],
    efficiency: [...(options.lookbacks?.efficiency ?? DEFAULT_REGIME_LOOKBACKS.efficiency)],
    regression: [...(options.lookbacks?.regression ?? DEFAULT_REGIME_LOOKBACKS.regression)],
    realizedVolatility: [
      ...(options.lookbacks?.realizedVolatility ?? DEFAULT_REGIME_LOOKBACKS.realizedVolatility),
    ],
  };
  const thresholds: RegimeThresholds = {
    ...DEFAULT_REGIME_THRESHOLDS,
    ...options.thresholds,
  };
  const enabledFeatures: Record<RegimeFeatureGroup, boolean> = {
    ...DEFAULT_ENABLED_FEATURES,
    ...options.enabledFeatures,
  };

  for (const key of ARRAY_LOOKBACK_KEYS) {
    const periods = lookbacks[key];
    if (periods.length === 0) throw new RangeError(`lookbacks.${key} cannot be empty`);
    const seen = new Set<number>();
    for (const period of periods) {
      validatePeriod(period, `lookbacks.${key} period`);
      if (seen.has(period))
        throw new RangeError(`lookbacks.${key} contains duplicate period ${period}`);
      seen.add(period);
    }
    periods.sort((a, b) => a - b);
  }
  for (const key of SCALAR_LOOKBACK_KEYS) {
    validatePeriod(lookbacks[key], `lookbacks.${key}`);
  }
  if (lookbacks.hurst < 16) {
    throw new RangeError("lookbacks.hurst must be at least 16 bars for a usable scale estimate");
  }
  if (lookbacks.varianceRatio <= lookbacks.varianceRatioHorizon) {
    throw new RangeError("lookbacks.varianceRatio must exceed its varianceRatioHorizon");
  }

  const positiveThresholds: Array<keyof RegimeThresholds> = [
    "trendAdxMin",
    "trendAdxStrong",
    "trendSlopeAtrPerBar",
    "highVolatilityAtrRatio",
    "highVolatilityRangeRatio",
    "compressionRangeRatio",
    "compressionAtrRatio",
  ];
  for (const key of positiveThresholds) {
    if (!Number.isFinite(thresholds[key]) || thresholds[key] <= 0) {
      throw new RangeError(`thresholds.${key} must be finite and greater than zero`);
    }
  }
  const unitThresholds: Array<keyof RegimeThresholds> = [
    "trendEfficiencyMin",
    "trendEfficiencyStrong",
    "trendDirectionalMin",
    "rangeEfficiencyMax",
    "highVolatilityPercentile",
    "compressionPercentile",
    "minimumConfidence",
  ];
  for (const key of unitThresholds) validateUnitInterval(thresholds[key], `thresholds.${key}`);
  if (thresholds.trendAdxStrong <= thresholds.trendAdxMin) {
    throw new RangeError("thresholds.trendAdxStrong must exceed trendAdxMin");
  }
  if (
    !Number.isFinite(thresholds.rangeAdxMax) ||
    thresholds.rangeAdxMax < 0 ||
    thresholds.rangeAdxMax >= thresholds.trendAdxMin
  ) {
    throw new RangeError("thresholds.rangeAdxMax must be non-negative and below trendAdxMin");
  }
  if (thresholds.trendEfficiencyStrong <= thresholds.trendEfficiencyMin) {
    throw new RangeError("thresholds.trendEfficiencyStrong must exceed trendEfficiencyMin");
  }
  if (thresholds.trendDirectionalMin <= 0.5) {
    throw new RangeError("thresholds.trendDirectionalMin must exceed 0.5 to require a direction");
  }
  if (thresholds.rangeEfficiencyMax > thresholds.trendEfficiencyMin) {
    throw new RangeError("thresholds.rangeEfficiencyMax must not exceed trendEfficiencyMin");
  }
  if (thresholds.highVolatilityPercentile <= 0.5) {
    throw new RangeError("thresholds.highVolatilityPercentile must be greater than 0.5");
  }
  if (thresholds.compressionPercentile >= 0.5) {
    throw new RangeError("thresholds.compressionPercentile must be below 0.5");
  }
  if (thresholds.compressionAtrRatio >= 1 || thresholds.compressionRangeRatio >= 1) {
    throw new RangeError("compression ATR/range ratio thresholds must be below 1");
  }
  if (thresholds.highVolatilityRangeRatio <= 1) {
    throw new RangeError("thresholds.highVolatilityRangeRatio must exceed 1");
  }
  if (thresholds.highVolatilityAtrRatio <= 1) {
    throw new RangeError("thresholds.highVolatilityAtrRatio must exceed 1");
  }

  const hysteresisBars = options.hysteresisBars ?? 3;
  const evaluationFrequency = options.evaluationFrequency ?? 1;
  const topDriverCount = options.topDriverCount ?? 3;
  validatePeriod(hysteresisBars, "hysteresisBars");
  validatePeriod(evaluationFrequency, "evaluationFrequency");
  if (!Number.isInteger(topDriverCount) || topDriverCount < 1 || topDriverCount > 10) {
    throw new RangeError("topDriverCount must be an integer from 1 through 10");
  }
  const atrReferenceMethod = options.atrReferenceMethod ?? "sma";
  if (atrReferenceMethod !== "sma" && atrReferenceMethod !== "median") {
    throw new RangeError("atrReferenceMethod must be 'sma' or 'median'");
  }

  return {
    lookbacks,
    thresholds,
    enabledFeatures,
    hysteresisBars,
    evaluationFrequency,
    topDriverCount,
    atrReferenceMethod,
  };
}
