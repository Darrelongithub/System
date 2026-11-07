#!/usr/bin/env node
/** Shared, single execution path for A8 Stage 3b pilot and scored worlds. */
import { emitSignals } from "./lib/signals.mjs";
import { buildDevPipeline, sweepBattery, CENTER_GRID_ID } from "./lib/dev-pipeline.mjs";
import { runBattery } from "./verify-claims.mjs";
import { MAP, EXIT_HARNESS, FAMILY_STRENGTH_STATE } from "./frozen.mjs";
import { computeFeatures, classify } from "./lib/map.mjs";
import { eligibleEntryRange } from "./lib/dev-segments.mjs";
import { makeSyntheticM15, barsFromNoise, plantDonchianEdge } from "./a8-dress-rehearsal.mjs";
import { CLAIM_CARDS } from "./claim-cards.draft.mjs";

export const WORLDS_PER_CONDITION = 10;
export const BARS_PER_WORLD = 60_000;
export const SEGMENT_COUNT = 3;
export const BARS_PER_SEGMENT = BARS_PER_WORLD / SEGMENT_COUNT;
export const PILOT_SEEDS = Object.freeze([20261110, 20261111, 20261112]);
export const SCORED_SEED_BASE = 20261201;
export const A_B_NEW_MEAN_BOUND = 0.5;
export const A_B_OLD_MAX_BOUND = 2;

const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

export function signalEvents(segments, { source = "synthetic" } = {}) {
  const events = [];
  for (const segment of segments) {
    const features = computeFeatures(segment.bars, MAP);
    const states = classify(features).map((row) => row.state);
    const range = eligibleEntryRange(segment.bars.length);
    for (const card of CLAIM_CARDS) {
      const cardId = card.id;
      for (const signal of emitSignals(segment.bars, cardId, {
        states,
        start: range.start,
        end: range.endExclusive,
      })) {
        events.push({
          source,
          cardId,
          segmentId: segment.id,
          index: signal.index,
          side: signal.side,
          datetime: signal.datetime,
          fourState: signal.fourState,
          verdictState: signal.verdictState,
        });
      }
    }
  }
  return events;
}

export function summarizeSignals(events, cards = CLAIM_CARDS) {
  const byCard = new Map(cards.map((card) => [card.id, []]));
  const byBarSide = new Map();
  for (const event of events) {
    byCard.get(event.cardId)?.push(event);
    const key = `${event.segmentId}|${event.index}|${event.side}`;
    if (!byBarSide.has(key)) byBarSide.set(key, new Set());
    byBarSide.get(key).add(event.cardId);
  }
  const exclusive = new Map(cards.map((card) => [card.id, 0]));
  for (const event of events) {
    const ids = byBarSide.get(`${event.segmentId}|${event.index}|${event.side}`);
    if (ids?.size === 1) exclusive.set(event.cardId, exclusive.get(event.cardId) + 1);
  }
  const pairCounts = new Map();
  for (const ids of byBarSide.values()) {
    const ordered = [...ids].sort();
    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const key = `${ordered[i]}|${ordered[j]}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const cardRows = cards.map((card) => {
    const signals = byCard.get(card.id) ?? [];
    const n = signals.length;
    const exclusiveCount = exclusive.get(card.id) ?? 0;
    return {
      cardId: card.id,
      family: card.family,
      strengthState: FAMILY_STRENGTH_STATE[card.family],
      signalCount: n,
      exclusiveCount,
      exclusiveShare: n ? exclusiveCount / n : 0,
    };
  });
  const pairRows = [...pairCounts.entries()].map(([key, count]) => {
    const [cardA, cardB] = key.split("|");
    const nA = byCard.get(cardA)?.length ?? 0;
    const nB = byCard.get(cardB)?.length ?? 0;
    return {
      cardA,
      cardB,
      coFireCount: count,
      signalCountA: nA,
      signalCountB: nB,
      shareOfA: nA ? count / nA : 0,
      shareOfB: nB ? count / nB : 0,
    };
  }).sort((a, b) => a.cardA.localeCompare(b.cardA) || a.cardB.localeCompare(b.cardB));
  return { cardRows, pairRows, totalSignalEvents: events.length, uniqueBarSideKeys: byBarSide.size };
}

export function buildCardWindowPlant(noiseSegments, cardId, driftPerBar, { edgeBars = 24 } = {}) {
  const base = barsFromNoise(noiseSegments);
  const edgeBySegment = new Map();
  let plantedWindowCount = 0;
  let totalEligibleSignalBars = 0;
  let totalEligibleBars = 0;
  let windowBars = 0;
  for (let si = 0; si < base.length; si++) {
    const segment = base[si];
    const features = computeFeatures(segment.bars, MAP);
    const states = classify(features).map((row) => row.state);
    const range = eligibleEntryRange(segment.bars.length);
    totalEligibleBars += range.count;
    const signals = emitSignals(segment.bars, cardId, {
      states,
      start: range.start,
      end: range.endExclusive,
    });
    totalEligibleSignalBars += signals.length;
    const edge = new Float64Array(segment.bars.length);
    let activeUntil = -1;
    for (const signal of signals) {
      // A planted window is directional, lasts exactly 24 subsequent bars,
      // and cannot overlap another window. Selection is signal-only on base bars.
      if (signal.index <= activeUntil) continue;
      const end = Math.min(segment.bars.length - 1, signal.index + edgeBars);
      const direction = signal.side === "long" ? 1 : -1;
      for (let i = signal.index + 1; i <= end; i++) {
        edge[i] += direction * driftPerBar;
        windowBars++;
      }
      activeUntil = end;
      plantedWindowCount++;
    }
    edgeBySegment.set(segment.id, edge);
  }
  const plantedSegments = barsFromNoise(noiseSegments, { edgeBySegment });
  let postMutationSignalCount = 0;
  for (const segment of plantedSegments) {
    const features = computeFeatures(segment.bars, MAP);
    const states = classify(features).map((row) => row.state);
    const range = eligibleEntryRange(segment.bars.length);
    postMutationSignalCount += emitSignals(segment.bars, cardId, {
      states,
      start: range.start,
      end: range.endExclusive,
    }).length;
  }
  return {
    segments: plantedSegments,
    metadata: {
      cardId,
      driftPerBar,
      edgeBars,
      eligibleSignalCount: totalEligibleSignalBars,
      plantedWindowCount,
      plantedWindowBars: windowBars,
      eligibleBars: totalEligibleBars,
      windowBarShare: totalEligibleBars ? windowBars / totalEligibleBars : 0,
      postMutationSignalCount,
      grossTargetR: null,
      plantingRule: "after an eligible signal, only when no 24-bar planted window is active, add signed drift to each of the next 24 bars; windows never cross segment boundaries",
    },
  };
}

export function plantDonchian20(noiseSegments, seed) {
  // Historical original C planting, retained solely as report-only C-D.
  return plantDonchianEdge(noiseSegments, seed);
}

export function summarizeEntryStateCounts(trades, cards = CLAIM_CARDS) {
  const counts = Object.fromEntries(cards.map((card) => [card.id, { EFFICIENT: 0, CHOPPY: 0, UNKNOWN: 0, total: 0 }]));
  for (const trade of trades) {
    const row = counts[trade.strategyId];
    if (!row) continue;
    if (trade.verdictState === "EFFICIENT") row.EFFICIENT++;
    else if (trade.verdictState === "CHOPPY") row.CHOPPY++;
    else row.UNKNOWN++;
    row.total++;
  }
  for (const [cardId, row] of Object.entries(counts)) {
    if (row.EFFICIENT + row.CHOPPY + row.UNKNOWN !== row.total) throw new Error(`Part 3 state-entry identity failed for ${cardId}`);
  }
  return counts;
}

export function scoreSegments(segments, seed, condition, extra = {}) {
  const m15Bars = makeSyntheticM15(segments, seed + 71);
  const pipeline = buildDevPipeline({
    segments,
    m15Bars,
    randomSeed: 20261105 + seed,
  });
  const sweep = sweepBattery(pipeline, runBattery);
  const rows = sweep.results.get(CENTER_GRID_ID);
  const confirmedCards = [...new Set(rows
    .filter((row) => row.strategyLevel?.verdict === "CONFIRMED")
    .map((row) => row.claimId))].sort();
  const stateCounts = summarizeEntryStateCounts(pipeline.centerTrades);
  const randomLongTrades = pipeline.randomTrades.filter((trade) => trade.side === "long" && Number.isFinite(trade.netR));
  const strategyRows = rows.filter((row) => row.strategyLevel);
  const officialRows = rows.filter((row) => row.verdict === "CONFIRMED");
  const cardConfirmedCount = confirmedCards.length;
  const confirmDetails = strategyRows
    .filter((row) => row.strategyLevel.verdict === "CONFIRMED")
    .map((row) => ({ cardId: row.claimId, kind: row.kind, state: row.state, verdict: row.strategyLevel.verdict }))
    .sort((a, b) => a.cardId.localeCompare(b.cardId) || a.kind.localeCompare(b.kind));
  const tradePool = extra.plantedCardId
    ? pipeline.centerTrades.filter((trade) => trade.strategyId === extra.plantedCardId && trade.verdictState === extra.strengthState)
    : [];
  const meanOf = (key) => mean(tradePool.map((trade) => trade[key]).filter(Number.isFinite));
  const report = {
    condition,
    seed,
    bars: segments.reduce((n, segment) => n + segment.bars.length, 0),
    barsPerSegment: segments.map((segment) => segment.bars.length),
    cardConfirmedCount,
    confirmedCards,
    strategyLevelConfirmedCells: confirmDetails,
    officialConfirmedFamilyCells: officialRows.map((row) => ({ family: row.family, verdictState: row.state, verdict: row.verdict })),
    confirmedClaimCellCount: rows.filter((row) => row.verdict === "CONFIRMED").length,
    randomLong: {
      count: randomLongTrades.length,
      meanNetR: mean(randomLongTrades.map((trade) => trade.netR)),
      meanGrossR: mean(randomLongTrades.map((trade) => trade.grossR)),
      meanCostR: mean(randomLongTrades.map((trade) => trade.costR)),
      unknownStateEntriesDropped: pipeline.diagnostics.randomUnknownStateDropped,
      knownStateEntriesKept: pipeline.diagnostics.randomKnownStateKept,
    },
    stateEntryCounts: stateCounts,
    unknownEntryCount: Object.values(stateCounts).reduce((sum, row) => sum + row.UNKNOWN, 0),
    plantedCardStats: extra.plantedCardId ? {
      cardId: extra.plantedCardId,
      strengthState: extra.strengthState,
      tradeCount: tradePool.length,
      meanGrossR: meanOf("grossR"),
      meanNetR: meanOf("netR"),
      meanCostR: meanOf("costR"),
    } : null,
    donchian20StrengthVerdict: rows.find((row) => row.claimId === "donchian-20" && row.kind === "strength")?.strategyLevel?.verdict ?? "INCONCLUSIVE",
    donchian20OfficialFamilyVerdict: rows.find((row) => row.claimId === "donchian-20" && row.kind === "strength")?.verdict ?? "INCONCLUSIVE",
    pipelineDiagnostics: pipeline.diagnostics,
    pipeline: "shared Stage 3b scorer: 25 frozen Map grids; signals, one-slot card books, frozen exit/cost/gap fills, deterministic matched controls, family + strategy diagnostics and full sensitivity battery",
  };
  return report;
}

export function summarizeConfirmedCounts(rows) {
  const counts = rows.map((row) => row.cardConfirmedCount);
  return {
    worlds: rows.length,
    meanConfirmedCards: mean(counts),
    maxConfirmedCards: Math.max(...counts),
    totalConfirmedCards: counts.reduce((a, b) => a + b, 0),
  };
}

export function measurePlantStats(segments, cardId, strengthState) {
  const mapBySegment = new Map();
  for (const segment of segments) {
    const features = computeFeatures(segment.bars, MAP);
    const states = classify(features).map((row) => row.state);
    const range = eligibleEntryRange(segment.bars.length);
    mapBySegment.set(segment.id, { states, range });
  }
  return { mapBySegment, cardId, strengthState, frozenMaxHoldBars: EXIT_HARNESS.maxHoldBars };
}
