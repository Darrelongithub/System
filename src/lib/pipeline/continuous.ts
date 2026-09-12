/**
 * Continuous portfolio analysis (default backtest mode).
 * One runAnalysis over the full series using the default production strategy set
 * (FINAL_STRATEGY_IDS + context). Legacy Turtle/ORB are not included unless the
 * caller later requests them via explicit strategyIds on runAnalysis.
 */
import { runAnalysis, type RunOutcome } from "@/lib/analyzer/run";
import {
  isTradeStrategy,
  formatContextChannel,
  type ContextEvent,
} from "@/lib/analyzer/strategy-kind";
import type { ResultRow } from "@/lib/analyzer/types";
import type { DayTrigger, TriggerOutcome } from "@/lib/backtest/engine";

function outcomeOf(row: ResultRow): TriggerOutcome {
  if (row.outcome) return row.outcome;
  const note = row.statusNote ?? "";
  if (
    note.includes("TP hit") ||
    note.includes("Turtle exit") ||
    note.includes("Donchian 5-day trailing exit")
  )
    return "TP";
  if (note.includes("SL broken before fill") || note.includes("no fill within")) return "NO_FILL";
  if (note.includes("SL hit") || note.includes("stop hit")) return "SL";
  return "OPEN";
}

function toTrigger(row: ResultRow): DayTrigger {
  return {
    strategyId: row.strategyId,
    strategy: row.strategy,
    datetime: row.datetime,
    side: row.side ?? "-",
    htfTrend: row.htfTrend,
    entry: row.entry,
    sl: row.sl,
    tp: row.tp,
    rr: row.rr,
    reason: row.reason,
    setupStatus: row.setupStatus ?? "-",
    statusNote: row.statusNote ?? "",
    outcome: outcomeOf(row),
    exitDatetime: row.exitDatetime,
    exitPrice: row.exitPrice,
    rMultiple: row.rMultiple,
    detail: row.detail,
    kind: isTradeStrategy(row.strategyId) ? "trade" : "context",
  };
}

export interface ContinuousAnalysis {
  ok: true;
  analysis: Extract<RunOutcome, { ok: true }>["analysis"];
  tradeTriggers: DayTrigger[];
  contextEvents: ContextEvent[];
  contextLog: string;
  tradesOnDay: (day: string) => DayTrigger[];
  contextOnDay: (day: string) => ContextEvent[];
}

export interface ContinuousFailure {
  ok: false;
  error: string;
}

export function analyseContinuous(
  csv: string,
  options: { seriesEndsComplete?: boolean } = {},
): ContinuousAnalysis | ContinuousFailure {
  const outcome = runAnalysis(csv, {
    enableHtfDirectionFilter: true,
    seriesEndsComplete: options.seriesEndsComplete ?? true,
  });
  if (!outcome.ok) return { ok: false, error: outcome.error };

  const tradeTriggers = outcome.analysis.tradePasses.map(toTrigger);
  const contextEvents = outcome.analysis.contextEvents;

  return {
    ok: true,
    analysis: outcome.analysis,
    tradeTriggers,
    contextEvents,
    contextLog: outcome.analysis.contextLog,
    tradesOnDay: (day) => tradeTriggers.filter((t) => t.datetime.startsWith(day)),
    contextOnDay: (day) => contextEvents.filter((e) => e.datetime.startsWith(day)),
  };
}

export function contextLogForDay(events: ContextEvent[], day: string): string {
  return formatContextChannel(events.filter((e) => e.datetime.startsWith(day)));
}
