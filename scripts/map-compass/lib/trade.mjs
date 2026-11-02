/**
 * M3/M5 — standardised trade resolver and net-R accounting.
 *
 * Fixes the four chassis defects WITHOUT touching the frozen old rule sources:
 *  D1/D2  cost is charged via cost.mjs (real spread + slippage, in R units),
 *         not a static one-sided $0.20.
 *  D3     there is NO RR gate here. Every signal is evaluated with the same
 *         stop = 1.5*ATR(14) and target = 2R. The old run.ts rr<=2 rejection
 *         would filter every standardised trade.
 *  D4     intrabar ambiguity is resolved with the M15 audit layer where both
 *         sub-bars exist; otherwise the CONSERVATIVE rule (stop first) is used
 *         and the trade is flagged so M9 can count it.
 *
 * Book-level: one position per slot, frozen numeric priority (decision #10).
 * Signals that arrive while a slot is occupied are DROPPED, never queued —
 * the old project showed a +16.0R offline estimate became -3.63R in the engine
 * precisely because freed slots refilled.
 */
import { EXIT_HARNESS } from "../frozen.mjs";
import { netR } from "./cost.mjs";
import { sessionOfEat } from "./dst.mjs";

/**
 * Resolve ONE trade from a signal bar.
 * @param bars      normalised M30 bars [{datetime,o,h,l,c,v}]
 * @param i         signal bar index (entry at its close; market order)
 * @param side      "long" | "short"
 * @param atr       causal ATR(14) at bar i
 * @param options   { m15ByM30: Map<index, [sub1, sub2]>, session, vol, variant, maxBars }
 * @returns { outcome, grossR, netR, exitIndex, exitPrice, barsHeld, ambiguousFallback, costR }
 */
export function resolveTrade(bars, i, side, atr, options = {}) {
  // G0 Amendment 2 (2026-10-27, pre-results): the 96-bar TIME_EXIT cap now
  // lives in the FROZEN EXIT_HARNESS and is the DEFAULT for EVERY trade — real
  // claim evaluation as well as the random-entry control. Callers may still
  // override explicitly, but no trade is left OPEN / booked 0R by default.
  const {
    m15ByM30 = null,
    variant = "baseline",
    maxBars = EXIT_HARNESS.maxHoldBars,
  } = options;
  if (!(atr > 0)) return { outcome: "INVALID_ATR", grossR: 0, netR: 0, exitIndex: i, barsHeld: 0 };
  const entry = bars[i].c;
  const risk = EXIT_HARNESS.stopAtrMultiple * atr;
  const stop = side === "long" ? entry - risk : entry + risk;
  const target =
    side === "long" ? entry + EXIT_HARNESS.targetR * risk : entry - EXIT_HARNESS.targetR * risk;

  let ambiguousFallback = false;
  let result = null;
  // A bounded hold (EXIT_HARNESS.maxHoldBars = 96) makes claim and random-entry
  // resolutions identical and prevents an unbounded forward scan. Trades that
  // reach the cap are closed at market as TIME_EXIT — never booked 0R / OPEN.
  const lastBar = maxBars ? Math.min(bars.length, i + 1 + maxBars) : bars.length;

  for (let j = i + 1; j < lastBar; j++) {
    const b = bars[j];
    // Gap-through: the bar opened beyond a level, so the real fill is the open
    // (v1.8.2 gap-fill rule). Check BOTH, then take the worse outcome first.
    const gapStop = side === "long" ? b.o <= stop : b.o >= stop;
    const gapTarget = side === "long" ? b.o >= target : b.o <= target;
    if (gapStop) {
      result = { outcome: "SL", price: b.o, j };
      break;
    }
    if (gapTarget) {
      result = { outcome: "TP", price: b.o, j };
      break;
    }

    const hitStop = side === "long" ? b.l <= stop : b.h >= stop;
    const hitTarget = side === "long" ? b.h >= target : b.l <= target;

    if (hitStop && hitTarget) {
      // D4: both levels inside one M30 bar. Use M15 ordering if available.
      const subs = m15ByM30?.get(j);
      if (subs && subs.length === 2) {
        const first = whichFirst(subs, side, stop, target);
        if (first === "SL") {
          result = { outcome: "SL", price: stop, j };
          break;
        }
        if (first === "TP") {
          result = { outcome: "TP", price: target, j };
          break;
        }
      }
      // Conservative fallback: assume the stop was hit first.
      ambiguousFallback = true;
      result = { outcome: "SL", price: stop, j };
      break;
    }
    if (hitStop) {
      result = { outcome: "SL", price: stop, j };
      break;
    }
    if (hitTarget) {
      result = { outcome: "TP", price: target, j };
      break;
    }
  }

  if (!result) {
    // At the hold cap, close at market (the cap bar's close), not at a
    // fictional zero. Otherwise long-held trades silently vanish from the
    // baseline and understate its mean. Cost is charged on the round trip.
    const exitBar = maxBars ? lastBar - 1 : bars.length - 1;
    const exitPrice = bars[exitBar].c;
    const signed = side === "long" ? exitPrice - entry : entry - exitPrice;
    const grossR = signed / risk;
    const costArgs = {
      session: options.session ?? sessionOfEat(bars[i].datetime),
      vol: options.vol ?? "mid",
      variant,
    };
    const cost = -netR(0, costArgs);
    return {
      outcome: "TIME_EXIT",
      grossR: +grossR.toFixed(6),
      costR: +cost.toFixed(6),
      netR: +netR(grossR, costArgs).toFixed(6),
      exitIndex: exitBar,
      exitPrice,
      barsHeld: exitBar - i,
      ambiguousFallback,
      entry,
      stop,
      target,
    };
  }

  const signed = side === "long" ? result.price - entry : entry - result.price;
  const grossR = signed / risk;
  const costArgs = {
    session: options.session ?? sessionOfEat(bars[i].datetime),
    vol: options.vol ?? "mid",
    variant,
  };
  const cost = netR(0, costArgs) * -1; // recover the cost component
  return {
    outcome: result.outcome,
    exitIndex: result.j,
    exitPrice: result.price,
    barsHeld: result.j - i,
    grossR: +grossR.toFixed(6),
    costR: +cost.toFixed(6),
    netR: +netR(grossR, costArgs).toFixed(6),
    ambiguousFallback,
    entry,
    stop,
    target,
  };
}

/** Order of the two levels within two M15 sub-bars. */
function whichFirst(subs, side, stop, target) {
  for (const s of subs) {
    const hitStop = side === "long" ? s.l <= stop : s.h >= stop;
    const hitTarget = side === "long" ? s.h >= target : s.l <= target;
    if (hitStop && hitTarget) return "AMBIGUOUS"; // same 15m bar -> stop (conservative)
    if (hitStop) return "SL";
    if (hitTarget) return "TP";
  }
  return "NONE";
}

/**
 * Book-level evaluation: one slot, frozen numeric priority. Signals are
 * [{index, side, strategyId, priority, atr, session, vol}]. Sorted by index,
 * then priority. A signal is dropped if the slot is occupied at its index.
 * Never sums standalone results.
 */
export function evaluateBook(bars, signals, options = {}) {
  const sorted = [...signals].sort((a, b) => a.index - b.index || a.priority - b.priority);
  const trades = [];
  let occupiedUntil = -1;
  const rejected = { slot: 0, invalid: 0 };
  for (const s of sorted) {
    if (s.index <= occupiedUntil) {
      rejected.slot++;
      continue;
    }
    const t = resolveTrade(bars, s.index, s.side, s.atr, {
      ...options,
      session: s.session,
      vol: s.vol,
    });
    if (t.outcome === "INVALID_ATR") {
      rejected.invalid++;
      continue;
    }
    trades.push({
      ...t,
      index: s.index,
      side: s.side,
      strategyId: s.strategyId,
      priority: s.priority,
    });
    if (t.outcome !== "OPEN") occupiedUntil = t.exitIndex;
    else occupiedUntil = bars.length - 1;
  }
  const totalNetR = trades.reduce((a, t) => a + t.netR, 0);
  return { trades, rejected, totalNetR: +totalNetR.toFixed(6), n: trades.length };
}
