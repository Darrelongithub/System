/**
 * MT5 Live Trading Engine & Automation Processor
 */

import type { ResultRow } from "@/lib/analyzer/types";
import { checkNewsBlackout, newsManager } from "./news-filter";
import {
  DEFAULT_MT5_CONFIG,
  DEFAULT_MT5_CREDENTIALS,
  type MT5AccountCredentials,
  type MT5AccountInfo,
  type MT5AutoTradeConfig,
  type MT5OrderRequest,
  type MT5OrderResult,
  type MT5Position,
  type MT5TradeLogEntry,
} from "./types";

/**
 * Standard contract sizes for financial instruments.
 */
function getContractSize(symbol: string): number {
  const s = symbol.toUpperCase().replace(/[^A-Z]/g, "");
  if (s.includes("XAU")) return 100; // 1 lot Gold = 100 oz
  if (s.includes("XAG")) return 5000; // 1 lot Silver = 5000 oz
  if (s.includes("BTC") || s.includes("ETH") || s.includes("SOL")) return 1; // 1 lot Crypto = 1 coin
  if (s.includes("USO") || s.includes("BCO")) return 1000; // 1 lot Oil = 1000 barrels
  return 100000; // Standard Forex = 100,000 units
}

/**
 * Calculate dynamic lot size from Account Equity, Risk % and Stop Loss distance.
 */
export function calculateLotSize(params: {
  equity: number;
  riskPct: number;
  entry: number;
  sl: number;
  symbol: string;
  maxRiskAmount?: number;
}): { volume: number; riskAmount: number; slDistance: number } {
  const { equity, riskPct, entry, sl, symbol, maxRiskAmount } = params;
  const slDistance = Math.abs(entry - sl);
  if (slDistance <= 0 || equity <= 0) {
    return { volume: 0.01, riskAmount: 0, slDistance: 0 };
  }

  // Calculate cash risk
  let riskAmount = equity * (riskPct / 100);
  if (maxRiskAmount && maxRiskAmount > 0) {
    riskAmount = Math.min(riskAmount, maxRiskAmount);
  }

  const contractSize = getContractSize(symbol);
  // Risk per 1.0 lot = slDistance * contractSize (in quote currency)
  const riskPerLot = slDistance * contractSize;

  let rawLots = riskPerLot > 0 ? riskAmount / riskPerLot : 0.01;

  // Clamp & step to 0.01
  rawLots = Math.max(0.01, Math.min(100.0, rawLots));
  const volume = Number(rawLots.toFixed(2));

  return { volume, riskAmount, slDistance };
}

/**
 * Global In-Memory MT5 Engine for Live Session
 */
class MT5TradingEngine {
  private credentials: MT5AccountCredentials = { ...DEFAULT_MT5_CREDENTIALS };
  private config: MT5AutoTradeConfig = { ...DEFAULT_MT5_CONFIG };
  private account: MT5AccountInfo = {
    login: "50198421",
    name: "Live Auto-Trader",
    server: "MetaQuotes-Demo",
    currency: "USD",
    balance: 10000.0,
    equity: 10000.0,
    margin: 0.0,
    freeMargin: 10000.0,
    marginLevel: 0.0,
    leverage: 100,
    connected: true,
    tradeAllowed: true,
    lastUpdated: new Date().toISOString(),
    pingMs: 14,
  };
  private positions: MT5Position[] = [];
  private closedPositions: MT5Position[] = [];
  private logs: MT5TradeLogEntry[] = [];
  private pendingCommands: MT5OrderRequest[] = [];
  private executedSignals = new Set<string>();
  private ticketCounter = 1048200;

  constructor() {
    this.addLog("INFO", "SYSTEM", "MT5 Trading Automation Engine initialized.");
  }

  public getCredentials(): MT5AccountCredentials {
    return { ...this.credentials };
  }

  public setCredentials(creds: Partial<MT5AccountCredentials>) {
    this.credentials = { ...this.credentials, ...creds };
    this.account.login = this.credentials.login || "50198421";
    this.account.server = this.credentials.server || "MetaQuotes-Demo";
    this.account.lastUpdated = new Date().toISOString();
    this.addLog(
      "INFO",
      "SYSTEM",
      `MT5 Account credentials updated: ${this.credentials.login} on ${this.credentials.server} (${this.credentials.bridgeMode})`,
    );
  }

  public getConfig(): MT5AutoTradeConfig {
    return { ...this.config };
  }

  public setConfig(config: Partial<MT5AutoTradeConfig>) {
    this.config = { ...this.config, ...config };
    this.addLog(
      "INFO",
      "SYSTEM",
      `Automation configuration updated: Auto-Trading is now ${this.config.enabled ? "ENABLED 🟢" : "DISABLED 🔴"}`,
    );
  }

  public getAccountInfo(): MT5AccountInfo {
    this.updateEquity();
    return { ...this.account };
  }

  public getPositions(): MT5Position[] {
    return [...this.positions];
  }

  public getClosedPositions(): MT5Position[] {
    return [...this.closedPositions];
  }

  public getLogs(): MT5TradeLogEntry[] {
    return [...this.logs];
  }

  public getPendingCommands(): MT5OrderRequest[] {
    return [...this.pendingCommands];
  }

  public clearPendingCommands() {
    this.pendingCommands = [];
  }

  public addLog(
    type: MT5TradeLogEntry["type"],
    symbol: string,
    message: string,
    strategy?: string,
    details?: Record<string, unknown>,
  ) {
    const entry: MT5TradeLogEntry = {
      id: "log-" + Math.random().toString(36).slice(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      symbol,
      strategy,
      message,
      details,
    };
    this.logs.unshift(entry);
    if (this.logs.length > 500) this.logs.pop();
  }

  /**
   * Evaluates a live strategy PASS result and executes the trade if eligible.
   */
  public handleLiveStrategySignal(signal: ResultRow, symbol: string): MT5OrderResult | null {
    if (signal.result !== "PASS") return null;
    if (!signal.entry || !signal.sl || !signal.tp || !signal.side) return null;

    // Check master auto-trade switch
    if (!this.config.enabled) {
      this.addLog(
        "SIGNAL",
        symbol,
        `[SIGNAL DETECTED] ${signal.strategy} ${signal.side.toUpperCase()} @ ${signal.entry} (Auto-trading is OFF)`,
        signal.strategy,
      );
      return null;
    }

    // Check strategy whitelist
    if (this.config.strategies.length > 0 && !this.config.strategies.includes(signal.strategyId)) {
      this.addLog(
        "INFO",
        symbol,
        `Signal ignored: ${signal.strategy} is not enabled in automation settings.`,
        signal.strategy,
      );
      return null;
    }

    // Check Economic News & Red Folder Blackout Filter
    if (this.config.newsFilterEnabled) {
      const blackout = checkNewsBlackout({
        symbol,
        config: {
          enabled: this.config.newsFilterEnabled,
          filterHighImpact: this.config.newsFilterHighImpact,
          filterMediumImpact: this.config.newsFilterMediumImpact,
          minutesBefore: this.config.newsFilterMinutesBefore,
          minutesAfter: this.config.newsFilterMinutesAfter,
          affectedCurrenciesOnly: true,
        },
        events: newsManager.getEvents(),
      });

      if (blackout.isBlocked) {
        this.addLog(
          "WARN",
          symbol,
          `[NEWS LOCKOUT 🔴] ${signal.strategy} ${signal.side?.toUpperCase()} rejected: ${blackout.reason}`,
          signal.strategy,
        );
        return null;
      }
    }

    // Check RR threshold
    const rr = signal.rr ?? Math.abs(signal.tp - signal.entry) / Math.abs(signal.entry - signal.sl);
    if (rr < this.config.minRr) {
      this.addLog(
        "WARN",
        symbol,
        `Signal rejected: RR ${rr.toFixed(2)} is below minimum configured ${this.config.minRr}R.`,
        signal.strategy,
      );
      return null;
    }

    // Deduplication check: timestamp + strategyId + side + symbol
    const signalKey = `${symbol}|${signal.strategyId}|${signal.side}|${signal.datetime}`;
    if (this.executedSignals.has(signalKey)) {
      return null; // Already executed
    }

    // Max open positions check
    if (this.positions.length >= this.config.maxOpenPositions) {
      this.addLog(
        "WARN",
        symbol,
        `Order rejected: Max open positions limit reached (${this.positions.length}/${this.config.maxOpenPositions}).`,
        signal.strategy,
      );
      return null;
    }

    // Calculate volume / lot size
    let volume = this.config.fixedLot;
    if (this.config.sizingMode === "risk_pct") {
      const sizing = calculateLotSize({
        equity: this.account.equity,
        riskPct: this.config.riskPct,
        entry: signal.entry,
        sl: signal.sl,
        symbol,
        maxRiskAmount: this.config.maxRiskAmount,
      });
      volume = sizing.volume;
    }

    // Determine order type
    const orderType = signal.side === "long" ? "BUY" : "SELL";

    const orderRequest: MT5OrderRequest = {
      id: "req-" + Math.random().toString(36).slice(2, 9),
      symbol,
      strategyId: signal.strategyId,
      strategyName: signal.strategy,
      type: orderType,
      volume,
      price: signal.entry,
      sl: this.config.autoSl ? signal.sl : undefined,
      tp: this.config.autoTp ? signal.tp : undefined,
      comment: `${this.config.commentPrefix}-${signal.strategyId.slice(0, 8)}`,
      magic: this.config.magicNumber,
      deviation: this.config.maxSlippagePoints,
    };

    // Mark as executed
    this.executedSignals.add(signalKey);

    // Place the order
    return this.placeOrder(orderRequest);
  }

  /**
   * Places an order directly into the engine / queue.
   */
  public placeOrder(req: MT5OrderRequest): MT5OrderResult {
    const timestamp = new Date().toISOString();
    this.addLog(
      "ORDER_SENT",
      req.symbol,
      `Sending MT5 ${req.type} ${req.volume} lots on ${req.symbol} @ ${req.price ?? "market"} | SL: ${req.sl ?? "none"} | TP: ${req.tp ?? "none"} [${req.strategyName}]`,
      req.strategyName,
      { req },
    );

    // If using MQL5 EA Bridge, queue the command for the EA to fetch
    if (this.credentials.bridgeMode === "mql5_ea") {
      this.pendingCommands.push(req);
    }

    // Immediate simulated / broker execution
    const ticket = ++this.ticketCounter;
    const entryPrice = req.price ?? 2650.0;
    const newPosition: MT5Position = {
      id: "pos-" + ticket,
      ticket,
      symbol: req.symbol,
      strategyId: req.strategyId,
      strategyName: req.strategyName,
      type:
        req.type === "BUY" || req.type === "BUY_LIMIT" || req.type === "BUY_STOP" ? "BUY" : "SELL",
      volume: req.volume,
      openPrice: entryPrice,
      currentPrice: entryPrice,
      sl: req.sl ?? 0,
      tp: req.tp ?? 0,
      profit: 0.0,
      swap: 0.0,
      commission: -Number((req.volume * 3.5).toFixed(2)),
      comment: req.comment ?? "SFP Auto",
      magic: req.magic ?? this.config.magicNumber,
      openTime: new Date().toLocaleTimeString(),
    };

    this.positions.push(newPosition);
    this.updateEquity();

    this.addLog(
      "ORDER_FILLED",
      req.symbol,
      `✅ ORDER EXECUTED! Ticket #${ticket} | ${newPosition.type} ${newPosition.volume} ${req.symbol} @ ${entryPrice.toFixed(2)} | SL: ${req.sl?.toFixed(2) ?? "—"} | TP: ${req.tp?.toFixed(2) ?? "—"}`,
      req.strategyName,
      { ticket, position: newPosition },
    );

    return {
      ok: true,
      ticket,
      price: entryPrice,
      volume: req.volume,
      timestamp,
      retcode: 10009, // TRADE_RETCODE_DONE
    };
  }

  /**
   * Closes an active position by ticket.
   */
  public closePosition(ticket: number): boolean {
    const index = this.positions.findIndex((p) => p.ticket === ticket);
    if (index === -1) return false;

    const pos = this.positions[index]!;
    this.positions.splice(index, 1);

    // Book closed trade
    this.account.balance += pos.profit + pos.commission + pos.swap;
    this.closedPositions.unshift({
      ...pos,
      openTime: `${pos.openTime} → ${new Date().toLocaleTimeString()}`,
    });
    if (this.closedPositions.length > 100) this.closedPositions.pop();

    this.updateEquity();

    this.addLog(
      "POSITION_CLOSED",
      pos.symbol,
      `🔒 Position #${ticket} CLOSED | Profit: $${pos.profit.toFixed(2)} | Balance: $${this.account.balance.toFixed(2)}`,
      pos.strategyName,
    );

    return true;
  }

  /**
   * Synchronizes telemetry from MQL5 EA WebRequest
   */
  public syncFromEa(telemetry: {
    login?: string;
    server?: string;
    balance?: number;
    equity?: number;
    margin?: number;
    freeMargin?: number;
    leverage?: number;
    currency?: string;
    positions?: Array<{
      ticket: number;
      symbol: string;
      type: "BUY" | "SELL";
      volume: number;
      openPrice: number;
      currentPrice: number;
      sl: number;
      tp: number;
      profit: number;
      comment: string;
    }>;
  }) {
    if (telemetry.login) this.account.login = telemetry.login;
    if (telemetry.server) this.account.server = telemetry.server;
    if (telemetry.currency) this.account.currency = telemetry.currency;
    if (typeof telemetry.balance === "number") this.account.balance = telemetry.balance;
    if (typeof telemetry.equity === "number") this.account.equity = telemetry.equity;
    if (typeof telemetry.margin === "number") this.account.margin = telemetry.margin;
    if (typeof telemetry.freeMargin === "number") this.account.freeMargin = telemetry.freeMargin;
    if (typeof telemetry.leverage === "number") this.account.leverage = telemetry.leverage;

    this.account.connected = true;
    this.account.lastUpdated = new Date().toISOString();

    if (Array.isArray(telemetry.positions)) {
      this.positions = telemetry.positions.map((p) => ({
        id: "pos-" + p.ticket,
        ticket: p.ticket,
        symbol: p.symbol,
        strategyId: "ea-synced",
        strategyName: p.comment || "MT5 Position",
        type: p.type,
        volume: p.volume,
        openPrice: p.openPrice,
        currentPrice: p.currentPrice,
        sl: p.sl,
        tp: p.tp,
        profit: p.profit,
        swap: 0,
        commission: 0,
        comment: p.comment,
        magic: this.config.magicNumber,
        openTime: new Date().toLocaleTimeString(),
      }));
    }
  }

  /**
   * Simulates price updates on open positions and checks SL / TP hits.
   */
  public updateMarketPrice(symbol: string, currentPrice: number) {
    const contractSize = getContractSize(symbol);
    for (let i = this.positions.length - 1; i >= 0; i--) {
      const pos = this.positions[i]!;
      if (pos.symbol !== symbol) continue;

      pos.currentPrice = currentPrice;
      const priceDiff =
        pos.type === "BUY" ? currentPrice - pos.openPrice : pos.openPrice - currentPrice;
      pos.profit = Number((priceDiff * pos.volume * contractSize).toFixed(2));

      // Check Take Profit
      if (pos.tp > 0) {
        const tpHit = pos.type === "BUY" ? currentPrice >= pos.tp : currentPrice <= pos.tp;
        if (tpHit) {
          this.addLog(
            "TP_HIT",
            pos.symbol,
            `🎯 TAKE PROFIT HIT! Position #${pos.ticket} closed @ ${currentPrice} (TP: ${pos.tp}) | Gain: +$${pos.profit.toFixed(2)}`,
            pos.strategyName,
          );
          this.closePosition(pos.ticket);
          continue;
        }
      }

      // Check Stop Loss
      if (pos.sl > 0) {
        const slHit = pos.type === "BUY" ? currentPrice <= pos.sl : currentPrice >= pos.sl;
        if (slHit) {
          this.addLog(
            "SL_HIT",
            pos.symbol,
            `🛑 STOP LOSS HIT! Position #${pos.ticket} closed @ ${currentPrice} (SL: ${pos.sl}) | Loss: -$${Math.abs(pos.profit).toFixed(2)}`,
            pos.strategyName,
          );
          this.closePosition(pos.ticket);
          continue;
        }
      }
    }
    this.updateEquity();
  }

  private updateEquity() {
    let totalFloatingProfit = 0;
    let totalMargin = 0;

    for (const pos of this.positions) {
      totalFloatingProfit += pos.profit + pos.commission + pos.swap;
      totalMargin +=
        (pos.volume * getContractSize(pos.symbol) * pos.openPrice) / (this.account.leverage || 100);
    }

    this.account.margin = Number(totalMargin.toFixed(2));
    this.account.equity = Number((this.account.balance + totalFloatingProfit).toFixed(2));
    this.account.freeMargin = Number((this.account.equity - this.account.margin).toFixed(2));
    this.account.marginLevel =
      this.account.margin > 0 ? (this.account.equity / this.account.margin) * 100 : 0;
    this.account.lastUpdated = new Date().toISOString();
  }
}

// Global engine singleton
export const mt5Engine = new MT5TradingEngine();
