import type { Candle, HtfTrendContext, Trend } from "./types";

export interface SwingSet {
  /** Resolved swing candles, ordered oldest -> newest by their position in the file. */
  candles: Candle[];
  highs: number[];
  lows: number[];
  unresolved: string[];
}

export function buildIndex(candles: Candle[]): Map<string, Candle> {
  const map = new Map<string, Candle>();
  for (const candle of candles) {
    if (candle.invalid || !candle.datetime) continue;
    const key = candle.datetime.trim();
    if (!map.has(key)) map.set(key, candle);
  }
  return map;
}

/** Resolves similar_swing_refs datetimes back to real rows; unresolved refs are reported, never nulled. */
export function resolveSwings(candle: Candle, byDatetime: Map<string, Candle>): SwingSet {
  const resolved: Candle[] = [];
  const unresolved: string[] = [];
  for (const ref of candle.similarSwingRefs) {
    const match = byDatetime.get(ref.trim());
    // Causality guard: a swing ref must point strictly to an EARLIER row.
    // Future-pointing (or self-referencing) refs are a data-causality
    // violation; report them as unresolved instead of letting lookahead data
    // shape this row's trend.
    if (
      match &&
      match.index < candle.index &&
      match.high !== undefined &&
      match.low !== undefined
    ) {
      resolved.push(match);
    } else {
      unresolved.push(ref);
    }
  }
  resolved.sort((a, b) => a.index - b.index);
  const last5 = resolved.slice(-5);
  return {
    candles: last5,
    highs: last5.map((c) => c.high as number),
    lows: last5.map((c) => c.low as number),
    unresolved,
  };
}

function rising(values: number[]): boolean {
  return values.length >= 2 && values.every((v, i) => i === 0 || v > values[i - 1]!);
}

function falling(values: number[]): boolean {
  return values.length >= 2 && values.every((v, i) => i === 0 || v < values[i - 1]!);
}

export function trendFrom(swings: SwingSet): Trend {
  // Structure is defined by the most recent confirmed swing pair. Requiring all
  // five historical pivots to be monotonic made a single older counter-swing
  // permanently mask a current bearish H4 sequence.
  const highs = swings.highs.slice(-2);
  const lows = swings.lows.slice(-2);
  if (highs.length < 2 || lows.length < 2) return "ranging";
  if (rising(highs) && rising(lows)) return "bullish";
  if (falling(highs) && falling(lows)) return "bearish";
  return "ranging";
}

/** Step 2: computes and stores trend + unresolved refs on every row, once. */
export function computeMarketStructure(candles: Candle[], byDatetime: Map<string, Candle>): void {
  for (const candle of candles) {
    const swings = resolveSwings(candle, byDatetime);
    candle.unresolvedRefs = swings.unresolved;
    candle.trend = trendFrom(swings);
  }
}

interface AggregateBar {
  startMs: number;
  endMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

type HtfKey = "h1" | "h4" | "d1";

function parseDatetimeMs(datetime: string): number {
  const normalized = datetime.trim().replace(" ", "T");
  // Source timestamps are EAT when no explicit offset is supplied.
  return new Date(
    /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}+03:00`,
  ).getTime();
}

function bucketStartMs(ms: number, key: HtfKey): number {
  const d = new Date(ms);
  if (key === "d1")
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 3 * 60 * 60 * 1000;
  const eatMs = ms + 3 * 60 * 60 * 1000;
  const eat = new Date(eatMs);
  const hour = eat.getUTCHours();
  const size = key === "h1" ? 1 : 4;
  const flooredHour = Math.floor(hour / size) * size;
  return (
    Date.UTC(eat.getUTCFullYear(), eat.getUTCMonth(), eat.getUTCDate(), flooredHour) -
    3 * 60 * 60 * 1000
  );
}

function aggregate30m(candles: Candle[], key: HtfKey): AggregateBar[] {
  const map = new Map<number, AggregateBar>();
  for (const c of candles) {
    if (
      c.invalid ||
      c.open === undefined ||
      c.high === undefined ||
      c.low === undefined ||
      c.close === undefined
    )
      continue;
    const startMs = bucketStartMs(parseDatetimeMs(c.datetime), key);
    const existing = map.get(startMs);
    if (!existing) {
      map.set(startMs, {
        startMs,
        endMs: startMs + (key === "h1" ? 60 : key === "h4" ? 240 : 1440) * 60_000,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
    }
  }
  return [...map.values()].sort((a, b) => a.startMs - b.startMs);
}

/**
 * Trend from a prefix of HTF bars (indices 0..count-1), same rules as the
 * former per-asOfMs filter + pivot pass. Pure function of the completed prefix.
 */
function trendFromCompletedPrefix(bars: AggregateBar[], count: number): Trend {
  if (count < 7) return "ranging";

  // Lightweight OHLC views — only fields the pivot pass reads.
  const highsArr = new Array<number>(count);
  const lowsArr = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    highsArr[i] = bars[i]!.high;
    lowsArr[i] = bars[i]!.low;
  }

  const k = 2;
  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];
  for (let i = k; i < count - k; i++) {
    const h = highsArr[i]!;
    const l = lowsArr[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (highsArr[j]! >= h) isHigh = false;
      if (lowsArr[j]! <= l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    // confirmedAt = i + k; require confirmedAt < count ⇔ i < count - k
    // Loop already enforces i < count - k, so every pivot here is confirmed.
    if (isHigh) pivotHighs.push(h);
    if (isLow) pivotLows.push(l);
  }

  const highs = pivotHighs.slice(-5);
  const lows = pivotLows.slice(-5);
  return trendFrom({ candles: [], highs, lows, unresolved: [] });
}

/**
 * Precompute the trend that applies once each HTF bar has fully closed.
 * trends[j] = trend using bars[0..j] inclusive (j+1 completed bars), valid for
 * asOfMs in [bars[j].endMs, bars[j+1].endMs) (or to +∞ after the last bar).
 */
function precomputeTrendsAtCompletions(bars: AggregateBar[]): { endMs: number; trend: Trend }[] {
  const out: { endMs: number; trend: Trend }[] = new Array(bars.length);
  for (let j = 0; j < bars.length; j++) {
    out[j] = {
      endMs: bars[j]!.endMs,
      trend: trendFromCompletedPrefix(bars, j + 1),
    };
  }
  return out;
}

/** Largest index with endMs <= asOfMs, or -1 if none. */
function lastCompletedIndex(completions: { endMs: number }[], asOfMs: number): number {
  let lo = 0;
  let hi = completions.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (completions[mid]!.endMs <= asOfMs) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

export function computeHtfTrendContext(candles: Candle[]): HtfTrendContext[] {
  const series: Record<HtfKey, AggregateBar[]> = {
    h1: aggregate30m(candles, "h1"),
    h4: aggregate30m(candles, "h4"),
    d1: aggregate30m(candles, "d1"),
  };

  // One pivot/trend pass per completed HTF bar (not per 30m candle).
  const h1Trends = precomputeTrendsAtCompletions(series.h1);
  const h4Trends = precomputeTrendsAtCompletions(series.h4);
  const d1Trends = precomputeTrendsAtCompletions(series.d1);

  const result: HtfTrendContext[] = new Array(candles.length);
  for (let i = 0; i < candles.length; i++) {
    const asOfMs = parseDatetimeMs(candles[i]!.datetime);
    const h1i = lastCompletedIndex(h1Trends, asOfMs);
    const h4i = lastCompletedIndex(h4Trends, asOfMs);
    const d1i = lastCompletedIndex(d1Trends, asOfMs);
    result[i] = {
      h1: h1i < 0 ? "ranging" : h1Trends[h1i]!.trend,
      h4: h4i < 0 ? "ranging" : h4Trends[h4i]!.trend,
      d1: d1i < 0 ? "ranging" : d1Trends[d1i]!.trend,
    };
  }
  return result;
}

export function htfAllowsDirection(context: HtfTrendContext, side: "long" | "short"): boolean {
  if (side === "long") {
    return [context.h1, context.h4, context.d1].every((t) => t === "bullish" || t === "ranging");
  }
  return [context.h1, context.h4, context.d1].every((t) => t === "bearish" || t === "ranging");
}
