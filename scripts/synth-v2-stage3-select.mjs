import { readFileSync, writeFileSync } from "node:fs";
import { generateStage2BPath } from "../src/lib/synth-v2/stage2b-regimes.ts";
import { STAGE2B_REGIMES } from "../src/lib/synth-v2/stage2b-types.ts";
import {
  extractTrainingDataset,
  evaluateModelOnCohort,
  preparePathData,
} from "../src/lib/synth-v2/stage3/evaluator.ts";
import {
  trainDecisionTree,
  trainMultinomialLogistic,
} from "../src/lib/synth-v2/stage3/models.ts";

const profile = JSON.parse(readFileSync("src/lib/synth-v2/profile.json", "utf8"));
const calibration = JSON.parse(readFileSync("src/lib/synth-v2/STAGE2C-REAL-BANDS.json", "utf8"));
const seeds = JSON.parse(readFileSync("src/lib/synth-v2/STAGE2C-SEEDS.json", "utf8"));

console.log("Preparing DESIGN TRAIN (seeds 8001-8100)...");
const trainPaths = [];
for (let seed = 8001; seed <= 8100; seed++) {
  const p = generateStage2BPath(profile, calibration, { set: "DESIGN", seed });
  trainPaths.push(preparePathData(p));
}

console.log("Preparing DESIGN VALIDATE (seeds 8101-8200)...");
const valPaths = [];
for (let seed = 8101; seed <= 8200; seed++) {
  const p = generateStage2BPath(profile, calibration, { set: "DESIGN", seed });
  valPaths.push(preparePathData(p));
}

console.log("Preparing NULL-SELECT (first 50 seeds per regime)...");
const nullSelectPaths = [];
for (const r of STAGE2B_REGIMES) {
  const regimeSeeds = seeds.nullSeedsByRegime[r.id].slice(0, 50);
  for (const seed of regimeSeeds) {
    const p = generateStage2BPath(profile, calibration, { set: "NULL", seed, regimeId: r.id });
    nullSelectPaths.push(preparePathData(p));
  }
}

// Extract training set
const { X: trainX, y: trainY, featureStats } = extractTrainingDataset(trainPaths);
console.log(`Training dataset ready: ${trainX.length} samples, ${trainX[0].length} features.`);

// Train models
const cValues = [0.1, 1.0, 10.0];
const trainedLogistic = {};
for (const c of cValues) {
  console.log(`Training multinomial logistic with C=${c}...`);
  trainedLogistic[c] = trainMultinomialLogistic(trainX, trainY, 7, c, 300);
}

console.log("Training decision tree (depth 3)...");
const trainedTree = trainDecisionTree(trainX, trainY, 7, 3);

// Evaluate all variants
const kValues = [1, 3, 5];
const dValues = [0.0, 0.1, 0.2];

const variantLog = [];

// Evaluate Logistic variants (V1 & V2)
for (const c of cValues) {
  for (const k of kValues) {
    for (const d of dValues) {
      const model = {
        name: `Logistic_C${c}_k${k}_d${d}`,
        type: "multinomial_logistic",
        cParam: c,
        hysteresis: { k, d },
        weights: trainedLogistic[c],
        featureStats,
      };

      const metrics = evaluateModelOnCohort(model, valPaths, nullSelectPaths);
      const isEligible = metrics.nullFalseSwitchRateHeadline <= 0.05;

      variantLog.push({
        name: model.name,
        type: model.type,
        cParam: c,
        k,
        d,
        balAccHeadline: metrics.balancedAccuracyHeadline,
        balAccAll: metrics.balancedAccuracyAll,
        nullFalseSwitchRate: metrics.nullFalseSwitchRateHeadline,
        isEligible,
        medianDelay: metrics.medianDelayHeadline,
        shareDetected: metrics.shareDetectedBeforeEndHeadline,
        recalls: metrics.perClassRecall,
      });

      console.log(`[Variant] ${model.name}: Val BalAcc=${(metrics.balancedAccuracyHeadline * 100).toFixed(2)}%, NULL FalseSwitch=${(metrics.nullFalseSwitchRateHeadline * 100).toFixed(3)}%, Eligible=${isEligible}`);
    }
  }
}

// Evaluate Decision Tree variants (V3)
for (const k of kValues) {
  for (const d of dValues) {
    const model = {
      name: `Tree_depth3_k${k}_d${d}`,
      type: "decision_tree",
      maxDepth: 3,
      hysteresis: { k, d },
      treeNode: trainedTree,
      featureStats,
    };

    const metrics = evaluateModelOnCohort(model, valPaths, nullSelectPaths);
    const isEligible = metrics.nullFalseSwitchRateHeadline <= 0.05;

    variantLog.push({
      name: model.name,
      type: model.type,
      maxDepth: 3,
      k,
      d,
      balAccHeadline: metrics.balancedAccuracyHeadline,
      balAccAll: metrics.balancedAccuracyAll,
      nullFalseSwitchRate: metrics.nullFalseSwitchRateHeadline,
      isEligible,
      medianDelay: metrics.medianDelayHeadline,
      shareDetected: metrics.shareDetectedBeforeEndHeadline,
      recalls: metrics.perClassRecall,
    });

    console.log(`[Variant] ${model.name}: Val BalAcc=${(metrics.balancedAccuracyHeadline * 100).toFixed(2)}%, NULL FalseSwitch=${(metrics.nullFalseSwitchRateHeadline * 100).toFixed(3)}%, Eligible=${isEligible}`);
  }
}

// Select best eligible variant
const eligible = variantLog.filter(v => v.isEligible);
if (eligible.length === 0) {
  throw new Error("No variant met the NULL false-switch constraint <= 0.05!");
}

eligible.sort((a, b) => b.balAccHeadline - a.balAccHeadline);
const selected = eligible[0];

console.log("\n==========================================");
console.log("SELECTED VARIANT:", selected.name);
console.log("Val Headline Balanced Accuracy:", (selected.balAccHeadline * 100).toFixed(2) + "%");
console.log("NULL False Switch Rate:", (selected.nullFalseSwitchRate * 100).toFixed(3) + "%");
console.log("Median Delay:", selected.medianDelay, "weekdays");
console.log("Share Detected:", (selected.shareDetected * 100).toFixed(1) + "%");
console.log("==========================================\n");

// Save variant log and selected configuration
const output = {
  selectedVariant: selected,
  variantLog,
  trainedModels: {
    selectedWeights: selected.type === "multinomial_logistic" ? trainedLogistic[selected.cParam] : undefined,
    selectedTree: selected.type === "decision_tree" ? trainedTree : undefined,
    featureStats,
  },
};

writeFileSync("src/lib/synth-v2/stage3/STAGE3-TUNING.json", JSON.stringify(output, null, 2) + "\n");
console.log("Wrote tuning log to src/lib/synth-v2/stage3/STAGE3-TUNING.json");
