/**
 * LAYER 1 & 2 — Causal Regime Classifier & Stage 2A Strict Per-Bot Edge-Zone Router (v3.0).
 *
 * One WeakMap-cached RegimeState per AnalysisContext. Every value at index i
 * is derived strictly from bars <= i (invalid rows are skipped without
 * contaminating the smoothing state), so a setup signalled at bar i reflects
 * exactly what was knowable at that instant — zero lookahead.
 *
 * Precomputed series (Float64Array / Int8Array, NaN / 0 = undefined):
 *   ema20  — reused from ctx.ema20 (generator-supplied / shared EMA helper)
 *   ema50 / ema200 — shared ema() helper
 *   trSma50 — 50-bar simple average of valid True Range over [i-49 .. i]
 *             (requires >= 40 valid TRs in the window)
 *   volRatio — ctx.atr[i] / trSma50[i]
 *   vol1d10d — short/medium volatility expansion ratio: SMA(TR, 48) / SMA(TR, 480)
 *              (~1 trading day vs ~10 trading days; causal warm-up tolerant)
 *   adr10 — 10-day Average Daily Range strictly from completed EAT calendar days < today
 *   todayRangeBefore — intraday high-low range accumulated strictly on bars < i of today
 *   adx14 — Standard Wilder(14) ADX
 *   superTrend — ATR(10) Wilder-smoothed (prev*9+tr)/10, mult 3.0,
 *                ratchet finalUpper down / finalLower up per the documented rules
 *
 * Stage 2A Strict Per-Bot Edge-Zone Switching:
 *   Instead of routing all 30 bots through only 4 coarse archetype buckets,
 *   `checkRegimeGate` applies:
 *     G1 — Completed-Bar HTF Alignment (structure.ts#htfAllowsDirection)
 *     G2 — Dead-Tape Lockout (R0_DEAD_TAPE: volRatio < 0.55)
 *     G3 — Macro Institutional Tide (EMA50 vs EMA200)
 *     G4 — Archetype Routing Envelope (R1 / R2 / R3 / R4)
 *     G5 — Stage 2A Per-Bot Structural Edge Zone + ADR10 Exhaustion Ceiling
 *          (silences each bot outside its empirically proven structural sweet spot).
 */
import { htfAllowsDirection } from "./structure";
import { ema } from "./indicators";
import { eatDay, eatParts } from "./time";
import type { AnalysisContext, HtfTrendContext } from "./types";

const R1_COILED = "R1";
const R2_TREND_PULLBACK = "R2";
const R3_HIGH_VELOCITY = "R3";
const R4_LIQUID_LEVEL = "R4";

export type StrategyArchetype =
  | typeof R1_COILED
  | typeof R2_TREND_PULLBACK
  | typeof R3_HIGH_VELOCITY
  | typeof R4_LIQUID_LEVEL;

/** Per-archetype routing for all 30 v3.0 production bots (8 Core + 22 Expansion). */
export const STRATEGY_ARCHETYPES: Record<string, StrategyArchetype> = {
  // Core 8 (v2.2 foundation)
  "donchian-55-coiled": R1_COILED,
  "keltner-squeeze-release": R1_COILED,
  "killzone-orb-stretch": R1_COILED,
  "supertrend-ema-pullback": R2_TREND_PULLBACK,
  "kijun-cloud-continuation": R2_TREND_PULLBACK,
  "engulfing-zone-retest": R2_TREND_PULLBACK,
  "asymmetric-vol-breakout": R3_HIGH_VELOCITY,
  "ny-pivot-s1r1-reject": R4_LIQUID_LEVEL,
  // Expansion 22 (v3.0 certified arsenal)
  "dreiss-chop-trend-birth": R1_COILED,
  "weekly-highlow-breakout": R1_COILED,
  "fuller-fakey-reversal": R4_LIQUID_LEVEL,
  "crabel-nr7-ignition": R1_COILED,
  "bollinger-bandwidth-pop": R1_COILED,
  "fib-golden-pocket-impulse": R2_TREND_PULLBACK,
  "fast-adx7-di-cross": R3_HIGH_VELOCITY,
  "keltner-15atr-tight-surge": R1_COILED,
  "marubozu-displacement-thrust": R3_HIGH_VELOCITY,
  "kama-efficiency-breakout": R1_COILED,
  "sunrise-pullback-window": R2_TREND_PULLBACK,
  "aroon-25-dominance": R1_COILED,
  "donchian-20-turbo": R3_HIGH_VELOCITY,
  "ny-silver-bullet-window": R3_HIGH_VELOCITY,
  "roc12-adx-thrust": R3_HIGH_VELOCITY,
  "brooks-h2l2-second-entry": R2_TREND_PULLBACK,
  "fvg-displacement-retest": R2_TREND_PULLBACK,
  "linreg-30-channel-break": R3_HIGH_VELOCITY,
  "lambert-cci20-momentum": R1_COILED,
  "outside-bar-sweep-thrust": R4_LIQUID_LEVEL,
  "chandelier-22-flip": R1_COILED,
  "vortex-14-thrust": R3_HIGH_VELOCITY,
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
  vol1d10d: Float64Array;
  adr10: Float64Array;
  todayRangeBefore: Float64Array;
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
      const add = tr[i]!;
      if (Number.isFinite(add)) {
        windowSum += add;
        windowCount++;
      }
      if (i >= 50) {
        const drop = tr[i - 50]!;
        if (Number.isFinite(drop)) {
          windowSum -= drop;
          windowCount--;
        }
      }
      if (i >= 49 && windowCount >= 40) {
        trSma50[i] = windowSum / windowCount;
      }
    }
  }

  // ---- volRatio = ctx.atr[i] / trSma50[i] ----
  const volRatio = new Float64Array(n).fill(NaN_);
  for (let i = 0; i < n; i++) {
    const a = ctx.atr[i];
    const m = trSma50[i]!;
    if (a !== undefined && Number.isFinite(a) && Number.isFinite(m) && m > 0) {
      volRatio[i] = a / m;
    }
  }

  // ---- vol1d10d = SMA(TR, 48) / SMA(TR, 480) (~1d / ~10d structural vol expansion) ----
  const vol1d10d = new Float64Array(n).fill(NaN_);
  {
    let sum48 = 0;
    let cnt48 = 0;
    let sum480 = 0;
    let cnt480 = 0;
    for (let i = 0; i < n; i++) {
      const add = tr[i]!;
      if (Number.isFinite(add)) {
        sum48 += add;
        cnt48++;
        sum480 += add;
        cnt480++;
      }
      if (i >= 48) {
        const drop48 = tr[i - 48]!;
        if (Number.isFinite(drop48)) {
          sum48 -= drop48;
          cnt48--;
        }
      }
      if (i >= 480) {
        const drop480 = tr[i - 480]!;
        if (Number.isFinite(drop480)) {
          sum480 -= drop480;
          cnt480--;
        }
      }
      if (cnt48 >= 36 && cnt480 >= 320 && sum480 > 0) {
        vol1d10d[i] = (sum48 / cnt48) / (sum480 / cnt480);
      }
    }
  }

  // ---- Causal ADR10 & Today Intraday Range Before Bar i (directly from candles) ----
  const adr10 = new Float64Array(n).fill(NaN_);
  const todayRangeBefore = new Float64Array(n).fill(0);
  {
    const completedRanges: number[] = [];
    let curDay = "";
    let dayHi = -Infinity;
    let dayLo = Infinity;
    let curAdr = NaN_;
    for (let i = 0; i < n; i++) {
      const c = candles[i]!;
      if (c.invalid || c.high === undefined || c.low === undefined) continue;
      const d = eatDay(c.datetime);
      if (d !== curDay) {
        if (curDay !== "" && Number.isFinite(dayHi) && Number.isFinite(dayLo) && dayHi >= dayLo) {
          completedRanges.push(dayHi - dayLo);
          if (completedRanges.length >= 5) {
            const tail = completedRanges.slice(-10);
            curAdr = tail.reduce((s, v) => s + v, 0) / tail.length;
          }
        }
        curDay = d;
        dayHi = -Infinity;
        dayLo = Infinity;
      }
      adr10[i] = curAdr;
      todayRangeBefore[i] = Number.isFinite(dayHi) && Number.isFinite(dayLo) ? dayHi - dayLo : 0;
      if (c.high > dayHi) dayHi = c.high;
      if (c.low < dayLo) dayLo = c.low;
    }
  }

  // ---- Wilder(14) ADX ----
  const adx14 = new Float64Array(n).fill(NaN_);
  {
    let dmCount = 0;
    let seedTr = 0;
    let seedPlus = 0;
    let seedMinus = 0;
    let smTr = NaN_;
    let smPlus = NaN_;
    let smMinus = NaN_;
    let dxCount = 0;
    let seedDx = 0;
    let adx = NaN_;
    let prevValid: { high: number; low: number } | undefined;

    for (let i = 0; i < n; i++) {
      const c = candles[i]!;
      const curTr = tr[i]!;
      if (c.invalid || !Number.isFinite(curTr) || c.high === undefined || c.low === undefined) continue;

      if (!prevValid) {
        prevValid = { high: c.high, low: c.low };
        continue;
      }
      const upMove = c.high - prevValid.high;
      const downMove = prevValid.low - c.low;
      const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
      const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;
      prevValid = { high: c.high, low: c.low };

      if (!Number.isFinite(smTr)) {
        seedTr += curTr;
        seedPlus += plusDM;
        seedMinus += minusDM;
        dmCount++;
        if (dmCount < 14) continue;
        smTr = seedTr;
        smPlus = seedPlus;
        smMinus = seedMinus;
      } else {
        smTr = smTr - smTr / 14 + curTr;
        smPlus = smPlus - smPlus / 14 + plusDM;
        smMinus = smMinus - smMinus / 14 + minusDM;
      }

      if (smTr <= 0) continue;
      const plusDI = (100 * smPlus) / smTr;
      const minusDI = (100 * smMinus) / smTr;
      const diSum = plusDI + minusDI;
      const dx = diSum <= 0 ? 0 : (100 * Math.abs(plusDI - minusDI)) / diSum;

      if (!Number.isFinite(adx)) {
        seedDx += dx;
        dxCount++;
        if (dxCount < 14) continue;
        adx = seedDx / 14;
      } else {
        adx = (adx * 13 + dx) / 14;
      }
      adx14[i] = adx;
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
        finalUpper = basicUpper < prevFU || prevClose > prevFU ? basicUpper : prevFU;
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

  return {
    ema20,
    ema50,
    ema200,
    trSma50,
    volRatio,
    vol1d10d,
    adr10,
    todayRangeBefore,
    adx14,
    stDir,
    stLine,
    atr10,
  };
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
    e50 === undefined || e200 === undefined
      ? "unknown"
      : e50 > e200
        ? "bullish"
        : e50 < e200
          ? "bearish"
          : "unknown";
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
  if (!archetype) return null;
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
 * Gate 4 + Gate 5 (Stage 2A Strict Per-Bot Edge-Zone Switching + ADR10 Exhaustion Ceiling).
 * Silences each of the 30 certified bots outside its empirically proven structural sweet spot
 * on M30 Gold (exact thresholds certified on 79,586 bars `2020-2026` at `$0.50/oz` real cost).
 */
function stage2APerBotEdgeReason(
  ctx: AnalysisContext,
  state: RegimeState,
  i: number,
  strategyId: string,
  side: "long" | "short",
): string | null {
  const archetype = STRATEGY_ARCHETYPES[strategyId];
  if (!archetype) return null;

  const vol = state.volRatio[i]!;
  const adx = state.adx14[i]!;
  const v1_10 = state.vol1d10d[i]!;
  const adr = state.adr10[i]!;
  const todayRng = state.todayRangeBefore[i]!;
  const candle = ctx.candles[i]!;
  const hour = eatParts(candle.datetime)?.hour ?? 0;

  // R1 / R3 Intraday ADR10 Exhaustion Ceiling (> 1.25x ADR10 before entry = chasing exhausted tape)
  if (
    (archetype === R1_COILED || archetype === R3_HIGH_VELOCITY) &&
    Number.isFinite(adr) &&
    adr > 0 &&
    todayRng > 1.25 * adr
  ) {
    return "REGIME_EDGE_ZONE: intraday range exceeds 1.25x ADR10 breakout exhaustion ceiling";
  }

  // Causal warm-up tolerance: when series < 480 bars, v1_10 is NaN -> fall back to volRatio >= 1.0;
  // once >= 480 bars (>= 1,000-bar live contract), v1_10 is exact and strictly enforced!
  const v1Gt = (thresh: number) => (Number.isFinite(v1_10) ? v1_10 > thresh : vol >= thresh);
  const fAdx = Number.isFinite(adx);

  switch (strategyId) {
    // ── Core 8 Bots (Exact Certified Stage 2A Thresholds) ──────────────────
    case "donchian-55-coiled":
      return vol <= 1.3 && !(Number.isFinite(v1_10) && v1_10 <= 1.0 && fAdx && adx >= 20 && adx <= 30)
        ? null
        : "REGIME_EDGE_ZONE: donchian-55-coiled outside coiled expansion edge zone";
    case "killzone-orb-stretch":
      return vol >= 0.85 && vol <= 1.3 && v1Gt(1.0)
        ? null
        : "REGIME_EDGE_ZONE: killzone-orb-stretch requires 0.85 <= volRatio <= 1.30 and 1d/10d vol > 1.00";
    case "asymmetric-vol-breakout":
      return vol >= 1.1 && fAdx && adx >= 25
        ? null
        : "REGIME_EDGE_ZONE: asymmetric-vol-breakout requires volRatio >= 1.10 and ADX14 >= 25";
    case "supertrend-ema-pullback":
      return vol <= 1.15 && fAdx && adx >= 26 && v1Gt(1.0) && hour >= 10 && hour <= 21
        ? null
        : "REGIME_EDGE_ZONE: supertrend-ema-pullback requires volRatio <= 1.15, ADX14 >= 26, 1d/10d vol > 1.00, EAT 10-21";
    case "keltner-squeeze-release":
      return vol >= 0.85 && vol <= 1.3 && hour >= 15
        ? null
        : "REGIME_EDGE_ZONE: keltner-squeeze-release requires 0.85 <= volRatio <= 1.30 and EAT hour >= 15";
    case "kijun-cloud-continuation": {
      const want = side === "long" ? "bullish" : "bearish";
      return vol <= 1.4 && fAdx && adx >= 16 && candle.htfTrend?.h4 === want && candle.htfTrend?.d1 === want
        ? null
        : "REGIME_EDGE_ZONE: kijun-cloud-continuation requires volRatio <= 1.40, ADX14 >= 16, and explicit H4+D1 alignment";
    }
    case "engulfing-zone-retest":
      return vol <= 1.4 && fAdx && adx >= 16 && v1Gt(1.0)
        ? null
        : "REGIME_EDGE_ZONE: engulfing-zone-retest requires volRatio <= 1.40, ADX14 >= 16, and 1d/10d vol > 1.00";
    case "ny-pivot-s1r1-reject":
      return vol >= 0.85 && vol <= 1.2
        ? null
        : "REGIME_EDGE_ZONE: ny-pivot-s1r1-reject requires 0.85 <= volRatio <= 1.20";

    // ── Expansion 22 Bots (Exact Certified Stage 2A Thresholds) ────────────
    case "sunrise-pullback-window":
      return fAdx && adx >= 22 && v1Gt(0.95) && vol <= 1.35
        ? null
        : "REGIME_EDGE_ZONE: sunrise-pullback-window requires ADX14 >= 22, 1d/10d vol > 0.95, volRatio <= 1.35";
    case "chandelier-22-flip":
      return v1Gt(1.0) && vol >= 0.85 && vol <= 1.35
        ? null
        : "REGIME_EDGE_ZONE: chandelier-22-flip requires 1d/10d vol > 1.00 and 0.85 <= volRatio <= 1.35";
    case "kama-efficiency-breakout":
      return v1Gt(1.0) && vol >= 0.85 && vol <= 1.35 && hour >= 9 && hour <= 21
        ? null
        : "REGIME_EDGE_ZONE: kama-efficiency-breakout requires 1d/10d vol > 1.00, 0.85 <= volRatio <= 1.35, EAT 09-21";
    case "keltner-15atr-tight-surge":
      return v1Gt(1.0) && vol >= 0.85 && vol <= 1.35 && fAdx && adx >= 22
        ? null
        : "REGIME_EDGE_ZONE: keltner-15atr-tight-surge requires 1d/10d vol > 1.00, 0.85 <= volRatio <= 1.35, ADX14 >= 22";
    case "fast-adx7-di-cross":
      return v1Gt(1.0) && vol >= 0.9 && vol <= 1.4
        ? null
        : "REGIME_EDGE_ZONE: fast-adx7-di-cross requires 1d/10d vol > 1.00 and 0.90 <= volRatio <= 1.40";
    case "donchian-20-turbo":
      return v1Gt(1.05) && fAdx && adx >= 24 && vol >= 1.0 && vol <= 1.45
        ? null
        : "REGIME_EDGE_ZONE: donchian-20-turbo requires 1d/10d vol > 1.05, ADX14 >= 24, 1.00 <= volRatio <= 1.45";
    case "lambert-cci20-momentum":
    case "aroon-25-dominance":
      return v1Gt(1.0) && vol >= 0.85 && vol <= 1.35 && fAdx && adx >= 20
        ? null
        : `REGIME_EDGE_ZONE: ${strategyId} requires 1d/10d vol > 1.00, 0.85 <= volRatio <= 1.35, ADX14 >= 20`;
    case "dreiss-chop-trend-birth":
    case "bollinger-bandwidth-pop":
      return v1Gt(0.98) && vol >= 0.85 && vol <= 1.35
        ? null
        : `REGIME_EDGE_ZONE: ${strategyId} requires 1d/10d vol > 0.98 and 0.85 <= volRatio <= 1.35`;
    case "crabel-nr7-ignition":
      return hour >= 9 && hour <= 21 && v1Gt(0.95) && vol >= 0.8 && vol <= 1.35
        ? null
        : "REGIME_EDGE_ZONE: crabel-nr7-ignition requires EAT 09-21, 1d/10d vol > 0.95, 0.80 <= volRatio <= 1.35";
    case "weekly-highlow-breakout":
      return v1Gt(1.0) && vol >= 0.85 && vol <= 1.4
        ? null
        : "REGIME_EDGE_ZONE: weekly-highlow-breakout requires 1d/10d vol > 1.00 and 0.85 <= volRatio <= 1.40";
    case "brooks-h2l2-second-entry":
      return fAdx && adx >= 26 && v1Gt(1.0) && vol >= 0.85 && vol <= 1.25 && hour >= 10 && hour <= 21
        ? null
        : "REGIME_EDGE_ZONE: brooks-h2l2-second-entry requires ADX14 >= 26, 1d/10d vol > 1.00, 0.85 <= volRatio <= 1.25, EAT 10-21";
    case "marubozu-displacement-thrust":
      return v1Gt(1.0) && fAdx && adx >= 22 && vol >= 0.9 && vol <= 1.45
        ? null
        : "REGIME_EDGE_ZONE: marubozu-displacement-thrust requires 1d/10d vol > 1.00, ADX14 >= 22, 0.90 <= volRatio <= 1.45";
    case "fvg-displacement-retest":
      return fAdx && adx >= 22 && v1Gt(1.0) && vol >= 0.85 && vol <= 1.35
        ? null
        : "REGIME_EDGE_ZONE: fvg-displacement-retest requires ADX14 >= 22, 1d/10d vol > 1.00, 0.85 <= volRatio <= 1.35";
    case "roc12-adx-thrust":
      return v1Gt(1.08) && fAdx && adx >= 26 && vol >= 1.0 && vol <= 1.38 && hour >= 10 && hour <= 21
        ? null
        : "REGIME_EDGE_ZONE: roc12-adx-thrust requires 1d/10d vol > 1.08, ADX14 >= 26, 1.00 <= volRatio <= 1.38, EAT 10-21";
    case "ny-silver-bullet-window":
      return (hour === 17 || hour === 18) && vol >= 0.9 && vol <= 1.45 && v1Gt(1.0)
        ? null
        : "REGIME_EDGE_ZONE: ny-silver-bullet-window requires EAT 17-18, 1d/10d vol > 1.00, 0.90 <= volRatio <= 1.45";
    case "linreg-30-channel-break":
    case "vortex-14-thrust":
      return v1Gt(1.0) && fAdx && adx >= 22 && vol >= 0.9 && vol <= 1.4
        ? null
        : `REGIME_EDGE_ZONE: ${strategyId} requires 1d/10d vol > 1.00, ADX14 >= 22, 0.90 <= volRatio <= 1.40`;
    case "fuller-fakey-reversal":
      return vol >= 0.85 && vol <= 1.35 && hour >= 9 && hour <= 22
        ? null
        : "REGIME_EDGE_ZONE: fuller-fakey-reversal requires 0.85 <= volRatio <= 1.35 and EAT 09-22";
    case "fib-golden-pocket-impulse":
      return fAdx && adx >= 22 && v1Gt(1.0) && vol <= 1.3
        ? null
        : "REGIME_EDGE_ZONE: fib-golden-pocket-impulse requires ADX14 >= 22, 1d/10d vol > 1.00, volRatio <= 1.30";
    case "outside-bar-sweep-thrust":
      return hour >= 9 && hour <= 21 && v1Gt(1.0) && fAdx && adx >= 22 && vol >= 0.85 && vol <= 1.35
        ? null
        : "REGIME_EDGE_ZONE: outside-bar-sweep-thrust requires EAT 09-21, 1d/10d vol > 1.00, ADX14 >= 22, 0.85 <= volRatio <= 1.35";
    default:
      return archetypeRoutingReason(strategyId, vol, adx);
  }
}

/**
 * LAYER 2 + STAGE 2A STRICT GATE — runs BEFORE consume(). Returns rejection reason or null.
 *
 *  G1 — Completed-Bar HTF Alignment (structure.ts#htfAllowsDirection) — reject.
 *  G2 — Dead-Tape Lockout (R0_DEAD_TAPE) — reject.
 *  G3 — Macro Institutional Tide (EMA50 vs EMA200) — reject.
 *  G4/G5 — Stage 2A Strict Per-Bot Structural Edge Zone + ADR10 Exhaustion Ceiling — reject.
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

  // G4/G5 — Stage 2A Strict Per-Bot Structural Edge-Zone Switching
  // (replaces the coarse 4-bucket archetype envelope with each bot's exact
  // certified volRatio, ADX14, 1d/10d vol expansion, EAT session, and ADR10 bounds).
  return stage2APerBotEdgeReason(ctx, state, i, strategyId, side);
}
