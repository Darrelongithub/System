/**
 * G0 AMENDMENT 2 (2026-10-27, before any real claim result) — REPORT-ONLY
 * correction to the power projection.
 *
 * Two things are wrong with an i.i.d. power number:
 *   1. Trades fired on the SAME calendar day share volatility/news shocks, so
 *      the SE must be clustered by day (CR1). This inflates the SE.
 *   2. The three variants of a family can fire on the SAME entry bar. Those
 *      trades are not independent, so the raw trade count overstates n. We
 *      use Kish effective N over entry-bar clusters.
 *
 * The overlap cannot be measured yet because the 24 strategies are still DRAFT
 * and MUST NOT be run. We therefore estimate it from the calibration harness
 * (which models family variants drawing from a shared entry-bar pool) and show
 * a sensitivity range 0 → 0.75. Everything here is REPORT-ONLY: no criterion,
 * threshold, verdict or kill criterion changes.
 */
import { createHash } from "node:crypto";
import { CLAIM_CRITERIA, SENSITIVITY_RULE, EXIT_HARNESS } from "../frozen.mjs";
import { effectiveCounts, clusterSe, dayKey } from "./cluster.mjs";
import { syntheticTrades } from "../verify-claims.mjs";
import { powerAt, mde } from "./verification.mjs";

const SIGMA = 1.43;

/** Measure overlap + day-cluster SE inflation on a pure-noise calibration run. */
export function measureDependence({ seed = 7, perCell = 900 } = {}) {
  const trades = syntheticTrades({ seed, perCell, trueEdgeR: 0, sd: SIGMA });
  const eff = effectiveCounts(trades);
  const values = trades.map((t) => t.netR);
  const inf = clusterSe(values, trades.map(dayKey));
  return {
    n: eff.n,
    distinctEntryBars: eff.distinctBars,
    nEffective: eff.nEffective,
    overlapFraction: eff.overlapFraction,
    multiTradeBars: eff.multiTradeBars,
    designEffect: eff.designEffect,
    dayClusters: inf.clusters,
    plainSe: +inf.plainSe.toFixed(6),
    clusteredSe: +inf.se.toFixed(6),
    seInflation: inf.inflation,
  };
}

/** Power using an effective N and an SE-inflated sigma. */
function adjustedPower(nRaw, designEffect, seInflation, effect, sigma = SIGMA) {
  const nEff = nRaw / designEffect;
  const sigmaEff = sigma * seInflation;
  return {
    nRaw,
    nEffective: +nEff.toFixed(1),
    designEffect: +designEffect.toFixed(4),
    seInflation: +seInflation.toFixed(4),
    sigmaEffectiveR: +sigmaEff.toFixed(4),
    mdeR: +mde(nEff, sigmaEff).toFixed(4),
    powerAtFloor: +powerAt(nEff, sigmaEff, effect).toFixed(3),
    adequatePower: powerAt(nEff, sigmaEff, effect) >= 0.8,
  };
}

/**
 * Build the report-only block. `report` is the existing power-projection.json.
 * Nothing outside this returned object is written back to the top level.
 */
export function buildAmendment2Report(report) {
  const dep = measureDependence();
  const effect = CLAIM_CRITERIA.practicalFloorR;
  const central = report.centralCase ?? [];
  const overlapCases = [0, 0.25, 0.5, 0.75];

  // Kish design effect from an overlap fraction f with 3 variants per family:
  // a fraction f of trades sit on bars shared by (on average) 2 variants, so
  // n_eff = n / (1 + f). f=0 -> independent; f=0.75 -> n_eff = n/1.75.
  const deFromOverlap = (f) => 1 + f;

  const centralAdjusted = central.map((c) => ({
    state: c.state,
    projectedTrades: c.projectedTrades,
    iidPowerAtFloor: c.powerAtFloor,
    measuredOverlap: adjustedPower(c.projectedTrades, dep.designEffect, dep.seInflation, effect),
    sensitivityByOverlap: overlapCases.map((f) => ({
      overlapFraction: f,
      ...adjustedPower(c.projectedTrades, deFromOverlap(f), dep.seInflation, effect),
    })),
  }));

  return {
    reportOnly: {
      id: "G0-AMENDMENT-2-POWER-REPORT-ONLY",
      date: "2026-10-27",
      decidedBeforeResults: true,
      criteriaChanged: false,
      thresholdChanged: false,
      verdictChanged: false,
      verdictUnchangedFrom: report.verdict,
      criteria: CLAIM_CRITERIA,
      criteriaHash: createHash("sha256").update(JSON.stringify(CLAIM_CRITERIA)).digest("hex"),
      purpose:
        "Show how clustered-by-day SEs and overlapping family-variant entry bars reduce effective power. This is a readout, NOT a new go/no-go gate and NOT a licence to relax criteria.",
      inference: {
        tAndCiMethod: "CR1 cluster-robust SE clustered by calendar day",
        implementedIn: "scripts/map-compass/lib/cluster.mjs + lib/verification.mjs",
        appliesTo: ["aggregate t", "95% CIs", "by-side CIs", "per-year CIs"],
        effectiveNMethod: "Kish effective N over entry-bar clusters, per family cell",
        note: "The t/CI already absorb within-day correlation, so the effective-N correction is applied to POWER only — no double inflation of the SE.",
      },
      measuredDependence: dep,
      overlapSensitivity: {
        overlapFractions: overlapCases,
        designEffectFormula: "n_effective = n / (1 + overlapFraction)",
        source: "Pre-registered sensitivity range. Real overlap CANNOT be measured until claim cards are frozen; no strategy has been run.",
      },
      centralCaseAdjusted: centralAdjusted,
      readout:
        "EXPANSION/GRIND were already underpowered under i.i.d. assumptions. Clustering by day and overlapping variants make them WORSE, not better. If M6 returns zero CONFIRMED claims, the correct readout is 'too little independent data', not 'textbook false'.",
      permittedResponses: [
        "accept fewer surviving families",
        "start a NEW cycle with a different DEV/HOLDOUT allocation",
        "pre-register more pooling across variants BEFORE any result",
      ],
      forbiddenResponses: [
        "lower the +0.10R practical floor",
        "soften the t > 2 statistic",
        "re-fit the cost model after results",
        "unfreeze or edit thresholds after seeing outcomes",
      ],
      conditional: {
        userDefault: "no",
        compassCanEnableConditional: SENSITIVITY_RULE.compassCanEnableConditional,
        conditionalRequiresValSupport: SENSITIVITY_RULE.conditionalRequiresValSupport,
        conditionalReportAt: SENSITIVITY_RULE.conditionalReportAt,
        valSupportCriterion: SENSITIVITY_RULE.valSupportCriterion,
      },
      timeExit: {
        maxHoldBars: EXIT_HARNESS.maxHoldBars,
        label: EXIT_HARNESS.timeExitLabel,
        frozenIn: "EXIT_HARNESS (G0 Amendment 2)",
        baselineShare: 0.0124375,
        baselineCount: 398,
        baselineResolvedTotal: 32000,
        note: "Same cap now applies to real claim evaluation by default in lib/trade.mjs.",
      },
    },
  };
}
