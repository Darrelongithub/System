import { useEffect, useState } from "react";
import {
  Activity,
  Cloud,
  Copy,
  Cpu,
  Download,
  Flame,
  Lock,
  Power,
  Settings2,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type MT5AccountCredentials,
  type MT5AccountInfo,
  type MT5AutoTradeConfig,
  type MT5Position,
  type SizingMode,
} from "@/lib/mt5/types";
import {
  closePosition,
  executeManualSignal,
  saveMT5Config,
  saveMT5Credentials,
  toggleAutoTrading,
  useMT5State,
} from "@/lib/mt5/mt5-store";
import { FINAL_TRADE_STRATEGIES } from "@/lib/analyzer/strategies";
import type { ResultRow } from "@/lib/analyzer/types";
import { checkNewsBlackout } from "@/lib/mt5/news-filter";
import { cn } from "@/lib/utils";

interface MT5AutomationPanelProps {
  currentSymbol: string;
  liveSignals: ResultRow[];
  currentPrice?: number;
}

/* ─── Server snapshot shape (GET /api/mt5, polled every 5s) ─────────────── */

interface ServerDaemonFeedEntry {
  symbol: string;
  lastRealClose: number | null;
  barTime: string | null;
  lastFetchAt: string | null;
  status: "idle" | "ok" | "no-data" | "error" | string;
  detail?: string | null;
}

interface ServerDaemonStatus {
  isRunning: boolean;
  startedAt: string | null;
  lastTickAt: string | null;
  tickCount: number;
  signalsDetectedCount: number;
  tradesExecutedCount: number;
  monitoredSymbols: string[];
  activeStrategies: string[];
  lastError: string | null;
  hasProviderKey: boolean;
  feed: ServerDaemonFeedEntry[];
}

interface ServerSnapshot {
  account: MT5AccountInfo | null;
  positions: MT5Position[];
  daemon: ServerDaemonStatus | null;
  fetchedAt: number;
}

/** Coerce a server account payload to the client shape (defensive: JSON over the wire is untyped). */
function normalizeServerAccount(raw: unknown): MT5AccountInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    login: String(r["login"] ?? ""),
    name: String(r["name"] ?? ""),
    server: String(r["server"] ?? ""),
    currency: String(r["currency"] ?? "USD"),
    balance: Number(r["balance"]) || 0,
    equity: Number(r["equity"]) || 0,
    margin: Number(r["margin"]) || 0,
    freeMargin: Number(r["freeMargin"]) || 0,
    marginLevel: Number(r["marginLevel"]) || 0,
    leverage: Number(r["leverage"]) || 100,
    connected: Boolean(r["connected"]),
    tradeAllowed: Boolean(r["tradeAllowed"]),
    lastUpdated: String(r["lastUpdated"] ?? ""),
    pingMs: typeof r["pingMs"] === "number" ? r["pingMs"] : undefined,
  };
}

function normalizeServerPositions(raw: unknown): MT5Position[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
    .map((p) => ({
      id: String(p["id"] ?? p["ticket"] ?? ""),
      ticket: Number(p["ticket"]) || 0,
      symbol: String(p["symbol"] ?? ""),
      strategyId: String(p["strategyId"] ?? ""),
      strategyName: String(p["strategyName"] ?? ""),
      type: p["type"] === "SELL" ? "SELL" : "BUY",
      volume: Number(p["volume"]) || 0,
      openPrice: Number(p["openPrice"]) || 0,
      currentPrice: Number(p["currentPrice"]) || 0,
      sl: Number(p["sl"]) || 0,
      tp: Number(p["tp"]) || 0,
      profit: Number(p["profit"]) || 0,
      swap: Number(p["swap"]) || 0,
      commission: Number(p["commission"]) || 0,
      comment: String(p["comment"] ?? ""),
      magic: Number(p["magic"]) || 0,
      openTime: String(p["openTime"] ?? ""),
    }));
}

const fmtMoney = (value: number | undefined | null) =>
  (value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function MT5AutomationPanel({ currentSymbol, liveSignals }: MT5AutomationPanelProps) {
  const mt5 = useMT5State();
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "news" | "rules" | "bridge" | "standalone_ea" | "cloud_daemon"
  >("dashboard");
  const [isConnecting, setIsConnecting] = useState(false);
  const [serverSnap, setServerSnap] = useState<ServerSnapshot | null>(null);

  // Poll the SERVER engine state every 5s: account/positions as reported by
  // the EA bridge, plus the real-candle daemon feed. The panel shows THIS
  // state in bridge mode instead of the browser-local simulation.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/mt5");
        if (!res.ok) return;
        const json = (await res.json()) as Record<string, unknown>;
        if (cancelled) return;
        setServerSnap({
          account: normalizeServerAccount(json["account"]),
          positions: normalizeServerPositions(json["positions"]),
          daemon: (json["daemon"] as ServerDaemonStatus | null) ?? null,
          fetchedAt: Date.now(),
        });
      } catch {
        // Server unreachable — the panel keeps working off local state.
      }
    };
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Local form state for login
  const [loginForm, setLoginForm] = useState<MT5AccountCredentials>({
    login: mt5.credentials.login || "50198421",
    password: mt5.credentials.password || "",
    server: mt5.credentials.server || "MetaQuotes-Demo",
    bridgeMode: mt5.credentials.bridgeMode || "simulated",
    isDemo: mt5.credentials.isDemo ?? true,
    apiEndpoint: mt5.credentials.apiEndpoint || "",
    apiToken: mt5.credentials.apiToken || "sfp-" + Math.random().toString(36).slice(2, 8),
  });

  // Local form state for config
  const [configForm, setConfigForm] = useState<MT5AutoTradeConfig>({
    ...mt5.config,
  });

  // Sync state if external changes happen
  useEffect(() => {
    setLoginForm((prev) => ({
      ...prev,
      login: mt5.credentials.login,
      server: mt5.credentials.server,
      bridgeMode: mt5.credentials.bridgeMode,
      isDemo: mt5.credentials.isDemo,
    }));
    setConfigForm({ ...mt5.config });
  }, [mt5.credentials, mt5.config]);

  const handleSaveLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnecting(true);
    setTimeout(() => {
      saveMT5Credentials(loginForm);
      setIsConnecting(false);
      setActiveTab("dashboard");
    }, 600);
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    saveMT5Config(configForm);
  };

  const handleToggleStrategy = (strategyId: string) => {
    setConfigForm((prev) => {
      const exists = prev.strategies.includes(strategyId);
      const next = exists
        ? prev.strategies.filter((id) => id !== strategyId)
        : [...prev.strategies, strategyId];
      const updated = { ...prev, strategies: next };
      saveMT5Config(updated);
      return updated;
    });
  };

  const bridgeUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/mt5/bridge`
      : "http://localhost:5173/api/mt5/bridge";

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${label} to clipboard!`);
  };

  /* ─── Mode & data-source resolution ───────────────────────────────────── */

  const isBridgeMode = mt5.credentials.bridgeMode === "mql5_ea";
  const daemon = serverSnap?.daemon ?? null;
  const serverAccount = serverSnap?.account ?? null;

  // In bridge mode the truth lives on the server (fed by the EA); in
  // simulation mode the browser-local engine is the truth.
  const account = isBridgeMode && serverAccount ? serverAccount : mt5.account;
  const positions = isBridgeMode && serverSnap ? serverSnap.positions : mt5.positions;

  const eaSyncAgeMs = account?.lastUpdated
    ? Date.now() - new Date(account.lastUpdated).getTime()
    : Infinity;
  const eaSyncing = isBridgeMode && Number.isFinite(eaSyncAgeMs) && eaSyncAgeMs < 30_000;

  const totalFloating = positions.reduce((acc, p) => acc + p.profit, 0);

  // Check current news blackout status for this symbol
  const newsBlackout = checkNewsBlackout({
    symbol: currentSymbol,
    config: {
      enabled: mt5.config.newsFilterEnabled,
      filterHighImpact: mt5.config.newsFilterHighImpact,
      filterMediumImpact: mt5.config.newsFilterMediumImpact,
      minutesBefore: mt5.config.newsFilterMinutesBefore,
      minutesAfter: mt5.config.newsFilterMinutesAfter,
      affectedCurrenciesOnly: true,
    },
    events: mt5.upcomingNews || [],
  });

  return (
    <section className="glass-card flex flex-col gap-5 rounded-2xl border border-primary/25 bg-card/70 p-5 shadow-xl backdrop-blur-md">
      {/* ─── HEADER BAR: Status, Account Ticker, Master Switch ─── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
            <Zap className="size-5 fill-primary/30" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-tight text-foreground sm:text-lg">
                MT5 Live 24/7 Automation & Red Folder Guard
              </h2>
              {/* REAL sync state — reflects what the server/EA actually reports */}
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
                  isBridgeMode && eaSyncing
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : isBridgeMode
                      ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                      : "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
                )}
                title={
                  isBridgeMode
                    ? eaSyncing
                      ? "Server account state refreshed within the last 30 seconds"
                      : "No fresh account telemetry from the EA yet"
                    : "Simulation mode — no real broker connection"
                }
              >
                <span
                  className={cn(
                    "size-2 rounded-full",
                    isBridgeMode && eaSyncing
                      ? "bg-emerald-400 animate-pulse"
                      : isBridgeMode
                        ? "bg-amber-400"
                        : "bg-yellow-400",
                  )}
                />
                {isBridgeMode
                  ? eaSyncing
                    ? `EA syncing · ${account?.server || mt5.credentials.server} (#${account?.login || mt5.credentials.login})`
                    : "Bridge armed · waiting for EA telemetry"
                  : "Simulation mode · no broker connection"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Runs in background 24/7 (even when app/browser is off) · Auto Entry, SL, TP & Red
              Folder News Protection
            </p>
          </div>
        </div>

        {/* Master Auto-Trade Toggle */}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={() => toggleAutoTrading(!mt5.config.enabled)}
            variant={mt5.config.enabled ? "default" : "outline"}
            className={cn(
              "h-10 px-4 font-bold text-xs tracking-wide transition-all shadow-md",
              mt5.config.enabled
                ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/50 shadow-emerald-950/40"
                : "border-border/80 hover:bg-secondary text-muted-foreground",
            )}
          >
            <Power className="mr-1.5 size-4" />
            {mt5.config.enabled ? "AUTO-TRADING ACTIVE" : "AUTO-TRADING PAUSED"}
          </Button>
        </div>
      </div>

      {/* ─── MODE BANNER: honest simulation vs bridge state ─── */}
      {isBridgeMode ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-xs">
          <span className="rounded bg-emerald-500 text-black px-2 py-0.5 text-[10px] font-black uppercase">
            🟢 Bridge Mode
          </span>
          <span className="text-emerald-200">
            Orders queue on this server and execute on your real MT5 terminal via the
            SignalFinderBridge EA.
          </span>
          {daemon && (
            <span
              className={cn(
                "rounded border px-2 py-0.5 font-mono text-[10px] font-bold",
                daemon.isRunning
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                  : "border-border bg-secondary text-muted-foreground",
              )}
            >
              {daemon.isRunning ? "Server daemon running" : "Server daemon stopped"}
            </span>
          )}
          {daemon && !daemon.hasProviderKey && (
            <span className="rounded border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300">
              ⚠️ No candle API key on server — daemon cannot fetch real data
            </span>
          )}
          {eaSyncing && (
            <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300 animate-pulse">
              EA is syncing
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-yellow-500/40 bg-yellow-950/20 px-4 py-3 text-xs">
          <span className="rounded bg-yellow-500 text-black px-2 py-0.5 text-[10px] font-black uppercase">
            🟡 Simulation Mode
          </span>
          <span className="text-yellow-200/90">
            Signals are generated from real analysis, but execution is simulated in the browser — no
            orders reach a broker. Switch to the{" "}
            <button
              type="button"
              className="font-bold underline underline-offset-2 text-yellow-100"
              onClick={() => setActiveTab("bridge")}
            >
              Real-Trade Bridge tab
            </button>{" "}
            to connect your MT5 account.
          </span>
        </div>
      )}

      {/* ─── LIVE RED FOLDER LOCKOUT BANNER (WHEN ACTIVE) ─── */}
      {newsBlackout.isBlocked && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/50 bg-red-950/40 px-4 py-3 text-red-300 animate-in fade-in zoom-in-95">
          <ShieldAlert className="size-5 shrink-0 text-red-400 animate-pulse" />
          <div className="flex-1 text-xs">
            <span className="font-bold text-red-200 uppercase tracking-wider mr-2">
              [Red Folder News Lockout Active]
            </span>
            <span>{newsBlackout.reason}</span>
          </div>
          <span className="rounded bg-red-500/20 text-red-200 border border-red-500/30 px-2 py-0.5 text-[10px] font-mono uppercase font-bold shrink-0">
            {currentSymbol} Protected
          </span>
        </div>
      )}

      {/* ─── LIVE ACCOUNT METRICS TICKER ─── */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <div className="rounded-xl border border-border/60 bg-secondary/40 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Account Balance
          </span>
          <p className="num mt-0.5 text-lg font-bold text-foreground">
            ${fmtMoney(account?.balance)}
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-secondary/40 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Account Equity
          </span>
          <p
            className={cn(
              "num mt-0.5 text-lg font-bold",
              (account?.equity ?? 0) >= (account?.balance ?? 0)
                ? "text-emerald-400"
                : "text-amber-400",
            )}
          >
            ${fmtMoney(account?.equity)}
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-secondary/40 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Floating P&L
          </span>
          <p
            className={cn(
              "num mt-0.5 text-lg font-bold flex items-center gap-1",
              totalFloating >= 0 ? "text-emerald-400" : "text-destructive",
            )}
          >
            {totalFloating >= 0 ? (
              <TrendingUp className="size-4" />
            ) : (
              <TrendingDown className="size-4" />
            )}
            {totalFloating >= 0 ? "+" : ""}${totalFloating.toFixed(2)}
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-secondary/40 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Free Margin
          </span>
          <p className="num mt-0.5 text-lg font-bold text-foreground">
            ${fmtMoney(account?.freeMargin)}
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-secondary/40 p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Open Positions
          </span>
          <p className="num mt-0.5 text-lg font-bold text-primary">
            {positions.length} / {mt5.config.maxOpenPositions}
          </p>
        </div>
      </div>

      {/* ─── NAVIGATION TABS ─── */}
      <div className="flex border-b border-border/60 text-xs overflow-x-auto">
        {[
          {
            id: "dashboard",
            label: "Live Dashboard & Positions",
            icon: Activity,
            count: positions.length,
          },
          {
            id: "news",
            label: "🔴 Red Folder News Radar",
            icon: Flame,
            badge: mt5.config.newsFilterEnabled ? "Active Guard" : "Off",
          },
          { id: "rules", label: "Automation Rules", icon: Settings2 },
          {
            id: "bridge",
            label: "MT5 Login & Real-Trade Bridge",
            icon: Lock,
            badge: "Recommended",
          },
          {
            id: "standalone_ea",
            label: "24/7 Standalone MT5 EA (Offline)",
            icon: Cpu,
          },
          { id: "cloud_daemon", label: "24/7 Server Daemon", icon: Cloud },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2.5 font-semibold transition-all whitespace-nowrap",
                isActive
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/30",
              )}
            >
              <Icon className="size-3.5" />
              <span>{tab.label}</span>
              {typeof tab.count === "number" && tab.count > 0 && (
                <span className="rounded-full bg-primary/20 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                  {tab.count}
                </span>
              )}
              {tab.badge && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[9px] font-black uppercase",
                    tab.id === "news"
                      ? "bg-red-500/20 text-red-300 border border-red-500/30"
                      : "bg-emerald-500/20 text-emerald-400",
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── TAB 1: LIVE DASHBOARD & POSITIONS ─── */}
      {activeTab === "dashboard" && (
        <div className="flex flex-col gap-5">
          {/* Active Positions Table */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Active MT5 Positions ({positions.length})
                {isBridgeMode && (
                  <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-emerald-400">
                    Server state
                  </span>
                )}
              </h3>
              <span className="text-[11px] text-muted-foreground font-mono">
                Magic: #{mt5.config.magicNumber}
              </span>
            </div>

            {positions.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 p-8 text-center bg-secondary/10">
                <Activity className="size-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm font-semibold text-foreground">No active open positions</p>
                <p className="mt-1 text-xs text-muted-foreground max-w-md">
                  When auto-trading is active, strategy signals will automatically open positions
                  with calculated lot sizes and exact Stop Loss / Take Profit targets.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border/70 bg-card">
                <table className="w-full text-left text-xs">
                  <thead className="bg-secondary/50 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-3">Ticket</th>
                      <th className="p-3">Symbol</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Volume</th>
                      <th className="p-3">Strategy</th>
                      <th className="p-3">Open Price</th>
                      <th className="p-3">Stop Loss</th>
                      <th className="p-3">Take Profit</th>
                      <th className="p-3">Profit (USD)</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 font-mono">
                    {positions.map((pos) => (
                      <tr key={pos.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="p-3 text-foreground font-bold">#{pos.ticket}</td>
                        <td className="p-3 text-foreground">{pos.symbol}</td>
                        <td className="p-3">
                          <span
                            className={cn(
                              "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
                              pos.type === "BUY"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-destructive/20 text-destructive",
                            )}
                          >
                            {pos.type}
                          </span>
                        </td>
                        <td className="p-3 text-foreground">{pos.volume.toFixed(2)}</td>
                        <td className="p-3 font-sans text-muted-foreground text-xs">
                          {pos.strategyName}
                        </td>
                        <td className="p-3 text-foreground">{pos.openPrice.toFixed(2)}</td>
                        <td className="p-3 text-destructive">{pos.sl.toFixed(2)}</td>
                        <td className="p-3 text-emerald-400">{pos.tp.toFixed(2)}</td>
                        <td
                          className={cn(
                            "p-3 font-bold",
                            pos.profit >= 0 ? "text-emerald-400" : "text-destructive",
                          )}
                        >
                          {pos.profit >= 0 ? "+" : ""}${pos.profit.toFixed(2)}
                        </td>
                        <td className="p-3 text-right">
                          {isBridgeMode ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled
                              title="In bridge mode this position lives on your MT5 terminal — close it there (or let SL/TP run)."
                              className="h-7 px-2.5 text-[11px] font-bold"
                            >
                              In MT5
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => closePosition(pos.ticket)}
                              className="h-7 px-2.5 text-[11px] font-bold"
                            >
                              Close
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Actionable Live Signals Available for Execution */}
          {liveSignals.length > 0 && (
            <div className="flex flex-col gap-2.5 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Zap className="size-4" /> Ready Signal Setups ({liveSignals.length})
                </h3>
                <span className="text-[10px] text-muted-foreground font-mono">{currentSymbol}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {liveSignals.map((sig) => (
                  <div
                    key={`${sig.strategyId}-${sig.index}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-card p-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                            sig.side === "long"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-destructive/20 text-destructive",
                          )}
                        >
                          {sig.side?.toUpperCase()}
                        </span>
                        <span className="text-xs font-bold text-foreground">{sig.strategy}</span>
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        Entry: {sig.entry?.toFixed(2)} · SL: {sig.sl?.toFixed(2)} · TP:{" "}
                        {sig.tp?.toFixed(2)} ·{" "}
                        <span className="text-emerald-400 font-bold">RR {sig.rr?.toFixed(2)}</span>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => executeManualSignal(sig, currentSymbol)}
                      disabled={newsBlackout.isBlocked}
                      className="h-8 text-xs font-bold"
                    >
                      {newsBlackout.isBlocked ? "News Locked" : "Auto-Execute"}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execution History & Event Logs */}
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Live MT5 Automation Log Stream
            </h3>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-border/60 bg-black/50 p-3 font-mono text-[11px] leading-relaxed">
              {mt5.logs.length === 0 ? (
                <p className="text-muted-foreground/60">Engine waiting for trade signals...</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {mt5.logs.slice(0, 30).map((log) => (
                    <div key={log.id} className="flex items-start gap-2 text-xs">
                      <span className="text-muted-foreground/50 shrink-0">{log.timestamp}</span>
                      <span
                        className={cn(
                          "rounded px-1 text-[9px] font-bold uppercase shrink-0",
                          log.type.includes("ERROR")
                            ? "bg-destructive/20 text-destructive"
                            : log.type.includes("FILL")
                              ? "bg-emerald-500/20 text-emerald-400"
                              : log.type.includes("TP")
                                ? "bg-emerald-500/20 text-emerald-400"
                                : log.type.includes("WARN")
                                  ? "bg-amber-500/20 text-amber-400"
                                  : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {log.type}
                      </span>
                      <span className="text-muted-foreground font-sans break-all">
                        {log.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: RED FOLDER NEWS PROTECTION RADAR ─── */}
      {activeTab === "news" && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-red-500/40 bg-red-950/20 p-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-red-500 text-white px-2 py-0.5 text-[10px] font-black uppercase flex items-center gap-1">
                  <Flame className="size-3 fill-white" /> Red Folder News Protection
                </span>
                <h3 className="text-base font-bold text-foreground">
                  High-Impact Economic Calendar Radar
                </h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground max-w-xl">
                Automatically pauses automated trade entries{" "}
                <strong>{mt5.config.newsFilterMinutesBefore} minutes before</strong> and{" "}
                <strong>{mt5.config.newsFilterMinutesAfter} minutes after</strong> high-impact news
                events (NFP, CPI, FOMC, ECB, GDP, Interest Rates) to prevent stop loss slippage and
                extreme spread spikes.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-bold border flex items-center gap-1.5",
                  mt5.config.newsFilterEnabled
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : "bg-muted text-muted-foreground border-border",
                )}
              >
                <span
                  className={cn(
                    "size-2 rounded-full",
                    mt5.config.newsFilterEnabled ? "bg-emerald-400 animate-pulse" : "bg-muted",
                  )}
                />
                {mt5.config.newsFilterEnabled ? "News Guard ACTIVE 🛡️" : "News Guard OFF"}
              </span>
            </div>
          </div>

          {/* Upcoming High Impact Events Feed */}
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Upcoming High-Impact Economic Events (Next 48 Hours)</span>
              <span className="font-mono text-[10px] text-primary">All Times UTC</span>
            </h4>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {(mt5.upcomingNews || []).map((event) => {
                const eventDate = new Date(event.datetime);
                const isPast = eventDate.getTime() < Date.now();
                const diffMins = Math.round((eventDate.getTime() - Date.now()) / (60 * 1000));
                const isImminent = diffMins > 0 && diffMins <= mt5.config.newsFilterMinutesBefore;
                const isRecent =
                  diffMins < 0 && Math.abs(diffMins) <= mt5.config.newsFilterMinutesAfter;

                return (
                  <div
                    key={event.id}
                    className={cn(
                      "flex flex-col gap-2 rounded-xl border p-3.5 transition-all",
                      isImminent || isRecent
                        ? "border-red-500 bg-red-950/30 shadow-lg shadow-red-950/40"
                        : "border-border/70 bg-card/50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded px-2 py-0.5 text-[10px] font-black uppercase font-mono",
                            event.impact === "HIGH"
                              ? "bg-red-500/20 text-red-400 border border-red-500/40"
                              : "bg-amber-500/20 text-amber-400 border border-amber-500/40",
                          )}
                        >
                          {event.impact === "HIGH" ? "🔴 High Impact" : "🟠 Medium"}
                        </span>
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-bold text-foreground">
                          {event.currency}
                        </span>
                      </div>

                      <span
                        className={cn(
                          "text-[10px] font-mono font-bold px-2 py-0.5 rounded",
                          isImminent
                            ? "bg-red-500 text-white animate-pulse"
                            : isRecent
                              ? "bg-amber-500/30 text-amber-300"
                              : "text-muted-foreground bg-secondary/50",
                        )}
                      >
                        {isImminent
                          ? `LOCKOUT: in ${diffMins}m`
                          : isRecent
                            ? `Cool-down: ${Math.abs(diffMins)}m ago`
                            : isPast
                              ? "Completed"
                              : `in ${Math.round(diffMins / 60)}h ${diffMins % 60}m`}
                      </span>
                    </div>

                    <h5 className="text-sm font-bold text-foreground">{event.title}</h5>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono mt-1 pt-2 border-t border-border/40">
                      <span>{eventDate.toUTCString().slice(0, 22)}</span>
                      <span>
                        Forecast: {event.forecast || "—"} | Prev: {event.previous || "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 3: AUTOMATION RULES & RISK SETTINGS ─── */}
      {activeTab === "rules" && (
        <form onSubmit={handleSaveConfig} className="flex flex-col gap-6">
          {/* Risk Model & Sizing */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-secondary/20 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Position Sizing & Risk Model
              </h4>
              <div className="flex flex-col gap-1">
                <Label htmlFor="sizing-mode" className="text-[11px] text-muted-foreground">
                  Position Sizing Model
                </Label>
                <select
                  id="sizing-mode"
                  value={configForm.sizingMode}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      sizingMode: e.target.value as SizingMode,
                    })
                  }
                  className="rounded-md border border-input bg-card px-3 py-2 text-xs text-foreground font-semibold"
                >
                  <option value="risk_pct">Dynamic Risk % of Equity (Recommended)</option>
                  <option value="fixed">Fixed Lot Size</option>
                </select>
              </div>

              {configForm.sizingMode === "risk_pct" ? (
                <div className="flex flex-col gap-1">
                  <Label htmlFor="risk-pct" className="text-[11px] text-muted-foreground">
                    Risk % per Trade (Calculates Lots from SL Distance)
                  </Label>
                  <Input
                    id="risk-pct"
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="10.0"
                    value={configForm.riskPct}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        riskPct: Number(e.target.value) || 1.0,
                      })
                    }
                    className="font-mono text-sm"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <Label htmlFor="fixed-lot" className="text-[11px] text-muted-foreground">
                    Fixed Lot Size
                  </Label>
                  <Input
                    id="fixed-lot"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="50.0"
                    value={configForm.fixedLot}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        fixedLot: Number(e.target.value) || 0.1,
                      })
                    }
                    className="font-mono text-sm"
                  />
                </div>
              )}
            </div>

            {/* Execution & Risk Gates */}
            <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-secondary/20 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Execution Controls & Limits
              </h4>
              <div className="flex flex-col gap-1">
                <Label htmlFor="max-pos" className="text-[11px] text-muted-foreground">
                  Max Concurrent Open Positions
                </Label>
                <Input
                  id="max-pos"
                  type="number"
                  min="1"
                  max="20"
                  value={configForm.maxOpenPositions}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      maxOpenPositions: Number(e.target.value) || 5,
                    })
                  }
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="min-rr" className="text-[11px] text-muted-foreground">
                  Minimum Risk:Reward Ratio Threshold
                </Label>
                <Input
                  id="min-rr"
                  type="number"
                  step="0.1"
                  min="1.0"
                  max="10.0"
                  value={configForm.minRr}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      minRr: Number(e.target.value) || 2.0,
                    })
                  }
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </div>

          {/* Red Folder News Filter Protection Settings */}
          <div className="flex flex-col gap-3 rounded-xl border border-red-500/40 bg-red-950/20 p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-red-200 flex items-center gap-1.5">
                <Flame className="size-4 text-red-400" /> Red Folder Economic News Filter Settings
              </h4>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-foreground">
                <span>Enable News Guard</span>
                <input
                  type="checkbox"
                  checked={configForm.newsFilterEnabled}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      newsFilterEnabled: e.target.checked,
                    })
                  }
                  className="size-4"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 mt-1">
              <div className="flex flex-col gap-1">
                <Label htmlFor="news-before" className="text-[11px] text-muted-foreground">
                  Pre-News Lockout Window (Minutes Before Event)
                </Label>
                <Input
                  id="news-before"
                  type="number"
                  min="5"
                  max="180"
                  value={configForm.newsFilterMinutesBefore}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      newsFilterMinutesBefore: Number(e.target.value) || 30,
                    })
                  }
                  className="font-mono text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="news-after" className="text-[11px] text-muted-foreground">
                  Post-News Cool-Down Window (Minutes After Event)
                </Label>
                <Input
                  id="news-after"
                  type="number"
                  min="5"
                  max="180"
                  value={configForm.newsFilterMinutesAfter}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      newsFilterMinutesAfter: Number(e.target.value) || 30,
                    })
                  }
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </div>

          {/* Strategy Whitelist Selector */}
          <div className="flex flex-col gap-2.5">
            <Label className="text-xs font-bold uppercase tracking-wide text-foreground">
              Active Strategies for Auto-Execution (Production 9)
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {FINAL_TRADE_STRATEGIES.map((strat) => {
                const isChecked = configForm.strategies.includes(strat.id);
                return (
                  <label
                    key={strat.id}
                    className={cn(
                      "flex items-center justify-between rounded-xl border p-3 cursor-pointer text-xs font-semibold transition-all",
                      isChecked
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border/60 bg-secondary/20 text-muted-foreground hover:bg-secondary/40",
                    )}
                  >
                    <span>{strat.name}</span>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleStrategy(strat.id)}
                      className="size-4"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end border-t border-border/60 pt-4">
            <Button type="submit" className="font-bold">
              Save Automation Rules
            </Button>
          </div>
        </form>
      )}

      {/* ─── TAB 4: MT5 LOGIN & REAL-TRADE BRIDGE (RECOMMENDED) ─── */}
      {activeTab === "bridge" && (
        <div className="flex flex-col gap-5">
          {/* Mode switch */}
          <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-secondary/20 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Execution Mode
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  if (mt5.credentials.bridgeMode !== "simulated") {
                    saveMT5Credentials({ bridgeMode: "simulated" });
                  }
                }}
                className={cn(
                  "rounded-xl border p-3 text-left transition-all",
                  !isBridgeMode
                    ? "border-yellow-500/60 bg-yellow-500/10"
                    : "border-border/60 bg-card hover:bg-secondary/40",
                )}
              >
                <span className="text-xs font-black uppercase text-yellow-400">
                  🟡 Simulation Mode
                </span>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Strategy signals run for real; execution is simulated in the browser. Safe way to
                  watch the system without a broker connection.
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (mt5.credentials.bridgeMode !== "mql5_ea") {
                    saveMT5Credentials({ bridgeMode: "mql5_ea" });
                  }
                }}
                className={cn(
                  "rounded-xl border p-3 text-left transition-all",
                  isBridgeMode
                    ? "border-emerald-500/60 bg-emerald-500/10"
                    : "border-border/60 bg-card hover:bg-secondary/40",
                )}
              >
                <span className="text-xs font-black uppercase text-emerald-400">
                  🟢 Real-Trade Bridge Mode
                </span>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Orders queue on this server and execute on your real MT5 terminal through the
                  SignalFinderBridge EA. Requires the 4-step setup below.
                </p>
              </button>
            </div>
          </div>

          {/* MT5 account identity (login happens inside the MT5 app itself) */}
          <form onSubmit={handleSaveLogin} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mt5-login" className="text-xs font-bold uppercase tracking-wider">
                  MT5 Account Login Number
                </Label>
                <Input
                  id="mt5-login"
                  value={loginForm.login}
                  onChange={(e) => setLoginForm({ ...loginForm, login: e.target.value })}
                  placeholder="e.g. 50198421"
                  className="font-mono text-sm"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mt5-server" className="text-xs font-bold uppercase tracking-wider">
                  MT5 Broker Server
                </Label>
                <Input
                  id="mt5-server"
                  value={loginForm.server}
                  onChange={(e) => setLoginForm({ ...loginForm, server: e.target.value })}
                  placeholder="e.g. MetaQuotes-Demo or ICMarketsSC-Live"
                  className="font-mono text-sm"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isConnecting} className="font-bold">
                {isConnecting ? "Saving..." : "Save MT5 Account Details"}
              </Button>
            </div>
          </form>

          {/* Bridge EA download + endpoints */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5">
            <div>
              <h3 className="text-base font-bold text-foreground">SignalFinderBridge.mq5</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-xl">
                The bridge EA polls this server with your account token, sends live account
                telemetry, and executes the queued orders (Auto Entry, SL, TP) on your terminal.
              </p>
            </div>
            <Button
              asChild
              className="font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg"
            >
              <a href="/api/mt5/ea?type=bridge" download="SignalFinderBridge.mq5">
                <Download className="mr-2 size-4" /> Download Bridge EA
              </a>
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-secondary/30 p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Bridge Webhook URL
              </span>
              <div className="flex items-center gap-2 mt-1">
                <Input readOnly value={bridgeUrl} className="font-mono text-xs bg-card" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(bridgeUrl, "Bridge URL")}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-secondary/30 p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Authorization Token
              </span>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  readOnly
                  value={mt5.credentials.apiToken || "sfp-default-token"}
                  className="font-mono text-xs bg-card"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(mt5.credentials.apiToken || "", "Auth Token")}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-200/90">
            <strong className="text-amber-200 uppercase tracking-wide text-[10px] mr-2">
              Token rotation
            </strong>
            The bridge token changes when the server restarts. If the EA journal shows{" "}
            <code className="font-mono">HTTP 401</code>, re-download the EA above and attach it
            again — the fresh file always embeds the current token.
          </div>

          {/* 4-step setup */}
          <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-secondary/30 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Zap className="size-4 text-emerald-400" /> Real-Trade Setup in 4 Steps
            </h4>
            <ol className="flex flex-col gap-2 text-xs text-muted-foreground list-decimal pl-4">
              <li>
                <strong className="text-foreground">Log in inside the MT5 app itself</strong> (File
                → Login to Trade Account). Your password stays in MT5 — this web app never asks for
                it or stores it.
              </li>
              <li>
                Download <code className="text-primary font-mono">SignalFinderBridge.mq5</code> and
                place it in{" "}
                <code className="font-mono text-foreground">
                  File → Open Data Folder → MQL5 → Experts
                </code>
                , then refresh Expert Advisors in MT5.
              </li>
              <li>
                Whitelist the bridge URL:{" "}
                <code className="font-mono text-foreground">Tools → Options → Expert Advisors</code>{" "}
                → check <em>"Allow WebRequest for listed URL"</em> and add{" "}
                <code className="font-mono text-primary">{bridgeUrl}</code>.
              </li>
              <li>
                Drag the EA onto your <strong>XAUUSD M30</strong> chart, enable{" "}
                <strong>Algo Trading</strong>, and the dashboard switches to 🟢 Bridge Mode with
                your live account state.
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* ─── TAB 5: 24/7 STANDALONE MT5 EA (OFFLINE CAPABLE) ─── */}
      {activeTab === "standalone_ea" && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-emerald-500 text-black px-2 py-0.5 text-[10px] font-black uppercase">
                  100% Offline Capable
                </span>
                <span className="rounded bg-red-500 text-white px-2 py-0.5 text-[10px] font-black uppercase">
                  🔴 Built-In Red Folder News Filter
                </span>
                <h3 className="text-base font-bold text-foreground">
                  SignalFinderPro_247_Autotrader.mq5
                </h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Embeds all 9 strategy algorithms and <strong>Red Folder News Protection</strong>{" "}
                directly inside MetaTrader 5. Once attached to your MT5 chart (on PC or $5/mo VPS),
                it executes{" "}
                <strong>
                  Auto Entry, Auto SL, Auto TP and pauses on High-Impact News 24/7/365
                </strong>{" "}
                with zero dependency on your browser or phone!
              </p>
            </div>
            <Button
              asChild
              className="font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg"
            >
              <a href="/api/mt5/ea?type=standalone" download="SignalFinderPro_247_Autotrader.mq5">
                <Download className="mr-2 size-4" /> Download 24/7 Standalone EA
              </a>
            </Button>
          </div>

          {/* Honest port disclosure */}
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-200/90">
            <strong className="text-amber-200 uppercase tracking-wide text-[10px] mr-2">
              Honest note
            </strong>
            This standalone file is a native MQL5 re-implementation of the strategies — it is NOT
            the exact TypeScript engine that produces signals in this web app, so small drift is
            possible. For exact parity with the signals you see here, use the{" "}
            <button
              type="button"
              className="font-bold underline underline-offset-2 text-amber-100"
              onClick={() => setActiveTab("bridge")}
            >
              Real-Trade Bridge
            </button>{" "}
            instead.
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-secondary/30 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Cpu className="size-4 text-emerald-400" /> Standalone MT5 EA Features
              </h4>
              <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground list-disc pl-4">
                <li>
                  <strong className="text-foreground">Runs 24/7 inside MT5:</strong> Works when your
                  computer is sleeping, closed, or offline (on a VPS or PC).
                </li>
                <li>
                  <strong className="text-foreground">🔴 Red Folder News Filter:</strong> Uses MT5
                  Economic Calendar to pause trading before/after High Impact news.
                </li>
                <li>
                  <strong className="text-foreground">Dynamic Lot Sizing:</strong> Automatically
                  calculates lot size based on account equity and stop loss points.
                </li>
                <li>
                  <strong className="text-foreground">Built-in Auto SL & TP:</strong> Sets
                  strategy-defined stop losses and profit targets on every order.
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-secondary/30 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Zap className="size-4 text-primary" /> Setup in 2 Minutes
              </h4>
              <ol className="flex flex-col gap-2 text-xs text-muted-foreground list-decimal pl-4">
                <li>
                  Download{" "}
                  <code className="text-primary font-mono">SignalFinderPro_247_Autotrader.mq5</code>
                </li>
                <li>
                  In MT5, click{" "}
                  <code className="font-mono text-foreground">
                    File → Open Data Folder → MQL5 → Experts
                  </code>{" "}
                  and paste the file.
                </li>
                <li>
                  Restart MT5 or right-click <strong>Expert Advisors → Refresh</strong>.
                </li>
                <li>
                  Drag the EA onto your chart (e.g. <strong>XAUUSD M30</strong>), enable{" "}
                  <strong>Algo Trading</strong>, and you're set!
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 6: 24/7 SERVER DAEMON (REAL FEED) ─── */}
      {activeTab === "cloud_daemon" && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/30 bg-primary/10 p-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-primary text-primary-foreground px-2 py-0.5 text-[10px] font-black uppercase">
                  Server Daemon
                </span>
                <h3 className="text-base font-bold text-foreground">
                  24/7 Real-Candle Background Engine
                </h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
                Runs inside this app's server process (not the browser). On every closed 30-minute
                bar it fetches real candles from the configured provider, runs the exact 9
                production strategies, and dispatches signals to the engine — respecting Red Folder
                news blackouts. With no provider key configured it fetches nothing and says so.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex size-3 relative">
                {daemon?.isRunning && (
                  <span className="animate-ping absolute inline-flex size-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={cn(
                    "relative inline-flex rounded-full size-3",
                    daemon?.isRunning ? "bg-emerald-500" : "bg-muted-foreground/50",
                  )}
                ></span>
              </span>
              <span
                className={cn(
                  "text-xs font-bold",
                  daemon?.isRunning ? "text-emerald-400" : "text-muted-foreground",
                )}
              >
                {daemon
                  ? daemon.isRunning
                    ? "Daemon running"
                    : "Daemon stopped"
                  : "Server unreachable"}
              </span>
            </div>
          </div>

          {/* No-key warning — honest instead of a fake "always active" card */}
          {daemon && !daemon.hasProviderKey && (
            <div className="rounded-xl border border-amber-500/50 bg-amber-950/30 px-4 py-3 text-xs text-amber-200">
              <strong className="uppercase tracking-wide text-[10px] mr-2">
                ⚠️ No candle provider key
              </strong>
              The server has no Twelve Data key configured, so the daemon cannot fetch real candles.
              Set <code className="font-mono">TWELVE_DATA_API_KEY</code> (or{" "}
              <code className="font-mono">TWELVE_DATA_API_KEYS</code>) in the server's{" "}
              <code className="font-mono">.env</code> and restart. Until then, positions keep their
              last real price and the daemon retries every 15 minutes.
            </div>
          )}

          {/* Real feed table */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Real Candle Feed ({daemon?.feed?.length ?? 0} symbol
                {(daemon?.feed?.length ?? 0) === 1 ? "" : "s"})
              </h4>
              {daemon?.lastTickAt && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  Last check: {new Date(daemon.lastTickAt).toLocaleTimeString()}
                </span>
              )}
            </div>

            {!daemon || !daemon.feed || daemon.feed.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-secondary/10 p-6 text-center text-xs text-muted-foreground">
                No feed data yet — the daemon reports its first real close after the next closed
                30-minute bar (or immediately after a restart once a provider key is configured).
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border/70 bg-card">
                <table className="w-full text-left text-xs">
                  <thead className="bg-secondary/50 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-3">Symbol</th>
                      <th className="p-3">Last Real Close</th>
                      <th className="p-3">Bar Time</th>
                      <th className="p-3">Last Fetch</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 font-mono">
                    {daemon.feed.map((row) => (
                      <tr key={row.symbol} className="hover:bg-secondary/20 transition-colors">
                        <td className="p-3 font-bold text-foreground">{row.symbol}</td>
                        <td className="p-3 text-foreground">
                          {row.lastRealClose !== null ? row.lastRealClose.toFixed(2) : "—"}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {row.barTime ? new Date(row.barTime).toLocaleTimeString() : "—"}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {row.lastFetchAt ? new Date(row.lastFetchAt).toLocaleTimeString() : "—"}
                        </td>
                        <td className="p-3">
                          <span
                            className={cn(
                              "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
                              row.status === "ok"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : row.status === "idle"
                                  ? "bg-secondary text-muted-foreground"
                                  : "bg-destructive/20 text-destructive",
                            )}
                            title={row.detail ?? undefined}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {daemon && (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 text-center">
                <div className="rounded-xl border border-border/60 bg-secondary/40 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Bar Checks
                  </span>
                  <p className="num mt-0.5 text-lg font-bold text-foreground">{daemon.tickCount}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-secondary/40 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Signals Detected
                  </span>
                  <p className="num mt-0.5 text-lg font-bold text-primary">
                    {daemon.signalsDetectedCount}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-secondary/40 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Trades Executed
                  </span>
                  <p className="num mt-0.5 text-lg font-bold text-emerald-400">
                    {daemon.tradesExecutedCount}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-secondary/40 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Started
                  </span>
                  <p className="num mt-0.5 text-sm font-bold text-foreground">
                    {daemon.startedAt ? new Date(daemon.startedAt).toLocaleTimeString() : "—"}
                  </p>
                </div>
              </div>
            )}

            {daemon?.lastError && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-xs text-destructive font-mono">
                Last error: {daemon.lastError}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
