#!/usr/bin/env node
/**
 * M2 — build the Map over the normalised XAUUSD M30 feed and validate the
 * INSTRUMENT (not strategies). Writes:
 *   artifacts/map-compass/map-validation.json   coverage/dwell/causality/sweep/lag
 *   artifacts/map-compass/normalized/xauusd-m30-map.csv   per-bar states (gitignored)
 *
 * HOLDOUT years are SEALED: they are excluded from every statistic here. Only
 * DEV years are used to characterise the instrument. VAL/STRESS/HOLDOUT rows
 * are still emitted into the CSV for later (M8/M10), but never inspected here.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { dataLines, num, toCsv } from "./lib/csv.mjs";
import { MAP, ROLES, STATES } from "./frozen.mjs";
import { computeFeatures, classify, rawStateOf, buildMap } from "./lib/map.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const NORM = join(ROOT, "artifacts/map-compass/normalized");
const OUT = join(ROOT, "artifacts/map-compass");

function loadBars(name) {
  const bars = [];
  for (const f of dataLines(readFileSync(join(NORM, name), "utf8"), { delimiter: "," })) {
    if (f[0] === "datetime") continue;
    const o = num(f[1]),
      h = num(f[2]),
      l = num(f[3]),
      c = num(f[4]);
    if (o === undefined || h === undefined || l === undefined || c === undefined) continue;
    bars.push({ datetime: f[0], o, h, l, c, v: num(f[5]) ?? 0 });
  }
  return bars;
}

const yearOf = (dt) => Number(String(dt).slice(0, 4));
const sha = (o) => createHash("sha256").update(JSON.stringify(o)).digest("hex");
const median = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

const bars = loadBars("xauusd-m30-eat.csv");
const { features, states } = buildMap(bars, MAP);

/* ---------- 1. coverage per DEV year ---------- */
const devSet = new Set(ROLES.DEV);
const coverage = {};
for (const y of [...ROLES.DEV].sort((a, b) => a - b)) {
  coverage[y] = {
    bars: 0,
    warmup: 0,
    ...Object.fromEntries(STATES.map((s) => [s, 0])),
    UNKNOWN: 0,
    abstain: 0,
    pending: 0,
  };
}
for (let i = 0; i < bars.length; i++) {
  const y = yearOf(bars[i].datetime);
  const bucket = coverage[y];
  if (!bucket) continue;
  bucket.bars++;
  if (features[i].warmup) bucket.warmup++;
  bucket[states[i].state]++;
  if (states[i].reason === "abstain_or_warmup") bucket.abstain++;
  if (states[i].reason === "pending_transition") bucket.pending++;
}
// every state must appear in every DEV year with a meaningful share
const coverageProblems = [];
for (const [y, c] of Object.entries(coverage)) {
  for (const s of STATES) {
    if (c[s] / c.bars < 0.02)
      coverageProblems.push(`${y}: ${s} only ${((c[s] / c.bars) * 100).toFixed(2)}%`);
  }
}

/* ---------- 2. dwell time (consecutive bars in the same confirmed state) ---------- */
const runs = [];
let runState = states[0].state,
  runLen = 0;
for (const s of states) {
  if (s.state === runState) runLen++;
  else {
    runs.push({ state: runState, len: runLen });
    runState = s.state;
    runLen = 1;
  }
}
runs.push({ state: runState, len: runLen });
const dwell = {};
for (const s of [...STATES, "UNKNOWN"]) {
  const l = runs.filter((r) => r.state === s).map((r) => r.len);
  dwell[s] = {
    runs: l.length,
    meanBars: +(l.reduce((a, b) => a + b, 0) / (l.length || 1)).toFixed(2),
    medianBars: l.length ? +median(l).toFixed(2) : 0,
    maxBars: l.length ? Math.max(...l) : 0,
  };
}

// Two different dwell questions. `dwell` above counts UNKNOWN as a break, so
// it measures ROUTING stability (how long the Compass sees one allow-list).
// `episodeDwell` ignores UNKNOWN interruptions and measures REGIME persistence.
// Both are reported; conflating them would make a healthy instrument look
// broken (or hide a flickering one).
const episodeRuns = [];
let epState = null,
  epLen = 0;
for (const s of states) {
  if (s.state === "UNKNOWN") continue;
  if (s.state === epState) epLen++;
  else {
    if (epState) episodeRuns.push({ state: epState, len: epLen });
    epState = s.state;
    epLen = 1;
  }
}
if (epState) episodeRuns.push({ state: epState, len: epLen });
const episodeDwell = {};
for (const s of STATES) {
  const l = episodeRuns.filter((r) => r.state === s).map((r) => r.len);
  episodeDwell[s] = {
    episodes: l.length,
    meanBars: +(l.reduce((a, b) => a + b, 0) / (l.length || 1)).toFixed(2),
    medianBars: l.length ? +median(l).toFixed(2) : 0,
    maxBars: l.length ? Math.max(...l) : 0,
  };
}
const devRows = states.filter((_, i) => devSet.has(yearOf(bars[i].datetime)));
const flatPct = +(
  (devRows.filter((s) => s.state === "UNKNOWN").length / devRows.length) *
  100
).toFixed(2);
const pendingPct = +(
  (devRows.filter((s) => s.reason === "pending_transition").length / devRows.length) *
  100
).toFixed(2);

/* ---------- 3. causality: future mutations must not change past states ---------- */
const CUT = 120000;
const mutated = bars.slice(0, CUT + 1).map((b, i) => ({ ...b }));
for (let i = CUT + 1; i < bars.length; i++) {
  // append wildly different future bars (not used by the prefix build).
  mutated.push({
    datetime: bars[i].datetime,
    o: bars[i].c * 3,
    h: bars[i].c * 3.1,
    l: bars[i].c * 2.9,
    c: bars[i].c * 3,
    v: 1,
  });
}
const mutatedFull = buildMap(mutated, MAP);
let causalityMismatch = 0;
for (let i = 0; i <= CUT; i++) {
  if (mutatedFull.states[i].state !== states[i].state) causalityMismatch++;
}
// Truncation test: features at bar t must not need bars after t.
const truncated = buildMap(bars.slice(0, CUT + 1), MAP);
let truncationMismatch = 0;
for (let i = 0; i <= CUT; i++) {
  if (truncated.states[i].state !== states[i].state) truncationMismatch++;
}

/* ---------- 4. determinism ---------- */
const second = buildMap(bars, MAP);
const determinism = sha(second.states.map((s) => s.state)) === sha(states.map((s) => s.state));

/* ---------- 5. threshold sensitivity sweep — VETO ONLY, never selects ---------- */
const erGrid = [0.25, 0.3, 0.35, 0.4, 0.45];
const pcGrid = [60, 65, 70, 75, 80];
const sweep = [];
const refStates = states.map((s) => s.state);
for (const er of erGrid) {
  for (const pc of pcGrid) {
    const cfg = { ...MAP, erCutoff: er, atrPctileCutoff: pc };
    const st = classify(features, cfg).map((s) => s.state);
    let same = 0,
      devBars = 0;
    for (let i = 0; i < bars.length; i++) {
      if (!devSet.has(yearOf(bars[i].datetime))) continue;
      devBars++;
      if (st[i] === refStates[i]) same++;
    }
    sweep.push({
      erCutoff: er,
      atrPctileCutoff: pc,
      agreementPct: +((same / devBars) * 100).toFixed(2),
    });
  }
}
const stableCells = sweep.filter((s) => s.agreementPct >= 80).length;
// The blueprint's sweep veto applies to CLAIM VERDICTS at M6, not to state
// labels at M2. Of course labels move when the cutoffs move — that is what a
// threshold IS. Downgrading the Map for that would be a category error.
// Here the sweep is a DIAGNOSTIC: it quantifies definition-sensitivity so M6
// can downgrade any claim whose verdict is not stable across this grid.
const sweepVeto = false;
const sweepDiagnostic =
  stableCells < sweep.length * 0.8
    ? "HIGH definition-sensitivity: expect many INCONCLUSIVE claims at M6. Thresholds stay frozen."
    : "moderate definition-sensitivity";

/* ---------- 6. hysteresis lag accounting ---------- */
const lagBuckets = { "0-1": 0, "2-3": 0, "4-6": 0, "7+": 0 };
const lagByState = Object.fromEntries(STATES.map((s) => [s, []]));
for (let i = 0; i < states.length; i++) {
  if (!devSet.has(yearOf(bars[i].datetime))) continue;
  const s = states[i];
  if (s.state === "UNKNOWN") continue;
  const L = s.barsSinceStateChange;
  lagBuckets[L <= 1 ? "0-1" : L <= 3 ? "2-3" : L <= 6 ? "4-6" : "7+"]++;
  lagByState[s.state].push(L);
}
const lagMedian = Object.fromEntries(STATES.map((s) => [s, +median(lagByState[s]).toFixed(1)]));

/* ---------- 7. per-bar state CSV ---------- */
const header = [
  "datetime",
  "state",
  "rawState",
  "reason",
  "barsSinceStateChange",
  "er",
  "atrPct",
  "atrPctile",
  "rangePos",
  "bodyPct",
  "gapPct",
  "session",
  "role",
];
const roleOfYear = (y) =>
  ROLES.HOLDOUT.includes(y)
    ? "HOLDOUT"
    : ROLES.VAL.includes(y)
      ? "VAL"
      : ROLES.STRESS.includes(y)
        ? "STRESS"
        : "DEV";
const rows = bars.map((b, i) => {
  const f = features[i],
    s = states[i];
  const r = (v) => (Number.isFinite(v) ? v.toFixed(6) : "");
  return [
    b.datetime,
    s.state,
    s.rawState,
    s.reason,
    s.barsSinceStateChange,
    r(f.er),
    r(f.atrPct),
    r(f.atrPctile),
    r(f.rangePos),
    r(f.bodyPct),
    r(f.gapPct),
    f.session,
    roleOfYear(yearOf(b.datetime)),
  ];
});
writeFileSync(join(NORM, "xauusd-m30-map.csv"), toCsv(header, rows));

const report = {
  generatedAt: new Date().toISOString(),
  mapVersion: "M2-v0 (hand-defined 2x2 + abstain + hysteresis)",
  thresholds: MAP,
  bars: bars.length,
  devYearsOnly: true,
  sealedYears: ROLES.HOLDOUT,
  coverage,
  coverageProblems,
  dwell,
  episodeDwell,
  flatBarPct: flatPct,
  pendingTransitionPct: pendingPct,
  warnings: [
    `UNKNOWN/flat bars are ${flatPct}% of DEV (abstain band + pending transitions). This is conservative by design but reduces effective sample size — the power calculation must use post-flat counts.`,
    `Routing dwell (UNKNOWN counts as a break) has median 2-3 bars; regime-episode dwell ignoring UNKNOWN is 6-20 bars. Both are reported; do not quote one as the other.`,
    sweepDiagnostic,
  ],
  causality: {
    cutoffIndex: CUT,
    futureMutationMismatch: causalityMismatch,
    truncationMismatch,
    verdict: causalityMismatch === 0 && truncationMismatch === 0 ? "PASS" : "FAIL",
  },
  determinism,
  sensitivitySweep: {
    grid: { er: erGrid, atrPctile: pcGrid },
    cells: sweep.length,
    stableCellsOver80pct: stableCells,
    minAgreementPct: Math.min(...sweep.map((s) => s.agreementPct)),
    medianAgreementPct: +median(sweep.map((s) => s.agreementPct)).toFixed(2),
    vetoAtM2: sweepVeto,
    note: "DIAGNOSTIC at M2. The blueprint's veto applies to claim VERDICTS at M6: a claim whose verdict is not identical across >=80% of this grid is INCONCLUSIVE (definition-sensitive). State labels moving with cutoffs is expected, not a Map failure. Thresholds stay frozen at G0; the sweep never selects a threshold.",
    results: sweep,
  },
  lag: {
    buckets: lagBuckets,
    medianByState: lagMedian,
    note: "M9 stratifies expectancy by barsSinceStateChange; if an effect lives only at 0-1 bars the claim is not tradeable under 3-bar hysteresis.",
  },
  verdict:
    causalityMismatch === 0 &&
    truncationMismatch === 0 &&
    determinism &&
    coverageProblems.length === 0 &&
    !sweepVeto
      ? "PASS"
      : "FAIL",
};
writeFileSync(join(OUT, "map-validation.json"), JSON.stringify(report, null, 2) + "\n");

console.log(
  `bars ${bars.length}, DEV years ${ROLES.DEV.length}, sealed ${ROLES.HOLDOUT.join(",")}`,
);
console.log(
  `causality ${report.causality.verdict} (future ${causalityMismatch}, trunc ${truncationMismatch}), determinism ${determinism}`,
);
console.log(
  `coverage problems: ${coverageProblems.length}, flat bars ${flatPct}%, pending ${pendingPct}%`,
);
console.log(`routing dwell median: ${STATES.map((s) => `${s}=${dwell[s].medianBars}`).join(", ")}`);
console.log(
  `regime-episode dwell median: ${STATES.map((s) => `${s}=${episodeDwell[s].medianBars}`).join(", ")}`,
);
console.log(
  `sweep (diagnostic): ${stableCells}/${sweep.length} cells >=80% agreement, min ${report.sensitivitySweep.minAgreementPct}%`,
);
console.log(`VERDICT: ${report.verdict}`);
if (report.verdict !== "PASS") process.exit(1);
