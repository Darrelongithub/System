/**
 * LAYER 3 — The 8 Clean-Sheet Regime Bots (v2.0).
 *
 * Replaces the retired v1.8 9-strategy ruleset (final-survivors.ts). All bots:
 *   - use atr = ctx.atr[i - 1] (prior closed bar ATR) when an ATR is needed,
 *   - propose consumeKey via Outcome (consume() is NEVER called inside run()),
 *   - check isConsumed(ctx, id, key) before passing,
 *   - compute tp = side === "long" ? entry + mult * Math.abs(entry - sl)
 *                                  : entry - mult * Math.abs(entry - sl).
 *
 * Registration order is the production priority (1–8); portfolio gates run
 * before consume() in run.ts so a high-priority signal wins the bar.
 */
import type { AnalysisContext, Outcome, StrategyCheck } from "../types";
import { eatDay, eatParts } from "../time";
import { isConsumed } from "./util";
import { daysBeforeTail, lastDayBefore } from "../day-lookup";
import { getRegimeState } from "../regime-state";
import { V3_EXPANSION_STRATEGIES } from "./v3-expansion-bots";

const c = (ctx: AnalysisContext, i: number) => ctx.candles[i]!;

const pass = (
  reason: string,
  entry: number,
  sl: number,
  tp: number,
  side: "long" | "short",
  orderType: "market" | "stop" | "limit",
  consumeKey: string,
): Outcome => ({ result: "PASS", reason, entry, sl, tp, side, orderType, consumeKey });

const fail = (reason: string): Outcome => ({ result: "FAIL", reason });

/** Prior-closed-bar ATR (the v2 canonical ATR source). undefined when missing. */
function priorAtr(ctx: AnalysisContext, i: number): number | undefined {
  return ctx.atr[i - 1];
}

/** Validated range [from, to]: all bars must be valid and carry OHLC. */
function rangeHL(
  ctx: AnalysisContext,
  from: number,
  to: number,
): { high: number; low: number } | undefined {
  let hi = -Infinity;
  let lo = Infinity;
  for (let j = from; j <= to; j++) {
    const x = ctx.candles[j];
    if (!x || x.invalid || x.high === undefined || x.low === undefined) return undefined;
    if (x.high > hi) hi = x.high;
    if (x.low < lo) lo = x.low;
  }
  return Number.isFinite(hi) ? { high: hi, low: lo } : undefined;
}

function mid(ctx: AnalysisContext, from: number, to: number): number | undefined {
  const r = rangeHL(ctx, from, to);
  return r ? (r.high + r.low) / 2 : undefined;
}

function tpR(entry: number, sl: number, side: "long" | "short", mult: number): number {
  const risk = Math.abs(entry - sl);
  return side === "long" ? entry + mult * risk : entry - mult * risk;
}

/** A bar is usable for strikes when it is valid and carries close/open/high/low. */
type UsableBar = {
  open: number;
  high: number;
  low: number;
  close: number;
  invalid?: string;
  datetime: string;
  index: number;
};
function usable(
  b:
    | {
        open?: number | undefined;
        high?: number | undefined;
        low?: number | undefined;
        close?: number | undefined;
        invalid?: string | undefined;
      }
    | undefined,
): b is UsableBar {
  return (
    !!b &&
    !b.invalid &&
    b.open !== undefined &&
    b.high !== undefined &&
    b.low !== undefined &&
    b.close !== undefined
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * 1. donchian-55-coiled — 55-Bar Coiled Channel Breakout
 * ───────────────────────────────────────────────────────────────────── */
const donchian55Coiled: StrategyCheck = {
  id: "donchian-55-coiled",
  name: "55-Bar Coiled Channel Breakout",
  run(ctx, i) {
    if (i < 60) return fail("warmup");
    const x = c(ctx, i);
    if (x.close === undefined) return fail("invalid close");
    const ch55 = rangeHL(ctx, i - 55, i - 1);
    const ch20 = rangeHL(ctx, i - 20, i - 1);
    if (!ch55 || !ch20) return fail("channel unavailable");
    const day = eatDay(x.datetime);

    if (x.close > ch55.high) {
      const key = `${day}:L`;
      if (isConsumed(ctx, "donchian-55-coiled", key)) return fail("consumed");
      const sl = ch20.low;
      if (!(sl < x.close)) return fail("stop not below entry");
      return pass(
        "55-coiled breakout long",
        x.close,
        sl,
        tpR(x.close, sl, "long", 4.0),
        "long",
        "market",
        key,
      );
    }
    if (x.close < ch55.low) {
      const key = `${day}:S`;
      if (isConsumed(ctx, "donchian-55-coiled", key)) return fail("consumed");
      const sl = ch20.high;
      if (!(sl > x.close)) return fail("stop not above entry");
      return pass(
        "55-coiled breakout short",
        x.close,
        sl,
        tpR(x.close, sl, "short", 4.0),
        "short",
        "market",
        key,
      );
    }
    return fail("no breakout");
  },
};

/* ─────────────────────────────────────────────────────────────────────
 * 2. ny-pivot-s1r1-reject — NY/London Floor Pivot S1/R1 Institutional Reject
 * ───────────────────────────────────────────────────────────────────── */
const nyPivotS1R1Reject: StrategyCheck = {
  id: "ny-pivot-s1r1-reject",
  name: "NY/London Floor Pivot S1/R1 Institutional Reject",
  run(ctx, i) {
    if (i < 48) return fail("warmup");
    const x = c(ctx, i);
    if (!usable(x)) return fail("invalid bar");
    const parts = eatParts(x.datetime);
    if (!parts || parts.hour < 10 || parts.hour >= 22) return fail("outside pivot hour");
    const day = eatDay(x.datetime);
    const prior = lastDayBefore(ctx.daily, day);
    if (!prior) return fail("prior day unavailable");
    const atr = priorAtr(ctx, i);
    if (!atr) return fail("atr unavailable");
    const P = (prior.high + prior.low + prior.close) / 3;
    const S1 = 2 * P - prior.high;
    const R1 = 2 * P - prior.low;
    const key = `${day}:L`;

    if (x.low! <= S1 && x.close! > S1 && x.close! > x.open!) {
      if (isConsumed(ctx, "ny-pivot-s1r1-reject", key)) return fail("consumed");
      const sl = Math.min(x.low! - 0.5 * atr, S1 - 1.5 * atr);
      if (!(sl < x.close!)) return fail("stop not below entry");
      return pass(
        "S1 reject long",
        x.close!,
        sl,
        tpR(x.close!, sl, "long", 3.0),
        "long",
        "market",
        key,
      );
    }
    const keyS = `${day}:S`;
    if (x.high! >= R1 && x.close! < R1 && x.close! < x.open!) {
      if (isConsumed(ctx, "ny-pivot-s1r1-reject", keyS)) return fail("consumed");
      const sl = Math.max(x.high! + 0.5 * atr, R1 + 1.5 * atr);
      if (!(sl > x.close!)) return fail("stop not above entry");
      return pass(
        "R1 reject short",
        x.close!,
        sl,
        tpR(x.close!, sl, "short", 3.0),
        "short",
        "market",
        keyS,
      );
    }
    return fail("no pivot reject");
  },
};

/* ─────────────────────────────────────────────────────────────────────
 * 3. killzone-orb-stretch — London/NY Killzone ORB + Crabel Stretch
 * ───────────────────────────────────────────────────────────────────── */
interface KillzoneSpec {
  sess: "LDN" | "NY";
  orBars: [number, number]; // hm of the two 30-minute OR bars
  windowStart: number;
  windowEnd: number;
}

const KILLZONES: KillzoneSpec[] = [
  { sess: "LDN", orBars: [600, 630], windowStart: 660, windowEnd: 840 }, // 11:00-14:00
  { sess: "NY", orBars: [900, 930], windowStart: 960, windowEnd: 1140 }, // 16:00-19:00
];

/** Find the two OR M30 bars for the day/session; undefined when absent. */
function findKillzoneOr(
  ctx: AnalysisContext,
  i: number,
  day: string,
  orBars: [number, number],
): { orHigh: number; orLow: number } | undefined {
  const found = new Map<number, (typeof ctx.candles)[number]>();
  for (let j = i - 1; j >= 0; j--) {
    const bj = ctx.candles[j]!;
    if (eatDay(bj.datetime) !== day) break;
    const p = eatParts(bj.datetime);
    if (!p) continue;
    const bhm = p.hour * 60 + p.minute;
    if (bhm === orBars[0] || bhm === orBars[1]) {
      if (bj.invalid || bj.high === undefined || bj.low === undefined) return undefined;
      found.set(bhm, bj);
    }
  }
  if (found.size !== 2) return undefined;
  const a = found.get(orBars[0])!;
  const b = found.get(orBars[1])!;
  return {
    orHigh: Math.max(a.high!, b.high!),
    orLow: Math.min(a.low!, b.low!),
  };
}

const killzoneOrbStretch: StrategyCheck = {
  id: "killzone-orb-stretch",
  name: "London/NY Killzone ORB + Crabel Stretch",
  run(ctx, i) {
    if (i < 60) return fail("warmup");
    const x = c(ctx, i);
    if (!usable(x)) return fail("invalid bar");
    const parts = eatParts(x.datetime);
    if (!parts) return fail("unparseable time");
    const hm = parts.hour * 60 + parts.minute;
    const day = eatDay(x.datetime);

    const spec = KILLZONES.find((k) => hm >= k.windowStart && hm <= k.windowEnd);
    if (!spec) return fail("outside killzone");

    const priorDays = daysBeforeTail(ctx.daily, day, 10);
    if (priorDays.length < 10) return fail("insufficient prior days");

    const atr = priorAtr(ctx, i);
    if (!atr) return fail("atr unavailable");

    const or = findKillzoneOr(ctx, i, day, spec.orBars);
    if (!or) return fail("OR bars unavailable");
    const orBox = or.orHigh - or.orLow;
    if (!(orBox >= 0.8 * atr && orBox <= 2.2 * atr)) return fail("OR box too wide/narrow");

    const stretch =
      priorDays.reduce(
        (sum, d) => sum + Math.min(Math.abs(d.open - d.high), Math.abs(d.open - d.low)),
        0,
      ) / priorDays.length;
    const buf = Math.min(0.35 * stretch, 0.35 * atr);

    const key = `${day}:${spec.sess}:L`;
    const keyS = `${day}:${spec.sess}:S`;

    if (x.close! > or.orHigh + buf && x.close! > x.open!) {
      if (isConsumed(ctx, "killzone-orb-stretch", key)) return fail("consumed");
      const sl = Math.min(or.orLow, x.close! - 1.4 * atr);
      if (!(sl < x.close!)) return fail("stop not below entry");
      return pass(
        "killzone-ORB long",
        x.close!,
        sl,
        tpR(x.close!, sl, "long", 3.0),
        "long",
        "market",
        key,
      );
    }
    if (x.close! < or.orLow - buf && x.close! < x.open!) {
      if (isConsumed(ctx, "killzone-orb-stretch", keyS)) return fail("consumed");
      const sl = Math.max(or.orHigh, x.close! + 1.4 * atr);
      if (!(sl > x.close!)) return fail("stop not above entry");
      return pass(
        "killzone-ORB short",
        x.close!,
        sl,
        tpR(x.close!, sl, "short", 3.0),
        "short",
        "market",
        keyS,
      );
    }
    return fail("no killzone breakout");
  },
};

/* ─────────────────────────────────────────────────────────────────────
 * 4. supertrend-ema-pullback — SuperTrend + EMA20 Dynamic Pullback
 * ───────────────────────────────────────────────────────────────────── */
const supertrendEmaPullback: StrategyCheck = {
  id: "supertrend-ema-pullback",
  name: "SuperTrend + EMA20 Dynamic Pullback",
  run(ctx, i) {
    if (i < 30) return fail("warmup");
    const x = c(ctx, i);
    if (!usable(x)) return fail("invalid bar");
    const state = getRegimeState(ctx);
    const stDir = state.stDir;
    const stLine = state.stLine;
    const e20 = ctx.ema20[i];
    if (e20 === undefined || !Number.isFinite(e20)) return fail("ema20 unavailable");
    const atr = priorAtr(ctx, i);
    if (!atr) return fail("atr unavailable");

    const day = eatDay(x.datetime);
    if (
      stDir[i] === 1 &&
      stDir[i - 1] === 1 &&
      stDir[i - 2] === 1 &&
      x.low! <= e20 &&
      x.low! > stLine[i]! &&
      x.close! > e20 &&
      x.close! > x.open!
    ) {
      const key = `${day}:L`;
      if (isConsumed(ctx, "supertrend-ema-pullback", key)) return fail("consumed");
      const sl = Math.min(stLine[i]!, x.close! - 1.5 * atr);
      if (!(sl < x.close!)) return fail("stop not below entry");
      return pass(
        "SuperTrend pullback long",
        x.close!,
        sl,
        tpR(x.close!, sl, "long", 3.0),
        "long",
        "market",
        key,
      );
    }
    if (
      stDir[i] === -1 &&
      stDir[i - 1] === -1 &&
      stDir[i - 2] === -1 &&
      x.high! >= e20 &&
      x.high! < stLine[i]! &&
      x.close! < e20 &&
      x.close! < x.open!
    ) {
      const key = `${day}:S`;
      if (isConsumed(ctx, "supertrend-ema-pullback", key)) return fail("consumed");
      const sl = Math.max(stLine[i]!, x.close! + 1.5 * atr);
      if (!(sl > x.close!)) return fail("stop not above entry");
      return pass(
        "SuperTrend pullback short",
        x.close!,
        sl,
        tpR(x.close!, sl, "short", 3.0),
        "short",
        "market",
        key,
      );
    }
    return fail("no SuperTrend pullback");
  },
};

/* ─────────────────────────────────────────────────────────────────────
 * 5. keltner-squeeze-release — BB/Keltner Volatility Squeeze Release
 * ───────────────────────────────────────────────────────────────────── */
function popStd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const varPop = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length;
  return Math.sqrt(varPop);
}

function isSqueeze(ctx: AnalysisContext, idx: number): boolean {
  const atr = ctx.atr[idx];
  if (atr === undefined || !Number.isFinite(atr) || atr <= 0) return false;
  const closes: number[] = [];
  for (let j = idx - 19; j <= idx; j++) {
    const b = ctx.candles[j];
    if (!b || b.invalid || b.close === undefined) return false;
    closes.push(b.close);
  }
  const sd = popStd(closes);
  return 2.0 * sd < 1.6 * atr;
}

const keltnerSqueezeRelease: StrategyCheck = {
  id: "keltner-squeeze-release",
  name: "BB-Keltner Volatility Squeeze Release",
  run(ctx, i) {
    if (i < 30) return fail("warmup");
    const x = c(ctx, i);
    if (!usable(x)) return fail("invalid bar");
    let squeezeCount = 0;
    for (let k = i - 6; k <= i - 1; k++) {
      if (isSqueeze(ctx, k)) squeezeCount++;
    }
    if (squeezeCount < 3) return fail("no squeeze");

    const ch20 = rangeHL(ctx, i - 20, i - 1);
    if (!ch20) return fail("channel unavailable");

    const atr = priorAtr(ctx, i);
    if (!atr) return fail("atr unavailable");

    const day = eatDay(x.datetime);
    const key = `${day}:L`;

    if (x.close! > ch20.high && x.close! > x.open!) {
      if (isConsumed(ctx, "keltner-squeeze-release", key)) return fail("consumed");
      const sl = x.close! - 1.8 * atr;
      if (!(sl < x.close!)) return fail("stop not below entry");
      return pass(
        "squeeze release long",
        x.close!,
        sl,
        tpR(x.close!, sl, "long", 3.2),
        "long",
        "market",
        key,
      );
    }
    const keyS = `${day}:S`;
    if (x.close! < ch20.low && x.close! < x.open!) {
      if (isConsumed(ctx, "keltner-squeeze-release", keyS)) return fail("consumed");
      const sl = x.close! + 1.8 * atr;
      if (!(sl > x.close!)) return fail("stop not above entry");
      return pass(
        "squeeze release short",
        x.close!,
        sl,
        tpR(x.close!, sl, "short", 3.2),
        "short",
        "market",
        keyS,
      );
    }
    return fail("no squeeze release");
  },
};

/* ─────────────────────────────────────────────────────────────────────
 * 6. asymmetric-vol-breakout — Asymmetric Volatility Expansion Breakout
 * ───────────────────────────────────────────────────────────────────── */
const asymmetricVolBreakout: StrategyCheck = {
  id: "asymmetric-vol-breakout",
  name: "Asymmetric Volatility Expansion Breakout 36L/18S",
  run(ctx, i) {
    if (i < 40) return fail("warmup");
    const x = c(ctx, i);
    if (!usable(x)) return fail("invalid bar");

    let hi36 = -Infinity;
    for (let j = i - 36; j <= i - 1; j++) {
      const b = ctx.candles[j];
      if (!b || b.invalid || b.high === undefined) return fail("hi36 unavailable");
      if (b.high > hi36) hi36 = b.high;
    }
    let lo18 = Infinity;
    for (let j = i - 18; j <= i - 1; j++) {
      const b = ctx.candles[j];
      if (!b || b.invalid || b.low === undefined) return fail("lo18 unavailable");
      if (b.low < lo18) lo18 = b.low;
    }

    const atr = priorAtr(ctx, i);
    if (!atr) return fail("atr unavailable");

    const day = eatDay(x.datetime);
    const key = `${day}:L`;

    if (x.close! > hi36 && x.close! > x.open!) {
      if (isConsumed(ctx, "asymmetric-vol-breakout", key)) return fail("consumed");
      const sl = x.close! - 1.6 * atr;
      if (!(sl < x.close!)) return fail("stop not below entry");
      return pass(
        "asymmetric vol breakout long",
        x.close!,
        sl,
        tpR(x.close!, sl, "long", 3.5),
        "long",
        "market",
        key,
      );
    }
    const keyS = `${day}:S`;
    if (x.close! < lo18 && x.close! < x.open!) {
      if (isConsumed(ctx, "asymmetric-vol-breakout", keyS)) return fail("consumed");
      const sl = x.close! + 1.5 * atr;
      if (!(sl > x.close!)) return fail("stop not above entry");
      return pass(
        "asymmetric vol breakout short",
        x.close!,
        sl,
        tpR(x.close!, sl, "short", 2.6),
        "short",
        "market",
        keyS,
      );
    }
    return fail("no asymmetric breakout");
  },
};

/* ─────────────────────────────────────────────────────────────────────
 * 7. kijun-cloud-continuation — Ichimoku Cloud & Kijun Continuation
 * ───────────────────────────────────────────────────────────────────── */
const kijunCloudContinuation: StrategyCheck = {
  id: "kijun-cloud-continuation",
  name: "Ichimoku Cloud & Kijun Continuation",
  run(ctx, i) {
    if (i < 60) return fail("warmup");
    const x = c(ctx, i);
    if (!usable(x)) return fail("invalid bar");
    const atr = priorAtr(ctx, i);
    if (!atr) return fail("atr unavailable");

    const tenkanAt = (idx: number) => mid(ctx, idx - 8, idx);
    const kijunAt = (idx: number) => mid(ctx, idx - 25, idx);
    const spanBAt = (idx: number) => mid(ctx, idx - 51, idx);
    const spanAAt = (idx: number) => {
      const tenkan = tenkanAt(idx);
      const kijun = kijunAt(idx);
      return tenkan !== undefined && kijun !== undefined ? (tenkan + kijun) / 2 : undefined;
    };

    const tenkanNow = tenkanAt(i);
    const kijunNow = kijunAt(i);
    const tenkanPrev = tenkanAt(i - 1);
    const kijunPrev = kijunAt(i - 1);
    const spanANow = spanAAt(i);
    const spanBNow = spanBAt(i);
    if (
      tenkanNow === undefined ||
      kijunNow === undefined ||
      tenkanPrev === undefined ||
      kijunPrev === undefined ||
      spanANow === undefined ||
      spanBNow === undefined
    ) {
      return fail("ichimoku unavailable");
    }

    const day = eatDay(x.datetime);
    const key = `${day}:L`;

    if (
      tenkanPrev <= kijunPrev &&
      tenkanNow > kijunNow &&
      x.close! > Math.max(spanANow, spanBNow)
    ) {
      if (isConsumed(ctx, "kijun-cloud-continuation", key)) return fail("consumed");
      const sl = Math.min(kijunNow - 0.5 * atr, x.close! - 1.5 * atr);
      if (!(sl < x.close!)) return fail("stop not below entry");
      return pass(
        "Kijun continuation long",
        x.close!,
        sl,
        tpR(x.close!, sl, "long", 3.0),
        "long",
        "market",
        key,
      );
    }
    const keyS = `${day}:S`;
    if (
      tenkanPrev >= kijunPrev &&
      tenkanNow < kijunNow &&
      x.close! < Math.min(spanANow, spanBNow)
    ) {
      if (isConsumed(ctx, "kijun-cloud-continuation", keyS)) return fail("consumed");
      const sl = Math.max(kijunNow + 0.5 * atr, x.close! + 1.5 * atr);
      if (!(sl > x.close!)) return fail("stop not above entry");
      return pass(
        "Kijun continuation short",
        x.close!,
        sl,
        tpR(x.close!, sl, "short", 3.0),
        "short",
        "market",
        keyS,
      );
    }
    return fail("no cloud continuation");
  },
};

/* ─────────────────────────────────────────────────────────────────────
 * 8. engulfing-zone-retest — Engulfing Supply/Demand Zone First-Retest
 * ───────────────────────────────────────────────────────────────────── */

interface EngulfingZone {
  side: "long" | "short";
  top: number;
  bot: number;
  createdIdx: number;
}

const ZONE_KEY = "eng_zones";
const ZONE_MAX_AGE = 24;

function getZones(ctx: AnalysisContext): EngulfingZone[] {
  let zones = ctx.state.get(ZONE_KEY) as EngulfingZone[] | undefined;
  if (!zones) {
    zones = [];
    ctx.state.set(ZONE_KEY, zones);
  }
  return zones;
}

const engulfingZoneRetest: StrategyCheck = {
  id: "engulfing-zone-retest",
  name: "Engulfing Supply/Demand Zone First-Retest",
  run(ctx, i) {
    if (i < 25) return fail("warmup");
    const x = c(ctx, i);
    if (!usable(x)) return fail("invalid bar");
    const atr = priorAtr(ctx, i);
    if (!atr) return fail("atr unavailable");

    const zones = getZones(ctx);

    // Detect a newly completed engulfing bar (p = candles[i-1], pp = candles[i-2]).
    const p = ctx.candles[i - 1]!;
    const pp = ctx.candles[i - 2]!;
    if (usable(p) && usable(pp)) {
      const pBody = Math.abs(p.close! - p.open!);
      const ppBody = Math.abs(pp.close! - pp.open!);
      if (pBody >= 1.0 * atr && pBody > 1.2 * ppBody) {
        if (
          p.close! > p.open! &&
          pp.close! < pp.open! &&
          p.close! > pp.open! &&
          p.open! <= pp.close!
        ) {
          zones.push({
            side: "long",
            top: Math.max(pp.open!, p.open! + 0.25 * pBody),
            bot: Math.min(p.low!, pp.low!),
            createdIdx: i - 1,
          });
        } else if (
          p.close! < p.open! &&
          pp.close! > pp.open! &&
          p.close! < pp.open! &&
          p.open! >= pp.close!
        ) {
          zones.push({
            side: "short",
            top: Math.max(p.high!, pp.high!),
            bot: Math.min(pp.open!, p.open! - 0.25 * pBody),
            createdIdx: i - 1,
          });
        }
      }
    }

    // Prune expired / mitigated zones (scan completed bars strictly after creation).
    for (let k = zones.length - 1; k >= 0; k--) {
      const z = zones[k]!;
      if (i - z.createdIdx > ZONE_MAX_AGE) {
        zones.splice(k, 1);
        continue;
      }
      let mitigated = false;
      for (let j = z.createdIdx + 1; j <= i - 1; j++) {
        const b = ctx.candles[j];
        if (!b || b.invalid || b.close === undefined) continue;
        if (z.side === "long" && b.close < z.bot) {
          mitigated = true;
          break;
        }
        if (z.side === "short" && b.close > z.top) {
          mitigated = true;
          break;
        }
      }
      if (mitigated) zones.splice(k, 1);
    }

    const day = eatDay(x.datetime);

    // Iterate newest-to-oldest; the first retest wins the day key.
    for (let k = zones.length - 1; k >= 0; k--) {
      const z = zones[k]!;
      if (i <= z.createdIdx) continue;
      if (z.side === "long") {
        if (x.low! <= z.top && x.close! > z.top && x.close! > x.open!) {
          const key = `${day}:L`;
          if (isConsumed(ctx, "engulfing-zone-retest", key)) return fail("consumed");
          const sl = Math.min(z.bot - 0.5 * atr, x.close! - 1.4 * atr);
          if (!(sl < x.close!)) return fail("stop not below entry");
          return pass(
            "engulfing zone retest long",
            x.close!,
            sl,
            tpR(x.close!, sl, "long", 3.0),
            "long",
            "market",
            key,
          );
        }
      } else {
        if (x.high! >= z.bot && x.close! < z.bot && x.close! < x.open!) {
          const key = `${day}:S`;
          if (isConsumed(ctx, "engulfing-zone-retest", key)) return fail("consumed");
          const sl = Math.max(z.top + 0.5 * atr, x.close! + 1.4 * atr);
          if (!(sl > x.close!)) return fail("stop not above entry");
          return pass(
            "engulfing zone retest short",
            x.close!,
            sl,
            tpR(x.close!, sl, "short", 3.0),
            "short",
            "market",
            key,
          );
        }
      }
    }
    return fail("no zone retest");
  },
};

/** Core v2.2 regime-routed foundation bots (priority tier 1 under Core-First routing). */
export const V2_CORE_STRATEGIES: StrategyCheck[] = [
  donchian55Coiled,
  nyPivotS1R1Reject,
  killzoneOrbStretch,
  supertrendEmaPullback,
  keltnerSqueezeRelease,
  asymmetricVolBreakout,
  kijunCloudContinuation,
  engulfingZoneRetest,
];

/**
 * Active v3.0 production trade strategies: 30 Stage-2A-routed institutional bots
 * (8 Core v2.2 foundation bots + 22 certified quantitative expansion bots).
 */
export const V2_TRADE_STRATEGIES: StrategyCheck[] = [
  ...V2_CORE_STRATEGIES,
  ...V3_EXPANSION_STRATEGIES,
];

export const V2_STRATEGY_IDS = V2_TRADE_STRATEGIES.map((s) => s.id);
