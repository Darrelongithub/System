/**
 * M2 — Map v0: hand-defined, causal, 4-state regime classifier.
 *
 * HARD RULE (G2): thresholds come from frozen.mjs. Nothing here is fitted to
 * P&L. Features are trailing-only or clock-derived; no future bar contributes.
 *
 * Features (all scale-free where price levels are involved — gold moves from
 * $381 to $5,597 across this dataset, so raw-dollar ATR is forbidden):
 *   er20        Kaufman efficiency ratio, trailing 20 bars
 *   atr14       simple mean of true range over trailing 14 bars (matches the
 *               generator's documented ATR method)
 *   atrPct      atr14 / close * 100
 *   atrPctile   percentile rank of atrPct within the trailing 500 bars
 *   rangePos    close position inside the trailing 50-bar high/low channel
 *   bodyPct     |close-open| / (high-low)
 *   gapPct      (open - prior close) / prior close
 *   session     asian / london / ny from the EAT wall clock
 *   dayOfWeek   0=Sunday .. 6=Saturday, from the EAT date
 *
 * States: EXPANSION / GRIND / WHIPSAW / QUIET, plus UNKNOWN (flat).
 * Abstain band: within +/-10% of either threshold -> UNKNOWN immediately.
 * Hysteresis: a state change needs 3 consecutive raw bars of the new state;
 * the previous confirmed state is emitted during the transition. That lag is
 * RECORDED (barsSinceStateChange) so M9 can stratify expectancy by it.
 */
import { MAP } from "../frozen.mjs";
import { sessionOfEat, parseNaive } from "./dst.mjs";

/** Simple rolling mean of true range over `period` bars. */
export function trueRanges(bars) {
  const tr = new Float64Array(bars.length);
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    tr[i] =
      i === 0
        ? b.h - b.l
        : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c));
  }
  return tr;
}

function insertSorted(arr, v) {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  arr.splice(lo, 0, v);
}
function removeSorted(arr, v) {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  arr.splice(lo, 1);
}
/** Number of window values <= v (percentile numerator). */
function countLE(arr, v) {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Compute causal features. `bars` = [{datetime, o, h, l, c, v}].
 * Returns one object per bar; `warmup` marks bars without enough history.
 */
export function computeFeatures(bars, cfg = MAP) {
  const n = bars.length;
  const tr = trueRanges(bars);
  const out = new Array(n);
  const need = Math.max(
    cfg.warmupBars,
    cfg.atrPctileLookback,
    cfg.erLookback,
    cfg.rangeLookback,
    cfg.atrPeriod,
  );

  // Rolling ATR (simple mean, causal).
  let trSum = 0;
  const atr = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    trSum += tr[i];
    if (i >= cfg.atrPeriod) trSum -= tr[i - cfg.atrPeriod];
    if (i >= cfg.atrPeriod - 1) atr[i] = trSum / cfg.atrPeriod;
  }

  // Rolling sum of |dClose| for the efficiency ratio.
  let absSum = 0;
  const er = new Float64Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    absSum += Math.abs(bars[i].c - bars[i - 1].c);
    if (i > cfg.erLookback)
      absSum -= Math.abs(bars[i - cfg.erLookback].c - bars[i - cfg.erLookback - 1].c);
    if (i >= cfg.erLookback && absSum > 0) {
      er[i] = Math.abs(bars[i].c - bars[i - cfg.erLookback].c) / absSum;
    }
  }

  const atrPct = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++)
    if (Number.isFinite(atr[i]) && bars[i].c > 0) atrPct[i] = (atr[i] / bars[i].c) * 100;

  // Trailing ATR-percentile via a sorted sliding window (O(n log W)).
  const atrPctile = new Float64Array(n).fill(NaN);
  const window = [];
  const windowVals = [];
  for (let i = 0; i < n; i++) {
    const v = atrPct[i];
    if (Number.isFinite(v)) {
      insertSorted(window, v);
      windowVals.push(i);
    }
    while (windowVals.length && windowVals[0] < i - cfg.atrPctileLookback + 1) {
      const old = windowVals.shift();
      const oldV = atrPct[old];
      if (Number.isFinite(oldV)) removeSorted(window, oldV);
    }
    if (Number.isFinite(v) && window.length >= cfg.atrPctileLookback) {
      atrPctile[i] = (countLE(window, v) / window.length) * 100;
    }
  }

  // Trailing 50-bar channel position (O(n*W), W=50 — cheap).
  const rangePos = new Float64Array(n).fill(NaN);
  for (let i = cfg.rangeLookback - 1; i < n; i++) {
    let hi = -Infinity,
      lo = Infinity;
    for (let j = i - cfg.rangeLookback + 1; j <= i; j++) {
      if (bars[j].h > hi) hi = bars[j].h;
      if (bars[j].l < lo) lo = bars[j].l;
    }
    if (hi > lo) rangePos[i] = (bars[i].c - lo) / (hi - lo);
  }

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const naive = parseNaive(b.datetime);
    const d = new Date(naive);
    const span = b.h - b.l;
    out[i] = {
      datetime: b.datetime,
      index: i,
      warmup: i < need || !Number.isFinite(er[i]) || !Number.isFinite(atrPctile[i]),
      er: er[i],
      atr: atr[i],
      atrPct: atrPct[i],
      atrPctile: atrPctile[i],
      rangePos: rangePos[i],
      bodyPct: span > 0 ? Math.abs(b.c - b.o) / span : 0,
      gapPct: i > 0 && bars[i - 1].c > 0 ? (b.o - bars[i - 1].c) / bars[i - 1].c : 0,
      session: sessionOfEat(b.datetime),
      dayOfWeek: d.getUTCDay(),
      close: b.c,
    };
  }
  return out;
}

/** Raw (pre-hysteresis) 2x2 state, or UNKNOWN inside the abstain band. */
export function rawStateOf(f, cfg = MAP) {
  if (f.warmup || !Number.isFinite(f.er) || !Number.isFinite(f.atrPctile)) return "UNKNOWN";
  const erBand = (cfg.erCutoff * cfg.abstainBandPct) / 100;
  const pcBand = (cfg.atrPctileCutoff * cfg.abstainBandPct) / 100;
  if (Math.abs(f.er - cfg.erCutoff) <= erBand) return "UNKNOWN";
  if (Math.abs(f.atrPctile - cfg.atrPctileCutoff) <= pcBand) return "UNKNOWN";
  const trending = f.er >= cfg.erCutoff;
  const expanded = f.atrPctile >= cfg.atrPctileCutoff;
  if (trending) return expanded ? "EXPANSION" : "GRIND";
  return expanded ? "WHIPSAW" : "QUIET";
}

/**
 * Apply abstain + hysteresis. Emits the previous confirmed state during a
 * pending transition (conservative, no flicker), and UNKNOWN on abstain bars.
 * `barsSinceStateChange` counts from the bar where the state was confirmed.
 */
export function classify(features, cfg = MAP) {
  const out = new Array(features.length);
  let confirmed = "UNKNOWN";
  let changeBar = 0;
  let pending = null;
  let pendingCount = 0;
  let rawRun = 0;
  let lastRaw = null;

  for (let i = 0; i < features.length; i++) {
    const raw = rawStateOf(features[i], cfg);
    rawRun = raw === lastRaw ? rawRun + 1 : 1;
    lastRaw = raw;

    if (raw === "UNKNOWN") {
      pending = null;
      pendingCount = 0;
      // confirmed state is retained (trailing context), but this bar is flat.
      out[i] = {
        state: "UNKNOWN",
        rawState: raw,
        reason: "abstain_or_warmup",
        barsSinceStateChange: i - changeBar,
        rawRun,
      };
      continue;
    }
    if (raw === confirmed) {
      pending = null;
      pendingCount = 0;
      out[i] = {
        state: confirmed,
        rawState: raw,
        reason: "confirmed",
        barsSinceStateChange: i - changeBar,
        rawRun,
      };
      continue;
    }
    if (pending === raw) pendingCount++;
    else {
      pending = raw;
      pendingCount = 1;
    }

    if (pendingCount >= cfg.hysteresisBars) {
      confirmed = raw;
      changeBar = i;
      pending = null;
      pendingCount = 0;
      out[i] = {
        state: confirmed,
        rawState: raw,
        reason: "confirmed",
        barsSinceStateChange: 0,
        rawRun,
      };
    } else {
      out[i] = {
        state: confirmed,
        rawState: raw,
        reason: "pending_transition",
        barsSinceStateChange: i - changeBar,
        rawRun,
      };
    }
  }
  return out;
}

export function buildMap(bars, cfg = MAP) {
  const features = computeFeatures(bars, cfg);
  return { features, states: classify(features, cfg) };
}
