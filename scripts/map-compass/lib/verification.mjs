/**
 * M5 — claim verification. Side-effect-free statistics; the ledger writer is
 * separate (claim-ledger.mjs) so tests can import this safely.
 *
 * REVISED at G0 (before any real result) after review. Three changes:
 *
 *  1. THE NULL IS NOT ZERO. A claim must beat a MATCHED RANDOM-ENTRY baseline
 *     (same state, side, session, vol regime, same stop/target/costs). DEV
 *     2004-2011 is a bull run (mean close 414 -> 1,579); an unconditional long
 *     with a 2R target has positive expectancy there. Testing against zero
 *     would confirm drift, not skill.
 *  2. EVERY claim reports a continuous excess estimate + 95% CI and a
 *     long/short split, regardless of verdict. "Nothing CONFIRMED" is still a
 *     readable answer.
 *  3. Definition-sensitivity no longer NULLIFIES a verdict. The frozen cutoffs
 *     are authoritative (SENSITIVITY_RULE); the sweep produces a stability
 *     GRADE (ROBUST / FRAGILE / DEFINITION_SENSITIVE) and a CONDITIONAL tag.
 *
 * Verification is at FAMILY level (8), not strategy level (24). Holdout years
 * are excluded BEFORE any aggregate statistic (a previous version leaked them
 * into mean/t/totalR; a test injects +99R into holdout years to pin this).
 */
import { CLAIM_CRITERIA, SENSITIVITY_RULE, ROLES } from "../frozen.mjs";
import { clusterSe, dayKey, effectiveCounts, ci95 } from "./cluster.mjs";

const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const median = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

export function stdev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

export function tStat(a) {
  if (a.length < 2) return 0;
  const sd = stdev(a);
  if (sd === 0) return 0;
  return mean(a) / (sd / Math.sqrt(a.length));
}

/** Two-sample Welch t for difference of means (claim vs matched random). */
export function welchT(a, b) {
  if (a.length < 2 || b.length < 2) return 0;
  const va = stdev(a) ** 2 / a.length;
  const vb = stdev(b) ** 2 / b.length;
  const denom = Math.sqrt(va + vb);
  if (denom === 0) return 0;
  return (mean(a) - mean(b)) / denom;
}

/** Standard error of the difference, for a 95% CI. */
export function diffSe(a, b) {
  if (a.length < 2) return 0;
  return Math.sqrt(stdev(a) ** 2 / a.length + (b.length > 1 ? stdev(b) ** 2 / b.length : 0));
}

/**
 * Look up the matched random-entry null for one trade.
 * Falls back state|side|session|vol -> state|side -> 0, recording the level.
 */
export function matchedBaseline(trade, baseline) {
  if (!baseline) return { mean: 0, n: 0, level: "NONE_ASSUMED_ZERO" };
  const { state, side, session, vol } = trade;
  const fine = baseline.fineCells?.[`${state}|${side}|${session}|${vol}`];
  if (fine?.sufficient) return { mean: fine.meanNetR, n: fine.n, level: "fine" };
  const coarse = baseline.cells?.[`${state}|${side}`];
  if (coarse?.n >= 200) return { mean: coarse.meanNetR, n: coarse.n, level: "coarse" };
  return { mean: 0, n: 0, level: "NONE_ASSUMED_ZERO" };
}

/**
 * Verify ONE claim (strength or weakness) for ONE family in ONE state.
 *
 * `trades`: [{ netR, year, state, side, session, vol }] — resolved at BOOK
 * level with the standardised exit harness and real costs.
 * `direction`: +1 for strength (expect positive), -1 for weakness (expect negative).
 * `baseline`: random-baseline.json (optional in tests; without it the null is 0).
 */
export function verifyClaim(
  trades,
  { direction = +1, sensitivityAgreementPct = 100, baseline = null } = {},
) {
  const cfg = CLAIM_CRITERIA;
  // SEAL: discard holdout/VAL/STRESS trades BEFORE any aggregate statistic.
  const devTrades = trades.filter((t) => ROLES.DEV.includes(t.year));
  const signed = devTrades.map((t) => t.netR * direction);

  // Matched-null EXCESS is the primary quantity. For weakness claims the
  // baseline is also signed (a short-biased random entry in a bear regime).
  const excesses = devTrades.map((t) => {
    const b = matchedBaseline(t, baseline);
    return t.netR * direction - b.mean * direction;
  });
  const baselineLevels = {};
  for (const t of devTrades) {
    const lvl = matchedBaseline(t, baseline).level;
    baselineLevels[lvl] = (baselineLevels[lvl] ?? 0) + 1;
  }

  const n = signed.length;
  const absMean = n ? mean(signed) : 0;
  const excMean = n ? mean(excesses) : 0;

  // G0 AMENDMENT 2: EVERY t and CI uses SEs clustered by calendar day.
  // Trades on the same day share volatility/news shocks; i.i.d. SEs are too
  // small. The matched baseline is a high-n constant (4000 entries/cell), so
  // its sampling error is negligible; the one-sample cluster-robust t on the
  // excess is the primary test. welchT/diffSe remain exported for callers that
  // supply raw baseline samples instead of a table.
  const dayKeys = devTrades.map(dayKey);
  const excessInf = clusterSe(excesses, dayKeys); // CR1, clustered by day
  const signedInf = clusterSe(signed, dayKeys);
  const excSe = excessInf.se;
  const tOne = excSe > 0 ? excMean / excSe : 0;
  const tNet = signedInf.se > 0 ? absMean / signedInf.se : 0;

  // Effective-sample correction for overlapping family variants. Reported and
  // used for POWER only; the t/CI above already account for within-day
  // correlation, so we do NOT double-inflate the SE here.
  const eff = effectiveCounts(devTrades);

  const out = {
    n,
    nEffective: eff.nEffective,
    distinctEntryBars: eff.distinctBars,
    variantOverlapFraction: eff.overlapFraction,
    multiTradeBars: eff.multiTradeBars,
    designEffect: eff.designEffect,
    meanNetR: +absMean.toFixed(6), // absolute, signed by claim direction
    excessVsRandomR: +excMean.toFixed(6), // PRIMARY test quantity
    excessCi95: ci95(excMean, excSe), // day-clustered 95% CI
    meanCi95: ci95(absMean, signedInf.se), // day-clustered 95% CI
    sd: +stdev(signed).toFixed(6),
    t: +tOne.toFixed(4), // cluster-robust t of excess vs 0
    tNet: +tNet.toFixed(4), // cluster-robust t of absolute net R
    inference: {
      method: "CR1_cluster_by_calendar_day",
      clusterField: "day",
      clusters: excessInf.clusters,
      plainSe: +excessInf.plainSe.toFixed(6),
      clusteredSe: +excSe.toFixed(6),
      seInflation: excessInf.inflation,
      ciLevel: 0.95,
      effectiveN: eff.nEffective,
      effectiveNMethod: "Kish_over_entry_bars",
      note: "Thresholds in CLAIM_CRITERIA are unchanged; only the SE estimator changed.",
    },
    medianNetR: n ? +median(signed).toFixed(6) : 0,
    totalR: +signed.reduce((a, b) => a + b, 0).toFixed(4),
    baselineMatchLevels: baselineLevels,
    bySide: {},
    years: {},
    concentration: null,
    loyoPositivePct: null,
    stability: null,
    conditional: false,
    vetoes: [],
    verdict: "INCONCLUSIVE",
  };
  if (n === 0) {
    out.vetoes.push("NO_TRADES");
    return out;
  }

  // Long/short split — the bull-run control must be visible for EVERY claim.
  // AMENDMENT 2: side-level CI also uses day-clustered SEs.
  for (const side of ["long", "short"]) {
    const idx = devTrades
      .map((t, i) => ((t.side ?? "unknown") === side ? i : -1))
      .filter((i) => i >= 0);
    const v = idx.map((i) => signed[i]);
    if (!v.length) continue;
    const se = clusterSe(v, idx.map((i) => dayKeys[i])).se;
    out.bySide[side] = {
      n: v.length,
      meanNetR: +mean(v).toFixed(6),
      ci95: ci95(mean(v), se),
      t: se > 0 ? +(mean(v) / se).toFixed(4) : 0,
      winRate: +(v.filter((x) => x > 0).length / v.length).toFixed(4),
    };
  }

  // Per-year breakdown, DEV only. Uses the EXCESS so a strong year cannot be
  // manufactured by bull-market drift. Within a year we still cluster by day.
  const byYear = new Map();
  for (let i = 0; i < devTrades.length; i++) {
    const y = devTrades[i].year;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(i);
  }
  for (const [y, idx] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    const v = idx.map((i) => excesses[i]);
    const se = clusterSe(v, idx.map((i) => dayKeys[i])).se;
    out.years[y] = {
      n: v.length,
      meanExcessR: +mean(v).toFixed(5),
      ci95: ci95(mean(v), se),
      t: se > 0 ? +(mean(v) / se).toFixed(4) : 0,
      totalExcessR: +v.reduce((a, b) => a + b, 0).toFixed(4),
    };
  }

  const posTotal = Object.values(out.years).reduce((s, y) => s + Math.max(0, y.totalExcessR), 0);
  const maxYear = Math.max(0, ...Object.values(out.years).map((y) => y.totalExcessR));
  out.concentration = posTotal > 0 ? +(maxYear / posTotal).toFixed(4) : null;
  if (out.concentration !== null && out.concentration > cfg.concentrationMax)
    out.vetoes.push(`CONCENTRATION_${out.concentration}`);

  const yearMeans = Object.values(out.years)
    .filter((y) => y.n >= 5)
    .map((y) => y.meanExcessR);
  if (yearMeans.length < 2) out.vetoes.push("TOO_FEW_YEARS");
  else {
    const positive = yearMeans.filter((m) => m > 0).length;
    out.loyoPositivePct = +(positive / yearMeans.length).toFixed(4);
    if (out.loyoPositivePct < cfg.loyoPositiveMin) out.vetoes.push(`LOYO_${out.loyoPositivePct}`);
  }

  // Definition-sensitivity: GRADE, not veto (SENSITIVITY_RULE, decided at G0).
  out.stability =
    sensitivityAgreementPct >= SENSITIVITY_RULE.robustMinPct
      ? "ROBUST"
      : sensitivityAgreementPct >= SENSITIVITY_RULE.fragileMinPct
        ? "FRAGILE"
        : "DEFINITION_SENSITIVE";
  if (out.stability === "DEFINITION_SENSITIVE") out.conditional = true;

  if (n < cfg.minTradesPerCell) {
    out.vetoes.push(`MIN_TRADES_${n}`);
    return out;
  }

  // Primary test: EXCESS over matched random baseline must clear the floor,
  // with t > 2, AND the absolute net R must be positive (a claim that beats a
  // losing baseline but still loses money is not tradeable).
  const clearsFloor = excMean > cfg.practicalFloorR && out.t > cfg.tStatMin;
  const absoluteOk = absMean > cfg.absoluteNetRMin;
  if (clearsFloor && absoluteOk && out.vetoes.length === 0) {
    out.verdict = "CONFIRMED";
  } else if (excMean < -cfg.practicalFloorR || (out.t < -cfg.tStatMin && excMean < 0)) {
    out.verdict = "REFUTED";
  } else {
    if (!absoluteOk) out.vetoes.push(`ABSOLUTE_NET_R_${absMean}`);
    out.verdict = "INCONCLUSIVE";
  }
  return out;
}

/** Group trades into (strategy|state) and (family|state) cells. */
export function cellKey(trade, cards) {
  const family = cards.get(trade.strategyId) ?? trade.family ?? "UNKNOWN";
  return { family, strategy: trade.strategyId, state: trade.state };
}

export function groupByFamilyState(trades, cards) {
  const out = new Map();
  for (const t of trades) {
    const { family, state } = cellKey(t, cards);
    const k = `${family}|${state}`;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(t);
  }
  return out;
}

export function groupByStrategyState(trades) {
  const out = new Map();
  for (const t of trades) {
    const k = `${t.strategyId}|${t.state}`;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(t);
  }
  return out;
}

export function mde(n, sd) {
  if (n < 2) return Infinity;
  return ((1.96 + 0.8416) * sd) / Math.sqrt(n);
}

export function powerAt(n, sd, effect) {
  if (n < 2 || sd <= 0) return 0;
  const z = effect / (sd / Math.sqrt(n)) - 1.96;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? p : 1 - p;
}
