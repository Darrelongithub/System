import { test } from "node:test";
import assert from "node:assert/strict";
import { entryTimeBlock, observeEquity } from "../src/lib/mt5/risk.ts";
import { MT5TradingEngine } from "../src/lib/mt5/engine.ts";
import { newsManager } from "../src/lib/mt5/news-filter.ts";
import { generateMql5EaSource } from "../src/lib/mt5/mql5-ea.ts";

const time = (s) => Date.parse(s);
test("EAT rollover and Friday blackout use correct boundaries", () => {
  const gate = (t) => entryTimeBlock(time(t), true, 0, 65, true, 23 * 60 + 30);
  assert.equal(gate("2026-11-23T20:59:59Z"), null);
  assert.match(gate("2026-11-23T21:00:00Z"), /rollover/);
  assert.equal(gate("2026-11-23T22:05:00Z"), null);
  assert.equal(gate("2026-11-27T18:29:59Z"), null);
  assert.match(gate("2026-11-27T18:30:00Z"), /Friday/);
});

test("daily lock latches to next EAT day and total lock is permanent", () => {
  const now = time("2026-11-23T10:00:00Z");
  let r = observeEquity(null, now, 10000, 10000, 2, 6, -3);
  r = observeEquity(r, now + 1, 9800, 10000, 2, 6, -3);
  assert.equal(r.dailyLocked, true);
  r = observeEquity(r, now + 2, 10000, 10000, 2, 6, -3);
  assert.equal(r.dailyLocked, true);
  r = observeEquity(r, time("2026-11-23T21:01:00Z"), 10000, 10000, 2, 6, -3);
  assert.equal(r.dailyLocked, false);
  r = observeEquity(r, time("2026-11-23T21:02:00Z"), 9400, 10000, 2, 6, -3);
  assert.equal(r.totalLocked, true);
  assert.equal(
    observeEquity(r, time("2026-11-24T21:01:00Z"), 10000, 10000, 2, 6, -3).totalLocked,
    true,
  );
});

const brokerPosition = {
  ticket: 9876,
  symbol: "XAUUSD",
  type: "BUY",
  volume: 0.1,
  openPrice: 2650,
  currentPrice: 2648,
  sl: 2640,
  tp: 2670,
  profit: -20,
  comment: "test",
  magic: 992200,
};
const tick = {
  balance: 10000,
  equity: 10000,
  quoteSymbol: "XAUUSD",
  bid: 2650,
  ask: 2650.2,
  dailyRealizedR: 0,
  consecutiveLosses: 0,
  positions: [brokerPosition],
};
test("broker daily breach queues a close, latches, and does not invent a confirmed close", () => {
  const e = new MT5TradingEngine();
  e.setCredentials({ bridgeMode: "mql5_ea" });
  e.syncFromEa(tick);
  e.syncFromEa({ ...tick, equity: 9799 });
  assert.equal(e.getRiskStatus().dailyLocked, true);
  assert.equal(e.getPendingCommands()[0].action, "CLOSE");
  assert.equal(e.getPositions()[0].ticket, 9876);
  e.syncFromEa({ ...tick, equity: 10000 });
  assert.equal(e.getRiskStatus().dailyLocked, true);
  assert.equal(e.getPendingCommands().length, 1);
});

test("pre-news protection uses MODIFY only for profitable affected positions", () => {
  const e = new MT5TradingEngine();
  e.setCredentials({ bridgeMode: "mql5_ea" });
  e.setConfig({ newsFilterEnabled: true, preNewsAction: "breakeven_if_profit" });
  newsManager.setEvents([
    {
      id: "release",
      title: "CPI",
      currency: "USD",
      impact: "HIGH",
      datetime: new Date(Date.now() + 600000).toISOString(),
    },
  ]);
  e.syncFromEa({ ...tick, positions: [{ ...brokerPosition, profit: 50 }] });
  const cmd = e.getPendingCommands()[0];
  assert.equal(cmd.action, "MODIFY");
  assert.equal(cmd.sl, 2650);
  assert.equal(cmd.ticket, 9876);
});

test("acknowledgments remove only named commands; terminal has restart-safe claim and independent guards", () => {
  const e = new MT5TradingEngine();
  e.setCredentials({ bridgeMode: "mql5_ea" });
  e.syncFromEa(tick);
  e.closePosition(9876);
  const id = e.getPendingCommands()[0].id;
  e.acknowledgeCommands(["unrelated"]);
  assert.equal(e.getPendingCommands().length, 1);
  e.acknowledgeCommands([id]);
  assert.equal(e.getPendingCommands().length, 0);
  const source = generateMql5EaSource({});
  for (const token of [
    "GlobalVariablesFlush()",
    "ClaimCommand",
    "CheckDailyDrawdown()",
    "CheckTotalDrawdown()",
    "CalendarValueHistory",
    "EatEntryBlackout()",
    "dailyRealizedR",
    "PositionModify",
    "quoteSymbol",
  ])
    assert.ok(source.includes(token), token);
});

test("risk amount sizing uses multiplier and refuses a budget below minimum lot", () => {
  const e = new MT5TradingEngine();
  e.setConfig({
    enabled: true,
    strategies: [],
    sizingMode: "risk_amount",
    maxRiskAmount: 100,
    newsFilterEnabled: false,
    rolloverEnabled: false,
    fridayCloseEnabled: false,
  });
  const signal = {
    strategyId: "s",
    strategy: "s",
    result: "PASS",
    entry: 2650,
    sl: 2640,
    tp: 2675,
    side: "long",
    rr: 2.5,
    datetime: "2026-11-23T10:00:00Z",
    riskMultiplier: 0.5,
  };
  assert.equal(e.handleLiveStrategySignal(signal, "XAU/USD").volume, 0.05);
  e.setConfig({ maxRiskAmount: 1 });
  assert.equal(
    e.handleLiveStrategySignal({ ...signal, datetime: "2026-11-23T10:30:00Z" }, "XAU/USD"),
    null,
  );
});

test("daily R and loss streak reported by terminal block new entries", () => {
  const e = new MT5TradingEngine();
  e.setCredentials({ bridgeMode: "mql5_ea" });
  e.setConfig({
    enabled: true,
    newsFilterEnabled: false,
    rolloverEnabled: false,
    fridayCloseEnabled: false,
  });
  e.syncFromEa({ ...tick, positions: [], dailyRealizedR: -3.1 });
  assert.equal(e.getRiskStatus().dailyLocked, true);
  const result = e.placeOrder({
    symbol: "XAUUSD",
    type: "BUY",
    volume: 0.1,
    strategyId: "s",
    strategyName: "s",
    sl: 2640,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /daily loss/);
});

test("missing quote or R fails closed and invalid limits are rejected", () => {
  const e = new MT5TradingEngine();
  e.setCredentials({ bridgeMode: "mql5_ea" });
  e.setConfig({
    enabled: true,
    newsFilterEnabled: false,
    rolloverEnabled: false,
    fridayCloseEnabled: false,
  });
  e.syncFromEa({ balance: 10000, equity: 10000, positions: [] });
  assert.match(
    e.placeOrder({ symbol: "XAUUSD", type: "BUY", volume: 0.1, strategyId: "s", strategyName: "s" })
      .error,
    /quote/,
  );
  e.syncFromEa({ ...tick, positions: [], dailyRealizedR: undefined });
  assert.match(
    e.placeOrder({ symbol: "XAUUSD", type: "BUY", volume: 0.1, strategyId: "s", strategyName: "s" })
      .error,
    /daily R/,
  );
  assert.throws(() => e.setConfig({ maxDailyLossPct: 0 }));
});
