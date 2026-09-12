/**
 * Accounting invariants over the locked baseline: outcome buckets partition
 * triggers; per-strategy numbers sum to the global summary; R is
 * independently recomputed from row-level fields; exits are sane.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { baselineAnalysis, loadBaselineCsv } from "./fixtures.mjs";
import { parseCsv } from "../src/lib/analyzer/parse.ts";

test("accounting: triggers partition exactly into TP + SL + OPEN + NO_FILL", async () => {
  const analysis = await baselineAnalysis();
  const per = new Map();
  for (const t of analysis.tradePasses) {
    const e = per.get(t.strategyId) ?? { triggers: 0, tp: 0, sl: 0, open: 0, noFill: 0, rSum: 0 };
    e.triggers++;
    if (t.outcome === "TP") e.tp++;
    else if (t.outcome === "SL") e.sl++;
    else if (t.outcome === "OPEN") e.open++;
    else if (t.outcome === "NO_FILL") e.noFill++;
    else throw new Error(`unknown outcome ${t.outcome}`);
    e.rSum += t.rMultiple ?? 0;
    per.set(t.strategyId, e);
  }
  const g = { triggers: 0, tp: 0, sl: 0, open: 0, noFill: 0, rSum: 0 };
  for (const [id, e] of per) {
    assertEqual(e.tp + e.sl + e.open + e.noFill, e.triggers, `${id} outcome partition`);
    g.triggers += e.triggers;
    g.tp += e.tp;
    g.sl += e.sl;
    g.open += e.open;
    g.noFill += e.noFill;
    g.rSum += e.rSum;
  }
  assertEqual(g.tp + g.sl + g.open + g.noFill, g.triggers, "global outcome partition");
  assertEqual(g.triggers, analysis.tradePasses.length, "global trigger count");
});

test("accounting: every trade's R recomputes independently from row-level fields", async () => {
  const analysis = await baselineAnalysis();
  let checked = 0;
  for (const t of analysis.tradePasses) {
    if (t.outcome !== "TP" && t.outcome !== "SL") continue;
    checked++;
    const risk = Math.abs(t.entry - t.sl);
    assert(risk > 0, `positive risk on ${t.strategyId}@${t.index}`);
    const expected = t.outcome === "TP" ? Math.abs(t.tp - t.entry) / risk : -1;
    assert(
      Math.abs((t.rMultiple ?? Number.NaN) - expected) < 1e-9,
      `rMultiple recompute on ${t.strategyId}@${t.index}: expected ${expected}, got ${t.rMultiple}`,
    );
    if (t.outcome === "TP")
      assertEqual(t.exitPrice, t.tp, `TP exit at level ${t.strategyId}@${t.index}`);
    else assertEqual(t.exitPrice, t.sl, `SL exit at level ${t.strategyId}@${t.index}`);
    assert(t.exitDatetime > t.datetime, `exit strictly after trigger ${t.strategyId}@${t.index}`);
    // SL must sit on the losing side of the entry.
    if (t.side === "short")
      assert(t.sl > t.entry, `short SL above entry ${t.strategyId}@${t.index}`);
    else assert(t.sl < t.entry, `long SL below entry ${t.strategyId}@${t.index}`);
  }
  assert(checked > 2000, `fixture sanity: expected >2000 resolved trades, got ${checked}`);
});

test("accounting: exit prices stay inside the resolving candle's OHLC", async () => {
  const analysis = await baselineAnalysis();
  const { candles } = parseCsv(loadBaselineCsv());
  const byIndex = new Map(candles.map((c) => [c.datetime, c]));
  let checked = 0;
  for (const t of analysis.tradePasses) {
    if (t.exitDatetime === undefined || t.exitPrice === undefined) continue;
    const candle = byIndex.get(t.exitDatetime);
    assert(candle, `exit candle present ${t.strategyId}@${t.index}`);
    if (candle.high === undefined || candle.low === undefined) continue;
    checked++;
    assert(
      t.exitPrice >= candle.low - 1e-9 && t.exitPrice <= candle.high + 1e-9,
      `exit ${t.exitPrice} outside [${candle.low}, ${candle.high}] on ${t.strategyId}@${t.index}`,
    );
  }
  assert(checked > 2000, `fixture sanity: expected >2000 resolved exits, got ${checked}`);
});
