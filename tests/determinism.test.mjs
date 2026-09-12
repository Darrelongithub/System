/**
 * Determinism & strategy-independence guards: repeated runs are byte-equal;
 * running strategies in a different order or a subset leaves each strategy's
 * signals untouched (no cross-strategy state leaks through shared context —
 * consumed-level keys are strategy-scoped).
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { loadBaselineCsv } from "./fixtures.mjs";
import { runAnalysis } from "../src/lib/analyzer/run.ts";

const OPTIONS = { seriesEndsComplete: true, enableHtfDirectionFilter: true };

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

test("independence: a strategy's signals do not change under subset/superset execution", () => {
  const csv = loadBaselineCsv();
  const full = runAnalysis(csv, OPTIONS);
  assert(full.ok, "full run ok");
  const probe = ["macd-cross", "three-soldiers", "pdh-retest"];
  const sigOf = (analysis, id) =>
    analysis.tradePasses
      .filter((t) => t.strategyId === id)
      .map((t) => `${t.index}|${t.side}|${t.entry}|${t.sl}|${t.tp}|${t.outcome}|${t.exitDatetime}`)
      .join(";");
  for (const id of probe) {
    const solo = runAnalysis(csv, { ...OPTIONS, strategyIds: [id] });
    assert(solo.ok, `solo run ok for ${id}`);
    assertEqual(
      sigOf(solo.analysis, id),
      sigOf(full.analysis, id),
      `${id} signals differ between solo and full-set execution`,
    );
  }
});
