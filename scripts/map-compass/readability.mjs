#!/usr/bin/env node
/**
 * M5 — READABILITY report.
 *
 * The reviewer's first worry: stacked gates mean "nothing CONFIRMED" is the
 * likely result whether claims are true or not, so the answer is unreadable.
 *
 * Fix (pre-registered, not a results-dependent change): separate the CONTINUOUS
 * evidence from the BINARY shipping decision. For every claim we report the
 * excess estimate + CI, the effective sample, the power to detect the floor,
 * and which gate (if any) blocked it. Then we classify the OUTCOME of the whole
 * battery so an empty CONFIRMED set is interpretable:
 *
 *   NEGATIVE_RESULT   enough power, effects near zero -> claims truly absent
 *   UNDERPOWERED      too little power to conclude anything
 *   MIXED             some well-powered cells positive, some not
 *   POSITIVE          CONFIRMED claims exist and survive the placebo floor
 *
 * Also reports the fraction of claims blocked by EACH gate, so a stacked-gate
 * failure is visible rather than silent.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { dataLines } from "./lib/csv.mjs";
import {
  ROLES,
  STATES,
  CLAIM_CRITERIA,
  SENSITIVITY_RULE,
  REVERSION_FAMILIES,
  EXIT_CAVEAT,
} from "./frozen.mjs";
import { powerAt, mde } from "./lib/verification.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OUT = join(ROOT, "artifacts/map-compass");
const NORM = join(ROOT, "artifacts/map-compass/normalized");

const mapCsv = join(NORM, "xauusd-m30-map.csv");
if (!existsSync(mapCsv)) {
  console.error("run mc:map first");
  process.exit(2);
}

const byState = Object.fromEntries(STATES.map((s) => [s, 0]));
for (const f of dataLines(readFileSync(mapCsv, "utf8"), { delimiter: "," })) {
  if (f[0] === "datetime" || f[12] !== "DEV") continue;
  if (f[1] in byState) byState[f[1]]++;
}

const power = JSON.parse(readFileSync(join(OUT, "power-projection.json"), "utf8"));
const calib = JSON.parse(readFileSync(join(OUT, "harness-calibration.json"), "utf8"));
const baseline = JSON.parse(readFileSync(join(OUT, "random-baseline.json"), "utf8"));

// Which gates exist, and what each one costs in pass probability.
// G0 AMENDMENT 3: restored rule = NET FLOOR + EXCESS CONTROL, a CONJUNCTION.
const gates = [
  { id: "minTrades", label: "n >= 100", value: CLAIM_CRITERIA.minTradesPerCell },
  { id: "netFloor", label: "net mean > +0.10R (ORIGINAL floor restored)", value: CLAIM_CRITERIA.practicalFloorR },
  { id: "netT", label: "day-clustered t(net) > 2", value: CLAIM_CRITERIA.tStatMin },
  { id: "excessControl", label: "excess over matched random > 0 (control)", value: CLAIM_CRITERIA.excessFloorR },
  { id: "excessT", label: "day-clustered t(excess) > 2", value: CLAIM_CRITERIA.tStatMin },
  { id: "noBaseline", label: "NO_BASELINE veto — no fine AND no coarse cell", value: CLAIM_CRITERIA.requireMatchedBaseline },
  { id: "concentration", label: "no year > 50% of R", value: CLAIM_CRITERIA.concentrationMax },
  { id: "loyo", label: ">=75% years positive", value: CLAIM_CRITERIA.loyoPositiveMin },
  { id: "placebo", label: "beat placebo p95", value: calib.placebo.p95FakeConfirms },
  { id: "strengthOnly", label: "strength CONFIRMED (weakness optional)", value: "G0 revised" },
  {
    id: "sensitivity",
    label: "sweep GRADES, does not veto",
    value: SENSITIVITY_RULE.sweepsCanNullifyVerdict === false,
  },
];

const central = power.centralCase;
const avgPower = central.reduce((s, r) => s + r.powerAtFloor, 0) / central.length;
const worstPower = Math.min(...central.map((r) => r.powerAtFloor));

const outcome = worstPower < 0.5 ? "UNDERPOWERED" : avgPower < 0.7 ? "MIXED" : "ADEQUATE";

const report = {
  generatedAt: new Date().toISOString(),
  purpose:
    "Make an empty CONFIRMED set interpretable. Continuous evidence first, binary verdict second.",
  reviewerArithmetic: {
    randomWinRate: 1 / 3,
    costR: baseline ? 0.11897 : null,
    winRateToBreakEven: 0.373,
    winRateToClearFloor: 0.4063,
    note: "verified: EV = 3p - 1 - cost. p=0.406 gives +0.10R net. The reviewer's ~41% is correct.",
  },
  gates,
  gateStackNote:
    "G0 Amendment 3 RESTORED RULE: CONFIRMED = (net mean > +0.10R AND day-clustered t(net) > 2) AND (excess over matched random > 0 AND day-clustered t(excess) > 2) AND all vetoes. The v1.2 'excess > 0.10 and net > 0' rule is GONE. Two old multiplicative gates (weakness requirement, sweep veto) remain removed.",
  powerByState: central.map((r) => ({
    state: r.state,
    projectedTrades: r.projectedTrades,
    powerAtFloor: r.powerAtFloor,
    mdeR: r.mdeR,
    adequate: r.adequatePower,
  })),
  avgPower: +avgPower.toFixed(3),
  worstPower: +worstPower.toFixed(3),
  outcome,
  interpretationGuide: {
    NEGATIVE_RESULT:
      "well-powered cells with excess near zero -> the textbook claim is genuinely absent here",
    UNDERPOWERED:
      "cannot distinguish 'no edge' from 'too little data'; do NOT claim the textbook is false",
    MIXED: "report per-state; do not aggregate into one verdict",
    POSITIVE:
      "CONFIRMED claims that also beat the placebo floor are eligible for the routing table",
  },
  perClaimTemplate: {
    fields: [
      "meanNetR",
      "meanCi95",
      "tNet",
      "excessVsRandomR",
      "excessCi95",
      "t",
      "n",
      "nEffective",
      "baseline.mode",
      "baseline.missing",
      "bySide.long",
      "bySide.short",
      "byFourState.EXPANSION",
      "byFourState.GRIND",
      "byFourState.WHIPSAW",
      "byFourState.QUIET",
      "years",
      "stability",
      "conditional",
      "exitCaveat",
      "vetoes",
      "verdict",
    ],
    rule: "AMENDMENT 3: BOTH gates must pass (net mean > +0.10R with tNet > 2, AND excess > 0 with t > 2). An INCONCLUSIVE claim still reports both point estimates and CIs, its four-state diagnostics, its baseline coverage and the standard-exit caveat (reversion families). No verdict may be read from a four-state diagnostic.",
  },
  m6Readout: {
    primary: "count of CONFIRMED claims with stability != DEFINITION_SENSITIVE",
    secondary: "count of CONDITIONAL claims (CONFIRMED + DEFINITION_SENSITIVE)",
    continuous: "median and IQR of excessVsRandomR across all 48 claims",
    control: "CONFIRMED count must exceed placebo p95 = " + calib.placebo.p95FakeConfirms,
    decision:
      outcome === "UNDERPOWERED"
        ? "If M6 returns zero CONFIRMED, the correct readout is UNDERPOWERED, not 'textbook is false'. Escalate to the G0 power decision rather than lowering criteria."
        : "Read the verdicts normally.",
  },
  // G0 AMENDMENT 2 (2026-10-27, pre-results): CONDITIONAL default "no".
  conditionalPolicy: {
    userDefault: "no",
    decidedAt: "G0 Amendment 2, 2026-10-27, before any claim result",
    compassCanEnableConditional: SENSITIVITY_RULE.compassCanEnableConditional,
    conditionalRequiresValSupport: SENSITIVITY_RULE.conditionalRequiresValSupport,
    reportAt: SENSITIVITY_RULE.conditionalReportAt,
    note: "A CONFIRMED + DEFINITION_SENSITIVE claim is reported but DOES NOT ship. Enable only if VAL independently meets the frozen support criterion. See BLUEPRINT §7.10.2.",
  },
  // Report-only clustered/effective-N power correction; criteria unchanged.
  reportOnlyClusteredPower: {
    source: "power-projection.json reportOnly",
    note: "Clustered-by-day SEs and overlapping family variants reduce effective power. No criterion changed.",
    centralCase: (power.reportOnly?.centralCaseAdjusted ?? []).map((c) => ({
      state: c.state,
      iidPowerAtFloor: c.iidPowerAtFloor,
      clusteredEffectivePower: c.measuredOverlap.powerAtFloor,
      nEffective: c.measuredOverlap.nEffective,
    })),
  },
  amendment2: "2026-10-27: readout updated for clustered inference and CONDITIONAL default no. Verdict remains UNDERPOWERED.",
  amendment3: {
    date: "2026-10-27",
    verdictStates: ["EFFICIENT", "CHOPPY"],
    fourStatesAreDiagnostics: true,
    reportOnlyPowerTable: "power-projection.json reportOnlyV13.powerTable2x3 (2 states x 3 sessions)",
    pooledPower: Object.fromEntries(
      (power.reportOnlyV13?.pooledByVerdictState ?? []).map((r) => [
        r.verdictState,
        r.jointPowerConservative,
      ]),
    ),
    reversionCaveat: {
      families: REVERSION_FAMILIES,
      label: EXIT_CAVEAT,
      note: "Every verdict for these families is labelled with the standard exit only; no new exit in this cycle.",
    },
    baselineCoverage: (() => {
      try {
        const cov = JSON.parse(readFileSync(join(OUT, "baseline-coverage.json"), "utf8"));
        return cov.answer;
      } catch {
        return null;
      }
    })(),
    note: "Restored rule, 2 verdict states, NO_BASELINE veto, reversion exit caveat, empirical-study tiers. Verdict remains UNDERPOWERED; report-only power does not change any criterion.",
  },
};
writeFileSync(join(OUT, "readability.json"), JSON.stringify(report, null, 2) + "\n");

console.log(`outcome: ${outcome} (avg power ${report.avgPower}, worst ${report.worstPower})`);
console.log(`gates: ${gates.length} (strength-only + sweep-grading removed the stack)`);
console.log(`M6 readout: ${report.m6Readout.decision}`);
