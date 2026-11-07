#!/usr/bin/env node
/** A8 Part 2: signal-only selection/exclusions and three-seed C calibration. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { dataLines, num } from "./lib/csv.mjs";
import { MAP, FAMILY_STRENGTH_STATE } from "./frozen.mjs";
import { splitDevSegments, mapDevSegments, eligibleEntryRange } from "./lib/dev-segments.mjs";
import { emitSignals } from "./lib/signals.mjs";
import { computeFeatures, classify } from "./lib/map.mjs";
import { makeNoiseSegments, barsFromNoise } from "./a8-dress-rehearsal.mjs";
import { CLAIM_CARDS } from "./claim-cards.draft.mjs";
import {
  BARS_PER_SEGMENT,
  BARS_PER_WORLD,
  PILOT_SEEDS,
  buildCardWindowPlant,
  scoreSegments,
  signalEvents,
  summarizeSignals,
} from "./a8-stage3b-common.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const NORM = join(ROOT, "artifacts/map-compass/normalized");
const ART = join(ROOT, "artifacts/map-compass");
const TARGET_NET_R = 0.30;
const INITIAL_DRIFT = 0.04;
const WINDOW_BARS = 24;
const MIN_DEV_SIGNALS = 1500;
const MIN_EXPECTED_STRENGTH_TRADES = 600;
const COFIRE_EXCLUSION_SHARE = 0.25;
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const round = (x, n = 8) => Number.isFinite(x) ? Number(x.toFixed(n)) : null;

function loadBars() {
  const out = [];
  for (const row of dataLines(readFileSync(join(NORM, "xauusd-m30-eat.csv"), "utf8"), { delimiter: "," })) {
    if (row[0] === "datetime") continue;
    const [o, h, l, c, v] = row.slice(1, 6).map(num);
    if ([o, h, l, c].some((x) => x === undefined)) continue;
    out.push({ datetime: row[0], o, h, l, c, v: v ?? 0 });
  }
  return out;
}

function devSignalEvents() {
  const segments = splitDevSegments(loadBars());
  const maps = mapDevSegments(segments, MAP);
  const events = [];
  for (let si = 0; si < segments.length; si++) {
    const segment = segments[si];
    const range = eligibleEntryRange(segment.bars.length);
    const states = maps[si].states.map((state) => state.state);
    for (const card of CLAIM_CARDS) {
      for (const signal of emitSignals(segment.bars, card.id, {
        states,
        start: range.start,
        end: range.endExclusive,
      })) {
        events.push({
          source: "REAL_DEV_SIGNALS_ONLY",
          cardId: card.id,
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
  return { segments, events };
}

function calculatePairShares(summary, plantedCardId) {
  const plantedSignals = summary.cardRows.find((row) => row.cardId === plantedCardId)?.signalCount ?? 0;
  const rows = summary.pairRows
    .filter((row) => row.cardA === plantedCardId || row.cardB === plantedCardId)
    .map((row) => {
      const otherCardId = row.cardA === plantedCardId ? row.cardB : row.cardA;
      return {
        plantedCardId,
        otherCardId,
        coFireCount: row.coFireCount,
        plantedCardSignalCount: plantedSignals,
        shareOfPlantedCardSignals: plantedSignals ? row.coFireCount / plantedSignals : 0,
        shareOfOtherCardSignals: row.cardA === plantedCardId ? row.shareOfB : row.shareOfA,
        excludedFromOtherCardCount: plantedSignals > 0 && row.coFireCount / plantedSignals > COFIRE_EXCLUSION_SHARE,
      };
    })
    .sort((a, b) => b.shareOfPlantedCardSignals - a.shareOfPlantedCardSignals || a.otherCardId.localeCompare(b.otherCardId));
  return rows;
}

function collectCardTradeMetrics(scoreRows, cardId, strengthState) {
  const worlds = scoreRows.map((row) => ({
    seed: row.seed,
    stateTrades: row.stateEntryCounts[cardId]?.[strengthState] ?? 0,
  }));
  return {
    worlds,
    expectedStrengthTradesPer60k: mean(worlds.map((row) => row.stateTrades)),
  };
}

function aggregatePlantedStats(rows) {
  const tradeCount = rows.reduce((sum, row) => sum + (row.plantedCardStats?.tradeCount ?? 0), 0);
  const weighted = (key) => tradeCount
    ? rows.reduce((sum, row) => sum + (row.plantedCardStats?.[key] ?? 0) * (row.plantedCardStats?.tradeCount ?? 0), 0) / tradeCount
    : null;
  return {
    tradeCountAcrossPilotWorlds: tradeCount,
    meanGrossR: weighted("meanGrossR"),
    meanNetR: weighted("meanNetR"),
    meanCostR: weighted("meanCostR"),
  };
}

function scorePilotCard(noiseBySeed, cardId, strengthState, driftPerBar, edgeBars) {
  const rows = [];
  const windows = [];
  for (const seed of PILOT_SEEDS) {
    const noise = noiseBySeed.get(seed);
    const planted = buildCardWindowPlant(noise, cardId, driftPerBar, { edgeBars });
    windows.push({ seed, ...planted.metadata });
    rows.push(scoreSegments(planted.segments, seed, "C_CALIBRATION_PILOT", {
      plantedCardId: cardId,
      strengthState,
    }));
    if (global.gc) global.gc();
  }
  return { rows, windows, stats: aggregatePlantedStats(rows) };
}

export async function runPart2Prep() {
  const real = devSignalEvents();
  const realSummary = summarizeSignals(real.events);
  const noiseBySeed = new Map(PILOT_SEEDS.map((seed) => [seed, makeNoiseSegments({ seed, barsPerSegment: BARS_PER_SEGMENT })]));
  const pilotSignalSummaries = [];
  for (const seed of PILOT_SEEDS) {
    const events = signalEvents(barsFromNoise(noiseBySeed.get(seed)), { source: `SYNTHETIC_PILOT_${seed}` });
    pilotSignalSummaries.push({ seed, ...summarizeSignals(events) });
  }

  // Each pilot world uses the exact full A8 scorer for executable-slot counts.
  const pilotNoEdgeScores = [];
  for (const seed of PILOT_SEEDS) {
    const segments = barsFromNoise(noiseBySeed.get(seed));
    pilotNoEdgeScores.push(scoreSegments(segments, seed, "A_PILOT_ZERO_DRIFT"));
    if (global.gc) global.gc();
  }
  const expectedByCard = new Map();
  for (const card of CLAIM_CARDS) {
    const strengthState = FAMILY_STRENGTH_STATE[card.family];
    expectedByCard.set(card.id, collectCardTradeMetrics(pilotNoEdgeScores, card.id, strengthState));
  }
  const B_TARGET_RANDOM_LONG_NET_R = 0.15;
  const B_INITIAL_DRIFT = 0.031436767578125; // Stage 3a pilot drift; same constant-drift generator, re-calibrated to the production control path.
  const randomLongAverage = (rows) => {
    const trades = rows.flatMap((row) => Array(row.randomLong?.count ?? 0).fill(row.randomLong?.meanNetR ?? 0));
    return mean(trades);
  };
  const baselineBNet = randomLongAverage(pilotNoEdgeScores);
  const bCalibrationIterations = [];
  let bDrift = B_INITIAL_DRIFT;
  let bLatestRows = [];
  for (let iteration = 1; iteration <= 4; iteration++) {
    bLatestRows = [];
    for (const seed of PILOT_SEEDS) {
      const segments = barsFromNoise(noiseBySeed.get(seed), { driftPerBar: bDrift });
      bLatestRows.push(scoreSegments(segments, seed, "B_CALIBRATION_PILOT"));
      if (global.gc) global.gc();
    }
    const net = randomLongAverage(bLatestRows);
    bCalibrationIterations.push({
      iteration,
      driftPerBar: bDrift,
      meanRandomLongNetR: net,
      meanRandomLongGrossR: randomLongAverage(bLatestRows.map((row) => ({ randomLong: { ...row.randomLong, meanNetR: row.randomLong.meanGrossR } }))),
      meanRandomLongCostR: randomLongAverage(bLatestRows.map((row) => ({ randomLong: { ...row.randomLong, meanNetR: row.randomLong.meanCostR } }))),
      worlds: bLatestRows.map((row) => ({ seed: row.seed, ...row.randomLong })),
    });
    if (net != null && Math.abs(net - B_TARGET_RANDOM_LONG_NET_R) <= 0.02) break;
    const proposed = net != null && net !== baselineBNet
      ? bDrift * (B_TARGET_RANDOM_LONG_NET_R - baselineBNet) / (net - baselineBNet)
      : bDrift * 1.5;
    bDrift = Math.max(0.0001, Math.min(0.25, proposed));
  }
  const calibratedBDrift = bCalibrationIterations.at(-1)?.driftPerBar;
  const calibratedBNet = bCalibrationIterations.at(-1)?.meanRandomLongNetR;
  if (!Number.isFinite(calibratedBDrift) || !Number.isFinite(calibratedBNet) || Math.abs(calibratedBNet - B_TARGET_RANDOM_LONG_NET_R) > 0.05) {
    throw new Error(`B drift calibration failed against the production matched-control path: ${JSON.stringify(bCalibrationIterations.map((x) => [x.driftPerBar, x.meanRandomLongNetR]))}; no scored Stage 3 world was run`);
  }

  const eligible = realSummary.cardRows
    .map((row) => {
      const expected = expectedByCard.get(row.cardId);
      return {
        ...row,
        expectedStrengthTradesPer60k: expected.expectedStrengthTradesPer60k,
        strengthTradeCountsByPilotSeed: expected.worlds,
        eligible: row.signalCount >= MIN_DEV_SIGNALS && expected.expectedStrengthTradesPer60k >= MIN_EXPECTED_STRENGTH_TRADES,
      };
    })
    .filter((row) => row.eligible)
    .sort((a, b) => b.exclusiveShare - a.exclusiveShare || a.cardId.localeCompare(b.cardId));
  if (!eligible.length) throw new Error("No planted-card candidate meets both frozen preconditions (DEV signals and expected strength-state trades)");
  const plantedCardId = eligible[0].cardId;
  const card = CLAIM_CARDS.find((item) => item.id === plantedCardId);
  const strengthState = FAMILY_STRENGTH_STATE[card.family];
  const coFire = calculatePairShares(realSummary, plantedCardId);
  const contaminationExclusions = coFire
    .filter((row) => row.excludedFromOtherCardCount)
    .map((row) => row.otherCardId)
    .sort();

  // Baseline planted-card outcome mean (no injected drift) is captured through
  // the same scorer, but the no-edge score above intentionally does not expose
  // outcome means. Re-score the three pilots with the selected card's strength
  // cell attached; it uses the same bars and seed and does not select the card.
  const baselineCardScores = [];
  for (const seed of PILOT_SEEDS) {
    const segments = barsFromNoise(noiseBySeed.get(seed));
    baselineCardScores.push(scoreSegments(segments, seed, "C_CALIBRATION_BASELINE", { plantedCardId, strengthState }));
    if (global.gc) global.gc();
  }
  const baseline = aggregatePlantedStats(baselineCardScores);
  const windowShareAt24 = PILOT_SEEDS.map((seed) => ({
    seed,
    ...buildCardWindowPlant(noiseBySeed.get(seed), plantedCardId, INITIAL_DRIFT, { edgeBars: 24 }).metadata,
  }));
  let edgeBars = 24;
  let shortenedTo12BarsRequired = false;
  if (Math.max(...windowShareAt24.map((row) => row.windowBarShare)) > 0.4) {
    edgeBars = 12;
    shortenedTo12BarsRequired = true;
  }
  const calRuns = [];
  let drift = INITIAL_DRIFT;
  let latest = null;
  for (let iteration = 1; iteration <= 6; iteration++) {
    latest = scorePilotCard(noiseBySeed, plantedCardId, strengthState, drift, edgeBars);
    calRuns.push({ iteration, driftPerBar: drift, ...latest.stats, worlds: latest.rows.map((row, i) => ({ seed: row.seed, ...row.plantedCardStats, window: latest.windows[i] })) });
    const measured = latest.stats.meanNetR;
    if (measured != null && Math.abs(measured - TARGET_NET_R) <= 0.05) break;
    const prior = calRuns.length > 1 ? calRuns.at(-2) : { driftPerBar: 0, meanNetR: baseline.meanNetR };
    if (prior.meanNetR != null && measured != null && measured !== prior.meanNetR) {
      const proposed = drift + (TARGET_NET_R - measured) * (drift - prior.driftPerBar) / (measured - prior.meanNetR);
      drift = Math.max(INITIAL_DRIFT * 0.05, Math.min(INITIAL_DRIFT * 8, proposed));
    } else {
      drift = iteration === 1 ? INITIAL_DRIFT * 1.5 : drift * 1.5;
    }
  }
  if (!latest || latest.stats.meanNetR == null) throw new Error(`${edgeBars}-bar planting calibration produced no strength-state trades`);
  if (Math.abs(latest.stats.meanNetR - TARGET_NET_R) > 0.05) {
    const trail = calRuns.map((row) => `${row.driftPerBar.toFixed(6)}:${row.meanNetR?.toFixed(4)}`).join(", ");
    throw new Error(`${edgeBars}-bar calibration for ${plantedCardId} did not reach the net target: ${trail}; target ${TARGET_NET_R.toFixed(2)}R. No scored Stage 3 world was run`);
  }
  const calibratedDrift = calRuns.at(-1).driftPerBar;
  const maxWindowShare = Math.max(...latest.windows.map((x) => x.windowBarShare));

  const digestPayload = {
    conditionBDriftPerBar: round(calibratedBDrift),
    conditionBTargetRandomLongNetR: B_TARGET_RANDOM_LONG_NET_R,
    plantedCardId,
    strengthState,
    driftPerBar: round(calibratedDrift),
    edgeBars,
    contaminationExclusions,
    coFire,
    grossTargetR: round(latest.stats.meanGrossR),
    targetNetR: TARGET_NET_R,
  };
  const report = {
    generatedAt: new Date().toISOString(),
    stage: "A8_PART_2_PREREGISTRATION_AND_C_CALIBRATION",
    syntheticOnlyScoredWorlds: true,
    realDevUsedOnlyForSignalTables: true,
    realDevFeatureScope: "Map/features/signals recomputed independently within four DEV segments; no VAL/HOLDOUT/STRESS OHLC was passed to Map or signal code; no real DEV trades or outcomes were generated in Part 2.",
    segmentRule: "four contiguous DEV segments 2004-2007, 2009-2011, 2013-2015, 2017-2018; reset features at each segment boundary; entry warm-up 1,000 bars and 96-bar tail",
    barsPerWorld: BARS_PER_WORLD,
    pilotSeeds: PILOT_SEEDS,
    scoredSeedPolicy: `new Stage 3b seeds start at ${20261201}; disjoint from all three pilot seeds and prior Stage 3a seeds`,
    candidateRules: { minimumDevSignalCount: MIN_DEV_SIGNALS, minimumExpectedStrengthTradesPer60k: MIN_EXPECTED_STRENGTH_TRADES, selection: "highest real-DEV exclusive share among eligible cards; deterministic cardId tie-break" },
    conditionBCalibration: {
      targetRandomLongNetR: B_TARGET_RANDOM_LONG_NET_R,
      initialDriftPerBar: B_INITIAL_DRIFT,
      calibratedDriftPerBar: round(calibratedBDrift),
      pilotMeanRandomLongNetR: round(calibratedBNet),
      pilotMeanRandomLongGrossR: round(bCalibrationIterations.at(-1).meanRandomLongGrossR),
      pilotMeanRandomLongCostR: round(bCalibrationIterations.at(-1).meanRandomLongCostR),
      baselineNoDriftMeanRandomLongNetR: round(baselineBNet),
      iterations: bCalibrationIterations,
      sameScoringPath: "Three disjoint 60k pilot seeds; world-specific M15 seed+71; exact DEV pipeline; random long candidates remapped to center Map state and UNKNOWN dropped before matched baseline; drift remains a constant per-bar additive return.",
    },
    realDevSignalTable: realSummary.cardRows.map((row) => ({
      ...row,
      expectedStrengthTradesPer60k: round(expectedByCard.get(row.cardId)?.expectedStrengthTradesPer60k, 3),
      strengthTradeCountsByPilotSeed: expectedByCard.get(row.cardId)?.worlds ?? [],
      eligible: row.signalCount >= MIN_DEV_SIGNALS && (expectedByCard.get(row.cardId)?.expectedStrengthTradesPer60k ?? 0) >= MIN_EXPECTED_STRENGTH_TRADES,
    })).sort((a, b) => b.exclusiveShare - a.exclusiveShare || a.cardId.localeCompare(b.cardId)),
    realDevPairwiseSameBarSameSideCoFire: realSummary.pairRows,
    syntheticPilotSignalTables: pilotSignalSummaries.map((row) => ({ seed: row.seed, ...row })),
    selection: {
      eligibleCandidates: eligible,
      plantedCardId,
      family: card.family,
      strengthState,
      exclusiveShare: realSummary.cardRows.find((row) => row.cardId === plantedCardId)?.exclusiveShare,
    },
    contamination: {
      calculation: "pairwise same-bar/same-side co-fire count / planted card's real DEV signal count; determined from signals only before any scored outcomes",
      threshold: COFIRE_EXCLUSION_SHARE,
      rows: coFire,
      excludedCardIds: contaminationExclusions,
    },
    calibration: {
      edgeBars,
      initial24BarWindowShare: windowShareAt24,
      targetMeasuredNetR: TARGET_NET_R,
      targetToleranceUsedForCalibrationR: 0.05,
      initialDriftPerBar: INITIAL_DRIFT,
      calibratedDriftPerBar: round(calibratedDrift),
      measuredPilotMeanGrossR: round(latest.stats.meanGrossR),
      measuredPilotMeanNetR: round(latest.stats.meanNetR),
      measuredPilotMeanCostR: round(latest.stats.meanCostR),
      maxPilotWindowBarShare: round(maxWindowShare, 6),
      windowShareLimit: 0.40,
      shortenTo12BarsRequired: shortenedTo12BarsRequired,
      baselineNoDriftStrengthCell: baseline,
      iterations: calRuns,
      sharedScorer: "Every pilot score calls scoreSegments: buildDevPipeline, world-specific M15 with seed+71, matched controls, all 25 grid cells, frozen exits/costs and the same verification/sensitivity battery used by scored worlds. Only seed and planted drift differ.",
      plantedGrossTargetR: round(latest.stats.meanGrossR),
    },
    conditionCD: {
      id: "C-D",
      generator: "original Donchian-20 planted edge from Amendment 8A/Stage 3a, unchanged",
      role: "report-only in Stage 3; no pass criterion",
    },
    freezePayload: digestPayload,
    freezeSha256: createHash("sha256").update(JSON.stringify(digestPayload)).digest("hex"),
  };
  writeFileSync(join(ART, "a8-part2-prep.json"), JSON.stringify(report, null, 2) + "\n");
  const markdown = renderMarkdown(report);
  writeFileSync(join(ROOT, "docs/G0-AMENDMENT-8-PART2.md"), markdown);
  console.log(markdown);
  return report;
}

function renderMarkdown(report) {
  const fmt = (x, n = 3) => Number.isFinite(x) ? x.toFixed(n) : "—";
  const lines = [
    "# G0 Amendment 8 — Part 2: C preregistration and calibration",
    "",
    `**Generated:** ${report.generatedAt} (Africa/Nairobi). **Part 2 only; no scored Stage 3 world has run.**`,
    "",
    "Real market input was used only for signal-only tables on the four independent DEV segments. No real DEV trades or outcomes were generated; no VAL/HOLDOUT/STRESS price entered features, signals, trades, controls or verdicts.",
    "",
    `## Frozen selection: ${report.selection.plantedCardId}`,
    "",
    `Selected by highest exclusive share among cards with at least ${MIN_DEV_SIGNALS.toLocaleString()} real DEV signals and expected strength-state trades ≥${MIN_EXPECTED_STRENGTH_TRADES} per 60,000-bar synthetic world. Strength state: **${report.selection.strengthState}**; real DEV exclusive share: **${fmt(report.selection.exclusiveShare * 100, 2)}%**.`,
    "",
    "| Card | DEV signals | Exclusive | Exclusive share | Expected strength trades / 60k | Pilot counts | Eligible |",
    "|---|---:|---:|---:|---:|---|---|",
    ...report.realDevSignalTable.map((row) => `| ${row.cardId} | ${row.signalCount} | ${row.exclusiveCount} | ${fmt(row.exclusiveShare * 100, 2)}% | ${fmt(row.expectedStrengthTradesPer60k)} | ${row.strengthTradeCountsByPilotSeed.map((x) => x.stateTrades).join(", ")} | ${row.eligible ? "yes" : "no"} |`),
    "",
    "## Real DEV pairwise co-fire and contamination exclusions (signal-only)",
    "",
    `Contamination rule: exclude a card from C's “other-card confirmations” count when same-bar/same-side co-fire share is **>25% of ${report.selection.plantedCardId}'s DEV signal bars**. Frozen exclusions: **${report.contamination.excludedCardIds.join(", ") || "none"}**.`,
    "",
    "| Other card | Same-bar/same-side co-fires | Share of planted-card signals | Share of other-card signals | Excluded? |",
    "|---|---:|---:|---:|---|",
    ...report.contamination.rows.map((row) => `| ${row.otherCardId} | ${row.coFireCount} | ${fmt(row.shareOfPlantedCardSignals * 100, 2)}% | ${fmt(row.shareOfOtherCardSignals * 100, 2)}% | ${row.excludedFromOtherCardCount ? "yes" : "no"} |`),
    "",
    "## Three disjoint synthetic pilot signals",
    "",
    "Signal-only co-fire/exclusive diagnostics were also calculated on three separate 60,000-bar synthetic pilot seeds. Per-card/pair rows are saved in the JSON artifact before scored worlds.",
    "",
    "| Pilot seed | Signal events | Unique bar-side keys | Cards with signals |",
    "|---:|---:|---:|---:|",
    ...report.syntheticPilotSignalTables.map((row) => `| ${row.seed} | ${row.totalSignalEvents} | ${row.uniqueBarSideKeys} | ${row.cardRows.filter((x) => x.signalCount > 0).length} |`),
    "",
    "## Condition B calibration (diagnosed Part 1 fix)",
    "",
    `The generator remains constant additive drift; only its benchmark drift scalar was re-calibrated through the exact production control path. Pilot drift: **${fmt(report.conditionBCalibration.calibratedDriftPerBar, 8)}**; random-long mean net **${fmt(report.conditionBCalibration.pilotMeanRandomLongNetR, 4)}R** (target +0.15R); gross **${fmt(report.conditionBCalibration.pilotMeanRandomLongGrossR, 4)}R**; cost **${fmt(report.conditionBCalibration.pilotMeanRandomLongCostR, 4)}R**. UNKNOWN-bin random candidates are dropped before the matched baseline, as in scored worlds.`,
    "",
    "| Iteration | Drift / bar | Mean random-long net R | Mean gross R | Mean cost R | Per-seed net R |",
    "|---:|---:|---:|---:|---:|---|",
    ...report.conditionBCalibration.iterations.map((row) => `| ${row.iteration} | ${fmt(row.driftPerBar, 8)} | ${fmt(row.meanRandomLongNetR, 4)} | ${fmt(row.meanRandomLongGrossR, 4)} | ${fmt(row.meanRandomLongCostR, 4)} | ${row.worlds.map((x) => x.seed + ": " + fmt(x.meanNetR, 4)).join("; ")} |`),
    "",
    `## ${report.calibration.edgeBars}-bar planting calibration`,
    "",
    `The 24-bar rule was checked first; ${report.calibration.shortenTo12BarsRequired ? "its >40% window share triggered the preregistered 12-bar contingency" : "its window share stayed within the 40% cap"}. Calibrated on pilot seeds ${PILOT_SEEDS.join(", ")} using the same full Stage 3b scoring path (world-specific M15 seed+71, 25 grids, one-slot books, frozen costs/exits, random controls and verification battery). Drift: **${fmt(report.calibration.calibratedDriftPerBar, 8)} price units/bar**. Pilot measured gross: **${fmt(report.calibration.measuredPilotMeanGrossR, 4)}R**; measured net: **${fmt(report.calibration.measuredPilotMeanNetR, 4)}R** (target +${TARGET_NET_R.toFixed(2)}R); measured cost: **${fmt(report.calibration.measuredPilotMeanCostR, 4)}R**. Window share max: **${fmt(report.calibration.maxPilotWindowBarShare * 100, 2)}%** (40% limit; 12-bar contingency ${report.calibration.shortenTo12BarsRequired ? "applied" : "not triggered"}).`,
    "",
    "| Iteration | Drift / bar | Pilot strength trades | Mean gross R | Mean net R | Mean cost R | Max window share |",
    "|---:|---:|---:|---:|---:|---:|---:|",
    ...report.calibration.iterations.map((row) => `| ${row.iteration} | ${fmt(row.driftPerBar, 8)} | ${row.tradeCountAcrossPilotWorlds} | ${fmt(row.meanGrossR, 4)} | ${fmt(row.meanNetR, 4)} | ${fmt(row.meanCostR, 4)} | ${fmt(Math.max(...row.worlds.map((x) => x.window.windowBarShare)) * 100, 2)}% |`),
    "",
    `Frozen condition C gross target: **${fmt(report.calibration.plantedGrossTargetR, 4)}R**, derived from the three pilot means. Stage 3 C requires its measured planted-card gross within ±0.05R of this value and at least 8/10 CONFIRMED worlds; do not increase the edge if it misses 8/10.`,
    "",
    `Condition C-D retains the original Donchian-20 planting for report-only comparison; it has **no pass criterion**.`,
    "",
    `Freeze SHA-256 (card, strength state, drift, ${report.calibration.edgeBars} bars, exclusions, gross target): \`${report.freezeSha256}\`.`,
    "",
    "The Part 2 report and code are to be committed/pushed before the single Stage 3 run. No Stage 4 is authorized.",
    "",
  ];
  return lines.join("\n");
}


if (process.argv[1]?.replace(/\\/g, "/").endsWith("a8-part2-prep.mjs")) {
  runPart2Prep().catch((error) => {
    console.error(`A8 Part 2 prep failed: ${error.stack ?? error.message}`);
    process.exit(2);
  });
}
