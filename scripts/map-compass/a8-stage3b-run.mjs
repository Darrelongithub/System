#!/usr/bin/env node
/** A8 Part 4: one authorized synthetic Stage 3b run. Deliberately single-use. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { makeNoiseSegments, barsFromNoise } from "./a8-dress-rehearsal.mjs";
import {
  BARS_PER_SEGMENT,
  BARS_PER_WORLD,
  WORLDS_PER_CONDITION,
  SCORED_SEED_BASE,
  A_B_NEW_MEAN_BOUND,
  A_B_OLD_MAX_BOUND,
  buildCardWindowPlant,
  plantDonchian20,
  scoreSegments,
  summarizeConfirmedCounts,
} from "./a8-stage3b-common.mjs";
import { CLAIM_CARDS } from "./claim-cards.draft.mjs";
import { FAMILY_STRENGTH_STATE } from "./frozen.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ART = join(ROOT, "artifacts/map-compass");
const PREP_PATH = join(ART, "a8-part2-prep.json");
const DIAGNOSTIC_PATH = join(ART, "a8-stage3b-part1-diagnostics.json");
const OUTPUT_JSON = join(ART, "a8-stage3b-report.json");
const OUTPUT_MD = join(ROOT, "docs/G0-AMENDMENT-8-STAGE3B.md");
const CLAIM_VERIFICATION = join(ART, "claim-verification.json");
const CLAIMED_TRADES = join(ART, "claimed-trades.jsonl");
const TARGET_B_NET = 0.15;
const C_CONFIRM_MIN = 8;
const C_GROSS_TOLERANCE = 0.05;
const C_OTHER_MEAN_MAX = 0.5;
const round = (x, n = 6) => Number.isFinite(x) ? Number(x.toFixed(n)) : null;
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

function requireOutputGuard() {
  if (existsSync(CLAIM_VERIFICATION) || existsSync(CLAIMED_TRADES)) {
    throw new Error("Stage 4 output guard: claim-verification.json or claimed-trades.jsonl already exists; do not run Stage 3b.");
  }
}

function readAndValidatePrep() {
  const prep = JSON.parse(readFileSync(PREP_PATH, "utf8"));
  if (prep.stage !== "A8_PART_2_PREREGISTRATION_AND_C_CALIBRATION") throw new Error("missing or wrong Part 2 preregistration");
  const digest = createHash("sha256").update(JSON.stringify(prep.freezePayload)).digest("hex");
  if (digest !== prep.freezeSha256) throw new Error("Part 2 freeze SHA-256 does not match its payload");
  if (!prep.selection?.plantedCardId || !Array.isArray(prep.contamination?.excludedCardIds)) throw new Error("Part 2 planted card/exclusions are missing");
  if (![12, 24].includes(prep.calibration?.edgeBars)) throw new Error("unexpected condition C window length");
  if (!Number.isFinite(prep.calibration?.calibratedDriftPerBar) || !Number.isFinite(prep.conditionBCalibration?.calibratedDriftPerBar)) throw new Error("missing pre-calibrated drift values");
  return prep;
}

function recomputeLambda() {
  const saved = JSON.parse(readFileSync(DIAGNOSTIC_PATH, "utf8"));
  const worlds = saved.worlds.filter((world) => world.condition === "A_ZERO_DRIFT");
  if (worlds.length !== 10) throw new Error(`expected ten A diagnostic worlds for lambda, found ${worlds.length}`);
  const probabilities = new Map();
  for (const world of worlds) {
    if (world.cells.length !== 44) throw new Error(`A world ${world.world} has ${world.cells.length} cells, expected 44`);
    for (const cell of world.cells) {
      const key = `${cell.claimId}|${cell.kind}`;
      if (!probabilities.has(key)) probabilities.set(key, []);
      probabilities.get(key).push(cell.pConfirmedUpperBound);
    }
  }
  const cardIds = [...new Set([...probabilities.keys()].map((key) => key.split("|")[0]))].sort();
  if (cardIds.length !== 22 || probabilities.size !== 44) throw new Error("lambda input is not the 22-card by 2-half grid");
  const perCard = cardIds.map((cardId) => {
    const strengths = probabilities.get(`${cardId}|strength`);
    const weaknesses = probabilities.get(`${cardId}|weakness`);
    if (strengths.length !== 10 || weaknesses.length !== 10) throw new Error(`incomplete A-world probability rows for ${cardId}`);
    const pStrength = mean(strengths);
    const pWeakness = mean(weaknesses);
    const pEither = pStrength + pWeakness - pStrength * pWeakness;
    return { cardId, pStrength, pWeakness, pEither };
  });
  const lambda = perCard.reduce((sum, row) => sum + row.pEither, 0);
  const priorReference = 0.2817011046580063;
  if (Math.abs(lambda - priorReference) > 1e-9) throw new Error(`lambda recomputation mismatch: ${lambda} vs preregistered reference ${priorReference}`);
  const poissonTail = (k) => {
    let p = Math.exp(-lambda);
    let cumulative = p;
    for (let i = 1; i <= k; i++) {
      p *= lambda / i;
      cumulative += p;
    }
    return Math.max(0, 1 - cumulative);
  };
  let maxAllowed = 2;
  while (!(poissonTail(maxAllowed) < 0.001)) maxAllowed++;
  return {
    source: "A-only, 10 diagnostic worlds × 44 strategy-level card-half cells; average each cell's pConfirmedUpperBound over A worlds, combine each card's two halves by union probability, sum 22 card probabilities",
    worlds: worlds.length,
    cellsPerWorld: worlds[0].cells.length,
    cardCount: cardIds.length,
    perCard,
    lambda,
    oldBounds: { meanAtMost: 0.5, maxAtMost: A_B_OLD_MAX_BOUND },
    newBounds: {
      meanAtMost: Math.max(A_B_NEW_MEAN_BOUND, 1.5 * lambda),
      maxAtMost: maxAllowed,
      poissonTailAtMaxMinusOne: poissonTail(maxAllowed - 1),
      poissonTailAtMax: poissonTail(maxAllowed),
    },
    priorReference: 0.2817011046580063,
  };
}

function coverageByCondition(worlds) {
  const cardIds = CLAIM_CARDS.map((card) => card.id);
  const out = {};
  for (const condition of ["A_ZERO_DRIFT", "B_CONSTANT_UP_DRIFT", "C_CARD_PLANTED", "C-D_DONCHIAN20_REPORT_ONLY"]) {
    const selected = worlds.filter((world) => world.condition === condition);
    out[condition] = Object.fromEntries(cardIds.map((cardId) => {
      const totals = { EFFICIENT: 0, CHOPPY: 0, UNKNOWN: 0, total: 0 };
      for (const world of selected) {
        const row = world.stateEntryCounts[cardId];
        totals.EFFICIENT += row.EFFICIENT;
        totals.CHOPPY += row.CHOPPY;
        totals.UNKNOWN += row.UNKNOWN;
        totals.total += row.total;
      }
      totals.unknownShare = totals.total ? totals.UNKNOWN / totals.total : 0;
      totals.identityPass = totals.EFFICIENT + totals.CHOPPY + totals.UNKNOWN === totals.total;
      return [cardId, totals];
    }));
  }
  return out;
}

function weightedGross(worlds, predicate) {
  const rows = worlds.filter(predicate).map((world) => world.plantedCardStats).filter((row) => row && row.tradeCount > 0);
  const n = rows.reduce((sum, row) => sum + row.tradeCount, 0);
  return n ? rows.reduce((sum, row) => sum + row.meanGrossR * row.tradeCount, 0) / n : null;
}

function runOneWorld(condition, worldIndex, seed, prep) {
  const noise = makeNoiseSegments({ seed, barsPerSegment: BARS_PER_SEGMENT });
  let segments;
  let planting = null;
  let extra = {};
  if (condition === "A_ZERO_DRIFT") {
    segments = barsFromNoise(noise);
  } else if (condition === "B_CONSTANT_UP_DRIFT") {
    segments = barsFromNoise(noise, { driftPerBar: prep.conditionBCalibration.calibratedDriftPerBar });
  } else if (condition === "C_CARD_PLANTED") {
    const planted = buildCardWindowPlant(noise, prep.selection.plantedCardId, prep.calibration.calibratedDriftPerBar, { edgeBars: prep.calibration.edgeBars });
    segments = planted.segments;
    planting = planted.metadata;
    extra = { plantedCardId: prep.selection.plantedCardId, strengthState: prep.selection.strengthState };
  } else {
    const planted = plantDonchian20(noise, seed);
    segments = planted.segments;
    planting = planted.metadata;
    extra = { plantedCardId: "donchian-20", strengthState: FAMILY_STRENGTH_STATE[CLAIM_CARDS.find((card) => card.id === "donchian-20").family] };
  }
  return {
    condition,
    world: worldIndex + 1,
    ...scoreSegments(segments, seed, condition, extra),
    planting,
    constantDriftPerBar: condition === "B_CONSTANT_UP_DRIFT" ? prep.conditionBCalibration.calibratedDriftPerBar : null,
  };
}

function summarizeAll(worlds, prep, lambdaModel) {
  const groups = Object.fromEntries(["A_ZERO_DRIFT", "B_CONSTANT_UP_DRIFT", "C_CARD_PLANTED", "C-D_DONCHIAN20_REPORT_ONLY"].map((condition) => [condition, worlds.filter((world) => world.condition === condition)]));
  const A = summarizeConfirmedCounts(groups.A_ZERO_DRIFT);
  const B = summarizeConfirmedCounts(groups.B_CONSTANT_UP_DRIFT);
  const C = groups.C_CARD_PLANTED;
  const CD = groups["C-D_DONCHIAN20_REPORT_ONLY"];
  const oldMeanBound = lambdaModel.oldBounds.meanAtMost;
  const newMeanBound = lambdaModel.newBounds.meanAtMost;
  const oldMaxBound = lambdaModel.oldBounds.maxAtMost;
  const newMaxBound = lambdaModel.newBounds.maxAtMost;
  const CCard = prep.selection.plantedCardId;
  const CConfirmedWorlds = C.filter((world) => world.confirmedCards.includes(CCard)).length;
  const CMeasuredGross = weightedGross(C, () => true);
  const contaminationExcluded = new Set(prep.contamination.excludedCardIds);
  const COtherCounts = C.map((world) => world.confirmedCards.filter((cardId) => cardId !== CCard && !contaminationExcluded.has(cardId)).length);
  const COtherMean = mean(COtherCounts);
  const CDOccurrences = CD.filter((world) => world.confirmedCards.includes("donchian-20")).length;
  const CDEachWorld = CD.map((world) => ({ world: world.world, seed: world.seed, confirmedCards: world.confirmedCards }));
  const CCriteria = {
    plantedCardConfirmedAtLeast8Of10: CConfirmedWorlds >= C_CONFIRM_MIN,
    measuredGrossWithin005ROfPilotTarget: CMeasuredGross != null && Math.abs(CMeasuredGross - prep.calibration.plantedGrossTargetR) <= C_GROSS_TOLERANCE,
    nonPlantedNonExcludedConfirmationsMeanAtMostHalf: COtherMean != null && COtherMean <= C_OTHER_MEAN_MAX,
  };
  const result = {
    A: {
      ...A,
      observedMeanAndMax: { mean: A.meanConfirmedCards, max: A.maxConfirmedCards },
      lambda: lambdaModel.lambda,
      oldBounds: lambdaModel.oldBounds,
      newBounds: lambdaModel.newBounds,
      oldPass: A.meanConfirmedCards <= oldMeanBound && A.maxConfirmedCards <= oldMaxBound,
      newPass: A.meanConfirmedCards <= newMeanBound && A.maxConfirmedCards <= newMaxBound,
      oldFailureReason: { mean: A.meanConfirmedCards > oldMeanBound, max: A.maxConfirmedCards > oldMaxBound },
    },
    B: {
      ...B,
      observedMeanAndMax: { mean: B.meanConfirmedCards, max: B.maxConfirmedCards },
      lambda: lambdaModel.lambda,
      oldBounds: lambdaModel.oldBounds,
      newBounds: lambdaModel.newBounds,
      oldPass: B.meanConfirmedCards <= oldMeanBound && B.maxConfirmedCards <= oldMaxBound,
      newPass: B.meanConfirmedCards <= newMeanBound && B.maxConfirmedCards <= newMaxBound,
      calibration: {
        driftPerBar: prep.conditionBCalibration.calibratedDriftPerBar,
        targetRandomLongNetR: prep.conditionBCalibration.targetRandomLongNetR,
        scoredMeanRandomLongNetR: mean(groups.B_CONSTANT_UP_DRIFT.map((world) => world.randomLong.meanNetR)),
      },
    },
    C: {
      worlds: C.length,
      plantedCardId: CCard,
      plantedCardStrengthState: prep.selection.strengthState,
      confirmationsOfPlantedCard: CConfirmedWorlds,
      plantedGrossTargetR: prep.calibration.plantedGrossTargetR,
      plantedGrossObservedR: CMeasuredGross,
      grossToleranceR: C_GROSS_TOLERANCE,
      excludedContaminationCards: [...contaminationExcluded].sort(),
      otherNonExcludedConfirmationCounts: COtherCounts,
      meanOtherNonExcludedConfirmations: COtherMean,
      criteria: CCriteria,
      pass: Object.values(CCriteria).every(Boolean),
    },
    C_D: {
      worlds: CD.length,
      cardId: "donchian-20",
      confirmedWorlds: CDOccurrences,
      confirmedListsByWorld: CDEachWorld,
      passCriterion: null,
      status: "REPORT_ONLY_NO_PASS_CRITERION",
    },
    criteria: {
      A_old_mean_max: { observed: A.meanConfirmedCards, observedMax: A.maxConfirmedCards, lambda: lambdaModel.lambda, meanBound: oldMeanBound, maxBound: oldMaxBound, pass: resultPass(A, oldMeanBound, oldMaxBound) },
      A_new_mean_max: { observed: A.meanConfirmedCards, observedMax: A.maxConfirmedCards, lambda: lambdaModel.lambda, meanBound: newMeanBound, maxBound: newMaxBound, pass: resultPass(A, newMeanBound, newMaxBound) },
      B_old_mean_max: { observed: B.meanConfirmedCards, observedMax: B.maxConfirmedCards, lambda: lambdaModel.lambda, meanBound: oldMeanBound, maxBound: oldMaxBound, pass: resultPass(B, oldMeanBound, oldMaxBound) },
      B_new_mean_max: { observed: B.meanConfirmedCards, observedMax: B.maxConfirmedCards, lambda: lambdaModel.lambda, meanBound: newMeanBound, maxBound: newMaxBound, pass: resultPass(B, newMeanBound, newMaxBound) },
      ...Object.fromEntries(Object.entries(CCriteria).map(([key, pass]) => [`C_${key}`, { pass }])),
    },
  };
  result.overallPass = result.A.newPass && result.B.newPass && result.C.pass;
  return { groups, summary: result };
}

function resultPass(summary, meanBound, maxBound) {
  return summary.meanConfirmedCards <= meanBound && summary.maxConfirmedCards <= maxBound;
}

function buildCoverage(worlds) {
  const byCondition = coverageByCondition(worlds);
  const all = Object.fromEntries(CLAIM_CARDS.map((card) => [card.id, { EFFICIENT: 0, CHOPPY: 0, UNKNOWN: 0, total: 0 }]));
  for (const world of worlds) {
    for (const [cardId, row] of Object.entries(world.stateEntryCounts)) {
      for (const key of ["EFFICIENT", "CHOPPY", "UNKNOWN", "total"]) all[cardId][key] += row[key];
    }
  }
  for (const row of Object.values(all)) {
    row.unknownShare = row.total ? row.UNKNOWN / row.total : 0;
    row.identityPass = row.EFFICIENT + row.CHOPPY + row.UNKNOWN === row.total;
  }
  const identitiesPass = Object.values(byCondition).every((rows) => Object.values(rows).every((row) => row.identityPass));
  return { byCondition, allWorlds: all, identitiesPass };
}

export function renderReport(report) {
  const fmt = (x, n = 3) => Number.isFinite(x) ? x.toFixed(n) : "—";
  const lines = [
    "# G0 Amendment 8 — one-time Stage 3b synthetic run",
    "",
    `**Run:** ${report.generatedAt} (Africa/Nairobi). **${report.overallPass ? "PASS" : "FAIL"}.** Four conditions × 10 worlds × 60,000 bars. Stage 4 was not run.`,
    "",
    `The authorized A/B bound is mean ≤ max(0.5, 1.5λ) and max ≤ the smallest k≥2 with P(Poisson(λ)>k)<0.001. λ was recomputed as ${fmt(report.lambdaModel.lambda, 9)} from the A-only 44-cell model (22 card IDs × strength/weakness, ten A worlds). The observed A/B values below are always adjacent to λ and both old/new bounds.`,
    "",
    `| Condition | Observed mean confirmed cards | Observed max | λ | Old mean/max bound | New mean/max bound | Old result | New result |`,
    `|---|---:|---:|---:|---|---|---|---|`,
    ...["A", "B"].map((key) => {
      const row = report.summary[key];
      return `| ${key} | ${fmt(row.meanConfirmedCards)} | ${row.maxConfirmedCards} | ${fmt(row.lambda, 9)} | ≤${fmt(row.oldBounds.meanAtMost, 3)} / ≤${row.oldBounds.maxAtMost} | ≤${fmt(row.newBounds.meanAtMost, 3)} / ≤${row.newBounds.maxAtMost} | ${row.oldPass ? "PASS" : "FAIL"} | ${row.newPass ? "PASS" : "FAIL"} |`;
    }),
    "",
    `λ recomputation: ${report.lambdaModel.cellsPerWorld} cell probabilities/world × ${report.lambdaModel.worlds} A worlds; union per card then sum ${report.lambdaModel.cardCount} card probabilities = ${fmt(report.lambdaModel.lambda, 12)}. Poisson tails: P(X>${report.lambdaModel.newBounds.maxAtMost - 1})=${fmt(report.lambdaModel.newBounds.poissonTailAtMaxMinusOne, 6)}, P(X>${report.lambdaModel.newBounds.maxAtMost})=${fmt(report.lambdaModel.newBounds.poissonTailAtMax, 6)}.`,
    "",
    `A/B tradeoff reminder: A’s prior 0.700 mean / max 4 is inside the new bounds; this approved calibration will not detect an approximately 0.28-cards/world leaked-drift defect. The change calibrates the criterion to 44-cell multiplicity; it does not treat that anomaly as benign.`,
    "",
    `B control: constant additive drift ${fmt(report.summary.B.calibration.driftPerBar, 8)} price/bar; scored random-long net ${fmt(report.summary.B.calibration.scoredMeanRandomLongNetR, 4)}R versus the +0.15R pilot target.`,
    "",
    "## Condition C preregistration and result",
    "",
    `Planted card **${report.summary.C.plantedCardId}** (${report.summary.C.plantedCardStrengthState}); exclusions frozen before scored worlds: **${report.summary.C.excludedContaminationCards.join(", ") || "none"}**. Calibration target gross ${fmt(report.summary.C.plantedGrossTargetR, 4)}R; scored gross ${fmt(report.summary.C.plantedGrossObservedR, 4)}R; planted-card confirmations ${report.summary.C.confirmationsOfPlantedCard}/10; mean non-planted/non-excluded confirmations ${fmt(report.summary.C.meanOtherNonExcludedConfirmations)}.`,
    "",
    "| Condition C criterion | Result |",
    "|---|---|",
    ...Object.entries(report.summary.C.criteria).map(([key, pass]) => `| ${key} | ${pass ? "PASS" : "FAIL"} |`),
    "",
    `Condition C event diagnostics (24-bar first; 12-bar contingency applied if preregistered): edge=${report.preRegistration.calibration.edgeBars} bars, drift=${fmt(report.preRegistration.calibration.calibratedDriftPerBar, 8)} price/bar, gross target=${fmt(report.preRegistration.calibration.plantedGrossTargetR, 4)}R, pilot measured cost=${fmt(report.preRegistration.calibration.measuredPilotMeanCostR, 4)}R, exclusions=${report.preRegistration.contamination.excludedCardIds.join(", ") || "none"}.`,
    "",
    "| World | Seed | Planted signal events | Planted windows | Window-bar share | Planted strength trades | Gross R | Net R | Cards confirmed |",
    "|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ...report.worlds.filter((world) => world.condition === "C_CARD_PLANTED").map((world) => `| ${world.world} | ${world.seed} | ${world.planting.eligibleSignalCount} | ${world.planting.plantedWindowCount} | ${fmt(world.planting.windowBarShare * 100, 2)}% | ${world.plantedCardStats.tradeCount} | ${fmt(world.plantedCardStats.meanGrossR, 4)} | ${fmt(world.plantedCardStats.meanNetR, 4)} | ${world.confirmedCards.join(", ") || "none"} |`),
    "",
    "## Condition C-D — report-only",
    "",
    `Original Donchian-20 planting: ${report.summary.C_D.confirmedWorlds}/10 worlds confirmed the card; no pass criterion applies. Per-world confirmed card lists:`,
    "",
    ...report.summary.C_D.confirmedListsByWorld.map((row) => `- World ${row.world}, seed ${row.seed}: ${row.confirmedCards.join(", ") || "none"}`),
    "",
    "## Per-world A/B/C/C-D confirmation lists",
    "",
    "| Condition | World | Seed | Unique confirmed cards | Count | B random-long net R |",
    "|---|---:|---:|---|---:|---:|",
    ...report.worlds.map((world) => `| ${world.condition} | ${world.world} | ${world.seed} | ${world.confirmedCards.join(", ") || "none"} | ${world.cardConfirmedCount} | ${world.randomLong.meanNetR == null ? "—" : fmt(world.randomLong.meanNetR, 4)} |`),
    "",
    "## UNKNOWN entry coverage (executed in card slots; unbinned from both verdict cells)",
    "",
    "Every kept card trade is categorized by its entry-time verdict state. UNKNOWN trades remain executed in their independent per-card slot books, but `groupByStrategyVerdictState` excludes null verdict states from both EFFICIENT and CHOPPY verdict cells.",
    "",
    "| Condition | Card | EFFICIENT | CHOPPY | UNKNOWN | Total book | UNKNOWN share | Identity |",
    "|---|---|---:|---:|---:|---:|---:|---|",
    ...Object.entries(report.coverage.byCondition).flatMap(([condition, rows]) => Object.entries(rows).map(([cardId, row]) => `| ${condition} | ${cardId} | ${row.EFFICIENT} | ${row.CHOPPY} | ${row.UNKNOWN} | ${row.total} | ${fmt(row.unknownShare * 100, 2)}% | ${row.identityPass ? "PASS" : "FAIL"} |`)),
    "",
    `All-world identities: ${report.coverage.identitiesPass ? "PASS" : "FAIL"}; every card satisfies EFFICIENT + CHOPPY + UNKNOWN = total book.`,
    "",
    "## Conditions and hard-stop result",
    "",
    `| Criterion | Result |`,
    `|---|---|`,
    ...Object.entries(report.summary.criteria).map(([key, row]) => `| ${key} | ${row.pass ? "PASS" : "FAIL"} |`),
    `| All Part 4 criteria (C-D excluded as report-only) | ${report.summary.overallPass ? "PASS" : "FAIL"} |`,
    `| Unknown-entry book identities | ${report.coverage.identitiesPass ? "PASS" : "FAIL"} |`,
    `| Stage 4 output absence guard | ${report.stage4OutputAbsent ? "PASS" : "FAIL"} |`,
    "",
    report.summary.overallPass && report.coverage.identitiesPass && report.stage4OutputAbsent
      ? "**PASS:** report is complete; save/commit/push outputs and stop. Do not run Stage 4."
      : "**FAIL — HARD STOP:** do not rerun Stage 3 and do not start Stage 4.",
    "",
    "Full JSON output: `artifacts/map-compass/a8-stage3b-report.json`.",
    "",
  ];
  return lines.join("\n");
}

export function runStage3b() {
  if (existsSync(OUTPUT_JSON) || existsSync(OUTPUT_MD)) throw new Error("Stage 3b report already exists; this is a single-use run and may not be repeated.");
  requireOutputGuard();
  const prep = readAndValidatePrep();
  const lambdaModel = recomputeLambda();
  const seeds = new Set();
  const conditions = ["A_ZERO_DRIFT", "B_CONSTANT_UP_DRIFT", "C_CARD_PLANTED", "C-D_DONCHIAN20_REPORT_ONLY"];
  const worlds = [];
  for (let conditionIndex = 0; conditionIndex < conditions.length; conditionIndex++) {
    const condition = conditions[conditionIndex];
    for (let worldIndex = 0; worldIndex < WORLDS_PER_CONDITION; worldIndex++) {
      const seed = SCORED_SEED_BASE + conditionIndex * 1000 + worldIndex;
      if (prep.pilotSeeds.includes(seed) || seeds.has(seed)) throw new Error(`non-disjoint or duplicate scored seed ${seed}`);
      seeds.add(seed);
      worlds.push(runOneWorld(condition, worldIndex, seed, prep));
      console.log(`${condition} world ${worldIndex + 1}/${WORLDS_PER_CONDITION} complete; seed ${seed}; cards confirmed ${worlds.at(-1).cardConfirmedCount}`);
      if (global.gc) global.gc();
    }
  }
  const { groups, summary } = summarizeAll(worlds, prep, lambdaModel);
  const coverage = buildCoverage(worlds);
  requireOutputGuard();
  const report = {
    generatedAt: new Date().toISOString(),
    stage: "A8_PART_4_STAGE_3B_ONE_TIME_SYNTHETIC_RUN",
    runCount: 1,
    passCriteria: "A and B: approved lambda-calibrated no-edge bounds; C: planted card >=8/10, planted gross within ±0.05R of pilot gross, non-planted/non-excluded confirmations <=0.5/world; C-D report-only/no criterion",
    worldsPerCondition: WORLDS_PER_CONDITION,
    barsPerWorld: BARS_PER_WORLD,
    barsPerSegment: BARS_PER_SEGMENT,
    conditions,
    seeds: Object.fromEntries(conditions.map((condition) => [condition, worlds.filter((world) => world.condition === condition).map((world) => world.seed)])),
    lambdaModel,
    preRegistration: prep,
    worlds,
    summaries: Object.fromEntries(Object.entries(groups).map(([condition, rows]) => [condition, summarizeConfirmedCounts(rows)])),
    summary,
    coverage,
    stage4OutputAbsent: !existsSync(CLAIM_VERIFICATION) && !existsSync(CLAIMED_TRADES),
    noRealMarketBarsUsedInScoredWorlds: true,
    frozenMapExitsCostsCardsAndConfirmSemanticsUnchanged: true,
  };
  report.overallPass = summary.overallPass && coverage.identitiesPass && report.stage4OutputAbsent;
  writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2) + "\n");
  writeFileSync(OUTPUT_MD, renderReport(report));
  console.log(`Stage 3b ${report.overallPass ? "PASS" : "FAIL — HARD STOP"}; report saved to ${OUTPUT_JSON}`);
  if (!report.overallPass) process.exitCode = 1;
  return report;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("a8-stage3b-run.mjs")) {
  try {
    runStage3b();
  } catch (error) {
    console.error(`A8 Stage 3b aborted: ${error.stack ?? error.message}`);
    process.exit(2);
  }
}
