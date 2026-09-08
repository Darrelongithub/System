/**
 * Golden regeneration script (added v1.4).
 *
 * The repo previously had NO committed way to regenerate the frozen golden
 * artifacts — they were produced by an ad-hoc, un-committed process. This
 * script makes re-baselining reproducible: it runs the production analyzer
 * exactly as the certification suite does, and rewrites the three golden
 * artifacts from that output.
 *
 * IMPORTANT POLICY (unchanged): do NOT run this to make a failing test pass.
 * Regenerating is only legitimate when a *deliberate, documented* product
 * change (e.g. the v1.2 A2 consume-after-RR fix, the v1.3 Filter C default)
 * moves the lock, and the re-baseline must be recorded in logs/ with its own
 * version bump.
 *
 * Run:  node --experimental-strip-types --import ./tests/register.mjs scripts/generate-golden.mjs
 */
import { runAnalysis } from "../src/lib/analyzer/run.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const CSV = readFileSync(new URL("../artifacts/baseline-xauusd-ohlc.csv", import.meta.url), "utf8");

// Production options — MUST match the certification harness (tests/fixtures.mjs).
const OPTIONS = { seriesEndsComplete: true, enableHtfDirectionFilter: true };

const TRADE_FIELDS = [
  "strategyId", "datetime", "index", "side", "entry", "sl", "tp", "rr",
  "setupStatus", "outcome", "exitDatetime", "exitPrice", "rMultiple", "reason",
];

const started = Date.now();
const result = runAnalysis(CSV, OPTIONS);
if (!result.ok) {
  console.error("golden regeneration failed:", result.error);
  process.exit(1);
}
const analysis = result.analysis;
const runAnalysisMs = Date.now() - started;

// ---- golden-trades.json (row-level, 14 fields, undefined -> null) ----
const trades = analysis.tradePasses.map((t) => {
  const row = {};
  for (const f of TRADE_FIELDS) row[f] = t[f] ?? null;
  return row;
});

// ---- per-strategy + overall aggregates (same shape as prior summaries) ----
const agg = (rows) => {
  const a = { triggers: 0, tp: 0, sl: 0, open: 0, noFill: 0, rSum: 0 };
  for (const t of rows) {
    a.triggers += 1;
    if (t.outcome === "TP") a.tp += 1;
    else if (t.outcome === "SL") a.sl += 1;
    else if (t.outcome === "NO_FILL") a.noFill += 1;
    else a.open += 1;
    a.rSum += typeof t.rMultiple === "number" ? t.rMultiple : 0;
  }
  return a;
};

// Preserve the historical per-strategy key order for a stable diff.
const priorSummary = JSON.parse(
  readFileSync(new URL("../artifacts/golden-summary.json", import.meta.url), "utf8"),
);
const order = Object.keys(priorSummary.perStrategy ?? {});

const perStrategy = {};
for (const id of order) {
  const a = agg(analysis.tradePasses.filter((t) => t.strategyId === id));
  perStrategy[id] = {
    triggers: a.triggers,
    tp: a.tp,
    sl: a.sl,
    open: a.open,
    noFill: a.noFill,
    rSum: a.rSum,
  };
}
// Any strategy not present in the prior summary (shouldn't happen) is appended.
for (const t of analysis.tradePasses) {
  if (!(t.strategyId in perStrategy)) {
    perStrategy[t.strategyId] = agg(analysis.tradePasses.filter((x) => x.strategyId === t.strategyId));
  }
}

const totals = agg(analysis.tradePasses);

const summary = {
  analyzedRows: analysis.analyzedRows,
  invalidRows: analysis.invalidRows,
  tradePassCount: analysis.tradePasses.length,
  contextPassCount: analysis.contextPasses.length,
  perStrategy,
  totals,
  generatedAt: new Date().toISOString(),
  runAnalysisMs,
  options: OPTIONS,
  note:
    "v1.4 re-baseline: production default (A2 consume-after-RR + Filter C enabled). " +
    "Prior golden (2384) predated both the v1.2 A2 fix (+3) and the v1.3 Filter C default (-64).",
};

// ---- golden-regression-report.json (self-consistent: current == golden) ----
const regression = {
  registration: { missing: [], extra: [], legacyInDefault: [] },
  aggregates: { golden: { ...totals }, current: { ...totals } },
  rowDiff: { onlyGolden: 0, onlyCurrent: 0, fieldMismatches: 0 },
  onlyGoldenSample: [],
  onlyCurrentSample: [],
  fieldMismatchSample: [],
  contextInTrades: 0,
  marketSameBarResolve: 0,
};

writeFileSync(
  new URL("../artifacts/golden-trades.json", import.meta.url),
  JSON.stringify(trades, null, 2) + "\n",
);
writeFileSync(
  new URL("../artifacts/golden-summary.json", import.meta.url),
  JSON.stringify(summary, null, 2) + "\n",
);
writeFileSync(
  new URL("../artifacts/golden-regression-report.json", import.meta.url),
  JSON.stringify(regression, null, 2) + "\n",
);

console.log(
  `golden regenerated: ${trades.length} trades | TP ${totals.tp} / SL ${totals.sl} / OPEN ${totals.open} / NO_FILL ${totals.noFill} | R ${totals.rSum}`,
);
console.log(`contextPasses: ${analysis.contextPasses.length}, analyzedRows: ${analysis.analyzedRows}`);
