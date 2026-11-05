#!/usr/bin/env node
/**
 * G0 AMENDMENT 8/9 — STAGE 2 build report.
 *
 * Runs the A8 segmentation machinery over the REAL normalised bars and prints
 * the Stage 2 required tables:
 *   - segment definitions,
 *   - bars per segment and per year,
 *   - bars lost to warm-up and tails,
 *   - (report only) share of DEV bars where the segment Map agrees with the old
 *     continuous Map after warm-up,
 *   - which of the 44 sampled spread months fall in sealed years (cost data).
 *
 * It writes NO claim verdict and NO trade outcome. It is a build/structural
 * report, not a strategy result. Nothing here reads VAL, HOLDOUT or STRESS
 * price bars: sealed bars are located, counted and dropped.
 *
 * Usage: node scripts/map-compass/a8-segments-report.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { dataLines, num } from "./lib/csv.mjs";
import { MAP, ROLES, DEV_SEGMENTS, SEGMENT_WARMUP_BARS, SEGMENT_TAIL_BARS, SWEEP_GRID } from "./frozen.mjs";
import { buildMap } from "./lib/map.mjs";
import { buildSegmentBundle, SEGMENT_INVARIANTS, sweepCells } from "./lib/segments.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const NORM = join(ROOT, "artifacts/map-compass/normalized");
const OUT = join(ROOT, "artifacts/map-compass/a8");

function loadBars(name) {
  const bars = [];
  for (const f of dataLines(readFileSync(join(NORM, name), "utf8"), { delimiter: "," })) {
    if (f[0] === "datetime") continue;
    const o = num(f[1]), h = num(f[2]), l = num(f[3]), c = num(f[4]);
    if (o === undefined || h === undefined || l === undefined || c === undefined) continue;
    bars.push({ datetime: f[0], o, h, l, c, v: num(f[5]) ?? 0 });
  }
  return bars;
}

const bars = loadBars("xauusd-m30-eat.csv");
const bundle = buildSegmentBundle(bars);

// ---- 1. Segment definitions ------------------------------------------------
const segmentTable = DEV_SEGMENTS.map((d) => {
  const seg = bundle.segments.find((s) => s.id === d.id);
  return {
    id: d.id,
    years: d.years.join(", "),
    bars: seg ? seg.bars.length : 0,
    firstDatetime: seg ? seg.bars[0].datetime : null,
    lastDatetime: seg ? seg.bars[seg.bars.length - 1].datetime : null,
    warmupLost: Math.min(SEGMENT_WARMUP_BARS, seg ? seg.bars.length : 0),
    tailLost: Math.min(SEGMENT_TAIL_BARS, seg ? seg.bars.length : 0),
    eligibleBars: seg ? seg.window.eligible : 0,
  };
});

// ---- 2. Bars per year ------------------------------------------------------
const allYears = [...ROLES.DEV, ...ROLES.HOLDOUT, ...ROLES.VAL, ...ROLES.STRESS].sort();
const yearTable = allYears.map((y) => {
  const role = ROLES.DEV.includes(y)
    ? "DEV"
    : ROLES.HOLDOUT.includes(y)
      ? "HOLDOUT_SEALED"
      : ROLES.VAL.includes(y)
        ? "VAL"
        : "STRESS";
  const segId = DEV_SEGMENTS.find((s) => s.years.includes(y))?.id ?? null;
  const seg = segId ? bundle.segments.find((s) => s.id === segId) : null;
  const inSeg = seg ? (seg.barsPerYear[y] ?? 0) : 0;
  // Bars present in the file for this year, whether or not readable.
  let fileBars = 0;
  for (const b of bars) if (Number(String(b.datetime).slice(0, 4)) === y) fileBars++;
  return { year: y, role, segment: segId, barsInFile: fileBars, barsReadable: inSeg, barsDropped: fileBars - inSeg };
});

const readableTotal = yearTable.filter((r) => r.role === "DEV").reduce((a, r) => a + r.barsReadable, 0);
const droppedTotal = yearTable.reduce((a, r) => a + r.barsDropped, 0);

// ---- 3. Warm-up / tail losses ---------------------------------------------
const losses = bundle.segments.map((seg) => ({
  segmentId: seg.id,
  bars: seg.bars.length,
  warmupLost: Math.min(SEGMENT_WARMUP_BARS, seg.bars.length),
  tailLost: Math.min(SEGMENT_TAIL_BARS, seg.bars.length),
  ineligible: seg.bars.length - seg.window.eligible,
  eligible: seg.window.eligible,
  eligiblePct: seg.bars.length ? +((seg.window.eligible / seg.bars.length) * 100).toFixed(2) : 0,
}));

// ---- 4. Segmented Map vs old continuous Map (REPORT ONLY) -----------------
// The old continuous Map is built over the whole DEV-only span as one series.
const devOnlyBars = [];
const devOnlyGlobalIdx = [];
for (let g = 0; g < bars.length; g++) {
  const y = Number(String(bars[g].datetime).slice(0, 4));
  if (ROLES.DEV.includes(y) && !ROLES.HOLDOUT.includes(y)) {
    devOnlyBars.push(bars[g]);
    devOnlyGlobalIdx.push(g);
  }
}
const continuous = buildMap(devOnlyBars, MAP);

let agree = 0, compared = 0;
const fourStateCross = {};
for (const seg of bundle.segments) {
  const { first } = seg.window;
  for (let i = first; i < seg.bars.length; i++) {
    const g = seg.globalIndex[i];
    const posInContinuous = devOnlyGlobalIdx.indexOf(g);
    if (posInContinuous < 0) continue; // cannot happen; guards a silent mismatch
    const a = seg.states[i].state;
    const b = continuous.states[posInContinuous].state;
    compared++;
    if (a === b) agree++;
    const k = `${b} -> ${a}`;
    fourStateCross[k] = (fourStateCross[k] ?? 0) + 1;
  }
}
const agreement = {
  comparedBars: compared,
  agreeBars: agree,
  agreePct: compared ? +((agree / compared) * 100).toFixed(2) : 0,
  crossTab: fourStateCross,
  note:
    "REPORT ONLY. The segmented Map recomputes features inside each segment, so it loses up to 1,000 warm-up bars per segment and cannot match the continuous Map before that point. Disagreement after warm-up is expected at segment starts (different trailing windows) and is not used by any verdict.",
};

// ---- 5. Sealed-year spread months (COST DATA ONLY) ------------------------
const spread = JSON.parse(readFileSync(join(ROOT, "artifacts/map-compass/spread-table.json"), "utf8"));
const pins = JSON.parse(readFileSync(join(ROOT, "scripts/map-compass/pins.json"), "utf8"));
const spreadMonths = [
  ...new Set(
    Object.keys(pins)
      .filter((k) => /^(bid|ask)_\d{4}_\d{2}$/.test(k))
      .map((k) => k.split("_").slice(1).join("-")),
  ),
].sort();
const monthTable = spreadMonths.map((m) => {
  const y = Number(m.slice(0, 4));
  return {
    month: m,
    role: ROLES.DEV.includes(y)
      ? "DEV"
      : ROLES.HOLDOUT.includes(y)
        ? "HOLDOUT_SEALED"
        : ROLES.VAL.includes(y)
          ? "VAL"
          : "STRESS",
  };
});
const inSealed = monthTable.filter((m) => m.role === "HOLDOUT_SEALED").map((m) => m.month);

// ---- Write + print --------------------------------------------------------
const report = {
  generatedAt: new Date().toISOString(),
  stage: "STAGE 2 BUILD (A8/A9 segmentation)",
  strategyResults: "NONE — this report contains no trade outcome or verdict",
  constants: {
    MAP,
    DEV_SEGMENTS,
    SEGMENT_WARMUP_BARS,
    SEGMENT_TAIL_BARS,
    SWEEP_GRID,
    roleYears: ROLES,
  },
  invariants: SEGMENT_INVARIANTS,
  totals: {
    barsInFile: bars.length,
    readableDevBars: readableTotal,
    droppedNonDevBars: droppedTotal,
    sealedBarsDropped: bundle.dropped.sealedBars,
    holes: bundle.dropped.holes,
  },
  segmentTable,
  yearTable,
  losses,
  mapAgreement: agreement,
  sweepGridCells: sweepCells(),
  spreadMonths: { total: spreadMonths.length, source: spread.source, months: monthTable, inSealedYears: inSealed },
};

writeFileSync(join(OUT, "segments.json"), JSON.stringify(report, null, 2) + "\n");

const p = (s) => console.log(s);
p("=== STAGE 2 — A8/A9 SEGMENT BUILD REPORT (no strategy result) ===");
p(`bars in file: ${bars.length} | readable DEV: ${readableTotal} | dropped non-DEV: ${droppedTotal} (sealed: ${bundle.dropped.sealedBars})`);
p("");
p("SEGMENT DEFINITIONS");
p("id  years         bars   first                 last                  warmupLost tailLost eligible");
for (const s of segmentTable) {
  p(
    `${s.id}  ${s.years.padEnd(13)} ${String(s.bars).padStart(6)} ${String(s.firstDatetime).padEnd(21)} ${String(s.lastDatetime).padEnd(21)} ${String(s.warmupLost).padStart(10)} ${String(s.tailLost).padStart(8)} ${String(s.eligibleBars).padStart(8)}`,
  );
}
p("");
p("BARS PER YEAR (readable DEV only; all other roles counted then dropped)");
p("year  role            segment  inFile   readable  dropped");
for (const r of yearTable) {
  p(`${r.year}  ${r.role.padEnd(15)} ${String(r.segment ?? "-").padEnd(7)} ${String(r.barsInFile).padStart(7)} ${String(r.barsReadable).padStart(10)} ${String(r.barsDropped).padStart(8)}`);
}
p("");
p("BARS LOST TO WARM-UP AND TAILS");
p("segment  bars    warmupLost  tailLost  ineligible  eligible  eligible%");
for (const l of losses) {
  p(`${l.segmentId.padEnd(8)} ${String(l.bars).padStart(6)} ${String(l.warmupLost).padStart(11)} ${String(l.tailLost).padStart(9)} ${String(l.ineligible).padStart(11)} ${String(l.eligible).padStart(9)} ${String(l.eligiblePct).padStart(9)}`);
}
p("");
p("SEGMENTED MAP vs OLD CONTINUOUS MAP (REPORT ONLY)");
p(`compared bars: ${agreement.comparedBars} | agree: ${agreement.agreeBars} | agreement: ${agreement.agreePct}%`);
p("cross-tab (continuous -> segmented):");
for (const k of Object.keys(agreement.crossTab).sort()) p(`  ${k.padEnd(24)} ${agreement.crossTab[k]}`);
p("");
p("SWEEP GRID (Method 2)");
p(`ER x ATR%: ${SWEEP_GRID.erCutoffs.join(", ")} x ${SWEEP_GRID.atrPctileCutoffs.join(", ")} = ${sweepCells().length} cells`);
p(`centre: ER ${SWEEP_GRID.center.erCutoff} x ATR% ${SWEEP_GRID.center.atrPctileCutoff}`);
p("");
p("SAMPLED SPREAD MONTHS — SEALED-YEAR DECLARATION (COST DATA ONLY, NOT AN OUTCOME)");
p(`total sampled months: ${spreadMonths.length}`);
p(`in sealed years: ${inSealed.length} -> ${inSealed.join(", ") || "none"}`);
p(`in DEV years: ${monthTable.filter((m) => m.role === "DEV").length}`);
p(`in VAL years: ${monthTable.filter((m) => m.role === "VAL").length}`);
p(`in STRESS years: ${monthTable.filter((m) => m.role === "STRESS").length}`);
p("");
p(`wrote ${join(OUT, "segments.json")}`);
