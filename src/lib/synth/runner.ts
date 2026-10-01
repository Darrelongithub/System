import { runAnalysis, type RunOutcome } from "../analyzer/run";
import type { Analysis, ResultRow } from "../analyzer/types";
import type { Candle } from "./types";
import { toCsv } from "./csv";

export type EngineRunnerResult =
  | { ok: true; trades: ResultRow[]; analysis: Analysis }
  | { ok: false; trades: []; error: string; outcome: RunOutcome };

/**
 * Thin integration adapter only. The synthetic core never imports the analyzer;
 * this boundary serializes through the analyzer's own CSV parser and calls the
 * existing runAnalysis() on closed historical candles.
 */
export function runThroughEngine(candles: readonly Candle[]): EngineRunnerResult {
  const outcome = runAnalysis(toCsv(candles), { seriesEndsComplete: true });
  if (!outcome.ok) return { ok: false, trades: [], error: outcome.error, outcome };
  return { ok: true, trades: outcome.analysis.tradePasses, analysis: outcome.analysis };
}
