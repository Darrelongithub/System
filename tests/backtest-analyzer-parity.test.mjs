/**
 * BACKTESTER ↔ ANALYZER PARITY — round-3 hostile audit, committed gates.
 *
 * Reference implementation: the certified Backtester config
 *   runAnalysis(csv, { enableHtfDirectionFilter: true, seriesEndsComplete: true })
 * which reproduces the locked golden row-for-row.
 *
 * Live Analyzer (AnalysisV2) runs the same engine with
 *   runAnalysis(csv, { enableHtfDirectionFilter: true, seriesEndsComplete: false })
 * — i.e. it treats the final bar as possibly-in-progress (live-candle safety,
 * F2). On static historical data that is an intentional, bounded policy
 * difference: these tests certify that under the Analyzer config
 *   (a) zero signals differ,
 *   (b) zero results rows differ except the final bar's 16 strategy rows,
 *   (c) zero trade fields differ except resolutions that needed the final bar,
 * and that the Backtester's own accounting layers (analyseContinuous,
 * day-supplied loop, applyTriggers) are exact, state-isolated and
 * lookahead-free vs the golden reference.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { runAnalysis, compareHtfDirectionFilter } from "../src/lib/analyzer/run.ts";
import { analyseContinuous } from "../src/lib/pipeline/continuous.ts";
import { applyTriggers, dayReportSkipReason, rangeDays } from "../src/lib/backtest/engine.ts";
import { loadBaselineCsv, loadGoldenTrades, loadGoldenSummary } from "./fixtures.mjs";

const REF_OPTS = { enableHtfDirectionFilter: true, seriesEndsComplete: true };
const UI_OPTS = { enableHtfDirectionFilter: true, seriesEndsComplete: false };
const keyOf = (t) => `${t.strategyId}|${t.datetime}|${t.index}|${t.side}`;
const num = (v) => (typeof v === "number" ? v : undefined);
const nearly = (a, b) =>
  a === b || (num(a) !== undefined && num(b) !== undefined && Math.abs(a - b) < 1e-12);
const norm = (v) => (v === null ? undefined : v);

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

let cached = null;
function runs() {
  if (!cached) {
    cached = {
      ref: runAnalysis(loadBaselineCsv(), REF_OPTS),
      ui: runAnalysis(loadBaselineCsv(), UI_OPTS),
      cont: analyseContinuous(loadBaselineCsv(), { seriesEndsComplete: true }),
      golden: loadGoldenTrades(),
      summary: loadGoldenSummary(),
    };
  }
  assert(cached.ref.ok && cached.ui.ok && cached.cont.ok, "all three analyses succeed");
  return cached;
}

const aggregatesOf = (rows) => {
  const a = { triggers: 0, tp: 0, sl: 0, open: 0, noFill: 0, r: 0 };
  for (const t of rows) {
    a.triggers += 1;
    if (t.outcome === "TP") a.tp += 1;
    else if (t.outcome === "SL") a.sl += 1;
    else if (t.outcome === "NO_FILL") a.noFill += 1;
    else a.open += 1;
    if (typeof t.rMultiple === "number") a.r += t.rMultiple;
  }
  return a;
};

test("parity: Backtester reference reproduces the locked golden exactly", () => {
  const { ref, golden, summary } = runs();
  const g = aggregatesOf(golden),
    r = aggregatesOf(ref.analysis.tradePasses);
  assertEqual(ref.analysis.tradePasses.length, golden.length, "row count");
  assertEqual(summary.totals.triggers, 2323, "locked trigger count");
  assert(
    Math.abs(g.r - summary.totals.rSum) / Math.max(1, Math.abs(summary.totals.rSum)) < 1e-12,
    "golden R internal precision",
  );
  const byKey = new Map(golden.map((t) => [keyOf(t), t]));
  let exact = 0;
  for (const t of ref.analysis.tradePasses) {
    const g0 = byKey.get(keyOf(t));
    assert(g0, `golden contains ${keyOf(t)}`);
    for (const f of TRADE_FIELDS) assert(nearly(t[f], norm(g0[f])), `${keyOf(t)} field ${f}`);
    exact += 1;
  }
  assertEqual(exact, 2323, "all fields row-for-row");
  assert(Math.abs(r.r - g.r) / Math.max(1, Math.abs(g.r)) < 1e-12, "aggregate R");
});

test("parity: analyseContinuous DayTriggers mirror runAnalysis trade rows field-for-field", () => {
  const { ref, cont } = runs();
  assertEqual(cont.tradeTriggers.length, ref.analysis.tradePasses.length, "trigger count");
  cont.tradeTriggers.forEach((t, i) => {
    const r = ref.analysis.tradePasses[i];
    assertEqual(
      `${t.strategyId}|${t.datetime}|${t.side}`,
      `${r.strategyId}|${r.datetime}|${r.side ?? "-"}`,
      "row identity",
    );
    for (const f of ["entry", "sl", "tp", "rr", "exitPrice", "rMultiple"]) {
      assert(nearly(t[f], r[f]), `toTrigger preserves ${f} on ${keyOf(r)}`);
    }
    assert(t.exitDatetime === r.exitDatetime, `exitDatetime preserved`);
    if (t.kind === "trade") assert(t.outcome === (r.outcome ?? t.outcome), `outcome preserved`);
  });
});

test("parity: Backtest day-supplied accounting equals golden and per-strategy reference", () => {
  const { ref, cont, golden, summary } = runs();
  const daysWithCandles = new Set(ref.analysis.results.map((c) => c.datetime.slice(0, 10)));
  const first = ref.analysis.results[0].datetime.slice(0, 10);
  const last = ref.analysis.results[ref.analysis.results.length - 1].datetime.slice(0, 10);
  const state = { stats: {} };
  let skippedDays = 0;
  for (const day of rangeDays(first, last)) {
    const tr = cont.tradesOnDay(day);
    const ctx = cont.contextOnDay(day);
    if (dayReportSkipReason(day, daysWithCandles.has(day), tr.length, ctx.length) !== null) {
      skippedDays += 1;
      continue;
    }
    applyTriggers(state, tr);
  }
  let totals = { triggers: 0, tp: 0, sl: 0, open: 0, noFill: 0 };
  for (const s of Object.values(state.stats)) {
    totals.triggers += s.triggers;
    totals.tp += s.tpHits;
    totals.sl += s.slHits;
    totals.open += s.open;
    totals.noFill += s.noFill;
  }
  assertEqual(totals.triggers, 2323, "bt triggers");
  assertEqual(totals.tp, 756, "bt tp");
  assertEqual(totals.sl, 1563, "bt sl");
  assertEqual(totals.open, 4, "bt open");
  assertEqual(totals.noFill, 0, "bt noFill");
  assert(skippedDays > 0, "genuinely empty days still skipped");
  const perGolden = {};
  for (const g of golden) perGolden[g.strategyId] = (perGolden[g.strategyId] ?? 0) + 1;
  for (const [id, count] of Object.entries(perGolden)) {
    assertEqual(state.stats[id]?.triggers, count, `per-strategy ${id}`);
    assertEqual(summary.perStrategy[id].triggers, count, `summary per-strategy ${id}`);
  }
  const independent = aggregatesOf(golden);
  assertEqual(totals.tp + totals.sl + totals.open + totals.noFill, totals.triggers, "partition");
  assertEqual(independent.triggers, totals.triggers, "independent trigger total");
});

test("parity: Analyzer UI config diverges ONLY via final-bar live-candle policy", () => {
  const { ref, ui } = runs();
  const finalIndex = ref.analysis.results[ref.analysis.results.length - 1].index;
  const strategyRowsPerBar = ref.analysis.results.filter((r) => r.index === 0).length;

  // (b) results rows: exactly one bar's worth of strategy rows missing.
  assertEqual(
    ref.analysis.results.length - ui.analysis.results.length,
    strategyRowsPerBar,
    "exactly the final bar is signal-ineligible",
  );
  // Every surviving results row identical (same order, same fields).
  const byKeyUi = new Map(ui.analysis.results.map((r) => [`${r.strategyId}|${r.index}`, r]));
  let checked = 0;
  for (const r of ref.analysis.results) {
    if (r.index === finalIndex) continue;
    const u = byKeyUi.get(`${r.strategyId}|${r.index}`);
    assert(u, `ui has ${r.strategyId}@${r.index}`);
    assertEqual(u.result, r.result, "PASS/FAIL identical");
    checked += 1;
  }
  assert(checked > 0, "compared rows");

  // (a/c) trades: every analyzer-UI trade exists in the reference; shared-key
  // rows may differ ONLY on resolution fields, and only when the resolution
  // needed the final bar.
  const refTrades = ref.analysis.tradePasses;
  const refByKey = new Map(refTrades.map((t) => [keyOf(t), t]));
  const uiTrades = ui.analysis.tradePasses;
  const uiByKey = new Map(uiTrades.map((t) => [keyOf(t), t]));
  const lastEligible = ui.analysis.results[ui.analysis.results.length - 1].datetime;

  let signalFieldDiffs = 0,
    resolutionOnlyDiffs = 0;
  for (const t of uiTrades) {
    const r = refByKey.get(keyOf(t));
    if (!r) throw new Error(`analyzer-ui extra trade ${keyOf(t)}`);
    for (const f of ["entry", "sl", "tp", "rr", "side", "datetime"]) {
      if (!nearly(t[f], r[f])) signalFieldDiffs += 1;
    }
    const resolutionChanged =
      t.outcome !== r.outcome ||
      t.exitDatetime !== r.exitDatetime ||
      !nearly(t.exitPrice, r.exitPrice) ||
      !nearly(t.rMultiple, r.rMultiple);
    if (resolutionChanged) {
      resolutionOnlyDiffs += 1;
      assert(
        r.exitDatetime !== undefined && r.exitDatetime > lastEligible,
        `resolution difference on ${keyOf(t)} must trace to the excluded final bar`,
      );
    }
  }
  assertEqual(signalFieldDiffs, 0, "zero signal-field differences");
  // missing keys must all have SIGNALLED on the final bar
  const missing = refTrades.filter((t) => !uiByKey.has(keyOf(t)));
  assert(
    missing.every((t) => t.index === finalIndex),
    "missing keys confined to final-bar signals",
  );
  assertEqual(
    missing.length,
    0,
    "no final-bar trade signals on this baseline (tail 23:30 has none)",
  );
  console.log(
    `[parity] resolution-only differences: ${resolutionOnlyDiffs} (final-bar deferred — F2 live-candle policy)`,
  );
});

test("parity: state isolation — A→(compareHtf)→A and A→B→A identical", () => {
  const csv = loadBaselineCsv();
  const a1 = runAnalysis(csv, UI_OPTS);
  compareHtfDirectionFilter(csv); // the UI defers one further analysis after the main one
  // (it used to run two — see tests/analyzer-htf-inert.test.mjs)
  const a2 = runAnalysis(csv, UI_OPTS);
  const same = (x, y) =>
    x.length === y.length &&
    x.every(
      (t, i) =>
        keyOf(t) === keyOf(y[i]) &&
        nearly(t.entry, y[i].entry) &&
        nearly(t.rMultiple, y[i].rMultiple) &&
        t.outcome === y[i].outcome,
    );
  assert(a1.ok && a2.ok, "runs ok");
  assert(same(a1.analysis.tradePasses, a2.analysis.tradePasses), "compareHtf leaves no residue");
  const perturbed = csv.replace(/2025-11-03 10/g, "2025-11-03 11");
  const b1 = runAnalysis(perturbed, UI_OPTS);
  const a3 = runAnalysis(csv, UI_OPTS);
  assert(b1.ok && a3.ok, "runs ok");
  assert(same(a1.analysis.tradePasses, a3.analysis.tradePasses), "A→B→A identical");
  assert(
    a3.analysis.tradePasses.length === runs().ui.analysis.tradePasses.length,
    "fresh module run matches cached",
  );
});

test("parity: no lookahead under either config at two cutoffs", () => {
  const csv = loadBaselineCsv();
  const lines = csv.split("\n");
  const data = lines.filter((l) => /^\d{4}-\d{2}-\d{2} \d/.test(l));
  const meta = lines.filter((l) => !/^\d{4}-\d{2}-\d{2} \d/.test(l) && l.trim());
  for (const frac of [0.33, 0.66]) {
    const cutTime = data[Math.floor(data.length * frac)].split(",")[0];
    const prefix = [...meta, ...data.filter((l) => l.split(",")[0] <= cutTime)].join("\n");
    for (const opts of [REF_OPTS, UI_OPTS]) {
      const p = runAnalysis(prefix, opts);
      const f = runAnalysis(csv, opts);
      assert(p.ok && f.ok, "runs ok");
      const fMap = new Map(f.analysis.tradePasses.map((t) => [keyOf(t), t]));
      for (const t of p.analysis.tradePasses) {
        const g = fMap.get(keyOf(t));
        assert(g, `prefix trade present in full run ${keyOf(t)}`);
        for (const fld of ["entry", "sl", "tp", "rr", "side"]) {
          assert(nearly(t[fld], g[fld]), `signal field ${fld} stable at cut ${cutTime}`);
        }
      }
      // future price mutation must not retroactively change any historical signal
      const mut = lines
        .map((l) => {
          if (!/^\d{4}-\d{2}-\d{2} \d/.test(l) || l.split(",")[0] <= cutTime) return l;
          const c = l.split(",");
          c[4] = String(Number(c[4]) + 50);
          return c.join(",");
        })
        .join("\n");
      const m = runAnalysis(mut, opts);
      assert(m.ok, "mutated run ok");
      const mMap = new Map(m.analysis.tradePasses.map((t) => [keyOf(t), t]));
      for (const t of f.analysis.tradePasses.filter((t) => t.datetime <= cutTime)) {
        const mk = mMap.get(keyOf(t));
        assert(mk, `historical key survives future mutation ${keyOf(t)}`);
        for (const fld of ["entry", "sl", "tp", "rr", "side"]) {
          assert(nearly(mk[fld], t[fld]), `future mutation cannot change signal field ${fld}`);
        }
      }
    }
  }
});

test("parity: applyTriggers classifies every outcome class correctly (synthetic — NO_FILL is 0 in the golden baseline)", () => {
  // Round-3 mutation finding: the locked baseline contains zero NO_FILL
  // trades, so dataset-derived gates cannot see a NO_FILL misclassification.
  // This synthetic gate exercises every branch of the accounting funnel.
  const mk = (outcome, rMultiple) => ({
    strategyId: "macd-cross",
    strategy: "MACD Cross",
    datetime: "2025-01-02 03:00:00",
    side: "long",
    entry: 100,
    sl: 90,
    tp: 130,
    rr: 3,
    reason: "synthetic",
    setupStatus: "RESOLVED",
    statusNote: "",
    outcome,
    exitDatetime: "2025-01-02 09:00:00",
    exitPrice: 130,
    rMultiple,
    kind: "trade",
  });
  const state = { stats: {} };
  applyTriggers(state, [mk("TP", 3), mk("SL", -1), mk("OPEN", undefined), mk("NO_FILL", 0)]);
  const s = state.stats["macd-cross"];
  assertEqual(s.triggers, 4, "all triggers counted");
  assertEqual(s.tpHits, 1, "tp classified");
  assertEqual(s.slHits, 1, "sl classified");
  assertEqual(s.open, 1, "open classified");
  assertEqual(s.noFill, 1, "noFill classified");
  assertEqual(s.tpHits + s.slHits + s.open + s.noFill, s.triggers, "partition exact");
  // realised R uses rMultiple when present (not the planned RR)
  assertEqual(s.resolvedRrSum, 2, "3 + (-1)");
  assertEqual(s.resolvedCount, 2, "resolved only");
});
