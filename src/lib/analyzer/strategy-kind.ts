/**
 * TRADE systems count in trade statistics.
 * CONTEXT tools are logged only — never wins/losses/R/open trades.
 *
 * turtle and opening-range-breakout remain classified as "trade" so that
 * explicit research runs (strategyIds) still produce trade stats; they are
 * not part of the default production set (see FINAL_STRATEGY_IDS / STRATEGIES).
 */
export type StrategyKind = "trade" | "context";

export const STRATEGY_KIND: Record<string, StrategyKind> = {
  turtle: "trade",
  "opening-range-breakout": "trade",
  "dual-thrust": "trade",
  "macd-cross": "trade",
  "pdh-retest": "trade",
  "williams-r-fade": "trade",
  "three-soldiers": "trade",
  "morning-star": "trade",
  "classic-pivot": "trade",
  "ichimoku-tk": "trade",
  "donchian-55": "trade",
  "raschke-keltner": "context",
  "previous-day-high-low": "context",
  "bollinger-bands": "context",
  donchian: "context",
  "fvg-ict": "context",
  "crabel-contraction": "context",
  "crabel-outside-expansion": "context",
};

export function strategyKind(strategyId: string): StrategyKind {
  return STRATEGY_KIND[strategyId] ?? "context";
}

export function isTradeStrategy(strategyId: string): boolean {
  return strategyKind(strategyId) === "trade";
}

export function isContextStrategy(strategyId: string): boolean {
  return strategyKind(strategyId) === "context";
}

export interface ContextEvent {
  strategyId: string;
  strategy: string;
  datetime: string;
  side?: string;
  message: string;
}

export function formatContextChannel(events: ContextEvent[]): string {
  if (events.length === 0) return "[CONTEXT]\n(none)";
  const lines = ["[CONTEXT]"];
  for (const e of events) {
    const side = e.side && e.side !== "-" ? ` ${e.side}` : "";
    lines.push(`${e.strategy}${side} @ ${e.datetime}: ${e.message}`);
  }
  return lines.join("\n");
}
