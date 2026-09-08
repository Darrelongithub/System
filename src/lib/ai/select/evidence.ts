/**
 * Deterministic analytical evidence tools for the Gemini trade-selection layer.
 *
 * These are INFORMATION TOOLS, not strategies: they never create candidates
 * and never modify trades. Every function is bounded by an explicit as-of
 * boundary (index into the candle array; candles[asOf].datetime <= T) and
 * reads ONLY candles with index <= asOf. Appending future candles can never
 * change a snapshot at a fixed asOf (enforced by tests).
 *
 * Insufficient history is reported via explicit state flags — values are
 * never fabricated.
 */

export interface CandleLike {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type ToolState = "valid" | "insufficient_history" | "no_data";

export interface ToolOutput<T> {
  state: ToolState;
  value: T;
}

/* ------------------------------------------------------------------ *
 * Causal indicator arrays (element i uses only candles[0..i])        *
 * ------------------------------------------------------------------ */

export function emaArray(candles: CandleLike[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(candles.length).fill(undefined);
  if (period < 1 || candles.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!.close;
    if (i < period - 1) {
      sum += c;
      continue;
    }
    if (i === period - 1) {
      sum += c;
      out[i] = sum / period;
      continue;
    }
    out[i] = c * k + out[i - 1]! * (1 - k);
  }
  return out;
}

/** Wilder ATR. Element i defined once i candles exist (uses TR of bars 1..i). */
export function atrArray(candles: CandleLike[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(candles.length).fill(undefined);
  if (period < 1 || candles.length < period + 1) return out;
  let atr = 0;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    if (i <= period) {
      atr += tr;
      if (i === period) {
        atr /= period;
        out[i] = atr;
      }
      continue;
    }
    atr = (atr * (period - 1) + tr) / period;
    out[i] = atr;
  }
  return out;
}

/** Wilder RSI. Element i defined once i bars of moves exist. */
export function rsiArray(candles: CandleLike[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(candles.length).fill(undefined);
  if (period < 1 || candles.length < period + 1) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i]!.close - candles[i - 1]!.close;
    const gain = Math.max(diff, 0);
    const loss = Math.max(-diff, 0);
    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (i === period) {
        avgGain /= period;
        avgLoss /= period;
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      }
      continue;
    }
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Snapshot context: candles + precomputed causal arrays              *
 * ------------------------------------------------------------------ */

export class EvidenceContext {
  readonly candles: CandleLike[];
  readonly ema20: (number | undefined)[];
  readonly ema50: (number | undefined)[];
  readonly ema200: (number | undefined)[];
  readonly atr14: (number | undefined)[];
  readonly rsi14: (number | undefined)[];

  constructor(candles: CandleLike[]) {
    this.candles = candles;
    this.ema20 = emaArray(candles, 20);
    this.ema50 = emaArray(candles, 50);
    this.ema200 = emaArray(candles, 200);
    this.atr14 = atrArray(candles, 14);
    this.rsi14 = rsiArray(candles, 14);
  }

  /** Greatest index with candle.datetime <= T, or -1. */
  asOfIndex(T: string): number {
    const c = this.candles;
    let lo = 0;
    let hi = c.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (c[mid]!.datetime <= T) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }
}

const round = (v: number, dp = 4): number => Number(v.toFixed(dp));

/* ------------------------------------------------------------------ *
 * Trend                                                              *
 * ------------------------------------------------------------------ */

export interface TrendContext {
  ema20: number | undefined;
  ema50: number | undefined;
  ema200: number | undefined;
  ema20Slope5: number | undefined;
  ema50Slope5: number | undefined;
  stack: "bullish" | "bearish" | "mixed" | "unknown";
  priceVsEma50Atr: number | undefined;
  persistenceBars: number | undefined;
  h1Completed: number;
  h1Trend: "up" | "down" | "mixed" | "unknown";
}

export function trendContext(ctx: EvidenceContext, asOf: number): ToolOutput<TrendContext> {
  const { candles } = ctx;
  if (asOf < 0) {
    return {
      state: "no_data",
      value: {
        ema20: undefined,
        ema50: undefined,
        ema200: undefined,
        ema20Slope5: undefined,
        ema50Slope5: undefined,
        stack: "unknown",
        priceVsEma50Atr: undefined,
        persistenceBars: undefined,
        h1Completed: 0,
        h1Trend: "unknown",
      },
    };
  }
  const ema20 = ctx.ema20[asOf];
  const ema50 = ctx.ema50[asOf];
  const ema200 = ctx.ema200[asOf];
  const atr = ctx.atr14[asOf];
  const close = candles[asOf]!.close;
  const ema20Slope5 =
    asOf >= 5 && ema20 !== undefined && ctx.ema20[asOf - 5] !== undefined
      ? round(ema20 - ctx.ema20[asOf - 5]!)
      : undefined;
  const ema50Slope5 =
    asOf >= 5 && ema50 !== undefined && ctx.ema50[asOf - 5] !== undefined
      ? round(ema50 - ctx.ema50[asOf - 5]!)
      : undefined;
  let stack: TrendContext["stack"] = "unknown";
  if (ema20 !== undefined && ema50 !== undefined && ema200 !== undefined) {
    stack =
      close > ema20 && ema20 > ema50 && ema50 > ema200
        ? "bullish"
        : close < ema20 && ema20 < ema50 && ema50 < ema200
          ? "bearish"
          : "mixed";
  } else if (ema20 !== undefined && ema50 !== undefined) {
    stack =
      close > ema20 && ema20 > ema50
        ? "bullish"
        : close < ema20 && ema20 < ema50
          ? "bearish"
          : "mixed";
  }
  const priceVsEma50Atr =
    ema50 !== undefined && atr !== undefined && atr > 0
      ? round((close - ema50) / atr, 3)
      : undefined;
  let persistence: number | undefined;
  if (ema50 !== undefined) {
    persistence = 0;
    const side = close - ema50 >= 0 ? 1 : -1;
    for (let i = asOf; i >= 0 && ctx.ema50[i] !== undefined; i--) {
      const d = candles[i]!.close - ctx.ema50[i]!;
      if ((d >= 0 ? 1 : -1) !== side) break;
      persistence++;
    }
  }
  // Completed H1 candles only: hour groups fully closed before T.
  const hours: { key: string; open: number; close: number }[] = [];
  for (let i = 0; i <= asOf; i++) {
    const key = candles[i]!.datetime.slice(0, 13);
    const last = hours[hours.length - 1];
    if (last && last.key === key) last.close = candles[i]!.close;
    else hours.push({ key, open: candles[i]!.open, close: candles[i]!.close });
  }
  const completed = hours.slice(0, -1); // the final hour group is (possibly) still forming
  let h1Trend: TrendContext["h1Trend"] = "unknown";
  if (completed.length >= 3) {
    const a = completed[completed.length - 3]!.close;
    const b = completed[completed.length - 2]!.close;
    const c = completed[completed.length - 1]!.close;
    h1Trend = c > b && b > a ? "up" : c < b && b < a ? "down" : "mixed";
  } else if (completed.length === 2) {
    const a = completed[0]!.close;
    const b = completed[1]!.close;
    h1Trend = b > a ? "up" : b < a ? "down" : "mixed";
  }
  const state: ToolState =
    ema20 === undefined && atr === undefined ? "insufficient_history" : "valid";
  return {
    state,
    value: {
      ema20: ema20 === undefined ? undefined : round(ema20, 2),
      ema50: ema50 === undefined ? undefined : round(ema50, 2),
      ema200: ema200 === undefined ? undefined : round(ema200, 2),
      ema20Slope5,
      ema50Slope5,
      stack,
      priceVsEma50Atr,
      persistenceBars: persistence,
      h1Completed: completed.length,
      h1Trend,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Momentum                                                           *
 * ------------------------------------------------------------------ */

export interface MomentumContext {
  rsi14: number | undefined;
  roc5: number | undefined;
  roc10: number | undefined;
  roc5Acceleration: number | undefined;
  bodyMomentum3: number | undefined;
}

export function momentumContext(ctx: EvidenceContext, asOf: number): ToolOutput<MomentumContext> {
  const { candles } = ctx;
  if (asOf < 0) {
    return {
      state: "no_data",
      value: {
        rsi14: undefined,
        roc5: undefined,
        roc10: undefined,
        roc5Acceleration: undefined,
        bodyMomentum3: undefined,
      },
    };
  }
  const rsi = ctx.rsi14[asOf];
  const roc = (n: number): number | undefined =>
    asOf >= n && candles[asOf - n]!.close !== 0
      ? round(
          ((candles[asOf]!.close - candles[asOf - n]!.close) / candles[asOf - n]!.close) * 100,
          3,
        )
      : undefined;
  const roc5 = roc(5);
  const roc10 = roc(10);
  const roc5Prev =
    asOf >= 6 && candles[asOf - 6]!.close !== 0
      ? ((candles[asOf - 1]!.close - candles[asOf - 6]!.close) / candles[asOf - 6]!.close) * 100
      : undefined;
  const roc5Acceleration =
    roc5 !== undefined && roc5Prev !== undefined ? round(roc5 - roc5Prev, 3) : undefined;
  let bodyMomentum3: number | undefined;
  if (asOf >= 2) {
    let net = 0;
    for (let i = asOf - 2; i <= asOf; i++) net += candles[i]!.close - candles[i]!.open;
    bodyMomentum3 = round(net, 2);
  }
  return {
    state: rsi === undefined && roc5 === undefined ? "insufficient_history" : "valid",
    value: {
      rsi14: rsi === undefined ? undefined : round(rsi, 1),
      roc5,
      roc10,
      roc5Acceleration,
      bodyMomentum3,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Volatility                                                         *
 * ------------------------------------------------------------------ */

export interface VolatilityContext {
  atr14: number | undefined;
  atrPercentile128: number | undefined;
  regime: "low" | "normal" | "high" | "unknown";
  lastRangeVsAtr: number | undefined;
  expansionShare10: number | undefined;
  realizedVol20: number | undefined;
}

export function volatilityContext(
  ctx: EvidenceContext,
  asOf: number,
): ToolOutput<VolatilityContext> {
  const { candles } = ctx;
  if (asOf < 0) {
    return {
      state: "no_data",
      value: {
        atr14: undefined,
        atrPercentile128: undefined,
        regime: "unknown",
        lastRangeVsAtr: undefined,
        expansionShare10: undefined,
        realizedVol20: undefined,
      },
    };
  }
  const atr = ctx.atr14[asOf];
  let pct: number | undefined;
  let regime: VolatilityContext["regime"] = "unknown";
  if (atr !== undefined) {
    const windowVals: number[] = [];
    for (let i = Math.max(0, asOf - 127); i <= asOf; i++) {
      const v = ctx.atr14[i];
      if (v !== undefined) windowVals.push(v);
    }
    const below = windowVals.filter((v) => v <= atr).length;
    pct = round(below / windowVals.length, 3);
    regime = pct < 0.3 ? "low" : pct > 0.8 ? "high" : "normal";
  }
  const last = candles[asOf]!;
  const lastRangeVsAtr =
    atr !== undefined && atr > 0 ? round((last.high - last.low) / atr, 3) : undefined;
  let expansionShare10: number | undefined;
  if (atr !== undefined && atr > 0 && asOf >= 9) {
    let hits = 0;
    for (let i = asOf - 9; i <= asOf; i++) {
      if (candles[i]!.high - candles[i]!.low > 1.5 * atr) hits++;
    }
    expansionShare10 = round(hits / 10, 2);
  }
  let realizedVol20: number | undefined;
  if (asOf >= 20) {
    const rets: number[] = [];
    for (let i = asOf - 19; i <= asOf; i++) {
      const prev = candles[i - 1]!.close;
      if (prev !== 0) rets.push((candles[i]!.close - prev) / prev);
    }
    if (rets.length === 20) {
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const varr = rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / rets.length;
      realizedVol20 = round(Math.sqrt(varr) * 100, 4);
    }
  }
  return {
    state: atr === undefined ? "insufficient_history" : "valid",
    value: {
      atr14: atr === undefined ? undefined : round(atr, 2),
      atrPercentile128: pct,
      regime,
      lastRangeVsAtr,
      expansionShare10,
      realizedVol20,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Structure (all levels confirmed by candles <= asOf)                *
 * ------------------------------------------------------------------ */

export interface StructureContext {
  swingHighs: number[];
  swingLows: number[];
  nearestSwingHigh: number | undefined;
  nearestSwingLow: number | undefined;
  distToSwingHighAtr: number | undefined;
  distToSwingLowAtr: number | undefined;
  prevDayHigh: number | undefined;
  prevDayLow: number | undefined;
  sessionHigh: number | undefined;
  sessionLow: number | undefined;
  breakState: "broke_above_swing_high" | "broke_below_swing_low" | "none";
}

/** Confirmed fractal levels: pivot at i requires two bars each side; only pivots with i+2 <= asOf exist. */
function confirmedSwings(
  candles: CandleLike[],
  asOf: number,
  count: number,
): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = 2; i + 2 <= asOf; i++) {
    const h = candles[i]!.high;
    const l = candles[i]!.low;
    if (
      h > candles[i - 1]!.high &&
      h > candles[i - 2]!.high &&
      h > candles[i + 1]!.high &&
      h > candles[i + 2]!.high
    )
      highs.push(h);
    if (
      l < candles[i - 1]!.low &&
      l < candles[i - 2]!.low &&
      l < candles[i + 1]!.low &&
      l < candles[i + 2]!.low
    )
      lows.push(l);
  }
  return { highs: highs.slice(-count), lows: lows.slice(-count) };
}

const NY_TAIL_END = 60; // ny session runs 16:00 -> 00:59 EAT next day

export function structureContext(ctx: EvidenceContext, asOf: number): ToolOutput<StructureContext> {
  const { candles } = ctx;
  const empty: StructureContext = {
    swingHighs: [],
    swingLows: [],
    nearestSwingHigh: undefined,
    nearestSwingLow: undefined,
    distToSwingHighAtr: undefined,
    distToSwingLowAtr: undefined,
    prevDayHigh: undefined,
    prevDayLow: undefined,
    sessionHigh: undefined,
    sessionLow: undefined,
    breakState: "none",
  };
  if (asOf < 0) return { state: "no_data", value: empty };
  const atr = ctx.atr14[asOf];
  const close = candles[asOf]!.close;
  const { highs, lows } = confirmedSwings(candles, asOf, 6);
  const nearestSwingHigh = highs.length > 0 ? highs[highs.length - 1] : undefined;
  const nearestSwingLow = lows.length > 0 ? lows[lows.length - 1] : undefined;

  // Previous complete EAT day (day of candles[asOf] - 1 calendar day).
  const day = candles[asOf]!.datetime.slice(0, 10);
  let prevDayHigh: number | undefined;
  let prevDayLow: number | undefined;
  for (let i = asOf; i >= 0; i--) {
    const d = candles[i]!.datetime.slice(0, 10);
    if (d < day) {
      let hi = candles[i]!.high;
      let lo = candles[i]!.low;
      const dd = d;
      for (let j = i; j >= 0 && candles[j]!.datetime.slice(0, 10) === dd; j--) {
        hi = Math.max(hi, candles[j]!.high);
        lo = Math.min(lo, candles[j]!.low);
        i = j;
      }
      prevDayHigh = round(hi, 2);
      prevDayLow = round(lo, 2);
      break;
    }
  }

  // Current-session high/low. Session buckets (EAT): asian 01:00-10:59,
  // london 11:00-15:59, ny 16:00-00:59(+1d). Session id = (day, name) made
  // stable across the ny midnight wrap via minute arithmetic.
  const lastDt = candles[asOf]!.datetime;
  const sessionIdOf = (dt: string): string => {
    const d = dt.slice(0, 10);
    const hhmm = dt.slice(11, 16);
    const [hh, mm] = hhmm.split(":").map(Number);
    const mins = hh! * 60 + mm!;
    if (mins >= 16 * 60 || mins <= NY_TAIL_END) {
      return mins >= 16 * 60 ? `${d}|ny` : `${prevDayKey(d)}|ny`;
    }
    if (mins >= 11 * 60) return `${d}|london`;
    return mins >= 60 ? `${d}|asian` : `${prevDayKey(d)}|ny`;
  };
  const target = sessionIdOf(lastDt);
  let sessionHigh: number | undefined;
  let sessionLow: number | undefined;
  for (let i = asOf; i >= 0; i--) {
    if (sessionIdOf(candles[i]!.datetime) !== target) break;
    sessionHigh =
      sessionHigh === undefined ? candles[i]!.high : Math.max(sessionHigh, candles[i]!.high);
    sessionLow = sessionLow === undefined ? candles[i]!.low : Math.min(sessionLow, candles[i]!.low);
  }

  let breakState: StructureContext["breakState"] = "none";
  if (nearestSwingHigh !== undefined && close > nearestSwingHigh)
    breakState = "broke_above_swing_high";
  else if (nearestSwingLow !== undefined && close < nearestSwingLow)
    breakState = "broke_below_swing_low";

  return {
    state: highs.length === 0 && prevDayHigh === undefined ? "insufficient_history" : "valid",
    value: {
      swingHighs: highs.map((v) => round(v, 2)),
      swingLows: lows.map((v) => round(v, 2)),
      nearestSwingHigh: nearestSwingHigh === undefined ? undefined : round(nearestSwingHigh, 2),
      nearestSwingLow: nearestSwingLow === undefined ? undefined : round(nearestSwingLow, 2),
      distToSwingHighAtr:
        nearestSwingHigh !== undefined && atr !== undefined && atr > 0
          ? round((nearestSwingHigh - close) / atr, 3)
          : undefined,
      distToSwingLowAtr:
        nearestSwingLow !== undefined && atr !== undefined && atr > 0
          ? round((close - nearestSwingLow) / atr, 3)
          : undefined,
      prevDayHigh,
      prevDayLow,
      sessionHigh: sessionHigh === undefined ? undefined : round(sessionHigh, 2),
      sessionLow: sessionLow === undefined ? undefined : round(sessionLow, 2),
      breakState,
    },
  };
}

function prevDayKey(day: string): string {
  const d = new Date(`${day}T00:00:00+03:00`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 * Price action (last bars only, bounded)                             *
 * ------------------------------------------------------------------ */

export interface PriceActionContext {
  lastBody: number;
  lastUpperWick: number;
  lastLowerWick: number;
  lastBodyRatio: number;
  lastRangeVsAtr: number | undefined;
  consecutiveDirection: number;
  insideBar: boolean;
  outsideBar: boolean;
}

export function priceActionContext(
  ctx: EvidenceContext,
  asOf: number,
): ToolOutput<PriceActionContext> {
  const { candles } = ctx;
  if (asOf < 0) {
    return {
      state: "no_data",
      value: {
        lastBody: 0,
        lastUpperWick: 0,
        lastLowerWick: 0,
        lastBodyRatio: 0,
        lastRangeVsAtr: undefined,
        consecutiveDirection: 0,
        insideBar: false,
        outsideBar: false,
      },
    };
  }
  const last = candles[asOf]!;
  const atr = ctx.atr14[asOf];
  const body = last.close - last.open;
  const hi = last.high;
  const lo = last.low;
  const upper = hi - Math.max(last.open, last.close);
  const lower = Math.min(last.open, last.close) - lo;
  const range = hi - lo;
  let consecutive = 0;
  if (body !== 0) {
    const dir = Math.sign(body);
    consecutive = dir;
    for (let i = asOf - 1; i >= 0; i--) {
      const b = candles[i]!.close - candles[i]!.open;
      if (Math.sign(b) !== dir || b === 0) break;
      consecutive += dir;
    }
  }
  const prev = asOf >= 1 ? candles[asOf - 1]! : undefined;
  const insideBar = prev !== undefined && hi <= prev.high && lo >= prev.low;
  const outsideBar = prev !== undefined && hi > prev.high && lo < prev.low;
  return {
    state: "valid",
    value: {
      lastBody: round(body, 2),
      lastUpperWick: round(upper, 2),
      lastLowerWick: round(lower, 2),
      lastBodyRatio: range > 0 ? round(Math.abs(body) / range, 3) : 0,
      lastRangeVsAtr: atr !== undefined && atr > 0 ? round(range / atr, 3) : undefined,
      consecutiveDirection: consecutive,
      insideBar,
      outsideBar,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Candidate risk quality (per candidate, bounded)                    *
 * ------------------------------------------------------------------ */

export interface CandidateRiskQuality {
  rr: number | undefined;
  stopDistance: number;
  stopDistanceAtr: number | undefined;
  tpDistanceAtr: number | undefined;
  entryVsLastCloseAtr: number | undefined;
  slBeyondNearestSwing: boolean | undefined;
  tpBeforeNearestSwing: boolean | undefined;
}

export function candidateRiskQuality(
  ctx: EvidenceContext,
  asOf: number,
  c: { side: string; entry: number; sl: number; tp: number; rr: number | undefined },
  structure: StructureContext,
): CandidateRiskQuality {
  if (asOf < 0) {
    return {
      rr: c.rr,
      stopDistance: Math.abs(c.entry - c.sl),
      stopDistanceAtr: undefined,
      tpDistanceAtr: undefined,
      entryVsLastCloseAtr: undefined,
      slBeyondNearestSwing: undefined,
      tpBeforeNearestSwing: undefined,
    };
  }
  const atr = asOf >= 0 ? ctx.atr14[asOf] : undefined;
  const lastClose = ctx.candles[asOf]!.close;
  const stopDistance = Math.abs(c.entry - c.sl);
  const tpDistance = Math.abs(c.tp - c.entry);
  const long = c.side.toLowerCase() === "long";
  let slBeyondNearestSwing: boolean | undefined;
  let tpBeforeNearestSwing: boolean | undefined;
  if (long) {
    // long: good stop placement is below the nearest swing low
    slBeyondNearestSwing =
      structure.nearestSwingLow === undefined ? undefined : c.sl < structure.nearestSwingLow;
    tpBeforeNearestSwing =
      structure.nearestSwingHigh === undefined ? undefined : c.tp < structure.nearestSwingHigh;
  } else {
    slBeyondNearestSwing =
      structure.nearestSwingHigh === undefined ? undefined : c.sl > structure.nearestSwingHigh;
    tpBeforeNearestSwing =
      structure.nearestSwingLow === undefined ? undefined : c.tp > structure.nearestSwingLow;
  }
  return {
    rr: c.rr,
    stopDistance: round(stopDistance, 2),
    stopDistanceAtr: atr !== undefined && atr > 0 ? round(stopDistance / atr, 3) : undefined,
    tpDistanceAtr: atr !== undefined && atr > 0 ? round(tpDistance / atr, 3) : undefined,
    entryVsLastCloseAtr:
      atr !== undefined && atr > 0 ? round((c.entry - lastClose) / atr, 3) : undefined,
    slBeyondNearestSwing,
    tpBeforeNearestSwing,
  };
}

/* ------------------------------------------------------------------ *
 * Recent candle tail for the prompt (bounded slice)                  *
 * ------------------------------------------------------------------ */

export interface TailCandle {
  datetime: string;
  o: number;
  h: number;
  l: number;
  c: number;
}

export function candleTail(candles: CandleLike[], asOf: number, tail: number): TailCandle[] {
  if (asOf < 0 || tail < 1) return [];
  const from = Math.max(0, asOf - tail + 1);
  const out: TailCandle[] = [];
  for (let i = from; i <= asOf; i++) {
    const c = candles[i]!;
    out.push({
      datetime: c.datetime,
      o: round(c.open, 2),
      h: round(c.high, 2),
      l: round(c.low, 2),
      c: round(c.close, 2),
    });
  }
  return out;
}
