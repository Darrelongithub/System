/**
 * The HTF direction filter is documented INERT — `RunOptions.enableHtfDirectionFilter`
 * says runAnalysis accepts the flag for call-site compatibility but never reads
 * it, because activating it would change strategy definition (A1) and needs its
 * own experiment + golden.
 *
 * That one fact is what allows `compareHtfDirectionFilter` to run a SINGLE
 * engine pass instead of two and still return identical output — worth ~1.1s of
 * blocked main thread per analysis on the locked 9738-row baseline (measured:
 * 2.11s for the old pair of passes, ~1.2s per pass).
 *
 * These tests pin the invariant from both sides so the optimisation can never
 * quietly become a wrong answer: behaviour (flag on == flag off, row for row)
 * and implementation (exactly one engine pass inside the function). If the
 * filter is ever made live, test 1 fails first and the two-pass comparison has
 * to be restored.
 */
import { readFileSync } from "node:fs";
import { test, assert, assertEqual, assertDeepEqual } from "./tiny.mjs";
import { runAnalysis, compareHtfDirectionFilter } from "../src/lib/analyzer/run.ts";
import { loadBaselineCsv, repoPath } from "./fixtures.mjs";

/** Row projection used for the row-for-row comparison (cheap, order sensitive). */
const project = (rows) =>
  rows
    .map((r) =>
      [
        r.index,
        r.strategyId,
        r.side,
        r.entry,
        r.sl,
        r.tp,
        r.outcome,
        r.htfTrend,
        r.statusNote,
      ].join("|"),
    )
    .join("\n");

// The baseline passes are ~1.2s each; compute them once for the whole file.
let runs = null;
function baselineRuns() {
  if (runs) return runs;
  const csv = loadBaselineCsv();
  const off = runAnalysis(csv, { seriesEndsComplete: true, enableHtfDirectionFilter: false });
  const on = runAnalysis(csv, { seriesEndsComplete: true, enableHtfDirectionFilter: true });
  assert(off.ok && on.ok, "both baseline runs succeed");
  runs = { csv, off: off.analysis, on: on.analysis };
  return runs;
}

test("HTF filter inert: flag off and flag on produce identical PASS rows on the locked baseline", () => {
  const { off, on } = baselineRuns();
  assert(on.passing.length > 0, "baseline produces PASS rows at all");
  assertEqual(on.passing.length, off.passing.length, "same PASS row count");
  assertEqual(
    project(on.passing),
    project(off.passing),
    "same PASS rows, field for field, in order",
  );
  assertEqual(
    on.tradePasses.length,
    off.tradePasses.length,
    "same resolved trade count (the flag cannot change trade generation)",
  );
});

test("compareHtfDirectionFilter: exactly one engine pass, before == after for every strategy", () => {
  const src = readFileSync(repoPath("src/lib/analyzer/run.ts"), "utf8");
  const marker = "export function compareHtfDirectionFilter";
  const start = src.indexOf(marker);
  assert(start >= 0, `${marker} must exist in src/lib/analyzer/run.ts`);
  // Body = from the declaration to the next top-level declaration (or EOF).
  const rest = src.slice(start + marker.length);
  const nextDecl = rest.search(/\n(?:export |function |const |let |class )/);
  const body = src.slice(start, nextDecl === -1 ? src.length : start + marker.length + nextDecl);
  const passes = (body.match(/runAnalysis\(/g) ?? []).length;
  assertEqual(
    passes,
    1,
    "compareHtfDirectionFilter must make exactly ONE runAnalysis pass — the HTF flag is inert, " +
      "so a second pass buys nothing and costs ~1.1s of blocked main thread. If the filter is " +
      "ever activated, restore the two-pass comparison (and update this test).",
  );

  const rows = compareHtfDirectionFilter(loadBaselineCsv());
  assert(rows.length > 0, "per-strategy rows on the baseline");
  assert(
    rows.every((r) => r.before.triggers > 0),
    "only strategies that produced triggers are listed",
  );
  for (const row of rows) {
    assertDeepEqual(row.before, row.after, `${row.strategy}: before == after (filter is inert)`);
  }
});

test("compareHtfDirectionFilter: trigger counts match an independent single pass", () => {
  const csv = loadBaselineCsv();
  const independent = runAnalysis(csv, {});
  assert(independent.ok, "independent run succeeds");
  const expected = new Map();
  for (const row of independent.analysis.passing) {
    expected.set(row.strategyId, (expected.get(row.strategyId) ?? 0) + 1);
  }

  const rows = compareHtfDirectionFilter(csv);
  assertEqual(rows.length, expected.size, "one entry per strategy that produced triggers");
  for (const row of rows) {
    assertEqual(
      row.before.triggers,
      expected.get(row.strategyId),
      `${row.strategy}: trigger count equals the independent pass`,
    );
  }
  // Sorted by trigger count desc, then strategy name — pins the UI order too.
  const triggers = rows.map((r) => r.before.triggers);
  assertDeepEqual(
    triggers,
    [...triggers].sort((a, b) => b - a),
    "rows are sorted by triggers, descending",
  );
});
