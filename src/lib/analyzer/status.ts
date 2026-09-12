import type { Candle, ResultRow, SetupStatus } from "./types";
import { crabelOrbEffectiveStop } from "@/lib/strategies/crabel-orb";

/** Candles a limit order may wait for a fill before it is considered stale. */
export const PENDING_EXPIRY_CANDLES = 20;

export interface StatusEvaluation {
  setupStatus: SetupStatus;
  candlesSinceTrigger: number;
  statusNote: string;
  /** Candle where the entry actually filled (market: the trigger bar, filled at its close). Undefined until filled. */
  fillCandle?: Candle | undefined;
  resolutionCandle?: Candle | undefined;
  resolutionPrice?: number | undefined;
  resolutionLevel?: "TP" | "SL" | undefined;
}

function touched(candle: Candle, level: number): boolean {
  return (
    candle.low !== undefined &&
    candle.high !== undefined &&
    candle.low <= level &&
    candle.high >= level
  );
}

/**
 * Parse a candle timestamp to epoch ms. Source timestamps are EAT (+03:00)
 * when no explicit offset is supplied — regardless of whether the date/time
 * separator is a space or a `T`. Mirrors `structure.ts#parseDatetimeMs`.
 */
function parseTime(value: string): number | undefined {
  const normalized = value.trim().replace(" ", "T");
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const ms = Date.parse(hasOffset ? normalized : `${normalized}+03:00`);
  return Number.isFinite(ms) ? ms : undefined;
}

/** Count valid candles strictly after `fromIndex` — same cardinality as the old filter. */
function countForwardValid(candles: Candle[], fromIndex: number): number {
  let n = 0;
  for (let i = fromIndex + 1; i < candles.length; i++) {
    if (!candles[i]!.invalid) n++;
  }
  return n;
}

/**
 * Precomputed calendar-day extremes for Donchian status.
 * Semantics match the former priorCompletedDays grouping:
 * - invalid candles excluded
 * - day key = datetime.slice(0, 10)
 * - ordered lexicographically (yyyy-MM-dd)
 * - high/low are max high / min low among that day's valid candles
 */
export interface DayExtremesIndex {
  orderedDays: string[];
  extremes: Map<string, { high: number; low: number }>;
  /** rank of day in orderedDays; absent if day never appears as a valid candle day */
  dayRank: Map<string, number>;
}

const dayIndexCache = new WeakMap<Candle[], DayExtremesIndex>();

export function buildDayExtremesIndex(candles: Candle[]): DayExtremesIndex {
  const extremes = new Map<string, { high: number; low: number }>();
  for (const candle of candles) {
    if (candle.invalid) continue;
    const key = candle.datetime.slice(0, 10);
    const hi = candle.high ?? -Infinity;
    const lo = candle.low ?? Infinity;
    const existing = extremes.get(key);
    if (!existing) {
      extremes.set(key, { high: hi, low: lo });
    } else {
      if (hi > existing.high) existing.high = hi;
      if (lo < existing.low) existing.low = lo;
    }
  }
  const orderedDays = [...extremes.keys()].sort((a, b) => a.localeCompare(b));
  const dayRank = new Map<string, number>();
  for (let i = 0; i < orderedDays.length; i++) dayRank.set(orderedDays[i]!, i);
  return { orderedDays, extremes, dayRank };
}

function getDayExtremesIndex(candles: Candle[]): DayExtremesIndex {
  let index = dayIndexCache.get(candles);
  if (!index) {
    index = buildDayExtremesIndex(candles);
    dayIndexCache.set(candles, index);
  }
  return index;
}

/**
 * Last `n` completed calendar days strictly before `day` (key < day), oldest→newest.
 * Equivalent to priorCompletedDays(...).slice mapped to day extremes.
 */
function priorDayExtremes(
  index: DayExtremesIndex,
  day: string,
  n: number,
): { high: number; low: number }[] {
  // First index in orderedDays whose key >= day; completed days are [0, end).
  let lo = 0;
  let hi = index.orderedDays.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (index.orderedDays[mid]! < day) lo = mid + 1;
    else hi = mid;
  }
  const end = lo;
  const start = Math.max(0, end - n);
  const out: { high: number; low: number }[] = [];
  for (let i = start; i < end; i++) {
    out.push(index.extremes.get(index.orderedDays[i]!)!);
  }
  return out;
}

function evaluateCrabelOrbStatus(row: ResultRow, candles: Candle[]): StatusEvaluation {
  const candlesSinceTrigger = countForwardValid(candles, row.index);
  if (row.entry === undefined || row.sl === undefined || row.side === undefined) {
    return {
      setupStatus: "PENDING",
      candlesSinceTrigger,
      statusNote: "no ORB price levels to track",
    };
  }

  const triggerCandle =
    row.index >= 0 && row.index < candles.length && !candles[row.index]!.invalid
      ? candles[row.index]
      : undefined;

  // ORB is a stop-entry order. A trigger candle that already trades through
  // the entry is the fill; otherwise the first later candle that touches the
  // entry fills it. The breakeven clock starts at this fill, not at setup time.
  let fillCandle: Candle | undefined;
  const fillStart = triggerCandle ? row.index : row.index + 1;
  for (let i = fillStart; i < candles.length; i++) {
    const candle = candles[i]!;
    if (candle.invalid) continue;
    if (i === row.index && !triggerCandle) continue;
    if (row.orderType === "market" || touched(candle, row.entry)) {
      fillCandle = candle;
      break;
    }
  }

  if (!fillCandle) {
    return {
      setupStatus: "PENDING",
      candlesSinceTrigger,
      statusNote:
        "Crabel ORB stop order has not filled yet; one-hour breakeven clock has not started.",
    };
  }

  const fillTime = parseTime(fillCandle.datetime);
  let breakevenActive = false;
  let last: Candle | undefined;

  for (let i = fillCandle.index; i < candles.length; i++) {
    const candle = candles[i]!;
    if (candle.invalid) continue;
    last = candle;
    const t = parseTime(candle.datetime);
    const elapsedMinutes =
      fillTime !== undefined && t !== undefined ? (t - fillTime) / 60000 : Infinity;
    const effectiveStop = crabelOrbEffectiveStop(row.entry, row.sl, elapsedMinutes);
    breakevenActive = effectiveStop === row.entry;

    if (touched(candle, effectiveStop)) {
      // A stop-entry candle that also touches the initial protective stop is
      // intrabar ambiguous with OHLC data; do not manufacture a fill/exit.
      if (
        candle.index === fillCandle.index &&
        effectiveStop !== row.entry &&
        touched(candle, row.entry)
      ) {
        return {
          setupStatus: "FILLED",
          candlesSinceTrigger,
          statusNote: `Crabel ORB entry filled at ${fillCandle.datetime}; initial protective stop also traded in the same candle, so intrabar order is ambiguous.`,
          fillCandle,
        };
      }
      return {
        setupStatus: "RESOLVED",
        candlesSinceTrigger,
        statusNote: `Crabel ORB ${breakevenActive ? "breakeven" : "initial protective"} stop hit at ${candle.datetime} at ${effectiveStop}`,
        fillCandle,
        resolutionCandle: candle,
        resolutionPrice: effectiveStop,
        resolutionLevel: "SL",
      };
    }
  }

  return {
    setupStatus: "FILLED",
    candlesSinceTrigger,
    statusNote: `Crabel ORB entry filled at ${fillCandle.datetime}; protective stop ${breakevenActive ? "moved to breakeven" : "still initial"}${last ? ` by ${last.datetime}` : ""}.`,
    fillCandle,
  };
}

function evaluateDonchianStatus(row: ResultRow, candles: Candle[]): StatusEvaluation {
  const candlesSinceTrigger = countForwardValid(candles, row.index);
  if (row.entry === undefined || row.side === undefined) {
    return {
      setupStatus: "PENDING",
      candlesSinceTrigger,
      statusNote: "no Donchian entry to track",
    };
  }

  const dayIndex = getDayExtremesIndex(candles);

  for (let i = row.index + 1; i < candles.length; i++) {
    const candle = candles[i]!;
    if (candle.invalid) continue;
    const day = candle.datetime.slice(0, 10);
    const ds = priorDayExtremes(dayIndex, day, 5);
    if (ds.length < 5) continue;
    const exit =
      row.side === "long" ? Math.min(...ds.map((d) => d.low)) : Math.max(...ds.map((d) => d.high));
    if (row.side === "long" && candle.low !== undefined && candle.low <= exit) {
      return {
        setupStatus: "RESOLVED",
        candlesSinceTrigger,
        statusNote: `Donchian 5-day trailing exit hit at ${candle.datetime} at ${exit}`,
        resolutionCandle: candle,
        resolutionPrice: exit,
        resolutionLevel: "TP",
      };
    }
    if (row.side === "short" && candle.high !== undefined && candle.high >= exit) {
      return {
        setupStatus: "RESOLVED",
        candlesSinceTrigger,
        statusNote: `Donchian 5-day trailing exit hit at ${candle.datetime} at ${exit}`,
        resolutionCandle: candle,
        resolutionPrice: exit,
        resolutionLevel: "TP",
      };
    }
  }
  return {
    setupStatus: "FILLED",
    candlesSinceTrigger,
    statusNote: "Donchian entry filled; 5-day opposite-channel exit remains dynamic",
  };
}

/**
 * Forward-check a PASS setup against every candle after its trigger, up to the
 * last row in the file (treated as "now"). Only PENDING and FILLED are live.
 *
 * Implementation walks by index (no per-call filter/find allocations) while
 * preserving fill order, same-candle policy, and expiry rules.
 */
export function evaluateSetupStatus(
  row: ResultRow,
  candles: Candle[],
  expiryCandles = PENDING_EXPIRY_CANDLES,
): StatusEvaluation {
  if (row.strategyId === "opening-range-breakout") return evaluateCrabelOrbStatus(row, candles);
  if (row.strategyId === "donchian") return evaluateDonchianStatus(row, candles);

  const candlesSinceTrigger = countForwardValid(candles, row.index);

  if (row.entry === undefined || row.sl === undefined || row.tp === undefined) {
    return { setupStatus: "PENDING", candlesSinceTrigger, statusNote: "no price levels to track" };
  }

  const triggerCandle =
    row.index >= 0 && row.index < candles.length && !candles[row.index]!.invalid
      ? candles[row.index]
      : undefined;

  // Market: fill at signal-bar close (trigger included). Limit/stop: fill only on later touch.
  const startIndex = row.orderType === "market" && triggerCandle ? row.index : row.index + 1;

  let filled = false;
  let fillCandle: Candle | undefined;
  let barsWaiting = 0;

  for (let i = startIndex; i < candles.length; i++) {
    const candle = candles[i]!;
    if (candle.invalid) continue;

    if (!filled) {
      const isMarketImmediate = row.orderType === "market" && candle.index === row.index;
      if (isMarketImmediate || touched(candle, row.entry)) {
        filled = true;
        fillCandle = candle;
        // Market fill-at-close: do not resolve TP/SL on the fill bar; start on the next candle.
        if (isMarketImmediate) {
          continue;
        }
        // For generic stop/limit orders, OHLC cannot prove whether the entry
        // traded before a protective level on the same candle. Do not invent a
        // profit or loss from an unknowable intrabar sequence.
        const touchesTp = touched(candle, row.tp);
        const touchesSl = touched(candle, row.sl);
        if (touchesTp || touchesSl) {
          return {
            setupStatus: "FILLED",
            candlesSinceTrigger,
            statusNote: `entry filled at ${candle.datetime}; same-candle entry and protective/target level touch is intrabar ambiguous, so outcome is unresolved.`,
            fillCandle,
          };
        }
        continue;
      }
      if (candle.index > row.index) {
        barsWaiting++;
        const brokeStop =
          row.side === "short"
            ? (candle.high ?? -Infinity) >= row.sl
            : (candle.low ?? Infinity) <= row.sl;
        if (brokeStop) {
          return {
            setupStatus: "EXPIRED",
            candlesSinceTrigger,
            statusNote: `invalidated at ${candle.datetime} (SL broken before fill)`,
          };
        }
        if (barsWaiting > expiryCandles) {
          return {
            setupStatus: "EXPIRED",
            candlesSinceTrigger,
            statusNote: `no fill within ${expiryCandles} candles`,
          };
        }
      }
      continue;
    }

    // Deterministic OHLC ambiguity policy (SAME_CANDLE_TP_SL_RULE in pipeline/policy.ts):
    // when both TP and SL are touched on this post-fill candle, TP is checked first.
    // This is not a claim about true tick order; changing it requires golden re-baseline.
    if (touched(candle, row.tp)) {
      return {
        setupStatus: "RESOLVED",
        candlesSinceTrigger,
        statusNote: `TP hit at ${candle.datetime} at ${row.tp}`,
        fillCandle,
        resolutionCandle: candle,
        resolutionPrice: row.tp,
        resolutionLevel: "TP",
      };
    }
    if (touched(candle, row.sl)) {
      return {
        setupStatus: "RESOLVED",
        candlesSinceTrigger,
        statusNote: `SL hit at ${candle.datetime} at ${row.sl}`,
        fillCandle,
        resolutionCandle: candle,
        resolutionPrice: row.sl,
        resolutionLevel: "SL",
      };
    }
  }

  if (filled) {
    return {
      setupStatus: "FILLED",
      candlesSinceTrigger,
      statusNote: "entry filled, trade still open",
      fillCandle,
    };
  }
  return {
    setupStatus: "PENDING",
    candlesSinceTrigger,
    statusNote: `waiting for fill (${barsWaiting} candles)`,
  };
}

export const LIVE_STATUSES: SetupStatus[] = ["PENDING", "FILLED"];

export function isLive(status: SetupStatus | undefined): boolean {
  return status === "PENDING" || status === "FILLED";
}
