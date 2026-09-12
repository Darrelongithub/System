import { dailyAggregates, openingRanges } from "./daily";
import { ema } from "./indicators";
import { applySpreadAndRR, RR_FAIL_REASON, RR_THRESHOLD } from "./math";
import { parseCsv, parseSpread } from "./parse";
import { atrSeries, findPivots } from "./pivots";
import { evaluateSetupStatus, isLive } from "./status";
import { ALL_STRATEGIES, STRATEGIES } from "./strategies";
import { consume } from "./strategies/util";
import { turtleEvents } from "./strategies/turtle";
import {
  buildIndex,
  computeHtfTrendContext,
  computeMarketStructure,
  htfAllowsDirection,
} from "./structure";
import { rejectFilterC, FILTER_C_REASON } from "./regime-filters";
import {
  formatContextChannel,
  isContextStrategy,
  isTradeStrategy,
  type ContextEvent,
} from "./strategy-kind";
import type { Analysis, AnalysisContext, OverlapEntry, ResultRow } from "./types";

export interface RunFailure {
  ok: false;
  error: string;
}

export interface RunSuccess {
  ok: true;
  analysis: Analysis;
}

export type RunOutcome = RunSuccess | RunFailure;

export interface RunOptions {
  /**
   * Accepted for call-site compatibility (UI, tests, golden generator).
   * CURRENTLY INERT for trade generation: runAnalysis does not reject PASS rows
   * via htfAllowsDirection and the flag is not stored on AnalysisContext.
   * Activating it would change strategy definition (A1) and requires an
   * explicit experiment + new golden — do not treat as live filter.
   */
  enableHtfDirectionFilter?: boolean;
  /**
   * Restrict evaluation to this subset of strategy ids (e.g. ["turtle"] when
   * running Turtle on its own wider-lookback window). Resolved against the full
   * implementation registry (including legacy Turtle/ORB). When omitted, the
   * default production set is used: the 9 FINAL_STRATEGY_IDS plus context tools —
   * Turtle and Opening-Range-Breakout are not included.
   */
  strategyIds?: string[];
  /**
   * When false (default live safety), last candle may be incomplete and is
   * excluded from signal generation. Historical complete series: true.
   */
  seriesEndsComplete?: boolean;
  /**
   * Global Filter C: reject PASS candidates that are counter-trend under
   * extreme ATR percentile (≥95%, full 50-bar prior window). Default true
   * (v1.3 product decision). Pass enableFilterC: false to disable for experiments.
   */
  enableFilterC?: boolean;
}

/** Steps 1-5: validation gate, structure, strategies, math, aggregation. */
export function runAnalysis(text: string, options: RunOptions = {}): RunOutcome {
  const parsed = parseCsv(text);
  if (!parsed.meta) {
    return { ok: false, error: parsed.metadataError ?? "INVALID FILE: metadata header missing" };
  }

  const candles = parsed.candles;
  if (candles.length === 0) {
    return { ok: false, error: "INVALID FILE: no data rows found after the header" };
  }

  // Chronological integrity: valid rows must be non-decreasing by datetime.
  // Invalid rows do not become chronological barriers; compare each valid row
  // against the previous valid row so unsorted data cannot hide behind corruption.
  let previousValid: (typeof candles)[number] | undefined;
  for (const cur of candles) {
    if (cur.invalid) continue;
    if (previousValid && cur.datetime < previousValid.datetime) {
      return {
        ok: false,
        error: `INVALID FILE: timestamps out of order at index ${cur.index} (${cur.datetime} before ${previousValid.datetime})`,
      };
    }
    previousValid = cur;
  }

  const spread = parseSpread(parsed.meta.spread_convention);
  if (!Number.isFinite(spread)) {
    return { ok: false, error: "INVALID FILE: spread_convention is missing or malformed" };
  }

  const byDatetime = buildIndex(candles);
  computeMarketStructure(candles, byDatetime);
  const htfTrends = computeHtfTrendContext(candles);
  candles.forEach((candle, i) => {
    candle.htfTrend = htfTrends[i]!;
  });

  const atr = atrSeries(candles);
  const pivots = findPivots(candles);

  const ctx: AnalysisContext = {
    meta: parsed.meta,
    candles,
    byDatetime,
    ema20: ema(candles, 20),
    spread,
    atr,
    pivotHighs: pivots.highs,
    pivotLows: pivots.lows,
    daily: dailyAggregates(candles),
    openingRanges: openingRanges(candles),
    consumed: new Map(),
    state: new Map(),
  };

  // Default path = production set (STRATEGIES = final 9 + context).
  // Explicit strategyIds may resolve legacy implementations (Turtle/ORB) via ALL_STRATEGIES.
  const activeStrategies = options.strategyIds
    ? ALL_STRATEGIES.filter((strategy) => options.strategyIds!.includes(strategy.id))
    : STRATEGIES;

  const results: ResultRow[] = [];
  const buildTriggerDetail = (row: ResultRow, candle: (typeof candles)[number]): string[] => {
    if (row.result !== "PASS") return [];
    const barAtr = atr[candle.index];
    const lines: string[] = [
      `Entry requirements satisfied: ${row.reason}`,
      `ATR(14) at entry: ${barAtr === undefined ? "unavailable" : barAtr.toFixed(5)}`,
    ];
    if (barAtr && row.entry !== undefined && row.sl !== undefined && row.tp !== undefined) {
      const slDist = Math.abs(row.entry - row.sl);
      const tpDist = Math.abs(row.tp - row.entry);
      lines.push(
        `SL distance: ${slDist.toFixed(5)} (${(slDist / barAtr).toFixed(3)}×ATR), level ${row.sl.toFixed(5)}`,
      );
      lines.push(
        `TP distance: ${tpDist.toFixed(5)} (${(tpDist / barAtr).toFixed(3)}×ATR), level ${row.tp.toFixed(5)}`,
      );
    }
    lines.push(
      `TP placement rule/evidence: strategy-produced target ${row.tp === undefined ? "not canonical / not applicable" : row.tp.toFixed(5)}; see satisfied requirement evidence above.`,
    );
    lines.push(
      `SL placement rule/evidence: strategy-produced stop ${row.sl === undefined ? "unavailable" : row.sl.toFixed(5)}; see satisfied requirement evidence above.`,
    );
    return lines;
  };
  const invalidRowList: { datetime: string; reason: string }[] = [];

  const seriesEndsComplete = options.seriesEndsComplete ?? false;
  const signalLimit = seriesEndsComplete ? candles.length : Math.max(0, candles.length - 1);
  // When the series end is flagged incomplete, the final bar is untrusted: it
  // is excluded from signal generation, and it must not resolve trades either.
  // "Now" for status evaluation is the last signal-eligible bar. A single
  // shared prefix slice keeps index-based caches (WeakMap) stable per run.
  const resolutionCandles = seriesEndsComplete ? candles : candles.slice(0, signalLimit);

  for (const candle of candles) {
    if (candle.invalid) {
      invalidRowList.push({ datetime: candle.datetime, reason: candle.invalid });
      continue;
    }
    if (candle.index >= signalLimit) continue;
    for (const strategy of activeStrategies) {
      const outcome = strategy.run(ctx, candle.index);
      const row: ResultRow = {
        strategyId: strategy.id,
        strategy: strategy.name,
        index: candle.index,
        datetime: candle.datetime,
        result: outcome.result,
        reason: outcome.reason,
        trend: candle.trend,
        htfTrend: candle.htfTrend,
        side: outcome.side,
        turtleSystem: outcome.turtleSystem,
        orderType: outcome.orderType,
      };

      if (outcome.result === "PASS") {
        // Step 4: spread + RR are applied only to PASS results.
        const hasCompleteTradeMath =
          outcome.entry !== undefined && outcome.sl !== undefined && outcome.tp !== undefined;
        // Source-aligned diagnostics/signals without canonical TP (or a complete canonical trade model) remain PASS.
        // RR/backtest math is simply not applicable to those rows.
        if (!hasCompleteTradeMath) {
          row.entry = outcome.entry;
          row.sl = outcome.sl;
          row.tp = outcome.tp;
          row.rr = undefined;
          row.reason = `${row.reason} RR/backtest math: not applicable because the source does not supply a complete canonical entry/SL/TP model.`;
        } else {
          const math = applySpreadAndRR(outcome, ctx.spread);
          if (!math) {
            row.result = "FAIL";
            row.reason = "invalid canonical entry/SL/TP price set";
          } else {
            row.entry = math.entry;
            row.sl = math.sl;
            row.tp = math.tp;
            // No absolute "TP distance > 10×ATR" gate.
            // Production nine size TP as a fixed RR multiple of |entry−SL|. Absolute
            // ATR distance is the wrong unit for that model: structure-based stops
            // (pattern extreme, kijun, Donchian channel) legitimately produce large
            // risk in price terms while planned RR stays in [2.5, 4]. Minimum RR is
            // enforced below; SL-side / non-positive risk is enforced in applySpreadAndRR.
            if (math.invalidReason || math.rr === undefined) {
              // No RR at all when risk is non-positive; never report a faked positive.
              row.rr = undefined;
              row.result = "FAIL";
              row.reason = math.invalidReason ?? "INVALID: RR not computable";
            } else {
              row.rr = math.rr;
              if (math.rr <= RR_THRESHOLD) {
                row.result = "FAIL";
                row.reason = RR_FAIL_REASON;
              } else if (
                (options.enableFilterC ?? true) &&
                outcome.side &&
                rejectFilterC(ctx, candle.index, candle.trend, outcome.side)
              ) {
                // Global regime reject (Filter C). Do not consume — slot stays free.
                row.result = "FAIL";
                row.reason = FILTER_C_REASON;
              } else if (outcome.consumeKey) {
                // A2 fix: commit de-dupe slot only after spread/RR validation succeeds.
                consume(ctx, strategy.id, outcome.consumeKey);
              }
            }
          }
        }
      }

      if (row.result === "PASS") {
        row.detail = buildTriggerDetail(row, candle);
        const status = evaluateSetupStatus(row, resolutionCandles);
        row.setupStatus = status.setupStatus;
        row.statusNote = status.statusNote;
        row.candlesSinceTrigger = status.candlesSinceTrigger;
        if (
          status.resolutionCandle &&
          status.resolutionPrice !== undefined &&
          status.resolutionLevel
        ) {
          row.detail.push(
            `Resolution: ${status.resolutionLevel} hit at ${status.resolutionCandle.datetime}; trigger price ${status.resolutionPrice.toFixed(5)}; candle O/H/L/C ${status.resolutionCandle.open}/${status.resolutionCandle.high}/${status.resolutionCandle.low}/${status.resolutionCandle.close}.`,
          );
          row.exitDatetime = status.resolutionCandle.datetime;
          row.exitPrice = status.resolutionPrice;
        }
        attachOutcome(row, status.resolutionLevel);
      }
      results.push(row);
    }
  }

  // Stateful systems (Turtle) resolve their trade path after the complete candle sequence
  // is available. This preserves the exact event row while attaching the canonical outcome.
  const turtleActive = activeStrategies.some((strategy) => strategy.id === "turtle");
  const turtleEventMap = turtleActive ? turtleEvents(ctx) : new Map();
  for (const row of results) {
    if (row.strategyId !== "turtle") continue;
    const eventKey =
      row.turtleSystem && row.side ? `${row.index}:${row.turtleSystem}:${row.side}` : undefined;
    const event = eventKey ? turtleEventMap.get(eventKey) : undefined;
    if (!event) continue;
    row.setupStatus = event.outcome === "OPEN" ? "FILLED" : "RESOLVED";
    const exitCandle =
      event.resolutionIndex === undefined ? undefined : candles[event.resolutionIndex];
    row.exitDatetime = exitCandle?.datetime;
    row.exitPrice =
      event.resolutionPrice ?? (event.outcome === "OPEN" ? undefined : event.finalStop);
    if (event.outcome === "LOSS") {
      row.statusNote = `SL hit at ${event.resolutionIndex === undefined ? "end of data" : (candles[event.resolutionIndex]?.datetime ?? "end of data")} at ${event.resolutionPrice?.toFixed(5) ?? event.finalStop.toFixed(5)}; final unified stop ${event.finalStop.toFixed(5)} after ${event.unitsAtExit} unit(s).`;
    } else if (event.outcome === "WIN") {
      row.statusNote = `Turtle exit: ${event.exitReason ?? "trailing channel exit"} at ${event.resolutionIndex === undefined ? "end of data" : (candles[event.resolutionIndex]?.datetime ?? "end of data")}; unified stop path ended at ${event.finalStop.toFixed(5)} after ${event.unitsAtExit} unit(s).`;
    } else {
      row.statusNote = `Turtle trade still open at last candle; current unified 2N stop ${event.finalStop.toFixed(5)} after ${event.unitsAtExit} unit(s).`;
    }
    const turtleLevel =
      event.outcome === "OPEN" ? undefined : event.outcome === "WIN" ? "TP" : "SL";
    attachOutcome(row, turtleLevel);
  }

  const perStrategy = activeStrategies.map((strategy) => {
    const rows = results.filter((r) => r.strategyId === strategy.id);
    const reasons = new Map<string, number>();
    for (const row of rows) {
      if (row.result === "FAIL") reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + 1);
    }
    return {
      strategyId: strategy.id,
      strategy: strategy.name,
      passCount: rows.filter((r) => r.result === "PASS").length,
      failCount: rows.filter((r) => r.result === "FAIL").length,
      failReasons: [...reasons.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    };
  });

  const passing = results
    .filter((r) => r.result === "PASS")
    .sort((a, b) => (b.rr ?? 0) - (a.rr ?? 0));

  const tradePasses = passing.filter((r) => isTradeStrategy(r.strategyId));
  const contextPasses = passing.filter((r) => isContextStrategy(r.strategyId));
  const contextEvents: ContextEvent[] = contextPasses.map((r) => ({
    strategyId: r.strategyId,
    strategy: r.strategy,
    datetime: r.datetime,
    side: r.side,
    message: r.reason,
  }));
  const contextLog = formatContextChannel(contextEvents);

  const statusRank: Record<string, number> = { PENDING: 0, FILLED: 1 };
  const live = tradePasses
    .filter((r) => isLive(r.setupStatus))
    .sort(
      (a, b) =>
        (statusRank[a.setupStatus ?? ""] ?? 9) - (statusRank[b.setupStatus ?? ""] ?? 9) ||
        (b.rr ?? 0) - (a.rr ?? 0),
    );
  const historical = tradePasses.filter((r) => !isLive(r.setupStatus));

  const overlapMap = new Map<string, string[]>();
  for (const row of live) {
    const list = overlapMap.get(row.datetime) ?? [];
    list.push(row.strategy);
    overlapMap.set(row.datetime, list);
  }
  const overlaps: OverlapEntry[] = [...overlapMap.entries()]
    .filter(([, strategies]) => strategies.length > 1)
    .map(([datetime, strategies]) => ({ datetime, strategies: [...strategies].sort() }))
    .sort((a, b) => a.datetime.localeCompare(b.datetime));

  const lastSignalCandle =
    signalLimit > 0 ? candles[Math.min(signalLimit, candles.length) - 1] : undefined;

  const analysis: Analysis = {
    meta: parsed.meta,
    spread: ctx.spread,
    totalRows: parsed.totalRows,
    analyzedRows: candles.length - invalidRowList.length,
    invalidRows: invalidRowList.length,
    invalidRowList,
    results,
    passing,
    tradePasses,
    contextPasses,
    contextEvents,
    contextLog,
    live,
    historical,
    perStrategy,
    overlaps,
    lastRowDatetime: lastSignalCandle?.datetime ?? candles[candles.length - 1]?.datetime ?? "",
  };

  return { ok: true, analysis };
}

/**
 * Turn a forward-tested row into a machine-readable outcome plus a realised R
 * multiple. R is always measured from the actual exit price against the
 * initial risk (|entry - SL|), so trailing/breakeven exits report their true
 * result instead of being counted as a full win or a full loss.
 */
function attachOutcome(row: ResultRow, level: "TP" | "SL" | undefined) {
  if (row.setupStatus === "EXPIRED") {
    row.outcome = "NO_FILL";
    row.rMultiple = 0;
    return;
  }
  if (row.setupStatus !== "RESOLVED") {
    row.outcome = "OPEN";
    return;
  }

  const risk =
    row.entry !== undefined && row.sl !== undefined ? Math.abs(row.entry - row.sl) : undefined;
  const exit = row.exitPrice;
  if (row.entry !== undefined && exit !== undefined && risk !== undefined && risk > 0 && row.side) {
    const profit = row.side === "long" ? exit - row.entry : row.entry - exit;
    row.rMultiple = profit / risk;
    row.outcome = row.rMultiple > 0 ? "TP" : "SL";
    return;
  }
  row.outcome = level === "TP" ? "TP" : "SL";
  row.rMultiple = level === "TP" ? row.rr : -1;
}

export interface HtfFilterComparison {
  strategyId: string;
  strategy: string;
  before: {
    triggers: number;
    longs: number;
    shorts: number;
    trendAligned: number;
    trendFighting: number;
    wins: number;
    losses: number;
    open: number;
    winRate: number | null;
  };
  after: {
    triggers: number;
    longs: number;
    shorts: number;
    trendAligned: number;
    trendFighting: number;
    wins: number;
    losses: number;
    open: number;
    winRate: number | null;
  };
}

function resolvedWinRate(rows: ResultRow[]) {
  const longs = rows.filter((r) => r.side === "long").length;
  const shorts = rows.filter((r) => r.side === "short").length;
  const trendAligned = rows.filter(
    (r) => r.side !== undefined && htfAllowsDirection(r.htfTrend, r.side),
  ).length;
  const trendFighting = rows.filter(
    (r) => r.side !== undefined && !htfAllowsDirection(r.htfTrend, r.side),
  ).length;
  const wins = rows.filter((r) => r.statusNote?.includes("TP hit")).length;
  const losses = rows.filter((r) => r.statusNote?.includes("SL hit")).length;
  return {
    triggers: rows.length,
    longs,
    shorts,
    trendAligned,
    trendFighting,
    wins,
    losses,
    open: rows.length - wins - losses,
    winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
  };
}

/**
 * HTF direction-alignment numbers per strategy — the Analysis page's
 * "HTF direction filter: before vs after" table.
 *
 * This used to run the whole engine TWICE on identical source data (once with
 * `enableHtfDirectionFilter: false`, once with `true`), on top of the analysis
 * the caller had just run. Measured on the locked 9738-row baseline: 2.11s for
 * the pair (~1.2s per pass) of blocked main thread — and both passes returned
 * identical rows, because the flag is inert for trade generation (see
 * `RunOptions.enableHtfDirectionFilter`: `runAnalysis` never reads it). Every
 * before/after pair was therefore equal by construction and the table's
 * "Δ win rate" column was always +0.0 pp.
 *
 * One pass returns byte-identical output at half the cost.
 * `tests/analyzer-htf-inert.test.mjs` pins both halves of that claim (the flag
 * is inert, and this function makes exactly one engine pass): if the filter is
 * ever activated that test fails first, and the two-pass comparison must be
 * restored here.
 */
export function compareHtfDirectionFilter(csv: string): HtfFilterComparison[] {
  const run = runAnalysis(csv, { enableHtfDirectionFilter: true });
  if (!run.ok) throw new Error(run.error);
  const rows = run.analysis.passing;

  const names = new Map<string, string>();
  for (const row of rows) {
    if (!names.has(row.strategyId)) names.set(row.strategyId, row.strategy);
  }

  return [...names.entries()]
    .map(([strategyId, strategy]) => {
      const strategyRows = rows.filter((r) => r.strategyId === strategyId);
      return {
        strategyId,
        strategy,
        // Both sides come from the same pass (see above); kept as two objects
        // so the shape — and the UI's before/after rendering — is unchanged.
        before: resolvedWinRate(strategyRows),
        after: resolvedWinRate(strategyRows),
      };
    })
    .sort((a, b) => b.before.triggers - a.before.triggers || a.strategy.localeCompare(b.strategy));
}
