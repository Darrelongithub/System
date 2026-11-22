import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recoveryGainNeeded,
  halfKellyFraction,
  drawdownBrake,
  stackMultiplier,
  empiricalExpectedShortfall,
  parametricExpectedShortfall975,
  tradeRiskMetrics,
} from "../src/lib/mt5/crash-guard.ts";
import { MT5TradingEngine } from "../src/lib/mt5/engine.ts";
import { DEFAULT_MT5_CONFIG } from "../src/lib/mt5/types.ts";
import { V2_STRATEGY_IDS } from "../src/lib/analyzer/strategies/v2-regime-bots.ts";
import { createTelegramController } from "../src/lib/mt5/telegram-notify.ts";

const near = (a, b, tol = 1e-8) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
test("recovery and half-Kelly formulas handle boundaries and invalid inputs", () => {
  near(recoveryGainNeeded(0.2), 0.25);
  assert.equal(recoveryGainNeeded(1), Infinity);
  assert.throws(() => recoveryGainNeeded(1.01));
  near(halfKellyFraction(0.6, 2), 0.2);
  assert.equal(halfKellyFraction(0.2, 1), 0);
  assert.throws(() => halfKellyFraction(0.5, 0));
});
test("stepped brake and configurable hard floor observe exact boundaries", () => {
  for (const [equity, w] of [
    [9701, 1],
    [9700, 0.75],
    [9500, 0.5],
    [9200, 0.25],
    [9000, 0],
  ])
    assert.equal(drawdownBrake(10000, equity, 20).multiplier, w);
  assert.equal(drawdownBrake(10000, 9400, 6).multiplier, 0);
  assert.equal(drawdownBrake(10000, 9950, 20, [1, 2, 3, 4], [1, 0.8, 0.6, 0.4, 0]).multiplier, 1);
  assert.throws(() => drawdownBrake(10000, 9900, 20, [3, 3, 8, 10]));
  assert.deepEqual(
    [0, 1, 2, 3].map((x) => stackMultiplier(x)),
    [1, 0.75, 0.5, 0],
  );
});
test("empirical fractional tail and Gaussian 97.5 ES are exact in loss R units", () => {
  const losses = [...Array(39).fill(1), 10];
  near(empiricalExpectedShortfall(losses), 10);
  near(empiricalExpectedShortfall([1, 2, 3], 0.5), 8 / 3);
  near(parametricExpectedShortfall975(1, 2), 5.675605584402);
  assert.equal(empiricalExpectedShortfall([]), null);
  assert.throws(() => empiricalExpectedShortfall([NaN]));
  assert.equal(tradeRiskMetrics(Array(29).fill(1)).halfKellyPct, null);
  assert.equal(tradeRiskMetrics(Array(30).fill(1)).halfKellyPct, 0);
});
test("three same-side risk amounts decay to 1 / .75 / .5", () => {
  const e = new MT5TradingEngine();
  e.setConfig({
    enabled: true,
    strategies: [],
    newsFilterEnabled: false,
    rolloverEnabled: false,
    fridayCloseEnabled: false,
    sizingMode: "risk_amount",
    maxRiskAmount: 1000,
    maxOpenPositions: 3,
  });
  const signal = {
    result: "PASS",
    strategyId: "s",
    strategy: "s",
    side: "long",
    entry: 2650,
    sl: 2640,
    tp: 2680,
    rr: 3,
  };
  const volumes = [1, 2, 3].map(
    (i) =>
      e.handleLiveStrategySignal({ ...signal, datetime: `2026-12-01T0${i}:00:00Z` }, "XAU/USD")
        ?.volume,
  );
  assert.deepEqual(volumes, [1, 0.75, 0.5]);
  assert.equal(DEFAULT_MT5_CONFIG.strategies.length, V2_STRATEGY_IDS.length);
});
const tick = {
  balance: 10000,
  equity: 10000,
  quoteSymbol: "XAUUSD",
  bid: 2650,
  ask: 2650.2,
  dailyRealizedR: 0,
  closedTradeCount: 0,
  consecutiveLosses: 0,
  positions: [],
};
test("confirmed broker samples activate hard half-Kelly cap and survive snapshot", () => {
  const e = new MT5TradingEngine();
  e.setCredentials({ bridgeMode: "mql5_ea" });
  e.setConfig({
    enabled: true,
    strategies: [],
    newsFilterEnabled: false,
    rolloverEnabled: false,
    fridayCloseEnabled: false,
    riskPct: 40,
  });
  const samples = Array.from({ length: 30 }, (_, i) => ({
    id: String(1000 + i),
    r: i < 20 ? 1 : -1,
    pnl: i < 20 ? 100 : -100,
    closedAt: Date.now() - 600000 - i,
  }));
  e.syncFromEa({ ...tick, closedTradeCount: 30, closedRiskSamples: samples });
  near(e.getCrashGuardStatus().halfKellyPct, 100 / 6);
  const signal = {
    result: "PASS",
    strategyId: "s",
    strategy: "s",
    side: "long",
    entry: 2650,
    sl: 2649,
    tp: 2654,
    rr: 4,
    datetime: "2026-12-01T08:00:00Z",
  };
  const result = e.handleLiveStrategySignal(signal, "XAUUSD");
  assert.ok(result?.ok);
  assert.ok(result.volume * 1.2 * 100 <= 10000 / 6 + 1e-6);
  assert.equal(
    e.placeOrder({
      id: "too-large",
      symbol: "XAUUSD",
      type: "BUY",
      volume: 50,
      price: 2650,
      sl: 2649,
      strategyId: "s",
      strategyName: "s",
    }).ok,
    false,
  );
  const restored = new MT5TradingEngine();
  restored.restoreRuntimeState(e.exportRuntimeState());
  assert.equal(restored.getCrashGuardStatus().count, 30);
  near(restored.getCrashGuardStatus().peakEquity, 10000);
});
test("telegram authorizes chat, handles status/pause/kill and latches flatten across restart", async () => {
  const e = new MT5TradingEngine();
  e.setCredentials({ bridgeMode: "mql5_ea" });
  e.setConfig({
    enabled: true,
    newsFilterEnabled: false,
    rolloverEnabled: false,
    fridayCloseEnabled: false,
  });
  e.syncFromEa({
    ...tick,
    positions: [
      {
        ticket: 71,
        symbol: "XAUUSD",
        type: "BUY",
        volume: 0.1,
        openPrice: 2650,
        currentPrice: 2650,
        sl: 2640,
        tp: 2670,
        profit: 0,
        comment: "live",
        magic: 992200,
      },
    ],
  });
  const now = Date.now(),
    sent = [];
  const updates = [
    { update_id: 1, message: { chat: { id: 999 }, text: "/kill", date: Math.floor(now / 1000) } },
    { update_id: 2, message: { chat: { id: 123 }, text: "/status", date: Math.floor(now / 1000) } },
    { update_id: 3, message: { chat: { id: 123 }, text: "/pause", date: Math.floor(now / 1000) } },
    { update_id: 4, message: { chat: { id: 123 }, text: "/kill", date: Math.floor(now / 1000) } },
  ];
  const fetcher = async (url, opts) =>
    url.includes("getUpdates")
      ? new Response(JSON.stringify({ ok: true, result: updates }))
      : (sent.push(JSON.parse(opts.body).text), new Response("{}"));
  const c = createTelegramController({
    token: "123:mock-token",
    allowedChatId: "123",
    engine: e,
    daemonHealth: () => "running",
    fetcher,
    now: () => now,
  });
  await c.pollOnce();
  assert.equal(sent.length, 3);
  assert.match(sent[0], /Equity/);
  assert.equal(e.getConfig().enabled, false);
  assert.ok(e.getPendingCommands().some((x) => x.action === "CLOSE" && x.ticket === 71));
  assert.equal(e.getTelegramOffset(), 5);
  assert.equal(e.resumeTrading(), false);
  const restored = new MT5TradingEngine();
  restored.restoreRuntimeState(e.exportRuntimeState());
  assert.equal(restored.getConfig().enabled, false);
  assert.throws(() => restored.setConfig({ enabled: true }));
});
test("unauthorized telegram messages never issue actions", async () => {
  const e = new MT5TradingEngine();
  e.setConfig({ enabled: true, newsFilterEnabled: false });
  const now = Date.now(),
    sent = [];
  const fetcher = async (url, opts) =>
    url.includes("getUpdates")
      ? new Response(
          JSON.stringify({
            ok: true,
            result: [
              {
                update_id: 5,
                message: { chat: { id: 999 }, text: "/kill", date: Math.floor(now / 1000) },
              },
            ],
          }),
        )
      : (sent.push(opts), new Response("{}"));
  const c = createTelegramController({
    token: "123:mock-token",
    allowedChatId: "123",
    engine: e,
    daemonHealth: () => "running",
    fetcher,
    now: () => now,
  });
  await c.pollOnce();
  assert.equal(e.getConfig().enabled, true);
  assert.equal(sent.length, 0);
});

test("brake reduces cash risk and restores it as equity recovers without unlocking a hard breach", () => {
  const e = new MT5TradingEngine();
  e.setCredentials({ bridgeMode: "mql5_ea" });
  e.setConfig({
    enabled: true,
    strategies: [],
    newsFilterEnabled: false,
    rolloverEnabled: false,
    fridayCloseEnabled: false,
    maxDailyLossPct: 20,
    maxTotalDrawdownPct: 20,
    sizingMode: "risk_amount",
    maxRiskAmount: 1000,
  });
  e.syncFromEa(tick);
  e.syncFromEa({ ...tick, equity: 9600 });
  assert.equal(e.getCrashGuardStatus().multiplier, 0.75);
  const signal = {
    result: "PASS",
    strategyId: "s",
    strategy: "s",
    side: "long",
    entry: 2650,
    sl: 2640,
    tp: 2680,
    rr: 3,
    datetime: "2026-12-01T08:00:00Z",
  };
  const result = e.handleLiveStrategySignal(signal, "XAUUSD");
  assert.ok(result?.ok);
  assert.ok(result.volume * 10.2 * 100 <= 750 + 1e-6);
  e.syncFromEa({ ...tick, equity: 9950 });
  assert.equal(e.getCrashGuardStatus().multiplier, 1);
  assert.equal(e.exportRuntimeState().peakEquity, 10000);
});
test("unknown or incomplete broker trade history fails closed for live entries", () => {
  const e = new MT5TradingEngine();
  e.setCredentials({ bridgeMode: "mql5_ea" });
  e.setConfig({
    enabled: true,
    newsFilterEnabled: false,
    rolloverEnabled: false,
    fridayCloseEnabled: false,
  });
  e.syncFromEa({ ...tick, closedTradeCount: undefined });
  assert.match(
    e.placeOrder({
      symbol: "XAUUSD",
      type: "BUY",
      volume: 0.1,
      price: 2650,
      sl: 2640,
      strategyId: "s",
      strategyName: "s",
    }).error,
    /history unavailable/,
  );
  e.syncFromEa({
    ...tick,
    closedTradeCount: 30,
    closedRiskSamples: [{ id: "123", r: 1, pnl: 1, closedAt: Date.now() - 200000 }],
  });
  assert.equal(e.getCrashGuardStatus().halfKellyPct, 0);
  assert.match(
    e.placeOrder({
      symbol: "XAUUSD",
      type: "BUY",
      volume: 0.1,
      price: 2650,
      sl: 2640,
      strategyId: "s",
      strategyName: "s",
    }).error,
    /Half-Kelly/,
  );
});
test("Telegram resume is refused when a hard loss lock is active", async () => {
  const e = new MT5TradingEngine();
  e.setCredentials({ bridgeMode: "mql5_ea" });
  e.setConfig({
    enabled: true,
    newsFilterEnabled: false,
    rolloverEnabled: false,
    fridayCloseEnabled: false,
  });
  e.syncFromEa(tick);
  e.syncFromEa({ ...tick, equity: 9300 });
  const now = Date.now(),
    sent = [];
  const fetcher = async (url, opts) =>
    url.includes("getUpdates")
      ? new Response(
          JSON.stringify({
            ok: true,
            result: [
              {
                update_id: 1,
                message: { chat: { id: 123 }, text: "/resume", date: Math.floor(now / 1000) },
              },
            ],
          }),
        )
      : (sent.push(JSON.parse(opts.body).text), new Response("{}"));
  const c = createTelegramController({
    token: "123:mock-token",
    allowedChatId: "123",
    engine: e,
    daemonHealth: () => "running",
    fetcher,
    now: () => now,
  });
  await c.pollOnce();
  assert.equal(e.getConfig().enabled, false);
  assert.match(sent[0], /refused/);
});

test("broker identity mismatch cannot contaminate equity peak or live samples", () => {
  const e = new MT5TradingEngine();
  e.setCredentials({ bridgeMode: "mql5_ea", login: "123", server: "Demo" });
  e.syncFromEa({ ...tick, login: "123", server: "Demo" });
  assert.equal(e.getCrashGuardStatus().peakEquity, 10000);
  e.syncFromEa({
    ...tick,
    login: "456",
    server: "Demo",
    equity: 20000,
    closedTradeCount: 30,
    closedRiskSamples: [{ id: "1", r: 1, pnl: 1, closedAt: Date.now() }],
  });
  assert.equal(e.getCrashGuardStatus().peakEquity, 10000);
  assert.equal(e.getCrashGuardStatus().count, 0);
  assert.equal(e.getAccountInfo().connected, false);
  assert.equal(e.matchesBrokerIdentity("123", "Demo"), true);
  assert.equal(e.matchesBrokerIdentity("456", "Demo"), false);
});
