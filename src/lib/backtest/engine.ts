/**
 * SOURCE-MATCHED BACKTEST NOTES:
 * - Turtle N uses completed daily aggregates and Wilder smoothing as of the trigger date; no future daily data.
 * - Crabel ORB uses 10 prior completed days, Stretch from each day's OPEN to its closest extreme, and Stretch-adjusted stop entries/opposite-side protective stop.
 * - Crabel ORB forward management is delegated to the analyzer status engine, which uses the shared Crabel ORB management contract; the backtest does not reimplement the breakeven rule.
 * - PDH/PDL in this implementation checks raw prior-day levels; no ATR buffer is claimed as canonical.
 * - Strategies without source-defined profit targets retain tp: undefined; there is no generic 2R fallback.
 * - Diagnostic-only conditions are not equivalent to source-defined executable trade systems.
 */
import { STRATEGIES } from "@/lib/analyzer/strategies";
import { isTradeStrategy } from "@/lib/analyzer/strategy-kind";
import type { HtfTrendContext, ResultRow } from "@/lib/analyzer/types";

export type TriggerOutcome = "TP" | "SL" | "OPEN" | "NO_FILL";

export interface DayTrigger {
  strategyId: string;
  strategy: string;
  datetime: string;
  side: string;
  htfTrend: HtfTrendContext;
  entry: number | undefined;
  sl: number | undefined;
  tp: number | undefined;
  rr: number | undefined;
  reason: string;
  setupStatus: string;
  statusNote: string;
  outcome: TriggerOutcome;
  exitDatetime?: string | undefined;
  exitPrice?: number | undefined;
  rMultiple?: number | undefined;
  detail?: string[];
  kind?: "trade" | "context";
}

export interface StrategyStats {
  strategyId: string;
  strategy: string;
  triggers: number;
  tpHits: number;
  slHits: number;
  open: number;
  noFill: number;
  rrSum: number;
  rrCount: number;
  resolvedRrSum: number;
  resolvedCount: number;
}

/** Cumulative state that survives across days (and across runs). */
export interface BacktestState {
  symbol: string;
  firstDay: string | null;
  lastCompletedDay: string | null;
  days: string[];
  skipped: { day: string; reason: string }[];
  stats: Record<string, StrategyStats>;
}

/**
 * Every default-production TRADE strategy starts at zero (the final 9).
 * Context tools are logged only — they never produce trade stats, so seeding
 * them here would render permanently empty rows in the rolling-stats table.
 */
export function seededStats(): Record<string, StrategyStats> {
  const stats: Record<string, StrategyStats> = {};
  for (const strategy of STRATEGIES.filter((s) => isTradeStrategy(s.id))) {
    stats[strategy.id] = {
      strategyId: strategy.id,
      strategy: strategy.name,
      triggers: 0,
      tpHits: 0,
      slHits: 0,
      open: 0,
      noFill: 0,
      rrSum: 0,
      rrCount: 0,
      resolvedRrSum: 0,
      resolvedCount: 0,
    };
  }
  return stats;
}

export function emptyState(symbol: string): BacktestState {
  return {
    symbol,
    firstDay: null,
    lastCompletedDay: null,
    days: [],
    skipped: [],
    stats: seededStats(),
  };
}

/** yyyy-MM-dd helpers that never touch local timezone drift. */
export function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function dayDate(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00Z`);
}

export function addUtcDays(dayKey: string, days: number): string {
  const date = dayDate(dayKey);
  date.setUTCDate(date.getUTCDate() + days);
  return toDayKey(date);
}

export function isWeekend(dayKey: string): boolean {
  const weekday = dayDate(dayKey).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** Sundays never carry market candles (FX week opens Monday 00:00 EAT). */
export function isSunday(dayKey: string): boolean {
  return dayDate(dayKey).getUTCDay() === 0;
}

/**
 * Whether a calendar day gets a SKIPPED day-report in the auto-backtest loop.
 *
 * Forex weeks run Monday 00:00 → Saturday ~01:00 EAT, so every Saturday
 * legitimately holds Friday's session tail (2-3 candles) — and those candles
 * trigger real trades (39 of them over the 2025-11→2026-08 golden baseline).
 * The old predicate `isWeekend(day) || (no data)` short-circuited on the
 * calendar alone: Saturday reports were always SKIPPED and their triggers
 * never entered the rolling stats, so the backtest silently undercounted the
 * engine's own continuous pass.
 *
 * Rule: a day with trade triggers is ALWAYS processed. A day with no candles,
 * no triggers and no context is skipped either way ("no OHLC bars" on
 * weekdays). A weekend day with candles/context but no triggers is still
 * skipped, but now for the honest reason.
 */
export function dayReportSkipReason(
  day: string,
  hasCandles: boolean,
  triggerCount: number,
  contextCount: number,
): string | null {
  if (!hasCandles && triggerCount === 0 && contextCount === 0) {
    return isWeekend(day)
      ? "weekend — no market session / no OHLC expected"
      : "no OHLC bars for this calendar day in the continuous series";
  }
  if (isWeekend(day) && triggerCount === 0) {
    return "weekend — session tail candles only, no trade triggers";
  }
  return null;
}

/** Every calendar day in the inclusive range — weekends included. */
export function rangeDays(fromDay: string, toDay: string): string[] {
  const days: string[] = [];
  if (dayDate(fromDay) > dayDate(toDay)) return days;
  let current = fromDay;
  while (dayDate(current) <= dayDate(toDay)) {
    days.push(current);
    current = addUtcDays(current, 1);
  }
  return days;
}

export interface StrategyDayBreakdown {
  strategyId: string;
  strategy: string;
  evaluatedBars: number;
  passCount: number;
  topFailReasons: { reason: string; count: number }[];
}

/** Per-strategy view of a single day, built from every evaluated row (PASS + FAIL). */
export function buildStrategyBreakdown(results: ResultRow[], day: string): StrategyDayBreakdown[] {
  const dayRows = results.filter((row) => row.datetime.startsWith(day));

  const byStrategy = new Map<string, ResultRow[]>();
  for (const row of dayRows) {
    const bucket = byStrategy.get(row.strategyId);
    if (bucket) bucket.push(row);
    else byStrategy.set(row.strategyId, [row]);
  }

  return STRATEGIES.map((strategy) => {
    const rows = byStrategy.get(strategy.id) ?? [];
    const passCount = rows.filter((row) => row.result === "PASS").length;

    const failCounts = new Map<string, number>();
    for (const row of rows) {
      if (row.result !== "FAIL") continue;
      failCounts.set(row.reason, (failCounts.get(row.reason) ?? 0) + 1);
    }
    const topFailReasons = [...failCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([reason, count]) => ({ reason, count }));

    return {
      strategyId: strategy.id,
      strategy: strategy.name,
      evaluatedBars: rows.length,
      passCount,
      topFailReasons,
    };
  });
}

/** Fold a day's triggers into the rolling per-strategy totals. */
export function applyTriggers(state: BacktestState, triggers: DayTrigger[]) {
  for (const trigger of triggers) {
    if (trigger.kind === "context" || !isTradeStrategy(trigger.strategyId)) continue;
    const existing =
      state.stats[trigger.strategyId] ??
      ({
        strategyId: trigger.strategyId,
        strategy: trigger.strategy,
        triggers: 0,
        tpHits: 0,
        slHits: 0,
        open: 0,
        noFill: 0,
        rrSum: 0,
        rrCount: 0,
        resolvedRrSum: 0,
        resolvedCount: 0,
      } satisfies StrategyStats);
    existing.triggers += 1;
    if (typeof trigger.rr === "number" && Number.isFinite(trigger.rr) && trigger.rr > 0) {
      existing.rrSum += trigger.rr;
      existing.rrCount += 1;
    }
    // Realised R comes from the actual exit price when the analyzer produced
    // one; only then do we fall back to the planned RR / -1R approximation.
    const realised =
      typeof trigger.rMultiple === "number" && Number.isFinite(trigger.rMultiple)
        ? trigger.rMultiple
        : trigger.outcome === "TP"
          ? typeof trigger.rr === "number" && Number.isFinite(trigger.rr)
            ? trigger.rr
            : undefined
          : trigger.outcome === "SL"
            ? -1
            : undefined;

    if (trigger.outcome === "TP") {
      existing.tpHits += 1;
      if (realised !== undefined) {
        existing.resolvedRrSum += realised;
        existing.resolvedCount += 1;
      }
    } else if (trigger.outcome === "SL") {
      existing.slHits += 1;
      if (realised !== undefined) {
        existing.resolvedRrSum += realised;
        existing.resolvedCount += 1;
      }
    } else if (trigger.outcome === "NO_FILL") {
      existing.noFill += 1;
    } else existing.open += 1;
    state.stats[trigger.strategyId] = existing;
  }
}

export function averageRr(stats: StrategyStats): number | null {
  return stats.rrCount > 0 ? stats.rrSum / stats.rrCount : null;
}

export function realizedR(stats: StrategyStats): number | null {
  return stats.resolvedCount > 0 ? stats.resolvedRrSum / stats.resolvedCount : null;
}

export function winRate(stats: StrategyStats): number | null {
  const resolved = stats.tpHits + stats.slHits;
  return resolved === 0 ? null : (stats.tpHits / resolved) * 100;
}

function num(value: number | undefined): string {
  return value === undefined ? "-" : String(Number(value.toFixed(5)));
}

export interface DayReportInput {
  symbol: string;
  day: string;
  checkpoint: string;
  windowStart: string;
  state: BacktestState;
  triggers: DayTrigger[];
  skipReason?: string | undefined;
  analyzedRows?: number | undefined;
  invalidRows?: number | undefined;
  lastRowDatetime?: string | undefined;
  strategyBreakdown?: StrategyDayBreakdown[] | undefined;
  resolutionEnd?: string | undefined;
}

/** One self-contained file per day: new triggers plus cumulative trend stats. */
export function buildDayReport(input: DayReportInput): string {
  const { symbol, day, checkpoint, windowStart, state, triggers, skipReason } = input;
  const lines: string[] = [];

  lines.push("=== AUTO-BACKTEST DAY REPORT ===");
  lines.push(`symbol: ${symbol}`);
  lines.push(`day: ${day}`);
  lines.push(`time_checkpoint (EAT): ${checkpoint}`);
  lines.push(`csv_window: ${windowStart} 00:00 -> ${day} ${checkpoint}`);
  if (input.resolutionEnd && input.resolutionEnd !== day) {
    lines.push(
      `forward_resolution_window: ${day} -> ${input.resolutionEnd} (used only to resolve TP/SL of triggers dated ${day}; no signal is generated from it)`,
    );
  }
  lines.push(
    `analysis_mode: local structure engine (AI verifier/debate sections, when run, are appended below)`,
  );
  lines.push(`generated_at: ${new Date().toISOString()}`);
  lines.push("");

  if (skipReason) {
    lines.push("=== DAY SKIPPED ===");
    lines.push(`status: SKIPPED`);
    lines.push(`reason: ${skipReason}`);
    lines.push("The run continued to the next day; no triggers were recorded for this date.");
  } else {
    lines.push("=== DAY DATA ===");
    lines.push(`candles on this day (signal generation): ${input.analyzedRows ?? 0}`);
    lines.push(`invalid/skipped rows on this day: ${input.invalidRows ?? 0}`);
    lines.push(`last candle on this day: ${input.lastRowDatetime ?? "-"}`);
    lines.push(
      `note: continuous portfolio mode evaluates the full series once; triggers above are those whose signal datetime falls on ${day}. Forward candles after the signal are used only for TP/SL resolution.`,
    );
    lines.push("");
    lines.push(`=== NEW TRIGGERS ON ${day} (${triggers.length}) ===`);
    if (triggers.length === 0) {
      lines.push("none — no strategy triggered on this day up to the checkpoint");
    }
    triggers.forEach((trigger, index) => {
      lines.push(
        `${index + 1}. ${trigger.strategy} @ ${trigger.datetime} | ${trigger.side} | H1 ${trigger.htfTrend.h1} / H4 ${trigger.htfTrend.h4} / D1 ${trigger.htfTrend.d1} | entry ${num(trigger.entry)} | SL ${num(trigger.sl)} | TP ${num(trigger.tp)} | RR ${trigger.rr === undefined ? "-" : trigger.rr.toFixed(2)} | outcome ${trigger.outcome}${trigger.exitDatetime ? ` @ ${trigger.exitDatetime} (${num(trigger.exitPrice)})` : ""}${typeof trigger.rMultiple === "number" ? ` | realised ${trigger.rMultiple.toFixed(2)}R` : ""} | status ${trigger.setupStatus}`,
      );
      lines.push(`    reason: ${trigger.reason}`);
      if (trigger.detail?.length) {
        lines.push("    detailed reasoning:");
        for (const line of trigger.detail) lines.push(`      - ${line}`);
      }
      lines.push(...triggerReasoning(trigger));
    });

    lines.push("");
    lines.push(`=== PER-STRATEGY FINDINGS ON ${day} ===`);
    const breakdown = input.strategyBreakdown ?? [];
    const breakdownById = new Map(breakdown.map((entry) => [entry.strategyId, entry]));
    const triggersByStrategy = new Map<string, DayTrigger[]>();
    for (const trigger of triggers) {
      const bucket = triggersByStrategy.get(trigger.strategyId);
      if (bucket) bucket.push(trigger);
      else triggersByStrategy.set(trigger.strategyId, [trigger]);
    }
    for (const strategy of STRATEGIES) {
      const entry = breakdownById.get(strategy.id);
      const strategyTriggers = triggersByStrategy.get(strategy.id) ?? [];
      lines.push(
        `${strategy.name} | evaluated bars: ${entry?.evaluatedBars ?? 0} | passes: ${entry?.passCount ?? 0}`,
      );
      if (strategyTriggers.length > 0) {
        for (const trigger of strategyTriggers) {
          lines.push(
            `  trigger @ ${trigger.datetime} | ${trigger.side} | H1 ${trigger.htfTrend.h1} / H4 ${trigger.htfTrend.h4} / D1 ${trigger.htfTrend.d1} | entry ${num(trigger.entry)} | outcome ${trigger.outcome}`,
          );
        }
      } else {
        lines.push("  no trigger");
        const reasons = entry?.topFailReasons ?? [];
        if (reasons.length === 0) {
          lines.push("  reason: no bars evaluated for this strategy on this day");
        } else {
          for (const fail of reasons) {
            lines.push(`  reason: ${fail.reason} (${fail.count}x)`);
          }
        }
      }
    }
  }

  lines.push("");
  lines.push("=== ROLLING CUMULATIVE STATS PER STRATEGY ===");
  lines.push(`since first backtest day: ${state.firstDay ?? day}`);
  lines.push(`days completed (incl. this one): ${state.days.length}`);
  lines.push(
    "strategy | total triggers | TP hits | SL hits | no fill | still open | win rate | avg realised R",
  );
  const rows = Object.values(state.stats).sort((a, b) => a.strategy.localeCompare(b.strategy));
  if (rows.length === 0) lines.push("no triggers recorded yet");
  for (const stats of rows) {
    const rate = winRate(stats);
    const realised = realizedR(stats);
    lines.push(
      `${stats.strategy} | ${stats.triggers} | ${stats.tpHits} | ${stats.slHits} | ${stats.noFill ?? 0} | ${stats.open} | ${rate === null ? "n/a (no resolved trades)" : `${rate.toFixed(1)}%`} | ${realised === null ? "n/a" : `${realised.toFixed(2)}R`}`,
    );
  }

  const totals = rows.reduce(
    (acc, stats) => ({
      triggers: acc.triggers + stats.triggers,
      tpHits: acc.tpHits + stats.tpHits,
      slHits: acc.slHits + stats.slHits,
      open: acc.open + stats.open,
      noFill: acc.noFill + (stats.noFill ?? 0),
    }),
    { triggers: 0, tpHits: 0, slHits: 0, open: 0, noFill: 0 },
  );
  const totalResolved = totals.tpHits + totals.slHits;
  lines.push("");
  lines.push(
    `ALL STRATEGIES | ${totals.triggers} | ${totals.tpHits} | ${totals.slHits} | ${totals.noFill} | ${totals.open} | ${totalResolved === 0 ? "n/a" : `${((totals.tpHits / totalResolved) * 100).toFixed(1)}%`}`,
  );

  if (state.skipped.length > 0) {
    lines.push("");
    lines.push("=== SKIPPED DAYS SO FAR ===");
    for (const skip of state.skipped) lines.push(`${skip.day}: ${skip.reason}`);
  }

  lines.push("");
  lines.push(`win_rate_definition: TP hit / (TP hit + SL hit), resolved trades only.`);
  lines.push(
    `weekend_policy: Saturdays and Sundays are reported as SKIPPED when the calendar day has no market session; no synthetic candles are created.`,
  );

  return lines.join("\n");
}

export function dayFileName(day: string): string {
  return `backtest_${day}.txt`;
}

/** Packaging is deliberately independent from analysis granularity. */
export function batchBacktestReports(
  reports: { day: string; content: string; triggers?: DayTrigger[] }[],
  runLength: number,
): { name: string; content: string }[] {
  if (runLength <= 7) return reports.map((r) => ({ name: dayFileName(r.day), content: r.content }));
  const groups = new Map<string, { day: string; content: string; triggers?: DayTrigger[] }[]>();
  for (const report of reports) {
    const date = dayDate(report.day);
    let key: string;
    if (runLength <= 31) {
      // ISO week, Monday-Sunday.
      const thursday = new Date(date);
      thursday.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
      const year = thursday.getUTCFullYear();
      const jan4 = new Date(Date.UTC(year, 0, 4));
      const week = 1 + Math.round((thursday.getTime() - jan4.getTime()) / 604800000);
      key = `${year}-W${String(week).padStart(2, "0")}`;
    } else key = report.day.slice(0, 7);
    const bucket = groups.get(key) ?? [];
    bucket.push(report);
    groups.set(key, bucket);
  }
  // Sorted by bucket key, not by first appearance in `reports`: week
  // (`2020-W53`) and month (`2026-02`) keys are lexicographically
  // chronological, so the package order inside the ZIP no longer depends on the
  // order the caller happened to collect days in. Days inside a package were
  // already sorted below.
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entries]) => ({
      name: runLength <= 31 ? `backtest_week_${key}.txt` : `backtest_month_${key}.txt`,
      content: (() => {
        const ordered = entries.sort((a, b) => a.day.localeCompare(b.day));
        const subtotal = new Map<string, number>();
        for (const entry of ordered)
          for (const trigger of entry.triggers ?? [])
            subtotal.set(trigger.strategy, (subtotal.get(trigger.strategy) ?? 0) + 1);
        const subtotalLines = [
          "=== PACKAGE SUBTOTAL PER STRATEGY ===",
          ...STRATEGIES.map((s) => `${s.name} | triggers in package: ${subtotal.get(s.name) ?? 0}`),
          "",
        ];
        return (
          subtotalLines.join("\n") +
          ordered.map((r) => r.content).join("\n\n\n=== END OF DAY / NEXT DAY ===\n\n")
        );
      })(),
    }));
}

/**
 * Keyed by the live `StrategyCheck.id` values from `analyzer/strategies` (see
 * `spec-strategies.ts`). This previously listed ids from an older, now-orphaned
 * strategy set (underscored names like `opening_range`, `order_block`,
 * `liquidity_sweep`...) that no longer exist in `STRATEGIES`, so every lookup
 * silently missed and fell back to the generic placeholder. Updated to match
 * the current hyphenated ids and the actual coded rules.
 */
const REQUIREMENTS: Record<string, string[]> = {
  "opening-range-breakout": [
    "opening range built for the candle's own session",
    "past the opening window",
    "Stretch-adjusted stop entry above/below the range",
    "opposite-side Stretch-adjusted protective stop",
    "no canonical fixed TP",
  ],
  turtle: [
    "Wilder-smoothed N(20) from completed daily history",
    "System 1: prior 20-day extreme plus one instrument tick; System 2: prior 55-day extreme",
    "System 1 skip rule based on prior same-direction breakout outcome",
    "0.5N pyramiding from actual fills, maximum 4 units per market",
    "2N stop re-anchored to most recent fill",
    "System 1 10-day / System 2 20-day trailing exit",
  ],
  "raschke-keltner": [
    "EMA(20) centerline",
    "ATR band convention",
    "condition only; no canonical TP",
  ],
  "previous-day-high-low": [
    "raw prior EAT-day high/low level",
    "level break",
    "no canonical full entry/SL/TP system",
  ],
  "bollinger-bands": [
    "20-period SMA",
    "2 population-standard-deviation bands",
    "indicator condition only; no canonical trade system",
  ],
  donchian: [
    "20 completed-day channel breakout",
    "5-day opposite-channel exit is the documented structure and is simulated dynamically",
    "no fixed TP",
  ],
  "crabel-contraction": [
    "completed EAT-day Inside Day / NR4 / NR7",
    "diagnostic/precondition rather than standalone canonical entry",
  ],
  "crabel-outside-expansion": [
    "completed EAT-day outside day",
    "diagnostic; empirical close-location edge tables require replication",
  ],
  "fvg-ict": ["three-candle FVG condition", "no canonical mechanical entry/SL/TP"],
};

export function triggerReasoning(trigger: DayTrigger): string[] {
  const reqs = REQUIREMENTS[trigger.strategyId] ?? ["strategy-specific entry conditions"];
  const lines = ["    requirements:"];
  for (const requirement of reqs) lines.push(`      - satisfied: ${requirement}`);
  lines.push(`    actual strategy evidence: ${trigger.reason}`);
  const risk =
    trigger.entry !== undefined && trigger.sl !== undefined
      ? Math.abs(trigger.entry - trigger.sl)
      : undefined;
  lines.push(
    `    TP placement: ${num(trigger.tp)} — structure target if available; no generic 2R fallback${risk !== undefined ? ` (risk ${risk.toFixed(5)})` : ""}.`,
  );
  lines.push(
    `    SL placement: ${num(trigger.sl)} — strategy invalidation extreme/level with its configured ATR buffer.`,
  );
  if (trigger.statusNote) lines.push(`    resolution: ${trigger.statusNote}`);
  return lines;
}

/**
 * Post-hoc trade journal: resolves generated triggers against the complete candle
 * history, without inheriting the per-day live-simulation horizon.
 */
export { buildTradeJournal, walkTradePath } from "@/lib/journal/path-walker";
export type { TradePathRecord, JournalOutcome } from "@/lib/journal/path-walker";
