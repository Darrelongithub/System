/**
 * RULE-SET FREEZE.
 *
 * The project's output is a live analyzer whose historical replay must behave the
 * same way. That is only meaningful if "the rules" are a fixed, identifiable
 * thing: an unnoticed edit to a threshold, a filter order, or a strategy file
 * would silently invalidate every comparison in the logs and every piece of
 * forward validation.
 *
 * This test hashes the *normalised* source of the rule files — comments and
 * whitespace stripped, so documentation and formatting stay free — and compares
 * it with the frozen value below. A mismatch means the rules changed.
 *
 * Re-freezing is allowed, but it is a product decision, not a convenience:
 *   1. re-run the full suite and the golden lock (`npm test`, `npm run test:golden`);
 *   2. record what changed and why in `logs/` (see FORWARD-VALIDATION.md §2 —
 *      a rule change starts a NEW hypothesis, and the evaluation window restarts);
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
  "src/lib/analyzer/regime-filters.ts",
  "src/lib/analyzer/run.ts",
  "src/lib/analyzer/strategies/final-survivors.ts",
  "src/lib/analyzer/structure.ts",
  "src/lib/analyzer/status.ts",
];

/**
 * Frozen 2026-09-16 (v1.8: Filter C + Filter F; F is a provisional loss-reduction
 * filter). The v1.8.1 hardening pass changed no rule — only guards, provenance and
 * tooling — so the hashes below are unchanged by it.
 *
 * These are 16 hex chars of sha256(normalised source). If this test fails, the
 * rules moved: decide, document (`logs/`), then update the value.
 */
const FROZEN_RULES = {
  "src/lib/analyzer/regime-filters.ts": "96faff42add653d5",
  "src/lib/analyzer/run.ts": "a88ebbd06e0e9b72",
  "src/lib/analyzer/strategies/final-survivors.ts": "2931d36e9a0a29a9",
  "src/lib/analyzer/structure.ts": "b6ebd6d6d6ac780a",
  "src/lib/analyzer/status.ts": "e64e252c3b9beb58",
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
  // A rule file listed without a frozen hash would be skipped by the loop below
  // (and a strategy file could then be added to RULE_FILES while still being
  // unpinned) — so the two lists must stay in step.
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

test("freeze: the shipped configuration, filters and golden lock are pinned", () => {
  // Filter defaults live in run.ts and nowhere else (helpers/inert options aside).
  const run = readFileSync(repoPath("src/lib/analyzer/run.ts"), "utf8");
  assert(/options\.enableFilterC \?\? true/.test(run), "Filter C default-on");
  assert(
    /options\.enableFilterF \?\? true/.test(run),
    "Filter F default-on (provisional loss filter)",
  );
  assert(/options\.seriesEndsComplete \?\? false/.test(run), "live-safe series end default");

  assertEqual(MIN_PRODUCTION_BARS, 1000, "production history floor");

  const summary = loadGoldenSummary();
  assertEqual(summary.totals.triggers, 2286, "golden triggers");
  assertEqual(summary.totals.tp, 751, "golden TP");
  assertEqual(summary.totals.sl, 1531, "golden SL");
  assertEqual(summary.totals.open, 4, "golden OPEN");
  assert(Math.abs(summary.totals.rSum - 541.3570458970024) < 1e-9, "golden R");

  // The shipped book must be the one the lock describes, and the opt-out must
  // still reproduce the previous book (the two guarantees the freeze protects).
  const shipped = runAnalysis(loadBaselineCsv(), ANALYZER_CERTIFIED_OPTIONS);
  assert(shipped.ok, "shipped run ok");
  assertEqual(shipped.analysis.tradePasses.length, 2286, "shipped trades");
  assert(shipped.analysis.contract.ok, "the locked baseline satisfies the series contract");

  const optOut = runAnalysis(loadBaselineCsv(), {
    ...ANALYZER_CERTIFIED_OPTIONS,
    enableFilterF: false,
  });
  assert(optOut.ok, "opt-out run ok");
  assertEqual(optOut.analysis.tradePasses.length, 2323, "opt-out reproduces the pre-Filter-F book");
});
