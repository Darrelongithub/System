/**
 * Determinism guard: repeated full runs are byte-equal.
 *
 * NOTE (v2.0): the v1.8 "independence" test — a strategy's signals must be
 * identical under subset/superset execution — was obsolete. The v2.0 regime gate
 * and portfolio gate (bar dedupe / anti-hedge / stack cap) are intentionally
 * global and cross-strategy, so a solo run is *not* bit-identical to a full run
 * by design. The meaningful determinism guarantee — byte identity across repeated
 * runs of the full production set — is pinned below.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { loadBaselineCsv } from "./fixtures.mjs";
import { runAnalysis } from "../src/lib/analyzer/run.ts";

const OPTIONS = { seriesEndsComplete: true };

function fullFingerprint(analysis) {
  return JSON.stringify(
    analysis.tradePasses.map((t) => [
      t.strategyId,
      t.index,
      t.side,
      t.entry,
      t.sl,
      t.tp,
      t.outcome,
      t.exitDatetime,
      t.exitPrice,
      t.rMultiple,
    ]),
  );
}

test("determinism: three consecutive full runs are byte-identical", () => {
  const csv = loadBaselineCsv();
  const a = runAnalysis(csv, OPTIONS);
  const b = runAnalysis(csv, OPTIONS);
  const c = runAnalysis(csv, OPTIONS);
  assert(a.ok && b.ok && c.ok, "runs ok");
  const fa = fullFingerprint(a.analysis);
  assertEqual(fullFingerprint(b.analysis), fa, "run B differs from run A");
  assertEqual(fullFingerprint(c.analysis), fa, "run C differs from run A");
});
