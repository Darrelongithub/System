import type { AnalysisContext } from "../types";

/* ------------------------------------------------------------------
 * Per-run consumption ledger.
 *
 * Bars are analysed oldest -> newest, so a strategy can mark a level as used up
 * (swept swing, mitigated order block, filled FVG) and never re-trigger on it.
 * ------------------------------------------------------------------ */

export function isConsumed(ctx: AnalysisContext, strategyId: string, key: string): boolean {
  return ctx.consumed.get(strategyId)?.has(key) ?? false;
}

export function consume(ctx: AnalysisContext, strategyId: string, key: string): void {
  const set = ctx.consumed.get(strategyId) ?? new Set<string>();
  set.add(key);
  ctx.consumed.set(strategyId, set);
}
