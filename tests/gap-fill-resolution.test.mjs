/**
 * GAP-FILL RESOLUTION — a bar that opens beyond a tracked level and never
 * trades it inside the bar has still filled the order resting at that level,
 * at the bar's OPEN.
 *
 * Why this suite exists: the forward status engine used to resolve TP/SL only
 * on an in-bar touch (`low ≤ level ≤ high`). Weekend/holiday reopen gaps skip
 * the level instead of touching it, so a stopped-out position stayed alive and
 * was later booked at the level — full planned R — even though the market had
 * already taken it out. On the locked baseline that mispriced 52 of 2,286
 * trades and turned one loser (+2.41R recorded) into a winner.
 *
 * Pinned here:
 *   1. the fill price itself (the resolving bar's open, not the level);
 *   2. the ordering rule (the open is the first tick, so a gap over the stop
 *      beats any in-bar touch of the target on the same bar);
 *   3. the open decides even when the bar later trades back through the level —
 *      a triggered stop does not wait to be filled at the level it gapped;
 *   4. a stop gapped over before the entry fills still expires the setup;
 *   5. the locked baseline's own gap cases, row-for-row and in aggregate.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { baselineAnalysis, loadBaselineCsv } from "./fixtures.mjs";
import { evaluateSetupStatus } from "../src/lib/analyzer/status.ts";
import { runAnalysis } from "../src/lib/analyzer/run.ts";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import { ANALYZER_CERTIFIED_OPTIONS } from "../src/lib/analyzer/config.ts";

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

function row(index, { entry, sl, tp, side = "long", orderType = "market" }) {
  return {
    strategyId: "dual-thrust",
    strategy: "dual-thrust",
    index,
    datetime: `2026-01-05 0${index}:00:00`,
    result: "PASS",
    reason: "fixture",
    trend: "ranging",
    htfTrend: { h1: "ranging", h4: "ranging", d1: "ranging" },
    side,
    orderType,
    entry,
    sl,
    tp,
    rr: 3,
  };
}

const stamp = (i) => `2026-01-05 ${String(9 + i).padStart(2, "0")}:00:00`;

test("gap fill: a bar that opens past the stop resolves it at the open, not at the level", () => {
  const candles = [
    candle(0, stamp(0), { open: 100, high: 100.5, low: 99.5, close: 100 }), // market fill bar
    // Monday reopen: opens below the stop, never trades it.
    candle(1, stamp(1), { open: 95, high: 95.4, low: 92, close: 93 }),
  ];
  const status = evaluateSetupStatus(row(0, { entry: 100, sl: 97, tp: 106 }), candles);
  assertEqual(status.setupStatus, "RESOLVED", "the gapped stop resolves the trade");
  assertEqual(status.resolutionLevel, "SL", "the stop is what was hit");
  assertEqual(status.resolutionPrice, 95, "the fill is the bar's OPEN, not the stop level");
  assertEqual(status.resolutionCandle?.index, 1, "resolved on the gap bar");
  assert(
    status.statusNote.includes("SL hit") && status.statusNote.includes("gap"),
    `the gap must be stated in the note, got: ${status.statusNote}`,
  );
});

test("gap fill: a bar that opens past the target resolves it at the open (better than planned R)", () => {
  const candles = [
    candle(0, stamp(0), { open: 100, high: 100.5, low: 99.5, close: 100 }),
    candle(1, stamp(1), { open: 108, high: 109, low: 107.5, close: 108.5 }),
  ];
  const status = evaluateSetupStatus(row(0, { entry: 100, sl: 97, tp: 106 }), candles);
  assertEqual(status.setupStatus, "RESOLVED", "the gapped target resolves the trade");
  assertEqual(status.resolutionLevel, "TP", "the target is what was reached");
  assertEqual(status.resolutionPrice, 108, "the fill is the bar's OPEN, not the target level");
});

test("gap fill: the open decides even when the bar later trades back through the level", () => {
  const candles = [
    candle(0, stamp(0), { open: 100, high: 100.5, low: 99.5, close: 100 }),
    // Opens below the stop, then trades back up through it inside the bar.
    candle(1, stamp(1), { open: 95, high: 98, low: 94, close: 97.5 }),
  ];
  const status = evaluateSetupStatus(row(0, { entry: 100, sl: 97, tp: 106 }), candles);
  assertEqual(status.setupStatus, "RESOLVED", "the stop resolves the trade");
  assertEqual(
    status.resolutionPrice,
    95,
    "a stop triggered at the open fills at the open, not at the level it gapped",
  );
});

test("gap fill: a bar that does not open beyond the level still fills at the level", () => {
  const candles = [
    candle(0, stamp(0), { open: 100, high: 100.5, low: 99.5, close: 100 }),
    // Opens inside the range and trades down to the stop: the level is the fill.
    candle(1, stamp(1), { open: 99, high: 99.5, low: 96, close: 96.5 }),
  ];
  const status = evaluateSetupStatus(row(0, { entry: 100, sl: 97, tp: 106 }), candles);
  assertEqual(status.setupStatus, "RESOLVED", "the traded stop resolves the trade");
  assertEqual(status.resolutionPrice, 97, "a normally touched level fills at the level");
  assertEqual(status.resolutionLevel, "SL", "the level hit is reported");
});

test("gap fill: the open is the first tick — a gap over the stop beats a same-bar target touch", () => {
  const candles = [
    candle(0, stamp(0), { open: 100, high: 100.5, low: 99.5, close: 100 }),
    // Opens under the stop, then rallies through the target in the same bar.
    candle(1, stamp(1), { open: 95, high: 107, low: 94.5, close: 106 }),
  ];
  const status = evaluateSetupStatus(row(0, { entry: 100, sl: 97, tp: 106 }), candles);
  assertEqual(status.setupStatus, "RESOLVED", "the bar resolves the trade");
  assertEqual(
    status.resolutionLevel,
    "SL",
    "the stop was already breached at the open, before the target traded",
  );
  assertEqual(status.resolutionPrice, 95, "and it filled at that open");
});

test("gap fill: a stop gapped over before the entry fills still expires the setup", () => {
  const candles = [
    candle(0, stamp(0), { open: 95, high: 96, low: 94, close: 95 }),
    // Opens below the protective stop and keeps falling: the entry is dead.
    candle(1, stamp(1), { open: 89, high: 90, low: 87, close: 88 }),
  ];
  const status = evaluateSetupStatus(
    row(0, { entry: 100, sl: 92, tp: 110, orderType: "limit" }),
    candles,
  );
  assertEqual(status.setupStatus, "EXPIRED", "no fill is manufactured after a gapped stop");
  assertEqual(status.resolutionCandle, undefined, "expiry books no exit price");
  assert(
    status.statusNote.includes("SL broken before fill"),
    `the reason must be explicit, got: ${status.statusNote}`,
  );
});

test("gap fill: short setups mirror long setups on both barriers", () => {
  const shortStop = [
    candle(0, stamp(0), { open: 100, high: 100.5, low: 99.5, close: 100 }),
    candle(1, stamp(1), { open: 106, high: 109, low: 105.8, close: 108 }),
  ];
  const s1 = evaluateSetupStatus(row(0, { entry: 100, sl: 105, tp: 94, side: "short" }), shortStop);
  assertEqual(s1.setupStatus, "RESOLVED", "the short's gapped stop resolves");
  assertEqual(s1.resolutionLevel, "SL", "the short's stop was hit");
  assertEqual(s1.resolutionPrice, 106, "the short's fill is the bar's open");

  const shortTarget = [
    candle(0, stamp(0), { open: 100, high: 100.5, low: 99.5, close: 100 }),
    candle(1, stamp(1), { open: 92, high: 92.5, low: 91, close: 91.5 }),
  ];
  const s2 = evaluateSetupStatus(
    row(0, { entry: 100, sl: 105, tp: 94, side: "short" }),
    shortTarget,
  );
  assertEqual(s2.setupStatus, "RESOLVED", "the short's gapped target resolves");
  assertEqual(s2.resolutionLevel, "TP", "the short's target was reached");
  assertEqual(s2.resolutionPrice, 92, "the short's fill is the bar's open");
});

test("gap fill: the locked baseline books every gapped exit at the gap bar's open", async () => {
  const analysis = await baselineAnalysis();
  const { candles } = parseCsv(loadBaselineCsv());
  const byDatetime = new Map(candles.map((c) => [c.datetime, c]));

  let gapped = 0;
  for (const t of analysis.tradePasses) {
    if (t.outcome !== "TP" && t.outcome !== "SL") continue;
    const level = t.outcome === "TP" ? t.tp : t.sl;
    if (t.exitPrice === level) continue;
    gapped++;
    const bar = byDatetime.get(t.exitDatetime);
    assert(bar, `gap bar exists for ${t.strategyId}@${t.index}`);
    assertEqual(t.exitPrice, bar.open, `gap fill is the bar's open on ${t.strategyId}@${t.index}`);
    // The open must be beyond the barrier in the direction that triggers it:
    // a target is reached from the profitable side, a stop from the losing one.
    const beyond =
      t.outcome === "TP"
        ? t.side === "long"
          ? t.exitPrice > level
          : t.exitPrice < level
        : t.side === "long"
          ? t.exitPrice < level
          : t.exitPrice > level;
    assert(beyond, `gap fill is beyond the level on ${t.strategyId}@${t.index}`);
    assert(
      t.exitDatetime > t.datetime,
      `exit strictly after trigger on ${t.strategyId}@${t.index}`,
    );
  }
  // Blast radius on the locked baseline; moves only with a documented re-baseline.
  assertEqual(gapped, 52, "gap-resolved trades in the locked book");
});

test("gap fill: the baseline's recorded false winner is booked as the loss it was", async () => {
  const analysis = await baselineAnalysis();
  const t = analysis.tradePasses.find(
    (x) => x.strategyId === "three-soldiers" && x.datetime === "2025-12-20 00:00:00",
  );
  assert(t, "the three-soldiers short must be in the book");
  assertEqual(t.side, "short", "fixture row identity");
  // 2025-12-22 03:00 EAT opens at 4354.28, above the 4346.02 stop, and never
  // trades it. The old gap-blind engine ignored that bar, later "hit" the
  // 4318.265 target and recorded +2.414R for a trade that lost ~2R.
  assertEqual(t.outcome, "SL", "the gap-through stop is the outcome");
  assertEqual(t.exitDatetime, "2025-12-22 03:00:00", "resolved on the gap bar, not weeks later");
  assertEqual(t.exitPrice, 4354.28, "exited at the gap bar's open");
  assert(
    t.rMultiple !== undefined && t.rMultiple < -2,
    `the loss must be reported truthfully, got ${t.rMultiple}`,
  );
});

test("gap fill: the certified book still satisfies the shipped configuration", () => {
  const result = runAnalysis(loadBaselineCsv(), ANALYZER_CERTIFIED_OPTIONS);
  assert(result.ok, "certified run must succeed");
  const gapped = result.analysis.tradePasses.filter((t) => {
    const level = t.outcome === "TP" ? t.tp : t.sl;
    return (t.outcome === "TP" || t.outcome === "SL") && t.exitPrice !== level;
  });
  assertEqual(gapped.length, 52, "same blast radius under the shipped configuration");
});
