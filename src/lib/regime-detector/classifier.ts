import type {
  MarketRegime,
  NullableNumber,
  RegimeDriver,
  RegimeFeatureSet,
  ResolvedRegimeDetectorConfig,
} from "./types";

export interface RegimeRuleEvaluation {
  candidateRegime: MarketRegime;
  candidateConfidence: number;
  scores: Record<MarketRegime, number>;
  drivers: Record<MarketRegime, RegimeDriver[]>;
}

interface WeightedValue {
  value: number | null;
  weight: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const finite = (value: NullableNumber): value is number =>
  value !== null && value !== undefined && Number.isFinite(value);

function weightedMean(items: readonly WeightedValue[]): number | null {
  let weightedSum = 0;
  let weightSum = 0;
  for (const item of items) {
    if (item.value === null || !Number.isFinite(item.value) || item.weight <= 0) continue;
    weightedSum += item.value * item.weight;
    weightSum += item.weight;
  }
  return weightSum > 0 ? weightedSum / weightSum : null;
}

function linearScale(value: number, low: number, high: number): number {
  if (high <= low) return value >= high ? 1 : 0;
  return clamp01((value - low) / (high - low));
}

function pickPeriod(periods: readonly number[], preferred: number): number {
  if (periods.includes(preferred)) return preferred;
  return periods.reduce((best, current) =>
    Math.abs(current - preferred) < Math.abs(best - preferred) ? current : best,
  );
}

function featureDriver(
  feature: string,
  label: string,
  value: number | string | null,
  contribution: number,
  explanation: string,
): RegimeDriver {
  return {
    feature,
    label,
    value: typeof value === "number" && Number.isFinite(value) ? value : value,
    contribution: clamp01(contribution),
    explanation,
  };
}

function topDrivers(drivers: RegimeDriver[], count: number): RegimeDriver[] {
  return drivers
    .filter((driver) => driver.value !== null)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, count);
}

function diDirection(features: RegimeFeatureSet, period: number): number | null {
  const plus = features.plusDI[period];
  const minus = features.minusDI[period];
  if (!finite(plus) || !finite(minus)) return null;
  const total = plus + minus;
  return total > 0 ? (plus - minus) / total : 0;
}

function transitionDrivers(
  features: RegimeFeatureSet,
  adxPeriod: number,
  efficiencyPeriod: number,
  regressionPeriod: number,
): RegimeDriver[] {
  const drivers: RegimeDriver[] = [];
  const adx = features.adx[adxPeriod];
  const efficiency = features.efficiencyRatio[efficiencyPeriod];
  const slope = features.regressionSlopeAtr[regressionPeriod];
  const alignment = features.maAlignmentScore;
  if (finite(adx)) {
    drivers.push(
      featureDriver(
        `adx[${adxPeriod}]`,
        `ADX ${adxPeriod}`,
        adx,
        1 - Math.abs(adx - 20) / 40,
        "Trend strength is near or below the rule boundary.",
      ),
    );
  }
  if (finite(efficiency)) {
    drivers.push(
      featureDriver(
        `efficiencyRatio[${efficiencyPeriod}]`,
        `Efficiency ratio ${efficiencyPeriod}`,
        efficiency,
        1 - Math.abs(efficiency - 0.28),
        "Directional efficiency is not decisive for a trend or range.",
      ),
    );
  }
  if (finite(alignment)) {
    drivers.push(
      featureDriver(
        "maAlignmentScore",
        "MA alignment",
        alignment,
        1 - Math.abs(Math.abs(alignment) - 0.5),
        "Moving-average ordering is mixed or only partly aligned.",
      ),
    );
  }
  if (finite(slope)) {
    drivers.push(
      featureDriver(
        `regressionSlopeAtr[${regressionPeriod}]`,
        `Close slope / ATR ${regressionPeriod}`,
        slope,
        1 - Math.min(1, Math.abs(slope) / 0.1),
        "Normalized price slope is weak or conflicted.",
      ),
    );
  }
  if (finite(features.trueRangePercentile)) {
    drivers.push(
      featureDriver(
        "trueRangePercentile",
        "True-range percentile",
        features.trueRangePercentile,
        1 - Math.abs(features.trueRangePercentile - 0.5) * 2,
        "Recent range behavior has not established a volatility extreme.",
      ),
    );
  }
  return drivers;
}

/** Transparent deterministic rule scoring; no fit or future observations are used. */
export function classifyRegime(
  features: RegimeFeatureSet,
  config: ResolvedRegimeDetectorConfig,
): RegimeRuleEvaluation {
  const { lookbacks, thresholds } = config;
  const adxPeriod = pickPeriod(lookbacks.adx, 14);
  const efficiencyPeriod = pickPeriod(lookbacks.efficiency, 20);
  const regressionPeriod = pickPeriod(lookbacks.regression, 20);

  const adx = features.adx[adxPeriod];
  const efficiency = features.efficiencyRatio[efficiencyPeriod];
  const alignment = features.maAlignmentScore;
  const slopeAtr = features.regressionSlopeAtr[regressionPeriod];
  const plusDi = features.plusDI[adxPeriod];
  const minusDi = features.minusDI[adxPeriod];
  const signedDi = diDirection(features, adxPeriod);

  const adxStrength = finite(adx)
    ? linearScale(adx, thresholds.trendAdxMin, thresholds.trendAdxStrong)
    : null;
  const efficiencyStrength = finite(efficiency)
    ? linearScale(efficiency, thresholds.trendEfficiencyMin, thresholds.trendEfficiencyStrong)
    : null;
  const alignmentStrength = finite(alignment) ? Math.abs(alignment) : null;
  const slopeStrength = finite(slopeAtr)
    ? linearScale(
        Math.abs(slopeAtr),
        thresholds.trendSlopeAtrPerBar * 0.15,
        thresholds.trendSlopeAtrPerBar,
      )
    : null;

  const trendStrength = weightedMean([
    { value: adxStrength, weight: 0.35 },
    { value: efficiencyStrength, weight: 0.3 },
    { value: alignmentStrength, weight: 0.2 },
    { value: slopeStrength, weight: 0.15 },
  ]);

  const directionBull = weightedMean([
    { value: signedDi === null ? null : (signedDi + 1) / 2, weight: 0.35 },
    { value: finite(alignment) ? (alignment + 1) / 2 : null, weight: 0.3 },
    { value: finite(slopeAtr) ? (Math.sign(slopeAtr) + 1) / 2 : null, weight: 0.25 },
    {
      value:
        features.swingStructure === "bullish"
          ? 1
          : features.swingStructure === "bearish"
            ? 0
            : features.swingStructure === "mixed"
              ? 0.5
              : null,
      weight: 0.1,
    },
  ]);

  const bullishTrendScore =
    trendStrength === null || directionBull === null
      ? 0
      : clamp01(0.55 * trendStrength + 0.45 * directionBull);
  const bearishTrendScore =
    trendStrength === null || directionBull === null
      ? 0
      : clamp01(0.55 * trendStrength + 0.45 * (1 - directionBull));

  const directionalSignals = [
    signedDi,
    alignment,
    slopeAtr,
    features.swingStructure === "insufficient" || features.swingStructure === "disabled"
      ? null
      : features.swingStructure === "bullish"
        ? 1
        : features.swingStructure === "bearish"
          ? -1
          : 0,
  ].filter((value) => value !== null && value !== undefined).length;
  const trendConfirmations = [
    finite(adx) ? adx >= thresholds.trendAdxMin : null,
    finite(efficiency) ? efficiency >= thresholds.trendEfficiencyMin : null,
    finite(alignment) ? Math.abs(alignment) >= 0.3 : null,
    finite(slopeAtr) ? Math.abs(slopeAtr) >= thresholds.trendSlopeAtrPerBar * 0.35 : null,
  ].filter((value) => value === true).length;
  const trendObservations = [adx, efficiency, alignment, slopeAtr].filter(finite).length;
  const directionalConfidence =
    directionBull === null ? 0 : Math.max(directionBull, 1 - directionBull);
  const trendGate =
    trendObservations >= 2 &&
    directionalSignals >= 2 &&
    trendConfirmations >= 2 &&
    directionalConfidence >= thresholds.trendDirectionalMin;
  const trendRegime: MarketRegime | null =
    trendGate && bullishTrendScore >= bearishTrendScore
      ? "bullish-trend"
      : trendGate
        ? "bearish-trend"
        : null;
  const trendConfidence = trendRegime === "bullish-trend" ? bullishTrendScore : bearishTrendScore;

  const lowAdx = finite(adx)
    ? clamp01((thresholds.trendAdxMin - adx) / (thresholds.trendAdxMin - thresholds.rangeAdxMax))
    : null;
  const lowEfficiency = finite(efficiency)
    ? clamp01(
        (thresholds.trendEfficiencyMin - efficiency) /
          (thresholds.trendEfficiencyMin - thresholds.rangeEfficiencyMax),
      )
    : null;
  const flatAlignment = finite(alignment) ? 1 - Math.abs(alignment) : null;
  const overlap = finite(features.candleOverlapPercent)
    ? clamp01(features.candleOverlapPercent / 100)
    : null;
  const rangeScore =
    weightedMean([
      { value: lowAdx, weight: 0.35 },
      { value: lowEfficiency, weight: 0.35 },
      { value: flatAlignment, weight: 0.15 },
      { value: overlap, weight: 0.15 },
    ]) ?? 0;
  const rangeObservations = [lowAdx, lowEfficiency, flatAlignment, overlap].filter(finite).length;
  const rangeGate =
    rangeObservations >= 2 &&
    (lowAdx !== null || lowEfficiency !== null) &&
    (lowAdx === null || adx! <= thresholds.rangeAdxMax) &&
    (lowEfficiency === null || efficiency! <= thresholds.rangeEfficiencyMax) &&
    rangeScore >= thresholds.minimumConfidence;

  const trueRangePercentile = features.trueRangePercentile;
  const rangePercentile = features.rangePercentile;
  const atrRelative = features.atrRelative;
  const trueRangeRelative = features.trueRangeRelative;
  const rangeRelative = features.rangeRelative;
  const highRangeSignal =
    finite(trueRangePercentile) &&
    trueRangePercentile >= thresholds.highVolatilityPercentile &&
    finite(trueRangeRelative) &&
    trueRangeRelative >= thresholds.highVolatilityRangeRatio;
  const highAtrSignal = finite(atrRelative) && atrRelative >= thresholds.highVolatilityAtrRatio;
  const highRangeIntensity = highRangeSignal
    ? Math.min(
        linearScale(trueRangePercentile!, thresholds.highVolatilityPercentile, 1),
        linearScale(
          trueRangeRelative!,
          thresholds.highVolatilityRangeRatio,
          thresholds.highVolatilityRangeRatio * 2,
        ),
      )
    : 0;
  const highAtrIntensity = finite(atrRelative)
    ? linearScale(
        atrRelative,
        thresholds.highVolatilityAtrRatio,
        thresholds.highVolatilityAtrRatio * 2,
      )
    : 0;
  const highVolatilityScore =
    highRangeSignal || highAtrSignal
      ? 0.55 + 0.45 * Math.max(highRangeIntensity, highAtrIntensity)
      : 0;

  const compressionRangeSignal =
    finite(trueRangePercentile) &&
    trueRangePercentile <= thresholds.compressionPercentile &&
    finite(trueRangeRelative) &&
    trueRangeRelative <= thresholds.compressionRangeRatio;
  const compressionCandleSignal =
    finite(rangePercentile) &&
    rangePercentile <= thresholds.compressionPercentile &&
    finite(rangeRelative) &&
    rangeRelative <= thresholds.compressionRangeRatio;
  const compressionAtrSignal = finite(atrRelative) && atrRelative <= thresholds.compressionAtrRatio;
  const compressionSignals = [
    compressionRangeSignal,
    compressionCandleSignal,
    compressionAtrSignal,
  ].filter(Boolean).length;
  const trueRangeCompression =
    finite(trueRangePercentile) && finite(trueRangeRelative)
      ? (1 -
          linearScale(trueRangePercentile, 0, thresholds.compressionPercentile) +
          1 -
          linearScale(trueRangeRelative, thresholds.compressionRangeRatio, 1)) /
        2
      : null;
  const candleCompression =
    finite(rangePercentile) && finite(rangeRelative)
      ? (1 -
          linearScale(rangePercentile, 0, thresholds.compressionPercentile) +
          1 -
          linearScale(rangeRelative, thresholds.compressionRangeRatio, 1)) /
        2
      : null;
  const atrCompression = finite(atrRelative)
    ? clamp01((1 - atrRelative) / (1 - thresholds.compressionAtrRatio))
    : null;
  const compressionBase =
    weightedMean([
      { value: trueRangeCompression, weight: 0.4 },
      { value: candleCompression, weight: 0.35 },
      { value: atrCompression, weight: 0.25 },
    ]) ?? 0;
  const compressionScore = compressionSignals >= 2 ? 0.55 + 0.45 * compressionBase : 0;

  const bullishDrivers = [
    featureDriver(
      `adx[${adxPeriod}]`,
      `ADX ${adxPeriod}`,
      finite(adx) ? adx : null,
      adxStrength ?? 0,
      `Trend strength ${finite(adx) ? `${adx.toFixed(1)} ≥ ${thresholds.trendAdxMin}` : "is unavailable"}.`,
    ),
    featureDriver(
      `efficiencyRatio[${efficiencyPeriod}]`,
      `Efficiency ratio ${efficiencyPeriod}`,
      finite(efficiency) ? efficiency : null,
      efficiencyStrength ?? 0,
      `Directional efficiency ${finite(efficiency) ? `${efficiency.toFixed(2)} ≥ ${thresholds.trendEfficiencyMin}` : "is unavailable"}.`,
    ),
    featureDriver(
      "maAlignmentScore",
      "MA alignment",
      finite(alignment) ? alignment : null,
      alignmentStrength ?? 0,
      "Pairwise SMA/EMA stack is aligned upward.",
    ),
    featureDriver(
      `plusDI[${adxPeriod}]`,
      `+DI ${adxPeriod}`,
      finite(plusDi) ? plusDi : null,
      signedDi === null ? 0 : (signedDi + 1) / 2,
      "Positive directional movement dominates negative movement.",
    ),
    featureDriver(
      `regressionSlopeAtr[${regressionPeriod}]`,
      `Close slope / ATR ${regressionPeriod}`,
      finite(slopeAtr) ? slopeAtr : null,
      slopeStrength ?? 0,
      "The trailing close regression slope is positive.",
    ),
  ];
  const bearishDrivers = [
    featureDriver(
      `adx[${adxPeriod}]`,
      `ADX ${adxPeriod}`,
      finite(adx) ? adx : null,
      adxStrength ?? 0,
      `Trend strength ${finite(adx) ? `${adx.toFixed(1)} ≥ ${thresholds.trendAdxMin}` : "is unavailable"}.`,
    ),
    featureDriver(
      `efficiencyRatio[${efficiencyPeriod}]`,
      `Efficiency ratio ${efficiencyPeriod}`,
      finite(efficiency) ? efficiency : null,
      efficiencyStrength ?? 0,
      `Directional efficiency ${finite(efficiency) ? `${efficiency.toFixed(2)} ≥ ${thresholds.trendEfficiencyMin}` : "is unavailable"}.`,
    ),
    featureDriver(
      "maAlignmentScore",
      "MA alignment",
      finite(alignment) ? alignment : null,
      alignmentStrength ?? 0,
      "Pairwise SMA/EMA stack is aligned downward.",
    ),
    featureDriver(
      `minusDI[${adxPeriod}]`,
      `−DI ${adxPeriod}`,
      finite(minusDi) ? minusDi : null,
      signedDi === null ? 0 : (1 - signedDi) / 2,
      "Negative directional movement dominates positive movement.",
    ),
    featureDriver(
      `regressionSlopeAtr[${regressionPeriod}]`,
      `Close slope / ATR ${regressionPeriod}`,
      finite(slopeAtr) ? slopeAtr : null,
      slopeStrength ?? 0,
      "The trailing close regression slope is negative.",
    ),
  ];

  const rangeDrivers = [
    featureDriver(
      `adx[${adxPeriod}]`,
      `ADX ${adxPeriod}`,
      finite(adx) ? adx : null,
      lowAdx ?? 0,
      `Low ADX supports a non-trending market (range threshold ${thresholds.rangeAdxMax}).`,
    ),
    featureDriver(
      `efficiencyRatio[${efficiencyPeriod}]`,
      `Efficiency ratio ${efficiencyPeriod}`,
      finite(efficiency) ? efficiency : null,
      lowEfficiency ?? 0,
      `Low path efficiency supports two-way, mean-reverting action (threshold ${thresholds.rangeEfficiencyMax}).`,
    ),
    featureDriver(
      "maAlignmentScore",
      "MA alignment",
      finite(alignment) ? alignment : null,
      flatAlignment ?? 0,
      "Mixed/flat MA stacking contributes to the range score.",
    ),
    featureDriver(
      "candleOverlapPercent",
      "Overlapping candles",
      finite(features.candleOverlapPercent) ? features.candleOverlapPercent : null,
      overlap ?? 0,
      "Frequent overlap indicates limited directional progress.",
    ),
  ];

  const highVolDrivers = [
    featureDriver(
      "trueRangePercentile",
      "True-range percentile",
      finite(trueRangePercentile) ? trueRangePercentile : null,
      highRangeIntensity,
      `True range is in the upper tail (threshold ${thresholds.highVolatilityPercentile.toFixed(2)}).`,
    ),
    featureDriver(
      "trueRangeRelative",
      "True range / baseline",
      finite(trueRangeRelative) ? trueRangeRelative : null,
      highRangeIntensity,
      `Current true range is elevated versus its trailing baseline (threshold ${thresholds.highVolatilityRangeRatio.toFixed(2)}×).`,
    ),
    featureDriver(
      "atrRelative",
      "ATR / own baseline",
      finite(atrRelative) ? atrRelative : null,
      highAtrIntensity,
      `ATR is elevated versus its trailing baseline (threshold ${thresholds.highVolatilityAtrRatio.toFixed(2)}×).`,
    ),
    featureDriver(
      `realizedVolatility[${pickPeriod(lookbacks.realizedVolatility, 20)}]`,
      `Realized volatility ${pickPeriod(lookbacks.realizedVolatility, 20)}`,
      features.realizedVolatility[pickPeriod(lookbacks.realizedVolatility, 20)],
      Math.max(highRangeIntensity, highAtrIntensity) * 0.5,
      "Recent close-to-close dispersion is part of the volatility context.",
    ),
  ];

  const compressionDrivers = [
    featureDriver(
      "trueRangePercentile",
      "True-range percentile",
      finite(trueRangePercentile) ? trueRangePercentile : null,
      trueRangeCompression ?? 0,
      "True range is compressed versus its trailing distribution.",
    ),
    featureDriver(
      "rangePercentile",
      "Candle-range percentile",
      finite(rangePercentile) ? rangePercentile : null,
      candleCompression ?? 0,
      "High-low ranges are compressed versus the recent window.",
    ),
    featureDriver(
      "trueRangeRelative",
      "True range / baseline",
      finite(trueRangeRelative) ? trueRangeRelative : null,
      trueRangeCompression ?? 0,
      "Current true range is small relative to its trailing baseline.",
    ),
    featureDriver(
      "rangeRelative",
      "Candle range / baseline",
      finite(rangeRelative) ? rangeRelative : null,
      candleCompression ?? 0,
      "Current candle range is small relative to its trailing baseline.",
    ),
    featureDriver(
      "atrRelative",
      "ATR / own baseline",
      finite(atrRelative) ? atrRelative : null,
      atrCompression ?? 0,
      "ATR is below its trailing baseline.",
    ),
    featureDriver(
      "bollingerBandwidth",
      "Bollinger bandwidth",
      finite(features.bollingerBandwidth) ? features.bollingerBandwidth : null,
      compressionBase * 0.5,
      "The trailing Bollinger envelope provides an independent width check.",
    ),
  ];

  const transitionScore =
    trendObservations < 2 && rangeObservations < 2
      ? 0.1
      : clamp01(0.65 - Math.max(bullishTrendScore, bearishTrendScore, rangeScore) * 0.35);
  const transition = transitionDrivers(features, adxPeriod, efficiencyPeriod, regressionPeriod);

  const scores: Record<MarketRegime, number> = {
    "bullish-trend": bullishTrendScore,
    "bearish-trend": bearishTrendScore,
    range: rangeScore,
    "high-volatility": highVolatilityScore,
    compression: compressionScore,
    transition: transitionScore,
  };
  const drivers: Record<MarketRegime, RegimeDriver[]> = {
    "bullish-trend": topDrivers(bullishDrivers, config.topDriverCount),
    "bearish-trend": topDrivers(bearishDrivers, config.topDriverCount),
    range: topDrivers(rangeDrivers, config.topDriverCount),
    "high-volatility": topDrivers(highVolDrivers, config.topDriverCount),
    compression: topDrivers(compressionDrivers, config.topDriverCount),
    transition: topDrivers(transition, config.topDriverCount),
  };

  let candidateRegime: MarketRegime = "transition";
  let candidateConfidence = transitionScore;
  if ((highRangeSignal || highAtrSignal) && highVolatilityScore >= thresholds.minimumConfidence) {
    candidateRegime = "high-volatility";
    candidateConfidence = highVolatilityScore;
  } else if (compressionSignals >= 2 && compressionScore >= thresholds.minimumConfidence) {
    candidateRegime = "compression";
    candidateConfidence = compressionScore;
  } else if (trendRegime !== null && trendConfidence >= thresholds.minimumConfidence) {
    candidateRegime = trendRegime;
    candidateConfidence = trendConfidence;
  } else if (rangeGate) {
    candidateRegime = "range";
    candidateConfidence = rangeScore;
  }

  return { candidateRegime, candidateConfidence, scores, drivers };
}
