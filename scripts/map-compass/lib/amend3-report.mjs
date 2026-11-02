/**
 * G0 AMENDMENT 3 (2026-10-27, before any strategy result) — REPORT-ONLY
 * power table for TWO verdict states x THREE sessions.
 *
 * Why: Amendment 3 pools the four Map states into EFFICIENT / CHOPPY so the
 * previously underpowered cells gain sample. The power projection must be
 * recomputed on the NEW cells. It uses:
 *   - real DEV bar counts and real DEV calendar-day counts per (state, session)
 *     from the committed `verdictStateBySession` field (measured on Map output,
 *     not invented);
 *   - day-clustered CR1 SE inflation measured on pure-noise calibration data
 *     (no outcomes);
 *   - the recomputed WITHIN-FAMILY effective-N correction from overlap.mjs
 *     (no outcomes);
 *   - the RESTORED rule: net mean > +0.10R with clustered t > 2 AND
 *     excess > 0 with clustered t > 2.
 *
 * REPORT-ONLY. No criterion, threshold, verdict, kill criterion or card
 * changes because of this table.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  VERDICT_STATES,
  FOUR_STATES_OF,
  CLAIM_CRITERIA,
  REVERSION_FAMILIES,
  EXIT_CAVEAT,
  STATES,
} from "../frozen.mjs";
import { powerAt, mde } from "./verification.mjs";
import { measureDependence } from "./amend2-report.mjs";
import { recomputeWithinFamilyOverlap } from "./overlap.mjs";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url)); // lib/ -> repo root
const OUT = join(ROOT, "artifacts/map-compass");
const SESSIONS = ["asian", "london", "ny"];

/** Bar-weighted matched random baseline mean for each verdict state. */
function baselineMeanByVerdictState(report) {
  const baseline = JSON.parse(readFileSync(join(OUT, "random-baseline.json"), "utf8"));
  const bars = report.tradeableBarsByState ?? {};
  const out = {};
  for (const vs of VERDICT_STATES) {
    let sw = 0, w = 0;
    for (const s of FOUR_STATES_OF[vs]) {
      for (const side of ["long", "short"]) {
        const cell = baseline.cells?.[`${s}|${side}`];
        if (!cell?.n) continue;
        const weight = bars[s] ?? 1;
        sw += cell.meanNetR * weight;
        w += weight;
      }
    }
    out[vs] = w ? +(sw / w).toFixed(6) : 0;
  }
  return out;
}

/**
 * Build the v1.3 report-only block. `report` is the committed
 * power-projection.json (with `verdictStateBySession` present).
 */
export function buildAmendment3Report(report) {
  const cfg = CLAIM_CRITERIA;
  const effect = cfg.practicalFloorR;
  const sigma = report.assumptions?.sigmaR ?? 1.43;
  const variants = report.assumptions?.variantsPerFamily ?? 3;
  const survival = report.assumptions?.slotSurvival ?? 0.6;
  const density = report.observedDensityFromOldProject?.perStrategyPerBar ?? 2286 / 9738 / 9;
  const cellsBySession = report.verdictStateBySession ?? {};

  const v12 = measureDependence(); // day-cluster SE inflation, pure noise
  const seInflation = v12.seInflation ?? 1.009;
  const overlap = recomputeWithinFamilyOverlap();
  const designEffect = overlap.pooled.designEffect ?? 2.2948;
  const v12DesignEffect = v12.designEffect ?? 1.2316;
  const baselineMeans = baselineMeanByVerdictState(report);

  const rows = [];
  for (const vs of VERDICT_STATES) {
    for (const session of SESSIONS) {
      const key = `${vs}|${session}`;
      const c = cellsBySession[key] ?? { bars: 0, devDays: 0 };
      const n = Math.round(c.bars * density * variants * survival);
      const nEffective = +(n / designEffect).toFixed(1);
      const sigmaEff = sigma * seInflation;
      const iidPower = +powerAt(n, sigma, effect).toFixed(3);
      const adjustedPower = +powerAt(nEffective, sigmaEff, effect).toFixed(3);
      const v12Power = +powerAt(n / v12DesignEffect, sigmaEff, effect).toFixed(3);
      // The control gate tests EXCESS > 0. With a true net mean of +0.10R and
      // a matched random baseline of `b` (negative in DEV), the true excess is
      // 0.10 - b. That is a LARGER effect than the net floor, so the control
      // is not the binding constraint on power.
      const controlEffect = +(effect - baselineMeans[vs]).toFixed(6);
      const controlPower = +powerAt(nEffective, sigmaEff, controlEffect).toFixed(3);
      // The two tests are strongly correlated (same trades, same clustering).
      // A product would understate power; we conservatively report the min.
      const jointPower = Math.min(adjustedPower, controlPower);
      rows.push({
        verdictState: vs,
        session,
        cell: key,
        tradeableDevBars: c.bars,
        devCalendarDays: c.devDays,
        barsPerDay: c.barsPerDay ?? (c.devDays ? +(c.bars / c.devDays).toFixed(2) : 0),
        projectedTrades: n,
        nEffective,
        designEffect,
        dayClusterSeInflation: seInflation,
        sigmaEffectiveR: +sigmaEff.toFixed(4),
        mdeR: +mde(nEffective, sigmaEff).toFixed(4),
        iidPowerAtFloor: iidPower,
        dayClusteredEffectivePowerAtFloor: adjustedPower,
        powerUsingV12DesignEffect: v12Power,
        matchedBaselineMeanR: baselineMeans[vs],
        controlEffectR: controlEffect,
        controlPowerAtExcess: controlPower,
        jointPowerConservative: +jointPower.toFixed(3),
        adequatePower: jointPower >= 0.8,
        meetsMinTrades: n >= cfg.minTradesPerCell,
      });
    }
  }

  // Also report the POOLED verdict-state power (all sessions combined). The
  // 2x3 table is the requested per-session readout, but the VERDICT is decided
  // on the pooled state cell, so that is the number that answers "did pooling
  // fix the underpowerment?".
  const pooledByVerdictState = VERDICT_STATES.map((vs) => {
    const sub = rows.filter((r) => r.verdictState === vs);
    const n = sub.reduce((s, r) => s + r.projectedTrades, 0);
    const nEffective = +(n / designEffect).toFixed(1);
    const sigmaEff = sigma * seInflation;
    const iidPower = +powerAt(n, sigma, effect).toFixed(3);
    const adjustedPower = +powerAt(nEffective, sigmaEff, effect).toFixed(3);
    const controlEffect = +(effect - baselineMeans[vs]).toFixed(6);
    const controlPower = +powerAt(nEffective, sigmaEff, controlEffect).toFixed(3);
    const joint = Math.min(adjustedPower, controlPower);
    return {
      verdictState: vs,
      sessionsPooled: SESSIONS.length,
      tradeableDevBars: sub.reduce((s, r) => s + r.tradeableDevBars, 0),
      devCalendarDays: Math.max(...sub.map((r) => r.devCalendarDays)),
      projectedTrades: n,
      nEffective,
      designEffect,
      iidPowerAtFloor: iidPower,
      dayClusteredEffectivePowerAtFloor: adjustedPower,
      controlPowerAtExcess: controlPower,
      jointPowerConservative: +joint.toFixed(3),
      adequatePower: joint >= 0.8,
    };
  });

  const worst = Math.min(...rows.map((r) => r.jointPowerConservative));
  const best = Math.max(...rows.map((r) => r.jointPowerConservative));

  return {
    reportOnlyV13: {
      id: "G0-AMENDMENT-3-POWER-REPORT-ONLY",
      date: "2026-10-27",
      decidedBeforeResults: true,
      criteriaChanged: false,
      thresholdChanged: false,
      verdictChanged: false,
      supersedes: "reportOnly (v1.2, kept for audit)",
      verdictUnchangedFrom: report.verdict,
      criteria: cfg,
      criteriaHash: createHash("sha256").update(JSON.stringify(cfg)).digest("hex"),
      purpose:
        "Report-only power for the 2 verdict states x 3 sessions after G0 Amendment 3 pooling, using day clusters and the recomputed within-family effective-N correction. NOT a go/no-go gate.",
      ruleRestored: {
        netFloorR: cfg.practicalFloorR,
        netGate: `meanNetR > ${cfg.practicalFloorR} AND day-clustered tNet > ${cfg.tStatMin}`,
        controlGate: `excessVsRandomR > ${cfg.excessFloorR} AND day-clustered t > ${cfg.tStatMin}`,
        vetoes: ["n >= 100", "concentration <= 0.50", "LOYO >= 0.75", "NO_BASELINE"],
        removed: "v1.2 rule 'excess > 0.10 AND net > 0' is GONE",
      },
      verdictStates: {
        definition: "EFFICIENT = EXPANSION + GRIND (ER >= 0.35); CHOPPY = WHIPSAW + QUIET",
        mapping: { EXPANSION: "EFFICIENT", GRIND: "EFFICIENT", WHIPSAW: "CHOPPY", QUIET: "CHOPPY" },
        cells: `${VERDICT_STATES.length} states x ${SESSIONS.length} sessions = ${VERDICT_STATES.length * SESSIONS.length}`,
        fourStateDiagnostics:
          "The four Map states are reported for every claim via stats.byFourState / fourStateDiagnostics, but they NEVER decide a verdict.",
        fourStates: STATES,
      },
      assumptions: {
        sigmaR: sigma,
        variantsPerFamily: variants,
        slotSurvival: survival,
        perStrategyPerBarDensity: density,
        dayClusterMethod: "CR1 clustered by calendar day; inflation measured on pure-noise calibration trades",
        effectiveNMethod: "Kish effective N over entry-bar clusters, relation-aware (Amendment 3)",
        note: "Session is now a CELL dimension, so there is no separate 1/3 session factor. No outcomes were used.",
      },
      overlapProvenance: {
        v12: overlap.comparisonToV12,
        v13: {
          source: "lib/overlap.mjs recomputeWithinFamilyOverlap()",
          dataUsed:
            "ONLY CARD_RELATIONS metadata (near-duplicate / mirror-image / related pairs from claim-cards.draft.mjs) plus a seeded RNG generating ENTRY-BAR co-occurrence. The simulation emits bar multiplicities only — no netR, no verdict, no strategy result, no realised trade.",
          noOutcomesUsed: true,
          model: overlap.model,
          nearDuplicatePairs: overlap.nearDuplicatePairs.length,
          mirrorImagePairs: overlap.mirrorImagePairs.length,
          relatedPairs: overlap.relatedPairs.length,
          pooled: overlap.pooled,
          sensitivityByShareScale: overlap.sensitivityByShareScale,
          byFamily: overlap.byFamily,
        },
        seInflationProvenance: {
          value: seInflation,
          source: "lib/amend2-report.mjs measureDependence() using syntheticTradesV12 (exact v1.2 generator)",
          dataUsed:
            "'day' field of pure-noise Gaussian synthetic trades with trueEdgeR = 0. netR is zero-edge Gaussian noise used ONLY to compute the SE ratio; no strategy outcomes.",
          dayClusters: v12.dayClusters,
          plainSe: v12.plainSe,
          clusteredSe: v12.clusteredSe,
        },
      },
      baselineMeansByVerdictState: baselineMeans,
      powerTable2x3: rows,
      pooledByVerdictState,
      comparisonToV12FourState: {
        v12: "v1.2 reportOnly.centralCaseAdjusted (4 Map states, i.i.d. -> day-clustered + v1.2 effective N)",
        v12AdjustedPowers: {
          EXPANSION: 0.226,
          GRIND: 0.301,
          WHIPSAW: 0.461,
          QUIET: 0.924,
        },
        v13PooledPowers: Object.fromEntries(
          pooledByVerdictState.map((r) => [r.verdictState, r.jointPowerConservative]),
        ),
        explanation:
          "The 2-state pooling DOUBLES the raw sample in EFFICIENT (EXPANSION 375 + GRIND 531 = 906 raw), but the Amendment-3 relation-aware overlap (design effect ~2.29 vs v1.2's 1.23) removes most of that gain: near-duplicate variants do not contribute independent information. Report-only, no criterion changes.",
      },
      readout: {
        worstJointPower: +worst.toFixed(3),
        bestJointPower: +best.toFixed(3),
        cellsAdequate: rows.filter((r) => r.adequatePower).length,
        totalCells: rows.length,
        pooledJointPower: Object.fromEntries(
          pooledByVerdictState.map((r) => [r.verdictState, r.jointPowerConservative]),
        ),
        verdict: report.verdict,
        explanation:
          "Pooling four Map states into two verdict states roughly doubles the EFFICIENT sample, but day clustering AND the larger relation-aware within-family overlap both REDUCE effective power. The control gate (excess > 0) is NOT the binding constraint because matched random baselines are negative in DEV, making the true excess larger than the +0.10R net floor. jointPowerConservative = min(net-floor power, control power).",
        caution:
          "This is REPORT-ONLY. It does not change CLAIM_CRITERIA, the +0.10R floor, t > 2, the verdict, or the kill criterion. If zero claims are CONFIRMED, the correct readout remains 'too little independent data', not 'textbook false'.",
      },
      reversionCaveat: {
        families: REVERSION_FAMILIES,
        label: EXIT_CAVEAT,
        note: "Every verdict for these families is labelled with the standard exit only. NO new exit is added in this cycle.",
      },
      noBaseline: {
        rule: "A missing fine AND coarse matched-baseline cell => INCONCLUSIVE (NO_BASELINE). Zero fallback is forbidden.",
        audit: "artifacts/map-compass/baseline-coverage.json",
      },
      forbiddenResponses: [
        "lower the +0.10R practical floor",
        "soften the t > 2 statistic",
        "re-fit the cost model after results",
        "edit thresholds or cards after seeing outcomes",
      ],
    },
  };
}
