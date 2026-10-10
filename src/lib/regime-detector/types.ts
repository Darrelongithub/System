/**
 * Public types for the causal OHLCV market-regime detector.
 *
 * Prices and volumes are supplied in their native units. Percent-like values
 * are documented on the individual feature fields; all feature windows include
 * the current bar and only bars at or before it.
 */
export type MarketRegime =
  "bullish-trend" | "bearish-trend" | "range" | "high-volatility" | "compression" | "transition";

export type NullableNumber = number | null;
export type RegimeTimestamp = string | number;

export interface RegimeBar {
  /** ISO/date-time string or epoch milliseconds. Input must be chronological. */
  timestamp: RegimeTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Omit or pass null when the feed does not provide volume. */
  volume?: number | null | undefined;
}

export type SwingStructure = "bullish" | "bearish" | "mixed" | "insufficient" | "disabled";
export type AtrReferenceMethod = "sma" | "median";

export type RegimeFeatureGroup =
  | "trend"
  | "efficiency"
  | "volatility"
  | "persistence"
  | "candleGeometry"
  | "volume"
  | "distribution";

/**
 * Feature values for one bar. Numeric maps are keyed by their actual period,
 * so overriding a lookback never makes a feature name lie about its period.
 * Unavailable/warm-up values are null (never NaN or Infinity).
 */
export interface RegimeFeatureSet {
  timestamp: RegimeTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: NullableNumber;
  volumeAvailable: boolean;

  /** One-bar close-to-close log return, decimal (e.g. 0.01 = 1%). */
  logReturn: NullableNumber;
  /** True range in price units. */
  trueRange: NullableNumber;

  /** ADX / directional indicators are on the conventional 0–100 scale. */
  adx: Record<number, NullableNumber>;
  plusDI: Record<number, NullableNumber>;
  minusDI: Record<number, NullableNumber>;
  /** ADX least-squares slope in ADX points per bar. */
  adxSlope: Record<number, NullableNumber>;

  /** Linear regression slope of close in price units per bar. */
  regressionSlope: Record<number, NullableNumber>;
  /** Regression slope divided by ATR of the first configured ATR period. */
  regressionSlopeAtr: Record<number, NullableNumber>;
  /** Regression slope / |close|, expressed as percent per bar. */
  regressionSlopePct: Record<number, NullableNumber>;
  sma: Record<number, NullableNumber>;
  ema: Record<number, NullableNumber>;
  /** (close / moving average - 1) * 100, in percent. */
  smaDistancePct: Record<number, NullableNumber>;
  emaDistancePct: Record<number, NullableNumber>;
  /** Pairwise SMA/EMA stack score in [-1, 1]; positive is bullish. */
  maAlignmentScore: NullableNumber;
  higherHighCount: NullableNumber;
  higherLowCount: NullableNumber;
  lowerHighCount: NullableNumber;
  lowerLowCount: NullableNumber;
  swingStructure: SwingStructure;

  /** Kaufman efficiency ratios in [0, 1]. */
  efficiencyRatio: Record<number, NullableNumber>;

  atr: Record<number, NullableNumber>;
  /** 100 * ATR / |close|, in percent. */
  atrPercent: Record<number, NullableNumber>;
  /** ATR for the first configured ATR period divided by its rolling baseline. */
  atrReference: NullableNumber;
  atrRelative: NullableNumber;
  /** Current true range / rolling true-range baseline. */
  trueRangeRelative: NullableNumber;
  /** Current percent range / rolling range baseline. */
  rangeRelative: NullableNumber;
  /** Standard deviation of log returns, per bar and not annualized. */
  realizedVolatility: Record<number, NullableNumber>;
  /** Per-bar Parkinson / Garman–Klass estimates, not annualized. */
  parkinsonVolatility: NullableNumber;
  garmanKlassVolatility: NullableNumber;
  /** Band/channel width divided by its midline (decimal fraction). */
  bollingerBandwidth: NullableNumber;
  keltnerWidth: NullableNumber;
  /** Inclusive trailing empirical percentile rank in [0, 1]. */
  trueRangePercentile: NullableNumber;
  /** Rolling standard deviation of the selected realized-volatility series. */
  volatilityOfVolatility: NullableNumber;

  /** Variance-scaling Hurst estimate from trailing log returns, bounded to [0, 1]. */
  hurstExponent: NullableNumber;
  /** Trailing-window return autocorrelations. */
  returnAutocorrelation: Record<number, NullableNumber>;
  /** q-period / (q × one-period) return variance ratio. */
  varianceRatio: NullableNumber;

  /** Candle ratios are in [0, 1]. Overlap is a percent in [0, 100]. */
  bodyRangeRatio: NullableNumber;
  upperWickRatio: NullableNumber;
  lowerWickRatio: NullableNumber;
  candleOverlapPercent: NullableNumber;
  /** Positive = consecutive rising closes/candles; negative = falling. */
  consecutiveSameDirectionCloses: number;
  consecutiveSameDirectionCandles: number;
  /** Empirical percentile ranks in [0, 1]. */
  rangePercentile: NullableNumber;
  rangeCompressionPercentile: NullableNumber;
  rangeExpansionPercentile: NullableNumber;

  volumeSma: NullableNumber;
  volumeRatio: NullableNumber;
  volumeSpikeScore: NullableNumber;
  obvSlope: NullableNumber;
  upDownVolumeRatio: NullableNumber;

  returnSkewness: NullableNumber;
  /** Excess kurtosis (normal distribution = 0). */
  returnExcessKurtosis: NullableNumber;
  returnQuantile10: NullableNumber;
  returnQuantile25: NullableNumber;
  returnQuantile50: NullableNumber;
  returnQuantile75: NullableNumber;
  returnQuantile90: NullableNumber;
  returnIqr: NullableNumber;

  /** Regime duration is one-based; bars since a change is zero-based. */
  barsInCurrentRegime: number;
  barsSinceLastRegimeChange: number;
}

export interface RegimeDriver {
  /** Stable machine key, e.g. "adx[14]" or "trueRangePercentile". */
  feature: string;
  label: string;
  value: number | string | null;
  /** Relative rule contribution in [0, 1], not a statistical probability. */
  contribution: number;
  explanation: string;
}

export interface RegimePoint {
  index: number;
  timestamp: RegimeTimestamp;
  regime: MarketRegime;
  /** Unsuppressed rule result for this bar, before hysteresis is applied. */
  candidateRegime: MarketRegime;
  /** Rule-support score for the committed regime; not a calibrated probability. */
  confidence: number;
  candidateConfidence: number;
  drivers: RegimeDriver[];
  changed: boolean;
  pendingRegime: MarketRegime | null;
  /** Number of sampled evaluations for which the pending candidate persisted. */
  pendingBars: number;
  features: RegimeFeatureSet;
}

export interface RegimeChange {
  index: number;
  timestamp: RegimeTimestamp;
  from: MarketRegime;
  to: MarketRegime;
  confidence: number;
  candidateConfidence: number;
  drivers: RegimeDriver[];
  /** Full feature snapshot using data available on the change bar only. */
  features: RegimeFeatureSet;
}

export interface RegimeLookbacks {
  adx: number[];
  atr: number[];
  movingAverages: number[];
  efficiency: number[];
  regression: number[];
  adxSlope: number;
  atrReference: number;
  realizedVolatility: number[];
  volatilityEstimator: number;
  bollinger: number;
  keltner: number;
  trueRangePercentile: number;
  volatilityOfVolatility: number;
  hurst: number;
  autocorrelation: number;
  varianceRatio: number;
  varianceRatioHorizon: number;
  candleOverlap: number;
  volume: number;
  distribution: number;
  rangePercentile: number;
  swingStrength: number;
  structureWindow: number;
}

export interface RegimeThresholds {
  trendAdxMin: number;
  trendAdxStrong: number;
  trendEfficiencyMin: number;
  trendEfficiencyStrong: number;
  trendDirectionalMin: number;
  trendSlopeAtrPerBar: number;
  rangeAdxMax: number;
  rangeEfficiencyMax: number;
  highVolatilityPercentile: number;
  highVolatilityAtrRatio: number;
  highVolatilityRangeRatio: number;
  compressionPercentile: number;
  compressionRangeRatio: number;
  compressionAtrRatio: number;
  minimumConfidence: number;
}

export interface RegimeDetectorOptions {
  lookbacks?: Partial<RegimeLookbacks>;
  thresholds?: Partial<RegimeThresholds>;
  enabledFeatures?: Partial<Record<RegimeFeatureGroup, boolean>>;
  hysteresisBars?: number;
  /** Classifier state changes are checked every N bars; features still emit on every bar. */
  evaluationFrequency?: number;
  topDriverCount?: number;
  atrReferenceMethod?: AtrReferenceMethod;
}

export interface ResolvedRegimeDetectorConfig {
  lookbacks: RegimeLookbacks;
  thresholds: RegimeThresholds;
  enabledFeatures: Record<RegimeFeatureGroup, boolean>;
  hysteresisBars: number;
  evaluationFrequency: number;
  topDriverCount: number;
  atrReferenceMethod: AtrReferenceMethod;
}

export interface RegimeDetectionResult {
  points: RegimePoint[];
  changes: RegimeChange[];
  config: ResolvedRegimeDetectorConfig;
}
