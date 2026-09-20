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
import { ANALYZER_CERTIFIED_OPTIONS } from "../src/lib/analyzer/config.ts";
import { formatSeriesContract } from "../src/lib/analyzer/series-contract.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const CSV = readFileSync(new URL("../artifacts/baseline-xauusd-ohlc.csv", import.meta.url), "utf8");

// Production options — MUST match the certification harness (tests/fixtures.mjs).
const OPTIONS = ANALYZER_CERTIFIED_OPTIONS;

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

// Provenance for the lock: which data and which rule sources produced it. A
// re-baseline is only legitimate as a documented product decision, and this is
// what makes "which code state does this lock describe?" answerable later.
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const RULE_SOURCES = [
  "src/lib/analyzer/regime-filters.ts",
  "src/lib/analyzer/run.ts",
  "src/lib/analyzer/strategies/final-survivors.ts",
  // Added v1.8.2: status.ts decides how (and at what price) a setup resolves,
  // so it shapes the locked rows exactly like the entry rules do.
  "src/lib/analyzer/status.ts",
];
const inputHashes = {
  baselineCsv: sha256(CSV),
  rules: Object.fromEntries(
    RULE_SOURCES.map((p) => [p, sha256(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"))]),
  ),
};

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
    perStrategy[t.strategyId] = agg(
      analysis.tradePasses.filter((x) => x.strategyId === t.strategyId),
    );
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
  inputs: inputHashes,
  // The locked fixture must satisfy the production series contract, otherwise the
  // regression lock would be replaying a series the live product refuses.
  seriesContract: analysis.contract,
  note:
    "v1.8.2 re-baseline: gap-fill exit correction (see logs/v1.8.2-gap-fill-resolution.md). " +
    "A bar that opens beyond a tracked stop/target and never trades it now resolves at that " +
    "bar's open instead of leaving the position alive to a later touch; 52 of 2286 rows were " +
    "priced that way (one booked as a +2.41R winner was a ~-2.0R loss). Trade count, entries, " +
    "stops and targets are unchanged. Previous lock v1.8: 2286 / R 541.3570458970024 " +
    "(Filter C + Filter F, 751 TP / 1531 SL).",
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
console.log(
  `contextPasses: ${analysis.contextPasses.length}, analyzedRows: ${analysis.analyzedRows}`,
);
console.log(`series contract: ${formatSeriesContract(analysis.contract)}`);
