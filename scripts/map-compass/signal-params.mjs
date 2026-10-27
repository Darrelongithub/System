/**
 * G0 AMENDMENT 4 (2026-10-27, before any strategy result) — SIGNAL PARAMETERS.
 *
 * Pure data, no imports, no side effects. This registry is the EXACT parameter
 * set written on each claim card (attached to the card as `parameters`), and it
 * is the single source of truth for lib/signals.mjs. The task requires the
 * 24 entry-signal functions to run "with the exact parameters written on the
 * cards (print them)", so a mismatch here is a freeze-gate violation.
 *
 * The parameters are the PUBLISHED settings for each known strategy. Nothing
 * is fitted to this project's data — the whole point of Amendment 4 is to
 * measure how often these textbook rules fire, before any P&L exists.
 */
export const SIGNAL_PARAMS = Object.freeze({
  // --- F1 channel breakout ------------------------------------------------
  "donchian-20": Object.freeze({ lookback: 20, breakAt: "prior-high/low", entryAt: "close" }),
  "donchian-55": Object.freeze({ lookback: 55, breakAt: "prior-high/low", entryAt: "close" }),
  "dual-thrust": Object.freeze({
    priorDayBars: 48, // one full EAT day of M30 bars
    k: 0, // offset = k * prior-day range (k=0 = break of the prior-day extreme)
  }),
  // --- F2 moving averages ------------------------------------------------
  "sma-20-50": Object.freeze({ fast: 20, slow: 50, entryAt: "close" }),
  "macd-cross": Object.freeze({ fast: 12, slow: 26, signal: 9, entryAt: "close" }),
  "ichimoku-tk": Object.freeze({ tenkan: 9, kijun: 26, entryAt: "close" }),
  // --- F3 opening range / session range ----------------------------------
  "asian-range-break": Object.freeze({
    rangeSession: "asian", // build the range in the Asian session
    rangeBars: 20, // 20 M30 bars = 10h of EAT time
    entrySession: "london", // enter only in the London session
    entryAt: "close",
  }),
  "london-orb-30": Object.freeze({
    rangeBars: 6, // 30 minutes of M30 bars
    entrySession: "london",
    entryAt: "close",
  }),
  "pdh-pdl-break": Object.freeze({ priorDayBars: 48, entryAt: "close" }),
  // --- F4 level retest / pivots ------------------------------------------
  "pdh-retest": Object.freeze({ priorDayBars: 48, touchRel: 0.25, side: "long" }),
  "pdl-retest": Object.freeze({ priorDayBars: 48, touchRel: 0.25, side: "short" }),
  "classic-pivot": Object.freeze({
    priorDayBars: 48,
    touchRel: 0.25,
    levels: "PP,S1,R1", // bounce from S1 long / reject at R1 short
  }),
  // --- F5 oscillator fade ------------------------------------------------
  "rsi-14-30-70": Object.freeze({ period: 14, oversold: 30, overbought: 70 }),
  "williams-r-fade": Object.freeze({ period: 14, oversold: -80, overbought: -20 }),
  "stochastic-14-fade": Object.freeze({ period: 14, kSmooth: 1, dSmooth: 3, low: 20, high: 80 }),
  // --- F6 band reversion -------------------------------------------------
  "bollinger-20-2": Object.freeze({ period: 20, numerStd: 2 }),
  "keltner-20-atr": Object.freeze({ period: 20, atrPeriod: 20, atrMultiple: 2 }),
  "bb-squeeze-fade": Object.freeze({ period: 20, numerStd: 2, squeezeFactor: 0.9 }),
  // --- F7 candlestick reversal -------------------------------------------
  "engulfing": Object.freeze({ bodyRatio: 0.6 }),
  "morning-evening-star": Object.freeze({ bodyRatio: 0.4 }),
  "three-soldiers-crows": Object.freeze({ bodyRatio: 0.5 }),
  // --- F8 volatility compression ----------------------------------------
  "atr-squeeze-break": Object.freeze({ atrPeriod: 14, squeezeFactor: 0.8, lookback: 50, breakRel: 0.5 }),
  "nr7-break": Object.freeze({ lookback: 7, breakRel: 0.25 }),
  "inside-bar-break": Object.freeze({ lookback: 1 }),
});

/** Every id in the registry, in the frozen TEST_ORDER sequence. */
export const SIGNAL_IDS = Object.freeze(Object.keys(SIGNAL_PARAMS));

/** Human-readable parameter string, for the 24-card table and the dump. */
export function paramsToString(id) {
  const p = SIGNAL_PARAMS[id];
  return Object.entries(p)
    .map(([k, v]) =>
      Array.isArray(v) ? `${k}=[${v.join(",")}]` : typeof v === "string" ? `${k}=${v}` : `${k}=${v}`,
    )
    .join(", ");
}

/** Serialisable copy, for machine-readable reporting. */
export function signalParamTable() {
  return Object.fromEntries(
    SIGNAL_IDS.map((id) => [id, { ...SIGNAL_PARAMS[id], string: paramsToString(id) }]),
  );
}
