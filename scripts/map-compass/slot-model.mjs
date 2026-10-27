#!/usr/bin/env node
/**
 * G0 AMENDMENT 4 TASK 4 — SLOT MODEL (one position per slot).
 *
 * Decision #10: one position per slot, frozen numeric priority. The old engine
 * dropped signals that arrived while a slot was occupied rather than queueing
 * them — that is what turned a +16.0R offline estimate into -3.63R in the old
 * project.
 *
 * This script EMULATES that blocking using the random-entry baseline's own
 * distribution of bars-to-exit (the `barsHeldStats` histogram), applied to the
 * MEASURED DEV signal bars of each card. No strategy outcome is used: the hold
 * duration is sampled from the baseline's realised exit-times, not from any
 * strategy.
 *
 * *** THIS IS AN ASSUMPTION ***
 *   - the hold duration is drawn from the RANDOM baseline's bars-to-exit
 *     distribution, not from the strategy's own exits;
 *   - a single global slot is modelled (the conservative reading of decision
 *     #10). If the book were per-state, survival would be higher;
 *   - signals are processed in bar order and priority is not re-applied here
 *     (all signals in a family are pooled anyway).
 *
 * Output: artifacts/map-compass/slot-model.json
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { dataLines, num } from "./lib/csv.mjs";
import { emitSignals, signalLibrarySelfCheck } from "./lib/signals.mjs";
import { CLAIM_CARDS, FAMILIES, FROZEN_TEST_SEQUENCE, validateClaimCards } from "./claim-cards.draft.mjs";
import {
  VERDICT_STATES,
  VERDICT_STATE_OF,
  STATES,
  FAMILY_STRENGTH_STATE,
  otherVerdictState,
  CLAIM_CRITERIA,
} from "./frozen.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const NORM = join(ROOT, "artifacts/map-compass/normalized");
const OUT = join(ROOT, "artifacts/map-compass");

const BASELINE = JSON.parse(readFileSync(join(OUT, "random-baseline.json"), "utf8"));
if (!BASELINE.barsHeldStats) {
  console.error("run random-baseline.mjs first");
  process.exit(2);
}
if (validateClaimCards().length || signalLibrarySelfCheck().length) {
  console.error("validation errors");
  process.exit(1);
}

const bars = [];
for (const f of dataLines(readFileSync(join(NORM, "xauusd-m30-eat.csv"), "utf8"), { delimiter: "," })) {
  if (f[0] === "datetime") continue;
  const o = num(f[1]), h = num(f[2]), l = num(f[3]), c = num(f[4]);
  if (o === undefined || h === undefined || l === undefined || c === undefined) continue;
  bars.push({ datetime: f[0], o, h, l, c });
}
const mapLines = readFileSync(join(NORM, "xauusd-m30-map.csv"), "utf8")
  .split("\n")
  .filter((l) => l && !l.startsWith("datetime"));
const states = new Array(bars.length).fill(null);
const DEV_IDX = new Set();
let bi = 0;
for (const line of mapLines) {
  const f = line.split(",");
  while (bi < bars.length && bars[bi].datetime !== f[0]) bi++;
  if (bi >= bars.length) break;
  states[bi] = f[1];
  if (f[12] === "DEV") DEV_IDX.add(bi);
  bi++;
}
const signalStates = states.map((s) => (s && STATES.includes(s) ? s : null));

/** Empirical hold-duration sampler from the baseline's barsHeld histogram. */
function makeHoldSampler(histogram, seed) {
  const entries = Object.entries(histogram)
    .map(([h, c]) => [Number(h), c])
    .sort((a, b) => a[0] - b[0]);
  const total = entries.reduce((s, [, c]) => s + c, 0);
  const cum = [];
  let acc = 0;
  for (const [h, c] of entries) {
    acc += c;
    cum.push([h, acc / total]);
  }
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return () => {
    const u = rnd();
    for (const [h, c] of cum) if (u <= c) return h;
    return entries.length ? entries[entries.length - 1][0] : 0;
  };
}

const holdSampler = makeHoldSampler(BASELINE.barsHeldStats.histogram, 20261027);

/** Run the one-slot book over an ordered list of signals. */
function runBook(signals, sampler) {
  let occupiedUntil = -1;
  const kept = [];
  let droppedOccupied = 0;
  for (const s of signals) {
    if (s.index >= occupiedUntil) {
      kept.push(s);
      occupiedUntil = s.index + sampler();
    } else droppedOccupied++;
  }
  return { kept, droppedOccupied };
}

const perCard = {};
for (const id of FROZEN_TEST_SEQUENCE) {
  const rows = emitSignals(bars, id, { states: signalStates }).filter((r) => DEV_IDX.has(r.index));
  rows.sort((a, b) => a.index - b.index);
  const { kept, droppedOccupied } = runBook(rows, holdSampler);
  const c = CLAIM_CARDS.find((x) => x.id === id);
  perCard[id] = {
    cardId: id,
    family: c.family,
    priority: c.priority,
    verdictStrength: c.strength.state,
    verdictWeakness: c.weakness.state,
    rawSignals: rows.length,
    kept: kept.length,
    droppedOccupied,
    survival: rows.length ? +(kept.length / rows.length).toFixed(4) : 0,
    keptStrength: kept.filter((r) => r.verdictState === c.strength.state).length,
    keptWeakness: kept.filter((r) => r.verdictState === c.weakness.state).length,
    keptByVerdictState: Object.fromEntries(
      VERDICT_STATES.map((vs) => [vs, kept.filter((r) => r.verdictState === vs).length]),
    ),
  };
}

const perFamily = FAMILIES.map((f) => {
  const cards = CLAIM_CARDS.filter((c) => c.family === f).map((c) => c.id);
  // Re-run the book over the pooled family signals (the real book is global).
  const rows = cards
    .flatMap((id) => emitSignals(bars, id, { states: signalStates }))
    .filter((r) => DEV_IDX.has(r.index))
    .sort((a, b) => a.index - b.index);
  const { kept } = runBook(rows, holdSampler);
  const strengthState = FAMILY_STRENGTH_STATE[f];
  return {
    family: f,
    strengthState,
    weaknessState: otherVerdictState(strengthState),
    rawSignals: rows.length,
    kept: kept.length,
    survival: rows.length ? +(kept.length / rows.length).toFixed(4) : 0,
    keptStrength: kept.filter((r) => r.verdictState === strengthState).length,
    keptWeakness: kept.filter((r) => r.verdictState === otherVerdictState(strengthState)).length,
    expectedStrengthN: kept.filter((r) => r.verdictState === strengthState).length,
    expectedWeaknessN: kept.filter((r) => r.verdictState === otherVerdictState(strengthState)).length,
  };
});

const pooled = FROZEN_TEST_SEQUENCE.flatMap((id) => emitSignals(bars, id, { states: signalStates })).filter((r) => DEV_IDX.has(r.index));
const pooledRows = pooled.sort((a, b) => a.index - b.index);
const { kept: pooledKept } = runBook(pooledRows, holdSampler);

const report = {
  generatedAt: new Date().toISOString(),
  id: "AMENDMENT-4-SLOT-MODEL",
  date: "2026-10-27",
  decidedBeforeResults: true,
  purpose: "Emulate one-position-per-slot blocking on the measured DEV signals, using the baseline's bars-to-exit distribution.",
  isAssumption: true,
  assumption: {
    holdDuration:
      "Drawn from the RANDOM-ENTRY BASELINE's own bars-to-exit histogram, not from any strategy's realised exits.",
    singleGlobalSlot:
      "One slot for the whole book (the conservative reading of decision #10). A per-state book would raise survival.",
    noOutcomes:
      "No strategy P&L, R value, verdict or trade record is used. Only signal bars and the baseline's exit-time distribution.",
    priorityNotReapplied:
      "Signals are processed in bar order; the frozen numeric priority is not re-applied here because a family's variants are pooled anyway.",
  },
  input: {
    baseline: "artifacts/map-compass/random-baseline.json#barsHeldStats",
    baselineHoldStats: {
      mean: BASELINE.barsHeldStats.mean,
      median: BASELINE.barsHeldStats.median,
      p90: BASELINE.barsHeldStats.p90,
      max: BASELINE.barsHeldStats.max,
      histogramBins: Object.keys(BASELINE.barsHeldStats.histogram).length,
    },
    samplerSeed: 20261027,
  },
  perCard,
  perFamily,
  pooled: {
    rawSignals: pooledRows.length,
    kept: pooledKept.length,
    survival: +(pooledKept.length / pooledRows.length).toFixed(4),
  },
  minTradesPerCell: CLAIM_CRITERIA.minTradesPerCell,
  note:
    "Survival is the share of raw signals that survive the one-slot book. It is NOT a strategy result and does not change any criterion.",
};
writeFileSync(join(OUT, "slot-model.json"), JSON.stringify(report, null, 2) + "\n");

console.log(`card                         raw      kept  survival  keptStr keptWeak`);
for (const r of Object.values(perCard)) {
  console.log(
    `${r.cardId.padEnd(26)} ${String(r.rawSignals).padStart(6)} ${String(r.kept).padStart(6)} ${String(r.survival).padStart(8)} ${String(r.keptStrength).padStart(8)} ${String(r.keptWeakness).padStart(8)}`,
  );
}
console.log("\nfamily                       raw       kept  survival  strengthN  weakN");
for (const r of perFamily) {
  console.log(
    `${r.family.padEnd(26)} ${String(r.rawSignals).padStart(7)} ${String(r.kept).padStart(7)} ${String(r.survival).padStart(8)} ${String(r.expectedStrengthN).padStart(9)} ${String(r.expectedWeaknessN).padStart(6)}`,
  );
}
console.log(
  `\npooled: ${report.pooled.rawSignals} raw -> ${report.pooled.kept} kept (survival ${report.pooled.survival})`,
);
console.log("ASSUMPTION: hold durations come from the random baseline, not from any strategy.");
