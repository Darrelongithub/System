#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sampleWithoutReplacement, seededRandom } from "../src/lib/regime-detector-eval/core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "src/lib/regime-detector-eval");
const CUT_SEED = 0xca05a1;
const MUTATION_SEED = 0x5eedc0de;
const FULL_BATCH_SIZE = 20;
const FULL_BATCH_COUNT = 10;
const TOTAL_CUTPOINTS = FULL_BATCH_SIZE * FULL_BATCH_COUNT;

const filenames = (await readdir(DIR))
  .filter((filename) => /^part2-(?:batch-\d{2}|range-\d{3}-\d{3})\.json$/.test(filename))
  .sort();
if (!filenames.length) throw new Error("no completed Part 2 batch files found");
const batches = [];
for (const filename of filenames) {
  batches.push({
    filename,
    result: JSON.parse(await readFile(path.join(DIR, filename), "utf8")),
  });
}

const first = batches[0].result;
const expectedPopulation = Array.from(
  { length: first.dataInfo.bars - 1 - first.dataInfo.validStartIndex },
  (_, offset) => first.dataInfo.validStartIndex + offset,
);
const expectedCutpoints = sampleWithoutReplacement(
  expectedPopulation,
  TOTAL_CUTPOINTS,
  seededRandom(CUT_SEED),
).sort((a, b) => a - b);
const expectedSet = new Set(expectedCutpoints);
const observedCutpoints = [];
for (const { filename, result } of batches) {
  const cutpoints = result.causality?.cutpoints;
  if (
    result.totalCutpoints !== TOTAL_CUTPOINTS ||
    !Array.isArray(cutpoints) ||
    cutpoints.length !== result.batchSize
  ) {
    throw new Error(`unexpected batch metadata in ${filename}`);
  }
  if (JSON.stringify(result.dataInfo) !== JSON.stringify(first.dataInfo)) {
    throw new Error(`input metadata changed in ${filename}`);
  }
  if (JSON.stringify(result.descriptions) !== JSON.stringify(first.descriptions)) {
    throw new Error(`label descriptions changed in ${filename}`);
  }
  if (
    result.causality.randomSeed !== `0x${CUT_SEED.toString(16)}` ||
    result.causality.mutationSeed !== `0x${MUTATION_SEED.toString(16)} ^ cutoff`
  ) {
    throw new Error(`causality seed mismatch in ${filename}`);
  }
  const expectedChecks = cutpoints.reduce((total, cutoff) => total + cutoff + 1, 0);
  if (result.causality.prefixChecks !== expectedChecks) {
    throw new Error(`prefix comparison count mismatch in ${filename}`);
  }
  for (const cutoff of cutpoints) {
    if (!expectedSet.has(cutoff)) throw new Error(`unexpected cutpoint ${cutoff} in ${filename}`);
  }
  observedCutpoints.push(...cutpoints);
}
const sortedObserved = observedCutpoints.slice().sort((a, b) => a - b);
if (
  sortedObserved.length !== TOTAL_CUTPOINTS ||
  new Set(sortedObserved).size !== TOTAL_CUTPOINTS ||
  JSON.stringify(sortedObserved) !== JSON.stringify(expectedCutpoints)
) {
  throw new Error("Part 2 batches do not cover the exact frozen 200-cutpoint sample once each");
}

const batchDetails = batches
  .map(({ filename, result }) => ({
    filename,
    cutpoints: result.causality.cutpoints,
    prefixChecks: result.causality.prefixChecks,
    prefixMismatchBars: result.causality.prefixMismatchBars,
    prefixMismatchCuts: result.causality.prefixMismatchCuts,
    suffixMutationMismatchBars: result.causality.suffixMutationMismatchBars,
    suffixMutationMismatchCuts: result.causality.suffixMutationMismatchCuts,
    mismatches: result.causality.mismatches,
    runtimeMs: result.causality.runtimeMs,
  }))
  .sort((a, b) => a.cutpoints[0] - b.cutpoints[0]);
const sum = (key) => batchDetails.reduce((total, batch) => total + batch[key], 0);
const prefixMismatchBars = sum("prefixMismatchBars");
const prefixMismatchCuts = sum("prefixMismatchCuts");
const suffixMutationMismatchBars = sum("suffixMutationMismatchBars");
const suffixMutationMismatchCuts = sum("suffixMutationMismatchCuts");
const mismatches = prefixMismatchBars + suffixMutationMismatchBars;
const prefixChecks = sum("prefixChecks");
const runtimeMs = sum("runtimeMs");
if (prefixChecks !== expectedCutpoints.reduce((total, cutoff) => total + cutoff + 1, 0)) {
  throw new Error("merged prefix-check count does not match the 200 cutpoints");
}
if (mismatches !== sum("mismatches")) throw new Error("merged mismatch accounting is inconsistent");
const batchSizes = [...new Set(batchDetails.map((batch) => batch.cutpoints.length))].sort(
  (a, b) => a - b,
);

const causality = {
  randomSeed: `0x${CUT_SEED.toString(16)}`,
  mutationSeed: `0x${MUTATION_SEED.toString(16)} ^ cutoff`,
  cutpoints: expectedCutpoints,
  cutpointRange: [expectedCutpoints[0], expectedCutpoints.at(-1)],
  prefixChecks,
  prefixMismatchBars,
  prefixMismatchCuts,
  suffixMutationMismatchBars,
  suffixMutationMismatchCuts,
  mismatches,
  clean: mismatches === 0,
  runtimeMs,
  batches: batchDetails,
};
const result = {
  dataInfo: first.dataInfo,
  causality,
  descriptions: first.descriptions,
  execution: {
    method: `${batchDetails.length} isolated Node processes, batch sizes ${batchSizes.join(", ")}, exact seeded cutpoint union revalidated before merge`,
    processCount: batchDetails.length,
    batchSizes,
  },
};
await writeFile(path.join(DIR, "part2-results.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `Merged ${batchDetails.length} Part 2 processes (${batchSizes.join("/")} cutpoints each): ${TOTAL_CUTPOINTS} cutpoints, ${mismatches} mismatches.`,
);
