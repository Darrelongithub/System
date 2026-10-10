import type {
  NullableNumber,
  RegimeBar,
  RegimeFeatureSet,
  ResolvedRegimeDetectorConfig,
  SwingStructure,
} from "./types";

type Series = NullableNumber[];

function nullableMap(periods: readonly number[]): Record<number, NullableNumber> {
  const result: Record<number, NullableNumber> = {};
  for (const period of periods) result[period] = null;
  return result;
}

function uniquePeriods(periods: readonly number[]): number[] {
  return [...new Set(periods)].sort((a, b) => a - b);
}

function timestampMilliseconds(timestamp: string | number, index: number): number {
  if (typeof timestamp === "number") {
    if (Number.isFinite(timestamp)) return timestamp;
    throw new TypeError(`bar ${index} timestamp must be finite`);
  }
  if (typeof timestamp !== "string" || timestamp.trim() === "") {
    throw new TypeError(`bar ${index} timestamp must be a non-empty string or epoch milliseconds`);
  }
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) {
    throw new TypeError(`bar ${index} has an unparseable timestamp: ${timestamp}`);
  }
  return milliseconds;
}

/** Validate input once so indicator loops can stay branch-light and deterministic. */
export function validateRegimeBars(bars: readonly RegimeBar[]): RegimeBar[] {
  if (!Array.isArray(bars)) throw new TypeError("bars must be an array");
  const normalized: RegimeBar[] = [];
  let priorTimestamp: number | undefined;

  for (let index = 0; index < bars.length; index++) {
    const bar = bars[index];
    if (!bar || typeof bar !== "object") throw new TypeError(`bar ${index} must be an object`);
    const timestamp = timestampMilliseconds(bar.timestamp, index);
    if (priorTimestamp !== undefined && timestamp <= priorTimestamp) {
      throw new RangeError(
        `timestamps must be strictly increasing; duplicate or out-of-order value at bar ${index}`,
      );
    }
    priorTimestamp = timestamp;

    const { open, high, low, close } = bar;
    if (![open, high, low, close].every(Number.isFinite)) {
      throw new TypeError(`bar ${index} OHLC values must all be finite numbers`);
    }
    if (low > high || low > open || low > close || high < open || high < close) {
      throw new RangeError(`bar ${index} has invalid OHLC geometry`);
    }

    let volume: number | null = null;
    if (bar.volume !== undefined && bar.volume !== null) {
      if (!Number.isFinite(bar.volume) || bar.volume < 0) {
        throw new RangeError(`bar ${index} volume must be a finite, non-negative number or null`);
      }
      volume = bar.volume;
    }
    normalized.push({ timestamp: bar.timestamp, open, high, low, close, volume });
  }
  return normalized;
}

function emptyFeature(bar: RegimeBar, config: ResolvedRegimeDetectorConfig): RegimeFeatureSet {
  const lookbacks = config.lookbacks;
  const atrPeriods = uniquePeriods([...lookbacks.atr, lookbacks.keltner]);
  const returnLags = [1, 2, 5];
  return {
    timestamp: bar.timestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume ?? null,
    volumeAvailable: bar.volume !== null && bar.volume !== undefined,
    logReturn: null,
    trueRange: null,
    adx: nullableMap(lookbacks.adx),
    plusDI: nullableMap(lookbacks.adx),
    minusDI: nullableMap(lookbacks.adx),
    adxSlope: nullableMap(lookbacks.adx),
    regressionSlope: nullableMap(lookbacks.regression),
    regressionSlopeAtr: nullableMap(lookbacks.regression),
    regressionSlopePct: nullableMap(lookbacks.regression),
    sma: nullableMap(lookbacks.movingAverages),
    ema: nullableMap(lookbacks.movingAverages),
    smaDistancePct: nullableMap(lookbacks.movingAverages),
    emaDistancePct: nullableMap(lookbacks.movingAverages),
    maAlignmentScore: null,
    higherHighCount: null,
    higherLowCount: null,
    lowerHighCount: null,
    lowerLowCount: null,
    swingStructure: config.enabledFeatures.trend ? "insufficient" : "disabled",
    efficiencyRatio: nullableMap(lookbacks.efficiency),
    atr: nullableMap(atrPeriods),
    atrPercent: nullableMap(atrPeriods),
    atrReference: null,
    atrRelative: null,
    trueRangeRelative: null,
    rangeRelative: null,
    realizedVolatility: nullableMap(lookbacks.realizedVolatility),
    parkinsonVolatility: null,
    garmanKlassVolatility: null,
    bollingerBandwidth: null,
    keltnerWidth: null,
    trueRangePercentile: null,
    volatilityOfVolatility: null,
    hurstExponent: null,
    returnAutocorrelation: nullableMap(returnLags),
    varianceRatio: null,
    bodyRangeRatio: null,
    upperWickRatio: null,
    lowerWickRatio: null,
    candleOverlapPercent: null,
    consecutiveSameDirectionCloses: 0,
    consecutiveSameDirectionCandles: 0,
    rangePercentile: null,
    rangeCompressionPercentile: null,
    rangeExpansionPercentile: null,
    volumeSma: null,
    volumeRatio: null,
    volumeSpikeScore: null,
    obvSlope: null,
    upDownVolumeRatio: null,
    returnSkewness: null,
    returnExcessKurtosis: null,
    returnQuantile10: null,
    returnQuantile25: null,
    returnQuantile50: null,
    returnQuantile75: null,
    returnQuantile90: null,
    returnIqr: null,
    barsInCurrentRegime: 0,
    barsSinceLastRegimeChange: 0,
  };
}

function rollingMean(values: readonly NullableNumber[], period: number): Series {
  const out: Series = Array(values.length).fill(null);
  let sum = 0;
  let missing = 0;
  for (let i = 0; i < values.length; i++) {
    const current = values[i];
    if (current === null || current === undefined || !Number.isFinite(current)) missing++;
    else sum += current;

    const leavingIndex = i - period;
    if (leavingIndex >= 0) {
      const leaving = values[leavingIndex];
      if (leaving === null || leaving === undefined || !Number.isFinite(leaving)) missing--;
      else sum -= leaving;
    }
    if (i >= period - 1 && missing === 0) out[i] = sum / period;
  }
  return out;
}

function rollingStd(values: readonly NullableNumber[], period: number): Series {
  const out: Series = Array(values.length).fill(null);
  let sum = 0;
  let sumSquares = 0;
  let missing = 0;
  for (let i = 0; i < values.length; i++) {
    const current = values[i];
    if (current === null || current === undefined || !Number.isFinite(current)) {
      missing++;
    } else {
      sum += current;
      sumSquares += current * current;
    }

    const leavingIndex = i - period;
    if (leavingIndex >= 0) {
      const leaving = values[leavingIndex];
      if (leaving === null || leaving === undefined || !Number.isFinite(leaving)) {
        missing--;
      } else {
        sum -= leaving;
        sumSquares -= leaving * leaving;
      }
    }
    if (i >= period - 1 && missing === 0) {
      const mean = sum / period;
      out[i] = Math.sqrt(Math.max(0, sumSquares / period - mean * mean));
    }
  }
  return out;
}

function rollingMedian(values: readonly NullableNumber[], period: number): Series {
  const out: Series = Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const start = i - period + 1;
    const window = values.slice(start, i + 1);
    if (window.some((value) => value === null || value === undefined || !Number.isFinite(value))) {
      continue;
    }
    const sorted = (window as number[]).slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    out[i] =
      sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
  }
  return out;
}

function percentileRank(values: readonly NullableNumber[], period: number): Series {
  const out: Series = Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const current = values[i];
    if (current === null || current === undefined || !Number.isFinite(current)) continue;
    const start = i - period + 1;
    let less = 0;
    let equal = 0;
    let valid = 0;
    for (let j = start; j <= i; j++) {
      const value = values[j];
      if (value === null || value === undefined || !Number.isFinite(value)) break;
      valid++;
      if (value < current) less++;
      else if (value === current) equal++;
    }
    if (valid === period) out[i] = (less + equal / 2) / period;
  }
  return out;
}

function exponentialMovingAverage(values: readonly number[], period: number): Series {
  const out: Series = Array(values.length).fill(null);
  if (values.length < period) return out;
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i]!;
  let previous = seed / period;
  out[period - 1] = previous;
  const alpha = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    previous = values[i]! * alpha + previous * (1 - alpha);
    out[i] = previous;
  }
  return out;
}

function regressionSlope(values: readonly NullableNumber[], period: number): Series {
  const out: Series = Array(values.length).fill(null);
  const meanX = (period - 1) / 2;
  let denominator = 0;
  for (let x = 0; x < period; x++) denominator += (x - meanX) ** 2;
  if (denominator === 0) return out;

  for (let i = period - 1; i < values.length; i++) {
    const start = i - period + 1;
    let sumY = 0;
    let sumXY = 0;
    let valid = true;
    for (let offset = 0; offset < period; offset++) {
      const value = values[start + offset];
      if (value === null || value === undefined || !Number.isFinite(value)) {
        valid = false;
        break;
      }
      sumY += value;
      sumXY += offset * value;
    }
    if (valid) out[i] = (sumXY - meanX * sumY) / denominator;
  }
  return out;
}

function wilderMean(values: readonly NullableNumber[], period: number): Series {
  const out: Series = Array(values.length).fill(null);
  let seedSum = 0;
  let seedCount = 0;
  let average: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value === null || value === undefined || !Number.isFinite(value)) {
      seedSum = 0;
      seedCount = 0;
      average = null;
      continue;
    }
    if (average === null) {
      seedSum += value;
      seedCount++;
      if (seedCount === period) {
        average = seedSum / period;
        out[i] = average;
      }
    } else {
      average = (average * (period - 1) + value) / period;
      out[i] = average;
    }
  }
  return out;
}

function trueRangeSeries(bars: readonly RegimeBar[]): number[] {
  const tr: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]!;
    if (i === 0) {
      tr.push(bar.high - bar.low);
      continue;
    }
    const priorClose = bars[i - 1]!.close;
    tr.push(
      Math.max(bar.high - bar.low, Math.abs(bar.high - priorClose), Math.abs(bar.low - priorClose)),
    );
  }
  return tr;
}

function directionalSeries(
  bars: readonly RegimeBar[],
  trueRanges: readonly number[],
  period: number,
): { atr: Series; plusDI: Series; minusDI: Series; adx: Series } {
  const positiveMovement: Series = Array(bars.length).fill(0);
  const negativeMovement: Series = Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i]!.high - bars[i - 1]!.high;
    const down = bars[i - 1]!.low - bars[i]!.low;
    positiveMovement[i] = up > down && up > 0 ? up : 0;
    negativeMovement[i] = down > up && down > 0 ? down : 0;
  }

  const trSeries: Series = trueRanges.slice();
  const atr = wilderMean(trSeries, period);
  const smoothPositive = wilderMean(positiveMovement, period);
  const smoothNegative = wilderMean(negativeMovement, period);
  const plusDI: Series = Array(bars.length).fill(null);
  const minusDI: Series = Array(bars.length).fill(null);
  const dx: Series = Array(bars.length).fill(null);

  for (let i = 0; i < bars.length; i++) {
    const atrValue = atr[i];
    const pos = smoothPositive[i];
    const neg = smoothNegative[i];
    if (atrValue === null || pos === null || neg === null || atrValue === 0) continue;
    plusDI[i] = (100 * pos) / atrValue;
    minusDI[i] = (100 * neg) / atrValue;
    const diSum = plusDI[i]! + minusDI[i]!;
    dx[i] = diSum === 0 ? 0 : (100 * Math.abs(plusDI[i]! - minusDI[i]!)) / diSum;
  }
  return { atr, plusDI, minusDI, adx: wilderMean(dx, period) };
}

function pivotAt(
  values: readonly number[],
  pivotIndex: number,
  strength: number,
  isHigh: boolean,
): boolean {
  const candidate = values[pivotIndex]!;
  for (let i = pivotIndex - strength; i <= pivotIndex + strength; i++) {
    if (i === pivotIndex) continue;
    // Strict ties are deliberately not pivots: flat plateaus cannot produce
    // duplicate swing events, and the decision is known only at confirmation.
    if (isHigh ? values[i]! >= candidate : values[i]! <= candidate) return false;
  }
  return true;
}

type SwingEventKind = "higherHigh" | "lowerHigh" | "higherLow" | "lowerLow";
interface SwingEvent {
  index: number;
  kind: SwingEventKind;
}

function swingStructureSeries(
  bars: readonly RegimeBar[],
  strength: number,
  window: number,
): Array<{
  higherHigh: number;
  higherLow: number;
  lowerHigh: number;
  lowerLow: number;
  structure: SwingStructure;
}> {
  const output: Array<{
    higherHigh: number;
    higherLow: number;
    lowerHigh: number;
    lowerLow: number;
    structure: SwingStructure;
  }> = [];
  const events: SwingEvent[] = [];
  const counts: Record<SwingEventKind, number> = {
    higherHigh: 0,
    lowerHigh: 0,
    higherLow: 0,
    lowerLow: 0,
  };
  let eventHead = 0;
  let previousPivotHigh: number | null = null;
  let previousPivotLow: number | null = null;
  let seenHighPivots = 0;
  let seenLowPivots = 0;
  const highs = bars.map((bar) => bar.high);
  const lows = bars.map((bar) => bar.low);

  const addEvent = (index: number, kind: SwingEventKind) => {
    events.push({ index, kind });
    counts[kind]++;
  };

  for (let i = 0; i < bars.length; i++) {
    const pivotIndex = i - strength;
    if (pivotIndex >= strength && pivotIndex + strength <= i) {
      if (pivotAt(highs, pivotIndex, strength, true)) {
        const value = bars[pivotIndex]!.high;
        if (previousPivotHigh !== null) {
          if (value > previousPivotHigh) addEvent(i, "higherHigh");
          else if (value < previousPivotHigh) addEvent(i, "lowerHigh");
        }
        previousPivotHigh = value;
        seenHighPivots++;
      }
      if (pivotAt(lows, pivotIndex, strength, false)) {
        const value = bars[pivotIndex]!.low;
        if (previousPivotLow !== null) {
          if (value > previousPivotLow) addEvent(i, "higherLow");
          else if (value < previousPivotLow) addEvent(i, "lowerLow");
        }
        previousPivotLow = value;
        seenLowPivots++;
      }
    }

    const firstAllowed = i - window + 1;
    while (eventHead < events.length && events[eventHead]!.index < firstAllowed) {
      const expired = events[eventHead]!;
      counts[expired.kind]--;
      eventHead++;
    }
    if (eventHead > 1024 && eventHead * 2 > events.length) {
      events.splice(0, eventHead);
      eventHead = 0;
    }

    const bullish = counts.higherHigh + counts.higherLow;
    const bearish = counts.lowerHigh + counts.lowerLow;
    let structure: SwingStructure = "insufficient";
    if (seenHighPivots >= 2 && seenLowPivots >= 2) {
      if (counts.higherHigh > 0 && counts.higherLow > 0 && bullish > bearish) {
        structure = "bullish";
      } else if (counts.lowerHigh > 0 && counts.lowerLow > 0 && bearish > bullish) {
        structure = "bearish";
      } else {
        structure = "mixed";
      }
    }
    output.push({
      higherHigh: counts.higherHigh,
      higherLow: counts.higherLow,
      lowerHigh: counts.lowerHigh,
      lowerLow: counts.lowerLow,
      structure,
    });
  }
  return output;
}

function autocorrelation(values: readonly NullableNumber[], lag: number, period: number): Series {
  const out: Series = Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const start = i - period + 1;
    const left: number[] = [];
    const right: number[] = [];
    for (let j = start + lag; j <= i; j++) {
      const a = values[j - lag];
      const b = values[j];
      if (a === null || a === undefined || b === null || b === undefined) {
        left.length = 0;
        right.length = 0;
        break;
      }
      left.push(a);
      right.push(b);
    }
    if (left.length < 2) continue;
    const meanLeft = left.reduce((sum, value) => sum + value, 0) / left.length;
    const meanRight = right.reduce((sum, value) => sum + value, 0) / right.length;
    let covariance = 0;
    let varianceLeft = 0;
    let varianceRight = 0;
    for (let j = 0; j < left.length; j++) {
      const a = left[j]! - meanLeft;
      const b = right[j]! - meanRight;
      covariance += a * b;
      varianceLeft += a * a;
      varianceRight += b * b;
    }
    const denominator = Math.sqrt(varianceLeft * varianceRight);
    if (denominator > 0) out[i] = covariance / denominator;
  }
  return out;
}

function varianceRatioSeries(
  returns: readonly NullableNumber[],
  window: number,
  horizon: number,
): Series {
  const out: Series = Array(returns.length).fill(null);
  for (let i = window - 1; i < returns.length; i++) {
    const start = i - window + 1;
    const base: number[] = [];
    for (let j = start; j <= i; j++) {
      const value = returns[j];
      if (value === null || value === undefined) {
        base.length = 0;
        break;
      }
      base.push(value);
    }
    if (base.length !== window) continue;
    const mean = base.reduce((sum, value) => sum + value, 0) / base.length;
    const baseVariance = base.reduce((sum, value) => sum + (value - mean) ** 2, 0) / base.length;
    if (baseVariance === 0) continue;

    const aggregates: number[] = [];
    for (let j = horizon - 1; j < base.length; j++) {
      let aggregate = 0;
      for (let k = j - horizon + 1; k <= j; k++) aggregate += base[k]!;
      aggregates.push(aggregate);
    }
    const aggregateMean = aggregates.reduce((sum, value) => sum + value, 0) / aggregates.length;
    const aggregateVariance =
      aggregates.reduce((sum, value) => sum + (value - aggregateMean) ** 2, 0) / aggregates.length;
    out[i] = aggregateVariance / (horizon * baseVariance);
  }
  return out;
}

function hurstSeries(returns: readonly NullableNumber[], period: number): Series {
  const out: Series = Array(returns.length).fill(null);
  for (let i = period - 1; i < returns.length; i++) {
    const start = i - period + 1;
    const sample: number[] = [];
    for (let j = start; j <= i; j++) {
      const value = returns[j];
      if (value === null || value === undefined) {
        sample.length = 0;
        break;
      }
      sample.push(value);
    }
    if (sample.length !== period) continue;

    const points: Array<[number, number]> = [];
    for (let scale = 1; scale <= Math.floor(period / 8); scale *= 2) {
      const aggregated: number[] = [];
      for (let j = scale - 1; j < sample.length; j++) {
        let total = 0;
        for (let k = j - scale + 1; k <= j; k++) total += sample[k]!;
        aggregated.push(total);
      }
      if (aggregated.length < 8) continue;
      const mean = aggregated.reduce((sum, value) => sum + value, 0) / aggregated.length;
      const variance =
        aggregated.reduce((sum, value) => sum + (value - mean) ** 2, 0) / aggregated.length;
      if (variance > 0) points.push([Math.log(scale), Math.log(variance)]);
    }
    if (points.length < 2) continue;
    const xMean = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const yMean = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    let numerator = 0;
    let denominator = 0;
    for (const [x, y] of points) {
      numerator += (x - xMean) * (y - yMean);
      denominator += (x - xMean) ** 2;
    }
    if (denominator > 0) out[i] = Math.max(0, Math.min(1, numerator / denominator / 2));
  }
  return out;
}

function quantile(sorted: readonly number[], probability: number): number {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  return sorted[lower]! * (1 - fraction) + sorted[upper]! * fraction;
}

function rollingVolumeFeatures(
  bars: readonly RegimeBar[],
  period: number,
): {
  sma: Series;
  ratio: Series;
  spike: Series;
  upDownRatio: Series;
  obvSlope: Series;
} {
  const length = bars.length;
  const sma: Series = Array(length).fill(null);
  const ratio: Series = Array(length).fill(null);
  const spike: Series = Array(length).fill(null);
  const upDownRatio: Series = Array(length).fill(null);
  const obvSlope: Series = Array(length).fill(null);
  const obv: Series = Array(length).fill(null);
  let runningObv = 0;

  for (let i = 0; i < length; i++) {
    const bar = bars[i]!;
    if (i === 0) {
      if (bar.volume !== null && bar.volume !== undefined) obv[i] = 0;
    } else if (bar.volume !== null && bar.volume !== undefined) {
      const direction = Math.sign(bar.close - bars[i - 1]!.close);
      runningObv += direction * bar.volume;
      obv[i] = runningObv;
    }

    const start = Math.max(0, i - period + 1);
    const validVolumes: number[] = [];
    let upVolume = 0;
    let downVolume = 0;
    for (let j = start; j <= i; j++) {
      const volume = bars[j]!.volume;
      if (volume === null || volume === undefined) continue;
      validVolumes.push(volume);
      if (j > 0) {
        const direction = Math.sign(bars[j]!.close - bars[j - 1]!.close);
        if (direction > 0) upVolume += volume;
        else if (direction < 0) downVolume += volume;
      }
    }
    const requiredSamples = Math.max(1, Math.ceil(period / 2));
    if (validVolumes.length >= requiredSamples) {
      const mean = validVolumes.reduce((sum, value) => sum + value, 0) / validVolumes.length;
      sma[i] = mean;
      if (bar.volume !== null && bar.volume !== undefined && mean > 0) ratio[i] = bar.volume / mean;
      if (downVolume > 0) upDownRatio[i] = upVolume / downVolume;
      if (validVolumes.length >= 2) {
        const variance =
          validVolumes.reduce((sum, value) => sum + (value - mean) ** 2, 0) / validVolumes.length;
        const standardDeviation = Math.sqrt(Math.max(0, variance));
        if (bar.volume !== null && bar.volume !== undefined) {
          spike[i] = standardDeviation > 0 ? (bar.volume - mean) / standardDeviation : 0;
        }
      }
    }
  }
  const slopes = regressionSlope(obv, period);
  for (let i = 0; i < length; i++) obvSlope[i] = slopes[i];
  return { sma, ratio, spike, upDownRatio, obvSlope };
}

function distributionFeatures(
  returns: readonly NullableNumber[],
  period: number,
): Array<{
  skewness: NullableNumber;
  excessKurtosis: NullableNumber;
  p10: NullableNumber;
  p25: NullableNumber;
  p50: NullableNumber;
  p75: NullableNumber;
  p90: NullableNumber;
  iqr: NullableNumber;
}> {
  return returns.map((_, index) => {
    if (index < period - 1) {
      return {
        skewness: null,
        excessKurtosis: null,
        p10: null,
        p25: null,
        p50: null,
        p75: null,
        p90: null,
        iqr: null,
      };
    }
    const start = index - period + 1;
    const values: number[] = [];
    for (let i = start; i <= index; i++) {
      const value = returns[i];
      if (value === null || value === undefined) {
        values.length = 0;
        break;
      }
      values.push(value);
    }
    if (values.length !== period) {
      return {
        skewness: null,
        excessKurtosis: null,
        p10: null,
        p25: null,
        p50: null,
        p75: null,
        p90: null,
        iqr: null,
      };
    }
    const mean = values.reduce((sum, value) => sum + value, 0) / period;
    let m2 = 0;
    let m3 = 0;
    let m4 = 0;
    for (const value of values) {
      const delta = value - mean;
      m2 += delta ** 2;
      m3 += delta ** 3;
      m4 += delta ** 4;
    }
    m2 /= period;
    m3 /= period;
    m4 /= period;
    const standardDeviation = Math.sqrt(m2);
    const sorted = values.slice().sort((a, b) => a - b);
    const p10 = quantile(sorted, 0.1);
    const p25 = quantile(sorted, 0.25);
    const p50 = quantile(sorted, 0.5);
    const p75 = quantile(sorted, 0.75);
    const p90 = quantile(sorted, 0.9);
    return {
      skewness: standardDeviation > 0 ? m3 / standardDeviation ** 3 : 0,
      excessKurtosis: m2 > 0 ? m4 / m2 ** 2 - 3 : 0,
      p10,
      p25,
      p50,
      p75,
      p90,
      iqr: p75 - p25,
    };
  });
}

/** Compute all configured feature families for each bar, using trailing data only. */
export function computeRegimeFeatures(
  barsInput: readonly RegimeBar[],
  config: ResolvedRegimeDetectorConfig,
): RegimeFeatureSet[] {
  const bars = validateRegimeBars(barsInput);
  const length = bars.length;
  const lookbacks = config.lookbacks;
  const enabled = config.enabledFeatures;
  const rows = bars.map((bar) => emptyFeature(bar, config));
  if (length === 0) return rows;

  const closes = bars.map((bar) => bar.close);
  const trueRanges = trueRangeSeries(bars);
  const returns: Series = Array(length).fill(null);
  const normalizedRanges: Series = Array(length).fill(null);
  for (let i = 0; i < length; i++) {
    const bar = bars[i]!;
    rows[i]!.trueRange = trueRanges[i]!;
    if (i > 0 && closes[i]! > 0 && closes[i - 1]! > 0) {
      returns[i] = Math.log(closes[i]! / closes[i - 1]!);
      rows[i]!.logReturn = returns[i];
    }
    if (Math.abs(bar.close) > Number.EPSILON) {
      normalizedRanges[i] = ((bar.high - bar.low) / Math.abs(bar.close)) * 100;
    }
  }

  const directionalPeriods = uniquePeriods([...lookbacks.adx, ...lookbacks.atr, lookbacks.keltner]);
  const directionalByPeriod = new Map<number, ReturnType<typeof directionalSeries>>();
  for (const period of directionalPeriods) {
    directionalByPeriod.set(period, directionalSeries(bars, trueRanges, period));
  }

  if (enabled.trend) {
    const atrForSlope = directionalByPeriod.get(lookbacks.atr[0]!)?.atr ?? [];
    for (const period of lookbacks.adx) {
      const directional = directionalByPeriod.get(period)!;
      const adxSlopes = regressionSlope(directional.adx, lookbacks.adxSlope);
      for (let i = 0; i < length; i++) {
        rows[i]!.adx[period] = directional.adx[i];
        rows[i]!.plusDI[period] = directional.plusDI[i];
        rows[i]!.minusDI[period] = directional.minusDI[i];
        rows[i]!.adxSlope[period] = adxSlopes[i];
      }
    }

    const smaByPeriod = new Map<number, Series>();
    const emaByPeriod = new Map<number, Series>();
    for (const period of lookbacks.movingAverages) {
      const sma = rollingMean(closes, period);
      const ema = exponentialMovingAverage(closes, period);
      smaByPeriod.set(period, sma);
      emaByPeriod.set(period, ema);
      for (let i = 0; i < length; i++) {
        const bar = bars[i]!;
        rows[i]!.sma[period] = sma[i];
        rows[i]!.ema[period] = ema[i];
        const smaValue = sma[i];
        const emaValue = ema[i];
        if (smaValue !== null && smaValue !== undefined && Math.abs(smaValue) > Number.EPSILON) {
          rows[i]!.smaDistancePct[period] = (bar.close / smaValue - 1) * 100;
        }
        if (emaValue !== null && emaValue !== undefined && Math.abs(emaValue) > Number.EPSILON) {
          rows[i]!.emaDistancePct[period] = (bar.close / emaValue - 1) * 100;
        }
      }
    }

    const sortedMaPeriods = [...lookbacks.movingAverages].sort((a, b) => a - b);
    const maPairs: Array<[number, number, "sma" | "ema"]> = [];
    for (const kind of ["sma", "ema"] as const) {
      for (let fast = 0; fast < sortedMaPeriods.length; fast++) {
        for (let slow = fast + 1; slow < sortedMaPeriods.length; slow++) {
          maPairs.push([sortedMaPeriods[fast]!, sortedMaPeriods[slow]!, kind]);
        }
      }
    }
    for (let i = 0; i < length; i++) {
      const comparisons: number[] = [];
      for (const [fast, slow, kind] of maPairs) {
        const map = kind === "sma" ? smaByPeriod : emaByPeriod;
        const fastValue = map.get(fast)?.[i];
        const slowValue = map.get(slow)?.[i];
        if (
          fastValue === null ||
          fastValue === undefined ||
          slowValue === null ||
          slowValue === undefined
        ) {
          continue;
        }
        comparisons.push(Math.sign(fastValue - slowValue));
      }
      if (comparisons.length > 0) {
        rows[i]!.maAlignmentScore =
          comparisons.reduce((sum, value) => sum + value, 0) / comparisons.length;
      }
    }

    for (const period of lookbacks.regression) {
      const slope = regressionSlope(closes, period);
      for (let i = 0; i < length; i++) {
        rows[i]!.regressionSlope[period] = slope[i];
        const atr = atrForSlope[i];
        if (
          slope[i] !== null &&
          slope[i] !== undefined &&
          atr !== null &&
          atr !== undefined &&
          atr > 0
        ) {
          rows[i]!.regressionSlopeAtr[period] = slope[i]! / atr;
        }
        const close = closes[i]!;
        if (slope[i] !== null && slope[i] !== undefined && Math.abs(close) > Number.EPSILON) {
          rows[i]!.regressionSlopePct[period] = (slope[i]! / Math.abs(close)) * 100;
        }
      }
    }

    const swingData = swingStructureSeries(
      bars,
      lookbacks.swingStrength,
      lookbacks.structureWindow,
    );
    for (let i = 0; i < length; i++) {
      rows[i]!.higherHighCount = swingData[i]!.higherHigh;
      rows[i]!.higherLowCount = swingData[i]!.higherLow;
      rows[i]!.lowerHighCount = swingData[i]!.lowerHigh;
      rows[i]!.lowerLowCount = swingData[i]!.lowerLow;
      rows[i]!.swingStructure = swingData[i]!.structure;
    }
  }

  if (enabled.efficiency) {
    for (const period of lookbacks.efficiency) {
      for (let i = period; i < length; i++) {
        let pathLength = 0;
        for (let j = i - period + 1; j <= i; j++) {
          pathLength += Math.abs(closes[j]! - closes[j - 1]!);
        }
        rows[i]!.efficiencyRatio[period] =
          pathLength > 0 ? Math.min(1, Math.abs(closes[i]! - closes[i - period]!) / pathLength) : 0;
      }
    }
  }

  const atrPeriodsForOutput = uniquePeriods([...lookbacks.atr, lookbacks.keltner]);
  if (enabled.volatility) {
    for (const period of atrPeriodsForOutput) {
      const atr = directionalByPeriod.get(period)!.atr;
      for (let i = 0; i < length; i++) {
        rows[i]!.atr[period] = atr[i];
        if (atr[i] !== null && atr[i] !== undefined && Math.abs(closes[i]!) > Number.EPSILON) {
          rows[i]!.atrPercent[period] = (100 * atr[i]!) / Math.abs(closes[i]!);
        }
      }
    }
  }

  if (enabled.volatility) {
    const referenceAtrPeriod = lookbacks.atr[0]!;
    const referenceAtr = directionalByPeriod.get(referenceAtrPeriod)!.atr;
    const atrBaseline =
      config.atrReferenceMethod === "median"
        ? rollingMedian(referenceAtr, lookbacks.atrReference)
        : rollingMean(referenceAtr, lookbacks.atrReference);
    for (let i = 0; i < length; i++) {
      rows[i]!.atrReference = atrBaseline[i];
      if (
        referenceAtr[i] !== null &&
        referenceAtr[i] !== undefined &&
        atrBaseline[i] !== null &&
        atrBaseline[i]! > 0
      ) {
        rows[i]!.atrRelative = referenceAtr[i]! / atrBaseline[i]!;
      }
    }
    const trueRangeBaseline =
      config.atrReferenceMethod === "median"
        ? rollingMedian(trueRanges, lookbacks.trueRangePercentile)
        : rollingMean(trueRanges, lookbacks.trueRangePercentile);
    for (let i = 0; i < length; i++) {
      const baseline = trueRangeBaseline[i];
      if (baseline !== null && baseline !== undefined && baseline > 0) {
        rows[i]!.trueRangeRelative = trueRanges[i]! / baseline;
      }
    }

    const realizedByPeriod = new Map<number, Series>();
    for (const period of lookbacks.realizedVolatility) {
      const realized = rollingStd(returns, period);
      realizedByPeriod.set(period, realized);
      for (let i = 0; i < length; i++) rows[i]!.realizedVolatility[period] = realized[i];
    }
    const volOfVolBasePeriod = lookbacks.realizedVolatility.includes(20)
      ? 20
      : lookbacks.realizedVolatility[0]!;
    const volOfVol = rollingStd(
      realizedByPeriod.get(volOfVolBasePeriod)!,
      lookbacks.volatilityOfVolatility,
    );
    const logRangeVariance: Series = Array(length).fill(null);
    const gkVariance: Series = Array(length).fill(null);
    for (let i = 0; i < length; i++) {
      const bar = bars[i]!;
      if (bar.low > 0 && bar.high > 0) {
        const logRange = Math.log(bar.high / bar.low);
        logRangeVariance[i] = (logRange * logRange) / (4 * Math.LN2);
      }
      if (bar.open > 0 && bar.close > 0 && bar.low > 0 && bar.high > 0) {
        const logRange = Math.log(bar.high / bar.low);
        const logBody = Math.log(bar.close / bar.open);
        gkVariance[i] = 0.5 * logRange ** 2 - (2 * Math.LN2 - 1) * logBody ** 2;
      }
    }
    const parkinsonMean = rollingMean(logRangeVariance, lookbacks.volatilityEstimator);
    const gkMean = rollingMean(gkVariance, lookbacks.volatilityEstimator);
    const bollingerMean = rollingMean(closes, lookbacks.bollinger);
    const bollingerStd = rollingStd(closes, lookbacks.bollinger);
    const keltnerEma = exponentialMovingAverage(closes, lookbacks.keltner);
    const keltnerAtr = directionalByPeriod.get(lookbacks.keltner)!.atr;
    const trueRangeRanks = percentileRank(trueRanges, lookbacks.trueRangePercentile);

    for (let i = 0; i < length; i++) {
      rows[i]!.volatilityOfVolatility = volOfVol[i];
      if (parkinsonMean[i] !== null && parkinsonMean[i] !== undefined) {
        rows[i]!.parkinsonVolatility = Math.sqrt(Math.max(0, parkinsonMean[i]!));
      }
      if (gkMean[i] !== null && gkMean[i] !== undefined) {
        rows[i]!.garmanKlassVolatility = Math.sqrt(Math.max(0, gkMean[i]!));
      }
      if (
        bollingerMean[i] !== null &&
        bollingerMean[i] !== undefined &&
        bollingerStd[i] !== null &&
        bollingerStd[i] !== undefined &&
        Math.abs(bollingerMean[i]!) > Number.EPSILON
      ) {
        rows[i]!.bollingerBandwidth = (4 * bollingerStd[i]!) / Math.abs(bollingerMean[i]!);
      }
      if (
        keltnerEma[i] !== null &&
        keltnerEma[i] !== undefined &&
        keltnerAtr[i] !== null &&
        keltnerAtr[i] !== undefined &&
        Math.abs(keltnerEma[i]!) > Number.EPSILON
      ) {
        // Width of EMA ± 2 ATR, normalized to the channel midline.
        rows[i]!.keltnerWidth = (4 * keltnerAtr[i]!) / Math.abs(keltnerEma[i]!);
      }
      rows[i]!.trueRangePercentile = trueRangeRanks[i];
    }
  }

  if (enabled.persistence) {
    const autocorrelationByLag = new Map<number, Series>();
    for (const lag of [1, 2, 5]) {
      autocorrelationByLag.set(lag, autocorrelation(returns, lag, lookbacks.autocorrelation));
    }
    for (let i = 0; i < length; i++) {
      for (const lag of [1, 2, 5]) {
        rows[i]!.returnAutocorrelation[lag] = autocorrelationByLag.get(lag)![i];
      }
    }
    const hurst = hurstSeries(returns, lookbacks.hurst);
    const varianceRatio = varianceRatioSeries(
      returns,
      lookbacks.varianceRatio,
      lookbacks.varianceRatioHorizon,
    );
    for (let i = 0; i < length; i++) {
      rows[i]!.hurstExponent = hurst[i];
      rows[i]!.varianceRatio = varianceRatio[i];
    }
  }

  if (enabled.candleGeometry) {
    const overlapFlags: Series = Array(length).fill(null);
    const candleRanges: Series = normalizedRanges.slice();
    let previousCloseSign = 0;
    let previousCloseStreak = 0;
    let previousCandleSign = 0;
    let previousCandleStreak = 0;

    for (let i = 0; i < length; i++) {
      const bar = bars[i]!;
      const range = bar.high - bar.low;
      const body = range > 0 ? Math.abs(bar.close - bar.open) / range : 0;
      const upper = range > 0 ? (bar.high - Math.max(bar.open, bar.close)) / range : 0;
      const lower = range > 0 ? (Math.min(bar.open, bar.close) - bar.low) / range : 0;
      rows[i]!.bodyRangeRatio = body;
      rows[i]!.upperWickRatio = upper;
      rows[i]!.lowerWickRatio = lower;

      const closeSign = i === 0 ? 0 : Math.sign(bar.close - bars[i - 1]!.close);
      const candleSign = Math.sign(bar.close - bar.open);
      if (closeSign === 0) previousCloseStreak = 0;
      else previousCloseStreak = closeSign === previousCloseSign ? previousCloseStreak + 1 : 1;
      if (candleSign === 0) previousCandleStreak = 0;
      else previousCandleStreak = candleSign === previousCandleSign ? previousCandleStreak + 1 : 1;
      previousCloseSign = closeSign;
      previousCandleSign = candleSign;
      rows[i]!.consecutiveSameDirectionCloses =
        closeSign === 0 ? 0 : closeSign * previousCloseStreak;
      rows[i]!.consecutiveSameDirectionCandles =
        candleSign === 0 ? 0 : candleSign * previousCandleStreak;

      if (i > 0) {
        const previous = bars[i - 1]!;
        const overlap = Math.max(
          0,
          Math.min(bar.high, previous.high) - Math.max(bar.low, previous.low),
        );
        const normalizer = Math.min(bar.high - bar.low, previous.high - previous.low);
        overlapFlags[i] = normalizer > 0 ? Number(overlap > 0) : 0;
      }
    }
    const overlapPercent = rollingMean(overlapFlags, lookbacks.candleOverlap);
    const rangeRanks = percentileRank(candleRanges, lookbacks.rangePercentile);
    const rangeBaseline =
      config.atrReferenceMethod === "median"
        ? rollingMedian(candleRanges, lookbacks.rangePercentile)
        : rollingMean(candleRanges, lookbacks.rangePercentile);
    for (let i = 0; i < length; i++) {
      const rank = rangeRanks[i];
      rows[i]!.candleOverlapPercent =
        overlapPercent[i] === null || overlapPercent[i] === undefined
          ? null
          : overlapPercent[i]! * 100;
      rows[i]!.rangePercentile = rank;
      rows[i]!.rangeCompressionPercentile = rank === null || rank === undefined ? null : 1 - rank;
      rows[i]!.rangeExpansionPercentile = rank;
      const baseline = rangeBaseline[i];
      if (
        normalizedRanges[i] !== null &&
        normalizedRanges[i] !== undefined &&
        baseline !== null &&
        baseline !== undefined &&
        baseline > 0
      ) {
        rows[i]!.rangeRelative = normalizedRanges[i]! / baseline;
      }
    }
  }

  if (enabled.volume) {
    const volume = rollingVolumeFeatures(bars, lookbacks.volume);
    for (let i = 0; i < length; i++) {
      rows[i]!.volumeSma = volume.sma[i];
      rows[i]!.volumeRatio = volume.ratio[i];
      rows[i]!.volumeSpikeScore = volume.spike[i];
      rows[i]!.obvSlope = volume.obvSlope[i];
      rows[i]!.upDownVolumeRatio = volume.upDownRatio[i];
    }
  }

  if (enabled.distribution) {
    const distribution = distributionFeatures(returns, lookbacks.distribution);
    for (let i = 0; i < length; i++) {
      const item = distribution[i]!;
      rows[i]!.returnSkewness = item.skewness;
      rows[i]!.returnExcessKurtosis = item.excessKurtosis;
      rows[i]!.returnQuantile10 = item.p10;
      rows[i]!.returnQuantile25 = item.p25;
      rows[i]!.returnQuantile50 = item.p50;
      rows[i]!.returnQuantile75 = item.p75;
      rows[i]!.returnQuantile90 = item.p90;
      rows[i]!.returnIqr = item.iqr;
    }
  }

  return rows;
}
