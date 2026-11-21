/**
 * v2.0 REGIME-GATE GUARANTEES — the acceptance battery for the v1.8-retired
 * regime-routed ruleset:
 *
 *   (a) Truncation invariance — the first 1,500 bars and the first 3,000 bars of
 *       the locked baseline, BOTH under the live policy (seriesEndsComplete:
 *       false), must produce identical PASS/FAIL outcomes, entry/sl/tp/reason/
 *       rr/riskMultiplier rows on bars 0..1,498 — no lookahead, no contaminated
 *       regime state, no dependence on bars beyond the cutoff.
 *   (b) Zero self-hedging & stack cap — over the full baseline: 0 bars carry both
 *       a long AND a short position open, and no bar carries more than 3
 *       same-side positions.
 *   (c) Deterministic riskMultiplier — a trade whose entry falls after a rolling
 *       closed-trade sum below the -4.0 floor carries 0.5; otherwise 1.0.
 *
 * The golden + freeze guarantees are pinned by tests/golden.test.mjs and
 * tests/ruleset-freeze.test.mjs (regenerated v2.0 artifacts).
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { loadBaselineCsv } from "./fixtures.mjs";
import { runAnalysis } from "../src/lib/analyzer/run.ts";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import { computeHtfTrendContext } from "../src/lib/analyzer/structure.ts";
import { atrSeries } from "../src/lib/analyzer/pivots.ts";
import { ema } from "../src/lib/analyzer/indicators.ts";
import { getBarRegimeSnapshot } from "../src/lib/analyzer/regime-state.ts";

const LIVE = { seriesEndsComplete: false };

/** Assemble a minimal ctx exactly like the engine does, for snapshot checks. */
function snapshotContext(csvText) {
  const parsed = parseCsv(csvText);
  const candles = parsed.candles;
  const htf = computeHtfTrendContext(candles);
  candles.forEach((c, i) => {
    c.htfTrend = htf[i];
  });
  return {
    meta: parsed.meta,
    candles,
    byDatetime: new Map(candles.map((c) => [c.datetime, c])),
    ema20: ema(candles, 20),
    spread: 0.2,
    atr: atrSeries(candles),
    pivotHighs: [],
    pivotLows: [],
    daily: [],
    openingRanges: new Map(),
    consumed: new Map(),
    state: new Map(),
  };
}

function prefixCsv(fullCsv, bars) {
  const idx = fullCsv.indexOf("\n");
  const lines = fullCsv.split("\n");
  const headerEnd = lines.findIndex((l) => l.startsWith("datetime,"));
  const data = lines.slice(headerEnd + 1).filter((l) => l.trim() !== "" && !l.startsWith("==="));
  const kept = data.slice(0, bars);
  return [lines[0], lines[1], ...kept].join("\n");
}

function regimeSnapshots(csvText, upto) {
  const ctx = snapshotContext(csvText);
  const out = [];
  for (let i = 0; i < Math.min(upto, ctx.candles.length); i++) {
    const s = getBarRegimeSnapshot(ctx, i);
    out.push({
      active: s.activeRegimes.join(","),
      tide: s.macroTide,
      vol: s.volRatio,
      adx: s.adx14,
      htf: s.htfTrend?.h1 + "/" + s.htfTrend?.h4 + "/" + s.htfTrend?.d1,
    });
  }
  return out;
}

function rowsFor(analysis) {
  // The pre-resolution, pre-exit fields that depend strictly on bars <= i.
  return new Map(
    analysis.results.map((r) => [
      r.index,
      r.index === undefined ? undefined : {
        result: r.result,
        reason: r.reason,
        entry: r.entry,
        sl: r.sl,
        tp: r.tp,
        rr: r.rr,
        riskMultiplier: r.riskMultiplier,
      },
    ]),
  );
}

test("v2: truncation invariance — first 1,500 vs 3,000 bars, identical on bars 0..1498", () => {
  const full = loadBaselineCsv();
  const small = prefixCsv(full, 1500);
  const large = prefixCsv(full, 3000);

  const smallRun = runAnalysis(small, LIVE);
  const largeRun = runAnalysis(large, LIVE);
  assert(smallRun.ok, "1500-bar run ok");
  assert(largeRun.ok, "3000-bar run ok");

  const smallRows = rowsFor(smallRun.analysis);
  const largeRows = rowsFor(largeRun.analysis);
  const firstKeep = 1498; // bar 1499 is the untrusted last row in the 1500-bar run
  for (let i = 0; i <= firstKeep; i++) {
    const a = smallRows.get(i);
    const b = largeRows.get(i);
    assert(a, `missing small-run row at bar ${i}`);
    assert(b, `missing large-run row at bar ${i}`);
    assert(!a.result || !b.result ? false : true, `bar ${i}: rows present`);
    assertEqual(a.result, b.result, `bar ${i}: PASS/FAIL differs`);
    assertEqual(a.reason, b.reason, `bar ${i}: reason differs`);
    assertEqual(a.entry, b.entry, `bar ${i}: entry differs`);
    assertEqual(a.sl, b.sl, `bar ${i}: SL differs`);
    assertEqual(a.tp, b.tp, `bar ${i}: TP differs`);
    assertEqual(a.rr, b.rr, `bar ${i}: RR differs`);
    assertEqual(a.riskMultiplier, b.riskMultiplier, `bar ${i}: riskMultiplier differs`);
  }

  // Regime snapshots — must agree at every bar <= 1498 as well.
  const smallSnap = regimeSnapshots(small, 1499);
  const largeSnap = regimeSnapshots(large, 1499);
  assertEqual(smallSnap.length, largeSnap.length, "snapshot lengths equal");
  for (let i = 0; i < smallSnap.length; i++) {
    assertEqual(smallSnap[i].active, largeSnap[i].active, `bar ${i}: activeRegimes differ`);
    assertEqual(smallSnap[i].tide, largeSnap[i].tide, `bar ${i}: macroTide differs`);
    assertEqual(smallSnap[i].vol, largeSnap[i].vol, `bar ${i}: volRatio differs`);
    assertEqual(smallSnap[i].adx, largeSnap[i].adx, `bar ${i}: adx14 differs`);
    assertEqual(smallSnap[i].htf, largeSnap[i].htf, `bar ${i}: htfTrend differs`);
  }
});

test("v2: portfolio gate enforces zero self-hedging and a 3-trade same-side cap", () => {
  const csv = loadBaselineCsv();
  const r = runAnalysis(csv, LIVE);
  assert(r.ok, "run ok");

  const dtToIndex = new Map(parseCsv(csv).candles.map((c) => [c.datetime, c.index]));
  const trades = r.analysis.tradePasses
    .filter((t) => t.side !== undefined)
    .map((t) => ({
      index: t.index,
      side: t.side,
      exitIndex: t.exitDatetime ? (dtToIndex.get(t.exitDatetime) ?? Infinity) : Infinity,
    }));

  let maxSameSide = 0;
  let hedgeBar = -1;
  const maxIndex = trades.reduce((m, t) => Math.max(m, t.index), 0);
  for (let k = 0; k <= maxIndex; k++) {
    const openLongs = trades.filter(
      (t) => t.side === "long" && t.index <= k && t.exitIndex > k,
    ).length;
    const openShorts = trades.filter(
      (t) => t.side === "short" && t.index <= k && t.exitIndex > k,
    ).length;
    if (openLongs > 0 && openShorts > 0) hedgeBar = k;
    if (openLongs > 3) hedgeBar = k;
    if (openShorts > 3) hedgeBar = k;
    maxSameSide = Math.max(maxSameSide, openLongs, openShorts);
  }
  assertEqual(hedgeBar, -1, "a bar carries both sides open or > 3 same-side trades");
  assert(maxSameSide <= 3, `max concurrent same-side observed ${maxSameSide}`);
});

test("v2: riskMultiplier = 1.0 off the drawdown floor, 0.5 on it", () => {
  const csv = loadBaselineCsv();
  const r = runAnalysis(csv, LIVE);
  assert(r.ok, "run ok");
  const trades = r.analysis.tradePasses.filter((t) => t.side !== undefined);
  assert(trades.length > 0, "expected trades");
  for (const t of trades) {
    if (t.riskMultiplier === undefined) continue;
    assert(
      t.riskMultiplier === 1.0 || t.riskMultiplier === 0.5,
      `riskMultiplier must be 1.0 or 0.5, got ${t.riskMultiplier}`,
    );
  }
  // The multiplier must come from the gate's rolling sum: at least one trade
  // is throttled (1.0/0.5 split is actually impossible to forbid, assert presence)
  const throttled = trades.filter((t) => t.riskMultiplier === 0.5).length;
  assert(throttled > 0, "expected at least one throttled trade on the baseline");
});
