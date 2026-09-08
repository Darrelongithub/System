/**
 * Final production candidate set (9 survivors).
 * Rules/params frozen — do not tune for performance.
 */
import type { AnalysisContext, Outcome, StrategyCheck } from "../types";
import { eatDay } from "../time";
import { isConsumed } from "./util";

export const FINAL_PARAMS = {
  dualThrustN: 20, dualThrustK: 0.5, atrStopMult: 1.5, tpMultiple: 2.5,
  macdFast: 12, macdSlow: 26, macdSig: 9,
  pdhAtrMult: 0.5,
  williamsPeriod: 14, williamsAtr: 1.5, williamsTp: 3,
  soldiersTp: 2.5, starTp: 3,
  pivotAtr: 0.5, pivotTp: 3,
  ichiTenkan: 9, ichiKijun: 26, ichiSpan: 52, ichiTp: 3,
  donchianN: 55, donchianStopN: 20, donchianTp: 4,
};

const c = (ctx: AnalysisContext, i: number) => ctx.candles[i]!;
/** PASS carrier. consumeKey is proposed only; runAnalysis commits consume after RR validation. */
const pass = (
  reason: string,
  entry?: number,
  sl?: number,
  tp?: number,
  side?: "long" | "short",
  orderType?: "market" | "stop" | "limit",
  consumeKey?: string,
): Outcome => ({ result: "PASS", reason, entry, sl, tp, side, orderType, consumeKey });
const fail = (reason: string): Outcome => ({ result: "FAIL", reason });

const atrCache = new WeakMap<AnalysisContext, (number | undefined)[]>();
function atr14(ctx: AnalysisContext, i: number): number | undefined {
  let series = atrCache.get(ctx);
  if (!series) {
    series = new Array(ctx.candles.length).fill(undefined);
    const trs: number[] = []; let a: number | undefined;
    for (let j = 1; j < ctx.candles.length; j++) {
      const x = c(ctx, j), p = c(ctx, j - 1);
      if (x.invalid || p.invalid || x.high === undefined || x.low === undefined || p.close === undefined) continue;
      const tr = Math.max(x.high - x.low, Math.abs(x.high - p.close), Math.abs(x.low - p.close));
      trs.push(tr);
      if (trs.length === 14) a = trs.slice(0, 14).reduce((s, v) => s + v, 0) / 14;
      else if (trs.length > 14) a = (a! * 13 + tr) / 14;
      series[j] = a;
    }
    atrCache.set(ctx, series);
  }
  return series[i];
}
const emaCache = new WeakMap<AnalysisContext, Map<number, (number | undefined)[]>>();
function emaClose(ctx: AnalysisContext, i: number, n: number): number | undefined {
  let byN = emaCache.get(ctx); if (!byN) { byN = new Map(); emaCache.set(ctx, byN); }
  let series = byN.get(n);
  if (!series) {
    series = new Array(ctx.candles.length).fill(undefined);
    const k = 2 / (n + 1);
    // Seed from the first VALID close. Seeding from candle 0's close even when
    // that candle is invalid let excluded data contaminate every later EMA/MACD
    // signal (invalid-candle value contamination).
    let e: number | undefined;
    for (let j = 0; j < ctx.candles.length; j++) {
      const cl = c(ctx, j).invalid ? undefined : c(ctx, j).close;
      if (cl === undefined) continue;
      e = e === undefined ? cl : cl * k + e * (1 - k);
      if (j + 1 >= n) series[j] = e;
    }
    byN.set(n, series);
  }
  return series[i];
}
function rangeHL(ctx: AnalysisContext, from: number, to: number) {
  let hi = -Infinity, lo = Infinity;
  for (let j = from; j <= to; j++) {
    const x = c(ctx, j); if (x.invalid || x.high === undefined || x.low === undefined) return undefined;
    if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low;
  }
  return Number.isFinite(hi) ? { high: hi, low: lo } : undefined;
}
function tpR(entry: number, sl: number, side: "long" | "short", mult: number) {
  const risk = Math.abs(entry - sl);
  return side === "long" ? entry + mult * risk : entry - mult * risk;
}

/** LOCKED: Dual Thrust */
export const dualThrustSpec: StrategyCheck = { id: "dual-thrust", name: "Dual Thrust Breakout", run(ctx, i) {
  const P = FINAL_PARAMS; if (i < P.dualThrustN + 5) return fail("w");
  const x = c(ctx, i); if (x.close === undefined || x.open === undefined) return fail("o");
  let HH = -Infinity, LC = Infinity, HC = -Infinity, LL = Infinity;
  for (let j = i - P.dualThrustN; j < i; j++) {
    const b = c(ctx, j); if (b.invalid || b.high === undefined || b.low === undefined || b.close === undefined) return fail("r");
    if (b.high > HH) HH = b.high; if (b.close < LC) LC = b.close; if (b.close > HC) HC = b.close; if (b.low < LL) LL = b.low;
  }
  const range = Math.max(HH - LC, HC - LL); if (!(range > 0)) return fail("f");
  const atr = atr14(ctx, i - 1); if (!atr) return fail("a");
  const day = eatDay(x.datetime);
  if (x.close > x.open + P.dualThrustK * range) {
    if (isConsumed(ctx, "dual-thrust", day + ":L")) return fail("d");
    const sl = x.close - P.atrStopMult * atr;
    return pass("DT long", x.close, sl, tpR(x.close, sl, "long", P.tpMultiple), "long", "market", day + ":L");
  }
  if (x.close < x.open - P.dualThrustK * range) {
    if (isConsumed(ctx, "dual-thrust", day + ":S")) return fail("d");
    const sl = x.close + P.atrStopMult * atr;
    return pass("DT short", x.close, sl, tpR(x.close, sl, "short", P.tpMultiple), "short", "market", day + ":S");
  }
  return fail("n");
}};

/**
 * LOCKED: MACD Cross
 *
 * DEFINITION NOTE (intentional — do not "fix" to conventional MACD):
 * The signal line is the simple moving average SMA(macdSig=9) of the MACD line
 * (EMA12 − EMA26), not the traditional EMA(9) of the MACD line. This SMA signal
 * is part of the tested strategy definition; changing it would alter historical
 * results and invalidate the locked survivor backtests.
 */
export const macdCrossSpec: StrategyCheck = { id: "macd-cross", name: "MACD Signal Cross", run(ctx, i) {
  const P = FINAL_PARAMS; if (i < 40) return fail("w");
  const x = c(ctx, i); if (x.close === undefined) return fail("c");
  const macdAt = (end: number) => {
    const f = emaClose(ctx, end, P.macdFast), s = emaClose(ctx, end, P.macdSlow);
    return f !== undefined && s !== undefined ? f - s : undefined;
  };
  const macds: number[] = [], macdsPrev: number[] = [];
  for (let j = i - (P.macdSig - 1); j <= i; j++) { const m = macdAt(j); if (m === undefined) return fail("m"); macds.push(m); }
  for (let j = i - P.macdSig; j <= i - 1; j++) { const m = macdAt(j); if (m === undefined) return fail("m"); macdsPrev.push(m); }
  // Signal line = SMA(9) of MACD values (intentional; not EMA9 — see block comment above).
  const sigNow = macds.reduce((a, b) => a + b, 0) / P.macdSig;
  const sigPrev = macdsPrev.reduce((a, b) => a + b, 0) / P.macdSig;
  const mNow = macds[macds.length - 1]!, mPrev = macdsPrev[macdsPrev.length - 1]!;
  const atr = atr14(ctx, i - 1); if (!atr) return fail("a");
  const day = eatDay(x.datetime);
  if (mPrev <= sigPrev && mNow > sigNow) {
    if (isConsumed(ctx, "macd-cross", day + ":L")) return fail("d");
    const sl = x.close - P.atrStopMult * atr;
    return pass("MACD long", x.close, sl, tpR(x.close, sl, "long", P.tpMultiple), "long", "market", day + ":L");
  }
  if (mPrev >= sigPrev && mNow < sigNow) {
    if (isConsumed(ctx, "macd-cross", day + ":S")) return fail("d");
    const sl = x.close + P.atrStopMult * atr;
    return pass("MACD short", x.close, sl, tpR(x.close, sl, "short", P.tpMultiple), "short", "market", day + ":S");
  }
  return fail("n");
}};

/** LOCKED: PDH Retest */
export const pdhRetestSpec: StrategyCheck = { id: "pdh-retest", name: "PDH/PDL Break Retest", run(ctx, i) {
  const P = FINAL_PARAMS;
  const x = c(ctx, i); const day = eatDay(x.datetime);
  const prior = ctx.daily.filter(d => d.day < day).at(-1);
  if (!prior || x.close === undefined || x.low === undefined || x.high === undefined) return fail("p");
  const atr = atr14(ctx, i - 1); if (!atr) return fail("a");
  const brokeH = ctx.state.get(`pdhr:H:${prior.day}`) === true;
  const brokeL = ctx.state.get(`pdhr:L:${prior.day}`) === true;
  if (x.close > prior.high) ctx.state.set(`pdhr:H:${prior.day}`, true);
  if (x.close < prior.low) ctx.state.set(`pdhr:L:${prior.day}`, true);
  if (brokeH && x.low <= prior.high && x.close > prior.high) {
    if (isConsumed(ctx, "pdh-retest", prior.day + ":L")) return fail("d");
    const sl = prior.high - P.pdhAtrMult * atr; if (!(sl < x.close)) return fail("sl");
    return pass("PDH retest long", x.close, sl, tpR(x.close, sl, "long", P.tpMultiple), "long", "market", prior.day + ":L");
  }
  if (brokeL && x.high >= prior.low && x.close < prior.low) {
    if (isConsumed(ctx, "pdh-retest", prior.day + ":S")) return fail("d");
    const sl = prior.low + P.pdhAtrMult * atr; if (!(sl > x.close)) return fail("sl");
    return pass("PDL retest short", x.close, sl, tpR(x.close, sl, "short", P.tpMultiple), "short", "market", prior.day + ":S");
  }
  return fail("n");
}};

export const williamsRFadeSpec: StrategyCheck = { id: "williams-r-fade", name: "Williams %R Fade", run(ctx, i) {
  const P = FINAL_PARAMS; if (i < 20) return fail("w");
  const x = c(ctx, i); if (x.close === undefined) return fail("c");
  const n = P.williamsPeriod;
  const band = rangeHL(ctx, i - (n - 1), i); if (!band) return fail("b");
  const den = band.high - band.low; if (den <= 0) return fail("f");
  const wr = ((band.high - x.close) / den) * -100;
  const bandP = rangeHL(ctx, i - n, i - 1); if (!bandP || c(ctx, i - 1).close === undefined) return fail("p");
  const denP = bandP.high - bandP.low; if (denP <= 0) return fail("f2");
  const wrP = ((bandP.high - c(ctx, i - 1).close!) / denP) * -100;
  const atr = atr14(ctx, i - 1); if (!atr) return fail("a");
  const day = eatDay(x.datetime);
  if (wrP <= -80 && wr > -80) {
    if (isConsumed(ctx, "williams-r-fade", day + ":L")) return fail("d");
    const sl = x.close - P.williamsAtr * atr;
    return pass("WR L", x.close, sl, tpR(x.close, sl, "long", P.williamsTp), "long", "market", day + ":L");
  }
  if (wrP >= -20 && wr < -20) {
    if (isConsumed(ctx, "williams-r-fade", day + ":S")) return fail("d");
    const sl = x.close + P.williamsAtr * atr;
    return pass("WR S", x.close, sl, tpR(x.close, sl, "short", P.williamsTp), "short", "market", day + ":S");
  }
  return fail("n");
}};

export const threeSoldiersSpec: StrategyCheck = { id: "three-soldiers", name: "Three Soldiers/Crows", run(ctx, i) {
  const P = FINAL_PARAMS; if (i < 15) return fail("w");
  const a = c(ctx, i - 2), b = c(ctx, i - 1), x = c(ctx, i);
  if ([a, b, x].some(candle => candle.invalid) || [a.open, a.close, b.open, b.close, x.open, x.close].some(v => v === undefined)) return fail("o");
  const atr = atr14(ctx, i - 1); if (!atr) return fail("a"); const day = eatDay(x.datetime);
  const bull = a.close! > a.open! && b.close! > b.open! && x.close! > x.open! && b.close! > a.close! && x.close! > b.close! && b.open! > a.open! && x.open! > b.open!;
  const bear = a.close! < a.open! && b.close! < b.open! && x.close! < x.open! && b.close! < a.close! && x.close! < b.close! && b.open! < a.open! && x.open! < b.open!;
  if (bull) {
    if (isConsumed(ctx, "three-soldiers", day + ":L")) return fail("d");
    const sl = Math.min(a.low ?? x.close!, x.close! - atr); if (!(sl < x.close!)) return fail("sl");
    return pass("3S", x.close!, sl, tpR(x.close!, sl, "long", P.soldiersTp), "long", "market", day + ":L");
  }
  if (bear) {
    if (isConsumed(ctx, "three-soldiers", day + ":S")) return fail("d");
    const sl = Math.max(a.high ?? x.close!, x.close! + atr); if (!(sl > x.close!)) return fail("sl");
    return pass("3C", x.close!, sl, tpR(x.close!, sl, "short", P.soldiersTp), "short", "market", day + ":S");
  }
  return fail("n");
}};

export const morningStarSpec: StrategyCheck = { id: "morning-star", name: "Morning/Evening Star", run(ctx, i) {
  const P = FINAL_PARAMS; if (i < 15) return fail("w");
  const a = c(ctx, i - 2), b = c(ctx, i - 1), x = c(ctx, i);
  if ([a, b, x].some(candle => candle.invalid) || [a.open, a.close, b.open, b.close, x.open, x.close, a.high, a.low].some(v => v === undefined)) return fail("o");
  const atr = atr14(ctx, i - 1); if (!atr) return fail("a"); const day = eatDay(x.datetime!);
  const aBody = Math.abs(a.close! - a.open!); const bBody = Math.abs(b.close! - b.open!);
  const morning = a.close! < a.open! && bBody < 0.5 * aBody && x.close! > x.open! && x.close! > (a.open! + a.close!) / 2;
  const evening = a.close! > a.open! && bBody < 0.5 * aBody && x.close! < x.open! && x.close! < (a.open! + a.close!) / 2;
  if (morning) {
    if (isConsumed(ctx, "morning-star", day + ":L")) return fail("d");
    const sl = Math.min(a.low!, b.low ?? a.low!) - 0.1 * atr; if (!(sl < x.close!)) return fail("sl");
    return pass("MS", x.close!, sl, tpR(x.close!, sl, "long", P.starTp), "long", "market", day + ":L");
  }
  if (evening) {
    if (isConsumed(ctx, "morning-star", day + ":S")) return fail("d");
    const sl = Math.max(a.high!, b.high ?? a.high!) + 0.1 * atr; if (!(sl > x.close!)) return fail("sl");
    return pass("ES", x.close!, sl, tpR(x.close!, sl, "short", P.starTp), "short", "market", day + ":S");
  }
  return fail("n");
}};

export const classicPivotSpec: StrategyCheck = { id: "classic-pivot", name: "Classic Pivot S1/R1", run(ctx, i) {
  const P = FINAL_PARAMS;
  const x = c(ctx, i); const day = eatDay(x.datetime);
  const prior = ctx.daily.filter(d => d.day < day).at(-1);
  if (!prior || x.close === undefined || x.low === undefined || x.high === undefined) return fail("p");
  const pp = (prior.high + prior.low + prior.close) / 3, r1 = 2 * pp - prior.low, s1 = 2 * pp - prior.high;
  const atr = atr14(ctx, i - 1); if (!atr) return fail("a");
  if (x.low <= s1 && x.close > s1 && x.close < pp) {
    if (isConsumed(ctx, "classic-pivot", day + ":L")) return fail("d");
    const sl = s1 - P.pivotAtr * atr; if (!(sl < x.close)) return fail("sl");
    return pass("S1", x.close, sl, tpR(x.close, sl, "long", P.pivotTp), "long", "market", day + ":L");
  }
  if (x.high >= r1 && x.close < r1 && x.close > pp) {
    if (isConsumed(ctx, "classic-pivot", day + ":S")) return fail("d");
    const sl = r1 + P.pivotAtr * atr; if (!(sl > x.close)) return fail("sl");
    return pass("R1", x.close, sl, tpR(x.close, sl, "short", P.pivotTp), "short", "market", day + ":S");
  }
  return fail("n");
}};

/**
 * LOCKED: Ichimoku TK Cross
 *
 * DEFINITION NOTE (intentional — do not "fix" to classical displacement):
 * Span A / Span B form a current-bar cloud from the midpoints available at bar i.
 * Classical Ichimoku projects the cloud 26 periods forward; this implementation
 * does not apply that lag/displacement. The current-bar cloud is part of the
 * tested strategy definition; changing it would alter historical results.
 */
export const ichimokuTkSpec: StrategyCheck = { id: "ichimoku-tk", name: "Ichimoku TK Cross", run(ctx, i) {
  const P = FINAL_PARAMS; if (i < 60) return fail("w");
  const x = c(ctx, i); if (x.close === undefined) return fail("c");
  const mid = (from: number, to: number) => { const r = rangeHL(ctx, from, to); return r ? (r.high + r.low) / 2 : undefined; };
  const tenkan = mid(i - (P.ichiTenkan - 1), i), kijun = mid(i - (P.ichiKijun - 1), i);
  const tenkanP = mid(i - P.ichiTenkan, i - 1), kijunP = mid(i - P.ichiKijun, i - 1);
  // Current-bar cloud (no 26-period forward displacement — see block comment above).
  const spanA = tenkan !== undefined && kijun !== undefined ? (tenkan + kijun) / 2 : undefined;
  const spanB = mid(i - (P.ichiSpan - 1), i);
  if (!tenkan || !kijun || !tenkanP || !kijunP || !spanA || !spanB) return fail("ichi");
  const cloudTop = Math.max(spanA, spanB), cloudBot = Math.min(spanA, spanB);
  const atr = atr14(ctx, i - 1); if (!atr) return fail("a"); const day = eatDay(x.datetime);
  if (tenkanP <= kijunP && tenkan > kijun && x.close > cloudTop) {
    if (isConsumed(ctx, "ichimoku-tk", day + ":L")) return fail("d");
    const sl = Math.min(kijun, x.close - 1.5 * atr); if (!(sl < x.close)) return fail("sl");
    return pass("Ichi L", x.close, sl, tpR(x.close, sl, "long", P.ichiTp), "long", "market", day + ":L");
  }
  if (tenkanP >= kijunP && tenkan < kijun && x.close < cloudBot) {
    if (isConsumed(ctx, "ichimoku-tk", day + ":S")) return fail("d");
    const sl = Math.max(kijun, x.close + 1.5 * atr); if (!(sl > x.close)) return fail("sl");
    return pass("Ichi S", x.close, sl, tpR(x.close, sl, "short", P.ichiTp), "short", "market", day + ":S");
  }
  return fail("n");
}};

export const donchian55Spec: StrategyCheck = { id: "donchian-55", name: "Donchian 55 Breakout", run(ctx, i) {
  const P = FINAL_PARAMS; if (i < P.donchianN) return fail("w");
  const x = c(ctx, i); if (x.close === undefined) return fail("c");
  const prior = rangeHL(ctx, i - P.donchianN, i - 1); const stop = rangeHL(ctx, i - P.donchianStopN, i - 1);
  if (!prior || !stop) return fail("r"); const atr = atr14(ctx, i - 1); if (!atr) return fail("a");
  const day = eatDay(x.datetime);
  if (x.close > prior.high) {
    if (isConsumed(ctx, "donchian-55", day + ":L")) return fail("d");
    const sl = Math.max(stop.low, x.close - 2 * atr); if (!(sl < x.close)) return fail("sl");
    return pass("D55 L", x.close, sl, tpR(x.close, sl, "long", P.donchianTp), "long", "market", day + ":L");
  }
  if (x.close < prior.low) {
    if (isConsumed(ctx, "donchian-55", day + ":S")) return fail("d");
    const sl = Math.min(stop.high, x.close + 2 * atr); if (!(sl > x.close)) return fail("sl");
    return pass("D55 S", x.close, sl, tpR(x.close, sl, "short", P.donchianTp), "short", "market", day + ":S");
  }
  return fail("n");
}};

/** Active production trade strategies (9 survivors). */
export const FINAL_TRADE_STRATEGIES: StrategyCheck[] = [
  dualThrustSpec, macdCrossSpec, pdhRetestSpec,
  williamsRFadeSpec, threeSoldiersSpec, morningStarSpec,
  classicPivotSpec, ichimokuTkSpec, donchian55Spec,
];

export const FINAL_STRATEGY_IDS = FINAL_TRADE_STRATEGIES.map(s => s.id);
