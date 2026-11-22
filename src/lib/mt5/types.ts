/**
 * MetaTrader 5 (MT5) Automation & Live Trading Types
 */

import { V2_STRATEGY_IDS } from "@/lib/analyzer/strategies/v2-regime-bots";

export type MT5BridgeMode = "mql5_ea" | "direct_rest" | "metaapi" | "simulated";

export type MT5OrderType = "BUY" | "SELL" | "BUY_LIMIT" | "SELL_LIMIT" | "BUY_STOP" | "SELL_STOP";

export type MT5OrderStatus = "PENDING" | "PLACED" | "FILLED" | "CLOSED" | "REJECTED" | "CANCELLED";

export type SizingMode = "fixed" | "risk_pct" | "risk_amount";

export interface MT5AccountCredentials {
  login: string;
  password?: string;
  server: string;
  bridgeMode: MT5BridgeMode;
  apiEndpoint?: string;
  apiToken?: string;
  isDemo: boolean;
}

export interface MT5AccountInfo {
  login: string;
  name: string;
  server: string;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  leverage: number;
  connected: boolean;
  tradeAllowed: boolean;
  lastUpdated: string;
  pingMs?: number;
}

export interface MT5Position {
  id: string;
  ticket: number;
  symbol: string;
  strategyId: string;
  strategyName: string;
  type: "BUY" | "SELL";
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  commission: number;
  comment: string;
  magic: number;
  openTime: string;
  pips?: number;
  /**
   * Set when the position was opened OPTIMISTICALLY against the Bridge EA
   * (before the broker could have confirmed it in a telemetry sync). The
   * sync-preserve logic in the engine keys off this to keep a just-opened
   * position from being wiped by a heartbeat that has not yet seen it.
   */
  createdAtMs?: number;
  initialRiskCash?: number;
  commandId?: string;
}

export interface MT5OrderRequest {
  id?: string;
  /**
   * Bridge wire protocol: the EA dispatches each command to the broker.
   * "OPEN" carries a broker order; "CLOSE" closes the broker position by ticket.
   * Defaults to "OPEN" (legacy callers that build requests without an action).
   */
  action?: "OPEN" | "CLOSE" | "MODIFY";
  createdAtMs?: number;
  /** Broker ticket — the CLOSE marker the EA reads to close the position. */
  ticket?: number;
  symbol: string;
  strategyId: string;
  strategyName: string;
  type: MT5OrderType;
  volume: number;
  price?: number;
  sl?: number;
  tp?: number;
  comment?: string;
  magic?: number;
  deviation?: number;
}

export interface MT5CommandOutcome {
  id: string;
  status: "FILLED" | "REJECTED" | "UNKNOWN";
  ticket?: number;
  price?: number;
  retcode?: number;
  error?: string;
}

export interface MT5OrderResult {
  ok: boolean;
  ticket?: number;
  error?: string;
  price?: number;
  volume?: number;
  timestamp: string;
  retcode?: number;
}

export interface MT5TradeLogEntry {
  id: string;
  timestamp: string;
  type:
    | "SIGNAL"
    | "ORDER_SENT"
    | "ORDER_FILLED"
    | "ORDER_REJECTED"
    | "TP_HIT"
    | "SL_HIT"
    | "POSITION_CLOSED"
    | "ERROR"
    | "INFO"
    | "WARN";
  symbol: string;
  strategy?: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface MT5AutoTradeConfig {
  enabled: boolean;
  symbols: string[];
  strategies: string[];
  autoEntry: boolean;
  autoSl: boolean;
  autoTp: boolean;
  sizingMode: SizingMode;
  fixedLot: number;
  riskPct: number;
  maxRiskAmount: number;
  maxOpenPositions: number;
  magicNumber: number;
  commentPrefix: string;
  minRr: number;
  maxSlippagePoints: number;
  soundAlerts: boolean;
  pollIntervalSeconds: number;
  // News & Red Folder Protection
  newsFilterEnabled: boolean;
  newsFilterHighImpact: boolean;
  newsFilterMediumImpact: boolean;
  newsFilterMinutesBefore: number;
  newsFilterMinutesAfter: number;
  newsFilterCloseOnNews: boolean;
  preNewsAction: "none" | "breakeven_if_profit" | "close_all";
  maxDailyLossPct: number;
  maxDailyLossR: number;
  flattenOnDailyLimit: boolean;
  maxTotalDrawdownPct: number;
  consecutiveLossLimit: number;
  consecutiveLossCooldownHours: number;
  maxSpreadUsd: number;
  rolloverEnabled: boolean;
  rolloverStartMinuteEat: number;
  rolloverEndMinuteEat: number;
  fridayCloseEnabled: boolean;
  fridayCloseHourEat: number;
  fridayCloseMinuteEat: number;
  fridayFlatten: boolean;
}

import type { EconomicNewsEvent } from "./news-filter";

export interface MT5State {
  account: MT5AccountInfo | null;
  credentials: MT5AccountCredentials;
  config: MT5AutoTradeConfig;
  positions: MT5Position[];
  closedPositions: MT5Position[];
  logs: MT5TradeLogEntry[];
  lastSignalCheck: string | null;
  isPolling: boolean;
  pendingCommands: MT5OrderRequest[];
  upcomingNews: EconomicNewsEvent[];
}

export const DEFAULT_MT5_CREDENTIALS: MT5AccountCredentials = {
  login: "50198421",
  server: "MetaQuotes-Demo",
  bridgeMode: "simulated",
  isDemo: true,
  apiEndpoint: "",
  apiToken: "sfp-bridge-token-" + Math.random().toString(36).slice(2, 8),
};

export const DEFAULT_MT5_CONFIG: MT5AutoTradeConfig = {
  enabled: false,
  symbols: ["XAU/USD"],
  strategies: [...V2_STRATEGY_IDS],
  autoEntry: true,
  autoSl: true,
  autoTp: true,
  sizingMode: "risk_pct",
  fixedLot: 0.1,
  riskPct: 0.35,
  maxRiskAmount: 0,
  maxOpenPositions: 3,
  magicNumber: 992200,
  commentPrefix: "SFP",
  minRr: 2.0,
  maxSlippagePoints: 20,
  soundAlerts: true,
  pollIntervalSeconds: 15,
  newsFilterEnabled: true,
  newsFilterHighImpact: true,
  newsFilterMediumImpact: false,
  newsFilterMinutesBefore: 30,
  newsFilterMinutesAfter: 30,
  newsFilterCloseOnNews: false,
  preNewsAction: "none",
  maxDailyLossPct: 2,
  maxDailyLossR: -3,
  flattenOnDailyLimit: true,
  maxTotalDrawdownPct: 6,
  consecutiveLossLimit: 4,
  consecutiveLossCooldownHours: 4,
  maxSpreadUsd: 0.5,
  rolloverEnabled: true,
  rolloverStartMinuteEat: 0,
  rolloverEndMinuteEat: 65,
  fridayCloseEnabled: true,
  fridayCloseHourEat: 23,
  fridayCloseMinuteEat: 30,
  fridayFlatten: false,
};

export const COMMON_MT5_SERVERS = [
  { label: "MetaQuotes Demo (MetaQuotes-Demo)", value: "MetaQuotes-Demo" },
  { label: "IC Markets Demo (ICMarketsSC-Demo)", value: "ICMarketsSC-Demo" },
  { label: "IC Markets Live (ICMarketsSC-Live)", value: "ICMarketsSC-Live" },
  { label: "Exness Real (Exness-Real)", value: "Exness-Real" },
  { label: "Exness Trial (Exness-Trial)", value: "Exness-Trial" },
  { label: "FTMO Server (FTMO-Server)", value: "FTMO-Server" },
  { label: "FTMO Demo (FTMO-Demo)", value: "FTMO-Demo" },
  { label: "FundingPips Demo (FundingPips-Demo)", value: "FundingPips-Demo" },
  { label: "Pepperstone Demo (Pepperstone-Demo)", value: "Pepperstone-Demo" },
  { label: "Pepperstone Live (Pepperstone-Live)", value: "Pepperstone-Live" },
  { label: "Forex.com Live (Forex.com-Live)", value: "Forex.com-Live" },
  { label: "OANDA MT5 Live (OANDA-Live-1)", value: "OANDA-Live-1" },
  { label: "XM Global Real (XMGlobal-Real)", value: "XMGlobal-Real" },
];
