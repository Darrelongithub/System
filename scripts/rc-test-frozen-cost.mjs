#!/usr/bin/env node
/**
 * Stage 3 — measured, session-dependent spread cost overlay.
 *
 * Frozen rule (G0 + Amendment 2-4, read-only from origin/arena/072665f9-system):
 *   volRegime(bar)  = range/close < 0.0006 → low ; < 0.0016 → mid ; else high
 *   spread(session|vol) = medianSpreadOverAtr (baseline) | p95SpreadOverAtr (stress)
 *   costR = (spread + 2 * 0.02 * slippageMultiplier) / 1.5    [1R = 1.5×ATR14]
 *   slippageMultiplier = 1 (baseline) | 2 (stress)
 *
 * UNMEASURED YEARS (2004–2009, 2016, 2017, 2019 — no spread-table samples for
 * any of those years; lab MEASURES only the sampled months below) use the
 * conservative session-level worst-regime p95 spread-per-ATR (MAX of the three
 * vol cells' p95SpreadOverAtr per session), 1× slippage — never flat 1.85 bps.
 *
 * Measured years (2010, 2011, 2012, 2013, 2014, 2015, 2018, 2020–2026):
 *   lab per-(session,vol) cell median (baseline).
 *
 * Offline guard: refuses to silently fall back to a cheaper cell.
 */
const COST = {
  stopAtrMultiple: 1.5,
  slippageAtrFractionPerSide: 0.02,
  lowMax: 0.0006,
  highMin: 0.0016,
  table: {
    "asian|high":  { median: 0.12623, p95: 0.32099 },
    "asian|low":   { median: 0.25125, p95: 0.52167 },
    "asian|mid":   { median: 0.20000, p95: 0.41950 },
    "london|high": { median: 0.12511, p95: 0.28932 },
    "london|low":  { median: 0.27106, p95: 0.50170 },
    "london|mid":  { median: 0.18212, p95: 0.36529 },
    "ny|high":     { median: 0.09163, p95: 0.20022 },
    "ny|low":      { median: 0.16108, p95: 0.34806 },
    "ny|mid":      { median: 0.11883, p95: 0.24950 },
  },
};
const MEASURED_YEARS = [2010, 2011, 2012, 2013, 2014, 2015, 2018, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const UNMEASURED_YEARS = [2004, 2005, 2006, 2007, 2008, 2009, 2016, 2017, 2019];

export function volRegimeOf(bar) {
  const rel = (bar.h - bar.l) / bar.c;
  return rel < COST.lowMax ? "low" : rel < COST.highMin ? "mid" : "high";
}
export function sessionOfDatetime(dt) {
  const m = /^\d{4}-\d{2}-\d{2} (\d{2}):(\d{2})/.exec(String(dt));
  if (!m) return undefined;
  const mins = +m[1] * 60 + +m[2];
  if (mins >= 60 && mins <= 10 * 60 + 59) return "asian";
  if (mins >= 11 * 60 && mins <= 15 * 60 + 59) return "london";
  return "ny";
}
export function yearOfDatetime(dt) { return Number(String(dt).slice(0, 4)); }
export function isMeasuredYear(year) { return MEASURED_YEARS.includes(year); }
export function isUnmeasuredYear(year) { return UNMEASURED_YEARS.includes(year); }
export function sessionWorstP95Spread(session) {
  // conservative floor for unmeasured years: worst vol-regime p95 for that session
  let worst = 0;
  for (const vol of ["low", "mid", "high"]) {
    const cell = COST.table[`${session}|${vol}`];
    if (cell && cell.p95 > worst) worst = cell.p95;
  }
  if (worst <= 0) return undefined;
  return worst;
}
export function spreadOverAtrForTrade({ session, vol, year, variant = "baseline" }) {
  if (!session) return undefined;
  if (isMeasuredYear(year)) {
    const cell = COST.table[`${session}|${vol}`];
    if (!cell) return undefined; // hard error, never fall back
    return variant === "stress" ? cell.p95 : cell.median;
  }
  // unmeasured year: conservative session-dependent floor (never flat)
  const worst = sessionWorstP95Spread(session);
  return worst; // baseline slippage applied in costR
}
export function costRForTrade({ session, vol, year, atr14, riskPrice, slippageMultiplier = 1, variant = "baseline" }) {
  // 1R = |entry - SL| (the actual trade risk); cost is in those R units.
  const spread = spreadOverAtrForTrade({ session, vol, year, variant });
  if (!Number.isFinite(spread) || !Number.isFinite(atr14) || atr14 <= 0 || !Number.isFinite(riskPrice) || riskPrice <= 0) return undefined;
  const slip = 2 * COST.slippageAtrFractionPerSide * slippageMultiplier; // in ATR units
  const totalSpreadInAtr = spread + slip;             // in ATR units
  const totalPrice = totalSpreadInAtr * atr14;        // price units
  return totalPrice / riskPrice;                       // in R units
}
