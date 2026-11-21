/**
 * RULE-SET FREEZE.
 *
 * The project's output is a live analyzer whose historical replay must behave the
 * same way. That is only meaningful if "the rules" are a fixed, identifiable
 * thing: an unnoticed edit to a threshold, a gate order, or a strategy file
 * would silently invalidate every comparison in the logs and every piece of
 * forward validation.
 *
 * This test hashes the *normalised* source of the rule files — comments and
 * whitespace stripped, so documentation and formatting stay free — and compares
 * it with the frozen value below. A mismatch means the rules changed.
 *
 * Re-freezing is allowed, but it is a product decision, not a convenience:
 *   1. re-run the full suite and the golden lock (`npm test`, `npm run test:golden`);
 *   2. record what changed and why in `logs/` (v2.0 ruleset freeze —
 *      logs/v2.0-regime-bots.md);
 *   3. update FROZEN_RULES below in the same commit.
 *
 * To print the current hashes after a documented change:
 *   node --experimental-strip-types --import ./tests/register.mjs tests/run.mjs freeze
 * and read the reported "frozen X → now Y" pairs.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { repoPath } from "./fixtures.mjs";
import { loadGoldenSummary } from "./fixtures.mjs";
import { MIN_PRODUCTION_BARS } from "../src/lib/analyzer/config.ts";
import { runAnalysis } from "../src/lib/analyzer/run.ts";
import { loadBaselineCsv } from "./fixtures.mjs";
import { ANALYZER_CERTIFIED_OPTIONS } from "../src/lib/analyzer/config.ts";

/** Rule files: anything that can change what trade the engine takes. */
const RULE_FILES = [
  "src/lib/analyzer/run.ts",
  "src/lib/analyzer/regime-state.ts",
  "src/lib/analyzer/portfolio-gate.ts",
  "src/lib/analyzer/strategies/v2-regime-bots.ts",
  "src/lib/analyzer/math.ts",
  "src/lib/analyzer/status.ts",
  "src/lib/analyzer/structure.ts",
];

/**
 * Frozen 2026-11-21 (v2.0: regime-gated ruleset — 8 regime-routed bots behind the
 * Layer 1-4 gates). See logs/v2.0-regime-bots.md.
 *
 * These are 16 hex chars of sha256(normalised source). If this test fails, the
 * rules moved: decide, document (`logs/`), then update the value.
 */
const FROZEN_RULES = {
  "src/lib/analyzer/run.ts": "8b310641907fffd2",
  "src/lib/analyzer/regime-state.ts": "39006decfe9983a1",
  "src/lib/analyzer/portfolio-gate.ts": "ee0a1374ce8a1c1a",
  "src/lib/analyzer/strategies/v2-regime-bots.ts": "ef8f33632b140277",
  "src/lib/analyzer/math.ts": "72645bc29f6c3318",
  "src/lib/analyzer/status.ts": "aa08a97cb2818d64",
  "src/lib/analyzer/structure.ts": "83670a1bf9fa24bf",
};

/** Comments out, whitespace collapsed — formatting must not trip the freeze. */
export function normalizeSource(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments (incl. jsdoc)
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ") // line comments
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizedRuleHash(relativePath) {
  const source = readFileSync(repoPath(relativePath), "utf8");
  return createHash("sha256").update(normalizeSource(source), "utf8").digest("hex").slice(0, 16);
}

test("freeze: the rule sources are unchanged since the freeze", () => {
  assertEqual(
    Object.keys(FROZEN_RULES).length,
    RULE_FILES.length,
    "every rule file needs a frozen hash",
  );
  for (const file of RULE_FILES) {
    assert(FROZEN_RULES[file], `${file} has no frozen hash`);
  }
  const drifts = [];
  for (const file of RULE_FILES) {
    const expected = FROZEN_RULES[file];
    const actual = normalizedRuleHash(file);
    if (expected && expected !== actual) drifts.push(`${file}: frozen ${expected} → now ${actual}`);
  }
  assertEqual(
    drifts.length,
    0,
    `rule sources changed — this is a product decision, not a refactor. Record it in logs/ and ` +
      `update FROZEN_RULES in the same commit.\n  ${drifts.join("\n  ")}`,
  );
});

test("freeze: the shipped configuration and golden lock are pinned", () => {
  // Shipped defaults live in run.ts and nowhere else (helpers/inert options aside).
  const run = readFileSync(repoPath("src/lib/analyzer/run.ts"), "utf8");
  assert(/enableRegimeGate\s*\?\?\s*true/.test(run), "regime gate default-on");
  assert(/enablePortfolioGate\s*\?\?\s*true/.test(run), "portfolio gate default-on");
  assert(/seriesEndsComplete\s*\?\?\s*false/.test(run), "live-safe series end default");

  assertEqual(MIN_PRODUCTION_BARS, 1000, "production history floor");

  const summary = loadGoldenSummary();
  assertEqual(summary.totals.triggers, 186, "golden triggers");
  assertEqual(summary.totals.tp, 61, "golden TP");
  assertEqual(summary.totals.sl, 125, "golden SL");
  assertEqual(summary.totals.open, 0, "golden OPEN");
  assert(Math.abs(summary.totals.rSum - 71.25196648041668) < 1e-9, "golden R");

  // The shipped book must be the one the lock describes.
  const shipped = runAnalysis(loadBaselineCsv(), ANALYZER_CERTIFIED_OPTIONS);
  assert(shipped.ok, "shipped run ok");
  assertEqual(shipped.analysis.tradePasses.length, summary.totals.triggers, "shipped trades");
  assert(shipped.analysis.contract.ok, "the locked baseline satisfies the series contract");
});
