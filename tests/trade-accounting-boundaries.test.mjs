/**
 * TRADE ACCOUNTING BOUNDARIES — the fill/resolution rules of the forward status
 * engine, pinned directly instead of only through the golden book.
 *
 * The golden lock and the causality suite cover these rules in aggregate, but an
 * aggregate cannot tell which of two same-candle touches was chosen, what happens
 * when the entry and the protective level trade on the same bar, or where the
 * expiry boundary sits. Those are exactly the "pathological cases" a trade book
 * can silently absorb:
 *
 *   - market entries fill at the trigger candle's close and are never resolved on
 *     the fill bar itself;
 *   - a limit/stop entry whose protective level also trades on the fill bar is
 *     reported FILLED with an explicit ambiguity note — no outcome is invented;
 *   - when a later bar touches both TP and SL, TP is evaluated first (a
 *     deterministic policy, not a claim about intrabar tick order);
 *   - a stop broken before the entry ever fills expires the setup;
 *   - a setup that never fills expires after the declared number of waiting bars.
 *
 * Everything here is read-only observation of the shipped engine; no rule was
 * changed, and the boundary in the expiry case is recorded exactly as implemented.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { evaluateSetupStatus } from "../src/lib/analyzer/status.ts";
import { runAnalysis } from "../src/lib/analyzer/run.ts";

/** Minimal candle factory for the status engine. */
function candle(index, datetime, { open, high, low, close }) {
  return {
    index,
    datetime,
    open,
    high,
    low,
    close,
    similarSwingRefs: [],
    unresolvedRefs: [],
    trend: "ranging",
    htfTrend: { h1: "ranging", h4: "ranging", d1: "ranging" },
    raw: {},
  };
}

/** A long PASS row carrying the fields the status engine reads. */
function longRow(index, { entry, sl, tp, orderType = "market", strategyId = "dual-thrust" }) {
  return {
    strategyId,
    strategy: strategyId,
    index,
    datetime: `2026-01-05 0${index}:00:00`,
    result: "PASS",
    reason: "fixture",
    trend: "ranging",
    htfTrend: { h1: "ranging", h4: "ranging", d1: "ranging" },
    side: "long",
    orderType,
    entry,
    sl,
    tp,
    rr: 3,
  };
}

const stamp = (i) => `2026-01-05 ${String(9 + i).padStart(2, "0")}:00:00`;

test("accounting: a market entry fills at the trigger close and is not resolved on its own bar", () => {
  const candles = [
    // The fill bar itself spans BOTH levels: a market order filled at its close
    // must not be resolved from the same bar's high/low.
    candle(0, stamp(0), { open: 100, high: 105, low: 97, close: 100.5 }),
    candle(1, stamp(1), { open: 100.5, high: 104, low: 100, close: 103.5 }),
  ];
  const row = longRow(0, { entry: 100, sl: 98, tp: 103 });
  const onFillBarOnly = evaluateSetupStatus(row, [candles[0]]);
  assertEqual(onFillBarOnly.setupStatus, "FILLED", "market fill at the signal bar's close");
  assertEqual(onFillBarOnly.fillCandle?.index, 0, "fill recorded on the trigger bar");
  assertEqual(
    onFillBarOnly.resolutionCandle,
    undefined,
    "the fill bar cannot resolve the trade, even though it spans both levels",
  );
  // The very next bar may resolve it normally.
  const later = evaluateSetupStatus(row, candles);
  assertEqual(later.setupStatus, "RESOLVED", "the next bar resolves the filled trade");
  assertEqual(later.resolutionLevel, "TP", "and the level it touched is reported");
  assertEqual(later.resolutionCandle?.index, 1, "resolution recorded on the touching bar");
});

test("accounting: when a later bar touches BOTH levels, TP is evaluated first", () => {
  const candles = [
    candle(0, stamp(0), { open: 100, high: 100.5, low: 99.5, close: 100 }),
    candle(1, stamp(1), { open: 100, high: 104, low: 97, close: 99 }),
  ];
  const status = evaluateSetupStatus(longRow(0, { entry: 100, sl: 98, tp: 103 }), candles);
  assertEqual(status.setupStatus, "RESOLVED", "the bar resolves the trade");
  assertEqual(status.resolutionLevel, "TP", "TP wins the same-candle tie (documented policy)");
  assertEqual(status.resolutionPrice, 103, "resolution price is the TP level");
  assertEqual(status.resolutionCandle?.index, 1, "resolution recorded on the touching bar");
});

test("accounting: a limit entry that fills together with its protective level invents no outcome", () => {
  const candles = [
    candle(0, stamp(0), { open: 105, high: 106, low: 104, close: 105 }),
    // Entry (limit at 100) and stop (98) are both inside this bar's range.
    candle(1, stamp(1), { open: 103, high: 104, low: 97, close: 99 }),
  ];
  const status = evaluateSetupStatus(
    longRow(0, { entry: 100, sl: 98, tp: 103, orderType: "limit" }),
    candles,
  );
  assertEqual(status.setupStatus, "FILLED", "the entry is reported filled");
  assertEqual(
    status.resolutionCandle,
    undefined,
    "no TP/SL is asserted for an ambiguous same-candle fill",
  );
  assertEqual(status.resolutionLevel, undefined, "no level is invented");
  assert(
    status.statusNote.includes("ambiguous"),
    `the ambiguity must be stated in the note, got: ${status.statusNote}`,
  );
});

test("accounting: a stop broken before the entry fills expires the setup (no fabricated fill)", () => {
  const candles = [
    candle(0, stamp(0), { open: 95, high: 96, low: 94, close: 95 }),
    candle(1, stamp(1), { open: 95, high: 95, low: 90, close: 91 }),
  ];
  // Long limit at 100 (never reachable), protective stop at 92 (broken).
  const status = evaluateSetupStatus(
    longRow(0, { entry: 100, sl: 92, tp: 110, orderType: "limit" }),
    candles,
  );
  assertEqual(status.setupStatus, "EXPIRED", "a stop break before the fill expires the setup");
  assertEqual(status.resolutionCandle, undefined, "no fill and no exit price is invented");
  assert(
    status.statusNote.includes("SL broken before fill"),
    `the reason must be explicit, got: ${status.statusNote}`,
  );
});

test("accounting: the expiry boundary is exactly the declared waiting-bar count", () => {
  // The entry is never reachable, so the setup can only expire.
  const candles = [candle(0, stamp(0), { open: 95, high: 96, low: 94, close: 95 })];
  for (let i = 1; i <= 6; i++)
    candles.push(candle(i, stamp(i), { open: 95, high: 96, low: 94, close: 95 }));
  const row = longRow(0, { entry: 200, sl: 50, tp: 300, orderType: "limit" });

  // With a 2-bar budget: after 2 waiting bars it is still pending, on the third
  // it expires (`barsWaiting > expiryCandles`). Recorded as implemented.
  const afterTwo = evaluateSetupStatus(row, candles.slice(0, 3), 2);
  assertEqual(
    afterTwo.setupStatus,
    "PENDING",
    "2 waiting bars with a budget of 2 is still pending",
  );
  const afterThree = evaluateSetupStatus(row, candles.slice(0, 4), 2);
  assertEqual(afterThree.setupStatus, "EXPIRED", "the next waiting bar expires it");
  assertEqual(afterThree.resolutionCandle, undefined, "expiry has no exit");

  // The default budget is the production constant (20), and it is not exceeded
  // early on a long series.
  const withinDefault = evaluateSetupStatus(row, candles, 20);
  assertEqual(
    withinDefault.setupStatus,
    "PENDING",
    "6 waiting bars is inside the production budget",
  );
});

test("accounting: short setups mirror long setups", () => {
  const candles = [
    candle(0, stamp(0), { open: 100, high: 100.5, low: 99.5, close: 100 }),
    candle(1, stamp(1), { open: 100, high: 104, low: 97, close: 103 }),
  ];
  const row = { ...longRow(0, { entry: 100, sl: 103, tp: 97 }), side: "short" };
  const status = evaluateSetupStatus(row, candles);
  assertEqual(status.setupStatus, "RESOLVED", "short trade resolves");
  assertEqual(status.resolutionLevel, "TP", "the short's TP is below entry and was touched");
  assertEqual(status.resolutionPrice, 97, "resolution price is the short TP");
});

test("accounting: a market entry on the final bar of a certified series stays open, never resolved", () => {
  // 40 flat bars, then the trade's own signal bar is the LAST one.
  const lines = [];
  for (let i = 0; i < 40; i++) {
    const minutes = 9 * 60 + i * 30;
    const day = 5 + Math.floor(minutes / (24 * 60));
    const clock = `${String(Math.floor((minutes % 1440) / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    lines.push(`2026-01-${String(day).padStart(2, "0")} ${clock}:00,4000,4000.5,3999.5,4000,true`);
  }
  const meta = `# metadata: ${JSON.stringify({
    data_age: "2026-01-06 09:00:00 EAT",
    spread_convention: "XAUUSD: static estimate of $0.20 per ounce.",
    atr_method: "rolling 14",
    similar_swing_selection_rule: "closest magnitude",
  })}`;
  const csv = [meta, "datetime,open,high,low,close,is_reliable", ...lines].join("\n");
  const outcome = runAnalysis(csv, { seriesEndsComplete: true });
  assert(outcome.ok, "fixture analyses");
  // Every PASS row whose entry is on the last bar must be unresolved...
  const lastDatetime = lines[lines.length - 1].slice(0, 19);
  for (const trade of outcome.analysis.tradePasses) {
    if (trade.datetime !== lastDatetime) continue;
    assert(
      trade.outcome === "OPEN" || trade.outcome === "NO_FILL",
      `a trade triggered on the last bar must not be resolved: ${trade.strategyId} ${trade.outcome}`,
    );
    assertEqual(trade.exitDatetime, undefined, "no exit datetime may be invented");
    assertEqual(trade.rMultiple, undefined, "no realised R may be invented");
  }
  // ...and the same holds at the book level: nothing exits on the last bar.
  const leaks = outcome.analysis.tradePasses.filter((t) => t.exitDatetime === lastDatetime);
  assertEqual(leaks.length, 0, "no trade may exit on the final bar of a certified series");
});
