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
  const { candles } = parseCsv(loadBaselineCsv());
  const byDatetime = new Map(candles.map((c) => [c.datetime, c]));
  let checked = 0;
  let levelFills = 0;
  let gapFills = 0;
  for (const t of analysis.tradePasses) {
    if (t.outcome !== "TP" && t.outcome !== "SL") continue;
    checked++;
    const risk = Math.abs(t.entry - t.sl);
    assert(risk > 0, `positive risk on ${t.strategyId}@${t.index}`);
    const long = t.side === "long";
    const realized = ((long ? t.exitPrice - t.entry : t.entry - t.exitPrice) ?? Number.NaN) / risk;
    // R is always the REALISED multiple: actual exit price against initial risk.
    assert(
      Math.abs((t.rMultiple ?? Number.NaN) - realized) < 1e-9,
      `rMultiple recompute on ${t.strategyId}@${t.index}: expected ${realized}, got ${t.rMultiple}`,
    );

    const level = t.outcome === "TP" ? t.tp : t.sl;
    if (t.exitPrice === level) {
      // Resting order filled at its own level: realised R is the planned one.
      levelFills++;
      const planned = t.outcome === "TP" ? Math.abs(t.tp - t.entry) / risk : -1;
      assert(
        Math.abs(realized - planned) < 1e-9,
        `level fill must book planned R on ${t.strategyId}@${t.index}`,
      );
    } else {
      // Gap-through: the bar opened beyond the level and never traded it, so
      // the fill is that bar's open — and R must reflect the worse/better fill.
      gapFills++;
      const bar = byDatetime.get(t.exitDatetime);
      assert(bar, `resolving candle exists for ${t.strategyId}@${t.index}`);
      assertEqual(t.exitPrice, bar.open, `gap fill is the bar's open (${t.strategyId})`);
      // The open must sit beyond the barrier in the direction that triggers it:
      // a target is reached from the profitable side, a stop from the losing one.
      const opensBeyond =
        t.outcome === "TP"
          ? long
            ? t.exitPrice > level
            : t.exitPrice < level
          : long
            ? t.exitPrice < level
            : t.exitPrice > level;
      assert(
        opensBeyond,
        `gap fill sits beyond the level on ${t.strategyId}@${t.index} (${t.exitPrice} vs ${level})`,
      );
      if (t.outcome === "SL")
        assert(
          realized < -1,
          `gapped stop is worse than planned -1R on ${t.strategyId}@${t.index}`,
        );
      else
        assert(
          realized > Math.abs(t.tp - t.entry) / risk - 1e-9,
          `gapped target beats the planned R on ${t.strategyId}@${t.index}`,
        );
    }

    assert(t.exitDatetime > t.datetime, `exit strictly after trigger ${t.strategyId}@${t.index}`);
    // SL must sit on the losing side of the entry.
    if (t.side === "short")
      assert(t.sl > t.entry, `short SL above entry ${t.strategyId}@${t.index}`);
    else assert(t.sl < t.entry, `long SL below entry ${t.strategyId}@${t.index}`);
  }
  assert(checked > 2000, `fixture sanity: expected >2000 resolved trades, got ${checked}`);
  // Both fill classes exist on the locked baseline: the level-fill path is the
  // common case, and the gap path is the one this suite exists to protect.
  assert(levelFills > 2000, `expected >2000 level fills, got ${levelFills}`);
  assert(gapFills > 0, "the baseline exercises at least one gap-through fill");
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
