import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { generateStage2BPath } from "../src/lib/synth-v2/stage2b-regimes.ts";
import { STAGE2B_REGIMES } from "../src/lib/synth-v2/stage2b-types.ts";
import {
  STAGE3_ALL_REGIMES,
  STAGE3_EXCLUDED_REGIMES,
  STAGE3_HEADLINE_REGIMES,
} from "../src/lib/synth-v2/stage3/types.ts";
import {
  extractTrainingDataset,
  evaluateModelOnCohort,
  preparePathData,
  computePlaceboBaseline,
} from "../src/lib/synth-v2/stage3/evaluator.ts";
import {
  trainDecisionTree,
} from "../src/lib/synth-v2/stage3/models.ts";

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

const profile = JSON.parse(readFileSync("src/lib/synth-v2/profile.json", "utf8"));
const calibration = JSON.parse(readFileSync("src/lib/synth-v2/STAGE2C-REAL-BANDS.json", "utf8"));
const seeds = JSON.parse(readFileSync("src/lib/synth-v2/STAGE2C-SEEDS.json", "utf8"));
const frozen = JSON.parse(readFileSync("src/lib/synth-v2/stage3/STAGE3-FROZEN-DETECTOR.json", "utf8"));

const frozenModel = {
  name: frozen.selectedVariant.name,
  type: frozen.modelDetails.type,
  maxDepth: frozen.modelDetails.maxDepth,
  cParam: frozen.modelDetails.cParam,
  hysteresis: frozen.hysteresis,
  weights: frozen.modelDetails.weights,
  treeNode: frozen.modelDetails.treeNode,
  featureStats: frozen.modelDetails.featureStats,
};

console.log("=== STAGE 3 FINAL RUN ===");
console.log("Frozen Model:", frozenModel.name, "Hysteresis:", frozenModel.hysteresis);

// 1. Prepare DESIGN TRAIN (8001-8100)
console.log("\n[1/5] Preparing DESIGN TRAIN (seeds 8001-8100)...");
const trainPaths = [];
for (let seed = 8001; seed <= 8100; seed++) {
  const p = generateStage2BPath(profile, calibration, { set: "DESIGN", seed });
  trainPaths.push(preparePathData(p));
}
const { X: trainX, y: trainY } = extractTrainingDataset(trainPaths);

// Baseline B1: Majority class in TRAIN
const trainClassCounts = Array(7).fill(0);
for (const cls of trainY) trainClassCounts[cls]++;
const b1MajorityClassIndex = trainClassCounts.indexOf(Math.max(...trainClassCounts));
const b1MajorityRegime = STAGE3_ALL_REGIMES[b1MajorityClassIndex];
console.log(`Baseline B1 Majority Class: ${b1MajorityRegime} (index ${b1MajorityClassIndex})`);

// Baseline B3: Naive depth-2 decision tree on {drift_z_20 (idx 4), log_atr_20 (idx 1)}
console.log("Training Baseline B3 (naive depth-2 tree on drift_z_20 and log_atr_20)...");
const b3TrainX = trainX.map(row => [row[4], row[1]]); // only 2 features
const b3Tree = trainDecisionTree(b3TrainX, trainY, 7, 2);

const b3FeatureStats = {
  means: {
    log_atr_5: 0,
    log_atr_20: frozenModel.featureStats.means.log_atr_20,
    log_atr_60: 0,
    drift_z_10: 0,
    drift_z_20: frozenModel.featureStats.means.drift_z_20,
    drift_z_60: 0,
    vr8_20: 0,
    vr16_20: 0,
    vr8_60: 0,
    vr16_60: 0,
    max_range_atr_5: 0,
    max_gap_atr_5: 0,
  },
  sds: {
    log_atr_5: 1,
    log_atr_20: frozenModel.featureStats.sds.log_atr_20,
    log_atr_60: 1,
    drift_z_10: 1,
    drift_z_20: frozenModel.featureStats.sds.drift_z_20,
    drift_z_60: 1,
    vr8_20: 1,
    vr16_20: 1,
    vr8_60: 1,
    vr16_60: 1,
    max_range_atr_5: 1,
    max_gap_atr_5: 1,
  },
};

const b3Model = {
  name: "Naive_B3_depth2",
  type: "decision_tree",
  maxDepth: 2,
  hysteresis: { k: 1, d: 0 },
  treeNode: {
    ...b3Tree,
    // Remap feature indices 0 -> 4 (drift_z_20), 1 -> 1 (log_atr_20)
  },
  featureStats: frozenModel.featureStats,
};

function remapTreeIndices(node) {
  if (node.isLeaf) return { ...node };
  const remappedIndex = node.featureIndex === 0 ? 4 : 1;
  return {
    ...node,
    featureIndex: remappedIndex,
    left: remapTreeIndices(node.left),
    right: remapTreeIndices(node.right),
  };
}
b3Model.treeNode = remapTreeIndices(b3Tree);

// 2. Prepare DESIGN VALIDATE (8101-8200)
console.log("\n[2/5] Preparing DESIGN VALIDATE (seeds 8101-8200)...");
const valPaths = [];
for (let seed = 8101; seed <= 8200; seed++) {
  const p = generateStage2BPath(profile, calibration, { set: "DESIGN", seed });
  valPaths.push(preparePathData(p));
}

// 3. Prepare NULL-SELECT and NULL-FINAL
console.log("\n[3/5] Preparing NULL cohorts...");
const nullSelectPaths = [];
const nullFinalPaths = [];

for (const r of STAGE2B_REGIMES) {
  const seedsSelect = seeds.nullSeedsByRegime[r.id].slice(0, 50);
  for (const seed of seedsSelect) {
    const p = generateStage2BPath(profile, calibration, { set: "NULL", seed, regimeId: r.id });
    nullSelectPaths.push(preparePathData(p));
  }
  const seedsFinal = seeds.nullSeedsByRegime[r.id].slice(50, 100);
  for (const seed of seedsFinal) {
    const p = generateStage2BPath(profile, calibration, { set: "NULL", seed, regimeId: r.id });
    nullFinalPaths.push(preparePathData(p));
  }
}

// 4. Generate and Prepare LOCKED TEST (6001-6200) exactly once in memory
console.log("\n[4/5] Generating LOCKED TEST (seeds 6001-6200) in memory (once)...");
const lockedPaths = [];
for (let seed = 6001; seed <= 6200; seed++) {
  const p = generateStage2BPath(profile, calibration, { set: "LOCKED TEST", seed });
  // For LOCKED, score all paths per Rule:
  // "otherwise score all LOCKED paths and report the DESIGN frequency."
  const prepared = preparePathData(p);
  prepared.isAbsurd = false; // score all locked paths
  lockedPaths.push(prepared);
}
console.log(`LOCKED TEST generated: ${lockedPaths.length} paths.`);

// 5. Evaluate models
console.log("\n[5/5] Scoring VALIDATE and LOCKED TEST cohorts...");

// Evaluate B3 Naive on VALIDATE and LOCKED
const valMetricsB3 = evaluateModelOnCohort(b3Model, valPaths, nullSelectPaths);
const lockedMetricsB3 = evaluateModelOnCohort(b3Model, lockedPaths, nullFinalPaths);
console.log(`B3 Naive BalAcc: VALIDATE=${(valMetricsB3.balancedAccuracyHeadline * 100).toFixed(2)}%, LOCKED=${(lockedMetricsB3.balancedAccuracyHeadline * 100).toFixed(2)}%`);

// Evaluate Frozen Model on VALIDATE
const valMetrics = evaluateModelOnCohort(frozenModel, valPaths, nullSelectPaths);
const valPlacebo = computePlaceboBaseline(frozenModel, valPaths, 1000);

// Evaluate Frozen Model on LOCKED TEST
const lockedMetrics = evaluateModelOnCohort(frozenModel, lockedPaths, nullFinalPaths);
const lockedPlacebo = computePlaceboBaseline(frozenModel, lockedPaths, 1000);

console.log("\n==========================================");
console.log("=== RESULTS SUMMARY ===");
console.log("--- VALIDATE ---");
console.log("Headline Balanced Accuracy:", (valMetrics.balancedAccuracyHeadline * 100).toFixed(2) + "%");
console.log("All-7 Balanced Accuracy:", (valMetrics.balancedAccuracyAll * 100).toFixed(2) + "%");
console.log("Placebo B2 p95:", (valPlacebo.p95 * 100).toFixed(2) + "%");
console.log("Naive B3:", (valMetricsB3.balancedAccuracyHeadline * 100).toFixed(2) + "%");
console.log("Median Delay:", valMetrics.medianDelayHeadline, "weekdays");
console.log("Share Detected Before End:", (valMetrics.shareDetectedBeforeEndHeadline * 100).toFixed(1) + "%");
console.log("NULL False Switch Rate (SELECT):", (valMetrics.nullFalseSwitchRateHeadline * 100).toFixed(3) + "%");

console.log("\n--- LOCKED TEST ---");
console.log("Headline Balanced Accuracy:", (lockedMetrics.balancedAccuracyHeadline * 100).toFixed(2) + "%");
console.log("All-7 Balanced Accuracy:", (lockedMetrics.balancedAccuracyAll * 100).toFixed(2) + "%");
console.log("Placebo B2 p95:", (lockedPlacebo.p95 * 100).toFixed(2) + "%");
console.log("Naive B3:", (lockedMetricsB3.balancedAccuracyHeadline * 100).toFixed(2) + "%");
console.log("Median Delay:", lockedMetrics.medianDelayHeadline, "weekdays");
console.log("Share Detected Before End:", (lockedMetrics.shareDetectedBeforeEndHeadline * 100).toFixed(1) + "%");
console.log("NULL False Switch Rate (FINAL):", (lockedMetrics.nullFalseSwitchRateHeadline * 100).toFixed(3) + "%");

// Check Pass Bars on LOCKED TEST
const passD1_threshold = lockedMetrics.balancedAccuracyHeadline >= 0.40;
const passD1_naive = lockedMetrics.balancedAccuracyHeadline >= (lockedMetricsB3.balancedAccuracyHeadline + 0.03);
const passD1_placebo = lockedMetrics.balancedAccuracyHeadline > lockedPlacebo.p95;
const passD1 = passD1_threshold && passD1_naive && passD1_placebo;

const passD2_median = lockedMetrics.medianDelayHeadline <= 10;
const passD2_share = lockedMetrics.shareDetectedBeforeEndHeadline >= 0.80;
const passD2 = passD2_median && passD2_share;

const passD3 = lockedMetrics.nullFalseSwitchRateHeadline <= 0.05;

const headlineRecallsLocked = STAGE3_HEADLINE_REGIMES.map(r => lockedMetrics.perClassRecall[r]);
const passD4 = headlineRecallsLocked.every(rec => rec >= 0.25);

const overallPass = passD1 && passD2 && passD3 && passD4;
const finalVerdict = overallPass ? "PASS" : "FAIL";

console.log("\n--- PASS BARS ON LOCKED TEST ---");
console.log(`D-1 (Balanced Acc >= 0.40 & >= B3+0.03 & > B2 p95): ${passD1 ? "PASS" : "FAIL"} (acc=${(lockedMetrics.balancedAccuracyHeadline * 100).toFixed(2)}%, B3+0.03=${((lockedMetricsB3.balancedAccuracyHeadline + 0.03)*100).toFixed(2)}%, B2 p95=${(lockedPlacebo.p95 * 100).toFixed(2)}%)`);
console.log(`D-2 (Median Delay <= 10 & Share >= 80%): ${passD2 ? "PASS" : "FAIL"} (median=${lockedMetrics.medianDelayHeadline} days, share=${(lockedMetrics.shareDetectedBeforeEndHeadline * 100).toFixed(1)}%)`);
console.log(`D-3 (NULL-FINAL False Switch <= 0.05): ${passD3 ? "PASS" : "FAIL"} (rate=${(lockedMetrics.nullFalseSwitchRateHeadline * 100).toFixed(3)}%)`);
console.log(`D-4 (Per-class Recall >= 0.25 for all 5 headline classes): ${passD4 ? "PASS" : "FAIL"}`);
for (const r of STAGE3_HEADLINE_REGIMES) {
  console.log(`   - ${r}: ${(lockedMetrics.perClassRecall[r] * 100).toFixed(2)}%`);
}
console.log(`\nFINAL VERDICT: ${finalVerdict}`);
console.log("==========================================\n");

const finalResults = {
  schemaVersion: 1,
  runDate: new Date().toISOString(),
  finalVerdict,
  frozenModelName: frozenModel.name,
  passBars: {
    D1: {
      pass: passD1,
      balancedAccuracy: lockedMetrics.balancedAccuracyHeadline,
      baselineB3: lockedMetricsB3.balancedAccuracyHeadline,
      baselineB3PlusMargin: lockedMetricsB3.balancedAccuracyHeadline + 0.03,
      baselineB2P95: lockedPlacebo.p95,
      threshold: 0.40,
    },
    D2: {
      pass: passD2,
      medianDelay: lockedMetrics.medianDelayHeadline,
      shareDetectedBeforeEnd: lockedMetrics.shareDetectedBeforeEndHeadline,
      delays: lockedMetrics.delaysHeadline,
    },
    D3: {
      pass: passD3,
      nullFinalFalseSwitchRate: lockedMetrics.nullFalseSwitchRateHeadline,
      threshold: 0.05,
    },
    D4: {
      pass: passD4,
      recalls: Object.fromEntries(STAGE3_HEADLINE_REGIMES.map(r => [r, lockedMetrics.perClassRecall[r]])),
      threshold: 0.25,
    },
  },
  validateMetrics: valMetrics,
  lockedMetrics: lockedMetrics,
  baselineB1: {
    majorityRegime: b1MajorityRegime,
  },
  baselineB2: {
    validateP95: valPlacebo.p95,
    lockedP95: lockedPlacebo.p95,
  },
  baselineB3: {
    validateBalAcc: valMetricsB3.balancedAccuracyHeadline,
    lockedBalAcc: lockedMetricsB3.balancedAccuracyHeadline,
  },
};

const resultsJson = JSON.stringify(finalResults, null, 2) + "\n";
writeFileSync("src/lib/synth-v2/stage3/STAGE3-RESULTS.json", resultsJson);
const resultsSha = sha256(resultsJson);
writeFileSync("src/lib/synth-v2/stage3/STAGE3-RESULTS.sha256", resultsSha + "  src/lib/synth-v2/stage3/STAGE3-RESULTS.json\n");

console.log("Wrote results to src/lib/synth-v2/stage3/STAGE3-RESULTS.json (SHA-256: " + resultsSha + ")");
