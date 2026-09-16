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
 * Both rules are entry-time only: they read the signal bar and prior history,
 * never a later bar, and a rejected candidate does not consume the strategy's
 * de-dupe slot (see run.ts).
 */
import type { AnalysisContext } from "./types";

const ATR_WINDOW = 50;
const EXTREME_PCTL = 0.95;
/** Filter F: minimum body as a fraction of the signal bar's range. */
const MOMENTUM_BODY_MIN = 0.8;
/** Filter F: maximum upper wick as a fraction of the signal bar's range. */
const MOMENTUM_UPPER_WICK_MAX = 0.02;

const pctCache = new WeakMap<AnalysisContext, (number | null)[]>();

/** ATR percentile of bar i vs prior window [i-WINDOW, i). null if insufficient history. */
function atrPercentileAt(ctx: AnalysisContext, i: number): number | null {
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
function isCounterTrend(
  localTrend: "bullish" | "bearish" | "ranging",
  side: "long" | "short" | undefined,
): boolean {
  if (side === "long") return localTrend === "bearish";
  if (side === "short") return localTrend === "bullish";
  return false;
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
