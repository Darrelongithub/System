import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import { generateStage2BPath } from "../src/lib/synth-v2/stage2b-regimes.ts";
import { STAGE2B_REGIMES } from "../src/lib/synth-v2/stage2b-types.ts";
import {
  STAGE3_ALL_REGIMES,
  STAGE3_HEADLINE_REGIMES,
} from "../src/lib/synth-v2/stage3/types.ts";
import {
  preparePathData,
  extractTrainingDataset,
  predictWeekdayProbabilities,
} from "../src/lib/synth-v2/stage3/evaluator.ts";
import {
  Stage3HysteresisTracker,
  trainMultinomialLogistic,
  predictMultinomialLogistic,
} from "../src/lib/synth-v2/stage3/models.ts";
import {
  standardizeFeatures,
  wilderAtrPercent,
} from "../src/lib/synth-v2/stage3/features.ts";
import {
  REGIME_TO_DRIFT,
  REGIME_TO_TRENDINESS,
  REGIME_TO_VOLATILITY,
  normalCdf,
  orientedAuc,
  trainBaggedTreeEnsemble,
} from "../src/lib/synth-v2/stage3b/diagnostics.ts";

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

console.log("=== SYNTH V2 STAGE 3b: DIAGNOSTICS RUNNER ===");

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

// -------------------------------------------------------------
// Load and prepare DESIGN paths (seeds 8001-8200)
// -------------------------------------------------------------
console.log("Generating and preparing DESIGN paths (seeds 8001-8200)...");
const allDesignPaths = [];
for (const seed of seeds.design) {
  const p = generateStage2BPath(profile, calibration, { set: "DESIGN", seed });
  allDesignPaths.push(preparePathData(p));
}

const trainPathsAll = allDesignPaths.filter(p => p.seed <= 8100);
const valPathsAll = allDesignPaths.filter(p => p.seed > 8100);

const trainPathsNonExcluded = trainPathsAll.filter(p => !p.isAbsurd);
const trainPathsExcluded = trainPathsAll.filter(p => p.isAbsurd);

const valPathsNonExcluded = valPathsAll.filter(p => !p.isAbsurd);
const valPathsExcluded = valPathsAll.filter(p => p.isAbsurd);

// -------------------------------------------------------------
// PART 0: COUNTS
// -------------------------------------------------------------
console.log("\n--- PART 0: COUNTS ---");

const countObservations = (paths) => {
  const counts = Object.fromEntries(STAGE3_ALL_REGIMES.map(r => [r, 0]));
  for (const p of paths) {
    for (const s of p.samples) {
      if (s.weekday < 60) continue; // warm-up
      if (s.inBlend) continue;      // blend
      if (s.isBoundaryBuffer) continue; // boundary buffer
      counts[s.regimeId]++;
    }
  }
  return counts;
};

const trainScoredDaysByRegime = countObservations(trainPathsNonExcluded);
const trainExcludedDaysByRegime = countObservations(trainPathsExcluded);
const valScoredDaysByRegime = countObservations(valPathsNonExcluded);
const valExcludedDaysByRegime = countObservations(valPathsExcluded);

const part0 = {
  trainTotalPaths: trainPathsAll.length,
  trainScoredPaths: trainPathsNonExcluded.length,
  trainExcludedPaths: trainPathsExcluded.length,
  valTotalPaths: valPathsAll.length,
  valScoredPaths: valPathsNonExcluded.length,
  valExcludedPaths: valPathsExcluded.length,
  trainScoredDaysByRegime,
  trainExcludedDaysByRegime,
  valScoredDaysByRegime,
  valExcludedDaysByRegime,
};

console.log("TRAIN: Scored paths =", part0.trainScoredPaths, "Excluded paths =", part0.trainExcludedPaths);
console.log("VALIDATE: Scored paths =", part0.valScoredPaths, "Excluded paths =", part0.valExcludedPaths);

// -------------------------------------------------------------
// PART 1: LAG VERSUS STEADY STATE
// -------------------------------------------------------------
console.log("\n--- PART 1: LAG VERSUS STEADY STATE ---");

// Map each scored observation on valPathsNonExcluded to its lag relative to the active regime boundary
const lagBuckets = [
  { name: "[5,10)", min: 5, max: 10 },
  { name: "[10,20)", min: 10, max: 20 },
  { name: "[20,40)", min: 20, max: 40 },
  { name: "[40,end)", min: 40, max: 9999 },
];

const bucketObservations = Object.fromEntries(lagBuckets.map(b => [b.name, []]));

// For lag step curve 1..40
const lagStepCounts = Array.from({ length: 40 }, (_, idx) => ({ lag: idx + 1, correct: 0, total: 0 }));

for (const p of valPathsNonExcluded) {
  const tracker = new Stage3HysteresisTracker(frozenModel.hysteresis);
  const dayPredictions = new Map();

  for (const s of p.samples) {
    const probs = predictWeekdayProbabilities(frozenModel, s.features);
    const predIdx = tracker.update(probs);
    dayPredictions.set(s.weekday, STAGE3_ALL_REGIMES[predIdx]);

    if (s.weekday < 60) continue;
    if (s.inBlend) continue;

    // Find active boundary
    let activeBoundary = null;
    for (const b of p.boundaries) {
      if (s.weekday >= b.startDay && s.weekday < b.endDayExclusive) {
        activeBoundary = b;
        break;
      }
    }

    if (activeBoundary) {
      const lag = s.weekday - activeBoundary.startDay;
      if (lag >= 5) {
        for (const bDef of lagBuckets) {
          if (lag >= bDef.min && lag < bDef.max) {
            bucketObservations[bDef.name].push({
              trueRegime: s.regimeId,
              predRegime: STAGE3_ALL_REGIMES[predIdx],
              isHeadline: STAGE3_HEADLINE_REGIMES.includes(s.regimeId),
            });
            break;
          }
        }
      }
    }
  }

  // Lag step curve for all boundaries into headline regimes
  for (const b of p.boundaries) {
    if (!b.isHeadline) continue;
    for (let tau = 1; tau <= 40; tau++) {
      const day = b.startDay + tau;
      if (day < b.endDayExclusive) {
        lagStepCounts[tau - 1].total++;
        if (dayPredictions.get(day) === b.targetRegime) {
          lagStepCounts[tau - 1].correct++;
        }
      }
    }
  }
}

const part1Buckets = lagBuckets.map(bDef => {
  const obs = bucketObservations[bDef.name];
  const n = obs.length;
  const isThin = n < 100;

  const recalls = {};
  for (const r of STAGE3_ALL_REGIMES) {
    const rObs = obs.filter(o => o.trueRegime === r);
    const correct = rObs.filter(o => o.predRegime === r).length;
    recalls[r] = rObs.length > 0 ? correct / rObs.length : 0;
  }

  const headlineRecalls = STAGE3_HEADLINE_REGIMES.map(r => recalls[r]);
  const headlineBalancedAccuracy = headlineRecalls.reduce((a, b) => a + b, 0) / headlineRecalls.length;

  return {
    bucket: bDef.name,
    n,
    isThin,
    headlineBalancedAccuracy,
    recalls,
  };
});

const lagCurve = lagStepCounts.map(item => ({
  lag: item.lag,
  shareCorrect: item.total > 0 ? item.correct / item.total : 0,
  totalBoundaries: item.total,
}));

console.log("Lag Buckets:");
for (const b of part1Buckets) {
  console.log(`  ${b.bucket}: n=${b.n} (${b.isThin ? "THIN" : "OK"}), Headline BalAcc = ${(b.headlineBalancedAccuracy * 100).toFixed(2)}%`);
}

// -------------------------------------------------------------
// PART 2: ABSURD-BAR SENSITIVITY
// -------------------------------------------------------------
console.log("\n--- PART 2: ABSURD-BAR SENSITIVITY ---");

const evaluatePathsSensitivity = (paths) => {
  const counts = {};
  for (const r of STAGE3_ALL_REGIMES) counts[r] = { correct: 0, total: 0 };
  let scoredDays = 0;

  for (const p of paths) {
    const tracker = new Stage3HysteresisTracker(frozenModel.hysteresis);
    for (const s of p.samples) {
      const probs = predictWeekdayProbabilities(frozenModel, s.features);
      const predIdx = tracker.update(probs);

      if (s.weekday < 60) continue;
      if (s.inBlend) continue;
      if (s.isBoundaryBuffer) continue;

      scoredDays++;
      counts[s.regimeId].total++;
      if (STAGE3_ALL_REGIMES[predIdx] === s.regimeId) {
        counts[s.regimeId].correct++;
      }
    }
  }

  const recalls = {};
  for (const r of STAGE3_ALL_REGIMES) {
    recalls[r] = counts[r].total > 0 ? counts[r].correct / counts[r].total : 0;
  }
  const headlineRecalls = STAGE3_HEADLINE_REGIMES.map(r => recalls[r]);
  const headlineBalAcc = headlineRecalls.reduce((a, b) => a + b, 0) / headlineRecalls.length;

  return { headlineBalAcc, recalls, scoredDays };
};

const valNonExcludedEval = evaluatePathsSensitivity(valPathsNonExcluded);
const valExcludedEval = evaluatePathsSensitivity(valPathsExcluded);

const part2 = {
  nonExcludedHeadlineBalAcc: valNonExcludedEval.headlineBalAcc,
  nonExcludedRecalls: valNonExcludedEval.recalls,
  excludedHeadlineBalAcc: valExcludedEval.headlineBalAcc,
  excludedRecalls: valExcludedEval.recalls,
  nNonExcluded: valNonExcludedEval.scoredDays,
  nExcluded: valExcludedEval.scoredDays,
};

console.log(`Non-Excluded VALIDATE BalAcc: ${(part2.nonExcludedHeadlineBalAcc * 100).toFixed(2)}% (n=${part2.nNonExcluded})`);
console.log(`Excluded VALIDATE BalAcc: ${(part2.excludedHeadlineBalAcc * 100).toFixed(2)}% (n=${part2.nExcluded})`);

// -------------------------------------------------------------
// PART 3: CAPACITY CEILING
// -------------------------------------------------------------
console.log("\n--- PART 3: CAPACITY CEILING ---");

// Train (a) Logistic and (b) Bagged Tree Ensemble on trainPathsNonExcluded
const { X: trainX, y: trainY, featureStats } = extractTrainingDataset(trainPathsNonExcluded);

// Train Logistic with C in {0.1, 1, 10}
const cList = [0.1, 1.0, 10.0];
let bestC = 1.0;
let bestValAccLog = -1;
let bestLogWeights = null;

for (const c of cList) {
  const w = trainMultinomialLogistic(trainX, trainY, 7, c, 300);
  // Evaluate raw accuracy on non-excluded val
  let correct = 0;
  let total = 0;
  for (const p of valPathsNonExcluded) {
    for (const s of p.samples) {
      if (s.weekday < 60 || s.inBlend || s.isBoundaryBuffer) continue;
      const xStd = standardizeFeatures(s.features, featureStats);
      const probs = predictMultinomialLogistic(w, xStd);
      const pred = probs.indexOf(Math.max(...probs));
      if (pred === STAGE3_ALL_REGIMES.indexOf(s.regimeId)) correct++;
      total++;
    }
  }
  const acc = total > 0 ? correct / total : 0;
  if (acc > bestValAccLog) {
    bestValAccLog = acc;
    bestC = c;
    bestLogWeights = w;
  }
}
console.log(`Best Logistic C = ${bestC} (Val Raw Acc = ${(bestValAccLog * 100).toFixed(2)}%)`);

// Train Bagged Tree Ensemble (100 trees, depth 6, no hysteresis)
console.log("Training Bagged Tree Ensemble (100 trees, depth 6, no hysteresis)...");
const ensemble = trainBaggedTreeEnsemble(trainX, trainY, 7, 100, 6, 42);

// Evaluate Logistic and Ensemble overall and by bucket
const evaluateModelByBucket = (predictFn) => {
  const overallCounts = Object.fromEntries(STAGE3_ALL_REGIMES.map(r => [r, { correct: 0, total: 0 }]));
  const bucketCounts = Object.fromEntries(lagBuckets.map(b => [b.name, Object.fromEntries(STAGE3_ALL_REGIMES.map(r => [r, { correct: 0, total: 0 }]))]));

  for (const p of valPathsNonExcluded) {
    for (const s of p.samples) {
      if (s.weekday < 60 || s.inBlend) continue;

      const predRegime = predictFn(s.features);

      // Check boundary lag
      let activeBoundary = null;
      for (const b of p.boundaries) {
        if (s.weekday >= b.startDay && s.weekday < b.endDayExclusive) {
          activeBoundary = b;
          break;
        }
      }

      if (s.isBoundaryBuffer) continue;

      overallCounts[s.regimeId].total++;
      if (predRegime === s.regimeId) overallCounts[s.regimeId].correct++;

      if (activeBoundary) {
        const lag = s.weekday - activeBoundary.startDay;
        for (const bDef of lagBuckets) {
          if (lag >= bDef.min && lag < bDef.max) {
            bucketCounts[bDef.name][s.regimeId].total++;
            if (predRegime === s.regimeId) bucketCounts[bDef.name][s.regimeId].correct++;
            break;
          }
        }
      }
    }
  }

  const computeBalAcc = (counts) => {
    const recalls = STAGE3_HEADLINE_REGIMES.map(r => counts[r].total > 0 ? counts[r].correct / counts[r].total : 0);
    return recalls.reduce((a, b) => a + b, 0) / recalls.length;
  };

  const overallBalAcc = computeBalAcc(overallCounts);
  const byBucket = Object.fromEntries(lagBuckets.map(b => [b.name, computeBalAcc(bucketCounts[b.name])]));

  return { overallBalAcc, byBucket };
};

const logisticEval = evaluateModelByBucket((f) => {
  const xStd = standardizeFeatures(f, featureStats);
  const probs = predictMultinomialLogistic(bestLogWeights, xStd);
  return STAGE3_ALL_REGIMES[probs.indexOf(Math.max(...probs))];
});

const ensembleEval = evaluateModelByBucket((f) => {
  const xStd = standardizeFeatures(f, featureStats);
  const predIdx = ensemble.predictClass(xStd);
  return STAGE3_ALL_REGIMES[predIdx];
});

const part3BucketTable = lagBuckets.map(b => ({
  bucket: b.name,
  frozenBalAcc: part1Buckets.find(item => item.bucket === b.name).headlineBalancedAccuracy,
  logisticBalAcc: logisticEval.byBucket[b.name],
  ensembleBalAcc: ensembleEval.byBucket[b.name],
}));

const ensembleBeats37ByUnder3 = (ensembleEval.overallBalAcc - 0.37) < 0.03;
const steadyStateUnder50 = ensembleEval.byBucket["[40,end)"] < 0.50;
const isFeatureLimited = ensembleBeats37ByUnder3 && steadyStateUnder50;
const verdict = isFeatureLimited ? "feature-limited" : "model-limited";

const part3 = {
  frozenBalAccOverall: valNonExcludedEval.headlineBalAcc,
  logisticBestC: bestC,
  logisticBalAccOverall: logisticEval.overallBalAcc,
  ensembleBalAccOverall: ensembleEval.overallBalAcc,
  byBucket: part3BucketTable,
  verdict,
  reason: isFeatureLimited
    ? `Ensemble overall accuracy (${(ensembleEval.overallBalAcc * 100).toFixed(2)}%) beats 37% by under 3 points (${((ensembleEval.overallBalAcc - 0.37) * 100).toFixed(2)} pp) AND [40,end) steady state (${(ensembleEval.byBucket["[40,end)"] * 100).toFixed(2)}%) is under 50%`
    : `Ensemble achieved ${(ensembleEval.overallBalAcc * 100).toFixed(2)}% overall and ${(ensembleEval.byBucket["[40,end)"] * 100).toFixed(2)}% in [40,end)`,
};

console.log(`Frozen Model BalAcc: ${(part3.frozenBalAccOverall * 100).toFixed(2)}%`);
console.log(`Logistic BalAcc (no hysteresis): ${(part3.logisticBalAccOverall * 100).toFixed(2)}%`);
console.log(`Bagged Ensemble BalAcc (100 trees depth 6): ${(part3.ensembleBalAccOverall * 100).toFixed(2)}%`);
console.log(`Capacity Verdict: ${part3.verdict.toUpperCase()}`);

// -------------------------------------------------------------
// PART 4: PER-DIAL DETECTION
// -------------------------------------------------------------
console.log("\n--- PART 4: PER-DIAL DETECTION ---");

const dialConfigs = [
  { name: "volatility", mapping: REGIME_TO_VOLATILITY, classes: ["LOW", "NORMAL", "HIGH"] },
  { name: "drift", mapping: REGIME_TO_DRIFT, classes: ["DOWN", "FLAT", "UP"] },
  { name: "trendiness", mapping: REGIME_TO_TRENDINESS, classes: ["MEAN_REVERTING", "RANDOM", "TRENDING"] },
];

const dialResults = {};

for (const d of dialConfigs) {
  console.log(`Training and evaluating dial: ${d.name}...`);
  const dialTrainY = trainPathsNonExcluded.flatMap(p => p.samples.filter(s => s.weekday >= 60 && !s.inBlend).map(s => d.classes.indexOf(d.mapping[s.regimeId])));

  // Logistic
  const dialLogWeights = trainMultinomialLogistic(trainX, dialTrainY, 3, 1.0, 300);
  // Bagged ensemble
  const dialEnsemble = trainBaggedTreeEnsemble(trainX, dialTrainY, 3, 100, 6, 100 + d.classes.length);

  // Evaluate on val
  const evaluateDial = (predictFn) => {
    const counts = Object.fromEntries(d.classes.map(c => [c, { correct: 0, total: 0 }]));
    const bucketCounts = Object.fromEntries(lagBuckets.map(b => [b.name, Object.fromEntries(d.classes.map(c => [c, { correct: 0, total: 0 }]))]));

    for (const p of valPathsNonExcluded) {
      for (const s of p.samples) {
        if (s.weekday < 60 || s.inBlend || s.isBoundaryBuffer) continue;
        const trueDial = d.mapping[s.regimeId];
        const predDial = predictFn(s.features);

        counts[trueDial].total++;
        if (predDial === trueDial) counts[trueDial].correct++;

        let activeBoundary = null;
        for (const b of p.boundaries) {
          if (s.weekday >= b.startDay && s.weekday < b.endDayExclusive) {
            activeBoundary = b;
            break;
          }
        }
        if (activeBoundary) {
          const lag = s.weekday - activeBoundary.startDay;
          for (const bDef of lagBuckets) {
            if (lag >= bDef.min && lag < bDef.max) {
              bucketCounts[bDef.name][trueDial].total++;
              if (predDial === trueDial) bucketCounts[bDef.name][trueDial].correct++;
              break;
            }
          }
        }
      }
    }

    const recalls = Object.fromEntries(d.classes.map(c => [c, counts[c].total > 0 ? counts[c].correct / counts[c].total : 0]));
    const balAcc = Object.values(recalls).reduce((a, b) => a + b, 0) / d.classes.length;
    const byBucket = Object.fromEntries(lagBuckets.map(b => {
      const bRecalls = d.classes.map(c => bucketCounts[b.name][c].total > 0 ? bucketCounts[b.name][c].correct / bucketCounts[b.name][c].total : 0);
      return [b.name, bRecalls.reduce((a, b) => a + b, 0) / d.classes.length];
    }));

    return { balAcc, recalls, byBucket };
  };

  const dialLogEval = evaluateDial(f => {
    const xStd = standardizeFeatures(f, featureStats);
    const probs = predictMultinomialLogistic(dialLogWeights, xStd);
    return d.classes[probs.indexOf(Math.max(...probs))];
  });

  const dialEnsEval = evaluateDial(f => {
    const xStd = standardizeFeatures(f, featureStats);
    return d.classes[dialEnsemble.predictClass(xStd)];
  });

  const byBucketTable = lagBuckets.map(b => ({
    bucket: b.name,
    logisticBalAcc: dialLogEval.byBucket[b.name],
    ensembleBalAcc: dialEnsEval.byBucket[b.name],
  }));

  dialResults[d.name] = {
    dialName: d.name,
    classes: d.classes,
    logisticBalAcc: dialLogEval.balAcc,
    logisticRecalls: dialLogEval.recalls,
    ensembleBalAcc: dialEnsEval.balAcc,
    ensembleRecalls: dialEnsEval.recalls,
    byBucket: byBucketTable,
  };

  console.log(`  ${d.name}: Logistic BalAcc = ${(dialLogEval.balAcc * 100).toFixed(2)}%, Ensemble BalAcc = ${(dialEnsEval.balAcc * 100).toFixed(2)}%`);
}

// Dial AUCs
// 1. High-volatility vs rest
const volHighVals = [];
const volRestVals = [];
// 2. Drift up vs drift down
const driftUpVals = [];
const driftDownVals = [];
// 3. Drift up vs flat
const driftFlatVals = [];

for (const p of valPathsNonExcluded) {
  for (const s of p.samples) {
    if (s.weekday < 60 || s.inBlend || s.isBoundaryBuffer) continue;
    const vDial = REGIME_TO_VOLATILITY[s.regimeId];
    if (vDial === "HIGH") volHighVals.push(s.features.log_atr_20);
    else volRestVals.push(s.features.log_atr_20);

    const dDial = REGIME_TO_DRIFT[s.regimeId];
    if (dDial === "UP") driftUpVals.push(s.features.drift_z_20);
    else if (dDial === "DOWN") driftDownVals.push(s.features.drift_z_20);
    else if (dDial === "FLAT") driftFlatVals.push(s.features.drift_z_20);
  }
}

const highVolVsRestAuc = orientedAuc(volHighVals, volRestVals);
const driftUpVsDriftDownAuc = orientedAuc(driftUpVals, driftDownVals);
const driftUpVsFlatAuc = orientedAuc(driftUpVals, driftFlatVals);

const part4 = {
  dials: dialResults,
  aucs: {
    highVolVsRest: highVolVsRestAuc,
    driftUpVsDriftDown: driftUpVsDriftDownAuc,
    driftUpVsFlat: driftUpVsFlatAuc,
  },
};

console.log(`AUC High-Vol vs Rest: ${highVolVsRestAuc.toFixed(4)}`);
console.log(`AUC Drift-Up vs Drift-Down: ${driftUpVsDriftDownAuc.toFixed(4)}`);
console.log(`AUC Drift-Up vs Flat: ${driftUpVsFlatAuc.toFixed(4)}`);

// -------------------------------------------------------------
// PART 5: DETECTABILITY ARITHMETIC AND REAL-GOLD NOISE SHARE
// -------------------------------------------------------------
console.log("\n--- PART 5: DETECTABILITY ARITHMETIC & REAL-GOLD NOISE ---");

// Compute daily drift mean and sd from DESIGN paths per regime
const dailyDriftsByRegime = Object.fromEntries(STAGE3_ALL_REGIMES.map(r => [r, []]));

for (const p of allDesignPaths) {
  for (const s of p.samples) {
    if (s.inBlend) continue;
    // Extract daily return from drift_z_10 or recompute
    dailyDriftsByRegime[s.regimeId].push(s.features.drift_z_10); // temporary container
  }
}

// Recompute exact daily close-to-close returns per regime from candles
const exactDailyReturnsByRegime = Object.fromEntries(STAGE3_ALL_REGIMES.map(r => [r, []]));
for (const p of allDesignPaths) {
  const c = generateStage2BPath(profile, calibration, { set: "DESIGN", seed: p.seed });
  const candles = c.synthetic.candles;
  const labels = c.synthetic.labels;
  const schedule = c.schedule;
  let bOffset = 0;
  for (let d = 0; d < schedule.barCounts.length; d++) {
    const bCount = schedule.barCounts[d];
    const firstBar = candles[bOffset];
    const lastBar = candles[bOffset + bCount - 1];
    const dayLabel = labels[bOffset + bCount - 1];
    if (!dayLabel.inBlend) {
      const dailyRet = Math.log(lastBar.close / firstBar.open);
      exactDailyReturnsByRegime[dayLabel.regimeId].push(dailyRet);
    }
    bOffset += bCount;
  }
}

const nHorizons = [5, 10, 20, 40, 60];
const driftDetectability = STAGE3_ALL_REGIMES.map(r => {
  const rets = exactDailyReturnsByRegime[r];
  const meanRet = rets.reduce((a, b) => a + b, 0) / rets.length;
  let varSum = 0;
  for (const ret of rets) varSum += (ret - meanRet) * (ret - meanRet);
  const sdRet = Math.sqrt(varSum / (rets.length - 1));

  // Planted setting from calibration
  const setting = calibration.distributions.drift;
  const planted = r === "trend_up" || r === "expansion_up" ? setting.p83 : r === "trend_down" || r === "expansion_down" ? setting.p17 : setting.p50;

  const deltaMu = Math.abs(meanRet - 0.0003289); // relative to flat
  const snr = sdRet > 0 ? deltaMu / sdRet : 0;
  const weekdaysZ2 = snr > 0 ? Math.pow(2.0 / snr, 2) : Infinity;

  const analyticAucByN = {};
  for (const n of nHorizons) {
    const dPrime = (deltaMu * Math.sqrt(n)) / (Math.SQRT2 * sdRet);
    analyticAucByN[n] = normalCdf(dPrime);
  }

  return {
    regime: r,
    plantedDailyDrift: planted,
    realizedDailyDriftMean: meanRet,
    realizedDailyDriftSd: sdRet,
    snrPerSqrtDay: snr,
    weekdaysNeededZ2: Math.round(weekdaysZ2 * 10) / 10,
    analyticAucByN,
  };
});

// Empirical AUC of trailing-n log ATR% between low/normal/high
// Compute multi-horizon ATR% on DESIGN
const atrByVolTier = {
  LOW: Object.fromEntries(nHorizons.map(n => [n, []])),
  NORMAL: Object.fromEntries(nHorizons.map(n => [n, []])),
  HIGH: Object.fromEntries(nHorizons.map(n => [n, []])),
};

for (const p of valPathsNonExcluded) {
  for (const s of p.samples) {
    if (s.weekday < 60 || s.inBlend || s.isBoundaryBuffer) continue;
    const tier = REGIME_TO_VOLATILITY[s.regimeId];
    atrByVolTier[tier][5].push(s.features.log_atr_5);
    atrByVolTier[tier][20].push(s.features.log_atr_20);
    atrByVolTier[tier][60].push(s.features.log_atr_60);
  }
}

const volatilityEmpiricalAucByN = {};
for (const n of [5, 20, 60]) {
  volatilityEmpiricalAucByN[n] = {
    lowVsNormal: orientedAuc(atrByVolTier.LOW[n], atrByVolTier.NORMAL[n]),
    normalVsHigh: orientedAuc(atrByVolTier.NORMAL[n], atrByVolTier.HIGH[n]),
    lowVsHigh: orientedAuc(atrByVolTier.LOW[n], atrByVolTier.HIGH[n]),
  };
}

// Real gold noise share benchmark
console.log("Reading real gold CSV for noise share calculation...");
const rawCsv = readFileSync("XAUUSD_30min_2020-01-24_to_2026-10-01.csv", "utf8");
const parsedReal = parseCsv(rawCsv);
const realCandles = parsedReal.candles;

// Group by date (EAT day close convention: last 30-min candle of the date)
const dateGroups = new Map();
for (const c of realCandles) {
  const d = c.datetime.slice(0, 10);
  if (!dateGroups.has(d)) dateGroups.set(d, []);
  dateGroups.get(d).push(c);
}

const completedDailyCloses = [];
for (const [date, cList] of dateGroups.entries()) {
  if (cList.length >= 24) { // valid full trading day
    completedDailyCloses.push(cList[cList.length - 1].close);
  }
}

const realDailyReturns = [];
for (let i = 1; i < completedDailyCloses.length; i++) {
  realDailyReturns.push(Math.log(completedDailyCloses[i] / completedDailyCloses[i - 1]));
}

console.log(`Real gold daily returns extracted: ${realDailyReturns.length} completed days.`);

const computeRolling20Spread = (returns) => {
  const rollingMeans = [];
  let winSum = 0;
  for (let i = 0; i < returns.length; i++) {
    winSum += returns[i];
    if (i >= 20) winSum -= returns[i - 20];
    if (i >= 19) rollingMeans.push(winSum / 20);
  }
  rollingMeans.sort((a, b) => a - b);
  const p17 = rollingMeans[Math.floor(0.17 * rollingMeans.length)];
  const p83 = rollingMeans[Math.floor(0.83 * rollingMeans.length)];
  return p83 - p17;
};

const realSpread = computeRolling20Spread(realDailyReturns);

// 1,000 IID shuffles
let iidSpreadSum = 0;
for (let iter = 0; iter < 1000; iter++) {
  const shuffled = [...realDailyReturns];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }
  iidSpreadSum += computeRolling20Spread(shuffled);
}
const meanIidSpread = iidSpreadSum / 1000;
const ratioRealToIid = realSpread / meanIidSpread;

// 1,000 5-day block shuffles
const blockSize = 5;
const blocks = [];
for (let i = 0; i + blockSize <= realDailyReturns.length; i += blockSize) {
  blocks.push(realDailyReturns.slice(i, i + blockSize));
}

let blockSpreadSum = 0;
for (let iter = 0; iter < 1000; iter++) {
  const shuffledBlocks = [...blocks];
  for (let i = shuffledBlocks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shuffledBlocks[i];
    shuffledBlocks[i] = shuffledBlocks[j];
    shuffledBlocks[j] = tmp;
  }
  const flattened = shuffledBlocks.flat();
  blockSpreadSum += computeRolling20Spread(flattened);
}
const meanBlockSpread = blockSpreadSum / 1000;
const ratioRealToBlock = realSpread / meanBlockSpread;

const part5 = {
  driftDetectability,
  volatilityEmpiricalAucByN,
  realGoldNoiseShare: {
    definition: "Daily log return ln(close_t / close_{t-1}) across 30-min trading days with >=24 bars",
    completedDays: realDailyReturns.length,
    rolling20MeanSpreadReal: realSpread,
    rolling20MeanSpreadIidShuffleMean: meanIidSpread,
    ratioRealToIid,
    rolling20MeanSpreadBlockShuffleMean: meanBlockSpread,
    ratioRealToBlock,
    isMostlyNoise: ratioRealToIid < 1.25,
  },
};

console.log(`Real 20-day mean spread: ${(realSpread * 100).toFixed(4)}%`);
console.log(`IID shuffle spread: ${(meanIidSpread * 100).toFixed(4)}% -> Ratio: ${ratioRealToIid.toFixed(3)}`);
console.log(`Block shuffle spread: ${(meanBlockSpread * 100).toFixed(4)}% -> Ratio: ${ratioRealToBlock.toFixed(3)}`);
console.log(`Real drift terciles mostly noise: ${part5.realGoldNoiseShare.isMostlyNoise}`);

// -------------------------------------------------------------
// PART 6: ABSURD-BAR ANATOMY
// -------------------------------------------------------------
console.log("\n--- PART 6: ABSURD-BAR ANATOMY ---");

const absurdRecords = [];
const regimeCountsAbsurd = Object.fromEntries(STAGE3_ALL_REGIMES.map(r => [r, 0]));
const overlayCountsAbsurd = { none: 0, news_storm: 0, gap_shocks: 0, both: 0 };
const histogramBins = {
  "3%-5%": 0,
  "5%-10%": 0,
  "10%-20%": 0,
  "20%-40%": 0,
  ">40%": 0,
};

let totalBarsDesign = 0;
let totalBarsNull = 0;

const scanAbsurdBars = (paths, cohortName) => {
  for (const p of paths) {
    const rawPath = generateStage2BPath(profile, calibration, {
      set: cohortName === "DESIGN" ? "DESIGN" : "NULL",
      seed: p.seed,
      ...(cohortName === "NULL" ? { regimeId: p.regimeId } : {}),
    });
    const candles = rawPath.synthetic.candles;
    const labels = rawPath.synthetic.labels;
    const atr = wilderAtrPercent(candles);

    if (cohortName === "DESIGN") totalBarsDesign += candles.length;
    else totalBarsNull += candles.length;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const range = c.high - c.low;
      const ratio = range / c.close;

      if (ratio > 0.03 && ratio <= 0.05) histogramBins["3%-5%"]++;
      else if (ratio > 0.05 && ratio <= 0.10) histogramBins["5%-10%"]++;
      else if (ratio > 0.10 && ratio <= 0.20) histogramBins["10%-20%"]++;
      else if (ratio > 0.20 && ratio <= 0.40) histogramBins["20%-40%"]++;
      else if (ratio > 0.40) histogramBins[">40%"]++;

      if (ratio > 0.10) {
        const body = Math.abs(c.close - c.open);
        const upperWick = c.high - Math.max(c.open, c.close);
        const lowerWick = Math.min(c.open, c.close) - c.low;
        const bodyShare = range > 0 ? body / range : 0;
        const upperWickShare = range > 0 ? upperWick / range : 0;
        const lowerWickShare = range > 0 ? lowerWick / range : 0;

        const label = labels[i];
        const overlays = label.overlays || [];
        const reg = label.regimeId;
        regimeCountsAbsurd[reg]++;

        let ovKey = "none";
        if (overlays.includes("news_storm") && overlays.includes("gap_shocks")) ovKey = "both";
        else if (overlays.includes("news_storm")) ovKey = "news_storm";
        else if (overlays.includes("gap_shocks")) ovKey = "gap_shocks";
        overlayCountsAbsurd[ovKey]++;

        const priorClose = i > 0 ? candles[i - 1].close : c.open;
        const atrPct = atr[i] || 0.0018;
        const atrDollars = priorClose * atrPct;

        absurdRecords.push({
          pathSeed: p.seed,
          cohort: cohortName,
          barIndex: i,
          datetime: c.datetime,
          slotIndex: i % 48,
          regime: reg,
          overlays,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          range,
          rangeOverPrice: ratio,
          bodyShare,
          upperWickShare,
          lowerWickShare,
          trailing48AtrPercent: atrPct,
          rangeOverAtrDollars: atrDollars > 0 ? range / atrDollars : 0,
        });
      }
    }
  }
};

console.log("Scanning DESIGN paths for absurd bars...");
scanAbsurdBars(allDesignPaths, "DESIGN");

// Scan NULL paths (first 100 paths across all regimes)
console.log("Scanning NULL paths for absurd bars...");
const sampleNullPaths = [];
for (const r of STAGE2B_REGIMES) {
  const regimeSeeds = seeds.nullSeedsByRegime[r.id].slice(0, 50);
  for (const s of regimeSeeds) {
    sampleNullPaths.push({ seed: s, regimeId: r.id });
  }
}
scanAbsurdBars(sampleNullPaths, "NULL");

// Real gold frequency of range > 3% and > 5%
let realBarsAbove3 = 0;
let realBarsAbove5 = 0;
for (const c of realCandles) {
  const r = (c.high - c.low) / c.close;
  if (r > 0.03) realBarsAbove3++;
  if (r > 0.05) realBarsAbove5++;
}

const realFreq3PerM = (realBarsAbove3 / realCandles.length) * 1e6;
const realFreq5PerM = (realBarsAbove5 / realCandles.length) * 1e6;

const totalBarsScanned = totalBarsDesign + totalBarsNull;
const freqByRegimePerM = Object.fromEntries(STAGE3_ALL_REGIMES.map(r => [r, Math.round((regimeCountsAbsurd[r] / totalBarsScanned) * 1e6)]));
const freqByOverlayPerM = Object.fromEntries(Object.keys(overlayCountsAbsurd).map(k => [k, Math.round((overlayCountsAbsurd[k] / totalBarsScanned) * 1e6)]));

const part6 = {
  totalAbsurdBarsDesign: absurdRecords.filter(r => r.cohort === "DESIGN").length,
  totalAbsurdBarsNull: absurdRecords.filter(r => r.cohort === "NULL").length,
  frequenciesPerMillionByRegime: freqByRegimePerM,
  frequenciesPerMillionByOverlay: freqByOverlayPerM,
  histogramOverPriceBins: histogramBins,
  realGoldFreqAbove3PctPerMillion: Math.round(realFreq3PerM),
  realGoldFreqAbove5PctPerMillion: Math.round(realFreq5PerM),
  sampleAbsurdBar: absurdRecords[0] || null,
  generatorCodeLocation: {
    file: "src/lib/synth-v2/generate.ts",
    lines: "287-296",
    mechanism: "In generatePathWithSchedule: `const wickTotal = shape.wickPoolShare * currentAtrDollars * wickExpansion; let high = roundToCent(Math.max(open, close) + wickTotal * upperFraction); let low = Math.max(0.01, roundToCent(Math.min(open, close) - wickTotal * (1 - upperFraction)));`. When return shock is extreme or wickPoolShare draws from high Pareto tail, wickTotal is not bounded relative to price, inflating high-low range.",
  },
};

console.log("Absurd bars found:", absurdRecords.length);
console.log("Real frequency >3%:", part6.realGoldFreqAbove3PctPerMillion, "per million bars");
console.log("Real frequency >5%:", part6.realGoldFreqAbove5PctPerMillion, "per million bars");

// -------------------------------------------------------------
// Compile and Save Complete Results
// -------------------------------------------------------------
const finalResults = {
  schemaVersion: 1,
  runDate: new Date().toISOString(),
  specSha256: sha256(readFileSync("src/lib/synth-v2/stage3b/SPEC-3b.md")),
  part0,
  part1: {
    buckets: part1Buckets,
    lagCurve,
  },
  part2,
  part3,
  part4,
  part5,
  part6,
};

const resultsJson = JSON.stringify(finalResults, null, 2) + "\n";
writeFileSync("src/lib/synth-v2/stage3b/STAGE3B-RESULTS.json", resultsJson);
const resultsSha = sha256(resultsJson);
writeFileSync("src/lib/synth-v2/stage3b/STAGE3B-RESULTS.sha256", resultsSha + "  src/lib/synth-v2/stage3b/STAGE3B-RESULTS.json\n");

console.log("\nResults written to STAGE3B-RESULTS.json (SHA-256: " + resultsSha + ")");
