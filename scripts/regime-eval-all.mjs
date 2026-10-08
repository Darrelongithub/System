#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FULL_BATCH_SIZE = 20;
const FULL_BATCH_COUNT = 10;
const SAFE_RANGE_SIZE = 5;
const EVAL_DIR = path.join(ROOT, "src/lib/regime-detector-eval");

async function fileExists(file) {
  try {
    await access(path.join(EVAL_DIR, file));
    return true;
  } catch {
    return false;
  }
}

async function hasCompleteBatch(batchIndex) {
  const filename = `part2-batch-${String(batchIndex).padStart(2, "0")}.json`;
  if (!(await fileExists(filename))) return false;
  try {
    const batch = JSON.parse(await readFile(path.join(EVAL_DIR, filename), "utf8"));
    return (
      batch.batchIndex === batchIndex &&
      batch.batchSize === FULL_BATCH_SIZE &&
      batch.batchCount === FULL_BATCH_COUNT &&
      batch.totalCutpoints === FULL_BATCH_SIZE * FULL_BATCH_COUNT &&
      batch.causality?.cutpoints?.length === FULL_BATCH_SIZE
    );
  } catch {
    return false;
  }
}

async function hasCompleteRange(start, count) {
  const filename = `part2-range-${String(start).padStart(3, "0")}-${String(start + count - 1).padStart(3, "0")}.json`;
  if (!(await fileExists(filename))) return false;
  try {
    const batch = JSON.parse(await readFile(path.join(EVAL_DIR, filename), "utf8"));
    return (
      batch.batchStart === start &&
      batch.batchSize === count &&
      batch.totalCutpoints === FULL_BATCH_SIZE * FULL_BATCH_COUNT &&
      batch.causality?.cutpoints?.length === count
    );
  } catch {
    return false;
  }
}

function run(label, script, args = []) {
  console.error(`[orchestrator] ${label}`);
  const result = spawnSync(
    process.execPath,
    [...process.execArgv, path.join(HERE, script), ...args],
    { cwd: ROOT, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = result.signal ? `signal ${result.signal}` : `exit code ${result.status}`;
    throw new Error(`${label} failed with ${detail}`);
  }
}

for (let batchIndex = 0; batchIndex < FULL_BATCH_COUNT; batchIndex++) {
  const rangeStart = batchIndex * FULL_BATCH_SIZE;
  if (await hasCompleteBatch(batchIndex)) {
    console.error(
      `[orchestrator] reusing completed Part 2 batch ${batchIndex + 1}/${FULL_BATCH_COUNT}`,
    );
    continue;
  }
  for (let start = rangeStart; start < rangeStart + FULL_BATCH_SIZE; start += SAFE_RANGE_SIZE) {
    const count = Math.min(SAFE_RANGE_SIZE, rangeStart + FULL_BATCH_SIZE - start);
    if (await hasCompleteRange(start, count)) {
      console.error(
        `[orchestrator] reusing completed cutpoint range ${start}..${start + count - 1}`,
      );
      continue;
    }
    run(`Part 2 cutpoint range ${start}..${start + count - 1}`, "regime-eval-run.mjs", [
      "--phase=part2",
      `--part2-range-start=${start}`,
      `--part2-range-count=${count}`,
    ]);
  }
}
run("merge Part 2 batches", "regime-eval-merge.mjs");
run("Part 3 real-gold statistics", "regime-eval-run.mjs", ["--phase=part3"]);
console.error("[orchestrator] all phases complete; generate REPORT.md and SHA256SUMS.txt next");
