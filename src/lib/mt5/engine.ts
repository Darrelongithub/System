/**
 * MT5 Live Trading Engine & Automation Processor
 */

import type { ResultRow } from "@/lib/analyzer/types";
import { checkNewsBlackout, newsManager, doesNewsAffectSymbol } from "./news-filter";
import { eatParts, entryTimeBlock, observeEquity, type RiskSnapshot } from "./risk";
import { drawdownBrake, stackMultiplier, tradeRiskMetrics } from "./crash-guard";
import {
  DEFAULT_MT5_CONFIG,
  DEFAULT_MT5_CREDENTIALS,
  type MT5AccountCredentials,
  type MT5AccountInfo,
  type MT5AutoTradeConfig,
  type MT5OrderRequest,
  type MT5OrderResult,
  type MT5CommandOutcome,
  type MT5Position,
  type MT5TradeLogEntry,
} from "./types";

/** Stable signal identity lets the terminal deduplicate re-analysis after server restart. */
function stableSignalId(value: string): string {
  let a = 2166136261,
    b = 2246822519;
  for (let i = 0; i < value.length; i++) {
    a = Math.imul(a ^ value.charCodeAt(i), 16777619);
    b = Math.imul(b ^ value.charCodeAt(i), 3266489917);
  }
  return `sig-${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}`;
}

/**
 * Standard contract sizes for financial instruments.
 */
function getContractSize(symbol: string): number {
  const s = symbol.toUpperCase().replace(/[^A-Z]/g, "");
  if (s.includes("XAU") || s.includes("GOLD")) return 100; // 1 lot Gold = 100 oz
  if (s.includes("XAG")) return 5000; // 1 lot Silver = 5000 oz
  if (s.includes("BTC") || s.includes("ETH") || s.includes("SOL")) return 1; // 1 lot Crypto = 1 coin
  if (s.includes("USO") || s.includes("BCO")) return 1000; // 1 lot Oil = 1000 barrels
  return 100000; // Standard Forex = 100,000 units
}

/**
 * Broker-side symbol aliases ("XAU/USD", "XAUUSD.pro", "XAUUSD-m", ...) must
 * all reduce to the same canonical key so the anti-hedge, the 3-stack cap,
 * the dedupe key and telemetry sync all compare like-for-like across the
 * telemetry boundary.
 *
 * Steps: trim, uppercase, strip broker suffixes (.pro, .raw, .ecn, .m, _i),
 * strip separators, then strip a trailing m/c on a 6-letter pair
 * (e.g. XAUUSDm → XAUUSD).
 */
export function canonicalSymbol(sym: string): string {
  let s = String(sym ?? "")
    .trim()
    .toUpperCase();
  // Broker suffixes (case-insensitive after the uppercase)
  s = s.replace(/\.(PRO|RAW|ECN|M)$/, "");
  s = s.replace(/_I$/, "");
  // Separators: /, \, -, _, spaces
  s = s.replace(/[\s/\\_-]/g, "");
  // Trailing lowercase m/c on a 6-letter pair (e.g. XAUUSDm, GBPUSDc)
  if (/^[A-Z0-9]{6}[MC]$/.test(s)) {
    s = s.slice(0, 6);
  }
  return s === "GOLD" ? "XAUUSD" : s;
}

/** Cash risk implied by the (possibly min-lot-rounded) volume over the SL distance. */
function cashRiskFor(symbol: string, volume: number, entry: number, sl: number): number {
  return volume * Math.abs(entry - sl) * getContractSize(symbol);
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
  const volume = Math.floor(rawLots * 100 + 1e-9) / 100;

  return { volume, riskAmount, slDistance };
}

export const OPEN_COMMAND_TTL_MS = 90_000;
export interface MT5RuntimeSnapshot {
  version: 1;
  config: MT5AutoTradeConfig;
  identity: Pick<MT5AccountCredentials, "login" | "server" | "bridgeMode" | "isDemo" | "apiToken">;
  risk: RiskSnapshot | null;
  executedSignals: string[];
  pendingCommands: MT5OrderRequest[];
  peakEquity?: number;
  closedRiskSamples?: Array<{ id: string; r: number; pnl: number; closedAt: number }>;
  telegramOffset?: number;
  emergencyFlatten?: boolean;
  brokerClosedTradeCount?: number;
}

/**
 * Global In-Memory MT5 Engine for Live Session
 */
export class MT5TradingEngine {
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
  private persistHook: ((snapshot: MT5RuntimeSnapshot) => void) | null = null;
  private persistenceError: string | null = null;
  private risk: RiskSnapshot | null = null;
  private quote: { symbol: string; bid: number; ask: number; at: number } | null = null;
  private brokerRiskRKnown = false;
  private closedRiskIds = new Set<number>();
  private peakEquity = 0;
  private closedRiskSamples: Array<{ id: string; r: number; pnl: number; closedAt: number }> = [];
  private telegramOffset = 0;
  private emergencyFlatten = false;
  private brokerClosedTradeCount = 0;
  private brokerHistoryAvailable = false;
  private notificationSink: ((entry: MT5TradeLogEntry) => void) | null = null;

  constructor() {
    this.addLog("INFO", "SYSTEM", "MT5 Trading Automation Engine initialized.");
  }

  public setPersistence(hook: (snapshot: MT5RuntimeSnapshot) => void) {
    this.persistHook = hook;
  }
  public exportRuntimeState(): MT5RuntimeSnapshot {
    const { login, server, bridgeMode, isDemo, apiToken } = this.credentials;
    return {
      version: 1,
      config: { ...this.config },
      identity: { login, server, bridgeMode, isDemo, apiToken },
      risk: this.risk ? { ...this.risk } : null,
      executedSignals: [...this.executedSignals].slice(-10000),
      pendingCommands: this.pendingCommands.map((c) => ({ ...c })),
      peakEquity: this.peakEquity,
      closedRiskSamples: this.closedRiskSamples.map((x) => ({ ...x })),
      telegramOffset: this.telegramOffset,
      emergencyFlatten: this.emergencyFlatten,
      brokerClosedTradeCount: this.brokerClosedTradeCount,
    };
  }
  public restoreRuntimeState(snapshot: MT5RuntimeSnapshot) {
    if (
      !snapshot ||
      snapshot.version !== 1 ||
      !snapshot.config ||
      !snapshot.identity ||
      !Array.isArray(snapshot.pendingCommands) ||
      !Array.isArray(snapshot.executedSignals)
    )
      throw new Error("Invalid MT5 runtime state");
    if (
      typeof snapshot.identity.login !== "string" ||
      typeof snapshot.identity.server !== "string" ||
      !["mql5_ea", "simulated", "direct_rest", "metaapi"].includes(snapshot.identity.bridgeMode) ||
      snapshot.executedSignals.some((s) => typeof s !== "string") ||
      snapshot.pendingCommands.some(
        (c) =>
          !c ||
          typeof c.symbol !== "string" ||
          typeof c.id !== "string" ||
          !["OPEN", "CLOSE", "MODIFY"].includes(c.action ?? ""),
      )
    )
      throw new Error("Invalid MT5 runtime identity or command");
    if (
      snapshot.risk &&
      (typeof snapshot.risk.day !== "string" ||
        !Number.isFinite(snapshot.risk.dayBaseline) ||
        snapshot.risk.dayBaseline <= 0 ||
        !Number.isFinite(snapshot.risk.totalBaseline) ||
        snapshot.risk.totalBaseline <= 0 ||
        typeof snapshot.risk.dailyLocked !== "boolean" ||
        typeof snapshot.risk.totalLocked !== "boolean" ||
        !Number.isFinite(snapshot.risk.realizedR) ||
        !Number.isFinite(snapshot.risk.cooldownUntil) ||
        !Number.isFinite(snapshot.risk.lossStreak))
    )
      throw new Error("Invalid MT5 runtime risk state");
    if (
      snapshot.peakEquity !== undefined &&
      (!Number.isFinite(snapshot.peakEquity) || snapshot.peakEquity < 0)
    )
      throw new Error("Invalid peak equity");
    if (
      snapshot.closedRiskSamples !== undefined &&
      (!Array.isArray(snapshot.closedRiskSamples) ||
        snapshot.closedRiskSamples.some(
          (x) =>
            !x ||
            typeof x.id !== "string" ||
            !Number.isFinite(x.r) ||
            !Number.isFinite(x.pnl) ||
            !Number.isFinite(x.closedAt),
        ))
    )
      throw new Error("Invalid closed risk samples");
    this.setConfig(snapshot.config);
    this.credentials = { ...this.credentials, ...snapshot.identity };
    this.account.login = snapshot.identity.login;
    this.account.server = snapshot.identity.server;
    this.account.connected = false;
    this.risk = snapshot.risk;
    this.peakEquity = snapshot.peakEquity ?? snapshot.risk?.totalBaseline ?? 0;
    this.closedRiskSamples = (snapshot.closedRiskSamples ?? []).slice(-500);
    this.telegramOffset =
      Number.isSafeInteger(snapshot.telegramOffset) && snapshot.telegramOffset! >= 0
        ? snapshot.telegramOffset!
        : 0;
    this.brokerClosedTradeCount =
      Number.isSafeInteger(snapshot.brokerClosedTradeCount) && snapshot.brokerClosedTradeCount! >= 0
        ? snapshot.brokerClosedTradeCount!
        : 0;
    this.brokerHistoryAvailable = false;
    this.emergencyFlatten = snapshot.emergencyFlatten === true;
    if (this.emergencyFlatten) this.config.enabled = false;
    if (this.risk?.totalLocked) this.config.enabled = false;
    this.executedSignals = new Set(snapshot.executedSignals.slice(-10000));
    this.pendingCommands = snapshot.pendingCommands;
    this.expireOpenCommands();
  }
  private persist() {
    if (!this.persistHook) return;
    try {
      this.persistHook(this.exportRuntimeState());
      this.persistenceError = null;
    } catch (err) {
      this.persistenceError = String(err);
      this.config.enabled = false;
      console.error("[MT5] Runtime persistence failed; entries disabled", err);
    }
  }
  public failPersistence(error: unknown) {
    this.persistenceError = String(error);
    this.config.enabled = false;
  }
  public expireOpenCommands(now = Date.now()) {
    const expired = this.pendingCommands.filter(
      (c) => c.action === "OPEN" && (!c.createdAtMs || now - c.createdAtMs >= OPEN_COMMAND_TTL_MS),
    );
    if (!expired.length) return;
    const ids = new Set(expired.map((c) => c.id));
    this.pendingCommands = this.pendingCommands.filter((c) => !expired.includes(c));
    this.positions = this.positions.filter((p) => !p.commandId || !ids.has(p.commandId));
    for (const c of expired)
      this.addLog(
        "ORDER_REJECTED",
        c.symbol,
        `OPEN ${c.id} expired before confirmation; reconcile broker state.`,
        c.strategyName,
      );
    this.persist();
  }
  public reconcileOutcomes(outcomes: MT5CommandOutcome[]) {
    for (const outcome of outcomes) {
      if (
        !outcome ||
        typeof outcome.id !== "string" ||
        !["FILLED", "REJECTED", "UNKNOWN"].includes(outcome.status)
      )
        continue;
      const command = this.pendingCommands.find((c) => c.id === outcome.id && c.action === "OPEN");
      if (!command) continue; // replay, or already expired; broker telemetry remains authoritative
      this.pendingCommands = this.pendingCommands.filter((c) => c.id !== outcome.id);
      this.positions = this.positions.filter((p) => p.commandId !== outcome.id);
      if (
        outcome.status === "FILLED" &&
        typeof outcome.ticket === "number" &&
        Number.isSafeInteger(outcome.ticket) &&
        outcome.ticket > 0
      ) {
        this.addLog(
          "ORDER_FILLED",
          command.symbol,
          `Broker confirmed OPEN ${outcome.id} ticket ${outcome.ticket}`,
          command.strategyName,
          { outcome, req: command, spread: this.quote ? this.quote.ask - this.quote.bid : null },
        );
      } else {
        this.addLog(
          outcome.status === "UNKNOWN" ? "WARN" : "ORDER_REJECTED",
          command.symbol,
          `OPEN ${outcome.id}: ${outcome.status} — ${outcome.error || "terminal did not confirm fill"}`,
          command.strategyName,
          { outcome },
        );
      }
    }
    this.persist();
  }

  public matchesBrokerIdentity(login: unknown, server: unknown): boolean {
    return (
      typeof login === "string" &&
      typeof server === "string" &&
      login === this.credentials.login &&
      server === this.credentials.server
    );
  }

  public getCredentials(): MT5AccountCredentials {
    return { ...this.credentials };
  }

  public setCredentials(creds: Partial<MT5AccountCredentials>) {
    // The broker password is never retained. Login happens inside the MT5
    // terminal; a payload that still carries `password` (old localStorage, a
    // direct POST) must not land in memory, logs, or a later sync.
    const { password: _neverStored, ...rest } = creds;
    const changed =
      (rest.login !== undefined && rest.login !== this.credentials.login) ||
      (rest.server !== undefined && rest.server !== this.credentials.server) ||
      (rest.bridgeMode !== undefined && rest.bridgeMode !== this.credentials.bridgeMode);
    if (changed) {
      this.risk = null;
      this.peakEquity = 0;
      this.closedRiskSamples = [];
      this.brokerClosedTradeCount = 0;
      this.brokerHistoryAvailable = false;
      this.quote = null;
      this.brokerRiskRKnown = false;
      this.pendingCommands = [];
      this.positions = [];
      this.account.connected = false;
      this.config.enabled = false;
    }
    this.credentials = { ...this.credentials, ...rest };
    delete this.credentials.password;
    this.account.login = this.credentials.login || "50198421";
    this.account.server = this.credentials.server || "MetaQuotes-Demo";
    this.account.lastUpdated = new Date().toISOString();
    this.addLog(
      "INFO",
      "SYSTEM",
      `MT5 Account credentials updated: ${this.credentials.login} on ${this.credentials.server} (${this.credentials.bridgeMode})`,
    );
    this.persist();
  }

  public getConfig(): MT5AutoTradeConfig {
    return { ...this.config };
  }

  public setConfig(config: Partial<MT5AutoTradeConfig>) {
    const candidate = { ...this.config, ...config };
    if (
      ![candidate.maxDailyLossPct, candidate.maxTotalDrawdownPct, candidate.maxSpreadUsd].every(
        (n) => Number.isFinite(n) && n > 0,
      ) ||
      !Number.isFinite(candidate.maxDailyLossR) ||
      candidate.maxDailyLossR >= 0 ||
      !Number.isFinite(candidate.consecutiveLossLimit) ||
      candidate.consecutiveLossLimit < 1 ||
      !Number.isFinite(candidate.consecutiveLossCooldownHours) ||
      candidate.consecutiveLossCooldownHours <= 0
    )
      throw new Error("Invalid capital protection configuration");
    if (
      ![candidate.rolloverStartMinuteEat, candidate.rolloverEndMinuteEat].every(
        (n) => Number.isInteger(n) && n >= 0 && n < 1440,
      ) ||
      !Number.isInteger(candidate.fridayCloseHourEat) ||
      candidate.fridayCloseHourEat < 0 ||
      candidate.fridayCloseHourEat > 23 ||
      !Number.isInteger(candidate.fridayCloseMinuteEat) ||
      candidate.fridayCloseMinuteEat < 0 ||
      candidate.fridayCloseMinuteEat > 59
    )
      throw new Error("Invalid time protection configuration");
    drawdownBrake(
      100,
      100,
      candidate.maxTotalDrawdownPct,
      candidate.drawdownThresholdsPct,
      candidate.drawdownMultipliers,
    );
    stackMultiplier(0, candidate.stackDecayMultipliers);
    if (!Number.isSafeInteger(candidate.magicNumber) || candidate.magicNumber <= 0)
      throw new Error("A non-zero magic number is required");
    if (this.emergencyFlatten && candidate.enabled)
      throw new Error("Emergency flatten remains active; reconcile positions before resume");
    if (this.risk?.totalLocked && candidate.enabled)
      throw new Error("Total drawdown lock is active");
    this.config = candidate;
    this.persist();
    this.addLog(
      "INFO",
      "SYSTEM",
      `Automation configuration updated: Auto-Trading is now ${this.config.enabled ? "ENABLED 🟢" : "DISABLED 🔴"}`,
    );
  }

  public getAccountInfo(): MT5AccountInfo {
    if (this.credentials.bridgeMode !== "mql5_ea") this.updateEquity();
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

  public getDispatchableCommands(): MT5OrderRequest[] {
    this.expireOpenCommands();
    this.evaluateRisk();
    // An unavailable heartbeat or a temporary guard must not destroy durable
    // OPENs. Hold them until eligible or the hard TTL expires; never deliver
    // them to the terminal while any gate is closed.
    return this.pendingCommands.filter(
      (c) => c.action !== "OPEN" || (this.config.enabled && !this.entryBlock(c.symbol)),
    );
  }

  public acknowledgeCommands(ids: string[]) {
    const acknowledged = new Set(ids.filter((id) => typeof id === "string"));
    this.pendingCommands = this.pendingCommands.filter(
      (command) => command.action === "OPEN" || !command.id || !acknowledged.has(command.id),
    );
    this.persist();
  }

  public clearPendingCommands() {
    this.pendingCommands = [];
    this.persist();
  }

  public getRiskStatus() {
    return this.risk ? { ...this.risk, brokerRiskRKnown: this.brokerRiskRKnown } : null;
  }

  /** Reserve exposure for in-flight commands even if optimistic slots aged out. */
  private exposurePositions(): Array<{ symbol: string; type: "BUY" | "SELL" }> {
    const exposure = this.positions.map((p) => ({ symbol: p.symbol, type: p.type }));
    if (this.credentials.bridgeMode === "mql5_ea")
      for (const c of this.pendingCommands) {
        if (c.action !== "OPEN" || this.positions.some((p) => p.commandId === c.id)) continue;
        exposure.push({ symbol: c.symbol, type: c.type.startsWith("BUY") ? "BUY" : "SELL" });
      }
    return exposure;
  }

  public getCrashGuardStatus() {
    const peak = this.peakEquity;
    const brake =
      peak > 0 && Number.isFinite(this.account.equity) && this.account.equity >= 0
        ? drawdownBrake(
            peak,
            this.account.equity,
            this.config.maxTotalDrawdownPct,
            this.config.drawdownThresholdsPct,
            this.config.drawdownMultipliers,
          )
        : null;
    const sameSide = this.exposurePositions().filter(
      (p) => canonicalSymbol(p.symbol) === "XAUUSD" && p.type === "BUY",
    ).length;
    const sellSide = this.exposurePositions().filter(
      (p) => canonicalSymbol(p.symbol) === "XAUUSD" && p.type === "SELL",
    ).length;
    const metrics = tradeRiskMetrics(this.closedRiskSamples.map((x) => x.r));
    if (this.brokerClosedTradeCount >= 30 && metrics.count < 30) metrics.halfKellyPct = 0; // incomplete risk history: fail closed
    return {
      peakEquity: peak || null,
      ...brake,
      recoveryFraction:
        brake && Number.isFinite(brake.recoveryFraction) ? brake.recoveryFraction : null,
      stackSlotWeight: stackMultiplier(sameSide, this.config.stackDecayMultipliers),
      sellStackSlotWeight: stackMultiplier(sellSide, this.config.stackDecayMultipliers),
      brokerClosedTradeCount: this.brokerHistoryAvailable ? this.brokerClosedTradeCount : null,
      ...metrics,
    };
  }
  public setNotificationSink(sink: ((entry: MT5TradeLogEntry) => void) | null) {
    this.notificationSink = sink;
  }
  public getTelegramOffset() {
    return this.telegramOffset;
  }
  public setTelegramOffset(offset: number) {
    if (Number.isSafeInteger(offset) && offset > this.telegramOffset) {
      this.telegramOffset = offset;
      this.persist();
    }
  }
  public emergencyStop() {
    this.config.enabled = false;
    this.emergencyFlatten = true;
    this.pendingCommands = this.pendingCommands.filter((c) => c.action !== "OPEN");
    this.positions = this.positions.filter((p) => !p.createdAtMs);
    this.flattenPositions();
    this.persist();
    this.addLog(
      "WARN",
      "SYSTEM",
      "[TELEGRAM KILL] Entries disabled; close requests queued for known positions.",
    );
  }
  public resumeTrading(): boolean {
    this.evaluateRisk();
    if (
      this.credentials.bridgeMode === "mql5_ea" &&
      (!this.account.connected ||
        Date.now() - Date.parse(this.account.lastUpdated) > 15000 ||
        !this.brokerHistoryAvailable)
    )
      return false;
    if (
      this.persistenceError ||
      this.risk?.totalLocked ||
      this.risk?.dailyLocked ||
      (this.peakEquity > 0 && this.getCrashGuardStatus().multiplier === 0)
    )
      return false;
    if (
      this.emergencyFlatten &&
      (this.positions.length > 0 || this.pendingCommands.some((c) => c.action === "CLOSE"))
    )
      return false;
    this.emergencyFlatten = false;
    this.setConfig({ enabled: true });
    return this.config.enabled;
  }

  /** Called on each telemetry heartbeat and on a frequent server timer. */
  public evaluateRisk(now = Date.now()) {
    this.expireOpenCommands(now);
    if (this.credentials.bridgeMode === "mql5_ea" && !this.account.connected) return;
    if (Number.isFinite(this.account.equity) && this.account.equity > 0)
      this.peakEquity = Math.max(this.peakEquity, this.account.equity);
    const wasDailyLocked = this.risk?.dailyLocked ?? false;
    const wasTotalLocked = this.risk?.totalLocked ?? false;
    try {
      this.risk = observeEquity(
        this.risk,
        now,
        this.account.equity,
        this.account.balance,
        this.config.maxDailyLossPct,
        this.config.maxTotalDrawdownPct,
        this.config.maxDailyLossR,
      );
    } catch {
      return;
    }
    if (this.credentials.bridgeMode !== "mql5_ea") {
      const floatingR = this.positions.reduce(
        (sum, p) =>
          sum +
          (p.initialRiskCash && p.initialRiskCash > 0
            ? (p.profit + p.swap + p.commission) / p.initialRiskCash
            : 0),
        0,
      );
      if (this.risk.realizedR + floatingR <= this.config.maxDailyLossR)
        this.risk.dailyLocked = true;
    }
    const brake =
      this.peakEquity > 0
        ? drawdownBrake(
            this.peakEquity,
            this.account.equity,
            this.config.maxTotalDrawdownPct,
            this.config.drawdownThresholdsPct,
            this.config.drawdownMultipliers,
          )
        : null;
    if (brake?.multiplier === 0 && !this.risk.totalLocked) {
      this.risk.totalLocked = true;
      this.addLog("WARN", "SYSTEM", "[CIRCUIT BREAKER] Crash-guard hard lock tripped.");
    }
    if (this.risk.dailyLocked && !wasDailyLocked)
      this.addLog("WARN", "SYSTEM", "[CIRCUIT BREAKER] Daily loss lock tripped.");
    if (this.risk.totalLocked && !wasTotalLocked)
      this.addLog("WARN", "SYSTEM", "[CIRCUIT BREAKER] Total loss lock tripped.");
    if (this.emergencyFlatten) {
      this.config.enabled = false;
      this.flattenPositions();
    }
    if (this.risk.totalLocked) {
      this.config.enabled = false;
      if (this.config.flattenOnCrashGuard) this.flattenPositions();
    } else if (this.risk.dailyLocked && this.config.flattenOnDailyLimit) this.flattenPositions();
    const clock = eatParts(now);
    if (
      this.config.fridayCloseEnabled &&
      this.config.fridayFlatten &&
      clock.weekday === 5 &&
      clock.minute >= this.config.fridayCloseHourEat * 60 + this.config.fridayCloseMinuteEat
    ) {
      for (const p of [...this.positions])
        if (canonicalSymbol(p.symbol) === "XAUUSD") this.closePosition(p.ticket);
    }
    const action =
      this.config.preNewsAction === "none" && this.config.newsFilterCloseOnNews
        ? "close_all"
        : this.config.preNewsAction;
    if (this.config.newsFilterEnabled && action !== "none") {
      const events = newsManager
        .getEvents()
        .filter(
          (e) =>
            e.impact === "HIGH" &&
            Date.parse(e.datetime) >= now &&
            Date.parse(e.datetime) - now <= this.config.newsFilterMinutesBefore * 60000,
        );
      for (const p of [...this.positions]) {
        if (!events.some((e) => doesNewsAffectSymbol(e, p.symbol))) continue;
        if (action === "close_all") {
          if (
            !this.pendingCommands.some((c) => c.action === "CLOSE" && c.ticket === p.ticket) &&
            this.closePosition(p.ticket)
          )
            this.addLog("WARN", p.symbol, `[PRE-NEWS ACTION] Close requested for #${p.ticket}.`);
        } else if (
          p.profit > 0 &&
          (p.type === "BUY" ? p.sl < p.openPrice : p.sl === 0 || p.sl > p.openPrice)
        ) {
          if (!this.pendingCommands.some((c) => c.action === "MODIFY" && c.ticket === p.ticket)) {
            this.modifyPositionToBreakeven(p);
            this.addLog(
              "WARN",
              p.symbol,
              `[PRE-NEWS ACTION] Breakeven requested for #${p.ticket}.`,
            );
          }
        }
      }
    }
    this.persist();
  }

  private flattenPositions() {
    for (const p of [...this.positions]) this.closePosition(p.ticket);
  }
  private modifyPositionToBreakeven(p: MT5Position) {
    if (this.credentials.bridgeMode !== "mql5_ea") {
      p.sl = p.openPrice;
      return;
    }
    if (this.pendingCommands.some((c) => c.action === "MODIFY" && c.ticket === p.ticket)) return;
    this.pendingCommands.push({
      id: `modify-${p.ticket}-${Date.now()}`,
      action: "MODIFY",
      ticket: p.ticket,
      symbol: p.symbol,
      strategyId: p.strategyId,
      strategyName: p.strategyName,
      type: p.type,
      volume: p.volume,
      sl: p.openPrice,
      tp: p.tp,
    });
    this.persist();
  }

  private entryBlock(symbol: string): string | null {
    if (this.persistenceError) return "runtime persistence unavailable";
    this.evaluateRisk();
    if (this.persistenceError) return "runtime persistence unavailable";
    if (this.risk?.totalLocked) return "total drawdown lock";
    if (this.risk?.dailyLocked) return "daily loss lock";
    if (this.risk && Date.now() < this.risk.cooldownUntil) return "consecutive-loss cooldown";
    const c = this.config;
    const time = entryTimeBlock(
      Date.now(),
      c.rolloverEnabled,
      c.rolloverStartMinuteEat,
      c.rolloverEndMinuteEat,
      c.fridayCloseEnabled,
      c.fridayCloseHourEat * 60 + c.fridayCloseMinuteEat,
    );
    if (time) return time;
    if (this.credentials.bridgeMode === "mql5_ea") {
      if (
        !this.account.connected ||
        !Number.isFinite(this.account.equity) ||
        this.account.equity <= 0 ||
        !Number.isFinite(this.account.balance) ||
        this.account.balance <= 0 ||
        Date.now() - Date.parse(this.account.lastUpdated) > 15000
      )
        return "broker account telemetry unavailable or stale";
      if (
        !this.quote ||
        Date.now() - this.quote.at > 15000 ||
        canonicalSymbol(this.quote.symbol) !== canonicalSymbol(symbol)
      )
        return "live quote unavailable or stale";
      if (this.quote.ask - this.quote.bid > c.maxSpreadUsd) return "spread exceeds configured cap";
      if (c.maxDailyLossR < 0 && !this.brokerRiskRKnown) return "broker daily R unavailable";
      if (!this.brokerHistoryAvailable) return "broker closed-trade history unavailable";
    }
    if (c.newsFilterEnabled) {
      if (newsManager.getStatus() !== "live") return "news calendar stale or unavailable";
      const blackout = checkNewsBlackout({
        symbol,
        config: {
          enabled: true,
          filterHighImpact: c.newsFilterHighImpact,
          filterMediumImpact: c.newsFilterMediumImpact,
          minutesBefore: c.newsFilterMinutesBefore,
          minutesAfter: c.newsFilterMinutesAfter,
          affectedCurrenciesOnly: true,
        },
        events: newsManager.getEvents(),
      });
      if (blackout.isBlocked) return blackout.reason ?? "news blackout";
    }
    return null;
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
    try {
      this.notificationSink?.(entry);
    } catch {
      /* notifications never block trading */
    }
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

    const riskBlock = this.entryBlock(symbol);
    if (riskBlock) {
      this.addLog("WARN", symbol, `Entry rejected: ${riskBlock}`, signal.strategy);
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
      if (newsManager.getStatus() !== "live") {
        this.addLog(
          "WARN",
          symbol,
          "News calendar stale or unavailable; entry blocked.",
          signal.strategy,
        );
        return null;
      }
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
    const signalKey = `${canonicalSymbol(symbol)}|${signal.strategyId}|${signal.side}|${signal.datetime}`;
    if (this.executedSignals.has(signalKey)) {
      return null; // Already executed
    }

    // Desired side type
    const desiredType = signal.side === "long" ? "BUY" : "SELL";

    // Zero opposite-side self-hedging: never carry an opposite-side fill on the same symbol.
    if (
      this.exposurePositions().some(
        (p) => canonicalSymbol(p.symbol) === canonicalSymbol(symbol) && p.type !== desiredType,
      )
    ) {
      this.addLog(
        "WARN",
        symbol,
        `Order rejected: opposite-side position already open on ${symbol} (anti-hedge).`,
        signal.strategy,
      );
      return null;
    }

    // Max 3 same-side stack per symbol.
    const sameSideCount = this.exposurePositions().filter(
      (p) => canonicalSymbol(p.symbol) === canonicalSymbol(symbol) && p.type === desiredType,
    ).length;
    if (sameSideCount >= 3) {
      this.addLog(
        "WARN",
        symbol,
        `Order rejected: max 3 same-side positions already open on ${symbol}.`,
        signal.strategy,
      );
      return null;
    }

    // Max open positions check
    if (this.exposurePositions().length >= this.config.maxOpenPositions) {
      this.addLog(
        "WARN",
        symbol,
        `Order rejected: Max open positions limit reached (${this.positions.length}/${this.config.maxOpenPositions}).`,
        signal.strategy,
      );
      return null;
    }

    // Use the current executable broker quote, not a stale signal entry, for cash risk.
    const sizingEntry =
      this.credentials.bridgeMode === "mql5_ea" && this.quote
        ? desiredType === "BUY"
          ? this.quote.ask
          : this.quote.bid
        : signal.entry;
    // Calculate volume / lot size
    const drawdownWeight = this.getCrashGuardStatus().multiplier ?? 1;
    const signalWeight = signal.riskMultiplier ?? 1;
    if (!Number.isFinite(signalWeight) || signalWeight <= 0) return null;
    const weight =
      Math.min(1, signalWeight) *
      drawdownWeight *
      stackMultiplier(sameSideCount, this.config.stackDecayMultipliers);
    const kellyPct =
      this.credentials.bridgeMode === "mql5_ea" ? this.getCrashGuardStatus().halfKellyPct : null;
    if (weight <= 0) return null;
    let volume = Math.floor(this.config.fixedLot * weight * 100 + 1e-9) / 100;
    if (kellyPct !== null && this.account.equity > 0)
      volume = Math.min(
        volume,
        Math.floor(
          ((this.account.equity * kellyPct) /
            100 /
            (Math.abs(sizingEntry - signal.sl) * getContractSize(symbol))) *
            100 +
            1e-9,
        ) / 100,
      );
    if (this.config.sizingMode === "risk_pct" || this.config.sizingMode === "risk_amount") {
      const amountMode = this.config.sizingMode === "risk_amount";
      const budget = Math.min(
        this.config.maxRiskAmount * weight,
        kellyPct === null ? Infinity : (this.account.equity * kellyPct) / 100,
      );
      if (amountMode && (!Number.isFinite(budget) || budget <= 0 || this.account.equity <= 0))
        return null;
      const sizing = calculateLotSize({
        equity: this.account.equity,
        riskPct: amountMode
          ? (budget / this.account.equity) * 100
          : Math.min(this.config.riskPct * weight, kellyPct ?? Infinity),
        entry: sizingEntry,
        sl: signal.sl,
        symbol,
        maxRiskAmount: amountMode ? undefined : this.config.maxRiskAmount,
      });
      volume = amountMode
        ? Math.floor(
            (budget / (Math.abs(sizingEntry - signal.sl) * getContractSize(symbol))) * 100 + 1e-9,
          ) / 100
        : sizing.volume;
      if (!Number.isFinite(volume) || volume < 0.01) return null;
      volume = Math.min(volume, 100);

      // Micro-account over-risk guard: when the SL distance forces the rounded
      // volume down to the 0.01 min lot, the actual cash risk can balloon past
      // the budgeted risk (wide SL on a small account → 10-27% per trade).
      // Reject rather than blow the risk budget.
      {
        const actualRisk = cashRiskFor(symbol, volume, sizingEntry, signal.sl);
        if (actualRisk > sizing.riskAmount + 1e-9) {
          this.addLog(
            "WARN",
            symbol,
            `Signal rejected: volume implies $${actualRisk.toFixed(2)} cash risk, above the $${sizing.riskAmount.toFixed(2)} budget.`,
            signal.strategy,
          );
          return null;
        }
      }
    }

    if (!Number.isFinite(volume) || volume < 0.01) return null;

    // Determine order type
    const orderType = desiredType;

    const orderRequest: MT5OrderRequest = {
      id: stableSignalId(`${this.config.magicNumber}|${signalKey}`),
      action: "OPEN",
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

    // Persist the signal identity before a command can be delivered.
    this.executedSignals.add(signalKey);
    this.persist();
    if (this.persistenceError)
      return {
        ok: false,
        error: "Runtime persistence failed",
        timestamp: new Date().toISOString(),
      };
    const result = this.placeOrder(orderRequest, true);
    if (!result.ok && !this.persistenceError) {
      this.executedSignals.delete(signalKey);
      this.persist();
    }
    return result;
  }

  /**
   * Places an order directly into the engine / queue.
   */
  public placeOrder(req: MT5OrderRequest, alreadyRiskSized = false): MT5OrderResult {
    const timestamp = new Date().toISOString();
    if (
      !req ||
      typeof req.symbol !== "string" ||
      typeof req.type !== "string" ||
      !Number.isFinite(req.volume) ||
      req.volume <= 0
    )
      return { ok: false, error: "Invalid order", timestamp };
    const block = this.entryBlock(req.symbol);
    if (block) {
      this.addLog("WARN", req.symbol, `Order rejected: ${block}`, req.strategyName);
      return { ok: false, error: block, timestamp };
    }
    if (!alreadyRiskSized && this.credentials.bridgeMode === "mql5_ea") {
      const side = req.type.startsWith("BUY") ? "BUY" : "SELL";
      const sameSideCount = this.exposurePositions().filter(
        (p) => canonicalSymbol(p.symbol) === canonicalSymbol(req.symbol) && p.type === side,
      ).length;
      const weight =
        (this.getCrashGuardStatus().multiplier ?? 0) *
        stackMultiplier(sameSideCount, this.config.stackDecayMultipliers);
      req = { ...req, volume: Math.floor(req.volume * weight * 100 + 1e-9) / 100 };
      if (req.volume < 0.01) return { ok: false, error: "Stack or drawdown risk cap", timestamp };
    }
    const cap =
      this.credentials.bridgeMode === "mql5_ea" ? this.getCrashGuardStatus().halfKellyPct : null;
    if (
      cap !== null &&
      (!req.sl ||
        !this.quote ||
        this.account.equity <= 0 ||
        cashRiskFor(
          req.symbol,
          req.volume,
          req.type.startsWith("BUY") ? this.quote.ask : this.quote.bid,
          req.sl,
        ) >
          (this.account.equity * cap) / 100 + 1e-9)
    )
      return { ok: false, error: "Half-Kelly risk cap", timestamp };
    this.addLog(
      "ORDER_SENT",
      req.symbol,
      `Sending MT5 ${req.type} ${req.volume} lots on ${req.symbol} @ ${req.price ?? "market"} | SL: ${req.sl ?? "none"} | TP: ${req.tp ?? "none"} [${req.strategyName}]`,
      req.strategyName,
      { req },
    );

    // If using MQL5 EA Bridge, queue the command for the EA to fetch. Every
    // command on the wire carries its action explicitly — the EA dispatches
    // whatever it reads, so the wire payload must never silently default.
    if (this.credentials.bridgeMode === "mql5_ea") {
      if (req.id && !/^[A-Za-z0-9_-]{1,35}$/.test(req.id))
        return { ok: false, error: "Invalid command id", timestamp };
      if (!req.id) req.id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      this.pendingCommands.push({ ...req, action: "OPEN", createdAtMs: Date.now() });
      this.persist();
      if (this.persistenceError)
        return { ok: false, error: "Runtime persistence failed", timestamp };
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
      // Track optimistic fills so syncFromEa can preserve a just-opened
      // position within the pre-fill window (see syncFromEa).
      createdAtMs: this.credentials.bridgeMode === "mql5_ea" ? Date.now() : undefined,
      commandId: this.credentials.bridgeMode === "mql5_ea" ? req.id : undefined,
      initialRiskCash: req.sl ? cashRiskFor(req.symbol, req.volume, entryPrice, req.sl) : undefined,
    };

    this.positions.push(newPosition);
    if (this.credentials.bridgeMode !== "mql5_ea") this.updateEquity();

    this.addLog(
      this.credentials.bridgeMode === "mql5_ea" ? "ORDER_SENT" : "ORDER_FILLED",
      req.symbol,
      `✅ ${this.credentials.bridgeMode === "mql5_ea" ? "ORDER QUEUED (not broker-confirmed)" : "ORDER EXECUTED"}! Ticket #${ticket} | ${newPosition.type} ${newPosition.volume} ${req.symbol} @ ${entryPrice.toFixed(2)} | SL: ${req.sl?.toFixed(2) ?? "—"} | TP: ${req.tp?.toFixed(2) ?? "—"}`,
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
  public closePosition(ticket: number, reason?: "SL" | "TP"): boolean {
    const index = this.positions.findIndex((p) => p.ticket === ticket);
    if (index === -1) return false;

    const pos = this.positions[index]!;
    if (this.credentials.bridgeMode === "mql5_ea") {
      if (pos.createdAtMs) return false; // never close an invented optimistic ticket
      if (this.pendingCommands.some((c) => c.action === "CLOSE" && c.ticket === ticket))
        return true;
      this.pendingCommands.push({
        id: `close-${ticket}-${Date.now()}`,
        action: "CLOSE",
        ticket,
        symbol: pos.symbol,
        strategyId: pos.strategyId,
        strategyName: pos.strategyName,
        type: pos.type,
        volume: pos.volume,
      });
      this.persist();
      return true; // queued, not broker-confirmed
    }
    this.positions.splice(index, 1);

    // Record simulated realised R and cooldown. Broker exits must come from telemetry.
    if (this.risk && !this.closedRiskIds.has(ticket)) {
      this.closedRiskIds.add(ticket);
      const initialRisk =
        pos.initialRiskCash ?? cashRiskFor(pos.symbol, pos.volume, pos.openPrice, pos.sl);
      if (initialRisk > 0)
        this.risk.realizedR += (pos.profit + pos.commission + pos.swap) / initialRisk;
      this.risk.lossStreak = reason === "SL" && pos.profit < 0 ? this.risk.lossStreak + 1 : 0;
      if (
        this.config.consecutiveLossLimit > 0 &&
        this.risk.lossStreak >= this.config.consecutiveLossLimit
      )
        this.risk.cooldownUntil = Date.now() + this.config.consecutiveLossCooldownHours * 3600000;
    }
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
    quoteSymbol?: string;
    bid?: number;
    ask?: number;
    dailyRealizedR?: number;
    consecutiveLosses?: number;
    lastLossTimeMs?: number;
    dailyBaseline?: number;
    dailyLocked?: boolean;
    totalBaseline?: number;
    totalLocked?: boolean;
    closedRiskSamples?: Array<{ id: string; r: number; pnl: number; closedAt: number }>;
    closedTradeCount?: number;
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
      magic?: number;
    }>;
  }) {
    if (
      (telemetry.login && telemetry.login !== this.credentials.login) ||
      (telemetry.server && telemetry.server !== this.credentials.server)
    ) {
      this.account.connected = false;
      this.quote = null;
      this.brokerHistoryAvailable = false;
      this.addLog(
        "ERROR",
        "MT5",
        "Broker identity mismatch; telemetry rejected and entries blocked.",
      );
      return;
    }
    if (telemetry.login) this.account.login = telemetry.login;
    if (telemetry.server) this.account.server = telemetry.server;
    if (telemetry.currency) this.account.currency = telemetry.currency;
    if (typeof telemetry.balance === "number") this.account.balance = telemetry.balance;
    if (typeof telemetry.equity === "number") this.account.equity = telemetry.equity;
    if (typeof telemetry.margin === "number") this.account.margin = telemetry.margin;
    if (typeof telemetry.freeMargin === "number") this.account.freeMargin = telemetry.freeMargin;
    if (typeof telemetry.leverage === "number") this.account.leverage = telemetry.leverage;

    if (
      typeof telemetry.bid === "number" &&
      typeof telemetry.ask === "number" &&
      telemetry.bid > 0 &&
      telemetry.ask >= telemetry.bid &&
      telemetry.quoteSymbol
    )
      this.quote = {
        symbol: telemetry.quoteSymbol,
        bid: telemetry.bid,
        ask: telemetry.ask,
        at: Date.now(),
      };
    else this.quote = null;
    this.brokerRiskRKnown =
      typeof telemetry.dailyRealizedR === "number" &&
      Number.isFinite(telemetry.dailyRealizedR) &&
      Number.isInteger(telemetry.consecutiveLosses) &&
      telemetry.consecutiveLosses! >= 0 &&
      (telemetry.consecutiveLosses === 0 ||
        (typeof telemetry.lastLossTimeMs === "number" &&
          Number.isFinite(telemetry.lastLossTimeMs) &&
          telemetry.lastLossTimeMs > 0));
    this.brokerHistoryAvailable =
      Number.isSafeInteger(telemetry.closedTradeCount) && telemetry.closedTradeCount! >= 0;
    if (this.brokerHistoryAvailable)
      this.brokerClosedTradeCount = Math.max(
        this.brokerClosedTradeCount,
        telemetry.closedTradeCount!,
      );
    if (Array.isArray(telemetry.closedRiskSamples)) {
      const known = new Set(this.closedRiskSamples.map((x) => x.id));
      for (const sample of telemetry.closedRiskSamples.slice(0, 500)) {
        if (
          !sample ||
          typeof sample.id !== "string" ||
          !/^\d{1,20}$/.test(sample.id) ||
          !Number.isFinite(sample.r) ||
          !Number.isFinite(sample.pnl) ||
          !Number.isFinite(sample.closedAt) ||
          sample.closedAt <= 0 ||
          known.has(sample.id)
        )
          continue;
        known.add(sample.id);
        this.closedRiskSamples.push({ ...sample });
        if (sample.closedAt >= Date.now() - 120000 && sample.closedAt <= Date.now() + 30000)
          this.addLog(
            "POSITION_CLOSED",
            "MT5",
            `Broker closed position ${sample.id}: PnL ${sample.pnl.toFixed(2)}, ${sample.r.toFixed(2)}R`,
            undefined,
            { sample },
          );
      }
      this.closedRiskSamples.sort((a, b) => a.closedAt - b.closedAt);
      this.closedRiskSamples = this.closedRiskSamples.slice(-500);
    }
    this.account.connected = true;
    this.account.lastUpdated = new Date().toISOString();

    if (Array.isArray(telemetry.positions)) {
      // A heartbeat that arrives in the 15s window between the optimistic
      // local fill and the broker's first confirmation would otherwise wipe
      // the local position (telemetry.positions doesn't report it yet),
      // allowing duplicate/hedge orders in the interval. Preserve optimistic
      // positions by count deficit per canonicalSymbol+side: if the engine
      // holds more same-side canonical positions than the broker has
      // confirmed (e.g. a 2nd stacked fill whose confirmation has not
      // arrived yet), the unconfirmed slots must survive the sync.
      const liveCounts = new Map<string, number>();
      for (const p of telemetry.positions) {
        const key = `${canonicalSymbol(p.symbol)}|${p.type}`;
        liveCounts.set(key, (liveCounts.get(key) ?? 0) + 1);
      }
      const localCounts = new Map<string, number>();
      for (const p of this.positions) {
        const key = `${canonicalSymbol(p.symbol)}|${p.type}`;
        localCounts.set(key, (localCounts.get(key) ?? 0) + 1);
      }
      const preserved = [];
      const preservedByKey = new Map<string, number>();
      for (const p of this.positions) {
        if (typeof p.createdAtMs !== "number") continue; // not an optimistic fill
        if (Date.now() - p.createdAtMs >= 15_000) continue; // out of the pre-fill window
        const key = `${canonicalSymbol(p.symbol)}|${p.type}`;
        const deficit = (localCounts.get(key) ?? 0) - (liveCounts.get(key) ?? 0);
        if (deficit <= 0) continue;
        const alreadyPreserved = preservedByKey.get(key) ?? 0;
        if (alreadyPreserved >= deficit) continue;
        preserved.push(p);
        preservedByKey.set(key, alreadyPreserved + 1);
      }

      const brokerPositions = telemetry.positions
        .filter((p) => p.magic === undefined || p.magic === this.config.magicNumber)
        .map((p) => ({
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
          magic: p.magic ?? this.config.magicNumber,
          openTime: new Date().toLocaleTimeString(),
        }));

      this.positions = [...brokerPositions, ...preserved];
    }
    this.evaluateRisk();
    if (this.risk) {
      if (typeof telemetry.dailyBaseline === "number" && telemetry.dailyBaseline > 0)
        this.risk.dayBaseline = Math.max(this.risk.dayBaseline, telemetry.dailyBaseline);
      if (typeof telemetry.totalBaseline === "number" && telemetry.totalBaseline > 0)
        this.risk.totalBaseline = Math.max(this.risk.totalBaseline, telemetry.totalBaseline);
      if (telemetry.dailyLocked && !this.risk.dailyLocked) {
        this.risk.dailyLocked = true;
        this.addLog("WARN", "SYSTEM", "[CIRCUIT BREAKER] Terminal daily lock tripped.");
      }
      if (telemetry.totalLocked && !this.risk.totalLocked) {
        this.risk.totalLocked = true;
        this.addLog("WARN", "SYSTEM", "[CIRCUIT BREAKER] Terminal total lock tripped.");
      }
    }
    if (this.risk && this.brokerRiskRKnown) {
      this.risk.realizedR = telemetry.dailyRealizedR!;
      if (typeof telemetry.consecutiveLosses === "number")
        this.risk.lossStreak = telemetry.consecutiveLosses;
      if (this.risk.lossStreak >= this.config.consecutiveLossLimit && telemetry.lastLossTimeMs)
        this.risk.cooldownUntil =
          telemetry.lastLossTimeMs + this.config.consecutiveLossCooldownHours * 3600000;
    }
    this.evaluateRisk();
  }

  /**
   * Simulates price updates on open positions and checks SL / TP hits.
   */
  public updateMarketPrice(symbol: string, currentPrice: number) {
    if (this.credentials.bridgeMode === "mql5_ea") return;
    const contractSize = getContractSize(symbol);
    for (let i = this.positions.length - 1; i >= 0; i--) {
      const pos = this.positions[i]!;
      if (canonicalSymbol(pos.symbol) !== canonicalSymbol(symbol)) continue;

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
          this.closePosition(pos.ticket, "TP");
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
          this.closePosition(pos.ticket, "SL");
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
