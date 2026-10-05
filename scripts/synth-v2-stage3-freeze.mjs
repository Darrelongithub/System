import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}
function hashFile(path) {
  return sha256(readFileSync(path));
}

const tuning = JSON.parse(readFileSync("src/lib/synth-v2/stage3/STAGE3-TUNING.json", "utf8"));
const selected = tuning.selectedVariant;
const specSha = hashFile("src/lib/synth-v2/stage3/SPEC-3.md");

const frozenDetector = {
  schemaVersion: 1,
  frozenBeforeLockedEvaluation: true,
  specSha256: specSha,
  selectedVariant: selected,
  hysteresis: {
    k: selected.k,
    d: selected.d,
  },
  modelDetails: {
    type: selected.type,
    maxDepth: selected.maxDepth ?? null,
    cParam: selected.cParam ?? null,
    treeNode: tuning.trainedModels.selectedTree ?? null,
    weights: tuning.trainedModels.selectedWeights ?? null,
    featureStats: tuning.trainedModels.featureStats,
  },
  codeHashes: {
    "src/lib/synth-v2/stage3/types.ts": hashFile("src/lib/synth-v2/stage3/types.ts"),
    "src/lib/synth-v2/stage3/features.ts": hashFile("src/lib/synth-v2/stage3/features.ts"),
    "src/lib/synth-v2/stage3/models.ts": hashFile("src/lib/synth-v2/stage3/models.ts"),
    "src/lib/synth-v2/stage3/evaluator.ts": hashFile("src/lib/synth-v2/stage3/evaluator.ts"),
    "tests/synth-v2-stage3.test.mjs": hashFile("tests/synth-v2-stage3.test.mjs"),
    "scripts/synth-v2-stage3-select.mjs": hashFile("scripts/synth-v2-stage3-select.mjs"),
  },
};

const frozenJson = JSON.stringify(frozenDetector, null, 2) + "\n";
writeFileSync("src/lib/synth-v2/stage3/STAGE3-FROZEN-DETECTOR.json", frozenJson);

const frozenSha = sha256(frozenJson);
console.log("Frozen detector written. SHA-256:", frozenSha);

// Write STAGE3-SHA256SUMS.txt inventory
const inventoryFiles = [
  "src/lib/synth-v2/stage3/SPEC-3.md",
  "src/lib/synth-v2/stage3/SPEC-3.sha256",
  "src/lib/synth-v2/stage3/types.ts",
  "src/lib/synth-v2/stage3/features.ts",
  "src/lib/synth-v2/stage3/models.ts",
  "src/lib/synth-v2/stage3/evaluator.ts",
  "tests/synth-v2-stage3.test.mjs",
  "scripts/synth-v2-stage3-select.mjs",
  "src/lib/synth-v2/stage3/STAGE3-TUNING.json",
  "src/lib/synth-v2/stage3/STAGE3-FROZEN-DETECTOR.json",
];

const sumsLines = inventoryFiles.map((p) => `${hashFile(p)}  ${p}`);
writeFileSync("src/lib/synth-v2/stage3/STAGE3-SHA256SUMS.txt", sumsLines.join("\n") + "\n");
console.log("Wrote Stage 3 inventory to src/lib/synth-v2/stage3/STAGE3-SHA256SUMS.txt");
