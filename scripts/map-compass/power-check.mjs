#!/usr/bin/env node
/**
 * M5 — FEASIBILITY PROJECTION (pre-M6 go/no-go).
 *
 * Before writing 24 strategies, answer: with the REAL Map state distribution
 * and REAL costs, can any claim clear the frozen criteria? This uses the
 * actual DEV bar counts by state/session from the M2 output and the observed
 * baseline cost, then projects trades per cell at plausible signal densities.
 *
 * This is NOT a strategy result. It is a power calculation on the instrument.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { dataLines } from "./lib/csv.mjs";
import {
  STATES,
  VERDICT_STATES,
  verdictStateOf,
  CLAIM_CRITERIA,
} from "./frozen.mjs";
import { mde, powerAt } from "./lib/verification.mjs";
import { buildAmendment2Report } from "./lib/amend2-report.mjs";
import { buildAmendment3Report } from "./lib/amend3-report.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const NORM = join(ROOT, "artifacts/map-compass/normalized");
const OUT = join(ROOT, "artifacts/map-compass");

const mapCsv = join(NORM, "xauusd-m30-map.csv");
if (!existsSync(mapCsv)) {
  console.error("run mc:map first");
  process.exit(2);
}

// Count DEV tradeable bars by state, by state|session, and by the TWO verdict
// states x 3 sessions (G0 Amendment 3), including the distinct DEV calendar
// days per cell so the day-cluster count is real, not assumed.
const byState = Object.fromEntries(STATES.map((s) => [s, 0]));
const byStateSession = {};
const verdictCells = {};
for (const vs of VERDICT_STATES)
  for (const ses of ["asian", "london", "ny"])
    verdictCells[`${vs}|${ses}`] = { bars: 0, days: new Set() };
let devBars = 0,
  flat = 0;
for (const f of dataLines(readFileSync(mapCsv, "utf8"), { delimiter: "," })) {
  if (f[0] === "datetime") continue;
  if (f[12] !== "DEV") continue;
  devBars++;
  const state = f[1],
    session = f[11];
  if (state === "UNKNOWN") {
    flat++;
    continue;
  }
  if (!(state in byState)) continue;
  byState[state]++;
  const k = `${state}|${session}`;
  byStateSession[k] = (byStateSession[k] ?? 0) + 1;
  const vs = verdictStateOf(state);
  const cell = verdictCells[`${vs}|${session}`];
  if (cell) {
    cell.bars++;
    cell.days.add(f[0].slice(0, 10));
  }
}
const verdictStateBySession = Object.fromEntries(
  Object.entries(verdictCells).map(([k, v]) => [
    k,
    {
      bars: v.bars,
      devDays: v.days.size,
      barsPerDay: v.days.size ? +(v.bars / v.days.size).toFixed(2) : 0,
    },
  ]),
);

const cost = JSON.parse(readFileSync(join(OUT, "cost-model.json"), "utf8"));
const baselineCostR = cost.baselineCostR;
const SIGMA = 1.43; // per-trade R sd under a 2R target / ~35% win rate
const VARIANTS = 3; // strategies per family
const SESSION_FACTOR = 1 / 3; // a session-restricted claim sees ~1/3 of bars

/**
 * Project n for one family-state cell at a given per-strategy signal density.
 * Signals are deduplicated by the one-slot book: overlapping signals are
 * dropped, so effective trades < raw signals. We use a conservative 0.6
 * survival factor (documented assumption, not a fitted value).
 */
function project(signalDensity, survival = 0.6) {
  const rows = [];
  for (const s of STATES) {
    const bars = byState[s];
    const signalsPerStrategy = bars * signalDensity;
    const pooledSignals = signalsPerStrategy * VARIANTS;
    const n = Math.round(pooledSignals * survival);
    const grossNeeded = CLAIM_CRITERIA.practicalFloorR + baselineCostR;
    rows.push({
      state: s,
      tradeableBars: bars,
      signalDensity,
      projectedTrades: n,
      mdeR: +mde(n, SIGMA).toFixed(4),
      powerAtFloor: +powerAt(n, SIGMA, CLAIM_CRITERIA.practicalFloorR).toFixed(3),
      grossEdgeNeededR: +grossNeeded.toFixed(4),
      meetsMinTrades: n >= CLAIM_CRITERIA.minTradesPerCell,
      adequatePower: powerAt(n, SIGMA, CLAIM_CRITERIA.practicalFloorR) >= 0.8,
    });
  }
  return rows;
}

// Ground the density range in the OLD project's observed signal rate:
// 2,286 resolved trades / 9,738 bars / 9 strategies = 0.0261 per strategy
// per bar. Use that as the central case rather than an invented number.
const OBSERVED_DENSITY = 2286 / 9738 / 9;
const densities = [0.005, 0.01, 0.02, OBSERVED_DENSITY, 0.04].sort((a, b) => a - b);
const scenarios = densities.map((d) => ({ signalDensity: +d.toFixed(5), cells: project(d) }));
const sessionRestricted = densities.map((d) => ({
  signalDensity: d,
  cells: project(d)
    .map((r) => ({
      ...r,
      projectedTrades: Math.round(r.tradeableBars * SESSION_FACTOR * d * VARIANTS * 0.6),
    }))
    .map((r) => ({
      ...r,
      mdeR: +mde(r.projectedTrades, SIGMA).toFixed(4),
      powerAtFloor: +powerAt(r.projectedTrades, SIGMA, CLAIM_CRITERIA.practicalFloorR).toFixed(3),
      adequatePower: powerAt(r.projectedTrades, SIGMA, CLAIM_CRITERIA.practicalFloorR) >= 0.8,
    })),
}));

const worst = scenarios[0].cells; // lowest density = worst case
const verdict = worst.every((r) => r.adequatePower)
  ? "ADEQUATE"
  : worst.some((r) => r.adequatePower)
    ? "MARGINAL"
    : "UNDERPOWERED";

const report = {
  generatedAt: new Date().toISOString(),
  purpose: "Pre-M6 go/no-go power projection. NOT a strategy result.",
  devBars,
  flatBars: flat,
  flatPct: +((flat / devBars) * 100).toFixed(2),
  tradeableBarsByState: byState,
  tradeableBarsByStateSession: byStateSession,
  verdictStateBySession, // 2 verdict states x 3 sessions, with real DEV day counts
  assumptions: {
    sigmaR: SIGMA,
    variantsPerFamily: VARIANTS,
    slotSurvival: 0.6,
    sessionFactor: SESSION_FACTOR,
  },
  observedDensityFromOldProject: {
    trades: 2286,
    bars: 9738,
    strategies: 9,
    perStrategyPerBar: +OBSERVED_DENSITY.toFixed(5),
  },
  centralCase: project(OBSERVED_DENSITY),
  criteria: CLAIM_CRITERIA,
  baselineCostR,
  grossEdgeNeededR: +(CLAIM_CRITERIA.practicalFloorR + baselineCostR).toFixed(4),
  scenarios,
  sessionRestricted,
  verdict,
  killCriterion:
    "BLUEPRINT §11: if the harness fails synthetic power calibration, the test battery is not measuring anything. If this projection says UNDERPOWERED at realistic densities, M6 needs a NEW cycle (larger DEV or lower sigma), not threshold tuning.",
};
// G0 AMENDMENT 2: append the clustered-SE / effective-N correction as a
// REPORT-ONLY block. It is computed from the fields above and from the
// calibration harness; it does not touch verdict, criteria, scenarios or the
// kill criterion, and no threshold changes because of it.
Object.assign(report, buildAmendment2Report(report));
// G0 AMENDMENT 3: the report-only 2 verdict states x 3 sessions power table,
// using day clusters + the recomputed within-family effective-N correction.
Object.assign(report, buildAmendment3Report(report));
writeFileSync(join(OUT, "power-projection.json"), JSON.stringify(report, null, 2) + "\n");

console.log(`DEV bars ${devBars}, flat ${report.flatPct}%, tradeable by state:`, byState);
console.log(
  `baseline cost ${baselineCostR}R -> gross edge needed ${report.grossEdgeNeededR}R for +${CLAIM_CRITERIA.practicalFloorR}R net`,
);
for (const s of scenarios) {
  console.log(
    `  density ${(s.signalDensity * 100).toFixed(1)}%: ` +
      s.cells.map((r) => `${r.state}=${r.projectedTrades}(p=${r.powerAtFloor})`).join(" "),
  );
}
console.log(`VERDICT at lowest density: ${verdict}`);
