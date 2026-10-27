/**
 * G0 AMENDMENT 4 (2026-10-27, before any strategy result) — SIGNAL-ONLY LIBRARY.
 *
 * The 24 entry-signal functions for the 24 DRAFT claim cards, implemented as
 * PURE CAUSAL functions with the EXACT parameters written on the cards
 * (scripts/map-compass/signal-params.mjs).
 *
 * WHAT THEY EMIT: entry bars and sides ONLY. No stops, targets, partials,
 * trailing, breakeven, trades, P&L, R, expectancy, verdicts or exits. There is
 * deliberately NO exit logic here — the exit harness lives in lib/trade.mjs and
 * is applied only when a claim is actually tested (which Amendment 4 does NOT
 * do).
 *
 * WHAT THEY IMPORT: nothing outcome-related. This module imports only
 *   - ../signal-params.mjs   (pure parameter data)
 *   - ../frozen.mjs          (pure constants: VERDICT_STATE_OF, MAP)
 *   - ./dst.mjs              (pure clock: parseNaive, sessionOfEat)
 * It does NOT import trade.mjs, cost.mjs, placebo.mjs, claim-ledger.mjs,
 * verification.mjs, compass.mjs, power-check.mjs or any artifact JSON. A test
 * pins both the import surface and the emitted field set.
 *
 * CAUSALITY: every indicator at bar i uses bars with index <= i only. The
 * map.mjs/VerifyDst precedent is followed: the module is deterministic and
 * `emitSignals(mutateFuture(bars))` returns identical signals for all indices
 * <= the truncation point (pinned by a no-lookahead test).
 */
import { VERDICT_STATE_OF, MAP } from "../frozen.mjs";
import { parseNaive, sessionOfEat } from "./dst.mjs";
import { SIGNAL_PARAMS } from "../signal-params.mjs";

/** Forbidden import targets — outcome-related or report-generating. */
export const FORBIDDEN_IMPORTS = Object.freeze([
  "trade.mjs",
  "cost.mjs",
  "placebo.mjs",
  "claim-ledger.mjs",
  "verification.mjs",
  "compass.mjs",
  "amend",
  "power-check",
  "random-baseline",
  "readability",
  "seal-audit",
  "map-compass/power-projection.json",
  "map-compass/random-baseline.json",
  "claim-verification.json",
  "claimed-trades.jsonl",
]);

/** Fields every emitted signal must have, and must NOT have. */
export const SIGNAL_FIELDS = Object.freeze([
  "index",
  "side",
  "cardId",
  "params",
  "datetime",
  "session",
  "verdictState",
  "fourState",
  "causal",
]);
export const FORBIDDEN_SIGNAL_FIELDS = Object.freeze([
  "netR",
  "grossR",
  "costR",
  "totalR",
  "expectancy",
  "verdict",
  "outcome",
  "exit",
  "stop",
  "target",
  "r",
  "rMultiple",
  "pnl",
  "profit",
  "loss",
]);

const M = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

/**
 * Memo caches for the O(n) indicator series. Each card recomputes a series it
 * needs, and several cards need the same ATR(14) series — caching keeps the
 * whole 24-card run linear instead of quadratic.
 */
const SERIES_CACHE = new Map();
function cached(key, fn) {
  if (!SERIES_CACHE.has(key)) SERIES_CACHE.set(key, fn());
  return SERIES_CACHE.get(key);
}
/** Causal ATR(p) with caching (p is MAP.atrPeriod = 14 for the signals). */
function atrOf(bars, p) {
  return cached(`atr|${p}|${bars.length}`, () => atrSeries(bars, p));
}

/** Rolling maximum / minimum of an array over `lb` bars ending at i. */
function roll(bars, i, lb, pick) {
  const lo = Math.max(0, i - lb + 1);
  let v = -Infinity;
  for (let j = lo; j <= i; j++) {
    const x = pick(bars[j]);
    if (x > v) v = x;
  }
  return v;
}
function rollMin(bars, i, lb, pick) {
  const lo = Math.max(0, i - lb + 1);
  let v = Infinity;
  for (let j = lo; j <= i; j++) {
    const x = pick(bars[j]);
    if (x < v) v = x;
  }
  return v;
}
function smaOf(bars, i, p, pick = (b) => b.c) {
  const lo = Math.max(0, i - p + 1);
  return M(bars.slice(lo, i + 1).map(pick));
}
/** Exponentially weighted mean of an array, seeded with the SMA of the first `p`. */
function emaSeries(bars, p, pick = (b) => b.c) {
  const n = bars.length;
  const out = new Array(n).fill(NaN);
  const alpha = 2 / (p + 1);
  let seeded = false;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += pick(bars[i]);
    if (i >= p - 1) {
      if (!seeded) {
        out[i] = acc / p;
        seeded = true;
      } else out[i] = alpha * pick(bars[i]) + (1 - alpha) * out[i - 1];
      acc = 0; // restart the seed accumulator once seeded
    } else if (i === p - 2) {
      acc = 0;
    }
  }
  return out;
}
/** Simple causal ATR(p) over true ranges, matching lib/map.mjs. */
function atrSeries(bars, p) {
  const n = bars.length;
  const tr = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    tr[i] = i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c));
  }
  const out = new Array(n).fill(NaN);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += tr[i];
    if (i >= p) sum -= tr[i - p];
    if (i >= p - 1) out[i] = sum / p;
  }
  return out;
}
function rsiSeries(bars, p) {
  const n = bars.length;
  const out = new Array(n).fill(NaN);
  let avgGain = 0, avgLoss = 0, seeded = false;
  for (let i = 1; i < n; i++) {
    const ch = bars[i].c - bars[i - 1].c;
    const gain = Math.max(ch, 0);
    const loss = Math.max(-ch, 0);
    if (!seeded) {
      avgGain += gain;
      avgLoss += loss;
      if (i >= p) {
        avgGain /= p;
        avgLoss /= p;
        seeded = true;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        out[i] = 100 - 100 / (1 + rs);
      }
    } else {
      avgGain = (avgGain * (p - 1) + gain) / p;
      avgLoss = (avgLoss * (p - 1) + loss) / p;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      out[i] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}
function williamsRSeries(bars, p) {
  const n = bars.length;
  const out = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (i < p - 1) continue;
    const hi = roll(bars, i, p, (b) => b.h);
    const lo = rollMin(bars, i, p, (b) => b.l);
    if (hi - lo <= 0) continue;
    out[i] = ((hi - bars[i].c) / (hi - lo)) * 100 - 100;
  }
  return out;
}
function stochSeries(bars, p, kSmooth, dSmooth) {
  const n = bars.length;
  const raw = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (i < p - 1) continue;
    const hi = roll(bars, i, p, (b) => b.h);
    const lo = rollMin(bars, i, p, (b) => b.l);
    if (hi - lo <= 0) continue;
    raw[i] = ((bars[i].c - lo) / (hi - lo)) * 100;
  }
  const k = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) if (Number.isFinite(raw[i])) k[i] = smaOfRaw(raw, i, kSmooth);
  const d = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) if (Number.isFinite(k[i])) d[i] = smaOfRaw(k, i, dSmooth);
  return { k, d };
}
function smaOfRaw(arr, i, p) {
  const lo = Math.max(0, i - p + 1);
  let n = 0, s = 0;
  for (let j = lo; j <= i; j++) {
    if (Number.isFinite(arr[j])) {
      s += arr[j];
      n++;
    }
  }
  return n ? s / n : NaN;
}
function bandsSeries(bars, period, numerStd) {
  const n = bars.length;
  const mid = new Array(n).fill(NaN);
  const up = new Array(n).fill(NaN);
  const low = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (i < period - 1) continue;
    const w = bars.slice(i - period + 1, i + 1);
    mid[i] = M(w.map((b) => b.c));
    const sd = Math.sqrt(M(w.map((b) => (b.c - mid[i]) ** 2)));
    up[i] = mid[i] + numerStd * sd;
    low[i] = mid[i] - numerStd * sd;
  }
  return { mid, up, low };
}
function keltnerSeries(bars, period, atrPeriod, atrMultiple) {
  const n = bars.length;
  const mid = emaSeries(bars, period);
  const atr = atrSeries(bars, atrPeriod);
  const up = new Array(n).fill(NaN);
  const low = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(mid[i]) || !Number.isFinite(atr[i])) continue;
    up[i] = mid[i] + atrMultiple * atr[i];
    low[i] = mid[i] - atrMultiple * atr[i];
  }
  return { mid, up, low, atr };
}
function atrPctileSeries(bars, atrPeriod, lookback) {
  const n = bars.length;
  const atr = atrSeries(bars, atrPeriod);
  const out = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(atr[i])) continue;
    const lo = Math.max(0, i - lookback + 1);
    const vals = [];
    for (let j = lo; j <= i; j++) if (Number.isFinite(atr[j])) vals.push(atr[j]);
    if (vals.length < lookback) continue;
    let c = 0;
    for (const v of vals) if (v <= atr[i]) c++;
    out[i] = (c / vals.length) * 100;
  }
  return out;
}

/**
 * High / low / open of the PRIOR CALENDAR TRADING DAY, strictly before bar i.
 *
 * Causality note: a calendar date repeats across the series (one day per
 * ~48 M30 bars, years apart). Aggregating a whole date with a Map would include
 * bars that occur LATER in the array, which is lookahead. So each bar scans
 * BACKWARDS over the contiguous run of bars belonging to the previous trading
 * day, using only indices < i.
 */
function priorDayStats(bars, dateArr) {
  const n = bars.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const d = dateArr[i];
    if (!d) {
      out[i] = null;
      continue;
    }
    // find the previous trading day's date: walk back to the first bar whose
    // date differs from d, then continue while the date is that one.
    let j = i - 1;
    while (j >= 0 && dateArr[j] === d) j--;
    if (j < 0) {
      out[i] = null;
      continue;
    }
    const prevDate = dateArr[j];
    let hi = -Infinity,
      lo = Infinity,
      op = NaN,
      k = j;
    while (k >= 0 && dateArr[k] === prevDate) {
      if (bars[k].h > hi) hi = bars[k].h;
      if (bars[k].l < lo) lo = bars[k].l;
      if (!Number.isFinite(op)) op = bars[k].o;
      k--;
    }
    out[i] = { hi, lo, open: op, bars: k + 1 };
  }
  return out;
}

/**
 * Emit the entry signals for ONE card.
 *
 * @param bars   [{ datetime, o, h, l, c, v }]  — M30 bars in EAT order
 * @param cardId one of the 24 frozen ids
 * @param opts   { states?: four-state labels aligned to bars,
 *                 start?: first index, end?: last index (exclusive),
 *                 include?: "all" | "strength" | "weakness" }
 * @returns      [{ index, side, cardId, params, datetime, session,
 *                 verdictState, fourState, causal }]
 */
export function emitSignals(bars, cardId, opts = {}) {
  const p = SIGNAL_PARAMS[cardId];
  if (!p) throw new Error(`no signal parameters for card ${cardId}`);
  const n = bars.length;
  const lo = opts.start ?? 0;
  const hi = opts.end ?? n;
  const sessionArr = new Array(n);
  const dayArr = new Array(n);
  const out = [];

  for (let i = 0; i < n; i++) {
    sessionArr[i] = sessionOfEat(bars[i].datetime);
    dayArr[i] = String(bars[i].datetime).slice(0, 10);
  }

  const pd = priorDayStats(bars, dayArr);

  const push = (i, side) => {
    const four = opts.states?.[i];
    out.push({
      index: i,
      side,
      cardId,
      params: p,
      datetime: bars[i].datetime,
      session: sessionArr[i],
      verdictState: four ? VERDICT_STATE_OF[four] ?? null : null,
      fourState: four ?? null,
      causal: true,
    });
  };

  const only = opts.include ?? "all";

  const ev = SIGNAL_EVALUATORS[cardId];
  if (!ev) throw new Error(`no evaluator for card ${cardId}`);
  ev(bars, p, {
    lo,
    hi,
    sessionArr,
    dayArr,
    priorDay: pd,
    push,
    include: only,
  });

  return out;
}

/** Each evaluator: pure, index-causal, emits via `push(i, side)`. */
const SIGNAL_EVALUATORS = Object.freeze({
  // --- F1 channel breakout -------------------------------------------------
  "donchian-20": channelBreakout,
  "donchian-55": channelBreakout,
  "dual-thrust": (bars, p, { lo, hi, priorDay, push }) => {
    for (let i = Math.max(lo, 2); i < hi; i++) {
      const prev = priorDay[i];
      if (!prev || !Number.isFinite(prev.hi) || !Number.isFinite(prev.lo)) continue;
      const range = Math.abs(prev.hi - prev.open) + Math.abs(prev.open - prev.lo);
      const band = p.k * range;
      if (bars[i].h > prev.hi + band) push(i, "long");
      else if (bars[i].l < prev.lo - band) push(i, "short");
    }
  },
  // --- F2 moving averages -------------------------------------------------
  "sma-20-50": crossoverSma,
  "macd-cross": (bars, p, { lo, hi, push }) => {
    const fast = emaSeries(bars, p.fast);
    const slow = emaSeries(bars, p.slow);
    const macd = bars.map((_, i) =>
      Number.isFinite(fast[i]) && Number.isFinite(slow[i]) ? fast[i] - slow[i] : NaN,
    );
    // The signal line is the EMA of the MACD series, seeded at the first
    // finite MACD value; NaN propagates until then.
    const sig = new Array(bars.length).fill(NaN);
    let seeded = false;
    let acc = 0;
    for (let i = 0; i < bars.length; i++) {
      if (!Number.isFinite(macd[i])) {
        seeded = false;
        acc = 0;
        continue;
      }
      if (!seeded) {
        acc += macd[i];
        if (i >= p.signal - 1) {
          sig[i] = acc / p.signal;
          seeded = true;
        }
      } else {
        sig[i] = (2 / (p.signal + 1)) * macd[i] + (1 - 2 / (p.signal + 1)) * sig[i - 1];
      }
    }
    for (let i = Math.max(lo, p.signal + 1); i < hi; i++) {
      if (!Number.isFinite(macd[i]) || !Number.isFinite(sig[i])) continue;
      if (!Number.isFinite(macd[i - 1]) || !Number.isFinite(sig[i - 1])) continue;
      if (macd[i - 1] <= sig[i - 1] && macd[i] > sig[i]) push(i, "long");
      else if (macd[i - 1] >= sig[i - 1] && macd[i] < sig[i]) push(i, "short");
    }
  },
  "ichimoku-tk": (bars, p, { lo, hi, push }) => {
    const tenkan = new Array(bars.length).fill(NaN);
    const kijun = new Array(bars.length).fill(NaN);
    for (let i = 0; i < bars.length; i++) {
      if (i >= p.tenkan - 1) tenkan[i] = (roll(bars, i, p.tenkan, (b) => b.h) + rollMin(bars, i, p.tenkan, (b) => b.l)) / 2;
      if (i >= p.kijun - 1) kijun[i] = (roll(bars, i, p.kijun, (b) => b.h) + rollMin(bars, i, p.kijun, (b) => b.l)) / 2;
    }
    for (let i = Math.max(lo, p.kijun); i < hi; i++) {
      if (!Number.isFinite(tenkan[i]) || !Number.isFinite(kijun[i])) continue;
      if (!Number.isFinite(tenkan[i - 1]) || !Number.isFinite(kijun[i - 1])) continue;
      if (tenkan[i - 1] <= kijun[i - 1] && tenkan[i] > kijun[i]) push(i, "long");
      else if (tenkan[i - 1] >= kijun[i - 1] && tenkan[i] < kijun[i]) push(i, "short");
    }
  },
  // --- F3 opening range / session range ----------------------------------
  "asian-range-break": sessionRangeBreak,
  "london-orb-30": (bars, p, { lo, hi, sessionArr, dayArr, push }) => {
    const byDay = new Map();
    for (let i = 0; i < bars.length; i++) {
      if (sessionArr[i] !== p.entrySession) continue;
      if (!byDay.has(dayArr[i])) byDay.set(dayArr[i], []);
      byDay.get(dayArr[i]).push(i);
    }
    for (let i = Math.max(lo, p.rangeBars); i < hi; i++) {
      if (sessionArr[i] !== p.entrySession) continue;
      const arr = byDay.get(dayArr[i]);
      if (!arr) continue;
      // CAUSAL: only bars strictly before i, and only from THIS occurrence of
      // the date (a calendar date repeats across the series).
      const before = arr.filter((j) => j < i);
      if (before.length < p.rangeBars) continue;
      const prev = before.slice(0, p.rangeBars);
      const hiR = Math.max(...prev.map((j) => bars[j].h));
      const loR = Math.min(...prev.map((j) => bars[j].l));
      if (bars[i].h > hiR) push(i, "long");
      else if (bars[i].l < loR) push(i, "short");
    }
  },
  "pdh-pdl-break": (bars, p, { lo, hi, priorDay, push }) => {
    for (let i = Math.max(lo, 2); i < hi; i++) {
      const prev = priorDay[i];
      if (!prev || !Number.isFinite(prev.hi) || !Number.isFinite(prev.lo)) continue;
      if (bars[i].h > prev.hi) push(i, "long");
      else if (bars[i].l < prev.lo) push(i, "short");
    }
  },
  // --- F4 level retest / pivots ------------------------------------------
  "pdh-retest": (bars, p, { lo, hi, priorDay, push }) => {
    const atr = atrOf(bars, MAP.atrPeriod);
    for (let i = Math.max(lo, 2); i < hi; i++) {
      const prev = priorDay[i];
      if (!prev || !Number.isFinite(prev.hi)) continue;
      const atrI = atr[i];
      if (!Number.isFinite(atrI) || atrI <= 0) continue;
      const lvl = prev.hi;
      const band = p.touchRel * atrI;
      const low = bars[i].l;
      // long: price dipped to the prior-day high and closed back above it
      if (low <= lvl + band && low >= lvl - band && bars[i].c > bars[i].o) push(i, "long");
    }
  },
  "pdl-retest": (bars, p, { lo, hi, priorDay, push }) => {
    const atr = atrOf(bars, MAP.atrPeriod);
    for (let i = Math.max(lo, 2); i < hi; i++) {
      const prev = priorDay[i];
      if (!prev || !Number.isFinite(prev.lo)) continue;
      const atrI = atr[i];
      if (!Number.isFinite(atrI) || atrI <= 0) continue;
      const lvl = prev.lo;
      const band = p.touchRel * atrI;
      const high = bars[i].h;
      if (high >= lvl - band && high <= lvl + band && bars[i].c < bars[i].o) push(i, "short");
    }
  },
  "classic-pivot": (bars, p, { lo, hi, priorDay, push }) => {
    const atr = atrOf(bars, MAP.atrPeriod);
    for (let i = Math.max(lo, 2); i < hi; i++) {
      const prev = priorDay[i];
      if (!prev || !Number.isFinite(prev.hi) || !Number.isFinite(prev.lo) || !Number.isFinite(prev.open))
        continue;
      const atrI = atr[i];
      if (!Number.isFinite(atrI) || atrI <= 0) continue;
      const pp = (prev.hi + prev.lo + prev.open) / 3;
      const s1 = 2 * pp - prev.hi;
      const r1 = 2 * pp - prev.lo;
      const band = p.touchRel * atrI;
      // long: bounce off S1 (low near S1, close above S1)
      if (bars[i].l <= s1 + band && bars[i].l >= s1 - band && bars[i].c > s1) push(i, "long");
      else if (bars[i].h >= r1 - band && bars[i].h <= r1 + band && bars[i].c < r1) push(i, "short");
    }
  },
  // --- F5 oscillator fade ------------------------------------------------
  "rsi-14-30-70": (bars, p, { lo, hi, push }) => {
    const rsi = rsiSeries(bars, p.period);
    for (let i = Math.max(lo, p.period + 1); i < hi; i++) {
      if (!Number.isFinite(rsi[i]) || !Number.isFinite(rsi[i - 1])) continue;
      if (rsi[i - 1] <= p.oversold && rsi[i] > p.oversold) push(i, "long");
      else if (rsi[i - 1] >= p.overbought && rsi[i] < p.overbought) push(i, "short");
    }
  },
  "williams-r-fade": (bars, p, { lo, hi, push }) => {
    const wr = williamsRSeries(bars, p.period);
    for (let i = Math.max(lo, p.period + 1); i < hi; i++) {
      if (!Number.isFinite(wr[i]) || !Number.isFinite(wr[i - 1])) continue;
      if (wr[i - 1] <= p.oversold && wr[i] > p.oversold) push(i, "long");
      else if (wr[i - 1] >= p.overbought && wr[i] < p.overbought) push(i, "short");
    }
  },
  "stochastic-14-fade": (bars, p, { lo, hi, push }) => {
    const { k, d } = stochSeries(bars, p.period, p.kSmooth, p.dSmooth);
    for (let i = Math.max(lo, p.period + p.dSmooth + 1); i < hi; i++) {
      if (!Number.isFinite(k[i]) || !Number.isFinite(d[i]) || !Number.isFinite(k[i - 1])) continue;
      if (k[i - 1] <= p.low && k[i] > p.low) push(i, "long");
      else if (k[i - 1] >= p.high && k[i] < p.high) push(i, "short");
    }
  },
  // --- F6 band reversion -------------------------------------------------
  "bollinger-20-2": bandFade,
  "keltner-20-atr": (bars, p, { lo, hi, push }) => {
    const { mid, up, low } = keltnerSeries(bars, p.period, p.atrPeriod, p.atrMultiple);
    for (let i = Math.max(lo, p.period + p.atrPeriod + 1); i < hi; i++) {
      if (!Number.isFinite(up[i]) || !Number.isFinite(low[i])) continue;
      if (bars[i].c < low[i] && bars[i - 1].c >= low[i - 1]) push(i, "long");
      else if (bars[i].c > up[i] && bars[i - 1].c <= up[i - 1]) push(i, "short");
    }
  },
  "bb-squeeze-fade": (bars, p, { lo, hi, push }) => {
    const { mid, up, low } = bandsSeries(bars, p.period, p.numerStd);
    const bw = new Array(bars.length).fill(NaN);
    for (let i = 0; i < bars.length; i++)
      bw[i] = Number.isFinite(up[i]) && Number.isFinite(low[i]) && mid[i] > 0 ? (up[i] - low[i]) / mid[i] : NaN;
    const lookback = Math.max(p.period * 5, 50);
    for (let i = Math.max(lo, lookback + p.period + 1); i < hi; i++) {
      if (!Number.isFinite(bw[i]) || !Number.isFinite(up[i]) || !Number.isFinite(low[i])) continue;
      const vals = [];
      for (let j = i - lookback; j <= i - 1; j++) if (Number.isFinite(bw[j])) vals.push(bw[j]);
      if (!vals.length) continue;
      const typical = M(vals);
      if (!Number.isFinite(typical) || typical <= 0) continue;
      if (bw[i] < p.squeezeFactor * typical) continue; // still squeezed
      // squeeze releases: fade the first move out of the band
      if (bars[i].c > up[i] && bars[i - 1].c <= up[i - 1]) push(i, "short");
      else if (bars[i].c < low[i] && bars[i - 1].c >= low[i - 1]) push(i, "long");
    }
  },
  // --- F7 candlestick reversal -------------------------------------------
  "engulfing": (bars, p, { lo, hi, push }) => {
    for (let i = Math.max(lo, 2); i < hi; i++) {
      const b0 = bars[i - 1], b1 = bars[i];
      const r0 = b0.h - b0.l;
      const r1 = b1.h - b1.l;
      if (r0 <= 0 || r1 <= 0) continue;
      const body0 = Math.abs(b0.c - b0.o);
      const body1 = Math.abs(b1.c - b1.o);
      if (body0 < p.bodyRatio * r0 || body1 < p.bodyRatio * r1) continue;
      // bullish engulfing: prev bearish, current bullish, current engulfs prev
      if (b0.c < b0.o && b1.c > b1.o && b1.o <= b0.c && b1.c >= b0.o) push(i, "long");
      else if (b0.c > b0.o && b1.c < b1.o && b1.o >= b0.c && b1.c <= b0.o) push(i, "short");
    }
  },
  "morning-evening-star": (bars, p, { lo, hi, push }) => {
    for (let i = Math.max(lo, 3); i < hi; i++) {
      const b0 = bars[i - 2], b1 = bars[i - 1], b2 = bars[i];
      const r = (b) => b.h - b.l;
      const body = (b) => Math.abs(b.c - b.o);
      if (r(b0) <= 0 || r(b1) <= 0 || r(b2) <= 0) continue;
      if (body(b0) < p.bodyRatio * r(b0) || body(b2) < p.bodyRatio * r(b2)) continue;
      const mid0 = (b0.h + b0.l) / 2;
      // morning star: big bearish bar, small body gapping down, bullish close
      if (b0.c < b0.o && b1.l < b0.c && b2.c > b1.o && b2.c > mid0) push(i, "long");
      else if (b0.c > b0.o && b1.h > b0.c && b2.c < b1.o && b2.c < mid0) push(i, "short");
    }
  },
  "three-soldiers-crows": (bars, p, { lo, hi, push }) => {
    const r = (b) => b.h - b.l;
    const body = (b) => Math.abs(b.c - b.o);
    for (let i = Math.max(lo, 4); i < hi; i++) {
      const b0 = bars[i - 2], b1 = bars[i - 1], b2 = bars[i];
      if (r(b0) <= 0 || r(b1) <= 0 || r(b2) <= 0) continue;
      if (body(b0) < p.bodyRatio * r(b0) || body(b1) < p.bodyRatio * r(b1) || body(b2) < p.bodyRatio * r(b2))
        continue;
      // Three white soldiers (bullish): three consecutive bullish bars with
      // rising closes — the textbook fade is SHORT.
      if (b0.c > b0.o && b1.c > b1.o && b2.c > b2.o && b0.c < b1.c && b1.c < b2.c) push(i, "short");
      // Three black crows (bearish): three consecutive bearish bars with
      // falling closes — the textbook fade is LONG.
      else if (
        b0.c < b0.o && b1.c < b1.o && b2.c < b2.o &&
        b0.c > b1.c && b1.c > b2.c
      )
        push(i, "long");
    }
  },
  // --- F8 volatility compression ----------------------------------------
  "atr-squeeze-break": (bars, p, { lo, hi, push }) => {
    const atr = atrSeries(bars, p.atrPeriod);
    for (let i = Math.max(lo, p.lookback + p.atrPeriod); i < hi; i++) {
      if (!Number.isFinite(atr[i]) || atr[i] <= 0) continue;
      const vals = [];
      for (let j = i - p.lookback; j <= i - 1; j++) if (Number.isFinite(atr[j])) vals.push(atr[j]);
      if (!vals.length) continue;
      vals.sort((a, b) => a - b);
      const med = vals[Math.floor(vals.length / 2)];
      if (!Number.isFinite(med) || med <= 0) continue;
      if (atr[i] > p.squeezeFactor * med) continue; // NOT in squeeze
      // in squeeze: break beyond the trailing range by breakRel * ATR.
      // The range must EXCLUDE bar i (roll over bars[i-lb .. i-1]).
      const hh = roll(bars, i - 1, p.lookback, (b) => b.h);
      const ll = rollMin(bars, i - 1, p.lookback, (b) => b.l);
      if (bars[i].h > hh + p.breakRel * atr[i]) push(i, "long");
      else if (bars[i].l < ll - p.breakRel * atr[i]) push(i, "short");
    }
  },
  "nr7-break": (bars, p, { lo, hi, push }) => {
    const atr = atrOf(bars, MAP.atrPeriod);
    // Trigger: bar i-1 is the narrowest-range bar of the last 7.
    // Confirm: bar i breaks beyond that bar's own range.
    for (let i = Math.max(lo, p.lookback + 1); i < hi; i++) {
      const t = bars[i - 1];
      let narrowest = true;
      for (let k = i - p.lookback; k < i - 1; k++) {
        if (bars[k].h - bars[k].l < t.h - t.l) {
          narrowest = false;
          break;
        }
      }
      if (!narrowest) continue;
      const atrI = atr[i];
      if (!Number.isFinite(atrI) || atrI <= 0) continue;
      if (bars[i].h > t.h + p.breakRel * atrI) push(i, "long");
      else if (bars[i].l < t.l - p.breakRel * atrI) push(i, "short");
    }
  },
  "inside-bar-break": (bars, p, { lo, hi, push }) => {
    // Trigger: bar i-1 is an inside bar (contained within bar i-2).
    // Confirm: bar i breaks beyond the inside bar's own range.
    for (let i = Math.max(lo, p.lookback + 2); i < hi; i++) {
      const a = bars[i - p.lookback - 1], ib = bars[i - 1];
      if (ib.h <= a.h && ib.l >= a.l) {
        if (bars[i].h > ib.h) push(i, "long");
        else if (bars[i].l < ib.l) push(i, "short");
      }
    }
  },
});

/** Generic channel breakout: high break → long, low break → short. */
function channelBreakout(bars, p, { lo, hi, push }) {
  for (let i = Math.max(lo, p.lookback); i < hi; i++) {
    const hh = roll(bars, i - 1, p.lookback, (b) => b.h);
    const ll = rollMin(bars, i - 1, p.lookback, (b) => b.l);
    if (bars[i].h > hh) push(i, "long");
    else if (bars[i].l < ll) push(i, "short");
  }
}

/** SMA fast/slow crossover. */
function crossoverSma(bars, p, { lo, hi, push }) {
  const fast = new Array(bars.length).fill(NaN);
  const slow = new Array(bars.length).fill(NaN);
  for (let i = 0; i < bars.length; i++) {
    if (i >= p.fast - 1) fast[i] = smaOf(bars, i, p.fast);
    if (i >= p.slow - 1) slow[i] = smaOf(bars, i, p.slow);
  }
  for (let i = Math.max(lo, p.slow + 1); i < hi; i++) {
    if (!Number.isFinite(fast[i]) || !Number.isFinite(slow[i])) continue;
    if (!Number.isFinite(fast[i - 1]) || !Number.isFinite(slow[i - 1])) continue;
    if (fast[i - 1] <= slow[i - 1] && fast[i] > slow[i]) push(i, "long");
    else if (fast[i - 1] >= slow[i - 1] && fast[i] < slow[i]) push(i, "short");
  }
}

/** Generic band fade: close crosses below lower → long, above upper → short. */
function bandFade(bars, p, { lo, hi, push }) {
  const { mid, up, low } = bandsSeries(bars, p.period, p.numerStd);
  for (let i = Math.max(lo, p.period + 1); i < hi; i++) {
    if (!Number.isFinite(up[i]) || !Number.isFinite(low[i])) continue;
    if (bars[i].c < low[i] && bars[i - 1].c >= low[i - 1]) push(i, "long");
    else if (bars[i].c > up[i] && bars[i - 1].c <= up[i - 1]) push(i, "short");
  }
}

/** Session-range breakout: range built in one session, entry in another. */
function sessionRangeBreak(bars, p, { lo, hi, sessionArr, dayArr, push }) {
  const byDay = new Map();
  for (let i = 0; i < bars.length; i++) {
    if (sessionArr[i] !== p.rangeSession) continue;
    if (!byDay.has(dayArr[i])) byDay.set(dayArr[i], []);
    byDay.get(dayArr[i]).push(i);
  }
  const rangeBars = p.rangeBars ?? 20;
  for (let i = Math.max(lo, rangeBars); i < hi; i++) {
    if (sessionArr[i] !== p.entrySession) continue;
    const arr = byDay.get(dayArr[i]);
    if (!arr) continue;
    // CAUSAL: only bars strictly before i, from THIS occurrence of the date.
    const before = arr.filter((j) => j < i);
    if (before.length < rangeBars) continue;
    const prev = before.slice(0, rangeBars);
    const hiR = Math.max(...prev.map((j) => bars[j].h));
    const loR = Math.min(...prev.map((j) => bars[j].l));
    if (bars[i].h > hiR) push(i, "long");
    else if (bars[i].l < loR) push(i, "short");
  }
}

/** All 24 ids, in the frozen TEST_ORDER sequence. */
export function signalCardIds() {
  return Object.keys(SIGNAL_EVALUATORS);
}

/** Structural self-check — run by tests. */
export function signalLibrarySelfCheck() {
  const errors = [];
  const ids = signalCardIds();
  if (ids.length !== 24) errors.push(`expected 24 signal evaluators, got ${ids.length}`);
  for (const id of ids) {
    if (!SIGNAL_PARAMS[id]) errors.push(`${id}: no parameters`);
    if (!SIGNAL_EVALUATORS[id]) errors.push(`${id}: no evaluator`);
  }
  if (Object.keys(SIGNAL_PARAMS).length !== 24)
    errors.push(`parameter registry has ${Object.keys(SIGNAL_PARAMS).length} entries`);
  return errors;
}
