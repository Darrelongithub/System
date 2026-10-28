#!/usr/bin/env node
/**
 * G0 AMENDMENT 4 TASK 3 — OVERLAP MEASURED FROM DATA.
 *
 * Replaces the v1.3 LABEL-driven overlap (CARD_RELATIONS + a seeded RNG, which
 * produced design effect 2.2948) with the MEASURED entry-bar overlap between
 * the three variants of each family, using the real DEV signal bars emitted by
 * lib/signals.mjs. Also replaces the synthetic SE-inflation factor (1.009,
 * measured on zero-edge Gaussian noise) with a day-clustered CR1/plain-SE ratio
 * computed on the random-entry baseline trades per verdict state.
 *
 * WHAT IS MEASURED (from this project's own data):
 *   - the entry bars each of the 24 signals actually fires on, on DEV;
 *   - the pairwise and pooled Jaccard overlap between the three variants of a
 *     family, and the Kish effective N over the pooled entry-bar clusters;
 *   - the day-clustered vs plain SE ratio on the random-entry baseline trades,
 *     per verdict state (real netR values, real calendar days).
 *
 * WHAT IS STILL AN ASSUMPTION:
 *   - that a variant which fires on the same bar as another variant would be
 *     taken as a separate trade. The one-position-per-slot book (task 4) is what
 *     actually decides that; the Kish effective N here is a UPPER bound on
 *     independent information.
 *   - the per-trade SD used for the power curve (task 5) is the baseline's own
 *     measured SD, not a fitted parameter.
 *
 * No claim card, Map threshold, exit, cost or criterion is changed.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { dataLines, num } from "./lib/csv.mjs";
import { emitSignals, signalLibrarySelfCheck } from "./lib/signals.mjs";
import { CLAIM_CARDS, FAMILIES, FROZEN_TEST_SEQUENCE, validateClaimCards } from "./claim-cards.draft.mjs";
import {
  VERDICT_STATES,
  VERDICT_STATE_OF,
  STATES,
  ROLES,
  CLAIM_CRITERIA,
} from "./frozen.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const NORM = join(ROOT, "artifacts/map-compass/normalized");
const OUT = join(ROOT, "artifacts/map-compass");
const BASELINE = JSON.parse(readFileSync(join(OUT, "random-baseline.json"), "utf8"));
const DAILY_SUMS = JSON.parse(
  readFileSync(join(OUT, "random-baseline-daily-sums.json"), "utf8"),
).byVerdictState;

if (validateClaimCards().length) {
  console.error("claim card errors");
  process.exit(1);
}
if (signalLibrarySelfCheck().length) {
  console.error("signal library errors");
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
let bi = 0;
for (const line of mapLines) {
  const f = line.split(",");
  while (bi < bars.length && bars[bi].datetime !== f[0]) bi++;
  if (bi >= bars.length) break;
  states[bi] = f[1];
  bi++;
}
const signalStates = states.map((s) => (s && STATES.includes(s) ? s : null));
const DEV_IDX = new Set();
let bi2 = 0;
for (const line of mapLines) {
  while (bi2 < bars.length && bars[bi2].datetime !== line.split(",")[0]) bi2++;
  if (bi2 >= bars.length) break;
  if (line.split(",")[12] === "DEV") DEV_IDX.add(bi2);
  bi2++;
}

/** DEV signal bars for one card, as a Set of bar indices. */
function devSignalBars(cardId) {
  const rows = emitSignals(bars, cardId, { states: signalStates });
  const s = new Set();
  for (const r of rows) if (DEV_IDX.has(r.index)) s.add(r.index);
  return s;
}

/** Jaccard similarity between two bar sets. */
function jaccard(a, b) {
  if (!a.size && !b.size) return null;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? +(inter / union).toFixed(6) : 0;
}
/** Kish effective N over entry-bar clusters (union of the variant bar sets). */
function kishOverBars(sets) {
  const counts = new Map();
  for (const s of sets) for (const x of s) counts.set(x, (counts.get(x) ?? 0) + 1);
  let n = 0, sumN2 = 0, overlapping = 0;
  for (const c of counts.values()) {
    n += c;
    sumN2 += c * c;
    if (c > 1) overlapping += c;
  }
  const nEff = sumN2 > 0 ? (n * n) / sumN2 : 0;
  return {
    n,
    distinctBars: counts.size,
    nEffective: +nEff.toFixed(2),
    overlapFraction: n ? +(overlapping / n).toFixed(6) : 0,
    designEffect: nEff > 0 ? +(n / nEff).toFixed(4) : null,
  };
}

const perFamily = {};
for (const f of FAMILIES) {
  const cards = CLAIM_CARDS.filter((c) => c.family === f);
  const sets = cards.map((c) => devSignalBars(c.id));
  const pairs = [];
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++)
      pairs.push({
        a: cards[i].id,
        b: cards[j].id,
        jaccard: jaccard(sets[i], sets[j]),
        sharedBars: [...sets[i]].filter((x) => sets[j].has(x)).length,
      });
  perFamily[f] = {
    cards: cards.map((c) => c.id),
    variantSignalBars: sets.map((s) => s.size),
    pairwiseJaccard: pairs,
    pooled: kishOverBars(sets),
    barHash: createHash("sha256")
      .update(
        sets
          .map((s) => [...s].sort((a, b) => a - b).join(","))
          .join("|"),
      )
      .digest("hex"),
  };
}

const pooledAll = kishOverBars(FAMILIES.flatMap((f) => perFamily[f].cards.map((id) => devSignalBars(id))));

// Amendment 5: all 24-card pairs, including cross-family pairs.
const allCardSets = new Map(CLAIM_CARDS.map((c) => [c.id, devSignalBars(c.id)]));
const allPairs = [];
for (let i = 0; i < CLAIM_CARDS.length; i++) {
  for (let j = i + 1; j < CLAIM_CARDS.length; j++) {
    const a = CLAIM_CARDS[i], b = CLAIM_CARDS[j];
    const sa = allCardSets.get(a.id), sb = allCardSets.get(b.id);
    const ja = jaccard(sa, sb);
    allPairs.push({ a: a.id, familyA: a.family, b: b.id, familyB: b.family, jaccard: ja, sharedBars: [...sa].filter(x => sb.has(x)).length });
  }
}
const crossFamilyPairsOverHalf = allPairs.filter(p => p.familyA !== p.familyB && p.jaccard !== null && p.jaccard > 0.5).sort((a,b)=>b.jaccard-a.jaccard);
const dualThrustPdhPdl = allPairs.find(p => (p.a === "dual-thrust" && p.b === "pdh-pdl-break") || (p.b === "dual-thrust" && p.a === "pdh-pdl-break"));

// ---- day-clustered SE inflation, per verdict state, from the BASELINE -----
function cr1Se(values, keys) {
  const N = values.length;
  if (N < 2) return { se: 0, plainSe: 0, clusters: N ? 1 : 0 };
  const m = values.reduce((a, b) => a + b, 0) / N;
  const sums = new Map();
  for (let i = 0; i < N; i++) sums.set(keys[i], (sums.get(keys[i]) ?? 0) + (values[i] - m));
  const G = sums.size;
  let meat = 0;
  for (const x of sums.values()) meat += x * x;
  const se = Math.sqrt(((G > 1 ? G / (G - 1) : 1) * meat) / (N * N));
  let ss = 0;
  for (const v of values) ss += (v - m) ** 2;
  return { se, plainSe: Math.sqrt(ss / (N - 1) / N), clusters: G };
}

// Read the day-clustered estimate the baseline already computed, and verify it
// independently from the compact per-day aggregates so the number is
// reproducible from the committed artifact alone.
const dailySeRecomputed = {};
const dailySeVerified = {};
for (const vs of VERDICT_STATES) {
  const published = BASELINE.dailySe?.[vs];
  if (!published) continue;
  // Recompute CR1 from sum/sumSq per day.
  const days = DAILY_SUMS?.[vs] ?? {};
  let N = 0,
    grand = 0,
    meat = 0;
  for (const d of Object.values(days)) {
    N += d.n;
    grand += d.sum;
  }
  const mean = N ? grand / N : 0;
  for (const d of Object.values(days)) {
    // sum of (x - mean) within the day
    const within = d.sum - d.n * mean;
    meat += within * within;
  }
  const G = Object.keys(days).length;
  const se = Math.sqrt(((G > 1 ? G / (G - 1) : 1) * meat) / (N * N));
  let ss = 0;
  for (const d of Object.values(days)) ss += d.sumSq - d.n * mean * mean;
  const plainSe = Math.sqrt(ss / (N - 1) / N);
  dailySeRecomputed[vs] = {
    n: N,
    dayClusters: G,
    plainSe: +plainSe.toFixed(6),
    cr1Se: +se.toFixed(6),
    inflation: plainSe > 0 ? +(se / plainSe).toFixed(4) : null,
  };
  dailySeVerified[vs] = {
    publishedInflation: published.inflation,
    recomputationInflation: dailySeRecomputed[vs].inflation,
    match: Math.abs(published.inflation - dailySeRecomputed[vs].inflation) < 1e-9,
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  id: "AMENDMENT-4-MEASURED-OVERLAP",
  date: "2026-10-27",
  decidedBeforeResults: true,
  purpose:
    "Replace the v1.3 label-driven overlap and synthetic SE inflation with MEASURED values from the real DEV signal bars and the random-entry baseline trades.",
  replaced: {
    v13Overlap: {
      method: "label-driven: CARD_RELATIONS metadata + seeded RNG generating entry-bar multiplicities",
      pooledOverlapFraction: 0.8302,
      designEffect: 2.2948,
      whyReplaced:
        "The label-driven model assigned a fixed co-fire probability by card relation type. The real signals can now be measured directly, so the assumption is no longer needed for the power report.",
    },
    v13SeInflation: {
      value: 1.009,
      method: "measureDependence() on syntheticTradesV12({seed:7,perCell:900,trueEdgeR:0,sd:1.43})",
      whyReplaced: "Measured on the real random-entry baseline trades per verdict state instead of synthetic zero-edge noise.",
    },
  },
  measuredInputs: {
    signalBars: "emitSignals() output on the real DEV bars for all 24 cards (lib/signals.mjs)",
    overlap: "Jaccard and Kish effective N over the measured entry-bar sets",
    seInflation: "CR1 vs plain SE on the random-entry baseline netR values, grouped by verdict state and calendar day",
    baselineSamples: "artifacts/map-compass/random-baseline.json (top-up included)",
    baselineDailySums: "artifacts/map-compass/random-baseline-daily-sums.json",
  },
  assumptions: {
    sharedBarMeansSharedTrade:
      "A Kish effective N over entry bars assumes that variants firing on the same bar would be taken as separate trades. The one-position-per-slot book (task 4) is what actually decides that, so this is an UPPER bound on independent information.",
    perTradeSD:
      "The per-trade SD used downstream is the baseline's own measured SD for that cell, not a fitted parameter.",
    noOutcomes:
      "No strategy outcome, verdict, R value or trade record is used here. Only entry bars and the random-entry baseline's own netR values.",
  },
  byFamily: perFamily,
  pooled: pooledAll,
  amendment5: { allCardPairCount: allPairs.length, crossFamilyPairsJaccardAboveHalf: crossFamilyPairsOverHalf, dualThrustVsPdhPdlBreak: dualThrustPdhPdl },
  seInflation: dailySeRecomputed,
  seInflationVerifiedFromDailySums: dailySeVerified,
  seInflationNote:
    "CR1 over plain SE, computed on the random-entry baseline trades per verdict state. The v1.3 value 1.009 was measured on synthetic zero-edge noise; the measured baseline value is reported here instead.",
  minTradesPerCell: CLAIM_CRITERIA.minTradesPerCell,
  note:
    "Report-only. This replaces the v1.3 overlap/SE inputs used by reportOnlyV13 but does NOT change CLAIM_CRITERIA, the +0.10R floor, t > 2, the verdict, or any threshold.",
};
writeFileSync(join(OUT, "measured-overlap.json"), JSON.stringify(report, null, 2) + "\n");

console.log(`family                    nSignals  distinctBars  nEff      DE    pairwise Jaccard`);
for (const [f, v] of Object.entries(perFamily)) {
  const j = v.pairwiseJaccard.map((x) => x.jaccard?.toFixed(3)).join("/");
  console.log(
    `${f.padEnd(26)} ${String(v.pooled.n).padStart(7)} ${String(v.pooled.distinctBars).padStart(10)} ${String(v.pooled.nEffective).padStart(7)} ${String(v.pooled.designEffect).padStart(6)}    ${j}`,
  );
}
console.log(`\npooled across all 24 cards: n=${pooledAll.n} distinctBars=${pooledAll.distinctBars} nEff=${pooledAll.nEffective} DE=${pooledAll.designEffect}`);
console.log("SE inflation (measured on the baseline):", JSON.stringify(dailySeRecomputed));
