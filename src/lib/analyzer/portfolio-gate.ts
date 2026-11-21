/**
 * LAYER 4 — Causal portfolio anti-hedging & stack gate.
 *
 * Runs inside the PASS path, before consume(). One gate instance per run.
 *
 * Causality: at bar i, pruning a prior trade whose exitIndex <= i is 100%
 * causal — whether SL/TP was hit on or before bar i depends strictly on bars
 * <= i. Trades registered on bar i carry exitIndex = Infinity until the forward
 * status engine resolves them, so nothing can be "closed" by an earlier-registered
 * row except by the same forward engine that the rest of the run already depends on.
 */

export type TradeSide = "long" | "short";

export const PORTFOLIO_BAR_DEDUPE_REASON =
  "PORTFOLIO_BAR_DEDUPE: higher-priority signal already taken on this bar";
export const PORTFOLIO_ANTI_HEDGE_REASON =
  "PORTFOLIO_ANTI_HEDGE: opposite-side position currently open";
export const PORTFOLIO_MAX_STACK_REASON =
  "PORTFOLIO_MAX_STACK: max 3 concurrent same-side trades reached";

export interface PortfolioGateOptions {
  /** Max entries per M30 bar (default 1). */
  maxEntriesPerBar?: number;
  /** Max concurrent same-side trades (default 3). */
  maxSameSide?: number;
  /** Rolling drawdown window (default 20 closed trades). */
  rollingWindow?: number;
  /** Realized-R floor that triggers the riskMultiplier throttle (default -4.0). */
  drawdownFloor?: number;
}

export interface RegisteredTrade {
  strategyId: string;
  side: TradeSide;
  entryIndex: number;
  /** exitIndex <= current bar is closed; Infinity is live/unresolved. */
  exitIndex: number;
  /** Realized R multiple of the (closed) trade; 0 for no-fill/never-opened. */
  rMultiple: number;
}

export class PortfolioGate {
  private trades: RegisteredTrade[] = [];
  readonly maxEntriesPerBar: number;
  readonly maxSameSide: number;
  readonly rollingWindow: number;
  readonly drawdownFloor: number;

  constructor(options: PortfolioGateOptions = {}) {
    this.maxEntriesPerBar = options.maxEntriesPerBar ?? 1;
    this.maxSameSide = options.maxSameSide ?? 3;
    this.rollingWindow = options.rollingWindow ?? 20;
    this.drawdownFloor = options.drawdownFloor ?? -4.0;
  }

  /** Trades still open at barIndex (exit not yet reached). */
  private activeAt(barIndex: number): RegisteredTrade[] {
    return this.trades.filter((t) => t.exitIndex === Infinity || t.exitIndex > barIndex);
  }

  /** Registered trades exactly at barIndex (same bar; dedupe basis). */
  private openedAt(barIndex: number): number {
    return this.trades.filter((t) => t.entryIndex === barIndex).length;
  }

  /**
   * Returns the rejection reason or null when the candidate may proceed.
   * Checked in order: per-bar dedupe, anti-hedge, same-side stack.
   */
  canOpen(side: TradeSide, barIndex: number): string | null {
    if (this.openedAt(barIndex) >= this.maxEntriesPerBar) return PORTFOLIO_BAR_DEDUPE_REASON;

    const active = this.activeAt(barIndex);
    if (active.some((t) => t.side !== side)) return PORTFOLIO_ANTI_HEDGE_REASON;
    if (active.filter((t) => t.side === side).length >= this.maxSameSide) {
      return PORTFOLIO_MAX_STACK_REASON;
    }
    return null;
  }

  registerTrade(trade: RegisteredTrade): void {
    this.trades.push(trade);
  }

  /**
   * Realized-R rolling sum over the last `rollingWindow` closed trades
   * (exitIndex <= barIndex). < drawdownFloor → 0.5, else 1.0.
   */
  riskMultiplierAt(barIndex: number): number {
    const closed = this.trades
      .filter((t) => t.exitIndex !== Infinity && t.exitIndex <= barIndex)
      .sort((a, b) => a.exitIndex - b.exitIndex || a.entryIndex - b.entryIndex)
      .slice(-this.rollingWindow);
    const sum = closed.reduce((s, t) => s + t.rMultiple, 0);
    return sum < this.drawdownFloor ? 0.5 : 1.0;
  }

  /** Test/introspection hook: every trade the gate has tracked. */
  get registeredTrades(): readonly RegisteredTrade[] {
    return [...this.trades];
  }
}

/** Factory with the production defaults. */
export function createPortfolioGate(options: PortfolioGateOptions = {}): PortfolioGate {
  return new PortfolioGate(options);
}
