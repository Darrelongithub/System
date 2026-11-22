/**
 * MT5 v2.0 live-execution parity gate.
 *
 * Guards the live edges that parity-exact live execution depends on:
 *  - DEFAULT_MT5_CONFIG ships exactly the 8 v2 regime-routed strategies;
 *  - the rolling-drawdown riskMultiplier throttles risk_pct sizing (0.5 → half risk);
 *  - opposite-side self-hedging is blocked at the engine level;
 *  - the max 3 same-side stack per symbol is enforced;
 *  - the Bridge EA source executes multi-command bridge payloads (cursor loop)
 *    and guards fills with HasOppositePositionOpen (terminal-level anti-hedge).
 */
import { test, assert, assertEqual, assertDeepEqual } from "./tiny.mjs";
import { DEFAULT_MT5_CONFIG } from "../src/lib/mt5/types.ts";
import { mt5Engine } from "../src/lib/mt5/engine.ts";
import { newsManager } from "../src/lib/mt5/news-filter.ts";
import { generateMql5EaSource } from "../src/lib/mt5/mql5-ea.ts";
import {
  V2_STRATEGY_IDS,
  V2_TRADE_STRATEGIES,
} from "../src/lib/analyzer/strategies/v2-regime-bots.ts";

/** Build a v2 PASS row exactly as the analyzer would emit one. */
function v2Signal({ strategyId, datetime, side = "long", riskMultiplier, entry, sl, tp }) {
  return {
    strategyId,
    strategy: V2_TRADE_STRATEGIES.find((s) => s.id === strategyId)?.name ?? strategyId,
    index: 100,
    datetime,
    result: "PASS",
    reason: "synthetic parity signal",
    trend: "bullish",
    htfTrend: { h1: "bullish", h4: "bullish", d1: "bullish" },
    entry,
    sl,
    tp,
    rr: side === "long" ? (tp - entry) / (entry - sl) : (entry - tp) / (sl - entry),
    side,
    riskMultiplier,
  };
}

test("mt5 v2 parity: DEFAULT_MT5_CONFIG ships the v2 ruleset exactly", () => {
  assertDeepEqual(
    DEFAULT_MT5_CONFIG.strategies,
    [...V2_STRATEGY_IDS],
    "strategies == V2_STRATEGY_IDS",
  );
  assertEqual(V2_STRATEGY_IDS.length, 30, "thirty v3.0 Stage-2A regime-routed bots");
  assertEqual(DEFAULT_MT5_CONFIG.riskPct, 0.35, "v2 default riskPct is 0.35%");
  assertEqual(DEFAULT_MT5_CONFIG.maxOpenPositions, 3, "v2 default max open positions is 3");
  assertEqual(DEFAULT_MT5_CONFIG.sizingMode, "risk_pct", "v2 default sizing is risk_pct");
});

test("mt5 v2 parity: riskMultiplier throttles risk_pct sizing, stack cap + anti-hedge enforced", () => {
  // Keep the simulated calendar empty so the seeded news window can never
  // block the signal — this pins the default config, not the news fixture.
  newsManager.setEvents([]);
  const touchedTickets = [];
  try {
    mt5Engine.setConfig({ ...DEFAULT_MT5_CONFIG, enabled: true });

    const symbol = "XAU/USD";
    const before = mt5Engine.getPositions().length;
    const openedTickets = touchedTickets;
    const strategyId = "donchian-55-coiled";

    // 1. Full risk (multiplier 1.0): entry 2650, SL 2649.5 ($0.50/oz).
    const fullRisk = v2Signal({
      strategyId,
      datetime: "2026-12-20 09:00:00",
      riskMultiplier: 1.0,
      entry: 2650,
      sl: 2649.5,
      tp: 2651.6,
    });
    const fullResult = mt5Engine.handleLiveStrategySignal(fullRisk, symbol);
    assert(fullResult !== null && fullResult.ok, "full-risk v2 signal executes");
    openedTickets.push(fullResult.ticket);

    // 2. Throttled risk (multiplier 0.5): halves the lot size for the same geometry.
    const throttled = v2Signal({
      strategyId,
      datetime: "2026-12-20 09:30:00",
      riskMultiplier: 0.5,
      entry: 2650,
      sl: 2649.5,
      tp: 2651.6,
    });
    const throttledResult = mt5Engine.handleLiveStrategySignal(throttled, symbol);
    assert(throttledResult !== null && throttledResult.ok, "throttled v2 signal executes");
    openedTickets.push(throttledResult.ticket);

    assert(fullResult.volume > 0 && throttledResult.volume > 0, "volumes are positive");
    assert(
      Math.abs(fullResult.volume - 2 * throttledResult.volume) < 1e-9,
      `0.5 multiplier halves the risk (full ${fullResult.volume} vs throttled ${throttledResult.volume})`,
    );

    // 3. Anti-hedge: opposite-side (short) signal on the same symbol while longs are open.
    const shortSignal = v2Signal({
      strategyId,
      datetime: "2026-12-20 10:00:00",
      riskMultiplier: 1.0,
      entry: 2650,
      sl: 2650.5, // short: stop above entry
      tp: 2648.4, // short: target below entry → rr = (2650 - 2648.4) / (2650.5 - 2650) = 3.2
      side: "short",
    });
    assert(Math.abs(shortSignal.rr - 3.2) < 1e-9, "short geometry has a coherent rr");
    const antisResult = mt5Engine.handleLiveStrategySignal(shortSignal, symbol);
    assert(antisResult === null, "opposite-side signal blocked by anti-hedge");

    // 4. Stack cap: 2 same-side positions open; a 3rd is allowed; a 4th is not.
    const third = v2Signal({
      strategyId,
      datetime: "2026-12-20 11:00:00",
      riskMultiplier: 1.0,
      entry: 2650,
      sl: 2649.5,
      tp: 2651.6,
    });
    const thirdResult = mt5Engine.handleLiveStrategySignal(third, symbol);
    assert(thirdResult !== null && thirdResult.ok, "3rd same-side position allowed");
    openedTickets.push(thirdResult.ticket);

    const fourth = v2Signal({
      strategyId,
      datetime: "2026-12-20 11:30:00",
      riskMultiplier: 1.0,
      entry: 2650,
      sl: 2649.5,
      tp: 2651.6,
    });
    const fourthResult = mt5Engine.handleLiveStrategySignal(fourth, symbol);
    assert(fourthResult === null, "4th same-side position blocked by the stack cap");

    const positionsAfter = mt5Engine.getPositions();
    const sameSideCount = positionsAfter.filter(
      (p) => p.symbol === symbol && p.type === "BUY",
    ).length;
    assertEqual(sameSideCount, 3, "exactly 3 same-side positions open");
    assert(positionsAfter.length - before === 3, "only the 3 intended positions were opened");
  } finally {
    // Close anything this test opened, leave the shared engine clean.
    const opened = mt5Engine.getPositions().filter((p) => touchedTickets.includes(p.ticket));
    for (const pos of opened) mt5Engine.closePosition(pos.ticket);
    mt5Engine.setConfig({ ...DEFAULT_MT5_CONFIG, enabled: false });
    newsManager.seedRecurringCalendar();
  }
});

test("mt5 v2 parity: Bridge EA source handles multi-command payloads and terminal-level anti-hedge", () => {
  const ea = generateMql5EaSource({
    serverUrl: "http://127.0.0.1:5173/api/mt5/bridge",
    authToken: "test-token",
    magicNumber: 992200,
  });
  assert(ea.includes("cursor"), "multi-command cursor loop is present");
  assert(
    ea.includes("while(true)") &&
      ea.includes('StringFind(json, "\\"action\\":\\"OPEN\\"", cursor)'),
    "OPEN commands iterate with a cursor-advanced loop",
  );
  assert(ea.includes("HasOppositePositionOpen"), "terminal-level anti-hedge guard is present");
  assert(
    ea.includes("HasOppositePositionOpen(tradeSymbol, typeStr)"),
    "ExecuteTradeCommand calls the anti-hedge guard",
  );
});
