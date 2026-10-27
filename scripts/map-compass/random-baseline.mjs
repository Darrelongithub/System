#!/usr/bin/env node
/**
 * RANDOM-ENTRY CONTROL — the null a real claim must beat.
 *
 * DEV 2004-2011 is a gold bull run (mean close 414 -> 1,579). An unconditional
 * long with a 2R target therefore has positive net expectancy in every state.
 * Testing claims against ZERO would confirm drift, not skill.
 *
 * This script enters RANDOMLY in DEV bars, matched on (state, side, session,
 * volRegime), using the IDENTICAL standardised exit harness (1.5xATR stop, 2R
 * target) and the IDENTICAL frozen cost model. Long and short are reported
 * SEPARATELY. Deterministic seed, frozen at G0.
 *
 * G0 AMENDMENT 4 TASK 6 — BASELINE TOP-UP (pre-registered).
 *
 * The v1.3 fine-cell key was (four-state, side, session, vol), and many such
 * cells had < 200 random entries, so verification fell back to the coarse
 * (state|side) cell. Amendment 4 adds a VERDICT-STATE fine-cell key
 * (EFFICIENT|CHOPPY, side, session, vol) and tops every one of those cells up
 * to at least BASELINE_TOPUP.MIN_PER_CELL entries, using the SAME stop, target,
 * costs and the 96-bar cap, and FIXED seeds (the base seed plus a derived
 * top-up seed). No threshold changes.
 *
 * Output: artifacts/map-compass/random-baseline.json
 *         (with before/after fine-cell coverage and the top-up record).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { dataLines, num } from "./lib/csv.mjs";
import {
  RANDOM_BASELINE,
  ROLES,
  STATES,
  MAP,
  VERDICT_STATE_OF,
  VERDICT_STATES,
  FOUR_STATES_OF,
  CLAIM_CRITERIA,
} from "./frozen.mjs";
import { trueRanges } from "./lib/map.mjs";
import { sessionOfEat } from "./lib/dst.mjs";
import { volRegimeOf } from "./lib/cost.mjs";
import { resolveTrade } from "./lib/trade.mjs";
import { mulberry32 } from "./lib/placebo.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const NORM = join(ROOT, "artifacts/map-compass/normalized");
const OUT = join(ROOT, "artifacts/map-compass");

const barsPath = join(NORM, "xauusd-m30-eat.csv");
const statesPath = join(NORM, "xauusd-m30-map.csv");
if (!existsSync(barsPath) || !existsSync(statesPath)) {
  console.error("run mc:map first");
  process.exit(2);
}

const bars = [];
for (const f of dataLines(readFileSync(barsPath, "utf8"), { delimiter: "," })) {
  if (f[0] === "datetime") continue;
  const o = num(f[1]),
    h = num(f[2]),
    l = num(f[3]),
    c = num(f[4]);
  if (o === undefined || h === undefined || l === undefined || c === undefined) continue;
  bars.push({ datetime: f[0], o, h, l, c });
}

// Causal ATR(14) — simple mean of true range, same as the Map and exit harness.
const tr = trueRanges(bars);
const atr = new Float64Array(bars.length).fill(NaN);
let sum = 0;
for (let i = 0; i < bars.length; i++) {
  sum += tr[i];
  if (i >= MAP.atrPeriod) sum -= tr[i - MAP.atrPeriod];
  if (i >= MAP.atrPeriod - 1) atr[i] = sum / MAP.atrPeriod;
}

// Candidate entry bars: DEV years, valid state, enough warm-up, room to resolve.
const candidates = new Map(); // fourState|side -> [{ i, session, vol, atr, year, vs }]
const stateLines = readFileSync(statesPath, "utf8")
  .split("\n")
  .filter((l) => l && !l.startsWith("datetime"));
let barIdx = 0;
for (const line of stateLines) {
  const f = line.split(",");
  const canonical = f[0];
  while (barIdx < bars.length && bars[barIdx].datetime !== canonical) barIdx++;
  if (barIdx >= bars.length) break;
  const i = barIdx;
  const year = Number(canonical.slice(0, 4));
  const state = f[1];
  if (!ROLES.DEV.includes(year) || !STATES.includes(state)) continue;
  if (!Number.isFinite(atr[i]) || atr[i] <= 0) continue;
  if (i + RANDOM_BASELINE.maxHoldBars >= bars.length) continue;
  const session = sessionOfEat(canonical);
  const vol = volRegimeOf(bars[i]);
  for (const side of ["long", "short"]) {
    const k = `${state}|${side}`;
    if (!candidates.has(k)) candidates.set(k, []);
    candidates.get(k).push({
      i,
      session,
      vol,
      atr: atr[i],
      year,
      state,
      vs: VERDICT_STATE_OF[state],
    });
  }
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sd = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};

/** One resolved random entry. */
function drawEntry(bars, pick, side) {
  return resolveTrade(bars, pick.i, side, pick.atr, {
    session: pick.session,
    vol: pick.vol,
    variant: "baseline",
    maxBars: RANDOM_BASELINE.maxHoldBars,
  });
}

const rng = mulberry32(RANDOM_BASELINE.seed);
const samples = []; // every random entry, base + top-up
const diagnostics = { TIME_EXIT: 0, TP: 0, SL: 0, INVALID_ATR: 0, ambiguous: 0 };

// ---- base draw: 4,000 per (four-state, side), exactly as before ------------
for (const state of STATES) {
  for (const side of ["long", "short"]) {
    const pool = candidates.get(`${state}|${side}`) ?? [];
    if (!pool.length) continue;
    const n = Math.min(RANDOM_BASELINE.entriesPerCellPerSide, pool.length);
    for (let s = 0; s < n; s++) {
      const pick = pool[Math.floor(rng() * pool.length)];
      const t = drawEntry(bars, pick, side);
      diagnostics[t.outcome] = (diagnostics[t.outcome] ?? 0) + 1;
      if (t.ambiguousFallback) diagnostics.ambiguous++;
      samples.push({
        state,
        side,
        vs: pick.vs,
        session: pick.session,
        vol: pick.vol,
        year: pick.year,
        barIndex: pick.i,
        barsHeld: t.barsHeld,
        outcome: t.outcome,
        netR: t.netR,
      });
    }
  }
}

// ---- G0 Amendment 4 TASK 6: top-up every verdict-state fine cell ------------
const TOPUP_SEED = RANDOM_BASELINE.seed + 7919;
const MIN_PER_CELL = 200; // = CLAIM_CRITERIA.baselineMinCellN, frozen value
const topupRng = mulberry32(TOPUP_SEED);

// Index the base samples by verdict-state fine cell.
const byVSFine = new Map(); // vs|side|session|vol -> [samples]
for (const s of samples) {
  const k = `${s.vs}|${s.side}|${s.session}|${s.vol}`;
  if (!byVSFine.has(k)) byVSFine.set(k, []);
  byVSFine.get(k).push(s);
}

// Candidate pools by verdict state + side, filtered by session/vol on demand.
const candByVS = new Map(); // vs|side -> [{i, session, vol, atr, year, state}]
for (const [k, pool] of candidates) {
  const state = k.split("|")[0];
  const vs = VERDICT_STATE_OF[state];
  const side = k.split("|")[1];
  const key = `${vs}|${side}`;
  if (!candByVS.has(key)) candByVS.set(key, []);
  for (const p of pool) candByVS.get(key).push(p);
}

const topupRecord = {
  enabled: true,
  preRegisteredAt: "G0 Amendment 4, 2026-10-27, before any strategy result",
  cellKey: "verdictState|side|session|volRegime",
  minPerCell: MIN_PER_CELL,
  seed: TOPUP_SEED,
  derivedFrom: `RANDOM_BASELINE.seed + 7919`,
  identicalHarness: true,
  note: "Same 1.5xATR stop, 2R target, frozen cost model and 96-bar TIME_EXIT cap. Same four-state key is kept for backward compatibility.",
  cellsRequested: 0,
  cellsToppedUp: 0,
  cellsUnreachable: [],
  entriesAdded: 0,
  perCell: [],
};

for (const vs of VERDICT_STATES) {
  for (const side of ["long", "short"]) {
    for (const session of ["asian", "london", "ny"]) {
      for (const vol of ["low", "mid", "high"]) {
        const k = `${vs}|${side}|${session}|${vol}`;
        const have = byVSFine.get(k)?.length ?? 0;
        topupRecord.cellsRequested++;
        if (have >= MIN_PER_CELL) {
          topupRecord.perCell.push({ cell: k, before: have, after: have, added: 0, status: "OK" });
          continue;
        }
        const pool = (candByVS.get(`${vs}|${side}`) ?? []).filter(
          (p) => p.session === session && p.vol === vol,
        );
        if (!pool.length) {
          topupRecord.cellsUnreachable.push(k);
          topupRecord.perCell.push({
            cell: k,
            before: have,
            after: have,
            added: 0,
            status: "NO_CANDIDATE_BARS",
          });
          continue;
        }
        let added = 0;
        const addedSamples = [];
        const guard = Math.min(pool.length * 40, 20000); // bounded top-up
        for (let s = 0; s < guard && byVSFine.get(k)?.length + added < MIN_PER_CELL; s++) {
          const pick = pool[Math.floor(topupRng() * pool.length)];
          const t = drawEntry(bars, pick, side);
          diagnostics[t.outcome] = (diagnostics[t.outcome] ?? 0) + 1;
          if (t.ambiguousFallback) diagnostics.ambiguous++;
          const rec = {
            state: pick.state,
            side,
            vs: pick.vs,
            session: pick.session,
            vol: pick.vol,
            year: pick.year,
            barIndex: pick.i,
            barsHeld: t.barsHeld,
            outcome: t.outcome,
            netR: t.netR,
            topup: true,
          };
          samples.push(rec);
          addedSamples.push(rec);
          added++;
        }
        const after = byVSFine.get(k)?.length + added;
        for (const r of addedSamples) {
          const kk = `${r.vs}|${r.side}|${r.session}|${r.vol}`;
          if (!byVSFine.has(kk)) byVSFine.set(kk, []);
          byVSFine.get(kk).push(r);
        }
        topupRecord.entriesAdded += added;
        if (after >= MIN_PER_CELL) {
          topupRecord.cellsToppedUp++;
          topupRecord.perCell.push({ cell: k, before: have, after, added, status: "TOPPED_UP" });
        } else {
          topupRecord.perCell.push({
            cell: k,
            before: have,
            after,
            added,
            status: "STILL_INSUFFICIENT",
          });
        }
      }
    }
  }
}

// ---- aggregates from the combined sample set ------------------------------
const cells = {};
for (const state of STATES) {
  for (const side of ["long", "short"]) {
    const rs = samples
      .filter((s) => s.state === state && s.side === side)
      .map((s) => s.netR);
    const n = rs.length;
    const m = mean(rs),
      s = sd(rs);
    const byYear = new Map();
    for (const s2 of samples) {
      if (s2.state !== state || s2.side !== side) continue;
      if (!byYear.has(s2.year)) byYear.set(s2.year, []);
      byYear.get(s2.year).push(s2.netR);
    }
    cells[`${state}|${side}`] = {
      state,
      side,
      n,
      meanNetR: +m.toFixed(6),
      sd: +s.toFixed(6),
      se: +(s / Math.sqrt(n)).toFixed(6),
      ci95: [
        +(m - (1.96 * s) / Math.sqrt(n)).toFixed(6),
        +(m + (1.96 * s) / Math.sqrt(n)).toFixed(6),
      ],
      winRate: +(samples.filter((x) => x.state === state && x.side === side && x.outcome === "TP").length / n).toFixed(4),
      totalR: +rs.reduce((a, b) => a + b, 0).toFixed(3),
      byYear: Object.fromEntries(
        [...byYear.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([y, v]) => [y, { n: v.length, meanR: +mean(v).toFixed(5) }]),
      ),
    };
  }
}

/** Build a fine-cell table from a sample list under a given key function. */
function fineTable(sampleList, keyFn) {
  const groups = new Map();
  for (const s of sampleList) {
    const k = keyFn(s);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s.netR);
  }
  const out = {};
  for (const [k, v] of [...groups.entries()].sort()) {
    out[k] = {
      n: v.length,
      meanNetR: +mean(v).toFixed(6),
      sd: +sd(v).toFixed(6),
      sufficient: v.length >= MIN_PER_CELL,
    };
  }
  return out;
}

const fineCells = fineTable(samples, (s) => `${s.state}|${s.side}|${s.session}|${s.vol}`);
const fineCellsVerdictState = fineTable(
  samples,
  (s) => `${s.vs}|${s.side}|${s.session}|${s.vol}`,
);

// Recompute "before" (base draw only) coverage for the before/after report.
const baseSamples = samples.filter((s) => !s.topup);
const fineCellsBase = fineTable(
  baseSamples,
  (s) => `${s.vs}|${s.side}|${s.session}|${s.vol}`,
);

const covBefore = {
  fineCells: Object.keys(fineCellsBase).length,
  sufficient: Object.values(fineCellsBase).filter((c) => c.n >= MIN_PER_CELL).length,
  insufficient: Object.values(fineCellsBase).filter((c) => c.n < MIN_PER_CELL).length,
  insufficientKeys: Object.entries(fineCellsBase)
    .filter(([, c]) => c.n < MIN_PER_CELL)
    .map(([k, c]) => ({ key: k, n: c.n })),
};
const covAfter = {
  fineCells: Object.keys(fineCellsVerdictState).length,
  sufficient: Object.values(fineCellsVerdictState).filter((c) => c.n >= MIN_PER_CELL).length,
  insufficient: Object.values(fineCellsVerdictState).filter((c) => c.n < MIN_PER_CELL).length,
  insufficientKeys: Object.entries(fineCellsVerdictState)
    .filter(([, c]) => c.n < MIN_PER_CELL)
    .map(([k, c]) => ({ key: k, n: c.n })),
};

// ---- how many lookups used the coarse fallback, before vs after ------------
// "after" prefers the verdict-state fine cell (Amendment 4 key), falling back
// to the four-state fine cell, then to the coarse (state|side) cell.
function coarseShareAfter(lookupCells) {
  let fineHits = 0,
    coarseHits = 0;
  for (const c of lookupCells) {
    const vsFine = fineCellsVerdictState[`${c.vs}|${c.side}|${c.session}|${c.vol}`];
    const fsFine = fineCells[`${c.state}|${c.side}|${c.session}|${c.vol}`];
    if (vsFine?.sufficient || fsFine?.sufficient) fineHits++;
    else {
      const coarse = cells[`${c.state}|${c.side}`];
      if (coarse?.n >= MIN_PER_CELL) coarseHits++;
    }
  }
  return { fine: fineHits, coarse: coarseHits, total: fineHits + coarseHits };
}

// Reconstruct the lookup universe exactly as baseline-coverage.mjs builds it.
const LOOKUP_SESSIONS = ["asian", "london", "ny"];
const LOOKUP_VOLS = ["low", "mid", "high"];
const lookupCells = [];
for (const vs of VERDICT_STATES) {
  for (const state of FOUR_STATES_OF[vs]) {
    for (const session of LOOKUP_SESSIONS) {
      for (const side of ["long", "short"]) {
        for (const vol of LOOKUP_VOLS) lookupCells.push({ vs, state, side, session, vol });
      }
    }
  }
}
const afterCov = coarseShareAfter(lookupCells);

// The "before" share uses the base-only fine table and the four-state key.
function coarseShareBase() {
  let fineHits = 0,
    coarseHits = 0;
  for (const c of lookupCells) {
    const fine4 = fineCells[`${c.state}|${c.side}|${c.session}|${c.vol}`];
    if (fine4?.sufficient) fineHits++;
    else {
      const coarse = cells[`${c.state}|${c.side}`];
      if (coarse?.n >= MIN_PER_CELL) coarseHits++;
    }
  }
  return { fine: fineHits, coarse: coarseHits, total: fineHits + coarseHits };
}
const beforeCov = coarseShareBase();

// ---- day-clustered SE inflation per verdict state (Amendment 4 task 3) ----
function cr1Se(values, keys) {
  const N = values.length;
  if (N < 2) return { se: 0, plainSe: 0, clusters: N ? 1 : 0 };
  const m = mean(values);
  const sums = new Map();
  for (let i = 0; i < N; i++) {
    const k = keys[i];
    sums.set(k, (sums.get(k) ?? 0) + (values[i] - m));
  }
  const G = sums.size;
  let meat = 0;
  for (const x of sums.values()) meat += x * x;
  const corr = G > 1 ? G / (G - 1) : 1;
  const se = Math.sqrt((corr * meat) / (N * N));
  let ss = 0;
  for (const v of values) ss += (v - m) ** 2;
  const plainSe = Math.sqrt(ss / (N - 1) / N);
  return { se, plainSe, clusters: G };
}

const dailySe = {};
const dailySums = {};
for (const vs of VERDICT_STATES) {
  const rows = samples.filter((s) => s.vs === vs);
  const dayKeyOf = (s) => `${s.year}-${String(s.barIndex).slice(-4)}`;
  const r = cr1Se(
    rows.map((s) => s.netR),
    rows.map(dayKeyOf),
  );
  dailySe[vs] = {
    n: rows.length,
    dayClusters: r.clusters,
    plainSe: +r.plainSe.toFixed(6),
    cr1Se: +r.se.toFixed(6),
    inflation: r.plainSe > 0 ? +(r.se / r.plainSe).toFixed(4) : null,
  };
  // Compact per-day aggregates so the CR1 SE is exactly reproducible from the
  // committed artifact alone (sum and sum of squares per day).
  const byDay = new Map();
  for (const s of rows) {
    const k = dayKeyOf(s);
    if (!byDay.has(k)) byDay.set(k, { n: 0, sum: 0, sumSq: 0 });
    const g = byDay.get(k);
    g.n++;
    g.sum += s.netR;
    g.sumSq += s.netR * s.netR;
  }
  dailySums[vs] = Object.fromEntries(
    [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => [k, { n: v.n, sum: +v.sum.toFixed(9), sumSq: +v.sumSq.toFixed(9) }]),
  );
}

const timeExitShare = {
  capBars: RANDOM_BASELINE.maxHoldBars,
  frozenIn: "EXIT_HARNESS.maxHoldBars",
  count: diagnostics.TIME_EXIT,
  resolvedTotal: diagnostics.TIME_EXIT + diagnostics.TP + diagnostics.SL,
  share:
    diagnostics.TIME_EXIT + diagnostics.TP + diagnostics.SL
      ? +(diagnostics.TIME_EXIT / (diagnostics.TIME_EXIT + diagnostics.TP + diagnostics.SL)).toFixed(8)
      : null,
  sharePct:
    diagnostics.TIME_EXIT + diagnostics.TP + diagnostics.SL
      ? +(
          (100 * diagnostics.TIME_EXIT) / (diagnostics.TIME_EXIT + diagnostics.TP + diagnostics.SL)
        ).toFixed(5)
      : null,
  note: "Trades neither stopped nor targeted by bar 96 are closed at market as TIME_EXIT. Same cap applies to real claim evaluation.",
};

const barsHeldHistogram = Object.fromEntries(
  Object.entries(
    samples
      .filter((s) => s.barsHeld > 0)
      .reduce((acc, s) => {
        acc[s.barsHeld] = (acc[s.barsHeld] ?? 0) + 1;
        return acc;
      }, {}),
  )
    .sort((a, b) => a[0] - b[0])
    .map(([k, v]) => [k, v]),
);
const barsHeldStats = {
  mean: +mean(samples.map((s) => s.barsHeld)).toFixed(3),
  median: (() => {
    const v = samples.map((s) => s.barsHeld).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  })(),
  max: Math.max(...samples.map((s) => s.barsHeld)),
  p90: (() => {
    const v = samples.map((s) => s.barsHeld).sort((a, b) => a - b);
    return v[Math.floor(v.length * 0.9)];
  })(),
  histogram: barsHeldHistogram,
};

const asymmetry = {};
for (const state of STATES) {
  const l = cells[`${state}|long`],
    s = cells[`${state}|short`];
  if (!l?.n || !s?.n) continue;
  asymmetry[state] = {
    longMeanR: l.meanNetR,
    shortMeanR: s.meanNetR,
    longMinusShort: +(l.meanNetR - s.meanNetR).toFixed(6),
    longWinRate: l.winRate,
    shortWinRate: s.winRate,
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  frozenConfig: RANDOM_BASELINE,
  purpose:
    "Matched random-entry null. A claim must beat the cell with the SAME state and side by the practical floor.",
  bars: bars.length,
  devYears: ROLES.DEV,
  cells,
  fineCells,
  fineCellsVerdictState,
  dailySe,
  dailySumsRef: "artifacts/map-compass/random-baseline-daily-sums.json",
  barsHeldStats,
  topup: topupRecord,
  coverage: {
    before: beforeCov,
    after: afterCov,
    beforeCoarseFallbackShare: +((beforeCov.coarse / beforeCov.total) * 100).toFixed(4),
    afterCoarseFallbackShare: +((afterCov.coarse / afterCov.total) * 100).toFixed(4),
    fineCellCoverageBefore: covBefore,
    fineCellCoverageAfter: covAfter,
    fineCellCoverageChange: {
      cellsAdded: covAfter.fineCells - covBefore.fineCells,
      sufficientBefore: covBefore.sufficient,
      sufficientAfter: covAfter.sufficient,
      insufficientBefore: covBefore.insufficient,
      insufficientAfter: covAfter.insufficient,
    },
  },
  asymmetry,
  diagnostics,
  timeExitShare,
  verdict: Object.values(asymmetry).some((a) => Math.abs(a.longMinusShort) > 0.1)
    ? "LONG_SHORT_ASYMMETRY_PRESENT — testing claims against zero would be invalid"
    : "no material directional drift",
};
writeFileSync(join(OUT, "random-baseline.json"), JSON.stringify(report, null, 2) + "\n");
// The per-day aggregates are large (~25k entries) and are kept in their own
// artifact so random-baseline.json stays a small report. They make the CR1 SE
// exactly reproducible from committed data alone.
writeFileSync(
  join(OUT, "random-baseline-daily-sums.json"),
  JSON.stringify(
    {
      generatedAt: report.generatedAt,
      purpose: "Per-day sum/sumSq of baseline netR, per verdict state. Lets the CR1 day-clustered SE be reproduced exactly from committed data.",
      verdictStates: VERDICT_STATES,
      byVerdictState: dailySums,
    },
    null,
    2,
  ) + "\n",
);

console.log(`random-entry control, seed ${RANDOM_BASELINE.seed}, ${RANDOM_BASELINE.entriesPerCellPerSide}/cell/side`);
console.log(
  `Amendment 4 top-up: ${topupRecord.cellsRequested} verdict-state cells, ${topupRecord.cellsToppedUp} topped up, ${topupRecord.entriesAdded} entries added (seed ${topupRecord.seed})`,
);
console.log(
  `coarse fallback: before ${beforeCov.coarse}/${beforeCov.total} (${report.coverage.beforeCoarseFallbackShare}%) -> after ${afterCov.coarse}/${afterCov.total} (${report.coverage.afterCoarseFallbackShare}%)`,
);
console.log(
  `fine cells: before ${covBefore.sufficient}/${covBefore.fineCells} sufficient -> after ${covAfter.sufficient}/${covAfter.fineCells} sufficient`,
);
if (covAfter.insufficientKeys.length) {
  console.log("still insufficient:", covAfter.insufficientKeys.slice(0, 10));
}
console.log("day-clustered SE inflation by verdict state:");
for (const [vs, d] of Object.entries(dailySe)) console.log(`  ${vs}: n=${d.n} clusters=${d.dayClusters} inflation=${d.inflation}`);
console.log(`TIME_EXIT at ${timeExitShare.capBars} bars: ${timeExitShare.count}/${timeExitShare.resolvedTotal} = ${timeExitShare.sharePct}%`);
console.log(`VERDICT: ${report.verdict}`);
