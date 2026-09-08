import type { Outcome } from "./types";

export const RR_THRESHOLD = 2;
export const RR_FAIL_REASON = "RR below 1:2 threshold";
export const SL_SIDE_REASON = "INVALID: SL on wrong side of entry";
export const NON_POSITIVE_RISK_REASON = "INVALID: non-positive risk — SL invalid for direction";
export const IMPOSSIBLE_PRICES_REASON = "INVALID: non-finite or non-positive price after spread";
export const NON_FINITE_RR_REASON = "INVALID: non-finite RR";

export interface SpreadAdjusted {
  entry: number;
  sl: number;
  tp: number;
  /** Signed RR. Undefined when risk is non-positive (never faked with abs()). */
  rr?: number | undefined;
  invalidReason?: string | undefined;
}

/**
 * Step 4: current backtest cost model (do not change without a separate robustness experiment).
 *
 * Spread is applied only to the entry price:
 *   long  → entry = rawEntry + spread
 *   short → entry = rawEntry - spread
 * SL and TP levels are left unchanged. 1R is then |entry − SL| after that entry adjustment.
 *
 * This is intentionally not a full round-trip model (exit is not widened by spread).
 * OHLC and indicator calculations never see spread — only final Entry/SL/TP pricing.
 */
export function applySpreadAndRR(outcome: Outcome, spread: number): SpreadAdjusted | undefined {
  if (outcome.entry === undefined || outcome.sl === undefined || outcome.tp === undefined) {
    return undefined;
  }
  const long = outcome.side !== "short";
  const entry = long ? outcome.entry + spread : outcome.entry - spread;
  const sl = outcome.sl;
  const tp = outcome.tp;
  // Overflow-hostile data must never surface a PASS row carrying
  // Infinity/NaN/negative prices. Prices are positive by parser contract, so
  // any non-finite or non-positive derived price is an impossible trade.
  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(sl) ||
    !Number.isFinite(tp) ||
    entry <= 0 ||
    sl <= 0 ||
    tp <= 0
  ) {
    return { entry, sl, tp, invalidReason: IMPOSSIBLE_PRICES_REASON };
  }
  // Safety net: the stop must sit on the losing side of the entry.
  if (long ? sl >= entry : sl <= entry) {
    return { entry, sl, tp, invalidReason: SL_SIDE_REASON };
  }
  const risk = long ? entry - sl : sl - entry;
  if (risk <= 0) {
    return { entry, sl, tp, invalidReason: NON_POSITIVE_RISK_REASON };
  }
  // Signed reward: a target on the wrong side yields a negative RR, never abs().
  const reward = long ? tp - entry : entry - tp;
  const rr = reward / risk;
  // Denormal risk can still blow RR up to ±Infinity; reject rather than report.
  if (!Number.isFinite(rr)) {
    return { entry, sl, tp, invalidReason: NON_FINITE_RR_REASON };
  }
  return { entry, sl, tp, rr };
}
