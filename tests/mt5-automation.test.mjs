/**
 * MT5 Live Automation & Trading Engine Unit and Integration Tests
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { calculateLotSize, mt5Engine } from "../src/lib/mt5/engine.ts";
import { generateMql5EaSource } from "../src/lib/mt5/mql5-ea.ts";
import { generateStandalone247EaSource } from "../src/lib/mt5/standalone-ea.ts";
import { serverDaemon } from "../src/lib/mt5/server-daemon.ts";
import {
  getCurrenciesForSymbol,
  doesNewsAffectSymbol,
  checkNewsBlackout,
} from "../src/lib/mt5/news-filter.ts";

test("mt5: calculateLotSize computes accurate risk-based volume for Forex and Gold", () => {
  // Gold (XAU/USD): 1 lot = 100 oz. SL distance = 10.0 ($10/oz). Risk per lot = $1,000.
  // Equity = $10,000, Risk = 1% ($100). Lots = $100 / $1000 = 0.10 lots.
  const goldSizing = calculateLotSize({
    equity: 10000,
    riskPct: 1.0,
    entry: 2650.0,
    sl: 2640.0,
    symbol: "XAU/USD",
  });
  assertEqual(goldSizing.volume, 0.1, "Gold lot size for 1% risk on $10k with $10 SL");
  assertEqual(goldSizing.riskAmount, 100, "Calculated risk amount");

  // EUR/USD: 1 lot = 100,000 units. SL distance = 0.0020 (20 pips). Risk per lot = $200.
  // Equity = $10,000, Risk = 2% ($200). Lots = $200 / $200 = 1.0 lot.
  const forexSizing = calculateLotSize({
    equity: 10000,
    riskPct: 2.0,
    entry: 1.085,
    sl: 1.083,
    symbol: "EUR/USD",
  });
  assertEqual(forexSizing.volume, 1.0, "EUR/USD lot size for 2% risk on $10k with 20 pip SL");

  // Tiny risk / huge SL: should clamp to minimum 0.01 lots
  const minSizing = calculateLotSize({
    equity: 100,
    riskPct: 0.1,
    entry: 2650.0,
    sl: 2500.0,
    symbol: "XAU/USD",
  });
  assertEqual(minSizing.volume, 0.01, "Clamps to minimum 0.01 lot");
});

test("mt5: MT5TradingEngine manages credentials, config, and state transitions", () => {
  mt5Engine.setCredentials({
    login: "12345678",
    server: "ICMarketsSC-Live",
    bridgeMode: "mql5_ea",
    isDemo: false,
  });

  const creds = mt5Engine.getCredentials();
  assertEqual(creds.login, "12345678", "Account login updated");
  assertEqual(creds.server, "ICMarketsSC-Live", "Broker server updated");
  assertEqual(creds.bridgeMode, "mql5_ea", "Bridge mode updated");

  mt5Engine.setCredentials({ password: "broker-secret-must-not-stick" });
  assertEqual(
    mt5Engine.getCredentials().password,
    undefined,
    "broker password is never retained on the engine",
  );
  assertEqual(mt5Engine.getCredentials().login, "12345678", "stripping password keeps the login");

  mt5Engine.setConfig({
    enabled: true,
    fixedLot: 0.25,
    minRr: 2.5,
  });

  const config = mt5Engine.getConfig();
  assertEqual(config.enabled, true, "Auto-trading enabled");
  assertEqual(config.fixedLot, 0.25, "Fixed lot updated");
  assertEqual(config.minRr, 2.5, "Minimum RR updated");
});

test("mt5: handleLiveStrategySignal executes valid signals with auto entry, auto SL, and auto TP", () => {
  mt5Engine.setConfig({
    enabled: true,
    autoEntry: true,
    autoSl: true,
    autoTp: true,
    sizingMode: "fixed",
    fixedLot: 0.5,
    minRr: 2.0,
    strategies: ["macd-cross", "dual-thrust"],
    newsFilterEnabled: false, // disable news lockout for pure execution unit test
  });

  const mockSignal = {
    strategyId: "macd-cross",
    strategy: "MACD Cross",
    index: 100,
    datetime: "2026-09-27 10:30:00",
    result: "PASS",
    reason: "MACD crossover with trend alignment",
    trend: "bullish",
    htfTrend: { h1: "bullish", h4: "bullish", d1: "bullish" },
    entry: 2650.0,
    sl: 2640.0,
    tp: 2675.0,
    rr: 2.5,
    side: "long",
  };

  const initialPositionsCount = mt5Engine.getPositions().length;
  const result = mt5Engine.handleLiveStrategySignal(mockSignal, "XAU/USD");

  assert(result !== null && result.ok, "Order executed successfully");
  assertEqual(result.volume, 0.5, "Order volume matches fixed lot setting");
  assertEqual(result.price, 2650.0, "Entry price attached");

  const newPositions = mt5Engine.getPositions();
  assertEqual(newPositions.length, initialPositionsCount + 1, "Position added to MT5 positions");

  const placedPos = newPositions[newPositions.length - 1];
  assertEqual(placedPos.symbol, "XAU/USD", "Position symbol matches");
  assertEqual(placedPos.type, "BUY", "Position side converted to BUY");
  assertEqual(placedPos.sl, 2640.0, "Auto SL attached");
  assertEqual(placedPos.tp, 2675.0, "Auto TP attached");

  // Anti-duplication: Sending the exact same signal on same bar again must be ignored
  const duplicateResult = mt5Engine.handleLiveStrategySignal(mockSignal, "XAU/USD");
  assert(duplicateResult === null, "Duplicate signal on same candle ignored");
});

test("mt5: position closure updates balance and moves trade to closed history", () => {
  const positions = mt5Engine.getPositions();
  assert(positions.length > 0, "At least one position exists to close");

  const posToClose = positions[positions.length - 1];
  const initialClosedCount = mt5Engine.getClosedPositions().length;

  const closed = mt5Engine.closePosition(posToClose.ticket);
  assert(closed, "Position closed successfully");

  const remainingPositions = mt5Engine.getPositions();
  assert(
    !remainingPositions.some((p) => p.ticket === posToClose.ticket),
    "Position removed from active",
  );

  const closedPositions = mt5Engine.getClosedPositions();
  assertEqual(closedPositions.length, initialClosedCount + 1, "Closed position moved to history");
});

test("mt5: news filter detects relevant currencies and enforces Red Folder blackouts", () => {
  // Currency extraction
  assertEqual(getCurrenciesForSymbol("XAU/USD").join(","), "USD,XAU");
  assertEqual(getCurrenciesForSymbol("EUR/USD").join(","), "EUR,USD");
  assertEqual(getCurrenciesForSymbol("GBP/JPY").join(","), "GBP,JPY");

  const newsConfig = {
    enabled: true,
    filterHighImpact: true,
    filterMediumImpact: false,
    minutesBefore: 30,
    minutesAfter: 30,
    affectedCurrenciesOnly: true,
  };

  const nowMs = Date.parse("2026-09-27T12:00:00Z");

  const upcomingNfp = {
    id: "nfp-1",
    title: "USD Non-Farm Payrolls",
    currency: "USD",
    impact: "HIGH",
    datetime: "2026-09-27T12:15:00Z", // 15 minutes in the future
  };

  // 1. Event 15m away -> must trigger Red Folder warning & block trade
  const blackoutImminent = checkNewsBlackout({
    symbol: "XAU/USD",
    config: newsConfig,
    events: [upcomingNfp],
    currentTimeMs: nowMs,
  });
  assert(blackoutImminent.isBlocked, "Trade blocked when high-impact news is in 15 mins");
  assert(
    blackoutImminent.reason?.includes("Red Folder News Warning"),
    "Reason identifies Red Folder warning",
  );

  // 2. Unrelated currency news (e.g. JPY news when trading EUR/USD) -> should NOT block
  const jpyEvent = {
    id: "boj-1",
    title: "BOJ Interest Rate Decision",
    currency: "JPY",
    impact: "HIGH",
    datetime: "2026-09-27T12:10:00Z",
  };
  const blackoutUnrelated = checkNewsBlackout({
    symbol: "EUR/USD",
    config: newsConfig,
    events: [jpyEvent],
    currentTimeMs: nowMs,
  });
  assert(!blackoutUnrelated.isBlocked, "Unrelated currency news does not block EUR/USD");

  // 3. Post-news cool-down within 30 min -> should block trade
  const pastCpi = {
    id: "cpi-1",
    title: "USD Consumer Price Index",
    currency: "USD",
    impact: "HIGH",
    datetime: "2026-09-27T11:45:00Z", // 15 minutes in the past
  };
  const blackoutRecent = checkNewsBlackout({
    symbol: "GBP/USD",
    config: newsConfig,
    events: [pastCpi],
    currentTimeMs: nowMs,
  });
  assert(blackoutRecent.isBlocked, "Trade blocked during 30m post-news cool-down");
  assert(
    blackoutRecent.reason?.includes("Post-News Volatility Cool-down"),
    "Reason identifies post-news cool-down",
  );
});

test("mt5: generateMql5EaSource produces complete MQL5 Expert Advisor bridge code", () => {
  const eaCode = generateMql5EaSource({
    serverUrl: "http://my-server.com/api/mt5/bridge",
    authToken: "secret-token-123",
    magicNumber: 778899,
  });

  assert(eaCode.includes("SignalFinderBridge.mq5"), "Contains EA file header");
  assert(eaCode.includes("http://my-server.com/api/mt5/bridge"), "Contains configured server URL");
  assert(eaCode.includes("secret-token-123"), "Contains auth token");
  assert(eaCode.includes("778899"), "Contains magic number");
  assert(eaCode.includes("PollBridgeAndExecute"), "Contains polling routine");
  assert(eaCode.includes("m_trade.Buy"), "Contains CTrade Buy execution");
  assert(eaCode.includes("m_trade.Sell"), "Contains CTrade Sell execution");
});

test("mt5: generateStandalone247EaSource produces autonomous 24/7 offline-capable MQL5 EA with Red Folder News Guard", () => {
  const standaloneEa = generateStandalone247EaSource({
    magicNumber: 992200,
    riskPct: 1.5,
    fixedLot: 0.2,
    minRr: 2.0,
    newsFilterEnabled: true,
    newsMinsBefore: 30,
    newsMinsAfter: 30,
  });

  assert(
    standaloneEa.includes("SignalFinderPro_247_Autotrader.mq5"),
    "Contains standalone 24/7 EA header",
  );
  assert(standaloneEa.includes("InpEnableNewsFilter"), "Embeds Red Folder News Filter input");
  assert(standaloneEa.includes("IsNewsBlackout"), "Embeds native MT5 News Blackout check");
  assert(standaloneEa.includes("CheckMacdCross"), "Embeds MACD Cross strategy natively");
  assert(standaloneEa.includes("CheckDualThrust"), "Embeds Dual Thrust strategy natively");
  assert(standaloneEa.includes("CheckPdhRetest"), "Embeds PDH Retest strategy natively");
  assert(standaloneEa.includes("CheckClassicPivot"), "Embeds Classic Pivot strategy natively");
  assert(standaloneEa.includes("CheckWilliamsFade"), "Embeds Williams %R strategy natively");
  assert(standaloneEa.includes("CheckThreeSoldiers"), "Embeds Three Soldiers strategy natively");
  assert(standaloneEa.includes("CheckMorningStar"), "Embeds Morning Star strategy natively");
  assert(standaloneEa.includes("CheckIchimokuTk"), "Embeds Ichimoku TK strategy natively");
  assert(standaloneEa.includes("CheckDonchian55"), "Embeds Donchian 55 strategy natively");
  assert(standaloneEa.includes("CalculateLots"), "Embeds dynamic risk % lot sizing");
  assert(standaloneEa.includes("OpenTrade"), "Embeds auto entry, SL, and TP execution");
});

test("mt5: serverDaemon provides autonomous 24/7 cloud background execution", () => {
  const status = serverDaemon.getStatus();
  assert(status.isRunning, "Server background daemon is running 24/7");
  assert(Array.isArray(status.monitoredSymbols), "Monitored symbols array exists");
});
