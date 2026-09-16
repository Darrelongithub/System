/**
 * Series contract — the production gate that stops a series which cannot support
 * a live decision from being presented as one.
 *
 * Three ways a CSV can look fine and still be unusable:
 *   - too short a warm-up (the newest decision stops matching a full-history run);
 *   - swing references that do not resolve (trend silently degraded);
 *   - a collapsed trend distribution (every row "ranging" ⇒ no counter-trend
 *     decision can fire, so Filters C/F and the trend strategies go quiet).
 *
 * The locked baseline is the reference for healthy data, and it deliberately
 * carries a known 6.8 % of dangling refs (3,039 of 44,652 — refs into UTC weekend
 * days the export skips). The gate must accept that and reject the collapse.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { loadBaselineCsv } from "./fixtures.mjs";
import { runAnalysis } from "../src/lib/analyzer/run.ts";
import { ANALYZER_CERTIFIED_OPTIONS, MIN_PRODUCTION_BARS } from "../src/lib/analyzer/config.ts";
import {
  formatSeriesContract,
  inspectSeriesContract,
} from "../src/lib/analyzer/series-contract.ts";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import { buildIndex, computeMarketStructure } from "../src/lib/analyzer/structure.ts";

const run = (csv) => {
  const out = runAnalysis(csv, ANALYZER_CERTIFIED_OPTIONS);
  if (!out.ok) throw new Error(out.error);
  return out.analysis;
};

const lines = () => {
  const csv = loadBaselineCsv();
  const all = csv.split("\n");
  return { meta: all[0], header: all[1], data: all.slice(2).filter((l) => l.trim() !== "") };
};
const mk = (meta, header, rows) => [meta, header, ...rows].join("\n");

test("contract: the locked baseline passes, and its known dangling refs are tolerated with a warning", () => {
  const analysis = run(loadBaselineCsv());
  const report = analysis.contract;

  assertEqual(report.ok, true, `baseline must pass the contract (${formatSeriesContract(report)})`);
  assertEqual(report.bars, 9738, "bars");
  assertEqual(
    report.trendCounts.ranging + report.trendCounts.bullish + report.trendCounts.bearish,
    9738,
    "trend partition",
  );

  // The known, documented deviation: refs into skipped UTC weekend days.
  assert(
    report.danglingRefs > 0,
    "the baseline is expected to carry dangling refs (weekend-day export skips)",
  );
  assert(
    report.danglingRefShare < 0.15,
    `dangling share ${(report.danglingRefShare * 100).toFixed(1)}% must stay well under the warning line`,
  );
  assertEqual(report.failures.length, 0, "no failures");
  assertEqual(
    report.warnings.length,
    0,
    "and no warnings either — 6.8% is inside the healthy envelope",
  );

  assert(
    report.trendCapableShare > 0.9,
    `trend-capable share ${(report.trendCapableShare * 100).toFixed(1)}%`,
  );
  assert(
    report.nonRangingShare > 0.8,
    `non-ranging share ${(report.nonRangingShare * 100).toFixed(1)}%`,
  );
  assert(
    report.trendCounts.bullish > 0 && report.trendCounts.bearish > 0,
    "both directions present",
  );
});

test(`contract: a series shorter than ${MIN_PRODUCTION_BARS} bars is refused`, () => {
  const { meta, header, data } = lines();
  const analysis = run(mk(meta, header, data.slice(-400)));
  assertEqual(analysis.contract.ok, false, "short window must fail");
  assert(
    analysis.contract.failures.some((f) => f.startsWith("history depth")),
    `failures must name the depth problem: ${analysis.contract.failures.join("; ")}`,
  );
});

test("contract: a series just above the floor is accepted on depth alone", () => {
  const { meta, header, data } = lines();
  const analysis = run(mk(meta, header, data.slice(-(MIN_PRODUCTION_BARS + 1))));
  assert(
    !analysis.contract.failures.some((f) => f.startsWith("history depth")),
    "depth must not be reported as a failure at the floor",
  );
});

test("contract: re-timestamped data (refs point at rows that are not there) collapses the trend layer and is refused", () => {
  const { meta, header, data } = lines();
  // Shift every timestamp forward by a year but leave the refs untouched — the
  // shape of a spliced/re-dated file. Nothing else about the data changes.
  const shift = (line) => {
    const comma = line.indexOf(",");
    const datetime = line.slice(0, comma);
    const ms = Date.parse(`${datetime.replace(" ", "T")}+03:00`) + 365 * 24 * 3600 * 1000;
    const moved = new Date(ms + 3 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
    return moved + line.slice(comma);
  };
  const reTimed = mk(meta, header, data.map(shift));

  const analysis = run(reTimed);
  const report = analysis.contract;
  assertEqual(report.ok, false, "re-timestamped series must fail the contract");
  assert(
    report.failures.some((f) => f.startsWith("swing references do not resolve")),
    `failures must name the ref problem: ${report.failures.join("; ")}`,
  );
  assert(
    report.failures.some((f) => f.startsWith("trend structure has collapsed")),
    `failures must name the trend collapse: ${report.failures.join("; ")}`,
  );
  assertEqual(
    report.trendCounts.bullish + report.trendCounts.bearish,
    0,
    "no row can classify a trend",
  );
  assertEqual(report.nonRangingShare, 0, "everything fell back to ranging");

  // And the practical consequence the gate exists for: the counter-trend layer
  // is dead, so the shipped filters reject nothing.
  const fFails = analysis.results.filter((r) => r.reason?.startsWith("FILTER_F")).length;
  assertEqual(fFails, 0, "Filter F cannot fire on a series with no trend");
});

test("contract: the report is computed from the engine's own resolver, not from a second opinion", () => {
  const csv = loadBaselineCsv();
  const candles = parseCsv(csv).candles;
  const byDatetime = buildIndex(candles);
  computeMarketStructure(candles, byDatetime);
  const direct = inspectSeriesContract(candles);
  const viaRun = run(csv).contract;
  assertEqual(
    JSON.stringify(viaRun),
    JSON.stringify(direct),
    "runAnalysis attaches the same report",
  );
});
