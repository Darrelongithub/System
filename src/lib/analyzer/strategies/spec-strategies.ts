import type { AnalysisContext, Outcome, StrategyCheck } from "../types";
import { openingRangeFor } from "../daily";
import { eatDay } from "../time";
import { turtleRun } from "./turtle";
import { isConsumed, consume } from "./util";
import { FINAL_TRADE_STRATEGIES } from "./final-survivors";
import { CRABEL_ORB_WINDOW_MINUTES } from "@/lib/strategies/crabel-orb";
const c = (ctx: AnalysisContext, i: number) => ctx.candles[i]!;
const pass = (
  reason: string,
  entry?: number,
  sl?: number,
  tp?: number,
  side?: "long" | "short",
  orderType?: "market" | "stop" | "limit",
): Outcome => ({ result: "PASS", reason, entry, sl, tp, side, orderType });
const fail = (reason: string): Outcome => ({ result: "FAIL", reason });
const sma = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const priorDays = (ctx: AnalysisContext, day: string, n: number) =>
  ctx.daily.filter((d) => d.day < day).slice(-n);
const dHigh = (ds: { high: number }[]) => Math.max(...ds.map((d) => d.high));
const dLow = (ds: { low: number }[]) => Math.min(...ds.map((d) => d.low));
const bb = (ctx: AnalysisContext, i: number) => {
  if (i < 20) return undefined;
  const window = ctx.candles.slice(i - 20, i);
  if (window.some((x) => x.invalid)) return undefined;
  const xs = window.map((x) => x.close);
  if (xs.some((x) => x === undefined)) return undefined;
  const v = xs as number[],
    m = sma(v),
    sd = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / 20);
  return { m, u: m + 2 * sd, l: m - 2 * sd };
};
// Gap-aware stop fill: if the candle opened beyond the trigger (a gap through
// the level), the real fill is the open, not the theoretical trigger price.
// Mirrors turtle.ts's fillPrice — used so ORB's reported entry always lies
// within [low, high] and downstream forward-status "touched" checks can't
// strand a genuinely-filled order as PENDING.
const gapFill = (
  x: { open?: number; high?: number; low?: number },
  trigger: number,
  side: "long" | "short",
): number | undefined => {
  if (x.open === undefined || x.high === undefined || x.low === undefined) return undefined;
  if (side === "long" && x.high >= trigger) return x.open >= trigger ? x.open : trigger;
  if (side === "short" && x.low <= trigger) return x.open <= trigger ? x.open : trigger;
  return undefined;
};

export const turtleSpec: StrategyCheck = {
  id: "turtle",
  name: "Turtle Trading (20/55-day stateful)",
  run(ctx, i) {
    return turtleRun(ctx, i);
  },
};
export const orbSpec: StrategyCheck = {
  id: "opening-range-breakout",
  name: "Crabel Opening Range Breakout (ORB)",
  run(ctx, i) {
    const x = c(ctx, i),
      or = openingRangeFor(ctx.openingRanges, x),
      day = eatDay(x.datetime),
      ds = priorDays(ctx, day, 10);
    if (!or || i < or.afterWindow || ds.length < 10)
      return fail("opening range or prior 10 completed days unavailable");
    const stretch = sma(
      ds.map((d) => Math.min(Math.abs(d.open - d.high), Math.abs(d.open - d.low))),
    );
    const buyTrigger = or.high + stretch,
      sellTrigger = or.low - stretch;
    const longFill = gapFill(x, buyTrigger, "long"),
      shortFill = gapFill(x, sellTrigger, "short");
    // BUGFIX: this is a symmetric OCO bracket (buy stop above, sell stop
    // below); if both trigger on the same OHLC candle we genuinely can't tell
    // which traded first. Previously this always silently resolved to "long".
    if (longFill !== undefined && shortFill !== undefined) {
      return {
        result: "FAIL",
        reason:
          "Crabel ORB is intrabar ambiguous: both the buy-stop and sell-stop bracket levels were crossed on the same OHLC candle; no entry was manufactured. Higher-resolution data is required to determine which stop traded first.",
      };
    }
    if (longFill !== undefined) {
      const key = `${day}|${or.session}|long`;
      if (isConsumed(ctx, "opening-range-breakout", key))
        return fail(
          "ORB long already triggered for this session opening range; still trading through the Stretch-adjusted buy stop",
        );
      consume(ctx, "opening-range-breakout", key);
      return pass(
        `Crabel ORB: ${CRABEL_ORB_WINDOW_MINUTES}-minute opening range + 10-day Stretch; buy stop at OR high + Stretch, opposite side is the protective stop; forward management moves the stop to breakeven within one hour after fill.`,
        longFill,
        or.low - stretch,
        undefined,
        "long",
        "stop",
      );
    }
    if (shortFill !== undefined) {
      const key = `${day}|${or.session}|short`;
      if (isConsumed(ctx, "opening-range-breakout", key))
        return fail(
          "ORB short already triggered for this session opening range; still trading through the Stretch-adjusted sell stop",
        );
      consume(ctx, "opening-range-breakout", key);
      return pass(
        `Crabel ORB: ${CRABEL_ORB_WINDOW_MINUTES}-minute opening range + 10-day Stretch; sell stop at OR low - Stretch, opposite side is the protective stop; forward management moves the stop to breakeven within one hour after fill.`,
        shortFill,
        or.high + stretch,
        undefined,
        "short",
        "stop",
      );
    }
    return fail("no Stretch-adjusted ORB trigger");
  },
};
const atr10WilderCache = new WeakMap<AnalysisContext, (number | undefined)[]>();
const buildAtr10Wilder = (ctx: AnalysisContext): (number | undefined)[] => {
  const out: (number | undefined)[] = new Array(ctx.candles.length).fill(undefined);
  const trs: number[] = [];
  let a: number | undefined;
  for (let j = 0; j < ctx.candles.length; j++) {
    const x = ctx.candles[j]!,
      p = ctx.candles[j - 1];
    if (
      x.invalid ||
      p?.invalid ||
      x.high === undefined ||
      x.low === undefined ||
      x.close === undefined
    )
      continue;
    const tr =
      p && p.close !== undefined
        ? Math.max(x.high - x.low, Math.abs(x.high - p.close), Math.abs(x.low - p.close))
        : x.high - x.low;
    trs.push(tr);
    if (trs.length === 10) a = sma(trs.slice(0, 10));
    else if (trs.length > 10) a = (9 * a! + tr) / 10;
    out[j] = a;
  }
  return out;
};
const atr10Wilder = (ctx: AnalysisContext, i: number): number | undefined => {
  let series = atr10WilderCache.get(ctx);
  if (!series) {
    series = buildAtr10Wilder(ctx);
    atr10WilderCache.set(ctx, series);
  }
  return series[i];
};
// BUGFIX: previously fired PASS on every bar where price remained beyond the
// band/level (a "band walk" or sustained trend), producing dozens of
// duplicate triggers for what is really one event. Now fires only on the bar
// where price crosses from inside to outside, using ctx.state to remember
// whether the previous bar was already beyond the level; crossing back inside
// resets it so a genuinely new breakout later can still fire.
export const keltnerSpec: StrategyCheck = {
  id: "raschke-keltner",
  name: "Raschke Keltner Channel",
  run(ctx, i) {
    const e = ctx.ema20[i],
      A = atr10Wilder(ctx, i),
      x = c(ctx, i);
    if (e === undefined || A === undefined || x.close === undefined)
      return fail("EMA20/ATR10/OHLC unavailable");
    const u = e + 2 * A,
      l = e - 2 * A;
    const aboveNow = x.close > u,
      belowNow = x.close < l;
    const wasAbove = ctx.state.get("keltner:above") === true,
      wasBelow = ctx.state.get("keltner:below") === true;
    ctx.state.set("keltner:above", aboveNow);
    ctx.state.set("keltner:below", belowNow);
    if (aboveNow && !wasAbove)
      return pass(
        "Modern convention: EMA20 + 2x same-timeframe Wilder ATR10; fires once on the crossing bar, not on every bar the band-walk continues; no canonical TP.",
        x.close,
        e,
        undefined,
        "long",
        "market",
      );
    if (belowNow && !wasBelow)
      return pass(
        "Modern convention: EMA20 - 2x same-timeframe Wilder ATR10; fires once on the crossing bar, not on every bar the band-walk continues; no canonical TP.",
        x.close,
        e,
        undefined,
        "short",
        "market",
      );
    if (aboveNow || belowNow)
      return fail(
        "Keltner band condition still active from an earlier bar; already flagged once for this band-walk",
      );
    return fail("no Keltner condition");
  },
};
export const pdhSpec: StrategyCheck = {
  id: "previous-day-high-low",
  name: "Previous Day High/Low Breakout",
  run(ctx, i) {
    const x = c(ctx, i),
      day = eatDay(x.datetime),
      p = ctx.daily.filter((d) => d.day < day).at(-1);
    if (!p || x.close === undefined) return fail("prior day/OHLC unavailable");
    // BUGFIX: previously fired on every bar close stayed beyond the level; now
    // fires once per prior-day level per direction (dedup key = that prior
    // day's date), not once per bar.
    if (x.close > p.high) {
      const key = `${p.day}:long`;
      if (isConsumed(ctx, "previous-day-high-low", key))
        return fail("PDH break already flagged for this prior-day level; still trading above it");
      consume(ctx, "previous-day-high-low", key);
      return pass(
        "PDH level break; source does not define canonical full system.",
        x.close,
        undefined,
        undefined,
        "long",
        "market",
      );
    }
    if (x.close < p.low) {
      const key = `${p.day}:short`;
      if (isConsumed(ctx, "previous-day-high-low", key))
        return fail("PDL break already flagged for this prior-day level; still trading below it");
      consume(ctx, "previous-day-high-low", key);
      return pass(
        "PDL level break; source does not define canonical full system.",
        x.close,
        undefined,
        undefined,
        "short",
        "market",
      );
    }
    return fail("no PDH/PDL level break");
  },
};
export const bollingerSpec: StrategyCheck = {
  id: "bollinger-bands",
  name: "Bollinger Bands",
  run(ctx, i) {
    const b = bb(ctx, i),
      x = c(ctx, i);
    if (!b || x.close === undefined) return fail("needs 20 closes");
    const aboveNow = x.close > b.u,
      belowNow = x.close < b.l;
    const wasAbove = ctx.state.get("bollinger:above") === true,
      wasBelow = ctx.state.get("bollinger:below") === true;
    ctx.state.set("bollinger:above", aboveNow);
    ctx.state.set("bollinger:below", belowNow);
    if (aboveNow && !wasAbove)
      return pass(
        "Upper-band condition using the prior completed 20 closes (no-lookahead signal convention); fires once on the crossing bar, not on every bar of a band walk; indicator only, no canonical trade system.",
      );
    if (belowNow && !wasBelow)
      return pass(
        "Lower-band condition using the prior completed 20 closes (no-lookahead signal convention); fires once on the crossing bar, not on every bar of a band walk; indicator only, no canonical trade system.",
      );
    if (aboveNow || belowNow)
      return fail(
        "Bollinger band condition still active from an earlier bar; already flagged once for this band walk",
      );
    return fail("price remains within 20-SMA ± 2 population-SD bands");
  },
};
export const donchianSpec: StrategyCheck = {
  id: "donchian",
  name: "Donchian Channel / 5-20 Rule",
  run(ctx, i) {
    const x = c(ctx, i),
      day = eatDay(x.datetime),
      ds = priorDays(ctx, day, 20);
    if (ds.length < 20) return fail("needs 20 completed days");
    const upperNow = x.high !== undefined && x.high > dHigh(ds),
      lowerNow = x.low !== undefined && x.low < dLow(ds);
    const wasUpper = ctx.state.get("donchian:above") === true,
      wasLower = ctx.state.get("donchian:below") === true;
    ctx.state.set("donchian:above", upperNow);
    ctx.state.set("donchian:below", lowerNow);
    if (upperNow && !wasUpper)
      return pass(
        "20-day Donchian breakout; fires once on the crossing bar, not on every bar price keeps making new highs; source exit is 5-day opposite channel, not fixed TP.",
        dHigh(ds),
        undefined,
        undefined,
        "long",
        "stop",
      );
    if (lowerNow && !wasLower)
      return pass(
        "20-day Donchian breakout; fires once on the crossing bar, not on every bar price keeps making new lows; source exit is 5-day opposite channel, not fixed TP.",
        dLow(ds),
        undefined,
        undefined,
        "short",
        "stop",
      );
    if (upperNow || lowerNow)
      return fail(
        "Donchian breakout condition still active from an earlier bar; already flagged once for this run",
      );
    return fail("no 20-day Donchian breakout");
  },
};
export const insideNrSpec: StrategyCheck = {
  id: "crabel-contraction",
  name: "Crabel Inside Day / NR4 / NR7",
  run(ctx, i) {
    const day = eatDay(c(ctx, i).datetime),
      ds = priorDays(ctx, day, 8);
    if (ds.length < 8) return fail("needs 8 completed days");
    const x = ds.at(-1)!,
      p = ds.at(-2)!,
      r = x.high - x.low,
      rs = ds.slice(-7).map((d) => d.high - d.low);
    const inside = x.high <= p.high && x.low >= p.low,
      nr7 = r === Math.min(...rs),
      nr4 = r === Math.min(...rs.slice(-4));
    if (!(inside || nr4 || nr7)) return fail("no daily Inside Day/NR4/NR7 contraction");
    // BUGFIX: this is a property of one completed day (x), constant across
    // every 30-minute bar within the current trading day — previously fired on
    // every one of those bars (up to ~48x). Now fires once per diagnosed day.
    if (isConsumed(ctx, "crabel-contraction", x.day))
      return fail("daily contraction precondition already flagged for this day");
    consume(ctx, "crabel-contraction", x.day);
    return pass(
      `daily contraction precondition detected (${inside ? "Inside Day " : ""}${nr4 ? "NR4 " : ""}${nr7 ? "NR7" : ""}); diagnostic/precondition, not standalone canonical entry.`,
    );
  },
};
export const outsideSpec: StrategyCheck = {
  id: "crabel-outside-expansion",
  name: "Crabel Outside Day / Expansion Rules",
  run(ctx, i) {
    const day = eatDay(c(ctx, i).datetime),
      ds = priorDays(ctx, day, 2);
    if (ds.length < 2) return fail("needs 2 completed days");
    const p = ds[0]!,
      x = ds[1]!;
    if (!(x.high > p.high && x.low < p.low)) return fail("no outside day");
    // BUGFIX: same class of bug as Inside Day/NR4/NR7 above — a per-day fact
    // was previously re-flagged on every intraday bar. Now fires once per day.
    if (isConsumed(ctx, "crabel-outside-expansion", x.day))
      return fail("outside day already flagged for this day");
    consume(ctx, "crabel-outside-expansion", x.day);
    return pass(
      "outside day detected on completed daily aggregates; close-location edge tables require empirical replication, so this is diagnostic.",
    );
  },
};
export const fvgSpec: StrategyCheck = {
  id: "fvg-ict",
  name: "FVG / ICT",
  run(ctx, i) {
    if (i < 2) return fail("needs three candles");
    const a = c(ctx, i - 2),
      z = c(ctx, i);
    if ([a.high, a.low, z.high, z.low].some((v) => v === undefined))
      return fail("OHLC unavailable");
    const bullNow = z.low! > a.high!,
      bearNow = z.high! < a.low!;
    const wasBull = ctx.state.get("fvg-ict:bull") === true,
      wasBear = ctx.state.get("fvg-ict:bear") === true;
    ctx.state.set("fvg-ict:bull", bullNow);
    ctx.state.set("fvg-ict:bear", bearNow);
    if (bullNow && !wasBull)
      return pass("Bullish 3-candle FVG zone detected; no canonical entry/SL/TP.");
    if (bearNow && !wasBear)
      return pass("Bearish 3-candle FVG zone detected; no canonical entry/SL/TP.");
    if (bullNow || bearNow)
      return fail(
        "FVG condition still active from an earlier bar; already flagged once for this run",
      );
    return fail("no three-candle FVG");
  },
};
/** Context / diagnostic tools — logged, never counted as trades. */
export const CONTEXT_STRATEGIES: StrategyCheck[] = [
  outsideSpec,
  keltnerSpec,
  pdhSpec,
  bollingerSpec,
  donchianSpec,
  fvgSpec,
  insideNrSpec,
];

/**
 * Legacy / reference trade systems retained for research and explicit strategyIds runs.
 * Not part of the default production set (see FINAL_TRADE_STRATEGIES / FINAL_STRATEGY_IDS).
 */
export const LEGACY_TRADE_STRATEGIES: StrategyCheck[] = [turtleSpec, orbSpec];

/**
 * Full implementation registry (legacy + final 9 + context).
 * Used when callers pass explicit `strategyIds` so Turtle/ORB remain reachable for research
 * without contaminating the default production path.
 */
export const ALL_STRATEGY_IMPLEMENTATIONS: StrategyCheck[] = [
  ...LEGACY_TRADE_STRATEGIES,
  ...FINAL_TRADE_STRATEGIES,
  ...CONTEXT_STRATEGIES,
];

/**
 * Default production strategy set: the 9 locked final trade strategies plus context diagnostics.
 * Turtle and Opening-Range-Breakout are intentionally excluded from unfiltered analysis.
 */
export const SPEC_STRATEGIES: StrategyCheck[] = [...FINAL_TRADE_STRATEGIES, ...CONTEXT_STRATEGIES];
