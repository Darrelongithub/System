import { readFileSync, writeFileSync } from "node:fs";
import { generateStage2BPath } from "../src/lib/synth-v2/stage2b-regimes.ts";
import { STAGE2B_REGIMES } from "../src/lib/synth-v2/stage2b-types.ts";
import { wilderAtrPercent, varianceRatio } from "../src/lib/synth-v2/stage3/features.ts";

const profile = JSON.parse(readFileSync("src/lib/synth-v2/profile.json", "utf8"));
const calibration = JSON.parse(readFileSync("src/lib/synth-v2/STAGE2C-REAL-BANDS.json", "utf8"));
const seeds = JSON.parse(readFileSync("src/lib/synth-v2/STAGE2C-SEEDS.json", "utf8"));

const windowSizes = [48, 240, 960];
const featureNames = ["ATR%", "Drift z", "VR8", "VR16"];

// Accumulator for each window size: [windowSize][regimeId][featureName] -> number[]
const accumulators = Object.fromEntries(
  windowSizes.map(w => [
    w,
    Object.fromEntries(
      STAGE2B_REGIMES.map(r => [
        r.id,
        Object.fromEntries(featureNames.map(f => [f, []])),
      ])
    ),
  ])
);

console.log("Extracting multi-window features on DESIGN (8001-8200)...");
for (const seed of seeds.design) {
  const path = generateStage2BPath(profile, calibration, { set: "DESIGN", seed });
  const candles = path.synthetic.candles;
  const labels = path.synthetic.labels;
  const atr = wilderAtrPercent(candles);

  for (const w of windowSizes) {
    const accW = accumulators[w];
    // Strided sampling (every 4th non-blend observation inside a segment)
    for (let i = w; i < candles.length; i += 4) {
      const label = labels[i];
      if (!label || label.inBlend) continue;
      const regimeId = label.regimeId;
      if (!regimeId || !accW[regimeId]) continue;

      // Ensure window is strictly inside the same segment
      const segIdx = label.segmentIndex;
      const firstLabelInWin = labels[i - w + 1];
      if (!firstLabelInWin || firstLabelInWin.segmentIndex !== segIdx || firstLabelInWin.inBlend) {
        continue;
      }

      // 1. ATR%
      let atrSum = 0;
      let atrCount = 0;
      for (let k = i - w + 1; k <= i; k++) {
        const val = atr[k];
        if (val !== undefined && Number.isFinite(val) && val > 0) {
          atrSum += val;
          atrCount++;
        }
      }
      const meanAtr = atrCount > 0 ? atrSum / atrCount : 0.0018;

      // 2. Returns for drift z and VRs
      const rets = [];
      for (let k = i - w + 2; k <= i; k++) {
        rets.push(Math.log(candles[k].close / candles[k - 1].close));
      }

      const meanRet = rets.reduce((a, b) => a + b, 0) / rets.length;
      let varRet = 0;
      for (const r of rets) {
        const diff = r - meanRet;
        varRet += diff * diff;
      }
      const sdRet = Math.sqrt(varRet / (rets.length - 1));
      const driftZ = sdRet > 1e-12 ? meanRet / (sdRet / Math.sqrt(rets.length)) : 0;

      // 3. VR8 and 4. VR16
      const vr8 = varianceRatio(rets, 8);
      const vr16 = varianceRatio(rets, 16);

      accW[regimeId]["ATR%"].push(meanAtr);
      accW[regimeId]["Drift z"].push(driftZ);
      accW[regimeId]["VR8"].push(vr8);
      accW[regimeId]["VR16"].push(vr16);
    }
  }
}

function orientedAuc(a, b) {
  if (a.length === 0 || b.length === 0) return 0.5;
  const joined = [
    ...a.map(v => ({ v, g: 1 })),
    ...b.map(v => ({ v, g: 0 })),
  ].sort((l, r) => l.v - r.v);

  let rankSumA = 0;
  for (let idx = 0; idx < joined.length;) {
    let end = idx + 1;
    while (end < joined.length && joined[end].v === joined[idx].v) end++;
    const avgRank = ((idx + 1) + end) / 2;
    for (let c = idx; c < end; c++) {
      if (joined[c].g === 1) rankSumA += avgRank;
    }
    idx = end;
  }
  const raw = (rankSumA - (a.length * (a.length + 1)) / 2) / (a.length * b.length);
  return Math.max(raw, 1 - raw);
}

// Generate all 21 pairs
const pairs = [];
for (let i = 0; i < STAGE2B_REGIMES.length; i++) {
  for (let j = i + 1; j < STAGE2B_REGIMES.length; j++) {
    pairs.push([STAGE2B_REGIMES[i].id, STAGE2B_REGIMES[j].id]);
  }
}

const tableRows = [];
const belowPointSixAllThree = [];

for (const [rA, rB] of pairs) {
  const row = { pair: `${rA} vs ${rB}` };
  let allThreeBelow = true;

  for (const w of windowSizes) {
    const accW = accumulators[w];
    let bestAuc = 0;
    let bestFeat = "";

    for (const f of featureNames) {
      const valsA = accW[rA][f];
      const valsB = accW[rB][f];
      const auc = orientedAuc(valsA, valsB);
      if (auc > bestAuc) {
        bestAuc = auc;
        bestFeat = f;
      }
    }

    row[`w${w}_best_feature`] = bestFeat;
    row[`w${w}_best_auc`] = bestAuc;
    if (bestAuc >= 0.60) allThreeBelow = false;
  }

  tableRows.push(row);
  if (allThreeBelow) belowPointSixAllThree.push(row.pair);
}

console.log("\n=== PART 0(c): SEPARABILITY ON DESIGN AT 48, 240, 960 BARS ===");
console.log("| Regime Pair | W=48 Best (AUC) | W=240 Best (AUC) | W=960 Best (AUC) |");
console.log("| :--- | :--- | :--- | :--- |");
for (const r of tableRows) {
  console.log(`| ${r.pair} | ${r.w48_best_feature} (${r.w48_best_auc.toFixed(4)}) | ${r.w240_best_feature} (${r.w240_best_auc.toFixed(4)}) | ${r.w960_best_feature} (${r.w960_best_auc.toFixed(4)}) |`);
}

console.log("\nPairs below 0.60 at all three windows:", belowPointSixAllThree);

writeFileSync("src/lib/synth-v2/stage3/STAGE3-PART0C.json", JSON.stringify({ tableRows, belowPointSixAllThree }, null, 2) + "\n");
