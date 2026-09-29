/**
 * 24/7 Server-Side Autonomous Background Engine (Headless Daemon)
 *
 * Runs continuously inside the backend server process, independent of the
 * browser. On every NEW 30-minute bar (EAT wall clock = UTC+3, no DST, so the
 * bars line up with 30-minute epoch boundaries) it:
 *
 *   1. Fetches REAL candles from Twelve Data through `buildOhlcCsv` — the
 *      exact same golden-series pipeline the UI uses (rolling 85-day window,
 *      single-request path, no rate-limit retry loop).
 *   2. Runs `runAnalysis(csv, ANALYZER_LIVE_OPTIONS)` — the frozen 9
 *      production strategies.
 *   3. Dispatches any live signals through `mt5Engine.handleLiveStrategySignal`.
 *
 * Positions are marked at the LAST REAL BAR CLOSE (`lastCloseFromCsv`). There
 * are NO synthetic prices: the old `Math.sin()` fake-wave generator is gone.
 *
 * Failure policy (honest, never fabricated):
 *   - No candle provider key configured → log ONCE, retry in 15 minutes,
 *     `hasProviderKey: false` in status.
 *   - Fetch/analysis failure → retry in 5 minutes; positions keep the last
 *     real price they were marked at.
 *   - Analysis re-runs ONLY when the fetched CSV actually changed (hash
 *     compare), so a stalled provider cannot re-fire stale signals.
 *
 * Auto-starts in the constructor. That is safe: the engine's master switch
 * (`config.enabled`) defaults to OFF, so signals are observed but no orders
 * are dispatched until the user explicitly enables auto-trading.
 */

import { createHash } from "node:crypto";
import { mt5Engine } from "./engine";
import { runAnalysis } from "@/lib/analyzer/run";
import { ANALYZER_LIVE_OPTIONS } from "@/lib/analyzer/config";
import { buildOhlcCsv } from "@/lib/ohlc-generator";
import { collectTwelveDataKeys, fetchTwelveDataCandles } from "@/lib/market-data";
import { ensureServerEnv } from "@/lib/server-env";

/** One 30-minute bar in milliseconds. */
export const BAR_MS = 1_800_000;

/**
 * Grace period after a bar closes before fetching it: gives the provider time
 * to finalize the candle instead of racing the bar boundary.
 */
export const FETCH_GRACE_MS = 60_000;

/**
 * Rolling feed window in calendar days. 85 keeps the fetch span
 * (window + the generator's 1-day-before/2-days-after padding = 88 days)
 * under the 90-day single-request chunk cap in ohlc-generator.ts.
 */
export const FEED_WINDOW_DAYS = 85;

/** Retry cadence when no candle provider key is configured. */
const NO_KEY_RETRY_MS = 15 * 60 * 1000;
/** Retry cadence after a fetch/analysis failure. */
const FAILURE_RETRY_MS = 5 * 60 * 1000;

/**
 * Start (epoch ms) of the 30-minute bar containing `nowMs`.
 *
 * Pure epoch alignment: EAT (UTC+3) has no DST, so 30-minute bar boundaries
 * in Nairobi wall-clock time coincide exactly with 30-minute epoch multiples.
 */
export function barBoundaryFor(nowMs: number): number {
  return Math.floor(nowMs / BAR_MS) * BAR_MS;
}

/**
 * When to fetch after the bar that STARTS at `barStartMs`: that bar closes at
 * `barStartMs + BAR_MS`, and the fetch is gated to close + grace.
 */
export function nextFetchAtAfter(barStartMs: number): number {
  return barStartMs + BAR_MS + FETCH_GRACE_MS;
}

const DAY_MS = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Rolling `FEED_WINDOW_DAYS`-day window (inclusive, yyyy-MM-dd) ending on the
 * current UTC day. `buildOhlcCsv` pads it by 1 day before / 2 days after when
 * querying the provider, so the whole fetch stays in one request.
 */
export function feedWindowDates(now: Date | number): { startDate: string; endDate: string } {
  const nowMs = typeof now === "number" ? now : now.getTime();
  const endMs = Date.UTC(
    new Date(nowMs).getUTCFullYear(),
    new Date(nowMs).getUTCMonth(),
    new Date(nowMs).getUTCDate(),
  );
  const startMs = endMs - (FEED_WINDOW_DAYS - 1) * DAY_MS;
  return { startDate: isoDay(startMs), endDate: isoDay(endMs) };
}

/**
 * Close of the last REAL bar in an OHLC CSV produced by `buildOhlcCsv`.
 *
 * The close column is located BY HEADER NAME (a volume column — present only
 * when the provider supplies real tick volume — shifts positional indexes),
 * and `===` day-marker/weekend rows are skipped. Returns null when the file
 * carries no usable close.
 */
export function lastCloseFromCsv(csv: string): number | null {
  if (!csv) return null;
  const lines = csv.split(/\r?\n/);
  let headerIndex = -1;
  let closeIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("===")) continue;
    const cells = trimmed.split(",");
    const idx = cells.findIndex((cell) => cell.trim().toLowerCase() === "close");
    if (idx !== -1) {
      headerIndex = i;
      closeIndex = idx;
      break;
    }
  }
  if (headerIndex === -1 || closeIndex === -1) return null;

  let lastClose: number | null = null;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("===")) continue;
    const cells = trimmed.split(",");
    const raw = cells[closeIndex]?.trim();
    if (!raw) continue;
    const value = Number(raw);
    if (Number.isFinite(value)) lastClose = value;
  }
  return lastClose;
}

export interface DaemonFeedEntry {
  symbol: string;
  /** Close of the last REAL fetched bar — never synthetic. */
  lastRealClose: number | null;
  /** Start of the bar (ISO) the feed was checked against last. */
  barTime: string | null;
  /** When the last fetch for this symbol completed (ISO). */
  lastFetchAt: string | null;
  status: "idle" | "ok" | "no-data" | "error";
  detail: string | null;
}

export interface ServerDaemonStatus {
  isRunning: boolean;
  startedAt: string | null;
  lastTickAt: string | null;
  tickCount: number;
  signalsDetectedCount: number;
  tradesExecutedCount: number;
  monitoredSymbols: string[];
  activeStrategies: string[];
  lastError: string | null;
  /** True once the server has at least one Twelve Data key configured. */
  hasProviderKey: boolean;
  /** Real-candle feed state per monitored symbol. */
  feed: DaemonFeedEntry[];
}

class MT5ServerDaemon {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isProcessing = false;
  private startedAt: string | null = null;
  private lastTickAt: string | null = null;
  private tickCount = 0;
  private signalsDetectedCount = 0;
  private tradesExecutedCount = 0;
  private lastError: string | null = null;
  private hasProviderKey = false;
  private noKeyLogged = false;
  private lastProcessedBarStart = -1;
  private pendingRetryMs: number | null = null;
  private readonly feed = new Map<string, DaemonFeedEntry>();
  private readonly csvHashes = new Map<string, string>();

  constructor() {
    // Safe auto-start: the engine's master switch defaults OFF, so no orders
    // can be dispatched until the user enables auto-trading explicitly.
    this.start();
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startedAt = new Date().toISOString();
    mt5Engine.addLog(
      "INFO",
      "SERVER_DAEMON",
      "🟢 24/7 Server Strategy Engine ACTIVE: fetching real candles on every closed 30-min bar.",
    );
    // Seed the provider-key flag right away (before the first bar cycle) so
    // the panel and GET /api/mt5 report reality instead of a stale default.
    void ensureServerEnv()
      .then(() => {
        this.hasProviderKey = collectTwelveDataKeys().length > 0;
      })
      .catch(() => {
        this.hasProviderKey = false;
      });
    // Bootstrap cycle: fetch the current real-candle state once on startup so
    // marks and feed rows are not empty until the next bar closes. After
    // that, fetches happen only at bar boundaries + grace.
    void this.runCycle().finally(() => this.scheduleNext());
  }

  public stop() {
    if (!this.isRunning) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    mt5Engine.addLog("WARN", "SERVER_DAEMON", "🛑 24/7 Server Strategy Engine PAUSED.");
  }

  public getStatus(): ServerDaemonStatus {
    const config = mt5Engine.getConfig();
    return {
      isRunning: this.isRunning,
      startedAt: this.startedAt,
      lastTickAt: this.lastTickAt,
      tickCount: this.tickCount,
      signalsDetectedCount: this.signalsDetectedCount,
      tradesExecutedCount: this.tradesExecutedCount,
      monitoredSymbols: config.symbols,
      activeStrategies: config.strategies,
      lastError: this.lastError,
      hasProviderKey: this.hasProviderKey,
      feed: config.symbols.map((symbol) => this.feedEntry(symbol)),
    };
  }

  private feedEntry(symbol: string): DaemonFeedEntry {
    let entry = this.feed.get(symbol);
    if (!entry) {
      entry = {
        symbol,
        lastRealClose: null,
        barTime: null,
        lastFetchAt: null,
        status: "idle",
        detail: null,
      };
      this.feed.set(symbol, entry);
    }
    return entry;
  }

  private scheduleNext() {
    if (!this.isRunning) return;
    if (this.timer) clearTimeout(this.timer);

    let delayMs: number;
    if (this.pendingRetryMs !== null) {
      delayMs = this.pendingRetryMs;
      this.pendingRetryMs = null;
    } else {
      const formingBarStart = barBoundaryFor(Date.now());
      const nextAt =
        this.lastProcessedBarStart >= formingBarStart
          ? // Already fetched for this bar: wait for the next bar + grace.
            nextFetchAtAfter(formingBarStart)
          : // Missed/behind: this bar's fetch window is already open.
            Math.min(Date.now(), nextFetchAtAfter(formingBarStart));
      delayMs = Math.max(0, nextAt - Date.now());
    }

    this.timer = setTimeout(() => {
      void this.runCycle().finally(() => this.scheduleNext());
    }, delayMs);
    // Never hold the process open just for the daemon.
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  private async runCycle(): Promise<void> {
    if (this.isProcessing || !this.isRunning) return;
    this.isProcessing = true;
    this.lastTickAt = new Date().toISOString();
    this.tickCount++;
    this.lastProcessedBarStart = barBoundaryFor(Date.now());

    try {
      // .env defaults must be loaded BEFORE the key check: keys may live in
      // .env on a freshly started server.
      await ensureServerEnv();
      const keys = collectTwelveDataKeys();
      if (keys.length === 0) {
        if (!this.noKeyLogged) {
          this.noKeyLogged = true;
          mt5Engine.addLog(
            "WARN",
            "SERVER_DAEMON",
            "⚠️ No candle provider key configured (TWELVE_DATA_API_KEYS / TWELVE_DATA_API_KEY). " +
              "The daemon cannot fetch real candles and will retry in 15 minutes. " +
              "Until then, positions keep their last real price.",
          );
        }
        this.hasProviderKey = false;
        this.pendingRetryMs = NO_KEY_RETRY_MS;
        return;
      }
      this.hasProviderKey = true;

      const config = mt5Engine.getConfig();
      const symbols = config.symbols.length > 0 ? config.symbols : ["XAU/USD"];
      let anyFailure = false;

      for (const symbol of symbols) {
        const entry = this.feedEntry(symbol);
        try {
          await this.evaluateSymbol(symbol, entry);
        } catch (error) {
          anyFailure = true;
          this.lastError = String(error instanceof Error ? error.message : error);
          entry.status = "error";
          entry.detail = this.lastError;
          mt5Engine.addLog(
            "ERROR",
            "SERVER_DAEMON",
            `${symbol}: real-candle fetch failed: ${this.lastError}. Positions keep the last real price; retrying in 5 minutes.`,
          );
        }
      }

      this.pendingRetryMs = anyFailure ? FAILURE_RETRY_MS : null;
    } catch (error) {
      this.lastError = String(error instanceof Error ? error.message : error);
      this.pendingRetryMs = FAILURE_RETRY_MS;
    } finally {
      this.isProcessing = false;
    }
  }

  private async evaluateSymbol(symbol: string, entry: DaemonFeedEntry): Promise<void> {
    const { startDate, endDate } = feedWindowDates(Date.now());
    const csv = await buildOhlcCsv({
      symbol,
      startDate,
      endDate,
      specifyTime: false,
      startTime: "00:00",
      endTime: "23:59",
      log: () => {
        // The shared pipeline logs progress for the UI; the daemon stays quiet
        // and surfaces only outcomes (errors are logged by the caller).
      },
      setCooldown: () => undefined,
      // The daemon never sits in 60s cooldown loops — it fails fast and lets
      // the bar scheduler retry on the next cycle.
      rateLimitRetries: 0,
      // Inject the direct server-side provider fetch so the exact golden
      // series pipeline runs without the browser round-trip.
      fetchCandles: fetchTwelveDataCandles,
    });

    if (!csv) {
      entry.status = "no-data";
      entry.detail = "provider returned no candles for this window";
      throw new Error("no OHLC data returned for the rolling feed window");
    }

    // Mark positions from the LAST REAL BAR CLOSE — never a synthetic price.
    const lastClose = lastCloseFromCsv(csv);
    entry.barTime = new Date(barBoundaryFor(Date.now())).toISOString();
    entry.lastFetchAt = new Date().toISOString();
    if (lastClose !== null) {
      mt5Engine.updateMarketPrice(symbol, lastClose);
      entry.lastRealClose = lastClose;
    }
    entry.status = "ok";
    entry.detail = null;

    // Only re-run analysis when the series actually changed: a stalled
    // provider returning the same rows must not re-fire stale signals.
    const hash = createHash("sha256").update(csv).digest("hex");
    if (this.csvHashes.get(symbol) === hash) return;
    this.csvHashes.set(symbol, hash);

    const outcome = runAnalysis(csv, ANALYZER_LIVE_OPTIONS);
    if (!outcome.ok) {
      entry.status = "error";
      entry.detail = outcome.error;
      throw new Error(`analysis rejected the feed: ${outcome.error}`);
    }

    for (const signal of outcome.analysis.live) {
      this.signalsDetectedCount++;
      const result = mt5Engine.handleLiveStrategySignal(signal, symbol);
      if (result?.ok) {
        this.tradesExecutedCount++;
        mt5Engine.addLog(
          "INFO",
          symbol,
          `[24/7 DAEMON] ${signal.strategy} ${signal.side?.toUpperCase()} dispatched from real candles (ticket #${result.ticket}).`,
        );
      }
    }
  }
}

// Global server daemon singleton
export const serverDaemon = new MT5ServerDaemon();
