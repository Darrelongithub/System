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
 * Output: artifacts/map-compass/random-baseline.json
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { dataLines, num } from "./lib/csv.mjs";
import { RANDOM_BASELINE, ROLES, STATES, MAP } from "./frozen.mjs";
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
const candidates = new Map(); // state|side -> [indices]
const stateLines = readFileSync(statesPath, "utf8")
  .split("\n")
  .filter((l) => l && !l.startsWith("datetime"));
let barIdx = 0;
for (const line of stateLines) {
  const f = line.split(",");
  const canonical = f[0];
  // states CSV is aligned 1:1 with the normalised bars CSV
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
    candidates.get(k).push({ i, session, vol, atr: atr[i], year });
  }
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sd = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};

const rng = mulberry32(RANDOM_BASELINE.seed);
const cells = {};
const fineCells = {}; // state|side|session|vol -> matched null
const diagnostics = { TIME_EXIT: 0, TP: 0, SL: 0, INVALID_ATR: 0, ambiguous: 0 };
const allSamples = []; // { state, side, session, vol, netR } for fine cells

for (const state of STATES) {
  for (const side of ["long", "short"]) {
    const k = `${state}|${side}`;
    const pool = candidates.get(k) ?? [];
    if (!pool.length) {
      cells[k] = { n: 0 };
      continue;
    }
    const n = Math.min(RANDOM_BASELINE.entriesPerCellPerSide, pool.length);
    const rs = [];
    const byYear = new Map();
    let wins = 0;
    for (let s = 0; s < n; s++) {
      const pick = pool[Math.floor(rng() * pool.length)];
      const t = resolveTrade(bars, pick.i, side, pick.atr, {
        session: pick.session,
        vol: pick.vol,
        variant: "baseline",
        maxBars: RANDOM_BASELINE.maxHoldBars,
      });
      diagnostics[t.outcome] = (diagnostics[t.outcome] ?? 0) + 1;
      if (t.ambiguousFallback) diagnostics.ambiguous++;
      rs.push(t.netR);
      allSamples.push({ state, side, session: pick.session, vol: pick.vol, netR: t.netR });
      if (t.outcome === "TP") wins++;
      if (!byYear.has(pick.year)) byYear.set(pick.year, []);
      byYear.get(pick.year).push(t.netR);
    }
    const m = mean(rs),
      s = sd(rs);
    cells[k] = {
      state,
      side,
      n,
      poolSize: pool.length,
      meanNetR: +m.toFixed(6),
      sd: +s.toFixed(6),
      se: +(s / Math.sqrt(n)).toFixed(6),
      ci95: [
        +(m - (1.96 * s) / Math.sqrt(n)).toFixed(6),
        +(m + (1.96 * s) / Math.sqrt(n)).toFixed(6),
      ],
      winRate: +(wins / n).toFixed(4),
      totalR: +rs.reduce((a, b) => a + b, 0).toFixed(3),
      byYear: Object.fromEntries(
        [...byYear.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([y, v]) => [y, { n: v.length, meanR: +mean(v).toFixed(5) }]),
      ),
    };
  }
}

// Matched null at (state|side|session|vol). Falls back to state|side when a
// fine cell is too small; verification.mjs records which was used.
{
  const groups = new Map();
  for (const s of allSamples) {
    const k = `${s.state}|${s.side}|${s.session}|${s.vol}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s.netR);
  }
  for (const [k, v] of [...groups.entries()].sort()) {
    const m = mean(v),
      s = sd(v);
    fineCells[k] = {
      n: v.length,
      meanNetR: +m.toFixed(6),
      sd: +s.toFixed(6),
      sufficient: v.length >= 200,
    };
  }
}

// Long/short asymmetry is the bull-run signature. Report it explicitly.
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

// G0 Amendment 2: report the TIME_EXIT share. This is the pre-results evidence
// that the 96-bar cap is not vacuous — those trades would otherwise be booked
// 0R or left OPEN, biasing expectancy. Diagnostics: TP/SL/TIME_EXIT sum to the
// resolved total; `ambiguous` is a separate flag, not an outcome.
const resolved = diagnostics.TIME_EXIT + diagnostics.TP + diagnostics.SL;
const timeExitShare = {
  capBars: RANDOM_BASELINE.maxHoldBars,
  frozenIn: "EXIT_HARNESS.maxHoldBars",
  count: diagnostics.TIME_EXIT,
  resolvedTotal: resolved,
  share: resolved ? +(diagnostics.TIME_EXIT / resolved).toFixed(8) : null,
  sharePct: resolved ? +((100 * diagnostics.TIME_EXIT) / resolved).toFixed(5) : null,
  note: "Trades neither stopped nor targeted by bar 96 are closed at market as TIME_EXIT. Same cap applies to real claim evaluation.",
};

const report = {
  generatedAt: new Date().toISOString(),
  frozenConfig: RANDOM_BASELINE,
  purpose:
    "Matched random-entry null. A claim must beat the cell with the SAME state and side by the practical floor.",
  bars: bars.length,
  devYears: ROLES.DEV,
  cells,
  fineCells,
  asymmetry,
  diagnostics,
  timeExitShare,
  verdict: Object.values(asymmetry).some((a) => Math.abs(a.longMinusShort) > 0.1)
    ? "LONG_SHORT_ASYMMETRY_PRESENT — testing claims against zero would be invalid"
    : "no material directional drift",
};
writeFileSync(join(OUT, "random-baseline.json"), JSON.stringify(report, null, 2) + "\n");

console.log(
  `random-entry control, seed ${RANDOM_BASELINE.seed}, ${RANDOM_BASELINE.entriesPerCellPerSide}/cell/side`,
);
console.log(`state        long(meanR, win)      short(meanR, win)    long-short`);
for (const state of STATES) {
  const l = cells[`${state}|long`],
    s = cells[`${state}|short`];
  if (!l?.n || !s?.n) continue;
  console.log(
    `  ${state.padEnd(11)} ${String(l.meanNetR).padStart(8)} ${String(l.winRate).padStart(6)}   ${String(s.meanNetR).padStart(10)} ${String(s.winRate).padStart(6)}   ${String(asymmetry[state].longMinusShort).padStart(9)}`,
  );
}
console.log(
  `TIME_EXIT at ${timeExitShare.capBars} bars: ${timeExitShare.count}/${timeExitShare.resolvedTotal} = ${timeExitShare.sharePct}%`,
);
console.log(`VERDICT: ${report.verdict}`);
