export type Trend = "bullish" | "bearish" | "ranging";

export interface HtfTrendContext {
  h1: Trend;
  h4: Trend;
  d1: Trend;
}

export type ResultStatus = "PASS" | "FAIL";

export interface Metadata {
  data_age: string;
  spread_convention: string;
  atr_method: string;
  similar_swing_selection_rule: string;
  /** Optional: documents how the generator marks section/day divider lines. */
  section_marker_convention?: string | undefined;
  /** Optional exact minimum tick used by Turtle System 1. */
  turtle_tick_size?: number | string | undefined;
}

export const METADATA_FIELDS = [
  "data_age",
  "spread_convention",
  "atr_method",
  "similar_swing_selection_rule",
] as const;

export interface Candle {
  index: number;
  datetime: string;
  open?: number | undefined;
  high?: number | undefined;
  low?: number | undefined;
  close?: number | undefined;
  direction?: string | undefined;
  body?: number | undefined;
  upperWick?: number | undefined;
  lowerWick?: number | undefined;
  range?: number | undefined;
  bodyPercentOfRange?: number | undefined;
  upperWickPct?: number | undefined;
  lowerWickPct?: number | undefined;
  displacement?: string | undefined;
  isReliable?: boolean | undefined;
  localAvgRange?: number | undefined;
  session?: string | undefined;
  atr30m?: number | undefined;
  similarSwingRetracePct?: number | undefined;
  similarSwingContinuedPct?: number | undefined;
  similarSwingRefs: string[];
  unresolvedRefs: string[];
  swingInvalidated?: boolean | undefined;
  reliableStreakLength?: number | undefined;
  trend: Trend;
  /** Completed HTF context derived from the 30m source, available at this row. */
  htfTrend: HtfTrendContext;
  invalid?: string | undefined;
  raw: Record<string, string>;
}

export interface Outcome {
  result: ResultStatus;
  reason: string;
  entry?: number | undefined;
  sl?: number | undefined;
  tp?: number | undefined;
  /** Order semantics for downstream simulation; omitted means diagnostic/level-only. */
  orderType?: "market" | "stop" | "limit" | undefined;
  turtleSystem?: "S1" | "S2" | undefined;
  side?: "long" | "short" | undefined;
  /** Full human-readable evidence for every trigger. */
  detail?: string[] | undefined;
  /**
   * De-dupe slot key proposed by the strategy. Committed via consume() only after
   * spread/RR validation succeeds in runAnalysis — never on RR-rejected candidates.
   */
  consumeKey?: string | undefined;
}

export interface AnalysisContext {
  meta: Metadata;
  candles: Candle[];
  byDatetime: Map<string, Candle>;
  ema20: (number | undefined)[];
  ema50: (number | undefined)[];
  ema200: (number | undefined)[];
  blocks: import("./indicators").SessionBlock[];
  spread: number;
  /** ATR(14) per bar — every threshold in the specs is ATR-relative. */
  atr: (number | undefined)[];
  /** Fractal pivot highs/lows with no-lookahead confirmation indexes. */
  pivotHighs: import("./pivots").Pivot[];
  pivotLows: import("./pivots").Pivot[];
  /** Daily (EAT) aggregates used for pivot levels. */
  daily: import("./daily").DayAggregate[];
  /** Asian-session range per EAT day. */
  asian: Map<string, import("./daily").RangeWindow>;
  /** Opening range per `${day}|${session}`. */
  openingRanges: Map<string, import("./daily").OpeningRange>;
  htfTrendAt: (index: number) => HtfTrendContext;
  enableHtfDirectionFilter: boolean;
  /**
   * Levels already used up by a strategy (swept swing, mitigated order block,
   * filled FVG...). Keyed `${strategyId}` -> set of level keys, so the same
   * level never re-triggers the same pattern.
   */
  consumed: Map<string, Set<string>>;
  /** Per-analysis mutable state for source systems that require trade-path tracking. */
  state: Map<string, unknown>;
}

export type StrategyKind = "trade" | "context";

export interface StrategyCheck {
  id: string;
  name: string;
  run: (ctx: AnalysisContext, i: number) => Outcome;
  kind?: StrategyKind;
}

export type SetupStatus = "PENDING" | "FILLED" | "RESOLVED" | "EXPIRED";

export interface ResultRow {
  strategyId: string;
  strategy: string;
  index: number;
  datetime: string;
  result: ResultStatus;
  reason: string;
  trend: Trend;
  /** H1/H4/D1 trend context at the setup candle. */
  htfTrend: HtfTrendContext;
  entry?: number | undefined;
  sl?: number | undefined;
  tp?: number | undefined;
  orderType?: "market" | "stop" | "limit" | undefined;
  rr?: number | undefined;
  side?: "long" | "short" | undefined;
  turtleSystem?: "S1" | "S2" | undefined;
  setupStatus?: SetupStatus | undefined;
  statusNote?: string | undefined;
  candlesSinceTrigger?: number | undefined;
  /** Machine-readable resolution of the trade path (set once forward candles exist). */
  outcome?: "TP" | "SL" | "OPEN" | "NO_FILL" | undefined;
  exitDatetime?: string | undefined;
  exitPrice?: number | undefined;
  /** Realised R multiple: +rr on a target hit, -1 on a stop, partial for trailing exits. */
  rMultiple?: number | undefined;
  /** Full per-trigger reasoning, including requirements, ATR, SL/TP rationale and resolution. */
  detail?: string[] | undefined;
}

export interface OverlapEntry {
  datetime: string;
  strategies: string[];
}

export interface ContextEvent {
  strategyId: string;
  strategy: string;
  datetime: string;
  side?: string | undefined;
  message: string;
}

export interface Analysis {
  meta: Metadata;
  spread: number;
  totalRows: number;
  analyzedRows: number;
  invalidRows: number;
  invalidRowList: { datetime: string; reason: string }[];
  results: ResultRow[];
  passing: ResultRow[];
  tradePasses: ResultRow[];
  contextPasses: ResultRow[];
  contextEvents: ContextEvent[];
  contextLog: string;
  perStrategy: {
    strategyId: string;
    strategy: string;
    passCount: number;
    failCount: number;
    failReasons: { reason: string; count: number }[];
  }[];
  overlaps: OverlapEntry[];
  lastRowDatetime: string;
  live: ResultRow[];
  historical: ResultRow[];
}
