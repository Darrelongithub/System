/**
 * Journal adapter over canonical evaluateSetupStatus.
 * Same-candle rule: TP first after fill.
 */
import type { Candle, ResultRow } from "@/lib/analyzer/types";
import { evaluateSetupStatus } from "@/lib/analyzer/status";

export type JournalOutcome = "TP" | "SL" | "still_open" | "no_fill";

export interface TradePathRecord {
  strategyId: string;
  strategy: string;
  entryDatetime: string;
  direction: "long" | "short";
  entryPrice: number;
  sl: number;
  tp: number;
  fillDatetime?: string;
  exitDatetime?: string;
  exitPrice?: number;
  outcome: JournalOutcome;
  realizedR?: number;
  maeR: number;
  mfeR: number;
  maxRReached: number;
  timeToSlMinutes?: number;
  timeToTpMinutes?: number;
  timeToPlus0_5RMinutes?: number;
  timeToPlus1RMinutes?: number;
  timeToPlus2RMinutes?: number;
  intrabarAmbiguous: boolean;
}

export function walkTradePath(trigger: ResultRow, candles: Candle[]): TradePathRecord | null {
  if (trigger.entry === undefined || trigger.sl === undefined || trigger.tp === undefined || !trigger.side) {
    return null;
  }
  const direction = trigger.side;
  const risk = Math.abs(trigger.entry - trigger.sl);
  if (!(risk > 0)) return null;

  const status = evaluateSetupStatus(trigger, candles);
  let journalOutcome: JournalOutcome = "still_open";
  // PENDING means the order simply has not filled yet within the analyzed window;
  // only EXPIRED is a genuine never-filled trade.
  if (status.setupStatus === "EXPIRED") journalOutcome = "no_fill";
  else if (status.setupStatus === "RESOLVED") {
    journalOutcome = status.resolutionLevel === "TP" ? "TP" : "SL";
  }

  // Walk the candles from the FILL to the resolution (or the end of data) and
  // measure the actual adverse/favorable excursion in R. Excursion before the
  // fill (limit/stop waiting bars; the pre-close body of a market fill bar)
  // is not suffered by the trade and must not inflate MAE/MFE.
  const lastIndex = status.resolutionCandle?.index ?? candles.length - 1;
  const excursionStart =
    trigger.orderType === "market"
      ? trigger.index + 1
      : (status.fillCandle?.index ?? trigger.index);
  let maeR = 0;
  let mfeR = 0;
  if (journalOutcome !== "no_fill") {
    for (let i = excursionStart; i <= lastIndex && i < candles.length; i++) {
      const candle = candles[i];
      if (!candle || candle.invalid || candle.high === undefined || candle.low === undefined) continue;
      const favorable =
        direction === "long" ? candle.high - trigger.entry : trigger.entry - candle.low;
      const adverse =
        direction === "long" ? trigger.entry - candle.low : candle.high - trigger.entry;
      if (favorable / risk > mfeR) mfeR = favorable / risk;
      if (adverse / risk > maeR) maeR = adverse / risk;
    }
  }

  return {
    strategyId: trigger.strategyId,
    strategy: trigger.strategy,
    entryDatetime: trigger.datetime,
    direction,
    entryPrice: trigger.entry,
    sl: trigger.sl,
    tp: trigger.tp,
    outcome: journalOutcome,
    exitDatetime: status.resolutionCandle?.datetime,
    exitPrice: status.resolutionPrice,
    realizedR:
      journalOutcome === "TP" || journalOutcome === "SL"
        ? typeof trigger.rMultiple === "number"
          ? trigger.rMultiple
          : journalOutcome === "TP"
            ? Math.abs(trigger.tp - trigger.entry) / risk
            : -1
        : undefined,
    maeR,
    mfeR,
    maxRReached: mfeR,
    intrabarAmbiguous: (status.statusNote ?? "").toLowerCase().includes("ambiguous"),
  };
}

export function buildTradeJournal(triggers: ResultRow[], candles: Candle[]): TradePathRecord[] {
  return triggers.map((t) => walkTradePath(t, candles)).filter((x): x is TradePathRecord => x !== null);
}
