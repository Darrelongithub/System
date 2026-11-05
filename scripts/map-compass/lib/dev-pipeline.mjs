import { CLAIM_CARDS } from "../claim-cards.draft.mjs";
import { MAP, ROLES, EXIT_HARNESS, VERDICT_STATE_OF } from "../frozen.mjs";
import { computeFeatures, classify } from "./map.mjs";
import { emitSignals } from "./signals.mjs";
import { evaluateBook, resolveTrade } from "./trade.mjs";
import { volRegimeOf } from "./cost.mjs";
import { sessionOfEat } from "./dst.mjs";
import { mulberry32 } from "./placebo.mjs";
import { eligibleEntryRange, mapDevSegments, splitDevSegments, m15MapForSegment, yearOf } from "./dev-segments.mjs";
import { applySensitivityGrade } from "./verification.mjs";

export const SWEEP_ER = Object.freeze([0.25, 0.3, 0.35, 0.4, 0.45]);
export const SWEEP_ATR_PCTILE = Object.freeze([60, 65, 70, 75, 80]);
export const SWEEP_GRID = Object.freeze(SWEEP_ER.flatMap((er) => SWEEP_ATR_PCTILE.map((atrPctile) => Object.freeze({
  erCutoff: er,
  atrPctileCutoff: atrPctile,
  id: `ER${er.toFixed(2)}_ATR${atrPctile}`,
}))));
export const CENTER_GRID_ID = "ER0.35_ATR70";
export const RANDOM_ENTRIES_PER_YEAR_SESSION_VOL_SIDE = 200;
export const RANDOM_BASELINE_SEED = 20261105;

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
const sampleSd = (values) => {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, x) => s + (x - m) ** 2, 0) / (values.length - 1));
};
const cellKey = (xs) => xs.join("|");
const hashSeed = (seed, text) => {
  let h = seed >>> 0;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h >>> 0;
};

function attachState(record, states) {
  const state = states[record.localIndex] ?? "UNKNOWN";
  return { ...record, state, verdictState: VERDICT_STATE_OF[state] ?? null };
}

function normalizeStrategyTrade(segment, card, resolved, signal, signalIndex) {
  const bar = segment.bars[signalIndex];
  return {
    strategyId: card.id,
    family: card.family,
    priority: card.priority,
    side: signal.side,
    session: signal.session,
    vol: volRegimeOf(bar),
    year: yearOf(bar),
    day: bar.datetime.slice(0, 10),
    entryBar: bar.datetime,
    entryDatetime: bar.datetime,
    localIndex: signalIndex,
    globalIndex: (segment.globalStart ?? 0) + signalIndex,
    segmentId: segment.id,
    segmentLength: segment.bars.length,
    state: signal.fourState ?? "UNKNOWN",
    verdictState: signal.verdictState ?? null,
    ...resolved,
    exitDatetime: segment.bars[resolved.exitIndex]?.datetime ?? null,
    exitGlobalIndex: (segment.globalStart ?? 0) + resolved.exitIndex,
  };
}

function generateCardTrades(segment, features, centerStates, m15ByM30) {
  const range = eligibleEntryRange(segment.bars.length);
  if (!range.count) return { trades: [], emitted: 0, blockedBySlot: 0, invalidAtr: 0 };
  const stateLabels = centerStates.map((state) => state);
  const signals = [];
  for (const card of CLAIM_CARDS) {
    const emitted = emitSignals(segment.bars, card.id, {
      states: stateLabels,
      start: range.start,
      end: range.endExclusive,
    });
    const candidates = emitted.map((s) => ({
      ...s,
      strategyId: card.id,
      priority: card.priority,
      atr: features[s.index]?.atr,
      vol: volRegimeOf(segment.bars[s.index]),
    }));
    const book = evaluateBook(segment.bars, candidates, {
      m15ByM30,
      variant: "baseline",
      maxBars: EXIT_HARNESS.maxHoldBars,
    });
    const signalByIndex = new Map(candidates.map((s) => [s.index, s]));
    for (const t of book.trades) signals.push(normalizeStrategyTrade(segment, card, t, signalByIndex.get(t.index), t.index));
    // Counters stay card-specific so no cross-card blocking is introduced.
    cardTradeStats.set(`${segment.id}|${card.id}`, {
      emitted: candidates.length,
      kept: book.trades.length,
      blockedBySlot: book.rejected.slot,
      invalidAtr: book.rejected.invalid,
    });
  }
  return { trades: signals };
}

// Per-call state only; avoids caching signal/outcome artifacts between worlds.
let cardTradeStats = new Map();

function randomCandidateRecords(segments, segmentFeatures, segmentM15, { seed = RANDOM_BASELINE_SEED, entriesPerGroup = RANDOM_ENTRIES_PER_YEAR_SESSION_VOL_SIDE } = {}) {
  const records = [];
  const sampleAudit = [];
  for (let si = 0; si < segments.length; si++) {
    const segment = segments[si];
    const features = segmentFeatures[si];
    const range = eligibleEntryRange(segment.bars.length);
    const groups = new Map();
    for (let i = range.start; i < range.endExclusive; i++) {
      const b = segment.bars[i];
      const f = features[i];
      if (!Number.isFinite(f?.atr) || f.atr <= 0) continue;
      const key = cellKey([yearOf(b), f.session || sessionOfEat(b.datetime), volRegimeOf(b)]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    }
    for (const [key, pool] of groups) {
      const [yearText, session, vol] = key.split("|");
      const year = Number(yearText);
      for (const side of ["long", "short"]) {
        const rng = mulberry32(hashSeed(seed, `${segment.id}|${key}|${side}`));
        for (let draw = 0; draw < entriesPerGroup; draw++) {
          const localIndex = pool[Math.floor(rng() * pool.length)];
          const bar = segment.bars[localIndex];
          const resolved = resolveTrade(segment.bars, localIndex, side, features[localIndex].atr, {
            m15ByM30: segmentM15[si],
            session,
            vol,
            variant: "baseline",
            maxBars: EXIT_HARNESS.maxHoldBars,
          });
          const rec = {
            strategyId: "__matched_random__",
            family: "__matched_random__",
            side,
            session,
            vol,
            year,
            day: bar.datetime.slice(0, 10),
            entryBar: bar.datetime,
            entryDatetime: bar.datetime,
            localIndex,
            globalIndex: (segment.globalStart ?? 0) + localIndex,
            segmentId: segment.id,
            segmentLength: segment.bars.length,
            state: "UNKNOWN",
            verdictState: null,
            randomDraw: draw,
            randomSeed: hashSeed(seed, `${segment.id}|${key}|${side}`),
            ...resolved,
            exitDatetime: segment.bars[resolved.exitIndex]?.datetime ?? null,
            exitGlobalIndex: (segment.globalStart ?? 0) + resolved.exitIndex,
          };
          records.push(rec);
        }
      }
      sampleAudit.push({ segmentId: segment.id, year, session, vol, candidateBars: pool.length, entriesPerSide: entriesPerGroup });
    }
  }
  return { records, sampleAudit };
}

function remapRecords(records, statesBySegment) {
  return records.map((r) => attachState(r, statesBySegment.get(r.segmentId)));
}

/** Build the frozen matched-baseline lookup tables from one grid's common random entries. */
export function baselineForGrid(randomEntries) {
  const all = randomEntries.filter((t) => t.state !== "UNKNOWN" && t.verdictState && Number.isFinite(t.netR));
  const fineV = new Map();
  const fine4 = new Map();
  const coarse = new Map();
  const year = new Map();
  const push = (map, key, trade) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(trade.netR);
  };
  for (const t of all) {
    push(fineV, cellKey([t.verdictState, t.side, t.session, t.vol]), t);
    push(fine4, cellKey([t.state, t.side, t.session, t.vol]), t);
    push(coarse, cellKey([t.state, t.side]), t);
    push(year, cellKey([t.verdictState, t.side, t.session, t.vol, t.year]), t);
  }
  const table = (m, minN = 200) => Object.fromEntries([...m.entries()].map(([k, values]) => [k, {
    n: values.length,
    meanNetR: +mean(values).toFixed(9),
    sdNetR: +sampleSd(values).toFixed(9),
    sufficient: values.length >= minN,
  }]));
  const yearMatchedCells = Object.fromEntries([...year.entries()].map(([k, values]) => [k, {
    n: values.length,
    meanNetR: +mean(values).toFixed(9),
    baselineSamplingSe: values.length > 1 ? sampleSd(values) / Math.sqrt(values.length) : null,
    source: "A8_common_deterministic_random_entries",
  }]));
  for (const [k, v] of Object.entries(yearMatchedCells)) if (!Number.isFinite(v.baselineSamplingSe)) delete yearMatchedCells[k];
  return {
    a8Segmented: true,
    minFineCellN: 200,
    randomEntryN: all.length,
    fineCellsVerdictState: table(fineV),
    fineCells: table(fine4),
    cells: table(coarse),
    yearMatchedCells,
  };
}

function rebinStrategyTrades(trades, statesBySegment) {
  return remapRecords(trades, statesBySegment).filter((t) => ROLES.DEV.includes(t.year));
}

function summarizeEmissions(records) {
  const out = Object.fromEntries(CLAIM_CARDS.map((c) => [c.id, { kept: 0, long: 0, short: 0, blockedBySlot: 0, invalidAtr: 0 }]));
  for (const t of records) {
    const x = out[t.strategyId];
    x.kept++;
    x[t.side]++;
  }
  for (const [key, value] of cardTradeStats) {
    const cardId = key.slice(key.indexOf("|") + 1);
    if (out[cardId]) {
      out[cardId].blockedBySlot += value.blockedBySlot;
      out[cardId].invalidAtr += value.invalidAtr;
    }
  }
  return out;
}

/**
 * Full pre-result M6 producer. It creates one independent slot per card,
 * unrestricted by state, and common deterministic random entries. All outcomes
 * are resolved inside their own DEV segment.
 */
export function buildDevPipeline({ bars, m15Bars = [], segments = null, randomSeed = RANDOM_BASELINE_SEED, entriesPerRandomGroup = RANDOM_ENTRIES_PER_YEAR_SESSION_VOL_SIDE } = {}) {
  const devSegments = segments ?? splitDevSegments(bars);
  if (!devSegments.length) throw new Error("no DEV segments supplied");
  const segmentIds = new Set();
  for (const segment of devSegments) {
    if (!segment.bars?.length) throw new Error(`empty DEV segment ${segment.id}`);
    if (segmentIds.has(segment.id)) throw new Error(`duplicate DEV segment id ${segment.id}`);
    segmentIds.add(segment.id);
    for (const bar of segment.bars) {
      if (!ROLES.DEV.includes(yearOf(bar))) throw new Error(`non-DEV bar ${bar.datetime} was passed into segment ${segment.id}`);
    }
  }
  const maps = []; 
  const stateByGrid = new Map(SWEEP_GRID.map((g) => [g.id, new Map()]));
  const segmentFeatures = [];
  const segmentM15 = [];
  for (const segment of devSegments) {
    const features = computeFeatures(segment.bars, MAP);
    segmentFeatures.push(features);
    for (const grid of SWEEP_GRID) {
      const labels = classify(features, { ...MAP, erCutoff: grid.erCutoff, atrPctileCutoff: grid.atrPctileCutoff }).map((x) => x.state);
      stateByGrid.get(grid.id).set(segment.id, labels);
    }
    maps.push({ ...segment, features, states: stateByGrid.get(CENTER_GRID_ID).get(segment.id).map((state) => ({ state })) });
    segmentM15.push(m15MapForSegment(segment.bars, m15Bars));
  }

  cardTradeStats = new Map();
  const centerTrades = [];
  for (let si = 0; si < devSegments.length; si++) {
    const segment = devSegments[si];
    const generated = generateCardTrades(segment, segmentFeatures[si], stateByGrid.get(CENTER_GRID_ID).get(segment.id), segmentM15[si]);
    centerTrades.push(...(generated.trades ?? []));
  }
  const random = randomCandidateRecords(devSegments, segmentFeatures, segmentM15, { seed: randomSeed, entriesPerGroup: entriesPerRandomGroup });
  const gridInputs = new Map();
  let centerRandomTrades = [];
  for (const grid of SWEEP_GRID) {
    const states = stateByGrid.get(grid.id);
    const trades = rebinStrategyTrades(centerTrades, states);
    const randomTrades = remapRecords(random.records, states).filter((t) => t.state !== "UNKNOWN");
    const baseline = baselineForGrid(randomTrades);
    if (grid.id === CENTER_GRID_ID) centerRandomTrades = randomTrades;
    gridInputs.set(grid.id, { trades, baseline });
  }
  const center = gridInputs.get(CENTER_GRID_ID);
  const segmentMetadata = devSegments.map((s) => ({
    id: s.id,
    firstYear: s.firstYear ?? yearOf(s.bars[0]),
    lastYear: s.lastYear ?? yearOf(s.bars.at(-1)),
    globalStart: s.globalStart ?? null,
    globalEnd: s.globalEnd ?? null,
    bars: s.bars.length,
    entryRange: eligibleEntryRange(s.bars.length),
  }));
  return {
    segments: devSegments,
    maps,
    segmentMetadata,
    centerTrades: center.trades,
    randomTrades: centerRandomTrades,
    baseline: center.baseline,
    gridInputs,
    randomSampleAudit: random.sampleAudit,
    cardTradeSummary: summarizeEmissions(center.trades),
    diagnostics: {
      cardTradeStats: Object.fromEntries(cardTradeStats),
      randomSeed,
      entriesPerRandomGroup,
      randomCandidatesGenerated: random.records.length,
      gridCells: SWEEP_GRID.length,
      centerGrid: CENTER_GRID_ID,
      noNonDevYearEntries: [...center.trades, ...centerRandomTrades].every((t) => ROLES.DEV.includes(t.year)),
      noSegmentBoundaryExits: [...center.trades, ...centerRandomTrades].every((t) => t.localIndex + EXIT_HARNESS.maxHoldBars < devSegments.find((s) => s.id === t.segmentId).bars.length && t.exitIndex < devSegments.find((s) => s.id === t.segmentId).bars.length),
    },
  };
}

export function sweepBattery(pipeline, runBattery) {
  const results = new Map();
  for (const grid of SWEEP_GRID) {
    const input = pipeline.gridInputs.get(grid.id);
    results.set(grid.id, runBattery(input.trades, { baseline: input.baseline, sensitivityAgreementPct: null }));
  }
  const centerRows = results.get(CENTER_GRID_ID);
  const pct = new Map();
  const informationalPct = new Map();
  for (const row of centerRows) {
    const nConfirmed = SWEEP_GRID.reduce((n, grid) => n + (results.get(grid.id).find((x) => x.claimId === row.claimId && x.kind === row.kind)?.verdict === "CONFIRMED" ? 1 : 0), 0);
    const agreementPct = +(100 * nConfirmed / SWEEP_GRID.length).toFixed(2);
    informationalPct.set(`${row.claimId}|${row.kind}`, agreementPct);
    row.sweepConfirmedCells = nConfirmed;
    row.sweepCells = SWEEP_GRID.length;
    row.sweepConfirmedPct = agreementPct;
    if (row.verdict === "CONFIRMED") {
      pct.set(`${row.claimId}|${row.kind}`, agreementPct);
      applySensitivityGrade(row.stats, agreementPct);
      row.stability = row.stats.stability;
      row.conditional = row.stats.conditional;
    }
  }
  return { results, sensitivityByClaim: Object.fromEntries(pct), informationalPctByClaim: Object.fromEntries(informationalPct) };
}

export function countSealedSpreadMonths(spreadTable, devYears = ROLES.DEV, pinnedMonths = []) {
  const dev = new Set(devYears);
  const observed = new Map((spreadTable.perMonth ?? []).map((x) => [x.month, x]));
  const months = pinnedMonths.length ? [...pinnedMonths] : [...observed.keys()];
  const rows = months.map((month) => {
    const year = Number(String(month).slice(0, 4));
    return { ...(observed.get(month) ?? {}), month, year, pairedM1Observed: observed.has(month), sealed: !dev.has(year) };
  });
  return {
    total: rows.length,
    pairedObservedCount: rows.filter((x) => x.pairedM1Observed).length,
    noPairedM1Count: rows.filter((x) => !x.pairedM1Observed).length,
    sealedCount: rows.filter((x) => x.sealed).length,
    sealedMonths: rows.filter((x) => x.sealed).map((x) => x.month),
    sealedPairedMonths: rows.filter((x) => x.sealed && x.pairedM1Observed).map((x) => x.month),
    devMonths: rows.filter((x) => !x.sealed).map((x) => x.month),
    costDataOnly: true,
  };
}
