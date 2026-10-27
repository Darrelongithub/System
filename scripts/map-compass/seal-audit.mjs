#!/usr/bin/env node
/**
 * SEAL AUDIT — quantify exactly how "sealed" the holdout years are.
 *
 * The reviewer is right: a 500/1000-bar trailing lookback reaches across role
 * boundaries. Holdout PRICES therefore contribute to the FEATURES of early DEV
 * bars in the following DEV year. No holdout OUTCOME is ever used (DEV trades
 * are filtered before aggregation), but the features are not pristine. This is
 * written down, measured, and bounded — not assumed away.
 *
 * Also records that 2020-2024 (VAL) was studied in earlier project work: those
 * bars are not pristine to the researcher even though these specific claims
 * were never fitted on them.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { dataLines } from "./lib/csv.mjs";
import { ROLES, MAP } from "./frozen.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const NORM = join(ROOT, "artifacts/map-compass/normalized");
const OUT = join(ROOT, "artifacts/map-compass");
const p = join(NORM, "xauusd-m30-map.csv");
if (!existsSync(p)) {
  console.error("run mc:map first");
  process.exit(2);
}

const rows = [];
for (const f of dataLines(readFileSync(p, "utf8"), { delimiter: "," })) {
  if (f[0] === "datetime") continue;
  rows.push({ dt: f[0], state: f[1], role: f[12] });
}
const yearOf = (r) => Number(r.dt.slice(0, 4));
const holdout = new Set(ROLES.HOLDOUT);

function reach(lookback) {
  const affected = {};
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].role !== "DEV") continue;
    total++;
    const y = yearOf(rows[i]);
    let hit = false;
    for (let j = Math.max(0, i - lookback); j < i; j++) {
      if (holdout.has(yearOf(rows[j]))) {
        hit = true;
        break;
      }
    }
    if (hit) affected[y] = (affected[y] ?? 0) + 1;
  }
  return {
    devBars: total,
    affectedBars: Object.values(affected).reduce((a, b) => a + b, 0),
    pct: +((Object.values(affected).reduce((a, b) => a + b, 0) / total) * 100).toFixed(2),
    byDevYear: affected,
  };
}

const lookbacks = {};
for (const lb of [MAP.atrPctileLookback, MAP.warmupBars]) lookbacks[lb] = reach(lb);

// Which DEV-year prefixes are affected (the first lookback bars after each holdout year).
const boundaryYears = ROLES.DEV.filter((y) => ROLES.HOLDOUT.includes(y - 1));

const report = {
  generatedAt: new Date().toISOString(),
  purpose:
    "Quantify feature-level holdout bleed. Written down because 'harmless for outcomes' is a judgement, not a proof.",
  roles: ROLES,
  lookbacks,
  boundaryDevYears: boundaryYears,
  natureOfBleed:
    "Holdout PRICES enter trailing ATR-percentile / ER / range features of the first <=lookback DEV bars after a holdout year. The Map has ZERO fitted parameters (hand-defined thresholds), so no parameter is estimated from holdout data. No holdout trade outcome enters any DEV statistic.",
  whyNotFatal: [
    "Features are causal: holdout bars are in the PAST of the affected DEV bars, never the future. There is no lookahead.",
    "The Map has no learned weights — thresholds are frozen constants. Holdout prices cannot tune anything.",
    "Claim verification filters to DEV years BEFORE computing mean/t/totalR (a test injects +99R into holdout years to pin this).",
    "The final holdout evaluation at M10 re-derives features on the sealed years; the bleed is one-directional (holdout -> DEV features), not DEV -> holdout.",
  ],
  residualRisk:
    "Researcher's regime intuition for 2008/2012/2016/2019 is slightly informed by adjacent DEV bars. Small: <=2.3% of DEV bars affected, confined to year prefixes. Declared, not eliminated.",
  mitigation:
    "M10 must report results BOTH including and excluding the first 1000 bars of each boundary DEV year. That is a pre-registered sensitivity, not a post-hoc choice.",
  valContamination: {
    years: ROLES.VAL,
    issue:
      "2020-2024 was examined in earlier project work (golden baseline, filter research, regime statistics). These specific claims were never fitted on it, but the researcher's priors about how gold behaved then are not pristine.",
    mitigation:
      "VAL results are reported as one-shot OOS but are NOT the sole confirmatory evidence. The interleaved sealed years (2008, 2012, 2016, 2019) carry the final confirmatory weight at M10. Any VAL-driven decision to change rules starts a NEW cycle.",
  },
  stressContamination: {
    years: ROLES.STRESS,
    issue:
      "2025-11 -> 2026-08 was the old project's discovery window. STRESS is diagnostic only and can never promote a claim.",
  },
};
writeFileSync(join(OUT, "seal-audit.json"), JSON.stringify(report, null, 2) + "\n");
console.log(
  `lookback ${MAP.atrPctileLookback}: ${lookbacks[MAP.atrPctileLookback].pct}% of DEV bars affected`,
);
console.log(`lookback ${MAP.warmupBars}: ${lookbacks[MAP.warmupBars].pct}% of DEV bars affected`);
console.log(`boundary DEV years: ${boundaryYears.join(", ")}`);
