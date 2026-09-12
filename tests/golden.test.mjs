/**
 * GOLDEN REGRESSION — the locked baseline must reproduce the committed golden
 * row-for-row. Any behavior change (accidental or intended) fails here and
 * requires an explicit, separate re-baselining decision; never regenerate the
 * golden just to make a change pass.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { baselineAnalysis, loadGoldenSummary, loadGoldenTrades } from "./fixtures.mjs";

const TRADE_FIELDS = [
  "strategyId",
  "datetime",
  "index",
  "side",
  "entry",
  "sl",
  "tp",
  "rr",
  "setupStatus",
  "outcome",
  "exitDatetime",
  "exitPrice",
  "rMultiple",
  "reason",
];

const keyOf = (t) => `${t.strategyId}|${t.datetime}|${t.index}|${t.side}`;

test("golden: baseline reproduces locked trades row-for-row and aggregate-for-aggregate", async () => {
  const analysis = await baselineAnalysis();
  const golden = loadGoldenTrades();
  const summary = loadGoldenSummary();

  assertEqual(analysis.tradePasses.length, golden.length, "trade row count");

  const currentByKey = new Map(analysis.tradePasses.map((t) => [keyOf(t), t]));
  const goldenByKey = new Map(golden.map((t) => [keyOf(t), t]));
  assertEqual(currentByKey.size, goldenByKey.size, "distinct trade keys");

  let mismatches = 0;
  for (const [k, g] of goldenByKey) {
    const c = currentByKey.get(k);
    if (!c) {
      mismatches++;
      if (mismatches <= 5) console.error(`  missing trade ${k}`);
      continue;
    }
    for (const f of TRADE_FIELDS) {
      // JSON normalization: golden artifacts serialize absent optionals as null.
      if ((c[f] ?? null) !== (g[f] ?? null)) {
        mismatches++;
        if (mismatches <= 5)
          console.error(`  field mismatch ${k}.${f}: golden=${g[f]} current=${c[f]}`);
        break;
      }
    }
  }
  for (const k of currentByKey.keys()) {
    if (!goldenByKey.has(k)) {
      mismatches++;
      if (mismatches <= 5) console.error(`  extra trade ${k}`);
    }
  }
  assertEqual(mismatches, 0, "row-level divergence from golden-trades.json");

  // Aggregate comparison (rSum compares with float-tolerance: summation order
  // is not part of the contract).
  const agg = { triggers: 0, tp: 0, sl: 0, open: 0, noFill: 0, rSum: 0 };
  for (const t of analysis.tradePasses) {
    agg.triggers++;
    if (t.outcome === "TP") agg.tp++;
    else if (t.outcome === "SL") agg.sl++;
    else if (t.outcome === "OPEN") agg.open++;
    else if (t.outcome === "NO_FILL") agg.noFill++;
    agg.rSum += t.rMultiple ?? 0;
  }
  const g = summary.overall ?? summary.agg ?? summary;
  assertEqual(analysis.analyzedRows, summary.analyzedRows, "analyzedRows");
  assertEqual(analysis.tradePasses.length, summary.tradePassCount, "tradePassCount");
  if (summary.contextPassCount !== undefined) {
    assertEqual(analysis.contextPasses.length, summary.contextPassCount, "contextPassCount");
  }
  if (summary.invalidRows !== undefined) {
    assertEqual(analysis.invalidRows, summary.invalidRows, "invalidRows");
  }
  if (g && g.triggers !== undefined) {
    assertEqual(agg.triggers, g.triggers, "triggers");
    assertEqual(agg.tp, g.tp, "tp");
    assertEqual(agg.sl, g.sl, "sl");
    assertEqual(agg.open, g.open, "open");
    assertEqual(agg.noFill, g.noFill, "noFill");
    assert(Math.abs(agg.rSum - g.rSum) < 1e-6, `rSum drift: golden ${g.rSum} current ${agg.rSum}`);
  }

  // Per-strategy aggregate comparison.
  if (summary.perStrategy) {
    const per = new Map();
    for (const t of analysis.tradePasses) {
      const e = per.get(t.strategyId) ?? { triggers: 0, tp: 0, sl: 0, open: 0, noFill: 0, rSum: 0 };
      e.triggers++;
      if (t.outcome === "TP") e.tp++;
      else if (t.outcome === "SL") e.sl++;
      else if (t.outcome === "OPEN") e.open++;
      else if (t.outcome === "NO_FILL") e.noFill++;
      e.rSum += t.rMultiple ?? 0;
      per.set(t.strategyId, e);
    }
    for (const [id, gs] of Object.entries(summary.perStrategy)) {
      const cs = per.get(id);
      assert(cs, `strategy ${id} missing from current run`);
      assertEqual(cs.triggers, gs.triggers, `${id}.triggers`);
      assertEqual(cs.tp, gs.tp, `${id}.tp`);
      assertEqual(cs.sl, gs.sl, `${id}.sl`);
      assertEqual(cs.open, gs.open, `${id}.open`);
      assertEqual(cs.noFill ?? 0, gs.noFill ?? 0, `${id}.noFill`);
      assert(Math.abs(cs.rSum - gs.rSum) < 1e-6, `${id}.rSum drift`);
    }
    assertEqual(per.size, Object.keys(summary.perStrategy).length, "strategy count");
  }
});
