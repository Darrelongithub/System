#!/usr/bin/env node
/** G0 Amendment 8 Stage 3: 10 synthetic worlds per condition, full 25-grid pipeline. */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mulberry32 } from "./lib/placebo.mjs";
import { parseNaive, formatNaive } from "./lib/dst.mjs";
import { computeFeatures } from "./lib/map.mjs";
import { resolveTrade } from "./lib/trade.mjs";
import { volRegimeOf } from "./lib/cost.mjs";
import { emitSignals } from "./lib/signals.mjs";
import { MAP, EXIT_HARNESS } from "./frozen.mjs";
import { eligibleEntryRange } from "./lib/dev-segments.mjs";
import { buildDevPipeline, sweepBattery, CENTER_GRID_ID } from "./lib/dev-pipeline.mjs";
import { runBattery } from "./verify-claims.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ART = join(ROOT, "artifacts/map-compass");
const WORLDS = 10;
const BARS_PER_WORLD = Number(process.env.A8_REHEARSAL_BARS ?? 60000);
const SEGMENTS = 3;
const BARS_PER_SEGMENT = Math.floor(BARS_PER_WORLD / SEGMENTS);
const TARGET_CONSTANT_DRIFT_NET_R = 0.15;
const PLANTED_NET_R = 0.30;
const PLANTED_GROSS_R = 0.45;
const PLANTED_EDGE_BARS = 10;
const SIGMA = 0.65;
const starts = ["2004-01-05 01:00:00", "2009-01-05 01:00:00", "2013-01-07 01:00:00"];
const segmentNames = ["synthetic-2004", "synthetic-2009", "synthetic-2013"];
const randn = (rng) => {
  const u = Math.max(1e-12, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
};

function nextTradingBarTime(ms) {
  const next = ms + 30 * 60_000;
  const d = new Date(next);
  const minute = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (minute >= 60 && minute <= 23 * 60 + 30 && d.getUTCDay() !== 0 && d.getUTCDay() !== 6) return next;
  let day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 1, 0, 0);
  while ([0, 6].includes(new Date(day).getUTCDay())) day += 24 * 60 * 60_000;
  return day;
}

export function makeNoiseSegments({ seed, barsPerSegment = BARS_PER_SEGMENT, sigma = SIGMA }) {
  const rng = mulberry32(seed);
  return starts.map((start, si) => {
    let t = parseNaive(start);
    let prevClose = 2200;
    const noise = [];
    for (let i = 0; i < barsPerSegment; i++) {
      const delta = sigma * randn(rng);
      const wickUp = sigma * (0.25 + 0.75 * rng());
      const wickDown = sigma * (0.25 + 0.75 * rng());
      noise.push({ datetime: formatNaive(t), prevClose, delta, wickUp, wickDown, volume: 1 });
      prevClose += delta;
      t = nextTradingBarTime(t);
    }
    return { id: `${segmentNames[si]}-${seed}`, firstYear: Number(start.slice(0,4)), lastYear: null, noise };
  });
}

export function barsFromNoise(noiseSegments, { driftPerBar = 0, edgeBySegment = new Map() } = {}) {
  return noiseSegments.map((segment) => {
    const bars = [];
    let close = 2200;
    for (let i = 0; i < segment.noise.length; i++) {
      const n = segment.noise[i];
      const open = close;
      close = open + n.delta + driftPerBar + (edgeBySegment.get(segment.id)?.[i] ?? 0);
      bars.push({
        datetime: n.datetime,
        o: open,
        h: Math.max(open, close) + n.wickUp,
        l: Math.min(open, close) - n.wickDown,
        c: close,
        v: n.volume,
      });
    }
    const firstYear = Number(bars[0].datetime.slice(0,4));
    const lastYear = Number(bars.at(-1).datetime.slice(0,4));
    return { id: segment.id, firstYear, lastYear, bars };
  });
}

function hashSeed(seed, text) {
  let h = seed >>> 0;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h >>> 0;
}

function estimateLongControlNet(noiseSegments, driftPerBar) {
  const segments = barsFromNoise(noiseSegments, { driftPerBar });
  const m15Bars = makeSyntheticM15(segments, 88201);
  const m15ByTime = new Map(m15Bars.map(b => [b.datetime, b]));
  const nets = [];
  for (const segment of segments) {
    const features = computeFeatures(segment.bars, MAP);
    const range = eligibleEntryRange(segment.bars.length);
    const groups = new Map();
    for (let i = range.start; i < range.endExclusive; i++) {
      if (!(features[i]?.atr > 0)) continue;
      const b = segment.bars[i];
      const key = `${Number(b.datetime.slice(0,4))}|${features[i].session}|${volRegimeOf(b)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    }
    const m15ByM30 = new Map(segment.bars.map((b,i) => {
      const t = parseNaive(b.datetime);
      return [i, [m15ByTime.get(b.datetime), m15ByTime.get(formatNaive(t + 15*60_000))]];
    }));
    for (const [key, pool] of groups) {
      const rng = mulberry32(hashSeed(20261105, `${segment.id}|${key}|long`));
      for (let draw = 0; draw < 200; draw++) {
        const i = pool[Math.floor(rng() * pool.length)];
        const b = segment.bars[i];
        const resolved = resolveTrade(segment.bars, i, "long", features[i].atr, {
          session: features[i].session,
          vol: volRegimeOf(b),
          variant: "baseline",
          maxBars: EXIT_HARNESS.maxHoldBars,
          m15ByM30,
        });
        nets.push(resolved.netR);
      }
    }
  }
  return nets.length ? nets.reduce((a,b)=>a+b,0)/nets.length : -Infinity;
}

function calibrateUpDrift(seed) {
  const calibrationBarsPerSegment = BARS_PER_SEGMENT;
  const noise = makeNoiseSegments({ seed, barsPerSegment: calibrationBarsPerSegment, sigma: SIGMA });
  let lo = 0;
  let hi = SIGMA * 0.8;
  let loMean = estimateLongControlNet(noise, lo);
  let hiMean = estimateLongControlNet(noise, hi);
  for (let k = 0; k < 14 && hiMean < TARGET_CONSTANT_DRIFT_NET_R; k++) {
    hi *= 2;
    hiMean = estimateLongControlNet(noise, hi);
  }
  if (!(loMean <= TARGET_CONSTANT_DRIFT_NET_R && hiMean >= TARGET_CONSTANT_DRIFT_NET_R)) {
    return { driftPerBar: hi, expectedNetR: hiMean, bracketed: false, calibrationBarsPerSegment };
  }
  for (let k = 0; k < 14; k++) {
    const mid = (lo + hi) / 2;
    const m = estimateLongControlNet(noise, mid);
    if (m < TARGET_CONSTANT_DRIFT_NET_R) lo = mid;
    else hi = mid;
  }
  const driftPerBar = (lo + hi) / 2;
  return { driftPerBar, expectedNetR: estimateLongControlNet(noise, driftPerBar), bracketed: true, calibrationBarsPerSegment };
}

export function plantDonchianEdge(noiseSegments, seed) {
  const base = barsFromNoise(noiseSegments);
  const edgeBySegment = new Map();
  let signalCount = 0;
  let atrValues = [];
  for (const segment of base) {
    const features = computeFeatures(segment.bars, MAP);
    const range = eligibleEntryRange(segment.bars.length);
    const signals = emitSignals(segment.bars, "donchian-20", { start: range.start, end: range.endExclusive });
    const edge = new Float64Array(segment.bars.length);
    for (const s of signals) {
      const atr = features[s.index]?.atr;
      if (!(atr > 0)) continue;
      signalCount++;
      atrValues.push(atr);
      const perBar = (PLANTED_GROSS_R * EXIT_HARNESS.stopAtrMultiple * atr) / PLANTED_EDGE_BARS;
      const direction = s.side === "long" ? 1 : -1;
      for (let j = 1; j <= PLANTED_EDGE_BARS && s.index + j < edge.length; j++) {
        const k = s.index + j;
        edge[k] = Math.max(-perBar, Math.min(perBar, edge[k] + direction * perBar));
      }
    }
    edgeBySegment.set(segment.id, edge);
  }
  const planted = barsFromNoise(noiseSegments, { edgeBySegment });
  const actualSignals = planted.reduce((n,s)=>n+emitSignals(s.bars,"donchian-20",{start:eligibleEntryRange(s.bars.length).start,end:eligibleEntryRange(s.bars.length).endExclusive}).length,0);
  return {
    segments: planted,
    metadata: {
      plantedSignalCount: signalCount,
      postMutationDonchianSignalCount: actualSignals,
      targetGrossR: PLANTED_GROSS_R,
      targetNetR: PLANTED_NET_R,
      edgeBars: PLANTED_EDGE_BARS,
      generatorSize: "per-bar added return = 0.45 × frozen stop multiple (1.5 ATR) × signal-bar ATR / 10 bars; signed by Donchian signal direction. This targets about +0.30R net after the frozen synthetic cost scale. Overlapping impulses are clipped to ±one signal's per-bar contribution, not summed.",
      meanSignalAtr: atrValues.length ? atrValues.reduce((a,b)=>a+b,0)/atrValues.length : null,
      meanAddedDriftPricePerBar: atrValues.length ? (PLANTED_GROSS_R * EXIT_HARNESS.stopAtrMultiple * (atrValues.reduce((a,b)=>a+b,0)/atrValues.length))/PLANTED_EDGE_BARS : null,
      seed,
    },
  };
}

export function makeSyntheticM15(segments, seed) {
  const rng = mulberry32(seed);
  const out = [];
  for (const segment of segments) {
    for (const b of segment.bars) {
      const mid = (b.o + b.c) / 2;
      const firstGetsHigh = rng() < 0.5;
      const firstGetsLow = rng() < 0.5;
      const s1 = {
        datetime: b.datetime,
        o: b.o,
        h: firstGetsHigh ? b.h : Math.max(b.o, mid),
        l: firstGetsLow ? b.l : Math.min(b.o, mid),
        c: mid,
        v: 1,
      };
      const next = parseNaive(b.datetime) + 15 * 60_000;
      const s2 = {
        datetime: formatNaive(next),
        o: mid,
        h: firstGetsHigh ? Math.max(mid, b.c) : b.h,
        l: firstGetsLow ? Math.min(mid, b.c) : b.l,
        c: b.c,
        v: 1,
      };
      out.push(s1, s2);
    }
  }
  return out;
}

function strategyConfirmedCards(rows) {
  return [...new Set(rows.filter((r) => r.strategyLevel?.verdict === "CONFIRMED").map((r) => r.claimId))];
}
function cellCountsPassingNetNotExcess(rows) {
  const x = rows.filter((r) => r.stats.rule.netGatePass && !r.stats.rule.controlGatePass).length;
  return { count: x, share: rows.length ? x / rows.length : 0 };
}

function runWorld(condition, world, seed, drift) {
  const noise = makeNoiseSegments({ seed });
  let segments;
  let plant = null;
  if (condition === "A_ZERO_DRIFT") segments = barsFromNoise(noise);
  else if (condition === "B_CONSTANT_UP_DRIFT") segments = barsFromNoise(noise, { driftPerBar: drift.driftPerBar });
  else {
    const planted = plantDonchianEdge(noise, seed);
    segments = planted.segments;
    plant = planted.metadata;
  }
  const m15Bars = makeSyntheticM15(segments, seed + 71);
  const pipeline = buildDevPipeline({ segments, m15Bars, randomSeed: 20261105 + seed });
  const sweep = sweepBattery(pipeline, runBattery);
  const rows = sweep.results.get(CENTER_GRID_ID);
  const confirmedCards = strategyConfirmedCards(rows);
  const randomLong = pipeline.randomTrades.filter(t=>t.side==="long").map(t=>t.netR);
  const donchianTrades = pipeline.centerTrades.filter(t=>t.strategyId==="donchian-20");
  const netNotExcess = cellCountsPassingNetNotExcess(rows);
  const donchianStrength = rows.find(r=>r.claimId==="donchian-20"&&r.kind==="strength");
  const nonDonchianConfirmed = confirmedCards.filter(id=>id!=="donchian-20");
  return {
    condition,
    world,
    seed,
    bars: segments.reduce((n,s)=>n+s.bars.length,0),
    barsPerSegment: segments.map(s=>s.bars.length),
    randomLongMeanNetR: randomLong.length?randomLong.reduce((a,b)=>a+b,0)/randomLong.length:null,
    cardConfirmedCount: confirmedCards.length,
    confirmedCards,
    confirmedClaimCells: rows.filter(r=>r.verdict==="CONFIRMED").length,
    netPassButExcessFailCells: netNotExcess.count,
    netPassButExcessFailShare: netNotExcess.share,
    donchian20StrengthVerdict: donchianStrength?.strategyLevel?.verdict ?? "INCONCLUSIVE",
    donchian20OfficialFamilyVerdict: donchianStrength?.verdict ?? "INCONCLUSIVE",
    donchian20TradeCount: donchianTrades.length,
    donchian20GrossMeanR: donchianTrades.length?donchianTrades.reduce((a,t)=>a+t.grossR,0)/donchianTrades.length:null,
    donchian20NetMeanR: donchianTrades.length?donchianTrades.reduce((a,t)=>a+t.netR,0)/donchianTrades.length:null,
    nonDonchianConfirmedCount: nonDonchianConfirmed.length,
    nonDonchianConfirmedCards: nonDonchianConfirmed,
    plantedEdge: plant,
    safety: pipeline.diagnostics,
  };
}

function average(xs) { const a=xs.filter(Number.isFinite); return a.length?a.reduce((x,y)=>x+y,0)/a.length:null; }
function summarize(condition, rows) {
  const confirms=rows.map(x=>x.cardConfirmedCount);
  return {
    condition,
    worlds: rows.length,
    meanConfirmedCards: average(confirms),
    maxConfirmedCards: Math.max(...confirms),
    meanConfirmedClaimCells: average(rows.map(x=>x.confirmedClaimCells)),
    meanNetPassButExcessFailShare: average(rows.map(x=>x.netPassButExcessFailShare)),
    meanRandomLongNetR: average(rows.map(x=>x.randomLongMeanNetR)),
    donchian20ConfirmedWorlds: rows.filter(x=>x.donchian20StrengthVerdict==="CONFIRMED").length,
    meanDonchian20GrossR: average(rows.map(x=>x.donchian20GrossMeanR)),
    meanDonchian20NetR: average(rows.map(x=>x.donchian20NetMeanR)),
    meanNonDonchianConfirmedCards: average(rows.map(x=>x.nonDonchianConfirmedCount)),
    maxNonDonchianConfirmedCards: Math.max(...rows.map(x=>x.nonDonchianConfirmedCount)),
  };
}

export function runRehearsal() {
  if (BARS_PER_WORLD % SEGMENTS !== 0) throw new Error("A8_REHEARSAL_BARS must divide evenly into 3 segments");
  const drift = calibrateUpDrift(20261105);
  const details = [];
  for (const condition of ["A_ZERO_DRIFT", "B_CONSTANT_UP_DRIFT", "C_DONCHIAN20_PLANTED_EDGE"]) {
    for (let world = 0; world < WORLDS; world++) {
      const seed = 20261106 + ["A_ZERO_DRIFT","B_CONSTANT_UP_DRIFT","C_DONCHIAN20_PLANTED_EDGE"].indexOf(condition) * 1000 + world;
      details.push(runWorld(condition, world + 1, seed, drift));
      if (global.gc) global.gc();
    }
  }
  const groups = Object.fromEntries(["A_ZERO_DRIFT","B_CONSTANT_UP_DRIFT","C_DONCHIAN20_PLANTED_EDGE"].map(c=>[c,details.filter(x=>x.condition===c)]));
  const summary = Object.fromEntries(Object.entries(groups).map(([c,rows])=>[c,summarize(c,rows)]));
  const conditionA=summary.A_ZERO_DRIFT;
  const conditionB=summary.B_CONSTANT_UP_DRIFT;
  const conditionC=summary.C_DONCHIAN20_PLANTED_EDGE;
  const meanPlantedGross=conditionC.meanDonchian20GrossR;
  const plantedTarget=PLANTED_GROSS_R;
  const criteria = {
    A_meanConfirmedCardsAtMostHalf: conditionA.meanConfirmedCards <= 0.5,
    A_noWorldAboveTwo: conditionA.maxConfirmedCards <= 2,
    B_meanConfirmedCardsAtMostHalf: conditionB.meanConfirmedCards <= 0.5,
    B_noWorldAboveTwo: conditionB.maxConfirmedCards <= 2,
    C_donchian20ConfirmedAtLeastEightOfTen: conditionC.donchian20ConfirmedWorlds >= 8,
    C_meanDonchianGrossWithin005R: meanPlantedGross != null && Math.abs(meanPlantedGross - plantedTarget) <= 0.05,
    C_otherCardsMeanAtMostHalfPerWorld: conditionC.meanNonDonchianConfirmedCards <= 0.5,
  };
  const pass = Object.values(criteria).every(Boolean);
  const report = {
    generatedAt: new Date().toISOString(),
    stage: "A8_STAGE_3_SYNTHETIC_DRESS_REHEARSAL",
    pass,
    worldsPerCondition: WORLDS,
    barsPerWorld: BARS_PER_WORLD,
    barsPerSegment: BARS_PER_SEGMENT,
    segmentCount: SEGMENTS,
    pipeline: "full real pipeline: 25 Map grids, causal signals, independent one-slot books, frozen exit/cost/gap fills, deterministic matched random control, family/strategy verification and sensitivity sweep",
    generator: {
      clock: "M30 EAT 01:00-23:30 Monday-Friday, sessions assigned by the frozen EAT clock; weekends skipped; three isolated segments with non-DEV holes between them",
      startDates: starts,
      basePrice: 2200,
      gaussianPerBarNoiseSigmaPrice: SIGMA,
      conditionB: { targetRandomLongNetR: TARGET_CONSTANT_DRIFT_NET_R, ...drift, measuredWorldMeans: details.filter(x=>x.condition==="B_CONSTANT_UP_DRIFT").map(x=>x.randomLongMeanNetR) },
      conditionC: { plantedTargetGrossR: PLANTED_GROSS_R, plantedTargetNetR: PLANTED_NET_R, edgeBars: PLANTED_EDGE_BARS, generatorSize: "after each eligible Donchian20 signal, add a signed return of 0.45 × 1.5 ATR / 10 to each of the next 10 bars; this targets about +0.30R net after frozen costs; overlapping impulses are clipped at one impulse per bar.", worldPlantedSignalCounts: details.filter(x=>x.condition==="C_DONCHIAN20_PLANTED_EDGE").map(x=>x.plantedEdge?.plantedSignalCount) },
    },
    preRegisteredCriteria: criteria,
    summary,
    table: details,
  };
  writeFileSync(join(ART,"a8-dress-rehearsal.json"),JSON.stringify(report,null,2)+"\n");
  const md=[
    "# G0 Amendment 8 — synthetic dress rehearsal (Stage 3)",
    "",
    `Generated ${report.generatedAt}. **Synthetic only; no real strategy outcomes. Result: ${pass?"PASS":"FAIL"}.**`,
    "",
    `- Worlds: ${WORLDS} per condition (30 total); ${BARS_PER_WORLD.toLocaleString()} M30 bars/world (${BARS_PER_SEGMENT.toLocaleString()} per segment); three isolated segments with holes; every world ran all 25 grid cells and the full A8 pipeline.`,
    `- Condition B generator drift: ${drift.driftPerBar.toFixed(8)} price units/bar; calibration mean random-long net ${drift.expectedNetR.toFixed(4)}R; target ${TARGET_CONSTANT_DRIFT_NET_R.toFixed(2)}R.`,
    `- Condition C planted edge: ${PLANTED_GROSS_R.toFixed(2)}R gross by construction (target about ${PLANTED_NET_R.toFixed(2)}R net) over ${PLANTED_EDGE_BARS} bars; mean Donchian20 gross ${meanPlantedGross==null?"—":meanPlantedGross.toFixed(4)}R.`,
    "- Card false-confirm counts use each card's strategy-level diagnostic verdict; official center results remain family-pooled. Condition B's net/excess gate share uses official family claim cells.",
    "",
    "## Full rehearsal table (one row per world)",
    "",
    "| Condition | World | Seed | Bars | Cards CONFIRMED | Claim cells CONFIRMED | Random-long net R | Net pass / excess fail | Donchian20 strength | Donchian20 gross R | Donchian20 net R | Other confirmed cards | Planted signals |",
    "|---|--:|--:|--:|--:|--:|--:|--:|---|--:|--:|--:|--:|",
    ...details.map(x=>`| ${x.condition} | ${x.world} | ${x.seed} | ${x.bars} | ${x.cardConfirmedCount} | ${x.confirmedClaimCells} | ${x.randomLongMeanNetR?.toFixed(4)??"—"} | ${x.netPassButExcessFailCells} (${(100*x.netPassButExcessFailShare).toFixed(1)}%) | ${x.donchian20StrengthVerdict} | ${x.donchian20GrossMeanR?.toFixed(4)??"—"} | ${x.donchian20NetMeanR?.toFixed(4)??"—"} | ${x.nonDonchianConfirmedCount} | ${x.plantedEdge?.plantedSignalCount??"—"} |`),
    "",
    "## Condition summary and pass criteria",
    "",
    "| Condition | Mean confirmed cards/world | Max | B net-pass/excess-fail share | Random-long mean R | Donchian20 confirmed worlds | Donchian20 gross mean R | Donchian20 net mean R | Other cards mean / max |",
    "|---|--:|--:|--:|--:|--:|--:|--:|--:|",
    ...Object.values(summary).map(x=>`| ${x.condition} | ${x.meanConfirmedCards.toFixed(3)} | ${x.maxConfirmedCards} | ${x.meanNetPassButExcessFailShare==null?"—":`${(100*x.meanNetPassButExcessFailShare).toFixed(1)}%`} | ${x.meanRandomLongNetR?.toFixed(4)??"—"} | ${x.donchian20ConfirmedWorlds}/10 | ${x.meanDonchian20GrossR?.toFixed(4)??"—"} | ${x.meanDonchian20NetR?.toFixed(4)??"—"} | ${x.meanNonDonchianConfirmedCards.toFixed(3)} / ${x.maxNonDonchianConfirmedCards} |`),
    "",
    "| Preregistered criterion | Result |",
    "|---|---|",
    ...Object.entries(criteria).map(([k,v])=>`| ${k} | ${v?"PASS":"FAIL"} |`),
    "",
    "**Overall:** " + (pass?"PASS — Stage 4 may proceed after this Stage 3 commit is pushed and remote-verified.":"FAIL — stop here; do not run real verification."),
    "",
    "Full per-world pipeline output: `artifacts/map-compass/a8-dress-rehearsal.json`.",
    "",
  ].join("\n");
  writeFileSync(join(ROOT,"docs/G0-AMENDMENT-8-DRESS-REHEARSAL.md"),md);
  console.log(md);
  return report;
}

if(process.argv[1]?.replace(/\\/g,"/").endsWith("a8-dress-rehearsal.mjs")) {
  try { runRehearsal(); }
  catch(e) { console.error(`A8 rehearsal failed: ${e.stack??e.message}`); process.exit(2); }
}
