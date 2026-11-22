import { test, assert, assertEqual } from "./tiny.mjs";
import { entryTimeBlock, observeEquity } from "../src/lib/mt5/risk.ts";
import { MT5TradingEngine } from "../src/lib/mt5/engine.ts";

test("mt5 risk: EAT boundaries and latched equity limits", () => {
  const t = Date.parse("2026-11-27T18:30:00Z");
  assert(entryTimeBlock(t, true, 0, 65, true, 1410)?.includes("Friday"), "Friday blackout");
  let state = observeEquity(null, t, 10000, 10000, 2, 6, -3);
  state = observeEquity(state, t + 1, 9800, 10000, 2, 6, -3);
  assertEqual(state.dailyLocked, true, "daily drawdown latches");
  state = observeEquity(state, t + 2, 10000, 10000, 2, 6, -3);
  assertEqual(state.dailyLocked, true, "equity recovery does not unlock");
});

test("mt5 risk: unknown broker R or quote fails closed", () => {
  const e = new MT5TradingEngine();
  e.setCredentials({ bridgeMode: "mql5_ea" });
  e.setConfig({
    enabled: true,
    newsFilterEnabled: false,
    rolloverEnabled: false,
    fridayCloseEnabled: false,
  });
  e.syncFromEa({ balance: 10000, equity: 10000, positions: [] });
  const result = e.placeOrder({
    symbol: "XAUUSD",
    type: "BUY",
    volume: 0.1,
    strategyId: "s",
    strategyName: "s",
  });
  assertEqual(result.ok, false, "missing live quote blocks");
});
