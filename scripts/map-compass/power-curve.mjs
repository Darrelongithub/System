#!/usr/bin/env node
/**
 * G0 AMENDMENT 4 TASK 5 — POWER CURVE, REPORT-ONLY.
 *
 * For every 2-verdict-state x 3-session cell and for the pooled verdict states,
 * compute the probability that a claim cell would satisfy the FULL CONFIRMED
 * conjunction, for true net edges of 0.05R, 0.10R, 0.20R and 0.30R.
 *
 * DEFINITION (frozen rule, Amendment 3):
 *   CONFIRMED iff
 *     (A) meanNetR > +0.10R                AND day-clustered tNet   > 2
 *     (B) excessVsRandomR > 0              AND day-clustered t      > 2
 *     AND all vetoes clear: n >= 100, concentration <= 0.50,
 *                              LOYO >= 0.75, NO_BASELINE.
 *   where meanNetR is the absolute net R mean (signed by claim direction) and
 *   excessVsRandomR is the mean excess over the matched random-entry baseline.
 *
 * HOW IT IS EVALUATED (Monte Carlo, deterministic seeds):
 *   - trade COUNT is the MEASURED DEV signal count for that cell, AFTER the
 *     one-slot book (task 4) — i.e. the number of trades the book would actually
 *     take;
 *   - calendar-day structure is the MEASURED DEV day counts for that cell;
 *   - year spread is the MEASURED DEV bar counts per year for that verdict
 *     state (so the concentration and LOYO vetoes are exercised realistically);
 *   - per-trade SD and the day-level correlation are drawn from the RANDOM
 *     BASELINE's own measured netR values for that verdict state;
 *   - the matched baseline mean b is the MEASURED verdict-state baseline mean,
 *     so the true excess is edge - b;
 *   - each simulated trade set is run through the REAL verifyClaim() with a
 *     controlled baseline, and the CONFIRMED rate is counted.
 *
 * REPORT-ONLY. No criterion, threshold, verdict or kill criterion changes.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { mulberry32 } from "./lib/placebo.mjs";
import { verifyClaim } from "./lib/verification.mjs";
import {
  VERDICT_STATES,
  VERDICT_STATE_OF,
  FOUR_STATES_OF,
  STATES,
  ROLES,
  CLAIM_CRITERIA,
} from "./frozen.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const NORM = join(ROOT, "artifacts/map-compass/normalized");
const OUT = join(ROOT, "artifacts/map-compass");

const BASELINE = JSON.parse(readFileSync(join(OUT, "random-baseline.json"), "utf8"));
const SLOT = JSON.parse(readFileSync(join(OUT, "slot-model.json"), "utf8"));
const OVERLAP = JSON.parse(readFileSync(join(OUT, "measured-overlap.json"), "utf8"));

const SESSIONS = ["asian", "london", "ny"];
const EDGES = [0.05, 0.10, 0.20, 0.30];
const RUNS = 400;
const SIGMA_BASE = 1.43; // frozen assumption, used only if a cell has no measured SD

// ---- measured DEV structure from the Map --------------------------------
const mapLines = readFileSync(join(NORM, "xauusd-m30-map.csv"), "utf8")
  .split("\n")
  .filter((l) => l && !l.startsWith("datetime"));
const devDays = {}; // `${vs}|${session}` -> Set of day strings
const devYearBars = {}; // `${vs}` -> Map(year -> bars)
for (const line of mapLines) {
  const f = line.split(",");
  if (f[12] !== "DEV") continue;
  const state = f[1];
  const vs = VERDICT_STATE_OF[state];
  if (!vs) continue;
  const session = f[11];
  const day = f[0].slice(0, 10);
  const k = `${vs}|${session}`;
  if (!devDays[k]) devDays[k] = new Set();
  devDays[k].add(day);
  if (!devYearBars[vs]) devYearBars[vs] = new Map();
  devYearBars[vs].set(Number(f[0].slice(0, 4)), (devYearBars[vs].get(Number(f[0].slice(0, 4))) ?? 0) + 1);
}

/** Measured verdict-state baseline mean and SD, weighted by DEV bar counts. */
function verdictStateBaselineStats() {
  const out = {};
  for (const vs of VERDICT_STATES) {
    let sw = 0, w = 0, ssw = 0;
    for (const state of FOUR_STATES_OF[vs]) {
      const barCount = [...devYearBars[vs].values()].reduce((a, b) => a + b, 0) / FOUR_STATES_OF[vs].length;
      for (const side of ["long", "short"]) {
        const cell = BASELINE.cells?.[`${state}|${side}`];
        if (!cell?.n) continue;
        const weight = barCount;
        sw += cell.meanNetR * weight;
        ssw += (cell.sd ** 2 + cell.meanNetR ** 2) * weight;
        w += weight;
      }
    }
    const mean = w ? sw / w : 0;
    const variance = w ? ssw / w - mean * mean : 0;
    out[vs] = {
      mean: +mean.toFixed(6),
      sd: Math.max(Math.sqrt(Math.max(variance, 0)), SIGMA_BASE * 0.5),
      n: w,
    };
  }
  return out;
}
const bStats = verdictStateBaselineStats();

// ---- cells ----------------------------------------------------------------
const cells = [];
for (const vs of VERDICT_STATES) {
  for (const session of SESSIONS) {
    const days = devDays[`${vs}|${session}`] ? [...devDays[`${vs}|${session}`]] : [];
    const fam = SLOT.perFamily.find((f) => f.strengthState === vs || f.weaknessState === vs);
    // measured kept trades for this verdict state: half the family pool is
    // in this state, and the three sessions share it.
    const familyKept = SLOT.perFamily
      .filter((f) => f.strengthState === vs || f.weaknessState === vs)
      .reduce((s, f) => s + (f.strengthState === vs ? f.keptStrength : f.keptWeakness), 0);
    const n = Math.round(familyKept / SESSIONS.length);
    cells.push({
      verdictState: vs,
      session,
      cell: `${vs}|${session}`,
      measuredDevDays: days.length,
      measuredTradesAfterSlot: n,
      baselineMeanR: bStats[vs].mean,
      measuredSdR: +bStats[vs].sd.toFixed(4),
      tradeCountNote:
        "the family's slot-model kept trades in this verdict state divided evenly across the three sessions (a documented approximation; per-session signal splits are not yet measured)",
    });
  }
}
for (const vs of VERDICT_STATES) {
  const fam = SLOT.perFamily;
  const n = fam
    .filter((f) => f.strengthState === vs || f.weaknessState === vs)
    .reduce((s, f) => s + (f.strengthState === vs ? f.keptStrength : f.keptWeakness), 0);
  cells.push({
    verdictState: vs,
    session: "POOLED",
    cell: `${vs}|POOLED`,
    measuredDevDays: SESSIONS.reduce(
      (a, ses) => a + (devDays[`${vs}|${ses}`]?.size ?? 0),
      0,
    ),
    measuredTradesAfterSlot: n,
    baselineMeanR: bStats[vs].mean,
    measuredSdR: +bStats[vs].sd.toFixed(4),
  });
}

/** DEV year weights for a verdict state (measured bar counts). */
function yearWeights(vs) {
  const m = devYearBars[vs];
  if (!m) return ROLES.DEV.map((y) => 1);
  return ROLES.DEV.map((y) => m.get(y) ?? 0);
}

/** Gaussian sampler with day-level correlation (CR1-realistic). */
function makeSimulator(sigma, dayShockSd, rng) {
  return (days, n) => {
    const shock = new Map();
    for (const d of days) shock.set(d, (rng() + rng() + rng() + rng() - 2) * 0.5 * dayShockSd);
    const arr = new Array(n);
    for (let i = 0; i < n; i++) {
      const d = days[i % days.length];
      const idio = (rng() + rng() + rng() + rng() + rng() + rng() - 3) * 0.4714 * sigma;
      arr[i] = shock.get(d) + idio;
    }
    return arr;
  };
}

const results = cells.map((c) => {
  // Measured DEV calendar days for this cell. For POOLED, take the union of
  // that verdict state's session days.
  const days =
    c.session === "POOLED"
      ? [...new Set(SESSIONS.flatMap((s) => devDays[`${c.verdictState}|${s}`] ?? []))]
      : [...(devDays[`${c.verdictState}|${c.session}`] ?? [])];
  const years = ROLES.DEV;
  const wy = yearWeights(c.verdictState);
  const tw = wy.reduce((a, b) => a + b, 0) || 1;
  const n = Math.max(c.measuredTradesAfterSlot, 1);
  const b = c.baselineMeanR;
  const edgeCurve = {};
  for (const edge of EDGES) {
    let confirmed = 0;
    for (let run = 0; run < RUNS; run++) {
      const rng = mulberry32(1000003 + run * 7919 + Math.round(edge * 1000));
      const sim = makeSimulator(c.measuredSdR, c.measuredSdR * 0.55, rng);
      const noise = sim(days, n);
      // assign years proportionally to measured DEV bar counts
      const trades = noise.map((r, i) => {
        let acc = 0, u = rng(), y = years[0];
        for (let k = 0; k < years.length; k++) {
          acc += wy[k] / tw;
          if (u <= acc) {
            y = years[k];
            break;
          }
        }
        return {
          netR: +(edge + r).toFixed(6),
          year: y,
          state: FOUR_STATES_OF[c.verdictState][i % 2],
          side: i % 2 === 0 ? "long" : "short",
          session: c.session === "POOLED" ? "ny" : c.session,
          vol: "mid",
          day: days[i % days.length],
          entryBar: `sim|${i}`,
        };
      });
      // controlled baseline: coarse cell mean = b (so excess = netR - b)
      const cellEntries = STATES.flatMap((s) =>
        ["long", "short"].map((side) => [`${s}|${side}`, { n: 4000, meanNetR: b }]),
      );
      const baseline = { cells: Object.fromEntries(cellEntries), fineCells: {} };
      const out = verifyClaim(trades, { direction: +1, baseline });
      if (out.verdict === "CONFIRMED") confirmed++;
    }
    edgeCurve[edge] = {
      runs: RUNS,
      confirmed,
      probability: +(confirmed / RUNS).toFixed(4),
    };
  }
  return { ...c, baselineMeanB: b, powerCurve: edgeCurve };
});

const report = {
  generatedAt: new Date().toISOString(),
  id: "AMENDMENT-4-POWER-CURVE",
  date: "2026-10-27",
  decidedBeforeResults: true,
  reportOnly: true,
  criteriaChanged: false,
  thresholdChanged: false,
  verdictChanged: false,
  definition: {
    confirmed: "CONFIRMED iff (meanNetR > +0.10R AND day-clustered tNet > 2) AND (excessVsRandomR > 0 AND day-clustered t > 2) AND all vetoes clear (n >= 100, concentration <= 0.50, LOYO >= 0.75, NO_BASELINE).",
    meanNetR: "absolute net R mean, signed by claim direction, net of the frozen cost model",
    excessVsRandomR: "mean of (netR_i - matchedBaselineMean_i), signed by claim direction",
    trueNetEdge:
      "the assumed TRUE absolute net mean R per trade for the simulated cell, evaluated at 0.05R, 0.10R, 0.20R and 0.30R. The simulated excess is (edge - b) where b is the MEASURED verdict-state baseline mean.",
    probability: `estimated as confirmed/${RUNS} over deterministic Monte Carlo runs`,
  },
  inputs: {
    tradeCount: "MEASURED DEV signal count AFTER the one-slot book (slot-model.json)",
    calendarDays: "MEASURED DEV calendar-day counts per (verdict state, session) from the Map",
    yearSpread: "MEASURED DEV bar counts per year per verdict state (exercises the concentration and LOYO vetoes)",
    perTradeSD: "the random baseline's own measured SD for that verdict state",
    dayCorrelation: "a day-level shock of 0.55 * SD added to every trade on that day (CR1-realistic)",
    matchedBaselineMean: "MEASURED verdict-state baseline mean from random-baseline.json",
    harness: "the REAL verifyClaim() from lib/verification.mjs, with a controlled baseline",
  },
  assumptions: {
    perTradeSD: "the baseline's measured SD is used as the strategy's SD. This is an assumption: a real strategy's dispersion may differ.",
    dayCorrelation: "0.55 * SD is an assumption about within-day correlation, calibrated to the baseline's own measured inflation.",
    yearSpread: "trades are spread across DEV years proportional to MEASURED bar counts; a real strategy's year distribution may differ, which would change the concentration and LOYO veto outcomes.",
    slotModel: "the trade count uses the task-4 slot model, which is itself an assumption.",
    noOutcomes: "no strategy result exists; every input above is either measured from this project's own data or explicitly flagged as an assumption.",
  },
  cells: results,
  summary: {
    edgeCurve: EDGES.map((e) => ({
      edge: e,
      medianProbability: +(
        results.map((c) => c.powerCurve[e].probability).sort((a, b) => a - b)[Math.floor(results.length / 2)]
      ).toFixed(4),
      minProbability: +Math.min(...results.map((c) => c.powerCurve[e].probability)).toFixed(4),
      maxProbability: +Math.max(...results.map((c) => c.powerCurve[e].probability)).toFixed(4),
    })),
  },
  note:
    "REPORT-ONLY. This does not change CLAIM_CRITERIA, the +0.10R floor, t > 2, the verdict, or any threshold. If zero claims are CONFIRMED at M6 the readout remains 'too little independent data', not 'textbook false'.",
};
writeFileSync(join(OUT, "power-curve.json"), JSON.stringify(report, null, 2) + "\n");

console.log(`cell                         trades  days   b(R)    SD(R)   p@0.05  p@0.10  p@0.20  p@0.30`);
for (const c of results) {
  const p = (e) => c.powerCurve[e].probability;
  console.log(
    `${c.cell.padEnd(26)} ${String(c.measuredTradesAfterSlot).padStart(6)} ${String(c.measuredDevDays).padStart(6)} ${c.baselineMeanR.toFixed(3).padStart(7)} ${c.measuredSdR.toFixed(3).padStart(7)} ${p(0.05).toFixed(3).padStart(7)} ${p(0.1).toFixed(3).padStart(7)} ${p(0.2).toFixed(3).padStart(7)} ${p(0.3).toFixed(3).padStart(7)}`,
  );
}
console.log("\nsummary (median probability across cells):");
for (const s of report.summary.edgeCurve) {
  console.log(
    `  edge ${String(s.edge).padStart(5)}R: median ${s.medianProbability}  min ${s.minProbability}  max ${s.maxProbability}`,
  );
}
console.log("report-only: no criterion, threshold or verdict changed.");
