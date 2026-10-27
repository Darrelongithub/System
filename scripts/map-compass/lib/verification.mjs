/**
 * M5 — claim verification. Side-effect-free statistics; the ledger writer is
 * separate (claim-ledger.mjs) so tests can import this safely.
 *
 * G0 AMENDMENT 3 (2026-10-27, before any real claim result) — RESTORED RULE:
 *
 *   CONFIRMED iff  net mean > +0.10R  AND day-clustered t(net)   > 2
 *             AND  excess     >  0R   AND day-clustered t(excess) > 2
 *             AND  all vetoes clear (n >= 100, concentration, LOYO,
 *                  NO_BASELINE).
 *
 * This replaces the v1.2 rule ("excess > 0.10 and net > 0"). The +0.10R floor
 * is back on the ABSOLUTE NET MEAN — the original v1.0 floor — while the
 * matched random-entry control survives as a second significance gate.
 *
 * Other invariants (unchanged):
 *  - Holdout/VAL/STRESS trades are removed BEFORE any aggregate statistic.
 *  - Every t and CI uses CR1 SEs clustered by calendar day (Amendment 2).
 *  - Kish effective N over entry bars is reported and used for POWER only.
 *  - Verdicts are decided on TWO verdict states (Amendment 3); the four Map
 *    states are reported as diagnostics.
 *  - A supplied baseline that has NO fine AND NO coarse cell for a trade is a
 *    FAIL-CLOSED INCONCLUSIVE (NO_BASELINE). The baseline NEVER falls back to
 *    zero. Only an explicit `baseline: null` (synthetic dry-run calibration)
 *    uses a zero null, and that mode is flagged on every row and is REFUSED by
 *    verifyReal().
 */
import { CLAIM_CRITERIA, SENSITIVITY_RULE, ROLES, verdictStateOf } from "../frozen.mjs";
import { clusterSe, dayKey, effectiveCounts, ci95 } from "./cluster.mjs";

const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const median = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

export const NO_BASELINE = "NO_BASELINE";
export const UNCONTROLLED = "UNCONTROLLED_DRY_RUN";

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
 * Sign-safe excess of one trade over its matched random baseline, expressed in
 * the CLAIM's signed space.
 *
 * SIGN CONVENTION (the reason this is a named function, not inline algebra):
 *   - `netR` is ALREADY signed by the TRADE SIDE. A winning SHORT has netR > 0.
 *   - `baselineMean` is the matched random cell's mean in the SAME R units,
 *     already side-signed (a random short in a bear regime may be negative).
 *   - `direction` is the CLAIM direction (+1 strength, -1 weakness), NOT the
 *     trade side. It must be applied to the DIFFERENCE, never to one term.
 *
 * So a short winning +1.0R against a random-short baseline of -0.10R gives
 * (1.0 - (-0.10)) * (+1) = +1.10, NOT -1.10. Same for a long. Applying
 * direction to only one term, or flipping the short's netR twice, produces the
 * -1.10 error the Amendment-3 unit tests pin down.
 */
export function excessFor(netR, baselineMean, direction = +1) {
  return (netR - baselineMean) * direction;
}

/**
 * Look up the matched random-entry null for one trade.
 *
 *   fine   verdictState|side|session|vol   (Amendment 4 key; preferred)
 *   fine   state|side|session|vol          (v1.3 key, kept for compatibility)
 *   coarse state|side                      (only if n >= baselineMinCellN)
 *   else   MISSING — mean is NULL, never 0.
 *
 * `baseline === null` is the ONLY exception: an explicit UNCONTROLLED dry-run
 * (synthetic calibration) where the null is zero. Real verification must pass
 * a baseline; verifyClaim reports `baseline.mode` on every row so this mode
 * can never masquerade as a controlled result.
 */
export function matchedBaseline(trade, baseline) {
  const minN = CLAIM_CRITERIA.baselineMinCellN;
  if (!baseline) return { mean: 0, n: 0, level: UNCONTROLLED, missing: false };
  const { state, side, session, vol } = trade;
  const vs = trade.verdictState ?? verdictStateOf(state);
  if (vs) {
    const vf = baseline.fineCellsVerdictState?.[`${vs}|${side}|${session}|${vol}`];
    if (vf?.sufficient && vf.n >= minN && Number.isFinite(vf.meanNetR))
      return { mean: vf.meanNetR, n: vf.n, level: "fine-verdictState", missing: false };
  }
  const fine = baseline.fineCells?.[`${state}|${side}|${session}|${vol}`];
  if (fine?.sufficient && fine.n >= minN && Number.isFinite(fine.meanNetR))
    return { mean: fine.meanNetR, n: fine.n, level: "fine", missing: false };
  const coarse = baseline.cells?.[`${state}|${side}`];
  if (coarse?.n >= minN && Number.isFinite(coarse.meanNetR))
    return { mean: coarse.meanNetR, n: coarse.n, level: "coarse", missing: false };
  return { mean: null, n: 0, level: NO_BASELINE, missing: true };
}

/**
 * Verify ONE claim (strength or weakness) for ONE family in ONE VERDICT STATE.
 *
 * `trades`: [{ netR, year, state (four-state), side, session, vol, day,
 *              entryBar, strategyId }] — resolved at BOOK level with the
 *              standardised exit harness, net of real costs.
 * `direction`: +1 strength (expect positive), -1 weakness (expect negative).
 * `baseline`: random-baseline.json. If null, an UNCONTROLLED dry run is
 *             flagged; if supplied, any missing cell is a NO_BASELINE veto.
 */
export function verifyClaim(
  trades,
  { direction = +1, sensitivityAgreementPct = 100, baseline = null } = {},
) {
  const cfg = CLAIM_CRITERIA;
  // SEAL: discard holdout/VAL/STRESS trades BEFORE any aggregate statistic.
  const devTrades = trades.filter((t) => ROLES.DEV.includes(t.year));
  const signed = devTrades.map((t) => t.netR * direction);
  const n = signed.length;

  // Matched-baseline lookup, done ONCE per trade and reused everywhere.
  const baseInfo = devTrades.map((t) => matchedBaseline(t, baseline));
  const matchedIdx = [];
  const baselineLevels = {};
  for (let i = 0; i < n; i++) {
    baselineLevels[baseInfo[i].level] = (baselineLevels[baseInfo[i].level] ?? 0) + 1;
    if (!baseInfo[i].missing) matchedIdx.push(i);
  }
  const nBaselineMissing = n - matchedIdx.length;
  const noBaseline = nBaselineMissing > 0;
  const dayKeys = devTrades.map(dayKey);

  // EXCESS is null (not 0) for unmatched trades. Only matched trades enter
  // excess statistics; the claim still fails closed on NO_BASELINE.
  const excesses = new Array(n).fill(null);
  for (const i of matchedIdx) excesses[i] = excessFor(devTrades[i].netR, baseInfo[i].mean, direction);
  const excessValues = matchedIdx.map((i) => excesses[i]);
  const excessDayKeys = matchedIdx.map((i) => dayKeys[i]);

  const absMean = n ? mean(signed) : 0;
  const excMean = excessValues.length ? mean(excessValues) : 0;

  // AMENDMENT 2: EVERY t/CI is CR1 clustered by calendar day.
  const excessInf = clusterSe(excessValues, excessDayKeys);
  const signedInf = clusterSe(signed, dayKeys);
  const excSe = excessInf.se;
  const tExc = excSe > 0 ? excMean / excSe : 0;
  const tNet = signedInf.se > 0 ? absMean / signedInf.se : 0;

  const eff = effectiveCounts(devTrades);

  const out = {
    n,
    nEffective: eff.nEffective,
    distinctEntryBars: eff.distinctBars,
    variantOverlapFraction: eff.overlapFraction,
    multiTradeBars: eff.multiTradeBars,
    designEffect: eff.designEffect,
    meanNetR: +absMean.toFixed(6), // ABSOLUTE net R, signed by claim direction
    excessVsRandomR: +excMean.toFixed(6), // control: excess over matched random
    meanCi95: ci95(absMean, signedInf.se), // day-clustered CI of NET MEAN
    excessCi95: ci95(excMean, excSe), // day-clustered CI of EXCESS
    sd: +stdev(signed).toFixed(6),
    t: +tExc.toFixed(4), // cluster-robust t of EXCESS (control gate)
    tNet: +tNet.toFixed(4), // cluster-robust t of NET MEAN (floor gate)
    rule: {
      netFloorR: cfg.practicalFloorR,
      excessFloorR: cfg.excessFloorR,
      tStatMin: cfg.tStatMin,
      netGate: `meanNetR > ${cfg.practicalFloorR} AND tNet > ${cfg.tStatMin}`,
      controlGate: `excessVsRandomR > ${cfg.excessFloorR} AND t > ${cfg.tStatMin}`,
      netGatePass: null,
      controlGatePass: null,
      amendedAt: "G0 Amendment 3 (2026-10-27), before results",
    },
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
      note: "Both t statistics use day-clustered CR1 SEs. Effective-N feeds POWER only; no double inflation.",
    },
    baseline: {
      mode: baseline ? "MATCHED_CONTROL" : UNCONTROLLED,
      required: cfg.requireMatchedBaseline,
      missing: nBaselineMissing,
      missingFraction: n ? +(nBaselineMissing / n).toFixed(4) : 0,
      matchLevels: baselineLevels,
      note: baseline
        ? "A trade with no fine AND no coarse cell yields NO_BASELINE -> INCONCLUSIVE. Never a zero fallback."
        : "UNCONTROLLED synthetic dry-run only. verifyReal() refuses this mode.",
    },
    medianNetR: n ? +median(signed).toFixed(6) : 0,
    totalR: +signed.reduce((a, b) => a + b, 0).toFixed(4),
    bySide: {},
    byFourState: {}, // four Map states as DIAGNOSTICS (they never decide verdicts)
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
  for (const side of ["long", "short"]) {
    const idx = devTrades
      .map((t, i) => ((t.side ?? "unknown") === side ? i : -1))
      .filter((i) => i >= 0);
    const v = idx.map((i) => signed[i]);
    if (!v.length) continue;
    const se = clusterSe(v, idx.map((i) => dayKeys[i])).se;
    const ev = idx.filter((i) => excesses[i] !== null).map((i) => excesses[i]);
    const ese = clusterSe(ev, idx.filter((i) => excesses[i] !== null).map((i) => dayKeys[i])).se;
    out.bySide[side] = {
      n: v.length,
      meanNetR: +mean(v).toFixed(6),
      ci95: ci95(mean(v), se),
      t: se > 0 ? +(mean(v) / se).toFixed(4) : 0,
      excessR: ev.length ? +mean(ev).toFixed(6) : null,
      excessCi95: ev.length ? ci95(mean(ev), ese) : null,
      winRate: +(v.filter((x) => x > 0).length / v.length).toFixed(4),
    };
  }

  // FOUR-STATE DIAGNOSTICS. Decided at Amendment 3: these are reported for
  // every claim but NEVER decide the verdict (the 2 verdict states do).
  for (const s of ["EXPANSION", "GRIND", "WHIPSAW", "QUIET", "UNKNOWN"]) {
    const idx = devTrades.map((t, i) => (t.state === s ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const v = idx.map((i) => signed[i]);
    const ev = idx.filter((i) => excesses[i] !== null).map((i) => excesses[i]);
    const se = clusterSe(v, idx.map((i) => dayKeys[i])).se;
    out.byFourState[s] = {
      verdictState: verdictStateOf(s),
      n: v.length,
      meanNetR: +mean(v).toFixed(6),
      ci95: ci95(mean(v), se),
      t: se > 0 ? +(mean(v) / se).toFixed(4) : 0,
      excessR: ev.length ? +mean(ev).toFixed(6) : null,
      diagnosticOnly: true,
    };
  }

  // Per-year breakdown, DEV only, using the EXCESS of MATCHED trades only.
  const byYear = new Map();
  for (const i of matchedIdx) {
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

  // With NO controlled trades there is nothing to judge year-consistency on;
  // record nulls rather than manufacturing a TOO_FEW_YEARS veto on top.
  if (excessValues.length >= 2) {
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
  }

  // Definition-sensitivity: GRADE, not veto (SENSITIVITY_RULE, decided at G0).
  out.stability =
    sensitivityAgreementPct >= SENSITIVITY_RULE.robustMinPct
      ? "ROBUST"
      : sensitivityAgreementPct >= SENSITIVITY_RULE.fragileMinPct
        ? "FRAGILE"
        : "DEFINITION_SENSITIVE";
  if (out.stability === "DEFINITION_SENSITIVE") out.conditional = true;

  // G0 AMENDMENT 3 TASK 2b — FAIL CLOSED. A supplied baseline with a missing
  // fine AND coarse cell for ANY trade => INCONCLUSIVE (NO_BASELINE). The
  // baseline is never allowed to fall back to zero.
  if (noBaseline) out.vetoes.push(`${NO_BASELINE}_${nBaselineMissing}_OF_${n}`);

  if (n < cfg.minTradesPerCell) out.vetoes.push(`MIN_TRADES_${n}`);

  // RESTORED RULE — a CONJUNCTION of two independent day-clustered tests.
  const netGatePass = absMean > cfg.practicalFloorR && tNet > cfg.tStatMin;
  const controlGatePass = excMean > cfg.excessFloorR && tExc > cfg.tStatMin;
  out.rule.netGatePass = netGatePass;
  out.rule.controlGatePass = controlGatePass;

  const netRefuted = absMean < -cfg.practicalFloorR && tNet < -cfg.tStatMin;
  const controlRefuted = excMean < cfg.excessFloorR && tExc < -cfg.tStatMin;

  if (noBaseline) {
    out.verdict = "INCONCLUSIVE"; // hard: NO_BASELINE cannot be rescued
  } else if (netGatePass && controlGatePass && out.vetoes.length === 0) {
    out.verdict = "CONFIRMED";
  } else if (netRefuted || controlRefuted) {
    out.verdict = "REFUTED";
  } else {
    if (!netGatePass) out.vetoes.push("NET_FLOOR_OR_T");
    if (!controlGatePass) out.vetoes.push("EXCESS_CONTROL_OR_T");
    out.verdict = "INCONCLUSIVE";
  }
  return out;
}

/** Group trades into (family|FOUR-STATE) cells — DIAGNOSTIC grouping. */
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

/**
 * AMENDMENT 3 — group trades into (family|VERDICT-STATE) cells. These are the
 * cells that DECIDE verdicts. A trade's four-state label maps through
 * verdictStateOf(); a trade may also carry an explicit `verdictState`.
 */
export function groupByFamilyVerdictState(trades, cards) {
  const out = new Map();
  for (const t of trades) {
    const { family } = cellKey(t, cards);
    const vs = t.verdictState ?? verdictStateOf(t.state);
    if (!vs) continue;
    const k = `${family}|${vs}`;
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

export function groupByStrategyVerdictState(trades) {
  const out = new Map();
  for (const t of trades) {
    const vs = t.verdictState ?? verdictStateOf(t.state);
    if (!vs) continue;
    const k = `${t.strategyId}|${vs}`;
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
