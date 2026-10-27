/**
 * M3 — cost lookup in R units. Side-effect-free except for the one-time
 * frozen JSON read, so it is safe to import from tests.
 *
 * IMPORTANT (D1 correction): the old engine's "spread on entry only" is NOT a
 * half-charge. On a BID series, buying at ask (bid+spread) and selling at bid
 * is exactly one full round-trip spread; for a short, selling at bid and
 * buying back at ask is the same. Shifting the entry by one spread reproduces
 * both. The old model's real defects are (a) a static, regime-blind $0.20
 * magnitude, (b) no slippage, and (c) no crisis/rollover widening. See
 * docs/ENGINE-BIAS-REGISTER.md.
 */
import { readFileSync } from "node:fs";
import { COST, EXIT_HARNESS } from "../frozen.mjs";

let cached = null;
export function costTable() {
  if (!cached) {
    cached = JSON.parse(
      readFileSync(
        new URL("../../../artifacts/map-compass/cost-model.json", import.meta.url),
        "utf8",
      ),
    );
  }
  return cached;
}

/** Vol regime from a bar's own range/close — must match build-cost-model.mjs. */
export function volRegimeOf(bar) {
  const rel = (bar.h - bar.l) / bar.c;
  return rel < COST.volRegime.lowMax ? "low" : rel < COST.volRegime.highMin ? "mid" : "high";
}

export function spreadOverAtr(session, vol, variant = "baseline") {
  const t = costTable();
  const cell = t.table[`${session}|${vol}`];
  if (!cell) {
    // No silent fallback to a cheaper cell: a missing bucket is a hard error.
    throw new Error(`cost model has no cell for ${session}|${vol}`);
  }
  return variant === "stress" ? cell.p95SpreadOverAtr : cell.medianSpreadOverAtr;
}

/**
 * Total round-trip cost in R.
 * 1R = stopAtrMultiple * ATR, so a cost of `x * ATR` costs x/stopAtrMultiple R.
 */
export function costR({ session, vol, variant = "baseline", slippageMultiplier = 1 }) {
  const spread = spreadOverAtr(session, vol, variant);
  const slip = 2 * COST.slippage.atrFractionPerSide * slippageMultiplier;
  return (spread + slip) / EXIT_HARNESS.stopAtrMultiple;
}

/** Net R = gross R minus round-trip cost. */
export function netR(grossR, args) {
  return grossR - costR(args);
}

/** M9 stress variants — diagnostics only, never used for a verdict. */
export const COST_VARIANTS = Object.freeze([
  { id: "baseline", variant: "baseline", slippageMultiplier: 1 },
  { id: "stress", variant: "stress", slippageMultiplier: COST.slippage.stressMultiplier },
  { id: "doubleSlippage", variant: "baseline", slippageMultiplier: 2 },
]);
