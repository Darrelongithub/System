/**
 * Minimal, un-enriched OHLC input used by the synthetic market module.
 * Datetimes are EAT wall-clock strings in the analyzer's `YYYY-MM-DD HH:mm:ss`
 * format; they carry no explicit UTC offset.
 */
export interface Candle {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Quantiles {
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  min: number;
  max: number;
}

export interface DistributionSummary {
  count: number;
  mean: number;
  standardDeviation: number;
  quantiles: Quantiles;
}

export type VolatilityDial = "low" | "normal" | "high" | "p5" | number;
export type DriftDial = "down" | "flat" | "up" | number;
export type TrendinessDial = "mean-reverting" | "random" | "trending";
export type GapDial = "normal" | "heavy";
export type NewsDial = "light" | "normal" | "heavy";
export type VolatilityShape = "expanding" | "stable" | "contracting";
export type ShockFollowThrough = "continue" | "revert" | "mixed";

export interface SynthDials {
  volatility: VolatilityDial;
  volatilityShape: VolatilityShape;
  drift: DriftDial;
  trendiness: TrendinessDial;
  gaps: GapDial;
  news: NewsDial;
  shockFollowThrough: ShockFollowThrough;
}

export interface RegimeWindowConfig {
  id: string;
  /** Inclusive start, exclusive end. One coordinate pair is required. */
  startBar?: number;
  endBar?: number;
  startTradingDay?: number;
  endTradingDay?: number;
  /** Changes from the scenario's active dials for this planted window. */
  dials: Partial<SynthDials>;
}

export interface SegmentLengthDistribution {
  minimumTradingDays?: number;
  maximumTradingDays?: number;
  /** Used by the reversal sequence's intentionally short whipsaw segment. */
  shortMaximumTradingDays?: number;
}

export type ScenarioName =
  | "quiet_range"
  | "normal_chop"
  | "slow_grind_up"
  | "strong_uptrend"
  | "slow_grind_down"
  | "strong_downtrend"
  | "whipsaw"
  | "melt_up"
  | "crash"
  | "news_storm"
  | "gap_shocks"
  | "fake_outs"
  | "dead_zone"
  | "calm_storm_calm"
  | "top_and_reversal"
  | "range_breakout"
  | "bull_with_crash";

export interface SynthConfig extends Partial<SynthDials> {
  /** Defaults to `normal_chop`; sequence presets are selectable by name too. */
  scenario?: ScenarioName;
  /** Defaults to 120 Monday-Friday trading days using the profile's primary weekly slot template. */
  pathLengthTradingDays?: number;
  /** Start-of-path quote in USD/oz. Defaults to the profile's observed median close. */
  priceLevel?: number;
  /** EAT calendar date. Defaults to the profile's representative Monday. */
  startDate?: string;
  /** Per-event spread multiplier; ASSUMPTION because no historical spread series exists. */
  spreadMultPerEvent?: number;
  /** Custom, seeded ground-truth windows. */
  plantedRegimes?: RegimeWindowConfig[];
  segmentLengths?: SegmentLengthDistribution;
  /** Fixed transition size, otherwise drawn from the pre-registered [48, 200] bars. */
  transitionBars?: number;
  /** Default 0.10 (±10%); this is a registered scenario assumption. */
  wobblePercent?: number;
}

export type EventFlag = "none" | "scheduled-news" | "unscheduled-shock" | "gap";

export interface ActiveDialValues {
  volatilityAtrPercent: number;
  driftLogReturn60d: number;
  targetVarianceRatio8: number;
  targetVarianceRatio16: number;
  targetLag1Autocorrelation: number;
  volatilityShape: VolatilityShape;
  trendiness: TrendinessDial;
  gaps: GapDial;
  news: NewsDial;
  shockFollowThrough: ShockFollowThrough;
}

export interface RegimeLabel {
  datetime: string;
  regimeId: string;
  activeDialValues: ActiveDialValues;
  eventFlag: EventFlag;
  gapFlag: boolean;
  extrapolationFlag: boolean;
  /** ASSUMPTION: multiplier metadata only; no historical spread observations are available. */
  spreadMult: number;
  spreadMultAssumption: true;
}

export interface SourceFileSummary {
  path: string;
  sha256: string;
  bars: number;
  start: string;
  end: string;
}

/** One price-free, Wilder-ATR-standardized real bar stored in the self-contained profile. */
export interface StandardizedBar {
  minuteOfDay: number;
  weekday: number;
  /** log(open / previous close) divided by previous ATR/previous close. */
  openGapAtr: number;
  /** log(close / open) divided by previous ATR/previous close. */
  bodyReturnAtr: number;
  /** True range / current Wilder ATR. */
  trueRangeAtr: number;
  /** (high - low) / current Wilder ATR. */
  rangeAtr: number;
  bodyShare: number;
  upperWickShare: number;
  lowerWickShare: number;
  closePosition: number;
  /** Absolute return / prior ATR, retaining sign for block resampling. */
  closeReturnAtr: number;
  /** Current Wilder ATR / close. */
  atrPercent: number;
  /** Source market-week identifier used to make resampling blocks. */
  weekId: string;
  /** Whether the timestamp gap from the prior source bar exceeds 30 minutes. */
  calendarGapBefore: boolean;
  /** Weekend, recurring session break, or unclassified long closure. */
  calendarGapKind: "none" | "weekend" | "scheduled-session-break" | "unclassified-closure";
}

export interface ResampleBlock {
  weekId: string;
  startBar: number;
  endBarExclusive: number;
  barCount: number;
  varianceRatio8: number;
  varianceRatio16: number;
  lag1Autocorrelation: number;
  meanCloseReturnAtr: number;
}

export interface CalibrationProfile {
  schemaVersion: 1;
  instrument: "XAUUSD";
  timeframe: "30m";
  timestampConvention: "EAT wall-clock (UTC+03:00), no offset in CSV";
  source: {
    canonicalCandlesSha256: string;
    /** Exact source-file hashes are attached by scripts/synth-calibrate.ts. */
    files: SourceFileSummary[];
    span: { start: string; end: string };
    barsPerYear: Record<string, number>;
    provenance: "repository-baseline-only" | "user-supplied-local-data";
    coverageWarning: string;
    metadataDataAge?: string;
    metadataAtrMethod?: string;
  };
  sample: {
    bars: number;
    validBars: number;
    duplicateTimestamps: number;
    nonIncreasingTimestamps: number;
    ohlcInvariantViolations: number;
    weekdayCounts: Record<string, number>;
    price: { minimum: number; maximum: number; median: number; lastClose: number };
    atrMethod: "Wilder ATR(14), first value = SMA of first 14 true ranges";
    atrPercent: DistributionSummary;
    rolling60DayDriftLogReturn: DistributionSummary;
    trendWindowBars: number;
    trendWindowStepBars: number;
    varianceRatio8: DistributionSummary;
    varianceRatio16: DistributionSummary;
    lag1ReturnAutocorrelation: DistributionSummary;
    standardizedReturns: DistributionSummary & {
      skewness: number;
      kurtosisPearson: number;
      excessKurtosis: number;
      autocorrelationAbsoluteReturns: Record<string, number>;
    };
    barShape: {
      rangeAtr: DistributionSummary;
      bodyShare: DistributionSummary;
      upperWickShare: DistributionSummary;
      lowerWickShare: DistributionSummary;
      closePositionInRange: DistributionSummary;
    };
    sessionVolatility: Record<
      "asia" | "london" | "newYork",
      {
        bars: number;
        meanAbsoluteReturnAtr: number;
        meanAtrPercent: number;
        meanTrueRangeAtr: number;
      }
    >;
    hourlyVolatilityEAT: Array<{
      hour: number;
      bars: number;
      meanAbsoluteReturnAtr: number;
      meanAtrPercent: number;
    }>;
    dayOfWeekVolatilityEAT: Array<{
      weekday: number;
      weekdayName: string;
      bars: number;
      meanAbsoluteReturnAtr: number;
      meanAtrPercent: number;
    }>;
    scheduledSpikeWindows: Array<{
      minuteOfDay: number;
      timeEAT: string;
      sampleCount: number;
      meanAbsoluteReturnAtr: number;
      medianSlotMean: number;
      fixedMarginFractionOfMedian: 0.25;
    }>;
    scheduledSpikeThresholdAbsReturnAtr: number;
    newsIntensity: {
      scheduledEventRatePerEligibleBar: { light: number; normal: number; heavy: number };
      unscheduledShockRatePerBar: { light: number; normal: number; heavy: number };
    };
    unscheduledShocks: {
      definition: "absolute close-to-close return > 4 prior Wilder ATR";
      count: number;
      frequencyPerBar: number;
      sizeAbsoluteReturnAtr: DistributionSummary;
      samples: Array<{ returnAtr: number; followThroughRatio12: number; horizonBars: number }>;
      followThroughShare: number;
      medianContinuationRatio: number;
      medianReversionRatio: number;
      horizonDistribution: number[];
    };
    gaps: {
      temporalGapCount: number;
      duplicateOrMissing30mIntervals: number;
      weekendGapCount: number;
      weekendGapFrequencyPerTradingWeek: number;
      weekendGapLogSizeAtr: DistributionSummary;
      unclassifiedClosureCount: number;
      unclassifiedClosureLogSizeAtr: DistributionSummary;
      intradayOpenGapLogSizeAtr: DistributionSummary;
      intradayOpenGapAbsoluteP75: number;
      intradayOpenGapAbsoluteP90: number;
      heavyIntradayGapProbability: number;
      heavyGapFrequencyPerWeek: number;
      weekendGapSamplesAtr: number[];
      unclassifiedClosureDurationsCalendarDays: number[];
      intradayGapSamplesAtr: number[];
    };
    calendar: {
      firstWeekday: number;
      lastWeekday: number;
      barsByWeekday: Array<{ weekday: number; countPerObservedDay: number; observedDates: number }>;
      barSlotsByWeekday: Array<{ weekday: number; minuteOfDay: number }[]>;
      weeklyScheduleVariants: Array<{
        id: string;
        occurrenceWeeks: number;
        firstWeek: string;
        lastWeek: string;
        barCount: number;
        barSlotsByWeekday: Array<{ weekday: number; minuteOfDay: number }[]>;
      }>;
      scheduledSessionBreaks: Array<{
        previousWeekday: number;
        previousMinuteOfDay: number;
        nextWeekday: number;
        nextMinuteOfDay: number;
        gapMinutes: number;
        occurrences: number;
      }>;
      missingCalendarDates: string[];
      longClosures: Array<{
        priorBar: string;
        nextBar: string;
        minutes: number;
        missingDates: string[];
        classification: "weekend" | "scheduled-session-break" | "unclassified-closure";
      }>;
      standardWeekBarCount: number;
      representativeStartDate: string;
      unclassifiedClosureRatePerTradingDay: number;
      note: string;
    };
  };
  /** Self-contained, price-free bar library; the generator has no runtime data-file dependency. */
  resampling: {
    standardBars: StandardizedBar[];
    completeWeeks: ResampleBlock[];
    meanTrueRangeToWilderAtr: number;
    barsPer60CalendarDays: number;
  };
}

export interface SyntheticMeta {
  scenario: ScenarioName;
  seed: number;
  pathLengthTradingDays: number;
  priceLevel: number;
  sourceHash: string;
  profileSchemaVersion: 1;
  assumptions: string[];
  calendarBars: number;
  sampledCalendarClosures: number;
  transitionBars: number[];
  extrapolationBars: number;
}

export interface SyntheticResult {
  candles: Candle[];
  labels: RegimeLabel[];
  meta: SyntheticMeta;
}
