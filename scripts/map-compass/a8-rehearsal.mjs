#!/usr/bin/env node
/**
 * G0 AMENDMENT 8 — STAGE 3 DRESS REHEARSAL.
 *
 * Runs the FULL REAL pipeline (segment Map -> segment-aware signals -> one-slot
 * trade producer -> matched random control -> unchanged verifyClaim -> 25-cell
 * sweep -> grade) on synthetic worlds where the truth is known, and applies the
 * PRE-REGISTERED pass criteria. It is not a strategy result and it reads no real
 * bar.
 *
 * Conditions (10 worlds each, 60,000 bars each = 3 segments x 20,000):
 *   A  zero drift, no edge
 *   B  constant upward drift per bar such that a random long entry nets ~+0.15R
 *   C  one planted edge: after each donchian-20 signal bar, a known post-entry
 *      drift in the signal direction sized for true net ~+0.30R
 *
 * Pre-registered pass criteria (FROZEN HERE, before any world is run):
 *   (A) mean CONFIRMED cards per world <= 0.5 AND no world above 2
 *   (B) the same, AND print the share of claim cells that pass the net floor but
 *       fail the excess test
 *   (C) donchian-20 CONFIRMED in >= 80% of worlds, measured gross R within
 *       +/-0.05R of the planted size on average, AND the other cards
 *       <= 0.5 CONFIRMED per world
 *
 * "CONFIRMED cards per world" = distinct cards with at least one CONFIRMED claim
 * at the frozen centre (either verdict state, strength or weakness). A card's
 * strength claim is CONFIRMED only in its OWN claimed verdict state; a weakness
 * claim only in the other state (that is what the cards assert).
 *
 * Usage: node scripts/map-compass/a8-rehearsal.mjs [--worlds=N] [--bars=N]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { CLAIM_CARDS } from "./claim-cards.draft.mjs";
import { emitSignals } from "./lib/signals.mjs";
import { buildSegmentBundle } from "./lib/segments.mjs";
import {
  verifyCardA8,
  produceCardTrades,
  buildSegmentRandomControl,
} from "./lib/segmented.mjs";
import {
  buildWorld,
  driftForNetR,
  intendedPlantedNetR,
  calibrateConstantDrift,
  calibratePlantedDrift,
  SYNTH_MAP_NOTE,
} from "./lib/synth-worlds.mjs";
import { RANDOM_BASELINE, CLAIM_CRITERIA } from "./frozen.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OUT = join(ROOT, "artifacts/map-compass/a8");

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split("=")[1]) : dflt;
};

const WORLDS = arg("worlds", 10);
const BARS_PER_SEGMENT = Math.round(arg("bars", 60000) / 3);
const BASE_SEED = 20261105;

/** Pre-registered criteria, frozen in code before the first world runs. */
export const REHEARSAL_CRITERIA = Object.freeze({
  worldsPerCondition: 10,
  barsPerWorld: 60000,
  A: { meanConfirmedCardsMax: 0.5, anyWorldMax: 2 },
  B: { meanConfirmedCardsMax: 0.5, anyWorldMax: 2 },
  C: {
    targetCard: "donchian-20",
    confirmedWorldShareMin: 0.8,
    measuredGrossToleranceR: 0.05,
    otherCardsMeanMax: 0.5,
  },
  frozenAt: "2026-11-05, G0 Amendment 8, before any rehearsal world was run",
});

const signalFn = (bars, cardId, opts) => emitSignals(bars, cardId, opts);

/** Which verdict state does a card's STRENGTH claim live in? */
function strengthState(card) {
  return card.strength?.state ?? card.verdictStrength;
}

/**
 * Run every card through the full pipeline in ONE world, and collect the
 * pre-registered accounting.
 */
function runWorld(world) {
  const bundle = buildSegmentBundle(world.bars);
  const perCard = [];
  let cellsTotal = 0;
  let cellsNetFloorPass = 0;
  let cellsNetFloorPassExcessFail = 0;

  for (const card of CLAIM_CARDS) {
    const claimedStrengthState = strengthState(card);
    const audit = { cardId: card.id, strengthState: claimedStrengthState, claims: [] };
    for (const kind of ["strength", "weakness"]) {
      const r = verifyCardA8({
        bundle,
        card,
        kind,
        signalFn,
        baselineMinCellN: CLAIM_CRITERIA.baselineMinCellN,
        withSweep: false,
      });
      const targetState = kind === "strength" ? card.strength.state : card.weakness.state;
      const res = r.centre[targetState];
      audit.claims.push({
        kind,
        verdictState: targetState,
        verdict: res.verdict,
        n: res.n,
        meanNetR: res.meanNetR,
        excessVsRandomR: res.excessVsRandomR,
        t: res.t,
        tNet: res.tNet,
        grossMeanR: meanGross(r.book.trades.filter((t) => t.verdictState === targetState)),
        netFloorPass: res.meanNetR > CLAIM_CRITERIA.practicalFloorR && res.tNet > CLAIM_CRITERIA.tStatMin,
        excessPass: res.excessVsRandomR > CLAIM_CRITERIA.excessFloorR && res.t > CLAIM_CRITERIA.tStatMin,
      });
      cellsTotal++;
      const c = audit.claims[audit.claims.length - 1];
      if (c.netFloorPass) cellsNetFloorPass++;
      if (c.netFloorPass && !c.excessPass) cellsNetFloorPassExcessFail++;
    }
    audit.confirmed = audit.claims.some((c) => c.verdict === "CONFIRMED");
    audit.donchianGrossR = audit.claims
      .filter((c) => card.id === REHEARSAL_CRITERIA.C.targetCard)
      .map((c) => c.grossMeanR);
    perCard.push(audit);
  }

  return {
    worlds: 1,
    confirmedCards: perCard.filter((c) => c.confirmed).length,
    confirmedCardIds: perCard.filter((c) => c.confirmed).map((c) => c.cardId),
    cellsTotal,
    cellsNetFloorPass,
    cellsNetFloorPassExcessFail,
    netFloorOnlyShare: cellsTotal ? +(cellsNetFloorPassExcessFail / cellsTotal).toFixed(4) : 0,
    donchian: perCard.find((c) => c.cardId === REHEARSAL_CRITERIA.C.targetCard),
    perCard,
  };
}

const meanGross = (trades) =>
  trades.length ? +(trades.reduce((a, t) => a + t.grossR, 0) / trades.length).toFixed(6) : null;

function summarise(condition, worlds) {
  const meanConfirmed = worlds.reduce((a, w) => a + w.confirmedCards, 0) / worlds.length;
  const maxConfirmed = Math.max(...worlds.map((w) => w.confirmedCards));
  const cellsTotal = worlds.reduce((a, w) => a + w.cellsTotal, 0);
  const floorOnly = worlds.reduce((a, w) => a + w.cellsNetFloorPassExcessFail, 0);
  const floorPass = worlds.reduce((a, w) => a + w.cellsNetFloorPass, 0);
  const donchianConfirmed = worlds.filter((w) =>
    w.donchian?.claims.some((c) => c.verdict === "CONFIRMED"),
  ).length;
  const donchianGross = worlds
    .map((w) => w.donchian?.claims.find((c) => c.kind === "strength")?.grossMeanR)
    .filter((x) => x !== null && x !== undefined);
  const otherConfirmed = worlds.map((w) =>
    w.confirmedCardIds.filter((id) => id !== REHEARSAL_CRITERIA.C.targetCard).length,
  );
  return {
    condition,
    worlds: worlds.length,
    meanConfirmedCards: +meanConfirmed.toFixed(3),
    maxConfirmedCards: maxConfirmed,
    cellsTotal,
    cellsNetFloorPass: floorPass,
    cellsNetFloorPassExcessFail: floorOnly,
    netFloorOnlyShare: cellsTotal ? +(floorOnly / cellsTotal).toFixed(4) : 0,
    donchianConfirmedWorlds: donchianConfirmed,
    donchianConfirmedShare: +(donchianConfirmed / worlds.length).toFixed(3),
    donchianMeasuredGrossMeanR:
      donchianGross.length ? +(donchianGross.reduce((a, x) => a + x, 0) / donchianGross.length).toFixed(4) : null,
    otherCardsMeanConfirmed: +(otherConfirmed.reduce((a, x) => a + x, 0) / worlds.length).toFixed(3),
    otherCardsMaxConfirmed: Math.max(...otherConfirmed),
  };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------
// Calibration (generator side, PILOT seeds only, scored worlds excluded)
// ---------------------------------------------------------------------------
// The drift a world needs depends on how long trades actually survive, not on
// the 96-bar cap: a barrier exit happens after ~20 bars. So the drift is
// calibrated on pilot seeds >= 900000; every scored world uses a seed < 300000
// and is therefore never part of its own calibration.
const B_NET_TARGET = 0.15;
const C_NET_TARGET = 0.3;
// The pilot must have the SAME shape as a scored world, or the calibration is
// measuring a different process.
const PILOT_BARS = BARS_PER_SEGMENT * 3;

function longNetROf(drift, condition) {
  const pilot = buildWorld({ condition, seed: 990001, barsPerSegment: BARS_PER_SEGMENT, driftPerBarR: drift });
  const bundle = buildSegmentBundle(pilot.bars);
  const control = buildSegmentRandomControl(bundle, { entriesPerCellPerSide: 600 });
  const longs = control.entries.filter((e) => e.side === "long");
  return longs.length ? longs.reduce((a, e) => a + e.netR, 0) / longs.length : 0;
}

function donchianGrossOf(drift) {
  const pilot = buildWorld({ condition: "C", seed: 990002, barsPerSegment: BARS_PER_SEGMENT, driftPerBarR: drift });
  const bundle = buildSegmentBundle(pilot.bars);
  const book = produceCardTrades(bundle, { id: "donchian-20", priority: 1 }, signalFn);
  return book.trades.length ? book.trades.reduce((a, t) => a + t.grossR, 0) / book.trades.length : 0;
}

const calB = calibrateConstantDrift((d) => longNetROf(d, "B"), B_NET_TARGET);
const calC = calibratePlantedDrift(donchianGrossOf, C_NET_TARGET);
const DRIFT_B = calB.drift;
const DRIFT_C = calC.drift;

console.error(`[calibration] B drift=${DRIFT_B.toFixed(6)}R/bar -> random-long net ${calB.trace.at(-1).measured.toFixed(4)}R (target ${B_NET_TARGET})`);
console.error(`[calibration] C drift=${DRIFT_C.toFixed(6)}R/bar -> donchian gross ${calC.trace.at(-1).measured.toFixed(4)}R (target ${C_NET_TARGET})`);

const results = {};
let detailedRecords = [];
const worldRecords = [];

for (const condition of ["A", "B", "C"]) {
  const worlds = [];
  for (let w = 0; w < REHEARSAL_CRITERIA.worldsPerCondition; w++) {
    const seed = BASE_SEED + condition.charCodeAt(0) * 1000 + w;
    let driftPerBarR = null;
    if (condition === "B") driftPerBarR = DRIFT_B;
    if (condition === "C") driftPerBarR = DRIFT_C;
    const world = buildWorld({
      condition,
      seed,
      barsPerSegment: BARS_PER_SEGMENT,
      driftPerBarR,
    });
    const r = runWorld(world);
    worlds.push(r);
    worldRecords.push({ condition, seed, ...r, meta: world.meta });
    console.error(
      `[${condition}] world ${w + 1}/${REHEARSAL_CRITERIA.worldsPerCondition} seed=${seed} confirmedCards=${r.confirmedCards}`,
    );
  }
  results[condition] = summarise(condition, worlds);
}

// Planted sizes, stated by the generator.
const planted = {
  B: {
    intendedNetR: B_NET_TARGET,
    driftPerBarR: DRIFT_B,
    calibrationTrace: calB.trace,
    measuredRandomLongNetR: calB.trace.at(-1).measured,
    note: "Condition B: constant per-bar drift, calibrated on pilot seeds so a random long nets about +0.15R.",
  },
  C: {
    intendedNetR: C_NET_TARGET,
    driftPerBarR: DRIFT_C,
    calibrationTrace: calC.trace,
    measuredPilotDonchianGrossR: calC.trace.at(-1).measured,
    intended: intendedPlantedNetR(DRIFT_C),
    note: "Condition C: that drift, in the signal direction, for up to 96 bars after each donchian-20 signal bar. Target size is stated as GROSS R (what the verifier measures); net after frozen cost is shown too.",
  },
};

// ---------------------------------------------------------------------------
// Pre-registered pass/fail
// ---------------------------------------------------------------------------
const A = results.A;
const B = results.B;
const C = results.C;
const checks = [
  {
    id: "A.mean<=0.5",
    value: A.meanConfirmedCards,
    required: `<= ${REHEARSAL_CRITERIA.A.meanConfirmedCardsMax}`,
    pass: A.meanConfirmedCards <= REHEARSAL_CRITERIA.A.meanConfirmedCardsMax,
  },
  {
    id: "A.max<=2",
    value: A.maxConfirmedCards,
    required: `<= ${REHEARSAL_CRITERIA.A.anyWorldMax}`,
    pass: A.maxConfirmedCards <= REHEARSAL_CRITERIA.A.anyWorldMax,
  },
  {
    id: "B.mean<=0.5",
    value: B.meanConfirmedCards,
    required: `<= ${REHEARSAL_CRITERIA.B.meanConfirmedCardsMax}`,
    pass: B.meanConfirmedCards <= REHEARSAL_CRITERIA.B.meanConfirmedCardsMax,
  },
  {
    id: "B.max<=2",
    value: B.maxConfirmedCards,
    required: `<= ${REHEARSAL_CRITERIA.B.anyWorldMax}`,
    pass: B.maxConfirmedCards <= REHEARSAL_CRITERIA.B.anyWorldMax,
  },
  {
    id: "C.donchian>=80%",
    value: C.donchianConfirmedShare,
    required: `>= ${REHEARSAL_CRITERIA.C.confirmedWorldShareMin}`,
    pass: C.donchianConfirmedShare >= REHEARSAL_CRITERIA.C.confirmedWorldShareMin,
  },
  {
    id: "C.grossWithin0.05R",
    value: C.donchianMeasuredGrossMeanR,
    required: `planted ${planted.C.measuredPilotDonchianGrossR.toFixed(4)} +/- ${REHEARSAL_CRITERIA.C.measuredGrossToleranceR}`,
    pass:
      C.donchianMeasuredGrossMeanR !== null &&
      Math.abs(C.donchianMeasuredGrossMeanR - planted.C.measuredPilotDonchianGrossR) <=
        REHEARSAL_CRITERIA.C.measuredGrossToleranceR,
  },
  {
    id: "C.otherCards<=0.5",
    value: C.otherCardsMeanConfirmed,
    required: `<= ${REHEARSAL_CRITERIA.C.otherCardsMeanMax}`,
    pass: C.otherCardsMeanConfirmed <= REHEARSAL_CRITERIA.C.otherCardsMeanMax,
  },
];

const verdict = checks.every((c) => c.pass) ? "PASS" : "FAIL";

const report = {
  generatedAt: new Date().toISOString(),
  stage: "STAGE 3 DRESS REHEARSAL",
  strategyResults: "NONE — synthetic worlds only; no real bar was read",
  criteria: REHEARSAL_CRITERIA,
  config: {
    worldsPerCondition: REHEARSAL_CRITERIA.worldsPerCondition,
    barsPerWorld: BARS_PER_SEGMENT * 3,
    barsPerSegment: BARS_PER_SEGMENT,
    baseSeed: BASE_SEED,
    baselineConfig: RANDOM_BASELINE,
    claimCriteria: CLAIM_CRITERIA,
    mapNote: SYNTH_MAP_NOTE,
  },
  planted,
  results,
  checks,
  verdict,
  worldRecords: (detailedRecords = worldRecords.map((w) => ({
    condition: w.condition,
    seed: w.seed,
    confirmedCards: w.confirmedCards,
    confirmedCardIds: w.confirmedCardIds,
    cellsTotal: w.cellsTotal,
    cellsNetFloorPassExcessFail: w.cellsNetFloorPassExcessFail,
    netFloorOnlyShare: w.netFloorOnlyShare,
    donchianVerdicts: w.donchian?.claims.map((c) => `${c.kind}@${c.verdictState}:${c.verdict}`) ?? [],
    donchianGrossR: w.donchian?.claims.map((c) => c.grossMeanR) ?? [],
    donchianDetail: (() => {
      const c = w.donchian?.claims.find((x) => x.kind === "strength");
      if (!c) return null;
      return {
        verdictState: c.verdictState,
        verdict: c.verdict,
        n: c.n,
        meanNetR: c.meanNetR,
        excessVsRandomR: c.excessVsRandomR,
        t: c.t,
        tNet: c.tNet,
        grossMeanR: c.grossMeanR,
      };
    })(),
  }))),
};

writeFileSync(join(OUT, "rehearsal.json"), JSON.stringify(report, null, 2) + "\n");

const p = console.log;
p("=== STAGE 3 DRESS REHEARSAL (synthetic; no real bar read) ===");
p(`worlds per condition: ${REHEARSAL_CRITERIA.worldsPerCondition} | bars per world: ${BARS_PER_SEGMENT * 3} | seed base: ${BASE_SEED}`);
p("");
p("condition  worlds  meanConfirmed  maxConfirmed  cells  netFloorOnly  netFloorOnlyShare  donchianConfirmed  donchianGrossMeanR  otherMean  otherMax");
for (const c of ["A", "B", "C"]) {
  const r = results[c];
  p(
    `${c}          ${String(r.worlds).padStart(6)}  ${String(r.meanConfirmedCards).padStart(13)}  ${String(r.maxConfirmedCards).padStart(12)}  ${String(r.cellsTotal).padStart(5)}  ${String(r.cellsNetFloorPassExcessFail).padStart(12)}  ${String(r.netFloorOnlyShare).padStart(17)}  ${String(r.donchianConfirmedWorlds + "/" + r.worlds).padStart(17)}  ${String(r.donchianMeasuredGrossMeanR).padStart(18)}  ${String(r.otherCardsMeanConfirmed).padStart(9)}  ${String(r.otherCardsMaxConfirmed).padStart(8)}`,
  );
}
p("");
p("PLANTED SIZES (from the generator, not the verifier)");
p(`  B: constant drift, random long intended net ~ +${B_NET_TARGET}R`);
p(`  C: drift/bar ${planted.C.driftPerBarR.toFixed(6)}R -> pilot-measured donchian gross ${planted.C.measuredPilotDonchianGrossR.toFixed(4)}R (target ${C_NET_TARGET}R gross); net after frozen cost ${(planted.C.measuredPilotDonchianGrossR - 0.11897).toFixed(4)}R`);
p(`  B: drift/bar ${planted.B.driftPerBarR.toFixed(6)}R -> pilot-measured random-long net ${planted.B.measuredRandomLongNetR.toFixed(4)}R (target +${B_NET_TARGET}R)`);
p("");
p("TARGET-CARD DIAGNOSTICS BY CONDITION (diagnosis only; criteria unchanged)");
p("cond  netMeanR   excess     tExcess   tNet    grossMeanR  n(trades)");
for (const c of ["A", "B", "C"]) {
  const rows = detailedRecords.filter((w) => w.condition === c && w.donchianDetail);
  if (!rows.length) { p(`${c}     (no detail captured)`); continue; }
  const avg = (f) => rows.reduce((a, w) => a + (f(w.donchianDetail) ?? 0), 0) / rows.length;
  p(
    `${c}     ${String(avg((d) => d.meanNetR).toFixed(4)).padEnd(10)} ${String(avg((d) => d.excessVsRandomR).toFixed(4)).padEnd(10)} ${String(avg((d) => d.t).toFixed(3)).padEnd(9)} ${String(avg((d) => d.tNet).toFixed(3)).padEnd(7)} ${String(avg((d) => d.grossMeanR).toFixed(4)).padEnd(11)} ${avg((d) => d.n).toFixed(0)}`,
  );
}
p("");
p("PRE-REGISTERED CHECKS");
for (const c of checks) p(`  ${c.pass ? "PASS" : "FAIL"}  ${c.id.padEnd(20)} value=${String(c.value).padEnd(10)} required ${c.required}`);
p("");
p(`VERDICT: ${verdict}`);
p(`wrote ${join(OUT, "rehearsal.json")}`);
process.exit(verdict === "PASS" ? 0 : 1);
