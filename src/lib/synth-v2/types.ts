export type DialName =
  | "volatilityLevel"
  | "drift"
  | "trendiness"
  | "gapSize"
  | "newsSpikeIntensity";

export interface DialValues {
  /** Daily RMS log-return scale, in return units per 30-minute bar. */
  volatilityLevel: number;
  /** Mean within-session log return per weekday, not a trade or P&L measure. */
  drift: number;
  /** AR(1) coefficient applied to standardized bar-return innovations. */
  trendiness: number;
  /** Median absolute session-gap size in ATR units. */
  gapSize: number;
  /** Fraction of bars assigned to the market-statistical tail pool. */
  newsSpikeIntensity: number;
}

export interface DialBand {
  p10: number;
  p50: number;
  p90: number;
  unit: string;
}

export type DialBands = Record<DialName, DialBand>;

export interface Candle {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface BarLabel {
  datetime: string;
  dials: DialValues;
  flags: string[];
  gapKind: "none" | "session" | "weekend";
  newsSpike: boolean;
  /** Simulated weekday log-volatility state, before the intraday seasonal factor. */
  dailyVolatility: number;
}

export interface RawCandle extends Candle {
  epochMs: number;
  date: string;
  minuteOfDay: number;
  weekday: number;
  reliable: boolean | undefined;
}

export interface DayTemplate {
  sourceDate: string;
  weekday: number;
  slots: number[];
}

export interface ShapeSample {
  rangeAtr: number;
  bodyShare: number;
  upperWickShare: number;
  lowerWickShare: number;
  bullish: boolean;
}

export interface VolatilityModel {
  meanLogVolatility: number;
  persistence: number;
  innovationSd: number;
  medianAtrPct: number;
}

export interface SourceMetrics {
  weekdayBars: number;
  weekdayDates: number;
  donorDays: number;
  dailyVolatility: { p10: number; p50: number; p90: number };
  dailyDrift: { p10: number; p50: number; p90: number };
  eventGapCount: number;
  weekendGapCount: number;
  newsThreshold: number;
  seasonalLondon: number[];
  seasonalNewYork: number[];
  dailyNegativeDriftShare: number;
  dailyNearFlatDriftShare: number;
  nearFlatDriftThreshold: number;
  medianPrice: number;
}

export interface CalibrationProfile {
  schemaVersion: 2;
  sourceSha256: string;
  sourceFile: string;
  sourceMetrics: SourceMetrics;
  dialBands: DialBands;
  defaultDials: DialValues;
  volatilityModel: VolatilityModel;
  /** Standardized, centered empirical 30-minute close/open return pool. */
  coreReturns: number[];
  /** Top-tail standardized returns, separated for the news-spike frequency dial. */
  spikeReturns: number[];
  returnTailThreshold: number;
  seasonalNormalization: number;
  dayTemplates: DayTemplate[];
  shapeBins: ShapeSample[][];
  nonDojiShapeBins: ShapeSample[][];
  shapeBinEdges: number[];
  medianBodyShare: number;
  continuousGapPool: number[];
  sessionGapPool: number[];
  weekendGapPool: number[];
  medianEventGapAtr: number;
  initialAtrPct: number;
}

export interface GenerateConfig {
  seed: string | number;
  weekdays?: number;
  startDate?: string;
  startPrice?: number;
  dials?: Partial<DialValues>;
}

export interface SyntheticPath {
  candles: Candle[];
  labels: BarLabel[];
  csv: string;
}

export interface DailyMetric {
  date: string;
  barCount: number;
  volatility: number;
  drift: number;
  gapRate: number;
}

export interface GateMetric {
  id: string;
  statistic: string;
  real: number;
  bootstrapLow?: number;
  bootstrapHigh?: number;
  synthetic: number;
  tolerance: string;
  allowedLow: number;
  allowedHigh: number;
  pass: boolean;
}

export interface MetricSet {
  kurtosisAtr: number;
  absReturnAcf1: number;
  absReturnAcf6: number;
  absReturnAcf48: number;
  meanRangeAtr: number;
  meanBodyShare: number;
  meanUpperWickShare: number;
  meanLowerWickShare: number;
  gapFrequency: number;
  gapMedianAtr: number;
  gapP95Atr: number;
  sessionShares: number[];
  varianceRatio8: number;
  varianceRatio16: number;
  dailyRangeAtrMedian: number;
  dailyRangeAtrP90: number;
  dailyVolatilityMedian: number;
  dailyDriftMean: number;
  trendinessAcf1: number;
  newsTailFrequency: number;
}
