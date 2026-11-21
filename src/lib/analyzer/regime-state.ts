/**
 * LAYER 1 & 2 — Causal regime classifier.
 *
 * One WeakMap-cached RegimeState per AnalysisContext. Every value at index i
 * is derived strictly from bars <= i (invalid rows are skipped without
 * contaminating the smoothing state), so a setup signalled at bar i reflects
 * exactly what was knowable at that instant — no lookahead.
 *
 * Precomputed series (Float64Array / Int8Array, NaN / 0 = undefined):
 *   ema20  — reused from ctx.ema20 (generator-supplied / shared EMA helper)
 *   ema50 / ema200 — shared ema() helper
 *   trSma50 — 50-bar simple average of valid True Range over [i-49 .. i]
 *             (requires >= 40 valid TRs in the window)
 *   volRatio — ctx.atr[i] / trSma50[i]
 *   adx14 — Standard Wilder(14) ADX
 *   superTrend — ATR(10) Wilder-smoothed (prev*9+tr)/10, mult 3.0,
 *                ratchet finalUpper down / finalLower up per the documented rules
 *
 * The gate (checkRegimeGate) and the telemetry snapshot (getBarRegimeSnapshot)
 * are the only entry points callers need.
 */
import { htfAllowsDirection } from "./structure";
import { ema } from "./indicators";
import type { AnalysisContext, HtfTrendContext } from "./types";

const R1_COILED = "R1";
const R2_TREND_PULLBACK = "R2";
const R3_HIGH_VELOCITY = "R3";
const R4_LIQUID_LEVEL = "R4";

export type StrategyArchetype = typeof R1_COILED | typeof R2_TREND_PULLBACK | typeof R3_HIGH_VELOCITY | typeof R4_LIQUID_LEVEL;

/** Per-archetype routing for the eight v2 bots. */
export const STRATEGY_ARCHETYPES: Record<string, StrategyArchetype> = {
  "donchian-55-coiled": R1_COILED,
  "keltner-squeeze-release": R1_COILED,
  "killzone-orb-stretch": R1_COILED,
  "supertrend-ema-pullback": R2_TREND_PULLBACK,
  "kijun-cloud-continuation": R2_TREND_PULLBACK,
  "engulfing-zone-retest": R2_TREND_PULLBACK,
  "asymmetric-vol-breakout": R3_HIGH_VELOCITY,
  "ny-pivot-s1r1-reject": R4_LIQUID_LEVEL,
};

const NaN_ = Number.NaN;

function trueRanges(ctx: AnalysisContext, n: number): Float64Array {
  const out = new Float64Array(n).fill(NaN_);
  let prevClose: number | undefined;
  for (let i = 0; i < n; i++) {
    const c = ctx.candles[i]!;
    if (c.invalid || c.high === undefined || c.low === undefined || c.close === undefined) continue;
    const range = c.high - c.low;
    if (prevClose === undefined) {
      out[i] = range;
    } else {
      out[i] = Math.max(range, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    }
    prevClose = c.close;
  }
  return out;
}

export interface RegimeState {
  ema20: (number | undefined)[];
  ema50: (number | undefined)[];
  ema200: (number | undefined)[];
  trSma50: Float64Array;
  volRatio: Float64Array;
  adx14: Float64Array;
  stDir: Int8Array;
  stLine: Float64Array;
  /** Wilder ATR(10) used by the superTrend recursion. NaN = undefined. */
  atr10: Float64Array;
}

function computeRegimeState(ctx: AnalysisContext): RegimeState {
  const candles = ctx.candles;
  const n = candles.length;
  const ema20 = ctx.ema20;
  const ema50 = ema(candles, 50);
  const ema200 = ema(candles, 200);
  const tr = trueRanges(ctx, n);

  // ---- TRSMA50: 50-bar simple average of valid TRs; >= 40 valid TRs required ----
  const trSma50 = new Float64Array(n).fill(NaN_);
  {
    let windowSum = 0;
    let windowCount = 0;
    for (let i = 0; i < n; i++) {
      // add current
      const cur = tr[i]!;
      if (Number.isFinite(cur)) {
        windowSum += cur;
        windowCount++;
      }
      // drop [i-49]
      if (i >= 50) {
        const old = tr[i - 50]!;
        if (Number.isFinite(old)) {
          windowSum -= old;
          windowCount--;
        }
      }
      trSma50[i] = windowCount >= 40 ? windowSum / windowCount : NaN_;
    }
  }

  // ---- volRatio: ctx.atr[i] / trSma50[i] ----
  const volRatio = new Float64Array(n).fill(NaN_);
  for (let i = 0; i < n; i++) {
    const a = ctx.atr[i];
    const s = trSma50[i]!;
    volRatio[i] =
      a === undefined || !Number.isFinite(a) || !Number.isFinite(s) || s <= 0 ? NaN_ : a / s;
  }

  // ---- ADX(14) Wilder: smTr / smPlusDM / smMinusDM, then 14-bar average of DX ----
  const dx = new Float64Array(n).fill(NaN_);
  {
    let trCount = 0;
    let seedTr = 0;
    let seedPdm = 0;
    let seedMdm = 0;
    let sTr = NaN_;
    let sPdm = NaN_;
    let sMdm = NaN_;
    for (let i = 0; i < n; i++) {
      const c = candles[i]!;
      const curTr = tr[i]!;
      if (c.invalid || !Number.isFinite(curTr) || c.high === undefined || c.low === undefined) {
        continue;
      }
      let pdm = 0;
      let mdm = 0;
      if (i > 0) {
        const p = candles[i - 1]!;
        if (
          !p.invalid &&
          p.high !== undefined &&
          p.low !== undefined &&
          p.high !== undefined
        ) {
          const upMove = c.high - p.high;
          const downMove = p.low - c.low;
          pdm = upMove > downMove && upMove > 0 ? upMove : 0;
          mdm = downMove > upMove && downMove > 0 ? downMove : 0;
        }
      }
      trCount++;
      if (trCount <= 14) {
        seedTr += curTr;
        seedPdm += pdm;
        seedMdm += mdm;
        if (trCount < 14) continue;
        // Seed: simple mean of the first 14 valid components.
        sTr = seedTr / 14;
        sPdm = seedPdm / 14;
        sMdm = seedMdm / 14;
      } else {
        // Wilder-style recursion (prev - prev/14 + cur).
        sTr = sTr - sTr / 14 + curTr;
        sPdm = sPdm - sPdm / 14 + pdm;
        sMdm = sMdm - sMdm / 14 + mdm;
      }
      if (!Number.isFinite(sTr) || sTr <= 0 || sPdm + sMdm <= 0) continue;
      const plusDI = (100 * sPdm) / sTr;
      const minusDI = (100 * sMdm) / sTr;
      const dxVal = (100 * Math.abs(plusDI - minusDI)) / (plusDI + minusDI);
      if (Number.isFinite(dxVal)) dx[i] = dxVal;
    }
  }

  // 14-bar average of DX.
  const adx14 = new Float64Array(n).fill(NaN_);
  {
    let sum = 0;
    let count = 0;
    const recent: number[] = [];
    for (let i = 0; i < n; i++) {
      const v = dx[i]!;
      if (Number.isFinite(v)) {
        sum += v;
        count++;
        recent.push(v);
        if (recent.length > 14) {
          const dropped = recent.shift()!;
          sum -= dropped;
          count--;
        }
      } else {
        // A gap in DX invalidates the trailing window.
        sum = 0;
        count = 0;
        recent.length = 0;
      }
      adx14[i] = count === 14 ? sum / 14 : NaN_;
    }
  }

  // ---- SuperTrend: ATR(10) Wilder-smoothed, mult 3.0, documented ratchets ----
  const atr10 = new Float64Array(n).fill(NaN_);
  const stDir = new Int8Array(n).fill(0);
  const stLine = new Float64Array(n).fill(NaN_);
  {
    let atrCount = 0;
    let seed = 0;
    let a10 = NaN_;
    let dirPrev = 0;
    let prevFU = NaN_;
    let prevFL = NaN_;
    let prevClose = NaN_;
    for (let i = 0; i < n; i++) {
      const c = candles[i]!;
      const curTr = tr[i]!;
      if (c.invalid || !Number.isFinite(curTr) || c.high === undefined || c.low === undefined) continue;
      if (!Number.isFinite(a10)) {
        seed += curTr;
        atrCount++;
        if (atrCount < 10) continue;
        a10 = seed / 10;
      } else {
        a10 = (a10 * 9 + curTr) / 10;
      }
      atr10[i] = a10;
      const hl2 = (c.high + c.low) / 2;
      const basicUpper = hl2 + 3.0 * a10;
      const basicLower = hl2 - 3.0 * a10;
      let finalUpper: number;
      let finalLower: number;
      if (!Number.isFinite(prevFU) || !Number.isFinite(prevFL)) {
        finalUpper = basicUpper;
        finalLower = basicLower;
      } else {
        // Ratchet finalUpper down when basicUpper < prevUpper or prevClose > prevUpper.
        finalUpper = basicUpper < prevFU || prevClose > prevFU ? basicUpper : prevFU;
        // Ratchet finalLower up when basicLower > prevLower or prevClose < prevLower.
        finalLower = basicLower > prevFL || prevClose < prevFL ? basicLower : prevFL;
      }
      let dir: number;
      if (dirPrev === -1) {
        dir = c.close! > finalUpper ? 1 : -1;
      } else {
        dir = c.close! < finalLower ? -1 : 1;
      }
      stDir[i] = dir;
      stLine[i] = dir === 1 ? finalLower : finalUpper;
      dirPrev = dir;
      prevFU = finalUpper;
      prevFL = finalLower;
      prevClose = c.close!;
    }
  }

  return { ema20, ema50, ema200, trSma50, volRatio, adx14, stDir, stLine, atr10 };
}

const cache = new WeakMap<AnalysisContext, RegimeState>();

/** Per-analysis regime state (WeakMap-cached). */
export function getRegimeState(ctx: AnalysisContext): RegimeState {
  let state = cache.get(ctx);
  if (!state) {
    state = computeRegimeState(ctx);
    cache.set(ctx, state);
  }
  return state;
}

export type RegimeGateRejectReason = string;

export interface BarRegimeSnapshot {
  activeRegimes: string[];
  macroTide: "bullish" | "bearish" | "unknown";
  volRatio: number | undefined;
  adx14: number | undefined;
  htfTrend: HtfTrendContext | undefined;
}

/**
 * Per-bar regime snapshot for UI/telemetry. Every value depends strictly on
 * bars <= i. The snapshot carries no mutation-prone primitives that a caller
 * could use to influence the engine.
 */
export function getBarRegimeSnapshot(ctx: AnalysisContext, i: number): BarRegimeSnapshot {
  const state = getRegimeState(ctx);
  const vol = state.volRatio[i]!;
  const adx = state.adx14[i]!;
  const e50 = state.ema50[i];
  const e200 = state.ema200[i];
  const deadTape = !Number.isFinite(vol) || vol < 0.55;
  const activeRegimes: string[] = [];
  if (deadTape) activeRegimes.push("R0_DEAD_TAPE");
  if (!deadTape) {
    const finite = Number.isFinite(adx);
    if (vol <= 1.3) activeRegimes.push("R1_COILED");
    if (vol <= 1.4 && finite && adx >= 16) activeRegimes.push("R2_TREND_PULLBACK");
    if (vol >= 1.1 && finite && adx >= 22) activeRegimes.push("R3_HIGH_VELOCITY");
    if (vol >= 0.85 && vol <= 1.45) activeRegimes.push("R4_LIQUID_LEVEL");
  }
  const macroTide =
    e50 === undefined || e200 === undefined ? "unknown" : e50 > e200 ? "bullish" : e50 < e200 ? "bearish" : "unknown";
  return {
    activeRegimes,
    macroTide,
    volRatio: Number.isFinite(vol) ? vol : undefined,
    adx14: Number.isFinite(adx) ? adx : undefined,
    htfTrend: ctx.candles[i]?.htfTrend,
  };
}

/**
 * Gate 4 (per-archetype routing) reject helper. Returns the rejection reason
 * or null when the bar is eligible.
 */
function archetypeRoutingReason(strategyId: string, vol: number, adx: number): string | null {
  const archetype = STRATEGY_ARCHETYPES[strategyId];
  if (!archetype) return null; // unregistered strategies are not routed here
  const finiteAdx = Number.isFinite(adx);
  switch (archetype) {
    case R1_COILED:
      if (!(vol <= 1.3)) {
        return "REGIME_ROUTING: R1 coiled breakout requires volRatio <= 1.30";
      }
      return null;
    case R2_TREND_PULLBACK:
      if (!(vol <= 1.4 && finiteAdx && adx >= 16)) {
        return "REGIME_ROUTING: R2 trend pullback requires volRatio <= 1.40 and ADX14 >= 16";
      }
      return null;
    case R3_HIGH_VELOCITY:
      if (!(vol >= 1.1 && finiteAdx && adx >= 22)) {
        return "REGIME_ROUTING: R3 high-velocity requires volRatio >= 1.10 and ADX14 >= 22";
      }
      return null;
    case R4_LIQUID_LEVEL:
      if (!(vol >= 0.85 && vol <= 1.45)) {
        return "REGIME_ROUTING: R4 liquid level requires 0.85 <= volRatio <= 1.45";
      }
      return null;
    default:
      return null;
  }
}

/**
 * LAYER 2 GATE — runs BEFORE consume(). Returns the rejection reason or null.
 *
 *  G1 — Completed-Bar HTF Alignment (structure.ts#htfAllowsDirection) — reject.
 *  G2 — Dead-Tape Lockout (R0_DEAD_TAPE) — reject.
 *  G3 — Macro Institutional Tide (EMA50 vs EMA200) — reject.
 *  G4 — Per-Archetype Volatility & Trend Routing — reject.
 */
export function checkRegimeGate(
  ctx: AnalysisContext,
  i: number,
  strategyId: string,
  side: "long" | "short",
): RegimeGateRejectReason | null {
  const state = getRegimeState(ctx);
  const candle = ctx.candles[i];
  if (!candle) {
    return "REGIME_HTF: H1/H4/D1 structure opposes trade direction";
  }

  // G1 — Completed-Bar HTF Alignment.
  if (!htfAllowsDirection(candle.htfTrend, side)) {
    return "REGIME_HTF: H1/H4/D1 structure opposes trade direction";
  }

  const vol = state.volRatio[i]!;

  // G2 — Dead-Tape Lockout.
  if (!Number.isFinite(vol) || vol < 0.55) {
    return "REGIME_DEAD_TAPE: ATR14/TR50 < 0.55";
  }

  // G3 — Macro Institutional Tide (EMA50 vs EMA200).
  const e50 = state.ema50[i];
  const e200 = state.ema200[i];
  if (e50 === undefined || e200 === undefined) {
    return "REGIME_WARMUP: EMA200 incomplete";
  }
  if ((side === "long" && e50 <= e200) || (side === "short" && e50 >= e200)) {
    return "REGIME_MACRO_TIDE: opposes EMA50/EMA200 institutional trend";
  }

  // G4 — Per-archetype volatility & trend routing.
  return archetypeRoutingReason(strategyId, vol, state.adx14[i]!);
}
