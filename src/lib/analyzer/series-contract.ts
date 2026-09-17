/**
 * Series contract — is this CSV fit to make live decisions from?
 *
 * The live analyzer is the product: it takes whatever CSV the generator produced
 * and turns the newest bar into an actionable setup. Two properties of that CSV
 * decide whether the answer can be trusted at all, and neither is visible in the
 * trade book:
 *
 *   1. HISTORY DEPTH — the warm-up (EMA200, the 50-bar ATR percentile behind
 *      Filter C, daily aggregates, per-strategy dedupe state) must be saturated.
 *      Measured on the locked baseline: a 150–800 bar window changes the newest
 *      actionable bar's rows; 900+ bars matches full history
 *      (`tests/warmup-window-sufficiency.test.mjs`). Production therefore refuses
 *      to analyse a series below `MIN_PRODUCTION_BARS`.
 *
 *   2. TREND INPUT INTEGRITY — `candle.trend` is derived from the generator's
 *      `similar_swing_refs`, and both shipped filters plus every trend-aware
 *      strategy read it. A ref that does not resolve contributes nothing, and the
 *      affected rows silently lose trend information: a re-timestamped or spliced
 *      file loses all of it, every row becomes "ranging", and the counter-trend
 *      filters and strategies quietly stop firing. Nothing else notices.
 *
 *      Two classes are counted separately because they are diagnosed differently —
 *      a ref pointing *inside* the series range at a row the file does not contain
 *      is a hole (a dropped row), while a ref pointing *before* the first row is a
 *      truncated head (rows trimmed away, or timestamps moved) — but the gate
 *      judges the *total* unresolved share, because both leave the trend layer
 *      starved. Report, don't guess: the split is in the report for diagnosis.
 *
 * Thresholds are calibrated against the locked baseline, the reference for "what
 * healthy generated data looks like" (9,738 rows):
 *
 *   swing refs unresolved        3,039 / 44,652 =  6.8%   (all weekend-day skips)
 *   rows with a usable trend     9,030 / 9,738  = 92.7%
 *   rows that are not "ranging"  8,536 / 9,738  = 87.7%
 *
 * The gates sit far outside that envelope (50% / 50% / 25%): this is a collapse
 * detector, not a quality score. Its job is to stop a file whose trend layer is
 * dead from being analysed as if it were healthy.
 *
 * Pure: reads candles and the engine's own resolver, no I/O, no node:*. Must be
 * called on candles whose structure has been computed (`computeMarketStructure`),
 * i.e. in practice from inside a real `runAnalysis` — the report is attached to
 * its `Analysis` as `analysis.contract`.
 */
import type { Candle } from "./types";
import { MIN_PRODUCTION_BARS } from "./config";
import { buildIndex, resolveSwings } from "./structure";

/** Share of swing refs that may fail to resolve before the trend layer counts as dead. */
const MAX_UNRESOLVED_REF_SHARE = 0.5;
/** Share of rows that must be able to produce a non-"ranging" trend. */
const MIN_TREND_CAPABLE_SHARE = 0.5;
/** Share of rows that must classify as non-"ranging" for counter-trend logic to work. */
const MIN_NON_RANGING_SHARE = 0.25;
/** Warning (not failure) level for unresolved refs, above the 6.8% baseline. */
const WARN_UNRESOLVED_REF_SHARE = 0.15;

export interface SeriesContractReport {
  bars: number;
  /** Rows carrying at least one swing reference. */
  rowsWithRefs: number;
  swingRefs: number;
  resolvedRefs: number;
  /** Refs pointing at a row inside the series range that the file does not contain. */
  danglingRefs: number;
  /** Refs pointing before the first row (head truncation — expected). */
  outsideWindowRefs: number;
  danglingRefShare: number;
  /** Refs (inside + outside the range) that contribute no swing to their row. */
  unresolvedRefs: number;
  unresolvedRefShare: number;
  /** Rows whose resolved refs allow a trend at all (≥2 highs and ≥2 lows). */
  trendCapableRows: number;
  trendCapableShare: number;
  trendCounts: { bullish: number; bearish: number; ranging: number };
  nonRangingShare: number;
  ok: boolean;
  failures: string[];
  warnings: string[];
}

const share = (n: number, d: number) => (d > 0 ? n / d : 0);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function inspectSeriesContract(candles: Candle[]): SeriesContractReport {
  const byDatetime = buildIndex(candles);
  const first = candles.length > 0 ? candles[0].datetime : "";

  let rowsWithRefs = 0;
  let swingRefs = 0;
  let resolvedRefs = 0;
  let danglingRefs = 0;
  let outsideWindowRefs = 0;
  let trendCapableRows = 0;
  const trendCounts = { bullish: 0, bearish: 0, ranging: 0 };

  for (const candle of candles) {
    if (candle.invalid) continue;
    trendCounts[candle.trend] = (trendCounts[candle.trend] ?? 0) + 1;

    for (const ref of candle.similarSwingRefs) {
      swingRefs += 1;
      const key = ref.trim();
      if (byDatetime.has(key)) {
        resolvedRefs += 1;
      } else if (key < first) {
        outsideWindowRefs += 1;
      } else {
        danglingRefs += 1;
      }
    }
    if (candle.similarSwingRefs.length > 0) rowsWithRefs += 1;

    // Same resolver the engine uses: a trend needs two highs and two lows.
    const swings = resolveSwings(candle, byDatetime);
    if (swings.highs.length >= 2 && swings.lows.length >= 2) trendCapableRows += 1;
  }

  const bars = trendCounts.bullish + trendCounts.bearish + trendCounts.ranging;
  const unresolvedRefs = danglingRefs + outsideWindowRefs;
  const danglingRefShare = share(danglingRefs, swingRefs);
  const unresolvedRefShare = share(unresolvedRefs, swingRefs);
  const trendCapableShare = share(trendCapableRows, bars);
  const nonRangingShare = share(trendCounts.bullish + trendCounts.bearish, bars);

  const failures: string[] = [];
  const warnings: string[] = [];

  if (bars < MIN_PRODUCTION_BARS) {
    failures.push(
      `history depth ${bars} bar(s) is below the production floor of ${MIN_PRODUCTION_BARS}: ` +
        `below it the newest decisions differ from a full-history run`,
    );
  }
  if (unresolvedRefShare > MAX_UNRESOLVED_REF_SHARE) {
    failures.push(
      `swing references do not resolve: ${unresolvedRefs}/${swingRefs} (${pct(unresolvedRefShare)}) contribute no ` +
        `swing (${danglingRefs} point inside the series at rows the file does not contain, ${outsideWindowRefs} ` +
        `point before its first row; limit ${pct(MAX_UNRESOLVED_REF_SHARE)}). Trend would be degraded or dead, ` +
        `silently disabling the counter-trend filters.`,
    );
  }
  if (trendCapableShare < MIN_TREND_CAPABLE_SHARE) {
    failures.push(
      `trend structure has collapsed: only ${pct(trendCapableShare)} of rows have a usable swing pair ` +
        `(required ${pct(MIN_TREND_CAPABLE_SHARE)}; healthy generated data: 92.7%)`,
    );
  }
  if (nonRangingShare < MIN_NON_RANGING_SHARE) {
    failures.push(
      `trend distribution has collapsed: only ${pct(nonRangingShare)} of rows classify as bullish/bearish ` +
        `(required ${pct(MIN_NON_RANGING_SHARE)}; healthy generated data: 87.7%) — ` +
        `counter-trend logic cannot fire on a series that is entirely "ranging"`,
    );
  }
  if (failures.length === 0 && unresolvedRefShare > WARN_UNRESOLVED_REF_SHARE) {
    warnings.push(
      `swing references: ${unresolvedRefs}/${swingRefs} (${pct(unresolvedRefShare)}) contribute no swing ` +
        `(healthy generated data: 6.8%). Analysis proceeds; trend quality is reduced.`,
    );
  }

  return {
    bars,
    rowsWithRefs,
    swingRefs,
    resolvedRefs,
    danglingRefs,
    outsideWindowRefs,
    danglingRefShare,
    unresolvedRefs,
    unresolvedRefShare,
    trendCapableRows,
    trendCapableShare,
    trendCounts,
    nonRangingShare,
    ok: failures.length === 0,
    failures,
    warnings,
  };
}

/** One-line summary for logs, exports and the golden provenance record. */
export function formatSeriesContract(report: SeriesContractReport): string {
  return (
    `bars ${report.bars} | swing refs ${report.resolvedRefs}/${report.swingRefs} resolved ` +
    `(${pct(report.unresolvedRefShare)} unresolved) | trend-capable ${pct(report.trendCapableShare)} | ` +
    `non-ranging ${pct(report.nonRangingShare)} | ${report.ok ? "CONTRACT OK" : "CONTRACT FAILED"}`
  );
}
