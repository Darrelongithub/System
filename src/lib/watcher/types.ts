export type MacroSeriesId = "DFII10" | "VIXCLS" | "T10Y2Y" | "BAMLH0A0HYM2";
export type SnapshotStatus = "live" | "cached" | "offline";

export interface MacroPoint {
  id: MacroSeriesId;
  label: string;
  value: number | null;
  observationDate: string | null;
  delta5d: number | null;
  delta20d: number | null;
  direction: "rising" | "falling" | "flat" | "unavailable";
}
export interface FredSnapshot {
  status: SnapshotStatus;
  fetchedAt: string | null;
  series: Record<MacroSeriesId, MacroPoint>;
  warning?: string;
}
export type ExecutionGrade = "A" | "B" | "C" | "D" | "F";
export type ForensicTag =
  | "CLEAN_TREND_TP"
  | "CLEAN_REVERSAL_SL"
  | "LATE_EXHAUSTION"
  | "NEWS_WHIPSAW"
  | "SPREAD_SLIPPAGE_LEAK"
  | "CHOP_FAKEOUT";

export interface TradeJournalEntry {
  schemaVersion: 1;
  eventId: string;
  timestamp: string;
  symbol: string;
  strategyId: string;
  strategyName: string;
  side: "BUY" | "SELL" | "LONG" | "SHORT" | string;
  entry: number | null;
  exit: number | null;
  sl: number | null;
  tp: number | null;
  signalPrice: number | null;
  fillPrice: number | null;
  signalVsFillSlippage: number | null;
  spread: number | null;
  realizedR: number | null;
  regime: string | null;
  volatility: string | null;
  upcomingNews: string[];
  macro: FredSnapshot;
  profit: number | null;
  commission: number | null;
  swap: number | null;
}

export interface GeminiReview {
  setupSummary: string;
  executionGrade: ExecutionGrade;
  forensicTag: ForensicTag;
  shadowCounterfactual: string;
  reviewedAt: string;
}
export interface JournalLine {
  kind: "trade" | "review";
  eventId: string;
  entry?: TradeJournalEntry;
  review?: GeminiReview;
}
