/**
 * Global candidate-rejection rules (not strategy entry logic).
 *
 * Filter C — counter-trend + extreme ATR percentile (≥ 95%).
 * Percentile ranks atr[i] against prior values in [i-50, i) only.
 * Requires a full 50-bar prior window; insufficient history ⇒ do not reject.
 */
import type { AnalysisContext } from "./types";

const ATR_WINDOW = 50;
const EXTREME_PCTL = 0.95;

const pctCache = new WeakMap<AnalysisContext, (number | null)[]>();

/** ATR percentile of bar i vs prior window [i-WINDOW, i). null if insufficient history. */
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

export function isExtremeVol(ctx: AnalysisContext, i: number): boolean {
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
