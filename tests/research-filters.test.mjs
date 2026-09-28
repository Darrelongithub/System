/**
 * Research candidates — the forward-validation freeze (all four default OFF).
 *
 * Four loss-reduction hypotheses are implemented in `regime-filters.ts` and
 * wired into `run.ts` in the same gate chain as Filters C and F — after C and
 * F, before `consume()`. They ship dormant (`enableFilterX ?? false`) until
 * each has been evaluated once on post-2026-08-20 data under the pre-registered
 * criteria in `FORWARD-VALIDATION.md`:
 *
 *   D_conflict_nearPDL   EMA20/50/200 stack conflict + entry at pos ≤ 0.26 of
 *                        the prior EAT day's range + trend-aligned.
 *   H1214                signal bar in hours 12–14 EAT (inclusive).
 *   Doji+highVol         doji bar (body < 15% of range) + ATR percentile ≥ 0.80.
 *   doji+compressed      doji bar + range/ATR ≤ 0.66.
 *
 * These tests pin five properties, in the same spirit as
 * `tests/regime-filter-f.test.mjs`:
 *
 *   1. the predicates themselves, including fail-open behaviour and the exact
 *      threshold boundaries (≤/≥ inclusive where the definition says so);
 *   2. dormancy — with the four flags unset the engine reproduces the shipped
 *      book byte-for-byte, and the shipped configurations never set them;
 *   3. soundness + completeness on the locked baseline — every FILTER_X row
 *      satisfies the rule re-derived from engine values, and every rule-
 *      satisfying candidate of the C+F book is rejected by that candidate;
 *   4. ordering — a candidate only ever sees setups that already passed C and F
 *      (no FILTER_X row would also have been rejected by C or F);
 *   5. entry-time-only causality — truncating the series at the signal bar
 *      reproduces the decision, so no later bar can influence it.
 *
 * The "does not consume the de-dupe slot" design rule is pinned behaviourally:
 * the locked baseline contains trades that can only exist because a candidate
 * rejection left the slot free for a later refill.
 *
 * The discovery fingerprints (rejection counts, engine ΔR, removed trades and
 * their own R) are pinned from the frozen research definitions — they are
 * DISCOVERY-window numbers, evidence of nothing until OOS. They exist so a
 * silent threshold edit cannot masquerade as the frozen candidate.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { createHash } from "node:crypto";
import { loadBaselineCsv } from "./fixtures.mjs";
import {
  atrPercentileAt,
  isCounterTrend,
  isDoji,
  isEmaStackConflict,
  isTrendAligned,
  priorDayPos,
  rejectFilterC,
  rejectFilterD,
  rejectFilterDojiCompressed,
  rejectFilterDojiHighVol,
  rejectFilterF,
  rejectFilterH1214,
  FILTER_D_REASON,
  FILTER_DOJI_COMPRESSED_REASON,
  FILTER_DOJI_HIGHVOL_REASON,
  FILTER_H1214_REASON,
} from "../src/lib/analyzer/regime-filters.ts";
import { runAnalysis } from "../src/lib/analyzer/run.ts";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import { atrSeries } from "../src/lib/analyzer/pivots.ts";
import { ema } from "../src/lib/analyzer/indicators.ts";
import { dailyAggregates } from "../src/lib/analyzer/daily.ts";
import { eatParts } from "../src/lib/analyzer/time.ts";
import { ANALYZER_CERTIFIED_OPTIONS, ANALYZER_LIVE_OPTIONS } from "../src/lib/analyzer/config.ts";
import { isTradeStrategy } from "../src/lib/analyzer/strategy-kind.ts";

/* ------------------------------------------------------------------ *
 * Stub contexts (predicate-level; no engine involved)
 * ------------------------------------------------------------------ */

const candleOf = (o, h, l, c, extra = {}) => ({
  index: 0,
  datetime: "2025-01-02 12:00:00",
  open: o,
  high: h,
  low: l,
  close: c,
  invalid: undefined,
  ...extra,
});

/** n candles whose closes follow `closes`; flat OHLC around each close. */
const closesSeries = (closes) =>
  closes.map((close, index) => ({
    index,
    datetime: "2025-01-02 12:00:00",
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    invalid: undefined,
  }));

const ramp = (n, dir) => closesSeries(Array.from({ length: n }, (_, i) => 1000 + dir * i));
const flat = (n) => closesSeries(Array.from({ length: n }, () => 1000));
/**
 * Genuinely mixed stack: a long plateau (EMA200 high), a drop (EMA50 below
 * EMA200) and a partial recovery (EMA20 back above EMA50). Neither strict bull
 * nor strict bear order — the conflict Filter D looks for.
 */
const mixedStack = () =>
  closesSeries(Array.from({ length: 250 }, (_, i) => (i < 150 ? 1000 : i < 230 ? 800 : 900)));

const PRIOR_DAY = {
  day: "2025-01-01",
  high: 110,
  low: 100,
  open: 100,
  close: 105,
  start: 0,
  end: 249,
};
const TODAY = {
  day: "2025-01-02",
  high: 112,
  low: 99,
  open: 100,
  close: 104,
  start: 250,
  end: 251,
};
const dailyStub = () => [PRIOR_DAY, TODAY];

const stubCtx = (candles, { atr, daily } = {}) => ({
  candles,
  atr: atr ?? candles.map(() => 5),
  daily: daily ?? dailyStub(),
});

/* ------------------------------------------------------------------ *
 * Discovery fingerprints (locked baseline, C+F on, one candidate at a time)
 * ------------------------------------------------------------------ */

const CANDIDATES = [
  {
    id: "D",
    label: "D_conflict_nearPDL",
    option: "enableFilterD",
    reasonRe: /^FILTER_D/,
    reason: FILTER_D_REASON,
    rejects: 211,
    trades: 2210,
    rSum: 600.46227843045438,
    deltaR: 72.834992692598917,
    removed: 129,
    removedR: -48.872184494429661,
    slotReleased: 48,
    slotStrategies: 8,
  },
  {
    id: "H1214",
    label: "H1214",
    option: "enableFilterH1214",
    reasonRe: /^FILTER_H1214/,
    reason: FILTER_H1214_REASON,
    rejects: 231,
    trades: 2187,
    rSum: 555.76384950094973,
    deltaR: 28.136563763094273,
    removed: 194,
    removedR: -16.638822929493468,
    slotReleased: 84,
    slotStrategies: 8,
  },
  {
    id: "DojiHighVol",
    label: "Doji+highVol",
    option: "enableFilterDojiHighVol",
    reasonRe: /^FILTER_DOJI_HIGHVOL/,
    reason: FILTER_DOJI_HIGHVOL_REASON,
    rejects: 38,
    trades: 2267,
    rSum: 545.18528038365105,
    deltaR: 17.557994645795588,
    removed: 37,
    removedR: -5.9539292928163317,
    slotReleased: 16,
    slotStrategies: 5,
  },
  {
    id: "DojiCompressed",
    label: "doji+compressed",
    option: "enableFilterDojiCompressed",
    reasonRe: /^FILTER_DOJI_COMPRESSED/,
    reason: FILTER_DOJI_COMPRESSED_REASON,
    rejects: 74,
    trades: 2252,
    rSum: 551.43251544591703,
    deltaR: 23.805229708061574,
    removed: 72,
    removedR: -14.796531262105164,
    slotReleased: 37,
    slotStrategies: 6,
  },
];

const GOLDEN = { trades: 2286, rSum: 527.62728573785546 };
const keyOf = (r) => `${r.strategyId}|${r.datetime}|${r.index}|${r.side ?? "-"}`;

/* ------------------------------------------------------------------ *
 * Engine runs (one pass per configuration, shared across the tests)
 * ------------------------------------------------------------------ */

let engine = null;

function engineRuns() {
  if (engine) return engine;
  const csv = loadBaselineCsv();
  const candles = parseCsv(csv).candles;
  const atr = atrSeries(candles);
  const daily = dailyAggregates(candles);
  // One shared context object: regime-filters caches its per-series work (ATR
  // percentile, EMA stack) on the context, so every predicate call in this file
  // must go through this same object rather than a fresh literal.
  const ctx = { candles, atr, daily };
  const base = { seriesEndsComplete: true };

  const run = (options) => {
    const out = runAnalysis(csv, options);
    if (!out.ok)
      throw new Error(`baseline run must parse (${JSON.stringify(options)}): ${out.error}`);
    return out.analysis;
  };

  const off = run(base);
  const on = {};
  for (const candidate of CANDIDATES) {
    on[candidate.id] = run({ ...base, [candidate.option]: true });
  }

  engine = {
    csv,
    ctx,
    spread: off.spread,
    ema20: ema(candles, 20),
    ema50: ema(candles, 50),
    ema200: ema(candles, 200),
    off,
    on,
  };
  return engine;
}

/* ------------------------------------------------------------------ *
 * Independent rule re-derivations (from engine values, not the module)
 * ------------------------------------------------------------------ */

const ATR_WINDOW = 50;

/** Percentile of atr[i] among the prior 50 finite ATRs; null without a full window. */
function pctl(atr, i) {
  const a = atr[i];
  if (a === undefined || !Number.isFinite(a)) return null;
  if (i - ATR_WINDOW < 0) return null;
  const past = [];
  for (let j = i - ATR_WINDOW; j < i; j++) {
    const v = atr[j];
    if (v !== undefined && Number.isFinite(v)) past.push(v);
  }
  if (past.length < ATR_WINDOW) return null;
  let le = 0;
  for (const v of past) if (v <= a) le++;
  return le / past.length;
}

const dojiOf = (candle) => {
  if (!candle || candle.invalid) return false;
  const { high, low, open, close } = candle;
  if (high === undefined || low === undefined || open === undefined || close === undefined)
    return false;
  const range = high - low;
  if (!(range > 0)) return false;
  return Math.abs(close - open) / range < 0.15;
};

/**
 * Filter D reads the strategy's raw signal entry (`outcome.entry ?? row.entry`
 * in run.ts). The row carries the spread-adjusted entry, so the raw one is
 * reconstructed with the documented spread model (math.ts: long +spread,
 * short −spread). The last test in this file pins that the two choices cannot
 * disagree on the locked baseline.
 */
const rawEntryOf = (row, spread) => {
  if (row.entry === undefined) return undefined;
  return row.side === "short" ? row.entry + spread : row.entry - spread;
};

function ruleD(row, e) {
  if (row.side === undefined) return false;
  const entry = rawEntryOf(row, e.spread);
  if (entry === undefined || !Number.isFinite(entry)) return false;
  const e20 = e.ema20[row.index];
  const e50 = e.ema50[row.index];
  const e200 = e.ema200[row.index];
  if (e20 === undefined || e50 === undefined || e200 === undefined) return false;
  const bull = e20 > e50 && e50 > e200;
  const bear = e20 < e50 && e50 < e200;
  if (bull || bear) return false; // stack must be conflicted
  const counterTrend =
    (row.side === "long" && row.trend === "bearish") ||
    (row.side === "short" && row.trend === "bullish");
  if (counterTrend) return false; // trend-aligned only
  const parts = eatParts(e.ctx.candles[row.index].datetime);
  if (!parts) return false;
  const idx = e.ctx.daily.findIndex((d) => d.day === parts.day);
  if (idx <= 0) return false;
  const prior = e.ctx.daily[idx - 1];
  if (!(prior.high > prior.low)) return false;
  const pos = (entry - prior.low) / (prior.high - prior.low);
  return pos <= 0.26;
}

const ruleH1214 = (row, e) => {
  const parts = eatParts(e.ctx.candles[row.index].datetime);
  if (!parts) return false;
  return parts.hour >= 12 && parts.hour <= 14;
};

const ruleDojiHighVol = (row, e) => {
  if (!dojiOf(e.ctx.candles[row.index])) return false;
  const p = pctl(e.ctx.atr, row.index);
  return p !== null && p >= 0.8;
};

const ruleDojiCompressed = (row, e) => {
  if (!dojiOf(e.ctx.candles[row.index])) return false;
  const candle = e.ctx.candles[row.index];
  const a = e.ctx.atr[row.index];
  if (a === undefined || !(a > 0)) return false;
  if (candle.high === undefined || candle.low === undefined) return false;
  return (candle.high - candle.low) / a <= 0.66;
};

const RULES = {
  D: ruleD,
  H1214: ruleH1214,
  DojiHighVol: ruleDojiHighVol,
  DojiCompressed: ruleDojiCompressed,
};

/* ================================================================== *
 * 1. Shared helpers
 * ================================================================== */

test("research helpers: the EMA stack is conflicted only when neither strict order holds", () => {
  const last = (candles) => candles.length - 1;
  // Strict bull: a rising series keeps the shorter EMAs above the longer ones.
  const up = ramp(250, 1);
  assert(!isEmaStackConflict(stubCtx(up), last(up)), "ramp up is a bull stack");
  // Strict bear: a falling series inverts it.
  const down = ramp(250, -1);
  assert(!isEmaStackConflict(stubCtx(down), last(down)), "ramp down is a bear stack");
  // Flat: every EMA is equal — neither bull nor bear.
  const level = flat(250);
  assert(isEmaStackConflict(stubCtx(level), last(level)), "flat series is conflicted");
  // Genuinely mixed: EMA20 above EMA50 while EMA50 sits below EMA200.
  const mixed = mixedStack();
  const e20 = ema(mixed, 20)[mixed.length - 1];
  const e50 = ema(mixed, 50)[mixed.length - 1];
  const e200 = ema(mixed, 200)[mixed.length - 1];
  assert(e20 > e50 && e50 < e200, "the mixed fixture must be a mixed stack");
  assert(isEmaStackConflict(stubCtx(mixed), mixed.length - 1), "mixed order is conflicted");
  // Fail-open: without a full EMA200 there is no stack to judge.
  const shortSeries = flat(50);
  assert(
    !isEmaStackConflict(stubCtx(shortSeries), shortSeries.length - 1),
    "undefined EMA200 must fail open",
  );
  assert(!isEmaStackConflict(stubCtx([]), 0), "missing candle must fail open");
});

test("research helpers: priorDayPos measures the prior EAT day's range, fail-open", () => {
  const ctx = { candles: [candleOf(100, 112, 99, 104)], daily: dailyStub(), atr: [5] };
  // Prior day 100–110: 0 = low, 1 = high.
  assertEqual(priorDayPos(ctx, 0, 100), 0, "at the prior-day low");
  assertEqual(priorDayPos(ctx, 0, 105), 0.5, "mid-range");
  assertEqual(priorDayPos(ctx, 0, 110), 1, "at the prior-day high");
  // The D threshold value (compared approximately: 102.6 is not exact in binary).
  assert(
    Math.abs(priorDayPos(ctx, 0, 102.6) - 0.26) < 1e-12,
    `the D threshold value, got ${priorDayPos(ctx, 0, 102.6)}`,
  );
  assert(priorDayPos(ctx, 0, 95) < 0, "below the prior-day low is negative, not clamped");
  // No prior day with data (the current day is the first aggregate).
  assertEqual(
    priorDayPos({ ...ctx, daily: [TODAY] }, 0, 105),
    null,
    "first day in the series has no prior day",
  );
  // Zero-width prior range.
  assertEqual(
    priorDayPos({ ...ctx, daily: [{ ...PRIOR_DAY, high: 100 }, TODAY] }, 0, 105),
    null,
    "zero-width prior range must fail open",
  );
  // Missing / unparseable inputs.
  assertEqual(priorDayPos({ ...ctx, candles: [] }, 0, 105), null, "missing candle");
  assertEqual(
    priorDayPos(
      { ...ctx, candles: [candleOf(100, 112, 99, 104, { datetime: "not-a-date" })] },
      0,
      105,
    ),
    null,
    "unparseable datetime must fail open",
  );
});

test("research helpers: isDoji is a strict body/range test", () => {
  const ctx = (candle) => stubCtx([candle], { daily: [] });
  // body 1.5 / range 10 = 0.15 exactly — the bound is strict (<), so not a doji.
  assert(!isDoji(ctx(candleOf(100, 110, 100, 101.5)), 0), "body exactly 15% is not a doji");
  assert(isDoji(ctx(candleOf(100, 110, 100, 101.4)), 0), "body 14% is a doji");
  // Wick asymmetry is irrelevant to the atom.
  assert(isDoji(ctx(candleOf(100, 120, 100, 101)), 0), "a long wick does not spoil a doji");
  // Fail-open cases.
  assert(!isDoji(ctx(candleOf(100, 100, 100, 100)), 0), "zero range");
  assert(!isDoji(ctx(candleOf(100, 110, 100, 105, { invalid: "corrupt" })), 0), "invalid row");
  assert(!isDoji(ctx(candleOf(undefined, 110, 100, 101)), 0), "missing open");
  assert(!isDoji(ctx(candleOf(100, undefined, 100, 101)), 0), "missing high");
  assert(!isDoji(stubCtx([]), 0), "missing candle");
});

test("research helpers: the ATR percentile ranks the prior window only", () => {
  // 51 bars with atr = index: at bar 50 the priors are 0..49 (exactly 50 values).
  // A fresh context per value: the percentile series is cached on the context,
  // so mutating a shared atr array would read a stale cache.
  const candles = closesSeries(Array.from({ length: 51 }, () => 1000));
  const ctxWith = (value) => ({
    candles,
    atr: Array.from({ length: 51 }, (_, i) => (i === 50 ? value : i)),
  });
  // atr[50] = 25 → 26 of the 50 priors are ≤ it.
  assertEqual(atrPercentileAt(ctxWith(25), 50), 26 / 50, "current ATR ranked against priors only");
  // The current value is NOT in the reference set: a value equal to the largest
  // prior ranks 1.0, and one equal to the smallest ranks 1/50, not 2/51.
  assertEqual(atrPercentileAt(ctxWith(49), 50), 1, "equal to the max prior");
  assertEqual(atrPercentileAt(ctxWith(0), 50), 1 / 50, "equal to the min prior");
  // Window size is pinned: at bar 60 the priors are 10..59.
  assertEqual(
    atrPercentileAt(
      {
        candles: closesSeries(Array.from({ length: 61 }, () => 1000)),
        atr: Array.from({ length: 61 }, (_, i) => (i === 60 ? 10 : i)),
      },
      60,
    ),
    1 / 50,
    "exactly 50 priors, not 51",
  );
  // Fail-open: insufficient history, non-finite ATR in the window, missing ATR.
  assertEqual(atrPercentileAt(ctxWith(25), 49), null, "49 priors is not a full window");
  const hole = ctxWith(25);
  hole.atr[10] = NaN;
  assertEqual(
    atrPercentileAt(hole, 50),
    null,
    "a non-finite prior breaks the full-window requirement",
  );
  assertEqual(atrPercentileAt({ candles, atr: [] }, 50), null, "missing ATR");
});

test("research helpers: trend alignment is the complement of counter-trend", () => {
  for (const side of ["long", "short"]) {
    for (const trend of ["bullish", "bearish", "ranging"]) {
      assertEqual(
        isTrendAligned(trend, side),
        !isCounterTrend(trend, side),
        `${side} in a ${trend} structure`,
      );
    }
  }
  // The rule is symmetric by construction, and a side-less row is never
  // counter-trend (so `isTrendAligned` is true for it — run.ts guards the
  // side-less case in the D branch, see the engine test below).
  assert(isCounterTrend("bearish", "long"), "long into a bearish structure is counter-trend");
  assert(isCounterTrend("bullish", "short"), "short into a bullish structure is counter-trend");
  assert(!isCounterTrend("ranging", "long"), "ranging is not counter-trend");
  assert(!isCounterTrend("bullish", undefined), "no side is not counter-trend");
});

/* ================================================================== *
 * 2. Candidate predicates
 * ================================================================== */

test("research D: fires only on a conflicted stack near the prior-day low, trend-aligned", () => {
  const conflicted = stubCtx(flat(250));
  const i = 249;
  // Boundary: pos exactly 0.26 is inside the rule (≤), 0.27 is outside.
  assert(
    rejectFilterD(conflicted, i, "bullish", "long", 102.6),
    "pos 0.26 on a conflicted stack must be rejected",
  );
  assert(!rejectFilterD(conflicted, i, "bullish", "long", 102.7), "pos 0.27 must not be rejected");
  // pos 0 (at the prior-day low) is inside; far above the low is outside.
  assert(rejectFilterD(conflicted, i, "bullish", "long", 100), "pos 0 must be rejected");
  assert(!rejectFilterD(conflicted, i, "bullish", "long", 108), "pos 0.8 must not be rejected");
  // Ranging structure counts as trend-aligned (it is not counter-trend).
  assert(
    rejectFilterD(conflicted, i, "ranging", "long", 102),
    "ranging structure is trend-aligned for this rule",
  );
  // Counter-trend candidates are explicitly out of scope for D.
  assert(
    !rejectFilterD(conflicted, i, "bearish", "long", 102),
    "counter-trend long must not be rejected by D",
  );
  assert(
    !rejectFilterD(conflicted, i, "bullish", "short", 102),
    "counter-trend short must not be rejected by D",
  );
  // A side-less row satisfies the predicate (trend-aligned by the complement
  // definition); run.ts's `outcome.side &&` guard is what protects it, and the
  // engine test below pins that no side-less row is ever rejected.
  assert(
    rejectFilterD(conflicted, i, "bullish", undefined, 102),
    "the predicate itself has no side guard — the wire-in does",
  );
  // Aligned stacks never reject, in either direction.
  const bull = stubCtx(ramp(250, 1));
  assert(!rejectFilterD(bull, i, "bullish", "long", 102), "bull stack is not conflicted");
  const bear = stubCtx(ramp(250, -1));
  assert(!rejectFilterD(bear, i, "bearish", "short", 102), "bear stack is not conflicted");
  const mixed = stubCtx(mixedStack());
  assert(rejectFilterD(mixed, i, "bullish", "long", 102.6), "mixed stack is conflicted");
});

test("research D: fails open on missing inputs", () => {
  const conflicted = stubCtx(flat(250));
  const i = 249;
  for (const [label, entry] of [
    ["undefined entry", undefined],
    ["NaN entry", NaN],
    ["infinite entry", Infinity],
  ]) {
    assert(!rejectFilterD(conflicted, i, "bullish", "long", entry), `${label} must fail open`);
  }
  // No prior day / zero-width prior day.
  assert(
    !rejectFilterD(stubCtx(flat(250), { daily: [TODAY] }), i, "bullish", "long", 102),
    "no prior day must fail open",
  );
  assert(
    !rejectFilterD(
      stubCtx(flat(250), { daily: [{ ...PRIOR_DAY, high: 100 }, TODAY] }),
      i,
      "bullish",
      "long",
      102,
    ),
    "zero-width prior range must fail open",
  );
  // Incomplete EMA stack.
  const shortSeries = stubCtx(flat(50));
  assert(
    !rejectFilterD(shortSeries, shortSeries.candles.length - 1, "bullish", "long", 102),
    "an undefined EMA200 must fail open",
  );
  assert(!rejectFilterD(stubCtx([]), 0, "bullish", "long", 102), "missing candle must fail open");
});

test("research H1214: fires only in hours 12–14 EAT", () => {
  const at = (hour, minute = 30) =>
    stubCtx([
      candleOf(100, 110, 100, 105, {
        datetime: `2025-01-02 ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
      }),
    ]);
  for (const hour of [12, 13, 14]) {
    assert(rejectFilterH1214(at(hour), 0), `hour ${hour} must be rejected`);
  }
  assert(rejectFilterH1214(at(12, 0), 0), "12:00 is inside the window");
  assert(rejectFilterH1214(at(14, 59), 0), "14:59 is inside the window");
  // The window is the hour range, not the whole london session: 11:xx and 15:xx
  // are london too and must NOT be rejected.
  for (const hour of [0, 1, 10, 11, 15, 16, 23]) {
    assert(!rejectFilterH1214(at(hour), 0), `hour ${hour} must not be rejected`);
  }
  // Fail-open.
  assert(!rejectFilterH1214(stubCtx([]), 0), "missing candle must fail open");
  assert(
    !rejectFilterH1214(stubCtx([candleOf(100, 110, 100, 105, { datetime: "2025-01-02" })]), 0),
    "a datetime without a time must fail open",
  );
  assert(
    !rejectFilterH1214(stubCtx([candleOf(100, 110, 100, 105, { datetime: "garbage" })]), 0),
    "an unparseable datetime must fail open",
  );
});

test("research Doji+highVol: fires only on a doji at ATR percentile ≥ 0.80", () => {
  // 51 bars, atr = index, so bar 50 has exactly the 50 priors 0..49.
  const candles = closesSeries(Array.from({ length: 51 }, () => 1000));
  const withAtr = (value) => {
    const atr = Array.from({ length: 51 }, (_, i) => i);
    atr[50] = value;
    return { candles, atr };
  };
  /** Make bar 50 a doji (body 0.5 over a range of 10 → 5%). */
  const doji = () => {
    candles[50] = candleOf(100, 110, 100, 100.5, { index: 50 });
    return 50;
  };
  // atr[50] = 40 → 41 priors ≤ it → 0.82 ≥ 0.80.
  assert(rejectFilterDojiHighVol(withAtr(40), doji()), "doji at pctl 0.82 must be rejected");
  // Inclusive boundary: atr[50] = 39 → exactly 40 priors ≤ it → 0.80.
  assert(rejectFilterDojiHighVol(withAtr(39), doji()), "pctl exactly 0.80 must be rejected");
  // Just below: atr[50] = 38 → 39/50 = 0.78.
  assert(!rejectFilterDojiHighVol(withAtr(38), doji()), "pctl 0.78 must not be rejected");
  // A strong-bodied bar is not a doji whatever the volatility.
  candles[50] = candleOf(100, 110, 100, 109, { index: 50 });
  assert(
    !rejectFilterDojiHighVol(withAtr(49), 50),
    "a full-bodied bar is not a doji even at the top percentile",
  );
  // Fail-open: no full percentile window, or a non-finite prior ATR.
  assert(!rejectFilterDojiHighVol(withAtr(40), 40), "insufficient history must fail open");
  const hole = withAtr(40);
  hole.atr[10] = NaN;
  assert(!rejectFilterDojiHighVol(hole, doji()), "a non-finite prior ATR must fail open");
  const noAtr = { candles, atr: Array.from({ length: 51 }, () => undefined) };
  assert(!rejectFilterDojiHighVol(noAtr, doji()), "missing ATR must fail open");
  assert(!rejectFilterDojiHighVol({ candles: [], atr: [] }, 0), "missing candle must fail open");
});

test("research doji+compressed: fires only on a doji with range/ATR ≤ 0.66", () => {
  const candles = closesSeries(Array.from({ length: 3 }, () => 1000));
  const atr = [5, 10, 5];
  const ctx = { candles, atr };
  const setBar = (high) => {
    candles[1] = candleOf(100, high, 100, 100.5, { index: 1 });
  };
  // Doji with range 6.6 over ATR 10 → exactly 0.66.
  setBar(106.6);
  assert(rejectFilterDojiCompressed(ctx, 1), "range/ATR exactly 0.66 must be rejected (inclusive)");
  // 6.7 / 10 = 0.67 — outside.
  setBar(106.7);
  assert(!rejectFilterDojiCompressed(ctx, 1), "range/ATR 0.67 must not be rejected");
  // A wide bar is not compressed.
  setBar(130);
  assert(!rejectFilterDojiCompressed(ctx, 1), "range/ATR 3.0 must not be rejected");
  // A full-bodied compressed bar is not a doji.
  setBar(106.6);
  candles[1] = candleOf(100, 106.6, 100, 105, { index: 1 });
  assert(!rejectFilterDojiCompressed(ctx, 1), "a full-bodied bar is not a doji");
  // Fail-open on the ATR side.
  for (const [label, value] of [
    ["undefined ATR", undefined],
    ["zero ATR", 0],
    ["negative ATR", -5],
    ["non-finite ATR", NaN],
  ]) {
    setBar(106.6);
    assert(
      !rejectFilterDojiCompressed({ candles, atr: [5, value, 10] }, 1),
      `${label} must fail open`,
    );
  }
  // Fail-open on the OHLC side.
  setBar(106.6);
  candles[1] = candleOf(100, undefined, 100, 100.5, { index: 1 });
  assert(!rejectFilterDojiCompressed(ctx, 1), "missing high must fail open");
  candles[1] = candleOf(100, 106.6, undefined, 100.5, { index: 1 });
  assert(!rejectFilterDojiCompressed(ctx, 1), "missing low must fail open");
  assert(!rejectFilterDojiCompressed({ candles: [], atr: [] }, 0), "missing candle must fail open");
});

/* ================================================================== *
 * 3. Dormancy — the shipped book is untouched
 * ================================================================== */

test("research candidates: dormant by default — the shipped book is byte-identical", () => {
  const { csv, off } = engineRuns();
  assertEqual(off.tradePasses.length, GOLDEN.trades, "shipped trade count");
  const rSum = off.tradePasses.reduce((s, t) => s + (t.rMultiple ?? 0), 0);
  assert(Math.abs(rSum - GOLDEN.rSum) < 1e-9, `shipped R drift: ${rSum} (expected ${GOLDEN.rSum})`);

  // No candidate rejection may appear anywhere in the shipped book.
  const candidateRows = off.results.filter((r) =>
    /^FILTER_(D|H1214|DOJI_HIGHVOL|DOJI_COMPRESSED)/.test(r.reason),
  );
  assertEqual(candidateRows.length, 0, "no research rejection in the shipped book");

  // Explicitly passing all four flags as false must be indistinguishable from
  // not passing them at all — the full canonical row stream, order included.
  const sig = (r) => `${r.result}|${r.reason}|${r.entry ?? ""}|${r.sl ?? ""}|${r.tp ?? ""}`;
  const explicitOff = runAnalysis(csv, {
    ...ANALYZER_CERTIFIED_OPTIONS,
    enableFilterD: false,
    enableFilterH1214: false,
    enableFilterDojiHighVol: false,
    enableFilterDojiCompressed: false,
  });
  assert(explicitOff.ok, "explicit opt-out run must parse");
  const hash = (analysis) =>
    createHash("sha256").update(analysis.results.map(sig).join("\n"), "utf8").digest("hex");
  assertEqual(
    hash(explicitOff.analysis),
    hash(off),
    "the four flags default to false — passing false explicitly changes nothing",
  );

  // The live path too: the newest-bar decision is unaffected by the freeze.
  const live = runAnalysis(csv, ANALYZER_LIVE_OPTIONS);
  assert(live.ok, "live run must parse");
  assertEqual(
    live.analysis.results.filter((r) =>
      /^FILTER_(D|H1214|DOJI_HIGHVOL|DOJI_COMPRESSED)/.test(r.reason),
    ).length,
    0,
    "no research rejection on the live path",
  );
});

test("research candidates: the shipped configurations never set a candidate flag", () => {
  const flags = [
    "enableFilterD",
    "enableFilterH1214",
    "enableFilterDojiHighVol",
    "enableFilterDojiCompressed",
  ];
  for (const [name, cfg] of [
    ["live", ANALYZER_LIVE_OPTIONS],
    ["certified", ANALYZER_CERTIFIED_OPTIONS],
  ]) {
    for (const flag of flags) {
      assert(!(flag in cfg), `${name} configuration must not set ${flag}`);
    }
  }
});

/* ================================================================== *
 * 4. Engine-level soundness, completeness, ordering, fingerprints
 * ================================================================== */

for (const candidate of CANDIDATES) {
  test(`research ${candidate.id}: baseline run rejects exactly the rule-satisfying candidates`, () => {
    const e = engineRuns();
    const analysis = e.on[candidate.id];
    const rule = RULES[candidate.id];

    // Soundness: never reject a candidate that does not satisfy the rule.
    const rejected = analysis.results.filter((r) => candidate.reasonRe.test(r.reason));
    assertEqual(rejected.length, candidate.rejects, `${candidate.label} rejection count`);
    for (const row of rejected) {
      assert(
        rule(row, e),
        `spurious ${candidate.label} rejection at ${row.datetime} (${row.strategyId})`,
      );
      assertEqual(row.reason, candidate.reason, "rejection reason string is frozen");
      assert(row.side !== undefined, "a rejected candidate always carries a side");
      assert(row.rr !== undefined, "a rejected candidate passed spread/RR validation");
      assert(isTradeStrategy(row.strategyId), "only trade strategies reach the gate chain");
    }

    // Ordering: a candidate only sees setups that already passed C and F.
    for (const row of rejected) {
      assert(
        !rejectFilterC(e.ctx, row.index, row.trend, row.side),
        `${candidate.label} must not reject what Filter C already rejects (${row.datetime})`,
      );
      assert(
        !rejectFilterF(e.ctx, row.index, row.trend, row.side),
        `${candidate.label} must not reject what Filter F already rejects (${row.datetime})`,
      );
    }

    // Completeness: every rule-satisfying candidate of the C+F book (the rows
    // that can reach the gate chain at all) is rejected by this candidate. That
    // population is exactly the removed trades — the ON book rejects more rows
    // than this, because a rejection frees a slot and a later bar's signal is
    // then generated (and possibly rejected too).
    const onByKey = new Map(analysis.results.map((r) => [keyOf(r), r]));
    let eligible = 0;
    for (const row of e.off.results) {
      if (row.result !== "PASS" || row.rr === undefined) continue;
      if (!rule(row, e)) continue;
      eligible++;
      const filtered = onByKey.get(keyOf(row));
      assert(filtered, `candidate ${keyOf(row)} disappeared from the ${candidate.label} run`);
      assertEqual(
        filtered.result,
        "FAIL",
        `rule-satisfying candidate ${keyOf(row)} was not rejected`,
      );
      assert(
        candidate.reasonRe.test(filtered.reason),
        `candidate ${keyOf(row)} must be rejected by ${candidate.label}, got: ${filtered.reason}`,
      );
    }
    assertEqual(eligible, candidate.removed, "eligible candidates in the unfiltered book");
  });

  test(`research ${candidate.id}: discovery fingerprints are frozen (ΔR, removals, refills)`, () => {
    const e = engineRuns();
    const analysis = e.on[candidate.id];
    const rSum = (a) => a.tradePasses.reduce((s, t) => s + (t.rMultiple ?? 0), 0);
    const baseR = rSum(e.off);

    assertEqual(analysis.tradePasses.length, candidate.trades, `${candidate.label} trade count`);
    assert(
      Math.abs(rSum(analysis) - candidate.rSum) < 1e-9,
      `${candidate.label} R drift: ${rSum(analysis)}`,
    );
    assert(
      Math.abs(rSum(analysis) - baseR - candidate.deltaR) < 1e-9,
      `${candidate.label} engine ΔR drift: ${rSum(analysis) - baseR}`,
    );

    // Removed = trades the C+F book takes that the candidate rejects; their own
    // R is the drop-model view, which the engine then improves on via refills.
    const rejectedKeys = new Set(
      analysis.results.filter((r) => candidate.reasonRe.test(r.reason)).map(keyOf),
    );
    const removed = e.off.tradePasses.filter((r) => rejectedKeys.has(keyOf(r)));
    assertEqual(removed.length, candidate.removed, `${candidate.label} removed trades`);
    const removedR = removed.reduce((s, t) => s + (t.rMultiple ?? 0), 0);
    assert(
      Math.abs(removedR - candidate.removedR) < 1e-9,
      `${candidate.label} removed-book R drift: ${removedR}`,
    );

    // Refills: the engine must take trades the C+F book does not, because the
    // rejection freed a slot. This is why only engine-level ΔR counts.
    const offKeys = new Set(e.off.tradePasses.map(keyOf));
    const refills = analysis.tradePasses.filter((r) => !offKeys.has(keyOf(r)));
    assert(
      refills.length > 0,
      `${candidate.label} must refill freed slots — an engine with no refills means the ` +
        `rejection consumed the de-dupe slot (design rule 3)`,
    );
    assert(
      candidate.deltaR > candidate.removedR,
      `${candidate.label}: refills must more than pay for the removed trades on the discovery book`,
    );
  });

  test(`research ${candidate.id}: the decision is computed from the signal bar alone`, () => {
    const e = engineRuns();
    const analysis = e.on[candidate.id];
    const first = analysis.results
      .filter((r) => candidate.reasonRe.test(r.reason))
      .reduce((m, r) => (m === null || r.index < m.index ? r : m), null);
    assert(first, `the locked baseline must contain at least one ${candidate.label} rejection`);

    // Row index equals the candle index on this file (no dividers, no invalid rows).
    const lines = e.csv.split("\n");
    const truncated = lines.slice(0, 2 + first.index + 1).join("\n");
    const rerun = runAnalysis(truncated, {
      seriesEndsComplete: true,
      [candidate.option]: true,
    });
    assert(rerun.ok, "truncated series must parse");

    const sameRow = rerun.analysis.results.find((r) => keyOf(r) === keyOf(first));
    assert(sameRow, "the rejected candidate must still be generated at the truncated end");
    assertEqual(sameRow.result, "FAIL", "rejection must be reproduced without any later bar");
    assertEqual(sameRow.reason, first.reason, "rejection reason must be identical");
    for (const row of rerun.analysis.results) {
      assert(
        row.index <= first.index,
        `truncated run produced a row beyond the cut (${row.index} > ${first.index})`,
      );
    }
  });

  test(`research ${candidate.id}: a rejection does not consume the de-dupe slot`, () => {
    const e = engineRuns();
    const analysis = e.on[candidate.id];
    const rejections = analysis.results.filter((r) => candidate.reasonRe.test(r.reason));

    // A trade can only exist because an earlier same-day/same-side candidate for
    // the same strategy was rejected without consuming the slot: the rejection
    // left the key free, so the later bar's signal survived the de-dupe check.
    // (pdh-retest is excluded — its key is the PREVIOUS session day, so key
    // identity cannot be derived from the signal row's own date.)
    let released = 0;
    const perStrategy = new Map();
    for (const trade of analysis.tradePasses) {
      if (trade.strategyId === "pdh-retest") continue;
      const day = trade.datetime.slice(0, 10);
      const blocker = rejections.find(
        (row) =>
          row.strategyId === trade.strategyId &&
          row.side === trade.side &&
          row.datetime.slice(0, 10) === day &&
          row.datetime < trade.datetime,
      );
      if (!blocker) continue;
      released += 1;
      perStrategy.set(trade.strategyId, (perStrategy.get(trade.strategyId) ?? 0) + 1);
    }
    assert(
      released > 0,
      `no trade depends on a slot released by ${candidate.label} — the rejection is ` +
        `consuming the de-dupe slot, which design rule 3 forbids`,
    );
    assertEqual(released, candidate.slotReleased, `${candidate.label} slot-released trades`);
    assertEqual(
      perStrategy.size,
      candidate.slotStrategies,
      `${candidate.label} slot-releasing strategies`,
    );
  });
}

/* ================================================================== *
 * 5. The entry-price choice is not boundary-sensitive on the locked series
 * ================================================================== */

test("research D: the raw-entry and spread-adjusted-entry readings agree on the baseline", () => {
  const e = engineRuns();
  // Filter D reads the strategy's raw signal entry; the row carries the
  // spread-adjusted one (math.ts). The frozen definition permits either, and on
  // the locked series no trade sits close enough to pos = 0.26 for the spread to
  // change the verdict — this test fails the moment one does, which would make
  // the choice a real decision rather than a detail.
  let checked = 0;
  let nearBoundary = 0;
  for (const row of e.off.tradePasses) {
    if (row.entry === undefined || row.side === undefined) continue;
    const raw = rawEntryOf(row, e.spread);
    const withRaw = rejectFilterD(e.ctx, row.index, row.trend, row.side, raw);
    const withAdjusted = rejectFilterD(e.ctx, row.index, row.trend, row.side, row.entry);
    assertEqual(
      withRaw,
      withAdjusted,
      `raw vs spread-adjusted entry disagree at ${row.datetime} (${row.strategyId})`,
    );
    const pos = priorDayPos(e.ctx, row.index, raw);
    if (pos !== null && pos > 0.2 && pos < 0.35) nearBoundary++;
    checked++;
  }
  assert(checked > 0, "the baseline must contain trades to check");
  assert(
    nearBoundary > 0,
    "the baseline should contain trades near pos 0.26 for this check to mean anything",
  );
});
