/**
 * POST-DECISION evaluation for the trade-selection layer.
 *
 * Gemini never sees truth before deciding; truth joins ONLY here, after
 * decisions are recorded. Metrics compare:
 *  - gemini-selected: outcomes of the trades Gemini selected;
 *  - field-average:   mean outcome of every candidate presented per decision
 *    (what a coin-flip selector would have expected);
 *  - oracle:          the best candidate per decision (ex-post upper bound);
 *  - deterministic:   the full certified baseline for context.
 *
 * Convention (consistent with the round-4 research evaluation): trades with
 * an undefined rMultiple (eventual OPEN/NO_FILL) contribute 0 to total R and
 * are excluded from win-rate denominators.
 */

import type { SelectionRecord } from "./selector";
import type { TruthTradeLike } from "./candidates";
import { tradeKeyOf } from "./candidates";

export interface Metrics {
  n: number;
  tp: number;
  sl: number;
  unresolved: number;
  winRate: number;
  avgR: number;
  expectancy: number;
  profitFactor: number;
  totalR: number;
  maxDrawdownR: number;
}

export interface TruthTradeFull extends TruthTradeLike {
  rMultiple?: number | undefined;
}

interface Accum {
  n: number;
  tp: number;
  sl: number;
  unresolved: number;
  totalR: number;
  winR: number;
  lossR: number;
  equity: number;
  peak: number;
  maxDD: number;
}

function createAccum(): Accum {
  return {
    n: 0,
    tp: 0,
    sl: 0,
    unresolved: 0,
    totalR: 0,
    winR: 0,
    lossR: 0,
    equity: 0,
    peak: 0,
    maxDD: 0,
  };
}

function addTrade(acc: Accum, outcome: string | undefined, r: number | undefined): void {
  acc.n++;
  if (outcome === "TP") acc.tp++;
  else if (outcome === "SL") acc.sl++;
  else acc.unresolved++;
  const rr = r ?? 0;
  acc.totalR += rr;
  if (rr > 0) acc.winR += rr;
  if (rr < 0) acc.lossR += Math.abs(rr);
  acc.equity += rr;
  if (acc.equity > acc.peak) acc.peak = acc.equity;
  const dd = acc.peak - acc.equity;
  if (dd > acc.maxDD) acc.maxDD = dd;
}

function addR(acc: Accum, r: number): void {
  acc.n++;
  acc.totalR += r;
  if (r > 0) {
    acc.tp++;
    acc.winR += r;
  } else if (r < 0) {
    acc.sl++;
    acc.lossR += -r;
  } else acc.unresolved++;
  acc.equity += r;
  if (acc.equity > acc.peak) acc.peak = acc.equity;
  const dd = acc.peak - acc.equity;
  if (dd > acc.maxDD) acc.maxDD = dd;
}

export function toMetrics(acc: Accum): Metrics {
  const resolved = acc.tp + acc.sl;
  return {
    n: acc.n,
    tp: acc.tp,
    sl: acc.sl,
    unresolved: acc.unresolved,
    winRate: resolved > 0 ? acc.tp / resolved : 0,
    avgR: resolved > 0 ? acc.totalR / resolved : 0,
    expectancy: resolved > 0 ? acc.totalR / resolved : 0,
    profitFactor: acc.lossR > 0 ? acc.winR / acc.lossR : 0,
    totalR: acc.totalR,
    maxDrawdownR: acc.maxDD,
  };
}

export interface SelectionCoverage {
  total: number;
  decided: number;
  invalidSet: number;
  apiErrors: number;
  invalidOutputs: number;
  leakViolations: number;
}

export interface SelectionEvaluation {
  coverage: SelectionCoverage;
  /** Per-decision metrics of Gemini's picks (one R per decision). */
  selected: Metrics;
  /** Per-decision mean R of ALL presented candidates (random-pick expectation). */
  fieldAverage: Metrics;
  /** Per-decision best presented R (ex-post ceiling). */
  oracle: Metrics;
  /** Unique trades Gemini ever selected (deduped across windows). */
  uniqueSelected: Metrics;
  /** Outcomes of candidates Gemini rejected (all presented-and-not-selected, deduped). */
  rejected: Metrics;
  /** Full deterministic baseline (every truth trade). */
  deterministicBaseline: Metrics;
  selectionRate: number; // decisions with any presented set that produced a selection
  perStrategy: Array<{ strategyId: string; selectedN: number; selectedTotalR: number }>;
}

export function evaluateSelections(
  records: SelectionRecord[],
  truth: TruthTradeFull[],
): SelectionEvaluation {
  const byKey = new Map(truth.map((t) => [tradeKeyOf(t), t]));
  const coverage: SelectionCoverage = {
    total: records.length,
    decided: 0,
    invalidSet: 0,
    apiErrors: 0,
    invalidOutputs: 0,
    leakViolations: 0,
  };
  const selectedA = createAccum();
  const fieldA = createAccum();
  const oracleA = createAccum();
  const uniqueSelectedA = createAccum();
  const rejectedA = createAccum();
  const baselineA = createAccum();
  const perStrategy = new Map<string, { n: number; totalR: number }>();
  const seenSelected = new Set<string>();
  const seenRejected = new Set<string>();
  let presentedDecisions = 0;

  for (const t of truth) addTrade(baselineA, t.outcome, t.rMultiple ?? undefined);

  for (const rec of records) {
    switch (rec.status) {
      case "decided":
        coverage.decided++;
        break;
      case "invalid-set":
        coverage.invalidSet++;
        break;
      case "api-error":
        coverage.apiErrors++;
        break;
      case "invalid-output":
        coverage.invalidOutputs++;
        break;
      case "leak-violation":
        coverage.leakViolations++;
        break;
    }
    if (rec.candidatesPresented.length === 0) continue;
    presentedDecisions++;
    // r of each presented candidate (undefined r -> 0 for set-level math)
    const presented = rec.candidatesPresented.map((c) => {
      const t = byKey.get(c.key);
      return { c, t, r: t?.rMultiple ?? 0, resolved: t?.outcome === "TP" || t?.outcome === "SL" };
    });
    // field average: one row per decision with the mean presented R
    const resolvedRs = presented.filter((p) => p.resolved).map((p) => p.r);
    if (resolvedRs.length > 0)
      addR(fieldA, resolvedRs.reduce((a, b) => a + b, 0) / resolvedRs.length);
    else addR(fieldA, 0);
    addR(oracleA, Math.max(...presented.map((p) => p.r)));
    if (rec.status !== "decided") continue;
    const chosen = presented.find((p) => p.c.candidateId === rec.selectedCandidateId);
    if (!chosen) continue; // can't happen: validation guarantees membership
    addTrade(selectedA, chosen.t?.outcome, chosen.t?.rMultiple ?? undefined);
    if (!seenSelected.has(chosen.c.key)) {
      seenSelected.add(chosen.c.key);
      addTrade(uniqueSelectedA, chosen.t?.outcome, chosen.t?.rMultiple ?? undefined);
      const s = perStrategy.get(chosen.c.strategyId) ?? { n: 0, totalR: 0 };
      s.n++;
      s.totalR += chosen.t?.rMultiple ?? 0;
      perStrategy.set(chosen.c.strategyId, s);
    }
    for (const p of presented) {
      if (p.c.candidateId === rec.selectedCandidateId) continue;
      if (seenRejected.has(p.c.key)) continue;
      seenRejected.add(p.c.key);
      addTrade(rejectedA, p.t?.outcome, p.t?.rMultiple ?? undefined);
    }
  }

  return {
    coverage,
    selected: toMetrics(selectedA),
    fieldAverage: toMetrics(fieldA),
    oracle: toMetrics(oracleA),
    uniqueSelected: toMetrics(uniqueSelectedA),
    rejected: toMetrics(rejectedA),
    deterministicBaseline: toMetrics(baselineA),
    selectionRate: presentedDecisions > 0 ? coverage.decided / presentedDecisions : 0,
    perStrategy: [...perStrategy.entries()]
      .map(([strategyId, v]) => ({ strategyId, selectedN: v.n, selectedTotalR: v.totalR }))
      .sort((a, b) => b.selectedTotalR - a.selectedTotalR),
  };
}
