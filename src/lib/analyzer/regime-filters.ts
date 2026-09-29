/**
 * Global candidate-rejection rules (not strategy entry logic).
 *
 * Filter C — counter-trend + extreme ATR percentile (≥ 95%).
 * Percentile ranks atr[i] against prior values in [i-50, i) only.
 * Requires a full 50-bar prior window; insufficient history ⇒ do not reject.
 *
 * Filter F — counter-trend + momentum-bar fade.
 * The signal bar must be a strong directional bar (body ≥ 80% of its range)
 * that closes on its high (upper wick ≤ 2% of range) while the candidate is
 * fading the local swing structure. Every input is read at the signal bar
 * itself; missing OHLC / zero range ⇒ do not reject (fail-open).
 *
 * Research candidates — forward-validation freeze, all default OFF
 * ----------------------------------------------------------------
 * Four further loss-reduction hypotheses live here, frozen from the discovery
 * vocabulary and wired into `run.ts` in the same gate chain as C and F — after
 * C and F, before `consume()`. They ship dormant (`enableFilterX ?? false`)
 * until each has been evaluated **once** on post-2026-08-20 data under the
 * pre-registered criteria in `FORWARD-VALIDATION.md`:
 *
 *   D_conflict_nearPDL    (enableFilterD)               EMA20/50/200 stack conflict
 *                                                 + entry near the prior-day low
 *                                                 (pos ≤ 0.26) + trend-aligned.
 *   H1214                 (enableFilterH1214)           signal bar in hours 12–14 EAT.
 *   Doji+highVol          (enableFilterDojiHighVol)     doji bar (body < 15% of
 *                                                 range) + ATR percentile ≥ 0.80.
 *   doji+compressed       (enableFilterDojiCompressed)  doji bar + range/ATR ≤ 0.66.
 *
 * They follow the same contract as C and F: entry-time only (the signal bar and
 * strictly prior history — never a later bar), fail-open on missing inputs, and
 * a rejected candidate does not consume the strategy's de-dupe slot, so a later
 * bar may still refill it. Constants are frozen (`logs/v1.9-research-filters.md`);
 * changing one starts a new hypothesis with a new evaluation window.
 */
import { dailyAggregates, type DayAggregate } from "./daily";
import { indexOfDay } from "./day-lookup";
import { ema } from "./indicators";
import { eatParts } from "./time";
import type { AnalysisContext } from "./types";

const ATR_WINDOW = 50;
const EXTREME_PCTL = 0.95;
/** Filter F: minimum body as a fraction of the signal bar's range. */
const MOMENTUM_BODY_MIN = 0.8;
/** Filter F: maximum upper wick as a fraction of the signal bar's range. */
const MOMENTUM_UPPER_WICK_MAX = 0.02;

const pctCache = new WeakMap<AnalysisContext, (number | null)[]>();

/**
 * ATR percentile of bar i vs prior window [i-WINDOW, i). null if insufficient
 * history. Shared by Filter C and the research candidates (same window, same
 * ranking rule), so the two can never disagree about "high volatility".
 */
export function atrPercentileAt(ctx: AnalysisContext, i: number): number | null {
  let series = pctCache.get(ctx);
  if (!series) {
    series = new Array(ctx.candles.length).fill(null);
    const atr = ctx.atr;
    for (let idx = 0; idx < ctx.candles.length; idx++) {
      const a = atr[idx];
      if (a === undefined || !Number.isFinite(a)) {
        series[idx] = null;
        continue;
      }
      const start = idx - ATR_WINDOW;
      if (start < 0) {
        series[idx] = null; // full 50-bar window required
        continue;
      }
      const past: number[] = [];
      for (let j = start; j < idx; j++) {
        const v = atr[j];
        if (v !== undefined && Number.isFinite(v)) past.push(v);
      }
      if (past.length < ATR_WINDOW) {
        series[idx] = null;
        continue;
      }
      // Rank current ATR among prior observations only (current not in reference set).
      let le = 0;
      for (const v of past) if (v <= a) le++;
      series[idx] = le / past.length;
    }
    pctCache.set(ctx, series);
  }
  return series[i] ?? null;
}

function isExtremeVol(ctx: AnalysisContext, i: number): boolean {
  const p = atrPercentileAt(ctx, i);
  return p !== null && p >= EXTREME_PCTL;
}

/** Local structure trend vs trade side (entry-time only). */
export function isCounterTrend(
  localTrend: "bullish" | "bearish" | "ranging",
  side: "long" | "short" | undefined,
): boolean {
  if (side === "long") return localTrend === "bearish";
  if (side === "short") return localTrend === "bullish";
  return false;
}

/** A candidate that is not counter-trend (including a side-less diagnostic row). */
export function isTrendAligned(
  localTrend: "bullish" | "bearish" | "ranging",
  side: "long" | "short" | undefined,
): boolean {
  return !isCounterTrend(localTrend, side);
}

/**
 * Filter C: reject when counter-trend AND extreme vol (≥95th ATR percentile).
 * Returns true if the candidate should be rejected.
 */
export function rejectFilterC(
  ctx: AnalysisContext,
  i: number,
  localTrend: "bullish" | "bearish" | "ranging",
  side: "long" | "short" | undefined,
): boolean {
  if (!isCounterTrend(localTrend, side)) return false;
  return isExtremeVol(ctx, i);
}

export const FILTER_C_REASON = "FILTER_C: counter-trend + extreme ATR percentile (≥95%)";

/**
 * Filter F: reject a counter-trend candidate whose signal bar is a strong
 * momentum bar closing on its high (body ≥ 80% of range, upper wick ≤ 2%).
 * Returns true if the candidate should be rejected.
 */
export function rejectFilterF(
  ctx: AnalysisContext,
  i: number,
  localTrend: "bullish" | "bearish" | "ranging",
  side: "long" | "short" | undefined,
): boolean {
  if (!isCounterTrend(localTrend, side)) return false;
  const candle = ctx.candles[i];
  if (!candle || candle.invalid) return false;
  const { high, low, open, close } = candle;
  if (high === undefined || low === undefined || open === undefined || close === undefined)
    return false;
  const range = high - low;
  if (!(range > 0)) return false;
  const bodyPct = Math.abs(close - open) / range;
  const upperWickPct = (high - Math.max(open, close)) / range;
  return bodyPct >= MOMENTUM_BODY_MIN && upperWickPct <= MOMENTUM_UPPER_WICK_MAX;
}

export const FILTER_F_REASON =
  "FILTER_F: counter-trend + momentum bar closing on its high (body ≥80%, upper wick ≤2%)";

/* ------------------------------------------------------------------ *
 * Research candidates (forward-validation freeze — default OFF)
 * ------------------------------------------------------------------ */

/**
 * EMA20/50/200 stack, computed once per series and cached on the context (the
 * same caching discipline the ATR percentile uses). EMA20 is taken from the
 * context when present so the production series is not recomputed; the 50/200
 * are always computed here with the shared `ema()` helper over the same candle
 * series, so all three use identical seeding and smoothing (no lookahead).
 */
interface EmaStack {
  ema20: (number | undefined)[];
  ema50: (number | undefined)[];
  ema200: (number | undefined)[];
}

const emaStackCache = new WeakMap<AnalysisContext, EmaStack>();

function emaStack(ctx: AnalysisContext): EmaStack {
  let stack = emaStackCache.get(ctx);
  if (!stack) {
    stack = {
      ema20: ctx.ema20 ?? ema(ctx.candles, 20),
      ema50: ema(ctx.candles, 50),
      ema200: ema(ctx.candles, 200),
    };
    emaStackCache.set(ctx, stack);
  }
  return stack;
}

/**
 * True when EMA20/50/200 are all defined and NOT in strict bull (20>50>200) or
 * strict bear (20<50<200) order. Undefined EMAs (insufficient history) ⇒ false
 * (fail-open: no rejection without a full stack).
 */
export function isEmaStackConflict(ctx: AnalysisContext, i: number): boolean {
  const { ema20, ema50, ema200 } = emaStack(ctx);
  const e20 = ema20[i];
  const e50 = ema50[i];
  const e200 = ema200[i];
  if (e20 === undefined || e50 === undefined || e200 === undefined) return false;
  const bull = e20 > e50 && e50 > e200;
  const bear = e20 < e50 && e50 < e200;
  return !(bull || bear);
}

const dailyAggregatesCache = new WeakMap<AnalysisContext, DayAggregate[]>();

/** Per-analysis daily aggregates: the context's own array in production. */
function dailyAggregatesFor(ctx: AnalysisContext): DayAggregate[] {
  if (ctx.daily) return ctx.daily;
  let computed = dailyAggregatesCache.get(ctx);
  if (!computed) {
    computed = dailyAggregates(ctx.candles);
    dailyAggregatesCache.set(ctx, computed);
  }
  return computed;
}

/**
 * Position of `entry` within the PREVIOUS EAT calendar day's range:
 * 0 = prior-day low, 1 = prior-day high. null when there is no prior day with
 * data or the prior day's range is zero-width (fail-open).
 */
export function priorDayPos(ctx: AnalysisContext, i: number, entry: number): number | null {
  const candle = ctx.candles[i];
  if (!candle) return null;
  const parts = eatParts(candle.datetime);
  if (!parts) return null;
  const daily = dailyAggregatesFor(ctx);
  const idx = indexOfDay(daily, parts.day);
  if (idx <= 0) return null;
  const prior = daily[idx - 1]!;
  if (!(prior.high > prior.low)) return null;
  return (entry - prior.low) / (prior.high - prior.low);
}

/** Research atom: body < 15% of the bar's range (strict). Fail-open. */
const DOJI_BODY_MAX = 0.15;

export function isDoji(ctx: AnalysisContext, i: number): boolean {
  const c = ctx.candles[i];
  if (!c || c.invalid) return false;
  const { high, low, open, close } = c;
  if (high === undefined || low === undefined || open === undefined || close === undefined)
    return false;
  const range = high - low;
  if (!(range > 0)) return false;
  return Math.abs(close - open) / range < DOJI_BODY_MAX;
}

/**
 * Candidate D — `D_conflict_nearPDL` (+72.83 R on the discovery book, C+F on).
 *
 * Reject a trend-aligned candidate when the EMA20/50/200 stack is conflicted and
 * the entry sits near the prior-day low (pos ≤ 0.26). Counter-trend candidates
 * are explicitly NOT rejected by this rule, and a missing entry, a missing EMA
 * stack or a missing prior day fails open.
 */
const NEAR_PDL = 0.26;

export function rejectFilterD(
  ctx: AnalysisContext,
  i: number,
  localTrend: "bullish" | "bearish" | "ranging",
  side: "long" | "short" | undefined,
  entry: number | undefined,
): boolean {
  if (entry === undefined || !Number.isFinite(entry)) return false;
  if (!isEmaStackConflict(ctx, i)) return false;
  if (isCounterTrend(localTrend, side)) return false; // require trend-aligned
  const pos = priorDayPos(ctx, i, entry);
  if (pos === null || pos > NEAR_PDL) return false;
  return true;
}

export const FILTER_D_REASON = "FILTER_D: emaStackConflict + nearPDL (pos≤0.26) + trendAligned";

/**
 * Candidate H1214 (+28.14 R on the discovery book, C+F on).
 *
 * Reject when the signal bar's EAT hour is 12, 13 or 14 (inclusive). Pure time
 * atom — no OHLC math; an unparseable timestamp fails open.
 */
export function rejectFilterH1214(ctx: AnalysisContext, i: number): boolean {
  const c = ctx.candles[i];
  if (!c) return false;
  const parts = eatParts(c.datetime);
  if (!parts) return false;
  const hour = parts.hour;
  return hour >= 12 && hour <= 14;
}

export const FILTER_H1214_REASON = "FILTER_H1214: hour 12–14 EAT";

/**
 * Candidate Doji+highVol (+17.56 R on the discovery book, C+F on).
 *
 * Reject a doji signal bar (body < 15% of range) whose ATR percentile is ≥ 0.80
 * (prior 50-bar window, same ranking as Filter C). `highVol` at 0.80 is the
 * research vocabulary atom — deliberately not Filter C's 0.95 extreme.
 */
const HIGH_VOL_PCTL = 0.8;

export function rejectFilterDojiHighVol(ctx: AnalysisContext, i: number): boolean {
  if (!isDoji(ctx, i)) return false;
  const p = atrPercentileAt(ctx, i);
  return p !== null && p >= HIGH_VOL_PCTL;
}

export const FILTER_DOJI_HIGHVOL_REASON =
  "FILTER_DOJI_HIGHVOL: doji (body<15%) + highVol (ATR pctl≥0.80)";

/**
 * Candidate doji+compressed (+23.81 R on the discovery book, C+F on).
 *
 * Reject a doji signal bar whose range is compressed against the bar's ATR
 * (range/ATR ≤ 0.66, the `rangeAtr<=0.66` research atom). Missing or
 * non-positive ATR fails open.
 */
const COMPRESSED_RANGE_ATR = 0.66;

export function rejectFilterDojiCompressed(ctx: AnalysisContext, i: number): boolean {
  if (!isDoji(ctx, i)) return false;
  const c = ctx.candles[i];
  const a = ctx.atr[i];
  if (!c || a === undefined || !(a > 0)) return false;
  if (c.high === undefined || c.low === undefined) return false;
  const range = c.high - c.low;
  return range / a <= COMPRESSED_RANGE_ATR;
}

export const FILTER_DOJI_COMPRESSED_REASON =
  "FILTER_DOJI_COMPRESSED: doji (body<15%) + compressed (range/ATR≤0.66)";
