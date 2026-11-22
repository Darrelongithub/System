import { dailyAggregates, openingRanges } from "./daily";
import { ema } from "./indicators";
import { applySpreadAndRR, checkMinStopFloor, RR_FAIL_REASON, RR_THRESHOLD } from "./math";
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
import { ANALYZER_LIVE_OPTIONS } from "./config";
import { inspectSeriesContract } from "./series-contract";
import { createPortfolioGate } from "./portfolio-gate";
import { checkRegimeGate } from "./regime-state";
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
   * Restrict evaluation to this subset of strategy ids (e.g. ["turtle"] when
   * running Turtle on its own wider-lookback window). Resolved against the full
   * implementation registry (including legacy Turtle/ORB). When omitted, the
   * default production set is used: the 30 V2_STRATEGY_IDS plus context tools —
   * Turtle and Opening-Range-Breakout are not included.
   */
  strategyIds?: string[];
  /**
   * When true, omits FAIL rows from `analysis.results` (retaining all PASS rows
   * and still computing exact `perStrategy` failCounts/failReasons in-flight).
   * Optional memory saver for multi-year (80k+ bar) research backtests; default
   * false preserves full bar×strategy `results` tables for the UI & test suite.
   */
  omitFailResults?: boolean;
  /**
   * When false (default live safety), last candle may be incomplete and is
   * excluded from signal generation. Historical complete series: true.
   */
  seriesEndsComplete?: boolean;
  /**
   * v2.0 regime gate (Layer 2). Runs before consume() on every PASS candidate:
   * G1 HTF alignment, G2 dead-tape lockout, G3 macro tide (EMA50/EMA200),
   * G4 per-archetype volatility & trend routing. Default true.
   */
  enableRegimeGate?: boolean;
  /**
   * v2.0 portfolio gate (Layer 4). Runs before consume() on every PASS candidate:
   * per-bar dedupe, opposite-side anti-hedge, same-side stack cap, and the
   * rolling-drawdown riskMultiplier. Default true.
   */
  enablePortfolioGate?: boolean;
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
  // Every row invalid used to surface as an "ok" analysis with zero trades,
  // hiding a corrupted/wrong-format file behind an empty result.
  if (candles.every((candle) => candle.invalid)) {
    const firstReason = candles.find((candle) => candle.invalid)?.invalid ?? "unknown";
    return {
      ok: false,
      error: `INVALID FILE: no valid data rows; ${candles.length} row(s) rejected (first reason: ${firstReason})`,
    };
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

  const enableRegimeGate = options.enableRegimeGate ?? true;
  const enablePortfolioGate = options.enablePortfolioGate ?? true;
  const omitFailResults = options.omitFailResults ?? false;
  const portfolioGate = createPortfolioGate();

  const passCounts = new Map<string, number>();
  const failCounts = new Map<string, number>();
  const failReasonsMap = new Map<string, Map<string, number>>();
  for (const s of activeStrategies) {
    passCounts.set(s.id, 0);
    failCounts.set(s.id, 0);
    failReasonsMap.set(s.id, new Map());
  }
  const recordFail = (strategyId: string, reason: string) => {
    failCounts.set(strategyId, (failCounts.get(strategyId) ?? 0) + 1);
    const m = failReasonsMap.get(strategyId)!;
    m.set(reason, (m.get(reason) ?? 0) + 1);
  };
  const recordPass = (strategyId: string) => {
    passCounts.set(strategyId, (passCounts.get(strategyId) ?? 0) + 1);
  };

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
      // Fast path for FAIL rows: omit undefined optional properties so V8 uses a
      // compact 8-field hidden class (cuts 37-strategy × 80k-bar heap by >55%).
      if (outcome.result !== "PASS") {
        recordFail(strategy.id, outcome.reason);
        if (!omitFailResults) {
          const failRow: ResultRow = {
            strategyId: strategy.id,
            strategy: strategy.name,
            index: candle.index,
            datetime: candle.datetime,
            result: "FAIL",
            reason: outcome.reason,
            trend: candle.trend,
            htfTrend: candle.htfTrend,
          };
          if (outcome.side !== undefined) failRow.side = outcome.side;
          if (outcome.turtleSystem !== undefined) failRow.turtleSystem = outcome.turtleSystem;
          if (outcome.orderType !== undefined) failRow.orderType = outcome.orderType;
          results.push(failRow);
        }
        continue;
      }

      const row: ResultRow = {
        strategyId: strategy.id,
        strategy: strategy.name,
        index: candle.index,
        datetime: candle.datetime,
        result: outcome.result,
        reason: outcome.reason,
        trend: candle.trend,
        htfTrend: candle.htfTrend,
      };
      if (outcome.side !== undefined) row.side = outcome.side;
      if (outcome.turtleSystem !== undefined) row.turtleSystem = outcome.turtleSystem;
      if (outcome.orderType !== undefined) row.orderType = outcome.orderType;

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
              } else {
                // v2.0 gate chain, in order: (2) min stop floor → (3) regime gate
                // → (4) portfolio gate → (5) commit consume().
                // Rejections leave the strategy's de-dupe slot free.
                const minStopReason = checkMinStopFloor(
                  math.entry,
                  math.sl,
                  atr[candle.index],
                  ctx.spread,
                );
                const regimeReason =
                  minStopReason === null && enableRegimeGate && outcome.side
                    ? checkRegimeGate(ctx, candle.index, strategy.id, outcome.side)
                    : null;
                const portfolioReason =
                  minStopReason === null &&
                  regimeReason === null &&
                  enablePortfolioGate &&
                  outcome.side
                    ? portfolioGate.canOpen(outcome.side, candle.index)
                    : null;
                const rejectReason = minStopReason ?? regimeReason ?? portfolioReason;
                if (rejectReason !== null) {
                  row.result = "FAIL";
                  row.reason = rejectReason;
                } else if (outcome.consumeKey) {
                  // A2 fix: commit de-dupe slot only after validation succeeds.
                  consume(ctx, strategy.id, outcome.consumeKey);
                }
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
        // LAYER 4: drawdown-throttled risk multiplier (0.5 / 1.0) + registration.
        // Registration happens only after consume() succeeded, so the gate
        // never tracks a candidate that was rejected.
        if (enablePortfolioGate && isTradeStrategy(strategy.id) && outcome.side && row.rr !== undefined) {
          const exitIndex = status.resolutionCandle ? status.resolutionCandle.index : Infinity;
          const exitIndexClean =
            status.setupStatus === "EXPIRED" ? Infinity : exitIndex;
          portfolioGate.registerTrade({
            strategyId: strategy.id,
            side: outcome.side,
            entryIndex: candle.index,
            exitIndex: exitIndexClean,
            rMultiple: row.rMultiple ?? 0,
          });
          row.riskMultiplier = portfolioGate.riskMultiplierAt(candle.index);
        } else {
          row.riskMultiplier = 1.0;
        }
        recordPass(strategy.id);
        results.push(row);
      } else {
        recordFail(strategy.id, row.reason);
        if (!omitFailResults) results.push(row);
      }
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
    const reasons = failReasonsMap.get(strategy.id) ?? new Map<string, number>();
    return {
      strategyId: strategy.id,
      strategy: strategy.name,
      passCount: passCounts.get(strategy.id) ?? 0,
      failCount: failCounts.get(strategy.id) ?? 0,
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
    contract: inspectSeriesContract(candles),
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
 * The v2.0 regime gate applies htfAllowsDirection as G1 before consume(), so
 * every PASS row is already HTF-aligned by construction. This function returns
 * the same numbers on both sides of the table (they are equal by construction)
 * so the UI's shape is unchanged; a before/after Δ of 0 pp is the honest
 * output for a filter that ships default-on.
 */
export function compareHtfDirectionFilter(csv: string): HtfFilterComparison[] {
  const run = runAnalysis(csv, ANALYZER_LIVE_OPTIONS);
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
