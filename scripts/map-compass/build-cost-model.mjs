#!/usr/bin/env node
/**
 * M3 — build the FROZEN cost model in R UNITS.
 *
 * The spread table from M1 is in absolute dollars. That is NOT transportable:
 * a $0.50 spread is 0.01% of gold at $5,000 but 0.13% at $381. So here we join
 * every M1 bid/ask minute to the causal ATR(14) of its EAT M30 bar and store
 * `spreadOverAtr` per (session, volRegime) cell. Cost in R is then
 *
 *     costR = (spreadOverAtr + 2 * slippageAtrFraction) / stopAtrMultiple
 *
 * because 1R = stopAtrMultiple * ATR. Slippage is charged on BOTH sides.
 *
 * Slippage source: measured |next-bar-open - signal-close| / ATR on the
 * normalised M30 feed (247,910 samples): median 0.0112, p75 0.0402,
 * p90 0.1400, p95 0.2745. Frozen at 0.02 ATR per side — a round number
 * between the median and p75, conservative but not extreme. A 2x stress
 * variant is registered for M9. NEVER re-fit after seeing strategy results.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { dataLines, num } from "./lib/csv.mjs";
import { formatNaive, sessionOfEat } from "./lib/dst.mjs";
import { trueRanges } from "./lib/map.mjs";
import { MAP, EXIT_HARNESS, COST } from "./frozen.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RAW = join(ROOT, "artifacts/map-compass/raw");
const NORM = join(ROOT, "artifacts/map-compass/normalized");
const OUT = join(ROOT, "artifacts/map-compass");

const quantile = (a, q) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

/* ---- causal ATR(14) and vol regime per M30 bar ---- */
const bars = [];
const keys = [];
for (const f of dataLines(readFileSync(join(NORM, "xauusd-m30-eat.csv"), "utf8"), {
  delimiter: ",",
})) {
  if (f[0] === "datetime") continue;
  const o = num(f[1]),
    h = num(f[2]),
    l = num(f[3]),
    c = num(f[4]);
  if (o === undefined || h === undefined || l === undefined || c === undefined) continue;
  bars.push({ o, h, l, c });
  keys.push(f[0]);
}
const tr = trueRanges(bars);
const atr = new Float64Array(bars.length).fill(NaN);
let sum = 0;
for (let i = 0; i < bars.length; i++) {
  sum += tr[i];
  if (i >= MAP.atrPeriod) sum -= tr[i - MAP.atrPeriod];
  if (i >= MAP.atrPeriod - 1) atr[i] = sum / MAP.atrPeriod;
}
/** Vol regime from the bar's own range/close (scale-free), frozen thresholds. */
export function volRegimeOf(bar) {
  const rel = (bar.h - bar.l) / bar.c;
  return rel < COST.volRegime.lowMax ? "low" : rel < COST.volRegime.highMin ? "mid" : "high";
}
const byKey = new Map();
for (let i = 0; i < bars.length; i++) {
  if (!Number.isFinite(atr[i]) || atr[i] <= 0) continue;
  const canon = keys[i];
  byKey.set(canon, { atr: atr[i], vol: volRegimeOf(bars[i]), session: sessionOfEat(canon) });
}

/* ---- join M1 spreads to M30 ATR ---- */
const cells = new Map();
let matched = 0,
  unmatched = 0;
const bidPins = JSON.parse(readFileSync(new URL("./pins.json", import.meta.url), "utf8"));
const months = Object.keys(bidPins).filter((k) => /^bid_\d{4}_\d{2}$/.test(k));
for (const key of months) {
  const mo = key.slice(4);
  const bp = join(RAW, `bid_${mo}.csv`),
    ap = join(RAW, `ask_${mo}.csv`);
  if (!existsSync(bp) || !existsSync(ap)) continue;
  const ask = new Map();
  for (const f of dataLines(readFileSync(ap, "utf8"), { delimiter: "," })) {
    if (f[0] === "timestamp") continue;
    const t = Number(f[0]),
      c = num(f[4]);
    if (Number.isFinite(t) && c !== undefined) ask.set(t, c);
  }
  for (const f of dataLines(readFileSync(bp, "utf8"), { delimiter: "," })) {
    if (f[0] === "timestamp") continue;
    const t = Number(f[0]),
      b = num(f[4]);
    if (!Number.isFinite(t) || b === undefined) continue;
    const a = ask.get(t);
    if (a === undefined) continue;
    const spread = a - b;
    if (spread < 0) continue;
    // UTC -> EAT (+3h), floor to the 30m bar start
    const eatMs = t + 3 * 3600000;
    const canon = formatNaive(Math.floor(eatMs / 1800000) * 1800000);
    const ctx = byKey.get(canon);
    if (!ctx) {
      unmatched++;
      continue;
    }
    const k = `${ctx.session}|${ctx.vol}`;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(spread / ctx.atr);
    matched++;
  }
}

const table = {};
let overallMax = 0;
for (const [k, v] of [...cells.entries()].sort()) {
  let mx = 0;
  for (const x of v) if (x > mx) mx = x; // avoid Math.max(...v) stack overflow
  if (mx > overallMax) overallMax = mx;
  table[k] = {
    n: v.length,
    medianSpreadOverAtr: +quantile(v, 0.5).toFixed(5),
    p75SpreadOverAtr: +quantile(v, 0.75).toFixed(5),
    p95SpreadOverAtr: +quantile(v, 0.95).toFixed(5),
    maxSpreadOverAtr: +mx.toFixed(5),
  };
}
const all = [];
for (const v of cells.values()) for (const x of v) all.push(x);
const report = {
  generatedAt: new Date().toISOString(),
  units: "R (1R = stopAtrMultiple * ATR14)",
  formula:
    "costR = (spreadOverAtr + 2 * slippageAtrFractionPerSide * stressMultiplier) / stopAtrMultiple",
  frozenInputs: {
    stopAtrMultiple: EXIT_HARNESS.stopAtrMultiple,
    slippage: COST.slippage,
    volRegime: COST.volRegime,
  },
  slippageEvidence: {
    source: "measured |next M30 open - signal M30 close| / ATR14 over 247,910 bars",
    median: 0.0112,
    p75: 0.0402,
    p90: 0.14,
    p95: 0.2745,
    choice: "0.02 ATR per side — round number between median and p75, conservative",
  },
  matchedMinutes: matched,
  unmatchedMinutes: unmatched,
  overallMedianSpreadOverAtr: +quantile(all, 0.5).toFixed(5),
  overallP95SpreadOverAtr: +quantile(all, 0.95).toFixed(5),
  baselineCostR: +(
    (quantile(all, 0.5) + 2 * COST.slippage.atrFractionPerSide) /
    EXIT_HARNESS.stopAtrMultiple
  ).toFixed(5),
  stressCostR: +(
    (quantile(all, 0.95) + 2 * COST.slippage.atrFractionPerSide * COST.slippage.stressMultiplier) /
    EXIT_HARNESS.stopAtrMultiple
  ).toFixed(5),
  note: "Frozen at G0. Baseline = median spread + 1x slippage. Stress = p95 spread + 2x slippage. M9 uses stress as a diagnostic only; baseline is the verdict cost.",
  table,
};
writeFileSync(join(OUT, "cost-model.json"), JSON.stringify(report, null, 2) + "\n");
console.log(
  `matched ${matched} M1 minutes, ${unmatched} unmatched, ${Object.keys(table).length} cells`,
);
console.log(`baseline cost ${report.baselineCostR}R, stress ${report.stressCostR}R per round trip`);
console.log(`old static $0.20 one-sided model is NOT comparable — see ENGINE-BIAS-REGISTER.md D1`);
for (const [k, v] of Object.entries(table)) {
  console.log(
    `  ${k.padEnd(18)} n=${String(v.n).padStart(7)} spread/ATR med=${v.medianSpreadOverAtr} p95=${v.p95SpreadOverAtr}`,
  );
}
