/**
 * G0 AMENDMENT 2 (2026-10-27, before any strategy result) — clustered inference.
 *
 * Trades are NOT independent: several variants in a family fire on the same
 * entry bar, and all trades in a calendar day share the same volatility/news
 * shock. Plain i.i.d. standard errors understate uncertainty. This module
 * provides:
 *
 *   clusterSe()       CR1 cluster-robust SE of a mean, clustered by calendar day
 *   effectiveCounts() Kish effective N from overlapping entry bars within a
 *                     family, plus the measured overlap fraction
 *
 * These are used for EVERY t and confidence interval in verifyClaim, and
 * (report-only) in power-check.mjs. Thresholds are unchanged.
 */

const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

/**
 * CR1 cluster-robust standard error of the mean.
 *
 *   e_i = x_i - xbar
 *   S_g = sum of e_i within cluster g
 *   Var  = [G/(G-1)] * [sum_g S_g^2] / N^2        (K = 1 parameter)
 *
 * The G/(G-1) factor is the standard small-sample correction. With one
 * observation per cluster this reduces (up to that factor) to the ordinary SE.
 */
export function clusterSe(values, clusterKeys) {
  const N = values.length;
  if (N < 2) return { se: 0, n: N, clusters: N ? 1 : 0, plainSe: 0 };
  const m = mean(values);
  const sums = new Map();
  for (let i = 0; i < N; i++) {
    const k = clusterKeys[i] ?? `__row_${i}`;
    sums.set(k, (sums.get(k) ?? 0) + (values[i] - m));
  }
  const G = sums.size;
  let meat = 0;
  for (const s of sums.values()) meat += s * s;
  const correction = G > 1 ? G / (G - 1) : 1;
  const se = Math.sqrt((correction * meat) / (N * N));
  // Ordinary SE for reference / diagnostics.
  let ss = 0;
  for (const v of values) ss += (v - m) ** 2;
  const plainSe = Math.sqrt(ss / (N - 1) / N);
  return { se, n: N, clusters: G, plainSe, inflation: plainSe > 0 ? +(se / plainSe).toFixed(4) : null };
}

/** Cluster key for a trade — calendar day in EAT, falling back to year. */
export function dayKey(t) {
  if (t.day) return String(t.day);
  if (t.datetime) return String(t.datetime).slice(0, 10);
  return `year:${t.year}`;
}

/**
 * Effective trade counts for a family whose variants may fire on the SAME bar.
 *
 * Kish effective sample size over entry-bar clusters:
 *   n_eff = (sum_g n_g)^2 / sum_g (n_g^2)
 * where n_g is the number of trades sharing entry bar g. If every bar has one
 * trade, n_eff = n. If all n trades share one bar, n_eff = 1.
 *
 * overlapFraction = share of trades sitting on a bar with >= 2 trades.
 */
export function effectiveCounts(trades) {
  const groups = new Map();
  for (const t of trades) {
    const k = t.entryBar ?? t.barIndex ?? t.index ?? `__row_${groups.size}`;
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  let sumN2 = 0, overlapping = 0, multiBars = 0;
  for (const c of groups.values()) {
    sumN2 += c * c;
    if (c > 1) { overlapping += c; multiBars++; }
  }
  const n = trades.length;
  const distinctBars = groups.size;
  const nEff = sumN2 > 0 ? (n * n) / sumN2 : 0;
  return {
    n,
    distinctBars,
    nEffective: +nEff.toFixed(2),
    overlapFraction: n ? +(overlapping / n).toFixed(4) : 0,
    multiTradeBars: multiBars,
    designEffect: nEff > 0 ? +(n / nEff).toFixed(4) : null,
  };
}

/** Two-sided normal 95% CI from a (clustered) SE. */
export function ci95(estimate, se) {
  return [+(estimate - 1.96 * se).toFixed(6), +(estimate + 1.96 * se).toFixed(6)];
}
