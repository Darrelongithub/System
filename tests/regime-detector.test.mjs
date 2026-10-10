import { test, assert, assertEqual, assertDeepEqual } from "./tiny.mjs";
import { detectRegimes } from "../src/lib/regime-detector/index.ts";

function makeBars(length, kind = "trend-up", options = {}) {
  const bars = [];
  let close = options.start ?? 100;
  for (let i = 0; i < length; i++) {
    const previous = close;
    let step = 0;
    if (kind === "trend-up") step = 0.45 + Math.sin(i * 0.31) * 0.02;
    else if (kind === "trend-down") step = -0.45 + Math.sin(i * 0.31) * 0.02;
    else if (kind === "range") step = Math.sin(i * 1.7) * 0.35;
    else if (kind === "high-volatility")
      step = i < length - 55 ? Math.sin(i * 1.7) * 0.08 : (i % 2 ? 1 : -1) * 2.4;
    else if (kind === "compression")
      step = i < length - 35 ? Math.sin(i * 0.7) * 0.65 : Math.sin(i * 0.7) * 0.015;
    close = previous + step;
    const baseRange = kind === "high-volatility" && i >= length - 55 ? 2.6 : 0.2;
    const range = kind === "compression" && i >= length - 35 ? 0.02 : baseRange;
    const open = previous;
    const high = Math.max(open, close) + range;
    const low = Math.min(open, close) - range;
    const volume = options.missingVolume
      ? null
      : options.partialVolume && i % 4 === 0
        ? null
        : 1000 + (i % 13) * 19;
    bars.push({
      timestamp: new Date(Date.UTC(2024, 0, 1, 0, i)).toISOString(),
      open,
      high,
      low,
      close,
      volume,
    });
  }
  return bars;
}

function assertFiniteOrNull(value, path = "root") {
  if (typeof value === "number") {
    assert(Number.isFinite(value), `${path} must be finite, got ${value}`);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => assertFiniteOrNull(item, `${path}[${index}]`));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) assertFiniteOrNull(child, `${path}.${key}`);
  }
}

test("regime detector: computes the required feature families with finite warm-up values", () => {
  const bars = makeBars(320, "trend-up");
  const result = detectRegimes(bars, { hysteresisBars: 1 });
  assertEqual(result.points.length, bars.length, "one point must be emitted per input bar");
  assertEqual(result.points.at(-1).timestamp, bars.at(-1).timestamp, "timestamps remain aligned");
  const features = result.points.at(-1).features;

  for (const period of [14, 20]) {
    assert(Number.isFinite(features.adx[period]), `ADX(${period}) should be warmed up`);
    assert(Number.isFinite(features.plusDI[period]), `+DI(${period}) should be warmed up`);
    assert(Number.isFinite(features.minusDI[period]), `-DI(${period}) should be warmed up`);
    assert(Number.isFinite(features.atr[period]), `ATR(${period}) should be warmed up`);
  }
  for (const period of [20, 50, 100, 200]) {
    assert(
      Number.isFinite(features.sma[period]),
      `SMA(${period}) should be available after 320 bars`,
    );
    assert(
      Number.isFinite(features.ema[period]),
      `EMA(${period}) should be available after 320 bars`,
    );
    assert(
      Number.isFinite(features.smaDistancePct[period]),
      `SMA distance(${period}) should exist`,
    );
  }
  for (const period of [10, 14, 20, 30]) {
    assert(Number.isFinite(features.efficiencyRatio[period]), `ER(${period}) should be available`);
  }
  assert(Number.isFinite(features.parkinsonVolatility), "Parkinson volatility should be computed");
  assert(
    Number.isFinite(features.garmanKlassVolatility),
    "Garman–Klass volatility should be computed",
  );
  assert(Number.isFinite(features.bollingerBandwidth), "Bollinger bandwidth should be computed");
  assert(Number.isFinite(features.keltnerWidth), "Keltner width should be computed");
  assert(Number.isFinite(features.trueRangePercentile), "true-range percentile should be computed");
  assert(Number.isFinite(features.hurstExponent), "rolling Hurst estimate should be computed");
  assert(
    Number.isFinite(features.returnAutocorrelation[1]),
    "lag-one autocorrelation should be computed",
  );
  assert(Number.isFinite(features.varianceRatio), "variance ratio should be computed");
  assert(Number.isFinite(features.bodyRangeRatio), "body/range ratio should be computed");
  assert(Number.isFinite(features.candleOverlapPercent), "candle overlap should be computed");
  assert(Number.isFinite(features.returnSkewness), "rolling return skewness should be computed");
  assert(
    Number.isFinite(features.returnExcessKurtosis),
    "rolling return kurtosis should be computed",
  );
  assert(Number.isFinite(features.returnIqr), "return IQR should be computed");
  assert(
    Number.isFinite(features.volumeRatio),
    "volume ratio should be computed when volume exists",
  );
  assert(Number.isFinite(features.obvSlope), "OBV slope should be computed when volume exists");
  assertFiniteOrNull(result.points, "points");
});

test("regime detector: missing volume is represented as unavailable without breaking other features", () => {
  const withoutVolume = detectRegimes(makeBars(140, "range", { missingVolume: true }));
  const lastMissing = withoutVolume.points.at(-1).features;
  assertEqual(lastMissing.volume, null, "missing raw volume is retained as null");
  assertEqual(lastMissing.volumeAvailable, false, "volume availability is explicit");
  assertEqual(lastMissing.volumeRatio, null, "volume ratio is unavailable without volume");
  assertEqual(lastMissing.volumeSpikeScore, null, "volume spike is unavailable without volume");
  assert(Number.isFinite(lastMissing.atr[14]), "non-volume features continue to compute");

  const partial = detectRegimes(makeBars(140, "range", { partialVolume: true }));
  assert(
    Number.isFinite(partial.points.at(-1).features.volumeSma),
    "partial volume history is handled",
  );
});

test("regime detector: hysteresis delays a switch until N sampled bars agree", () => {
  const bars = makeBars(260, "trend-up");
  const result = detectRegimes(bars, { hysteresisBars: 3 });
  const bullishChange = result.changes.find((change) => change.to === "bullish-trend");
  assert(bullishChange, "persistent rising series should enter bullish-trend");
  assert(bullishChange.index >= 2, "three confirmations cannot commit before the third bar");
  assertEqual(
    result.points[bullishChange.index - 1].regime,
    "transition",
    "previous bar remains held",
  );
  assertEqual(
    result.points[bullishChange.index].features.barsInCurrentRegime,
    1,
    "duration restarts on switch",
  );
  assertEqual(
    result.points[bullishChange.index].features.barsSinceLastRegimeChange,
    0,
    "change age starts at zero",
  );
  assertEqual(result.points.at(-1).regime, "bullish-trend", "committed regime persists");
});

test("regime detector: distinguishes directional trend, range, volatility shock and compression", () => {
  const up = detectRegimes(makeBars(280, "trend-up"), { hysteresisBars: 2 });
  const down = detectRegimes(makeBars(280, "trend-down"), { hysteresisBars: 2 });
  const range = detectRegimes(makeBars(320, "range"), { hysteresisBars: 2 });
  const volatile = detectRegimes(makeBars(320, "high-volatility"), { hysteresisBars: 2 });
  const compressed = detectRegimes(makeBars(320, "compression"), { hysteresisBars: 2 });
  assertEqual(up.points.at(-1).regime, "bullish-trend", "persistent upward drift is bullish");
  assertEqual(down.points.at(-1).regime, "bearish-trend", "persistent downward drift is bearish");
  assertEqual(range.points.at(-1).regime, "range", "two-way low-efficiency path is a range");
  assert(
    volatile.changes.some((change) => change.to === "high-volatility"),
    "a large range/ATR expansion should trigger high-volatility",
  );
  assert(
    compressed.changes.some((change) => change.to === "compression"),
    "a sustained relative range contraction should trigger compression",
  );
});

test("regime detector: every prefix is invariant to future bars and future mutations", () => {
  const bars = makeBars(300, "trend-up");
  const options = { hysteresisBars: 2 };
  const full = detectRegimes(bars, options);
  const cutoff = 217;
  const prefix = detectRegimes(bars.slice(0, cutoff + 1), options);
  assertDeepEqual(
    prefix.points,
    full.points.slice(0, cutoff + 1),
    "future suffix changed prefix features or labels",
  );

  const altered = bars.map((bar, index) =>
    index <= cutoff
      ? bar
      : {
          ...bar,
          open: bar.open * 7,
          high: bar.high * 7,
          low: bar.low * 7,
          close: bar.close * 7,
          volume: (bar.volume ?? 0) * 11,
        },
  );
  const changedFuture = detectRegimes(altered, options);
  assertDeepEqual(
    full.points.slice(0, cutoff + 1),
    changedFuture.points.slice(0, cutoff + 1),
    "future data mutation leaked into earlier regime outputs",
  );
});

test("regime detector: configurable frequency, features, thresholds and change snapshots", () => {
  const bars = makeBars(260, "trend-down");
  const result = detectRegimes(bars, {
    hysteresisBars: 2,
    evaluationFrequency: 5,
    lookbacks: {
      atrReference: 30,
      hurst: 40,
      autocorrelation: 40,
      varianceRatio: 40,
      distribution: 40,
      rangePercentile: 40,
      trueRangePercentile: 40,
      structureWindow: 40,
    },
    enabledFeatures: { volume: false, distribution: false, volatility: false },
  });
  const point = result.points.at(-1);
  assert(point, "result has a point");
  assertEqual(
    point.features.returnIqr,
    null,
    "disabled distribution group emits null feature values",
  );
  assertEqual(point.features.volumeRatio, null, "disabled volume group emits null values");
  assertEqual(point.features.atr[14], null, "disabled volatility group hides ATR output");
  assert(
    Number.isFinite(point.features.regressionSlopeAtr[20]),
    "trend can use private ATR normalization",
  );
  assertEqual(result.config.evaluationFrequency, 5, "resolved frequency is visible in metadata");
  assertEqual(result.config.lookbacks.hurst, 40, "custom lookback is applied");
  const lastChangeIndex = result.points.findLastIndex((candidate) => candidate.changed);
  const expectedDuration =
    lastChangeIndex < 0 ? result.points.length : result.points.length - lastChangeIndex;
  assertEqual(
    point.features.barsInCurrentRegime,
    expectedDuration,
    "duration reflects the last switch",
  );
  for (const change of result.changes) {
    assert(
      change.features && Number.isFinite(change.features.close),
      "change carries a feature snapshot",
    );
    assertEqual(
      change.features.barsSinceLastRegimeChange,
      0,
      "change snapshot is aligned to the change bar",
    );
  }
});

test("regime detector: validates chronology, geometry, volume and configuration", () => {
  const valid = makeBars(2);
  let threw = false;
  try {
    detectRegimes([valid[1], valid[0]]);
  } catch (error) {
    threw = error instanceof RangeError;
  }
  assert(threw, "out-of-order input must be rejected rather than silently sorted");

  threw = false;
  try {
    detectRegimes([{ ...valid[0], low: valid[0].high + 1 }]);
  } catch (error) {
    threw = error instanceof RangeError;
  }
  assert(threw, "invalid OHLC geometry must be rejected");

  threw = false;
  try {
    detectRegimes([{ ...valid[0], volume: -1 }]);
  } catch (error) {
    threw = error instanceof RangeError;
  }
  assert(threw, "negative volume must be rejected");

  threw = false;
  try {
    detectRegimes(valid, { hysteresisBars: 0 });
  } catch (error) {
    threw = error instanceof RangeError;
  }
  assert(threw, "invalid hysteresis configuration must be rejected");
});
