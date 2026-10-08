#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_OPTIONS_SHA256,
  DETECTOR_TREE_SHA256,
  INPUT_FILE,
  INPUT_SHA256,
  SPEC_SHA256,
  sha256,
} from "../src/lib/regime-detector-eval/core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVAL = path.join(ROOT, "src/lib/regime-detector-eval");
const OUTPUT = path.join(EVAL, "SHA256SUMS.txt");

async function walk(directory, relative = "") {
  const entries = await readdir(path.join(directory, relative), { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) results.push(...(await walk(directory, child)));
    else if (entry.isFile()) results.push(child);
  }
  return results.sort();
}

async function treeManifestBytes(directory) {
  const manifest = {};
  for (const relative of await walk(directory)) {
    manifest[relative] = sha256(await readFile(path.join(directory, relative)));
  }
  return Buffer.from(JSON.stringify(manifest), "utf8");
}

const detectorManifest = await treeManifestBytes(path.join(ROOT, "src/lib/regime-detector"));
const frozenManifest = await treeManifestBytes(path.join(EVAL, "frozen-detector"));
if (
  sha256(detectorManifest) !== DETECTOR_TREE_SHA256 ||
  sha256(frozenManifest) !== DETECTOR_TREE_SHA256
) {
  throw new Error("detector tree hash mismatch; not writing inventory");
}
await writeFile(path.join(EVAL, "source-detector-tree-manifest.json"), detectorManifest);
await writeFile(path.join(EVAL, "frozen-detector-tree-manifest.json"), frozenManifest);

const frozenGuide = await readFile(path.join(EVAL, "frozen-guide.md"));
try {
  const sourceGuide = await readFile(path.join(ROOT, "docs/MARKET-REGIME-DETECTOR.md"));
  if (!sourceGuide.equals(frozenGuide)) throw new Error("frozen guide differs from source guide");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const guideManifest = Buffer.from(
  JSON.stringify({ "docs/MARKET-REGIME-DETECTOR.md": sha256(frozenGuide) }),
  "utf8",
);
await writeFile(path.join(EVAL, "guide-source-manifest.json"), guideManifest);

const specBytes = await readFile(path.join(EVAL, "SPEC-RD.md"));
if (sha256(specBytes) !== SPEC_SHA256)
  throw new Error("SPEC-RD hash mismatch; not writing inventory");
const inputBytes = await readFile(path.join(ROOT, INPUT_FILE));
if (sha256(inputBytes) !== INPUT_SHA256)
  throw new Error("gold input hash mismatch; not writing inventory");
const part2 = JSON.parse(await readFile(path.join(EVAL, "part2-results.json"), "utf8"));
const defaultBytes = Buffer.from(JSON.stringify(part2.dataInfo.evaluationDefaults), "utf8");
if (sha256(defaultBytes) !== DEFAULT_OPTIONS_SHA256) {
  throw new Error("runtime default-options hash mismatch; not writing inventory");
}

const files = new Set([
  INPUT_FILE,
  "scripts/regime-eval-run.mjs",
  "scripts/regime-eval-all.mjs",
  "scripts/regime-eval-merge.mjs",
  "scripts/regime-eval-report.mjs",
  "scripts/regime-eval-inventory.mjs",
  "tests/regime-eval.test.mjs",
  "tests/register.mjs",
  "src/lib/ohlc-generator.ts",
]);
for (const relative of await walk(EVAL)) {
  if (relative !== "SHA256SUMS.txt") {
    files.add(path.posix.join("src/lib/regime-detector-eval", relative));
  }
}
for (const relative of await walk(path.join(ROOT, "src/lib/synth"))) {
  if (/\.(?:ts|json|md)$/.test(relative) && !relative.startsWith("backups/")) {
    files.add(path.posix.join("src/lib/synth", relative));
  }
}
const rows = [];
for (const file of [...files].sort()) {
  rows.push(`${sha256(await readFile(path.join(ROOT, file)))}  ${file}`);
}
await writeFile(OUTPUT, `${rows.join("\n")}\n`);
console.log(
  `Wrote ${path.relative(ROOT, OUTPUT)} with ${files.size} standard SHA-256 file entries.`,
);
