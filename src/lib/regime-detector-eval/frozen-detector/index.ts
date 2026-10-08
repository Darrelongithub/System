import { classifyRegime } from "./classifier";
import { resolveRegimeDetectorConfig } from "./config";
import { computeRegimeFeatures } from "./features";
import type {
  MarketRegime,
  RegimeBar,
  RegimeChange,
  RegimeDetectionResult,
  RegimeDetectorOptions,
  RegimeFeatureSet,
  RegimePoint,
  ResolvedRegimeDetectorConfig,
} from "./types";

export * from "./types";
export {
  DEFAULT_ENABLED_FEATURES,
  DEFAULT_REGIME_LOOKBACKS,
  DEFAULT_REGIME_THRESHOLDS,
  resolveRegimeDetectorConfig,
} from "./config";

/** Semantic colors shared by the map and other detector consumers. */
export const REGIME_COLORS: Record<MarketRegime, string> = {
  "bullish-trend": "#48d8bd",
  "bearish-trend": "#f18b76",
  range: "#e8bd62",
  "high-volatility": "#f472b6",
  compression: "#65aaf7",
  transition: "#a1a1aa",
};

function cloneFeatures(features: RegimeFeatureSet): RegimeFeatureSet {
  return {
    ...features,
    adx: { ...features.adx },
    plusDI: { ...features.plusDI },
    minusDI: { ...features.minusDI },
    adxSlope: { ...features.adxSlope },
    regressionSlope: { ...features.regressionSlope },
    regressionSlopeAtr: { ...features.regressionSlopeAtr },
    regressionSlopePct: { ...features.regressionSlopePct },
    sma: { ...features.sma },
    ema: { ...features.ema },
    smaDistancePct: { ...features.smaDistancePct },
    emaDistancePct: { ...features.emaDistancePct },
    efficiencyRatio: { ...features.efficiencyRatio },
    atr: { ...features.atr },
    atrPercent: { ...features.atrPercent },
    realizedVolatility: { ...features.realizedVolatility },
    returnAutocorrelation: { ...features.returnAutocorrelation },
  };
}

function buildPoint(
  index: number,
  features: RegimeFeatureSet,
  regime: MarketRegime,
  evaluation: ReturnType<typeof classifyRegime>,
  changed: boolean,
  pendingRegime: MarketRegime | null,
  pendingBars: number,
  confidence: number,
): RegimePoint {
  return {
    index,
    timestamp: features.timestamp,
    regime,
    candidateRegime: evaluation.candidateRegime,
    confidence,
    candidateConfidence: evaluation.candidateConfidence,
    drivers: evaluation.drivers[regime],
    changed,
    pendingRegime,
    pendingBars,
    features,
  };
}

/**
 * Calculate all configured features and classify every bar in chronological
 * order. Every feature row is a trailing-window calculation; swing pivots are
 * emitted only on the bar that confirms them. No value for index i reads a bar
 * with index > i, so the returned series is suitable for walk-forward replay.
 *
 * A regime switch is committed after `hysteresisBars` consecutive classifier
 * evaluations agree. `evaluationFrequency` controls how often the switch state
 * is sampled; features and candidate scores are still refreshed on every bar.
 */
export function detectRegimes(
  bars: readonly RegimeBar[],
  options: RegimeDetectorOptions = {},
): RegimeDetectionResult {
  const config = resolveRegimeDetectorConfig(options);
  const features = computeRegimeFeatures(bars, config);
  const points: RegimePoint[] = [];
  const changes: RegimeChange[] = [];

  let committedRegime: MarketRegime = "transition";
  let pendingRegime: MarketRegime | null = null;
  let pendingBars = 0;
  let barsInRegime = 0;
  let lastChangeIndex = 0;

  for (let index = 0; index < features.length; index++) {
    const feature = features[index]!;
    const evaluation = classifyRegime(feature, config);
    let changed = false;
    let priorRegime = committedRegime;
    const isEvaluationBar = index % config.evaluationFrequency === 0;

    if (isEvaluationBar) {
      const candidate = evaluation.candidateRegime;
      if (candidate === committedRegime) {
        pendingRegime = null;
        pendingBars = 0;
      } else if (candidate === pendingRegime) {
        pendingBars++;
      } else {
        pendingRegime = candidate;
        pendingBars = 1;
      }

      if (pendingRegime !== null && pendingBars >= config.hysteresisBars) {
        priorRegime = committedRegime;
        committedRegime = pendingRegime;
        pendingRegime = null;
        pendingBars = 0;
        barsInRegime = 0;
        lastChangeIndex = index;
        changed = true;
      }
    }

    barsInRegime++;
    feature.barsInCurrentRegime = barsInRegime;
    feature.barsSinceLastRegimeChange = Math.max(0, index - lastChangeIndex);
    const confidence = evaluation.scores[committedRegime];
    const point = buildPoint(
      index,
      feature,
      committedRegime,
      evaluation,
      changed,
      pendingRegime,
      pendingBars,
      confidence,
    );
    points.push(point);

    if (changed) {
      const change: RegimeChange = {
        index,
        timestamp: feature.timestamp,
        from: priorRegime,
        to: committedRegime,
        confidence,
        candidateConfidence: evaluation.candidateConfidence,
        drivers: point.drivers,
        features: cloneFeatures(feature),
      };
      changes.push(change);
    }
  }

  return { points, changes, config: cloneConfig(config) };
}

/**
 * Explicit walk-forward spelling for backtest/research call sites. This is the
 * same one-pass causal evaluator as `detectRegimes`, not repeated prefix fits;
 * the optional callback is called once per bar in timestamp order.
 */
export function detectRegimesWalkForward(
  bars: readonly RegimeBar[],
  options: RegimeDetectorOptions = {},
  onPoint?: (point: RegimePoint) => void,
): RegimeDetectionResult {
  const result = detectRegimes(bars, options);
  if (onPoint) for (const point of result.points) onPoint(point);
  return result;
}

function cloneConfig(config: ResolvedRegimeDetectorConfig): ResolvedRegimeDetectorConfig {
  return {
    ...config,
    lookbacks: {
      ...config.lookbacks,
      adx: [...config.lookbacks.adx],
      atr: [...config.lookbacks.atr],
      movingAverages: [...config.lookbacks.movingAverages],
      efficiency: [...config.lookbacks.efficiency],
      regression: [...config.lookbacks.regression],
      realizedVolatility: [...config.lookbacks.realizedVolatility],
    },
    thresholds: { ...config.thresholds },
    enabledFeatures: { ...config.enabledFeatures },
  };
}
