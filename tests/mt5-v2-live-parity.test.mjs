/**
 * MT5 live-execution parity gate (v3.0 30-Bot ARSENAL).
 *
 * Guards the live edges that parity-exact live execution depends on:
 *  - DEFAULT_MT5_CONFIG ships exactly the 30 v3.0 regime-routed strategies
 *    (8 v2.2 Core + 22 certified expansion bots);
 *  - the rolling-drawdown riskMultiplier throttles risk_pct sizing (0.5 → half risk);
 *  - opposite-side self-hedging is blocked at the engine level;
 *  - the max 3 same-side stack per symbol is enforced;
 *  - the Bridge EA source executes multi-command bridge payloads (cursor loop)
 *    and guards fills with HasOppositePositionOpen (terminal-level anti-hedge).
 *
 * Plus the v2.2 live-execution edge-case gate (see the v2.2 section below):
 *  - bridge GET payload field extraction (OPEN/CLOSE) with exact fields;
 *  - terminal-level EA guards (InpMaxOpenPositions + CountSameSidePositions);
 *  - syncFromEa canonical-alias anti-hedge + 3-stack cap;
 *  - stale carryover signal skipping (feedLiveSignalsToMT5);
 *  - 15s optimistic-fill preservation across syncFromEa heartbeats;
 *  - full $350 risk at $100k (no maxRiskAmount cap); $1k micro-account rejection;
 *  - canonicalSymbol suffix rules (case-insensitive, never truncate 6-char pairs);
 *  - 2nd same-side optimistic position preservation (count deficit).
 */
import { test, assert, assertEqual, assertDeepEqual } from "./tiny.mjs";
import { DEFAULT_MT5_CONFIG } from "../src/lib/mt5/types.ts";
import { mt5Engine, canonicalSymbol } from "../src/lib/mt5/engine.ts";
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

// ----------------------------------------------------------------------------
// v2.2 MT5 Live Bridge & Execution Hardening
// ----------------------------------------------------------------------------

/** Faithful JS port of the MQL5 ProcessBridgeResponse (SignalFinderBridge.mq5). */
function mql5PortExtractString(json, key) {
  const needle = `"${key}":"`;
  const start0 = json.indexOf(needle);
  if (start0 < 0) return "";
  const start = start0 + needle.length;
  const end = json.indexOf('"', start);
  if (end < 0) return "";
  return json.slice(start, end);
}

function mql5PortExtractDouble(json, key) {
  const needle = `"${key}":`;
  const start0 = json.indexOf(needle);
  if (start0 < 0) return 0;
  let start = start0 + needle.length;
  while (start < json.length && (json[start] === " " || json[start] === '"')) start++;
  let end = start;
  while (end < json.length) {
    const ch = json.charCodeAt(end);
    if ((ch >= 48 && ch <= 57) || ch === 46 || ch === 45) end++;
    else break;
  }
  const parsed = parseFloat(json.slice(start, end));
  return Number.isFinite(parsed) ? parsed : 0;
}

function mql5PortProcessBridgeResponse(json) {
  const opens = [];
  const closes = [];
  if (json.indexOf('"commands":') < 0) return { opens, closes };

  // OPEN commands — cursor-advanced loop, one obj per "action":"OPEN".
  let cursor = 0;
  for (;;) {
    const openPos = json.indexOf('"action":"OPEN"', cursor);
    if (openPos < 0) break;

    let objStart = -1;
    for (let p = openPos; p >= 0; p--) {
      if (json[p] === "{") {
        objStart = p;
        break;
      }
    }
    let objEnd = -1;
    for (let p = openPos; p < json.length; p++) {
      if (json[p] === "}") {
        objEnd = p;
        break;
      }
    }
    if (objStart >= 0 && objEnd >= 0) {
      const obj = json.slice(objStart, objEnd + 1);
      opens.push({
        id: mql5PortExtractString(obj, "id"),
        symbol: mql5PortExtractString(obj, "symbol"),
        type: mql5PortExtractString(obj, "type"),
        volume: mql5PortExtractDouble(obj, "volume"),
        sl: mql5PortExtractDouble(obj, "sl"),
        tp: mql5PortExtractDouble(obj, "tp"),
        comment: mql5PortExtractString(obj, "comment"),
      });
    }
    cursor = openPos + 1;
  }

  // CLOSE commands — same loop for "action":"CLOSE".
  cursor = 0;
  for (;;) {
    const closePos = json.indexOf('"action":"CLOSE"', cursor);
    if (closePos < 0) break;

    let objStart = -1;
    for (let p = closePos; p >= 0; p--) {
      if (json[p] === "{") {
        objStart = p;
        break;
      }
    }
    let objEnd = -1;
    for (let p = closePos; p < json.length; p++) {
      if (json[p] === "}") {
        objEnd = p;
        break;
      }
    }
    if (objStart >= 0 && objEnd >= 0) {
      const obj = json.slice(objStart, objEnd + 1);
      closes.push({ ticket: mql5PortExtractDouble(obj, "ticket") });
    }
    cursor = closePos + 1;
  }

  return { opens, closes };
}

function closeOpenedPositions(tickets) {
  const opened = mt5Engine.getPositions().filter((p) => tickets.includes(p.ticket));
  for (const pos of opened) mt5Engine.closePosition(pos.ticket);
}

test("mt5 v2.2 wire: bridge GET payload extracts action OPEN and CLOSE with exact fields", () => {
  newsManager.setEvents([]);
  try {
    mt5Engine.setCredentials({ ...mt5Engine.getCredentials(), bridgeMode: "mql5_ea" });
    mt5Engine.setConfig({ ...DEFAULT_MT5_CONFIG, enabled: true });
    mt5Engine.clearPendingCommands();

    const symbol = "XAU/USD";
    const signal = v2Signal({
      strategyId: "donchian-55-coiled",
      datetime: "2026-12-21 09:00:00",
      entry: 2650,
      sl: 2649.5, // $0.50/oz
      tp: 2651.6, // rr = 3.2
    });
    const result = mt5Engine.handleLiveStrategySignal(signal, symbol);
    assert(result !== null && result.ok, "signal executes against the bridge");

    const ticket = result.ticket;
    assert(mt5Engine.closePosition(ticket), "position closes");

    const commands = mt5Engine.getPendingCommands();
    assertEqual(commands.length, 2, "OPEN and CLOSE commands are queued");
    assertEqual(commands[0].action, "OPEN", "the entry command carries action OPEN");
    assertEqual(commands[1].action, "CLOSE", "the exit command carries action CLOSE");
    assertEqual(commands[1].ticket, ticket, "the CLOSE command carries the broker ticket");

    // Serialize exactly as the /api/mt5/bridge GET route does.
    const payload = JSON.stringify({ status: "ok", commands });
    const extracted = mql5PortProcessBridgeResponse(payload);

    assertEqual(extracted.opens.length, 1, "exactly one OPEN command on the wire");
    assertEqual(extracted.closes.length, 1, "exactly one CLOSE command on the wire");

    const openCmd = extracted.opens[0];
    assertEqual(openCmd.symbol, symbol, "OPEN command carries the exact symbol");
    assert(
      Math.abs(openCmd.volume - result.volume) < 1e-9,
      "OPEN command carries the exact volume",
    );
    assert(Math.abs(openCmd.sl - signal.sl) < 1e-9, "OPEN command carries the exact SL");
    assert(Math.abs(openCmd.tp - signal.tp) < 1e-9, "OPEN command carries the exact TP");
    assertEqual(openCmd.type, "BUY", "OPEN command carries the order side");

    assertEqual(extracted.closes[0].ticket, ticket, "CLOSE command extracts the exact ticket");
  } finally {
    const tickets = mt5Engine.getPositions().map((p) => p.ticket);
    closeOpenedPositions(tickets);
    mt5Engine.clearPendingCommands();
    mt5Engine.setCredentials({ ...mt5Engine.getCredentials(), bridgeMode: "simulated" });
    mt5Engine.setConfig({ ...DEFAULT_MT5_CONFIG, enabled: false });
    newsManager.seedRecurringCalendar();
  }
});

test("mt5 v2.2 wire: terminal-level guards (InpMaxOpenPositions + CountSameSidePositions) exist in EA source", () => {
  const ea = generateMql5EaSource({
    serverUrl: "http://127.0.0.1:5173/api/mt5/bridge",
    authToken: "test-token",
    magicNumber: 992200,
  });
  assert(ea.includes("InpMaxOpenPositions = 3"), "InpMaxOpenPositions input exists");
  assert(
    ea.includes("int CountSameSidePositions(string sym, string typeStr)"),
    "CountSameSidePositions is present",
  );
  assert(ea.includes("int CountTotalMagicPositions()"), "total-magic counter is present");
  assert(
    ea.includes("CountSameSidePositions(tradeSymbol, typeStr) >= 3"),
    "terminal-level 3-stack guard blocks fills",
  );
  assert(
    ea.includes("CountTotalMagicPositions() >= InpMaxOpenPositions"),
    "terminal-level total-cap guard blocks fills",
  );
});

test("mt5 v2.2 parity: syncFromEa canonical-alias blocks anti-hedge + 3-stack cap", () => {
  newsManager.setEvents([]);
  try {
    // A broker-reported BUY that carries the broker suffix ".pro" — it must
    // still land in the engine's canonical view so same-side/opposite-side
    // checks work against the desk's "/"-style symbols.
    mt5Engine.syncFromEa({
      login: "50198421",
      server: "MetaQuotes-Demo",
      balance: 10000,
      equity: 10000,
      leverage: 100,
      positions: [
        {
          ticket: 700001,
          symbol: "XAUUSD.pro",
          type: "BUY",
          volume: 0.05,
          openPrice: 2640,
          currentPrice: 2650,
          sl: 2630,
          tp: 2660,
          profit: 0,
          comment: "broker-confirmed",
        },
      ],
    });

    // The broker position must have landed in the engine's canonical view.
    const synced = mt5Engine.getPositions().find((p) => p.ticket === 700001);
    assert(synced !== undefined, "broker position is synced into the engine");

    mt5Engine.setConfig({ ...DEFAULT_MT5_CONFIG, enabled: true });
    const symbol = "XAU/USD";

    // 1. Opposite-side (short) signal must be blocked because the synced
    //    broker BUY (canonical XAUUSD) exists — anti-hedge across aliases.
    const shortSignal = v2Signal({
      strategyId: "donchian-55-coiled",
      datetime: "2026-12-21 10:00:00",
      entry: 2650,
      sl: 2650.5, // short stop above entry
      tp: 2648.4, // target below entry → rr = 3.2
      side: "short",
    });
    const antisResult = mt5Engine.handleLiveStrategySignal(shortSignal, symbol);
    assert(
      antisResult === null,
      "opposite-side signal blocked by anti-hedge across symbol aliases",
    );

    // 2. Stack cap: 1 same-side broker position + 2 new same-side signals fit;
    //    the 3rd new signal is rejected.
    const touchedTickets = [];
    const first = mt5Engine.handleLiveStrategySignal(
      v2Signal({
        strategyId: "donchian-55-coiled",
        datetime: "2026-12-21 10:30:00",
        entry: 2650,
        sl: 2649.5,
        tp: 2651.6,
      }),
      symbol,
    );
    assert(first !== null && first.ok, "1st same-side signal after sync executes");
    touchedTickets.push(first.ticket);

    const second = mt5Engine.handleLiveStrategySignal(
      v2Signal({
        strategyId: "donchian-55-coiled",
        datetime: "2026-12-21 11:00:00",
        entry: 2650,
        sl: 2649.5,
        tp: 2651.6,
      }),
      symbol,
    );
    assert(second !== null && second.ok, "2nd same-side signal after sync executes");
    touchedTickets.push(second.ticket);

    const third = mt5Engine.handleLiveStrategySignal(
      v2Signal({
        strategyId: "donchian-55-coiled",
        datetime: "2026-12-21 11:30:00",
        entry: 2650,
        sl: 2649.5,
        tp: 2651.6,
      }),
      symbol,
    );
    assert(third === null, "3rd same-side signal blocked by the stack cap");

    // 3. Remaining: exactly 1 broker + 2 local = 3 same-side positions.
    const sameSide = mt5Engine
      .getPositions()
      .filter((p) => canonicalSymbol(p.symbol) === "XAUUSD" && p.type === "BUY");
    assertEqual(sameSide.length, 3, "stack cap leaves exactly 3 same-side positions");

    closeOpenedPositions([...touchedTickets, 700001]);
  } finally {
    closeOpenedPositions([700001]);
    mt5Engine.setConfig({ ...DEFAULT_MT5_CONFIG, enabled: false });
    newsManager.seedRecurringCalendar();
  }
});

test("mt5 v2.2 parity: feedLiveSignalsToMT5 skips stale carryover signals only", async () => {
  newsManager.setEvents([]);
  const ticketsToClose = [];
  try {
    mt5Engine.setConfig({ ...DEFAULT_MT5_CONFIG, enabled: true });
    const symbol = "XAU/USD";

    const stale = v2Signal({
      strategyId: "donchian-55-coiled",
      datetime: "2026-12-20 09:00:00",
      entry: 2650,
      sl: 2649.5,
      tp: 2651.6,
    });
    stale.candlesSinceTrigger = 3; // historical FILLED row, triggered 3 bars ago

    const fresh = v2Signal({
      strategyId: "donchian-55-coiled",
      datetime: "2026-12-21 12:00:00",
      entry: 2650,
      sl: 2649.5,
      tp: 2651.6,
    });
    fresh.candlesSinceTrigger = 0; // freshly triggered closed bar

    const before = mt5Engine.getPositions().length;
    const { feedLiveSignalsToMT5 } = await import("../src/lib/mt5/mt5-store.ts");
    const executed = feedLiveSignalsToMT5([stale, fresh], symbol);

    assertEqual(executed, 1, "only the fresh signal auto-dispatches");
    assertEqual(mt5Engine.getPositions().length, before + 1, "exactly 1 position opened");

    for (const pos of mt5Engine.getPositions()) {
      if (pos.strategyId === "donchian-55-coiled") ticketsToClose.push(pos.ticket);
    }
    closeOpenedPositions(ticketsToClose);
  } finally {
    closeOpenedPositions(ticketsToClose);
    mt5Engine.setConfig({ ...DEFAULT_MT5_CONFIG, enabled: false });
    newsManager.seedRecurringCalendar();
  }
});

test("mt5 v2.2 parity: syncFromEa preserves pre-fill optimistic fills within 15s", () => {
  newsManager.setEvents([]);
  try {
    mt5Engine.setCredentials({ ...mt5Engine.getCredentials(), bridgeMode: "mql5_ea" });
    mt5Engine.setConfig({ ...DEFAULT_MT5_CONFIG, enabled: true });

    const signal = v2Signal({
      strategyId: "donchian-55-coiled",
      datetime: "2026-12-21 13:00:00",
      entry: 2650,
      sl: 2649.5,
      tp: 2651.6,
    });
    const result = mt5Engine.handleLiveStrategySignal(signal, "XAU/USD");
    assert(result !== null && result.ok, "optimistic bridge fill lands");
    const optimisticTicket = result.ticket;

    // The heartbeat that arrives mid-flight — the broker has not confirmed the
    // fill yet. It must NOT wipe the just-opened local position.
    mt5Engine.syncFromEa({
      login: "50198421",
      server: "MetaQuotes-Demo",
      balance: 10000,
      equity: 10000,
      positions: [], // broker has not seen the fill yet
    });
    const preserved = mt5Engine.getPositions().find((p) => p.ticket === optimisticTicket);
    assert(preserved !== undefined, "pre-fill optimistic position survives the heartbeat");

    // Once the broker confirms the fill, the sync replaces the optimistic one
    // with the broker-owned position (no duplicate in the ledger).
    mt5Engine.syncFromEa({
      login: "50198421",
      server: "MetaQuotes-Demo",
      balance: 10000,
      equity: 10000,
      positions: [
        {
          ticket: optimisticTicket,
          symbol: "XAUUSD.pro",
          type: "BUY",
          volume: 0.05,
          openPrice: 2650,
          currentPrice: 2650,
          sl: 2649.5,
          tp: 2651.6,
          profit: 0,
          comment: "broker-confirmed",
        },
      ],
    });
    const postSync = mt5Engine
      .getPositions()
      .filter((p) => p.ticket === optimisticTicket && p.createdAtMs !== undefined);
    assertEqual(postSync.length, 0, "optimistic position is replaced by the broker-confirmed one");
    assertEqual(
      mt5Engine.getPositions().filter((p) => p.ticket === optimisticTicket).length,
      1,
      "broker-confirmed position survives with a single entry",
    );

    closeOpenedPositions([optimisticTicket]);
  } finally {
    const tickets = mt5Engine.getPositions().map((p) => p.ticket);
    closeOpenedPositions(tickets);
    mt5Engine.setCredentials({ ...mt5Engine.getCredentials(), bridgeMode: "simulated" });
    mt5Engine.setConfig({ ...DEFAULT_MT5_CONFIG, enabled: false });
    newsManager.seedRecurringCalendar();
  }
});

test("mt5 v2.2 risk: full $350 risk at $100k (no maxRiskAmount cap); $1k micro-account rejected", () => {
  newsManager.setEvents([]);
  try {
    mt5Engine.setConfig({ ...DEFAULT_MT5_CONFIG, enabled: true });

    // Case 1: $100,000 equity at 0.35% risk with maxRiskAmount: 0 → full $350.
    mt5Engine.syncFromEa({
      login: "50198421",
      server: "MetaQuotes-Demo",
      balance: 100000,
      equity: 100000,
      leverage: 100,
    });

    const fullSignal = v2Signal({
      strategyId: "donchian-55-coiled",
      datetime: "2026-12-21 14:00:00",
      entry: 2650,
      sl: 2640, // $10/oz stop
      tp: 2675, // rr = 25/10 = 2.5
    });

    const fullResult = mt5Engine.handleLiveStrategySignal(fullSignal, "XAU/USD");
    assert(fullResult !== null && fullResult.ok, "$100k full-risk signal executes");
    const contractSize = 100; // XAUUSD: 1 lot = 100 oz
    const actualRisk =
      fullResult.volume * Math.abs(fullSignal.entry - fullSignal.sl) * contractSize;
    assertEqual(DEFAULT_MT5_CONFIG.maxRiskAmount, 0, "v2.2 default: maxRiskAmount is 0 (disabled)");
    assert(
      Math.abs(actualRisk - 350) < 1e-9,
      `actual cash risk equals the full $350 (got $${actualRisk.toFixed(2)})`,
    );
    assert(Math.abs(fullSignal.rr - 2.5) < 1e-9, "rr geometry is coherent");
    const fullTicket = fullResult.ticket;

    // Case 2: $1,000 equity with a $150/oz Gold stop → 0.01 lots, guard fires.
    mt5Engine.syncFromEa({
      login: "50198421",
      server: "MetaQuotes-Demo",
      balance: 1000,
      equity: 1000,
      leverage: 100,
    });

    const microSignal = v2Signal({
      strategyId: "donchian-55-coiled",
      datetime: "2026-12-21 15:00:00",
      entry: 2600,
      sl: 2450, // $150/oz stop — a wide New York Donchian stop
      tp: 2900, // rr = 300/150 = 2.0
      side: "long",
    });

    const microResult = mt5Engine.handleLiveStrategySignal(microSignal, "XAU/USD");
    assert(
      microResult === null,
      "$1k micro-account with a $150/oz stop is rejected by the over-risk guard",
    );

    closeOpenedPositions([fullTicket]);
  } finally {
    const tickets = mt5Engine.getPositions().map((p) => p.ticket);
    closeOpenedPositions(tickets);
    mt5Engine.setConfig({ ...DEFAULT_MT5_CONFIG, enabled: false });
    newsManager.seedRecurringCalendar();
  }
});

// ----------------------------------------------------------------------------
// v2.2 follow-up: edge-case assertions
// ----------------------------------------------------------------------------

test("mt5 v2.2 edge: canonicalSymbol suffix rules are case-insensitive and never truncate 6-char symbols", () => {
  // Trim/uppercase first, then strip trailing m/c on a 6-letter pair — the
  // 7-char suffix symbols must normalize to the 6-char base.
  assertEqual(canonicalSymbol("XAUUSDm"), "XAUUSD");
  assertEqual(canonicalSymbol("XAUUSDc"), "XAUUSD");
  assertEqual(canonicalSymbol("EURUSDm"), "EURUSD");
  assertEqual(canonicalSymbol("EURUSDc"), "EURUSD");

  // Bare 6-char pairs pass through untouched (never truncated).
  assertEqual(canonicalSymbol("XAUUSD"), "XAUUSD");
  assertEqual(canonicalSymbol("EURUSD"), "EURUSD");
  assertEqual(canonicalSymbol("USDCHF"), "USDCHF");

  // Normal separators collapse to the same canonical symbol.
  assertEqual(canonicalSymbol("XAU/USD"), "XAUUSD");
  assertEqual(canonicalSymbol("XAU-USD"), "XAUUSD");
  assertEqual(canonicalSymbol("XAUUSD.pro"), "XAUUSD");

  // 7-char symbols whose only difference is case of the trailing suffix must
  // collapse onto one canonical key (XAUUSDm vs XAUUSDM).
  assertEqual(canonicalSymbol("XAUUSDM"), canonicalSymbol("XAUUSDm"));
  assertEqual(canonicalSymbol("EURUSDM"), canonicalSymbol("EURUSDm"));
});

test("mt5 v2.2 edge: syncFromEa preserves a 2nd same-side optimistic position (count deficit)", () => {
  newsManager.setEvents([]);
  const ticketsToClose = [];
  try {
    mt5Engine.setCredentials({ ...mt5Engine.getCredentials(), bridgeMode: "mql5_ea" });
    mt5Engine.setConfig({ ...DEFAULT_MT5_CONFIG, enabled: true });
    mt5Engine.clearPendingCommands();

    const symbol = "XAU/USD";

    // 1. Optimistic fill #1 (bridgeMode mql5_ea → createdAtMs set)
    const r1 = mt5Engine.handleLiveStrategySignal(
      v2Signal({
        strategyId: "donchian-55-coiled",
        datetime: "2026-12-21 17:00:00",
        entry: 2650,
        sl: 2649.5,
        tp: 2651.6,
      }),
      symbol,
    );
    assert(r1 !== null && r1.ok, "optimistic fill #1 lands");
    ticketsToClose.push(r1.ticket);

    // 2. Broker confirms position #1 (ticket 800001) — an engine sync that
    //    replaces the optimistic position with the broker-owned one.
    mt5Engine.syncFromEa({
      login: "50198421",
      server: "MetaQuotes-Demo",
      balance: 10000,
      equity: 10000,
      leverage: 100,
      positions: [
        {
          ticket: 800001,
          symbol: "XAUUSD",
          type: "BUY",
          volume: 0.05,
          openPrice: 2650,
          currentPrice: 2650,
          sl: 2649.5,
          tp: 2651.6,
          profit: 0,
          comment: "broker-confirmed",
        },
      ],
    });
    assertEqual(
      mt5Engine.getPositions().length,
      1,
      "broker confirmation replaces optimistic fill #1",
    );
    ticketsToClose.push(800001);

    // 3. Optimistic fill #2 — SAME side, same symbol, < 15s old, and the
    //    broker has NOT confirmed it yet.
    const r2 = mt5Engine.handleLiveStrategySignal(
      v2Signal({
        strategyId: "donchian-55-coiled",
        datetime: "2026-12-21 17:01:00",
        entry: 2650,
        sl: 2649.5,
        tp: 2651.6,
      }),
      symbol,
    );
    assert(r2 !== null && r2.ok, "optimistic fill #2 lands (2nd same-side)");
    ticketsToClose.push(r2.ticket);

    // 4. 3rd sync — the broker still confirms only ONE XAUUSD BUY. The
    //    optimistic #2 must survive the wipe even though the 1st confirmed
    //    position already shares the canonical key (this is the case the
    //    boolean .some() key-set check would regress).
    mt5Engine.syncFromEa({
      login: "50198421",
      server: "MetaQuotes-Demo",
      balance: 10000,
      equity: 10000,
      leverage: 100,
      positions: [
        {
          ticket: 800001,
          symbol: "XAUUSD.pro",
          type: "BUY",
          volume: 0.05,
          openPrice: 2650,
          currentPrice: 2650,
          sl: 2649.5,
          tp: 2651.6,
          profit: 0,
          comment: "broker-confirmed",
        },
      ],
    });

    const remaining = mt5Engine.getPositions();
    assertEqual(remaining.length, 2, "broker position + preserved 2nd optimistic position");
    const preserved = remaining.find((p) => p.ticket === r2.ticket);
    assert(preserved !== undefined, "2nd optimistic position is preserved by count deficit");
    assert(preserved.createdAtMs !== undefined, "preserved position keeps its optimistic marker");

    const confirmed = remaining.find((p) => p.ticket === 800001);
    assert(confirmed !== undefined, "broker-confirmed position remains");
  } finally {
    closeOpenedPositions(ticketsToClose);
    mt5Engine.clearPendingCommands();
    mt5Engine.setCredentials({ ...mt5Engine.getCredentials(), bridgeMode: "simulated" });
    mt5Engine.setConfig({ ...DEFAULT_MT5_CONFIG, enabled: false });
    newsManager.seedRecurringCalendar();
  }
});
