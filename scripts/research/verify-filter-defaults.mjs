/**
 * Shipped-filter verification (v1.8 research tooling).
 *
 * Prints the locked baseline book under every filter configuration the product
 * can run, so the shipped default can be read off in one place:
 *
 *   C + F   production default since v1.8
 *   C only  v1.4 default  (enableFilterF: false)
 *   F only  (enableFilterC: false)
 *   none    the A2-only control (both flags false) — the book the batch research
 *           table `artifacts/strategy-research/all-trades.jsonl` describes
 *
 * It also repeats the three interesting configurations on the UI/live options
 * (`seriesEndsComplete: false`) to show the gain is a filter effect and not an
 * artifact of the closed-candles policy.
 *
 * Run from the repository root:
 *
 *   node --experimental-strip-types --import ./tests/register.mjs scripts/research/verify-filter-defaults.mjs
 */
import { readFileSync } from "node:fs";
import { runAnalysis } from "../../src/lib/analyzer/run.ts";
import { isTradeStrategy } from "../../src/lib/analyzer/strategy-kind.ts";

const csv = readFileSync(
  new URL("../../artifacts/baseline-xauusd-ohlc.csv", import.meta.url),
  "utf8",
);

/** Historical lock for the Filter-C-only book (v1.4 golden, still pinned by tests). */
/**
 * Historical lock for the Filter-C-only book. Re-pinned by v1.8.2: the gap-fill
 * correction changed how a tracked level is resolved when a bar opens beyond it,
 * which re-priced this book from 523.6813503963194 (v1.4) to 507.93925691611344
 * — the number `tests/filter-optout-legacy.test.mjs` pins. Pinning the live
 * value here is the point of the check: it is the cross-check that this script
 * and the certified suite are reading the same book.
 */
const C_ONLY_LOCK = { n: 2323, R: 507.93925691611344 };

const totals = (out) => {
  const analysis = out.analysis;
  const trades = analysis.results.filter(
    (r) => r.result === "PASS" && isTradeStrategy(r.strategyId),
  );
  const fails = analysis.results.filter((r) => r.result === "FAIL" && /^FILTER_/.test(r.reason));
  return {
    n: trades.length,
    R: trades.reduce((s, t) => s + (t.rMultiple ?? 0), 0),
    cFails: fails.filter((r) => /^FILTER_C/.test(r.reason)).length,
    fFails: fails.filter((r) => /^FILTER_F/.test(r.reason)).length,
  };
};

const run = (opts) => {
  const out = runAnalysis(csv, { seriesEndsComplete: true, ...opts });
  if (!out.ok) throw new Error(out.error);
  return out;
};

console.log("== closed candles (seriesEndsComplete: true) — the locked configuration ==");
const configs = [
  ["C + F (shipped default)", {}],
  ["C only (v1.4 default)", { enableFilterF: false }],
  ["F only", { enableFilterC: false }],
  ["no filters (A2 control)", { enableFilterC: false, enableFilterF: false }],
];
const rows = {};
for (const [label, opts] of configs) {
  const t = totals(run(opts));
  rows[label] = t;
  console.log(
    `  ${label.padEnd(24)} trades=${String(t.n).padStart(4)}  R=${t.R.toFixed(6)}  C-fails=${String(t.cFails).padStart(3)}  F-fails=${String(t.fFails).padStart(3)}`,
  );
}

const shipped = rows["C + F (shipped default)"];
const cOnly = rows["C only (v1.4 default)"];
const bare = rows["no filters (A2 control)"];
console.log(
  `  delta shipped - C only = +${(shipped.R - cOnly.R).toFixed(3)} R | shipped - no filters = +${(shipped.R - bare.R).toFixed(3)} R`,
);

if (cOnly.n !== C_ONLY_LOCK.n || Math.abs(cOnly.R - C_ONLY_LOCK.R) > 1e-9) {
  throw new Error(
    `opt-out lock drifted: got ${cOnly.n} / ${cOnly.R}, expected ${C_ONLY_LOCK.n} / ${C_ONLY_LOCK.R}`,
  );
}
console.log("  opt-out lock OK: enableFilterF:false reproduces the v1.4 book exactly");

const firstF = run({}).analysis.results.find(
  (r) => r.result === "FAIL" && /^FILTER_F/.test(r.reason),
);
if (firstF) {
  console.log(
    `  first Filter F rejection: ${firstF.strategyId} ${firstF.datetime} (index ${firstF.index}, trend ${firstF.trend}, side ${firstF.side})`,
  );
}

console.log("\n== UI / live options (seriesEndsComplete: false) ==");
for (const [label, opts] of [
  ["C + F", {}],
  ["C only", { enableFilterF: false }],
  ["no filters", { enableFilterC: false, enableFilterF: false }],
]) {
  const out = runAnalysis(csv, { seriesEndsComplete: false, ...opts });
  if (!out.ok) throw new Error(out.error);
  const t = totals(out);
  console.log(`  ${label.padEnd(12)} trades=${String(t.n).padStart(4)}  R=${t.R.toFixed(6)}`);
}
