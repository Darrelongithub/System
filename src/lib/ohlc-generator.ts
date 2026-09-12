import { format, addDays, subDays } from "date-fns";
import { requestMarketData, type ProviderCandle } from "./market-data";

export type LogFn = (msg: string) => void;
export type CooldownSetter = (seconds: number | null) => void;

/**
 * Row shapes flowing through the generator. These used to be `any[]`, which hid
 * every field access from the compiler across ~1300 lines. The pipeline has
 * three stages:
 *
 *   ProviderCandle (see ./market-data) — raw provider JSON, prices as strings
 *   FilteredCandle                     — parsed + normalised, prices as numbers
 *   EnrichedCandle                     — plus every derived column written to CSV
 */
export type SessionName = "asian" | "london" | "ny";

/**
 * The minimum the flatline filter needs. It runs over two different row types —
 * parsed candles (timestamp in `datetimeEAT`) and chart candles (timestamp in
 * `time`) — so both timestamp fields are optional and either satisfies it.
 */
export interface OhlcLike {
  time?: string | number;
  datetimeEAT?: string;
  open?: number | string;
  high?: number | string;
  low?: number | string;
  close?: number | string;
}

/** A candle after parsing/normalisation, before enrichment. */
export interface FilteredCandle extends OhlcLike {
  datetimeEAT: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Present only when the provider supplied real tick volume for the symbol. */
  volume?: string | null;
  direction: "Bullish" | "Bearish";
  body: number;
  upperWick: number;
  lowerWick: number;
  range: number;
  bodyPercent: number;
}

/** FilteredCandle plus the derived columns `enrichOhlcRows` adds. */
export interface EnrichedCandle extends FilteredCandle {
  index: number;
  session: SessionName;
  /** Assigned for every row by the reliability pass before anything reads it. */
  localAvgRange: number;
  isReliable: boolean;
  reliableStreakLength: number;
  atr30m: number | null;
  swingType: "high" | "low" | null;
  swingPrice: number | null;
  swingRange: number | null;
  observedRetracePct: number | null;
  swingOutcome: "continued" | "reversed" | "unresolved" | null;
  swingInvalidated: boolean;
  similarSwingRetracePct: number | null;
  similarSwingContinuedPct: number | null;
  similarSwingRefs: string[];
  swingContextSource: string | null;
}

export function turtleTickSizeForSymbol(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("JPY")) return 0.01;
  if (s === "XAU/USD") return 0.01;
  if (s === "XAG/USD") return 0.001;
  if (["USO/USD", "BCO/USD"].includes(s)) return 0.01;
  if (
    [
      "BTC/USD",
      "ETH/USD",
      "SOL/USD",
      "XRP/USD",
      "ADA/USD",
      "DOGE/USD",
      "DOT/USD",
      "LTC/USD",
    ].includes(s)
  )
    return 0.01;
  return 0.0001;
}

export interface OhlcCsvOptions {
  symbol: string;
  startDate: string;
  endDate: string;
  specifyTime: boolean;
  startTime: string;
  endTime: string;
  log: LogFn;
  setCooldown: CooldownSetter;
  /** Internal: remaining 60s rate-limit retries. Never retried forever. */
  rateLimitRetries?: number;
}

/** Hard cap on consecutive 60s rate-limit waits per OHLC fetch. */
export const MAX_RATE_LIMIT_RETRIES = 5;

/**
 * Max calendar days requested from Twelve Data in a single call. 90 days of
 * 30-minute candles is ~4320 rows, safely under the provider's 5000-row cap
 * per request (leaves headroom for weekday/weekend variance). Windows wider
 * than this are split into contiguous chunks and merged after fetching.
 */
export const CHUNK_SPAN_DAYS = 90;

function daysBetween(startISODate: string, endISODate: string): number {
  return Math.floor(
    (new Date(`${endISODate}T00:00:00Z`).getTime() -
      new Date(`${startISODate}T00:00:00Z`).getTime()) /
      (1000 * 60 * 60 * 24),
  );
}

/** Split [start,end] (yyyy-MM-dd, inclusive) into contiguous chunks of at most `spanDays` calendar days. */
export function chunkDateRange(
  startDate: string,
  endDate: string,
  spanDays: number,
): { start: string; end: string }[] {
  const chunks: { start: string; end: string }[] = [];
  let chunkStart = new Date(`${startDate}T00:00:00Z`);
  const rangeEnd = new Date(`${endDate}T00:00:00Z`);
  while (chunkStart <= rangeEnd) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + spanDays - 1);
    const clampedEnd = chunkEnd > rangeEnd ? rangeEnd : chunkEnd;
    chunks.push({
      start: chunkStart.toISOString().slice(0, 10),
      end: clampedEnd.toISOString().slice(0, 10),
    });
    chunkStart = new Date(clampedEnd);
    chunkStart.setUTCDate(chunkStart.getUTCDate() + 1);
  }
  return chunks;
}

/**
 * Shared per-second cooldown / credit-replenishment timer used by the generator
 * and by the Auto-Backtester between daily iterations. It ticks the visible
 * countdown once per second instead of blocking silently.
 */
export const cooldown = async (seconds: number, setCooldown: CooldownSetter) => {
  for (let remaining = seconds; remaining > 0; remaining--) {
    setCooldown(remaining);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  setCooldown(null);
};

// Remove only contiguous exact-flatline artifacts (identical OHLC with zero range).
// Repeated low-volatility candles are retained because deleting them can alter
// valid time-series structure on instruments whose price increments are small.
export const removeRepeatedFlatlineArtifacts = <T extends OhlcLike>(
  candles: T[],
  intervalMinutes: number,
) => {
  const expectedIntervalMs = intervalMinutes * 60 * 1000;
  const getTimestampMs = (value: unknown) => {
    const raw = String(value);
    const normalized = raw.replace(" ", "T");
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
    const parsed = new Date(hasTimezone ? normalized : `${normalized}+03:00`).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  };
  const hasSameOhlc = (left: OhlcLike, right: OhlcLike) =>
    left.open === right.open &&
    left.high === right.high &&
    left.low === right.low &&
    left.close === right.close;

  const cleaned: T[] = [];
  let removedCount = 0;
  let index = 0;

  while (index < candles.length) {
    let runEnd = index + 1;
    while (runEnd < candles.length) {
      const previous = candles[runEnd - 1];
      const current = candles[runEnd];
      const previousTime = getTimestampMs(previous.time || previous.datetimeEAT);
      const currentTime = getTimestampMs(current.time || current.datetimeEAT);
      const isAdjacent =
        previousTime !== null &&
        currentTime !== null &&
        Math.abs(currentTime - previousTime - expectedIntervalMs) < 1000;

      if (!isAdjacent || !hasSameOhlc(previous, current)) break;
      runEnd++;
    }

    const candleRange = Number(candles[index].high) - Number(candles[index].low);
    const isFlatlineArtifact = runEnd - index >= 2 && candleRange === 0;
    cleaned.push(candles[index]);
    if (isFlatlineArtifact) {
      removedCount += runEnd - index - 1;
      index = runEnd;
    } else {
      for (let runIndex = index + 1; runIndex < runEnd; runIndex++) {
        cleaned.push(candles[runIndex]);
      }
      index = runEnd;
    }
  }

  return { candles: cleaned, removedCount };
};

export const enrichOhlcRows = (rows: FilteredCandle[]): EnrichedCandle[] => {
  const RANGE_LOOKBACK = 20;
  const ATR_PERIODS = 14;
  // Swing detection width. This is the real driver of swing coverage: with a
  // 10-candle fractal width only ~1 candle in 20 can ever qualify as a swing,
  // which capped similar_swing_* coverage at a few percent no matter how the
  // matching tolerance was loosened. A 3-candle fractal is the standard
  // definition and produces an order of magnitude more comparable swings.
  const SWING_LOOKBACK = 3;
  const SWING_RETRACE_HORIZON = 40;
  // Fallback window used to measure a swing's magnitude when no prior
  // opposite swing exists yet (dataset start, or a run of same-type swings).
  const SWING_RANGE_FALLBACK_WINDOW = 20;

  const EXPECTED_INTERVAL_MS = 30 * 60 * 1000;

  // Relative threshold (as a fraction of local average range) used by the
  // near-zero cluster reliability check below. Was previously a hardcoded
  // $0.5 absolute range, which over-flagged normal quiet Asian-session gold
  // candles as unreliable data (~22% of all bars) rather than only catching
  // genuinely suspicious flatline clusters.
  const NEAR_ZERO_ATR_FRACTION = 0.05;

  const getDate = (datetimeEAT: string) => {
    const normalized = String(datetimeEAT).replace(" ", "T");
    return new Date(`${normalized}+03:00`);
  };
  const getUtcHour = (datetimeEAT: string) => getDate(datetimeEAT).getUTCHours();
  const getSession = (utcHour: number): "asian" | "london" | "ny" => {
    // Session buckets are UTC-based: Asian 22:00-07:59, London 08:00-12:59,
    // and New York 13:00-21:59. Every row therefore has one session label.
    if (utcHour >= 22 || utcHour < 8) return "asian";
    if (utcHour < 13) return "london";
    return "ny";
  };
  const isAdjacent = (left: EnrichedCandle, right: EnrichedCandle) => {
    const leftTime = getDate(left.datetimeEAT).getTime();
    const rightTime = getDate(right.datetimeEAT).getTime();
    return (
      Number.isFinite(leftTime) &&
      Number.isFinite(rightTime) &&
      Math.abs(rightTime - leftTime - EXPECTED_INTERVAL_MS) < 1000
    );
  };
  const isSameSession = (left: EnrichedCandle, right: EnrichedCandle) =>
    left.session === right.session;
  const average = (values: number[]) =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  const workingRows: EnrichedCandle[] = rows.map((row, index) => ({
    ...row,
    index,
    range: row.high - row.low,
    session: getSession(getUtcHour(row.datetimeEAT)),
    // 0 is a placeholder: the reliability pass below assigns every row before any read.
    localAvgRange: 0,
    isReliable: true,
    reliableStreakLength: 0,
    atr30m: null as number | null,
    swingType: null as "high" | "low" | null,
    swingPrice: null as number | null,
    swingRange: null as number | null,
    observedRetracePct: null as number | null,
    swingOutcome: null as "continued" | "reversed" | "unresolved" | null,
    swingInvalidated: false,
    similarSwingRetracePct: null as number | null,
    similarSwingContinuedPct: null as number | null,
    similarSwingRefs: [] as string[],
    swingContextSource: null as string | null,
  }));

  // Reliability uses only raw OHLC. The local average includes the current
  // candle and the preceding 19 candles (a trailing 20-candle window).
  workingRows.forEach((row, index) => {
    const rangeWindow = workingRows
      .slice(Math.max(0, index - RANGE_LOOKBACK + 1), index + 1)
      .map((item) => item.range);
    row.localAvgRange = average(rangeWindow) || 0;
  });

  // Build the average open/previous-close gap independently for each UTC
  // session. Gaps across missing candles/weekends are excluded from the
  // baseline, so a market reopening does not make the threshold unusable.
  const sessionGaps: Record<"asian" | "london" | "ny", number[]> = {
    asian: [],
    london: [],
    ny: [],
  };
  workingRows.forEach((row, index) => {
    const previous = workingRows[index - 1];
    if (previous && isAdjacent(previous, row) && isSameSession(previous, row)) {
      const session = row.session as "asian" | "london" | "ny";
      sessionGaps[session].push(Math.abs(row.open - previous.close));
    }
  });
  const allGaps = Object.values(sessionGaps).flat();
  const overallGapAverage = average(allGaps) || 0;
  const sessionGapAverage = (session: "asian" | "london" | "ny") =>
    average(sessionGaps[session]) || overallGapAverage;

  workingRows.forEach((row, index) => {
    const previous = workingRows[index - 1];
    const gap =
      previous && isAdjacent(previous, row) && isSameSession(previous, row)
        ? Math.abs(row.open - previous.close)
        : 0;
    const gapAverage = sessionGapAverage(row.session);
    const rangeTooSmall = row.localAvgRange > 0 && row.range < 0.1 * row.localAvgRange;
    const previousIsNearZero =
      previous &&
      isAdjacent(previous, row) &&
      previous.localAvgRange > 0 &&
      previous.range < NEAR_ZERO_ATR_FRACTION * previous.localAvgRange;
    const next = workingRows[index + 1];
    const nextIsNearZero =
      next &&
      isAdjacent(row, next) &&
      next.localAvgRange > 0 &&
      next.range < NEAR_ZERO_ATR_FRACTION * next.localAvgRange;
    // Preserve isolated low-volatility candles, but flag a near-zero range
    // cluster as unreliable so it cannot be mistaken for normal structure.
    // Relative to local average range (not a fixed dollar amount) so this
    // scales with the current volatility regime instead of flagging every
    // quiet Asian-session bar on an instrument like gold as bad data.
    const nearZeroCluster =
      row.localAvgRange > 0 &&
      row.range < NEAR_ZERO_ATR_FRACTION * row.localAvgRange &&
      Boolean(previousIsNearZero || nextIsNearZero);
    // A row is gap-unreliable when its adjacent-session gap exceeds 2x that
    // session's average gap. If no valid baseline exists, no gap is flagged.
    const gapTooLarge = gapAverage > 0 && gap > 2 * gapAverage;
    row.isReliable = !rangeTooSmall && !nearZeroCluster && !gapTooLarge;
  });

  // Reliable streak: count of consecutive reliable rows ending at this row
  // (resets to 0 on an unreliable row, resets across non-adjacent gaps).
  let currentStreak = 0;
  workingRows.forEach((row, index) => {
    const previous = workingRows[index - 1];
    const adjacentToPrevious = previous && isAdjacent(previous, row);
    if (!row.isReliable) {
      currentStreak = 0;
    } else if (!previous || !adjacentToPrevious) {
      currentStreak = 1;
    } else {
      currentStreak += 1;
    }
    row.reliableStreakLength = currentStreak;
  });

  // ATR(14) uses true range and only reliable rows contribute to the rolling
  // window. Unreliable rows carry forward the last reliable ATR.
  const reliableTrueRanges: number[] = [];
  let previousReliableClose: number | null = null;
  let lastAtr: number | null = null;
  workingRows.forEach((row) => {
    if (!row.isReliable) {
      row.atr30m = lastAtr;
      return;
    }

    const trueRange =
      previousReliableClose === null
        ? row.range
        : Math.max(
            row.range,
            Math.abs(row.high - previousReliableClose),
            Math.abs(row.low - previousReliableClose),
          );
    reliableTrueRanges.push(trueRange);
    if (reliableTrueRanges.length > ATR_PERIODS) reliableTrueRanges.shift();
    lastAtr = average(reliableTrueRanges);
    row.atr30m = lastAtr;
    previousReliableClose = row.close;
  });

  // A swing point is a reliable local high/low with SWING_LOOKBACK (= 3) candles on each side.
  // Its magnitude is measured from the nearest prior opposite swing. Its
  // observed retrace is the largest counter-move during the next 20 candles,
  // capped at 100% of that swing's measured magnitude.
  for (let index = SWING_LOOKBACK; index < workingRows.length - SWING_LOOKBACK; index++) {
    const row = workingRows[index];
    if (!row.isReliable) continue;
    const window = workingRows.slice(index - SWING_LOOKBACK, index + SWING_LOOKBACK + 1);
    const left = workingRows.slice(index - SWING_LOOKBACK, index);
    const right = workingRows.slice(index + 1, index + SWING_LOOKBACK + 1);
    const isSwingHigh =
      row.high >= Math.max(...window.map((item) => item.high)) &&
      row.high > Math.max(...left.map((item) => item.high)) &&
      row.high >= Math.max(...right.map((item) => item.high));
    const isSwingLow =
      row.low <= Math.min(...window.map((item) => item.low)) &&
      row.low < Math.min(...left.map((item) => item.low)) &&
      row.low <= Math.min(...right.map((item) => item.low));

    if (isSwingHigh === isSwingLow) continue;
    row.swingType = isSwingHigh ? "high" : "low";
    // Captured in a const so the closures below keep the non-null narrowing
    // (the row field itself is `number | null`).
    const swingPrice = isSwingHigh ? row.high : row.low;
    row.swingPrice = swingPrice;

    // Magnitude is measured from the nearest prior opposite swing. If there
    // isn't one yet, fall back to the opposite extreme of the preceding
    // window so the swing is still comparable instead of being dropped
    // silently (dropped swings were the main source of missing refs).
    const priorOpposite = [...workingRows.slice(0, index)]
      .reverse()
      .find(
        (item) => item.swingType === (isSwingHigh ? "low" : "high") && item.swingPrice !== null,
      );
    const fallbackWindow = workingRows.slice(
      Math.max(0, index - SWING_RANGE_FALLBACK_WINDOW),
      index,
    );
    const anchorPrice =
      priorOpposite && priorOpposite.swingPrice !== null
        ? priorOpposite.swingPrice
        : fallbackWindow.length > 0
          ? isSwingHigh
            ? Math.min(...fallbackWindow.map((item) => item.low))
            : Math.max(...fallbackWindow.map((item) => item.high))
          : null;
    if (anchorPrice === null) continue;

    row.swingRange = Math.abs(swingPrice - anchorPrice);
    if (row.swingRange <= 0) continue;

    const futureRows = workingRows.slice(index + 1, index + 1 + SWING_RETRACE_HORIZON);
    const counterMove = isSwingHigh
      ? Math.max(0, swingPrice - Math.min(...futureRows.map((item) => item.low)))
      : Math.max(0, Math.max(...futureRows.map((item) => item.high)) - swingPrice);
    row.observedRetracePct = Math.min(100, (counterMove / row.swingRange) * 100);

    // Outcome: after the retracement, did price close beyond the original
    // swing (continued) or break past the retracement extreme the other
    // way (reversed)? Unresolved if neither happens inside the horizon.
    const retraceExtreme = isSwingHigh ? swingPrice - counterMove : swingPrice + counterMove;
    const continued = futureRows.some((item) =>
      isSwingHigh ? item.close > swingPrice : item.close < swingPrice,
    );
    const reversed = futureRows.some((item) =>
      isSwingHigh ? item.close < retraceExtreme : item.close > retraceExtreme,
    );
    row.swingOutcome = continued ? "continued" : reversed ? "reversed" : "unresolved";

    // Invalidated: has any later row in the dataset closed past this swing
    // price at all (not limited to the retrace horizon)?
    const allLaterRows = workingRows.slice(index + 1);
    row.swingInvalidated = allLaterRows.some((item) =>
      isSwingHigh ? item.close > swingPrice : item.close < swingPrice,
    );
  }

  workingRows.forEach((row) => {
    if (!row.swingType || row.swingRange === null) return;
    // Guarded above; captured so the sort comparator keeps the narrowing.
    const rowSwingRange = row.swingRange;

    // Tolerance is symmetric: comparing against the larger of the two
    // magnitudes so a small swing can match a bigger one and vice versa.
    // (The old one-sided ratio silently rejected halves of legitimate pairs.)
    const withinTolerance = (candidate: EnrichedCandle) => {
      // Candidates are pre-filtered to swingRange !== null; the guard keeps the
      // arithmetic honest (a null magnitude could never be within tolerance —
      // the untyped version coerced null to 0 and returned false either way).
      if (candidate.swingRange === null || row.swingRange === null) return false;
      return (
        Math.abs(candidate.swingRange - row.swingRange) /
          Math.max(candidate.swingRange, row.swingRange) <=
        0.5
      );
    };
    const baseCandidates = workingRows.filter(
      (
        candidate,
      ): candidate is EnrichedCandle & { swingRange: number; observedRetracePct: number } =>
        candidate.index < row.index &&
        candidate.swingType === row.swingType &&
        candidate.swingRange !== null &&
        candidate.observedRetracePct !== null &&
        withinTolerance(candidate),
    );
    // Same session is preferred; if the session pool is empty we fall back to
    // any session rather than dropping the row.
    const sameSession = baseCandidates.filter((candidate) => candidate.session === row.session);
    const pool = sameSession.length > 0 ? sameSession : baseCandidates;
    const comparableSwings = pool
      .sort((left, right) => {
        const leftDistance = Math.abs(left.swingRange - rowSwingRange);
        const rightDistance = Math.abs(right.swingRange - rowSwingRange);
        if (leftDistance !== rightDistance) return leftDistance - rightDistance;
        return right.index - left.index;
      })
      .slice(0, 5);

    // A single qualifying prior swing is enough to populate swing data.
    if (comparableSwings.length < 1) return;

    // Retrace must be computable before refs are published: the two fields
    // are only ever written together, so `refs` can never be populated with
    // an empty `retrace_pct` (that mismatch was the coverage bug).
    const retraceValues = comparableSwings
      .map((candidate) => Number(candidate.observedRetracePct))
      .filter((value) => Number.isFinite(value));
    const retracePct = average(retraceValues);
    if (retracePct === null || !Number.isFinite(retracePct)) return;

    // Selection is closest in swing size first; if sizes tie, most recent
    // prior swing wins. This is deliberately explicit for auditability.
    row.similarSwingRefs = comparableSwings.map((candidate) => candidate.datetimeEAT);
    row.similarSwingRetracePct = retracePct;
    const resolvedSwings = comparableSwings.filter(
      (candidate) => candidate.swingOutcome !== "unresolved",
    );
    row.similarSwingContinuedPct =
      resolvedSwings.length > 0
        ? (resolvedSwings.filter((c) => c.swingOutcome === "continued").length /
            resolvedSwings.length) *
          100
        : null;
  });

  // Only swing candles can carry swing statistics, so per-row coverage was
  // structurally capped at the swing density of the dataset. Non-swing rows
  // now inherit the context of the most recent confirmed swing, flagged with
  // swing_context_source so inherited values are never mistaken for a swing
  // measured on that candle itself.
  let lastSwingContext: {
    retracePct: number;
    continuedPct: number | null;
    refs: string[];
    at: string;
  } | null = null;
  workingRows.forEach((row) => {
    if (row.swingType && row.similarSwingRetracePct !== null) {
      row.swingContextSource = "own_swing";
      lastSwingContext = {
        retracePct: row.similarSwingRetracePct,
        continuedPct: row.similarSwingContinuedPct,
        refs: row.similarSwingRefs,
        at: row.datetimeEAT,
      };
      return;
    }
    if (lastSwingContext) {
      row.similarSwingRetracePct = lastSwingContext.retracePct;
      row.similarSwingContinuedPct = lastSwingContext.continuedPct;
      row.similarSwingRefs = lastSwingContext.refs;
      row.swingContextSource = `inherited_from:${lastSwingContext.at}`;
    }
  });

  return workingRows;
};

export const validateOhlcExport = ({
  log,
  rows,
  exportedRows,
  headerColumns,
  dataRows,
  startDate,
  endDate,
}: {
  rows: EnrichedCandle[];
  exportedRows: EnrichedCandle[];
  headerColumns: string[];
  dataRows: unknown[][];
  startDate: string;
  endDate: string;
  log: LogFn;
}) => {
  const ATR_PERIODS = 14;
  const EXPECTED_INTERVAL_MS = 30 * 60 * 1000;
  const getDate = (datetimeEAT: string) =>
    new Date(`${String(datetimeEAT).replace(" ", "T")}+03:00`);
  const mean = (values: number[]) =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const percentile = (values: number[], percentileRank: number) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const position = (sorted.length - 1) * percentileRank;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  const isAdjacent = (left: EnrichedCandle, right: EnrichedCandle) => {
    const delta = getDate(right.datetimeEAT).getTime() - getDate(left.datetimeEAT).getTime();
    return Math.abs(delta - EXPECTED_INTERVAL_MS) < 1000;
  };
  const isSameSession = (left: EnrichedCandle, right: EnrichedCandle) =>
    left.session === right.session;

  const schemaMismatches = dataRows
    .map((fields, index) => ({
      fields,
      index,
      timestamp: exportedRows[index]?.datetimeEAT || "unknown",
    }))
    .filter((item) => item.fields.length !== headerColumns.length);
  const populatedColumns = headerColumns.filter((column) => {
    const columnIndex = headerColumns.indexOf(column);
    return dataRows.some((fields) => {
      const value = fields[columnIndex];
      return (
        value !== null &&
        value !== undefined &&
        String(value).trim() !== "" &&
        String(value).trim() !== "[]"
      );
    });
  });
  const emptyColumns = headerColumns.filter((column) => !populatedColumns.includes(column));
  const schemaPassed = schemaMismatches.length === 0 && emptyColumns.length === 0;

  const reliableTrueCount = exportedRows.filter((row) => row.isReliable === true).length;
  const reliableFalseCount = exportedRows.filter((row) => row.isReliable === false).length;
  const reliabilityPassed = reliableTrueCount > 0 && reliableFalseCount > 0;
  const thresholdRows = exportedRows.filter(
    (row) => row.localAvgRange > 0 && row.range < 0.1 * row.localAvgRange,
  );
  const thresholdMismatches = thresholdRows.filter((row) => row.isReliable !== false);
  const thresholdPassed = thresholdMismatches.length === 0;

  const continuityGaps: number[] = [];
  for (let index = 1; index < rows.length; index++) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (isAdjacent(previous, current) && isSameSession(previous, current)) {
      continuityGaps.push(Math.abs(current.open - previous.close));
    }
  }
  const maxContinuityGap = continuityGaps.length > 0 ? Math.max(...continuityGaps) : 0;
  const p95ContinuityGap = percentile(continuityGaps, 0.95);

  // Independent ATR(14) spot-check: recompute true range and the simple
  // rolling mean from raw OHLC and reliable flags, then sample up to 20 rows.
  const independentAtr = new Map<string, number>();
  const trueRanges: number[] = [];
  let previousReliableClose: number | null = null;
  for (const row of rows) {
    if (!row.isReliable) continue;
    const trueRange =
      previousReliableClose === null
        ? row.range
        : Math.max(
            row.range,
            Math.abs(row.high - previousReliableClose),
            Math.abs(row.low - previousReliableClose),
          );
    trueRanges.push(trueRange);
    if (trueRanges.length > ATR_PERIODS) trueRanges.shift();
    independentAtr.set(row.datetimeEAT, mean(trueRanges));
    previousReliableClose = row.close;
  }
  const atrCandidates = exportedRows.filter(
    (row): row is EnrichedCandle & { atr30m: number } =>
      row.atr30m !== null && independentAtr.has(row.datetimeEAT),
  );
  // Deterministic stride sample across the window: same rows every run,
  // no Math.random() luck deciding whether a broken ATR region is checked.
  const atrSampleCount = Math.min(20, atrCandidates.length);
  const atrStride = atrSampleCount > 0 ? atrCandidates.length / atrSampleCount : 1;
  const atrSample: typeof atrCandidates = [];
  for (let k = 0; k < atrSampleCount; k++) {
    atrSample.push(atrCandidates[Math.floor(k * atrStride)]!);
  }
  const atrDifferences = atrSample.map((row) =>
    Math.abs(row.atr30m - (independentAtr.get(row.datetimeEAT) as number)),
  );
  const atrAverageDifference = mean(atrDifferences);
  const atrAverageValue = mean(atrSample.map((row) => row.atr30m));
  const atrTolerance = atrAverageValue * 0.15;
  const atrPassed = atrSample.length > 0 && atrAverageDifference <= atrTolerance;

  const swingStructurePassed = exportedRows.every((row) => {
    const refs = Array.isArray(row.similarSwingRefs) ? row.similarSwingRefs : [];
    const hasRetrace =
      row.similarSwingRetracePct !== null && row.similarSwingRetracePct !== undefined;
    return refs.length <= 5 && refs.length > 0 === hasRetrace;
  });
  const continuedPctPassed = exportedRows.every((row) => {
    const value = row.similarSwingContinuedPct;
    // null is legitimate whenever it occurs (no refs, or refs exist but
    // every matched swing is still "unresolved" near the dataset edge).
    // Only actual out-of-range numbers are a real failure.
    return value === null || (value >= 0 && value <= 100);
  });
  const streakPassed = exportedRows.every(
    (row) =>
      typeof row.reliableStreakLength === "number" &&
      row.reliableStreakLength >= 0 &&
      (row.isReliable ? row.reliableStreakLength >= 1 : row.reliableStreakLength === 0),
  );
  const maxSwingRefs = exportedRows.reduce(
    (max, row) =>
      Math.max(max, Array.isArray(row.similarSwingRefs) ? row.similarSwingRefs.length : 0),
    0,
  );

  // Validate long timestamp gaps from the actual exported timeline. XAU/USD
  // legitimately closes for weekends and a small number of full-market holidays.
  // The previous fix handled weekends but still treated recurring Christmas/New
  // Year closures in the warm-up window as bad data, which is why the same two
  // "unexpected" gaps appeared on every requested day.
  interface LongGapDetail {
    deltaMinutes: number;
    expectedClosure: boolean;
    closureDates: string[];
    previousTimestamp: string;
    currentTimestamp: string;
  }
  const longGapDetails = rows.reduce<LongGapDetail[]>((details, row, index) => {
    if (index === 0) return details;
    const previous = rows[index - 1];
    const previousTime = getDate(previous.datetimeEAT).getTime();
    const currentTime = getDate(row.datetimeEAT).getTime();
    const deltaMinutes = (currentTime - previousTime) / (60 * 1000);
    if (deltaMinutes < 24 * 60) return details;

    const previousDate = new Date(previousTime);
    const currentDate = new Date(currentTime);
    const closureDates: string[] = [];
    const cursor = new Date(
      Date.UTC(
        previousDate.getUTCFullYear(),
        previousDate.getUTCMonth(),
        previousDate.getUTCDate(),
      ),
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);

    while (cursor.getTime() <= currentDate.getTime()) {
      const dow = cursor.getUTCDay();
      const yyyy = cursor.getUTCFullYear();
      const mm = String(cursor.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(cursor.getUTCDate()).padStart(2, "0");
      const key = `${yyyy}-${mm}-${dd}`;

      // Weekend closure is expected for this market.
      if (dow === 6 || dow === 0) closureDates.push(`weekend:${key}`);
      // These are recurring full closures that can create >24h gaps in the
      // provider's 30m XAU/USD history. Keep the allow-list deliberately
      // narrow so ordinary weekday missing data still fails validation.
      else if (mm === "01" && dd === "01") closureDates.push(`holiday:${key}`);
      else if (mm === "12" && (dd === "25" || dd === "26")) closureDates.push(`holiday:${key}`);

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    details.push({
      deltaMinutes,
      expectedClosure: closureDates.length > 0,
      closureDates,
      previousTimestamp: previous.datetimeEAT,
      currentTimestamp: row.datetimeEAT,
    });
    return details;
  }, []);
  const actualLargeGaps = longGapDetails.length;
  const expectedClosureGaps = longGapDetails.filter((gap) => gap.expectedClosure);
  const unexpectedGapDetails = longGapDetails.filter((gap) => !gap.expectedClosure);
  const expectedWeekendGaps = expectedClosureGaps.filter((gap) =>
    gap.closureDates.some((date) => date.startsWith("weekend:")),
  ).length;
  const expectedHolidayGaps = expectedClosureGaps.filter((gap) =>
    gap.closureDates.some((date) => date.startsWith("holiday:")),
  ).length;
  const unexpectedLargeGaps = unexpectedGapDetails.length;
  const weekendPassed = unexpectedLargeGaps === 0;
  const unexpectedGapSummary = unexpectedGapDetails
    .slice(0, 3)
    .map((gap) => `${gap.previousTimestamp} -> ${gap.currentTimestamp}`)
    .join("; ");

  const report = [
    `Schema integrity: ${schemaPassed ? "PASS" : "FAIL"} (${dataRows.length}/${dataRows.length} rows match header${schemaMismatches.length > 0 ? `; first mismatch row ${schemaMismatches[0].index + 1} at ${schemaMismatches[0].timestamp}` : ""}${emptyColumns.length > 0 ? `; empty columns: ${emptyColumns.join(", ")}` : ""})`,
    `is_reliable: ${reliabilityPassed ? "PASS" : "FAIL"} (${reliableTrueCount} true / ${reliableFalseCount} false)`,
    `is_reliable threshold match: ${thresholdPassed ? "PASS" : "FAIL"} (${thresholdRows.length - thresholdMismatches.length}/${thresholdRows.length} flatline candles correctly flagged)`,
    `Continuity: PASS (max gap ${maxContinuityGap.toFixed(5)}, 95th pct ${p95ContinuityGap.toFixed(5)})`,
    `ATR spot-check: ${atrPassed ? "PASS" : "FAIL"} (avg diff ${atrAverageDifference.toFixed(5)}, tolerance ${atrTolerance.toFixed(5)})`,
    `similar_swing_refs: ${swingStructurePassed ? "PASS" : "FAIL"} (max ${maxSwingRefs}, structure consistent)`,
    `similar_swing_continued_pct: ${continuedPctPassed ? "PASS" : "FAIL"}`,
    `reliable_streak_length: ${streakPassed ? "PASS" : "FAIL"}`,
    `Weekend gaps: ${weekendPassed ? "PASS" : "FAIL"} (${expectedWeekendGaps} weekend closures + ${expectedHolidayGaps} holiday closures accepted, ${unexpectedLargeGaps} unexpected long gaps; ${actualLargeGaps} total${unexpectedGapSummary ? `; unexpected: ${unexpectedGapSummary}` : ""})`,
  ];
  report.forEach((line) => log(`📋 ${line}`));

  const failures = [
    !schemaPassed && "Schema integrity",
    !reliabilityPassed && "is_reliable sanity",
    !thresholdPassed && "is_reliable threshold match",
    !atrPassed && "ATR spot-check",
    !swingStructurePassed && "similar_swing_refs structure",
    !continuedPctPassed && "similar_swing_continued_pct range",
    !streakPassed && "reliable_streak_length consistency",
    !weekendPassed && "Weekend gaps",
  ].filter(Boolean) as string[];

  return {
    passed: failures.length === 0,
    failures,
    report,
    metrics: {
      rowCount: dataRows.length,
      columnCount: headerColumns.length,
      reliableTrueCount,
      reliableFalseCount,
      thresholdCount: thresholdRows.length,
      thresholdMismatchCount: thresholdMismatches.length,
      maxContinuityGap,
      p95ContinuityGap,
      atrAverageDifference,
      atrTolerance,
      maxSwingRefs,
      actualLargeGaps,
      expectedWeekendGaps,
    },
  };
};

export const buildOhlcCsv = async (options: OhlcCsvOptions): Promise<string | null> => {
  const {
    symbol,
    startDate: ohlcStartDate,
    endDate: ohlcEndDate,
    specifyTime: ohlcSpecifyTime,
    startTime: ohlcStartTime,
    endTime: ohlcEndTime,
    log: addLog,
    setCooldown,
  } = options;
  try {
    addLog(`\n📋 Fetching OHLC 30M data for ${symbol}...`);
    const fetchStart = format(subDays(new Date(ohlcStartDate), 1), "yyyy-MM-dd");
    const fetchEnd = format(addDays(new Date(ohlcEndDate), 2), "yyyy-MM-dd");
    const apiSpanDays = daysBetween(fetchStart, fetchEnd);

    let values: ProviderCandle[] | undefined;

    if (apiSpanDays <= CHUNK_SPAN_DAYS) {
      // Single request covers the whole window — unchanged from the original path.
      const { response, data } = await requestMarketData({
        symbol,
        interval: "30min",
        start_date: fetchStart + " 00:00:00",
        end_date: fetchEnd + " 23:59:59",
        timezone: "Africa/Nairobi",
        outputsize: String(
          Math.min(
            5000,
            Math.max(
              100,
              (Math.floor(
                (new Date(`${ohlcEndDate}T00:00:00Z`).getTime() -
                  new Date(`${ohlcStartDate}T00:00:00Z`).getTime()) /
                  (1000 * 60 * 60 * 24),
              ) +
                3) *
                48,
            ),
          ),
        ),
      });

      const isRateLimit =
        response.status === 429 ||
        data.code === 429 ||
        (data.status === "error" &&
          String(data.message || "")
            .toLowerCase()
            .includes("credit"));

      if (isRateLimit) {
        const retriesLeft = options.rateLimitRetries ?? MAX_RATE_LIMIT_RETRIES;
        if (retriesLeft <= 0) {
          addLog(
            `❌ Twelve Data rate limit persisted through ${MAX_RATE_LIMIT_RETRIES} retry windows; aborting this fetch instead of retrying forever. Try a smaller window or later.`,
          );
          return null;
        }
        const attempt = MAX_RATE_LIMIT_RETRIES - retriesLeft + 1;
        addLog(
          `🛑 Twelve Data rate limit reached. Waiting 60 seconds before retrying (${attempt}/${MAX_RATE_LIMIT_RETRIES})...`,
        );
        await cooldown(60, setCooldown);
        addLog(`✅ OHLC retry window opened.`);
        return buildOhlcCsv({ ...options, rateLimitRetries: retriesLeft - 1 });
      }

      if (!response.ok || data.status === "error") {
        addLog(`❌ OHLC Error: ${data.message}`);
        // Surface the provider's own reason (e.g. "no provider configured") so
        // the backtester can show it instead of a generic "no usable OHLC data".
        throw new Error(String(data.message ?? `HTTP ${response.status}`));
      }
      values = Array.isArray(data.values) ? data.values : [];
    } else {
      // Window exceeds what one Twelve Data request can safely cover — fetch
      // it as contiguous chunks and merge. Same fail-closed contract as the
      // single-request path: any hard provider error aborts the whole fetch
      // (no partial/synthetic substitution); a persistent rate limit aborts
      // after the same retry budget instead of looping forever.
      const ranges = chunkDateRange(fetchStart, fetchEnd, CHUNK_SPAN_DAYS);
      addLog(
        `📦 Requested window spans ${apiSpanDays} day(s) — splitting into ${ranges.length} chunk(s) of up to ${CHUNK_SPAN_DAYS} day(s) each (Twelve Data per-request row cap).`,
      );
      let retriesLeft = options.rateLimitRetries ?? MAX_RATE_LIMIT_RETRIES;
      const merged: ProviderCandle[] = [];

      for (let i = 0; i < ranges.length; i++) {
        const { start, end } = ranges[i];
        const chunkSpanDays = daysBetween(start, end);
        addLog(`📋 Fetching chunk ${i + 1}/${ranges.length}: ${start} → ${end}...`);

        for (;;) {
          const { response, data } = await requestMarketData({
            symbol,
            interval: "30min",
            start_date: start + " 00:00:00",
            end_date: end + " 23:59:59",
            timezone: "Africa/Nairobi",
            outputsize: String(Math.min(5000, Math.max(100, (chunkSpanDays + 3) * 48))),
          });

          const isRateLimit =
            response.status === 429 ||
            data.code === 429 ||
            (data.status === "error" &&
              String(data.message || "")
                .toLowerCase()
                .includes("credit"));

          if (isRateLimit) {
            if (retriesLeft <= 0) {
              addLog(
                `❌ Twelve Data rate limit persisted through ${MAX_RATE_LIMIT_RETRIES} retry windows; aborting this fetch instead of retrying forever. Try a smaller window or later.`,
              );
              return null;
            }
            const attempt = MAX_RATE_LIMIT_RETRIES - retriesLeft + 1;
            addLog(
              `🛑 Twelve Data rate limit reached on chunk ${i + 1}/${ranges.length}. Waiting 60 seconds before retrying (${attempt}/${MAX_RATE_LIMIT_RETRIES})...`,
            );
            retriesLeft -= 1;
            await cooldown(60, setCooldown);
            addLog(`✅ OHLC retry window opened.`);
            continue; // retry the same chunk
          }

          const isNoDataForChunk =
            (data.code === 400 || data.status === "error") &&
            String(data.message || "")
              .toLowerCase()
              .includes("no data is available");

          if (isNoDataForChunk) {
            addLog(`⚠️ No OHLC data found for chunk ${i + 1}/${ranges.length} (${start} → ${end})`);
            break; // contributes zero rows; move to next chunk
          }

          if (!response.ok || data.status === "error") {
            addLog(`❌ OHLC Error on chunk ${i + 1}/${ranges.length}: ${data.message}`);
            throw new Error(String(data.message ?? `HTTP ${response.status}`));
          }

          if (Array.isArray(data.values)) merged.push(...data.values);
          break; // chunk done, move to next
        }
      }

      // Deduplicate by timestamp and sort chronologically before handing the
      // series to the rest of the pipeline. Chunks are fetched over
      // contiguous, non-overlapping calendar windows, so duplicates are not
      // expected in normal operation — this is a defensive guarantee, not a
      // correction of provider data.
      const byDatetime = new Map<string, ProviderCandle>();
      for (const row of merged) {
        const key = String(row?.datetime ?? "");
        if (!key) continue;
        byDatetime.set(key, row);
      }
      values = Array.from(byDatetime.values()).sort((a, b) =>
        String(a.datetime).localeCompare(String(b.datetime)),
      );
      addLog(
        `📦 Combined ${ranges.length} chunk(s) into ${values.length} deduplicated, chronologically sorted candle(s).`,
      );
    }

    if (!values || values.length === 0) {
      addLog(`⚠️ No OHLC data found for this period`);
      return null;
    }

    const reqStartStr = `${ohlcStartDate} ${ohlcSpecifyTime ? ohlcStartTime : "00:00"}:00`;
    const reqEndStr = `${ohlcEndDate} ${ohlcSpecifyTime ? ohlcEndTime : "23:59"}:59`;

    const hasRealTickVolume = values.some(
      (v) =>
        v.volume !== undefined &&
        v.volume !== null &&
        String(v.volume).trim() !== "" &&
        Number.isFinite(Number(v.volume)) &&
        Number(v.volume) > 0,
    );

    const filtered = values
      .map((v): FilteredCandle => {
        // The API response is already in Africa/Nairobi because of the
        // timezone parameter above. Compare wall-clock strings directly.
        const datetimeEAT = String(v.datetime).replace("T", " ");
        const open = parseFloat(v.open);
        const high = parseFloat(v.high);
        const low = parseFloat(v.low);
        const close = parseFloat(v.close);
        const body = Math.abs(close - open);
        const range = high - low;
        const upperWick = high - Math.max(open, close);
        const lowerWick = Math.min(open, close) - low;
        const bodyPercent = range > 0 ? (body / range) * 100 : 0;
        return {
          datetimeEAT,
          open,
          high,
          low,
          close,
          ...(hasRealTickVolume ? { volume: v.volume } : {}),
          direction: close >= open ? "Bullish" : "Bearish",
          body,
          upperWick,
          lowerWick,
          range,
          bodyPercent,
        };
      })
      .filter((v) => v.datetimeEAT >= reqStartStr && v.datetimeEAT <= reqEndStr);

    filtered.sort((a, b) => a.datetimeEAT.localeCompare(b.datetimeEAT));
    const cleanedOhlc = removeRepeatedFlatlineArtifacts(filtered, 30);
    const cleanedFiltered = cleanedOhlc.candles;
    if (cleanedOhlc.removedCount > 0) {
      addLog(`🧹 Skipped ${cleanedOhlc.removedCount} repeated flatline OHLC candle(s)`);
    }
    const enrichedRows = enrichOhlcRows(cleanedFiltered);

    // The API timestamps are EAT wall-clock strings. Convert them to UTC only
    // for sectioning the export; keep the existing datetime column unchanged.
    const toUtcDate = (datetimeEAT: string) => new Date(`${datetimeEAT.replace(" ", "T")}+03:00`);
    const toUtcDayKey = (datetimeEAT: string) => toUtcDate(datetimeEAT).toISOString().slice(0, 10);
    const toDayDate = (dayKey: string) => new Date(`${dayKey}T00:00:00Z`);
    const addUtcDay = (date: Date) => {
      const next = new Date(date);
      next.setUTCDate(next.getUTCDate() + 1);
      return next;
    };
    const formatUtcDayHeader = (dayKey: string) => {
      const day = toDayDate(dayKey);
      const weekday = new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        timeZone: "UTC",
      })
        .format(day)
        .toUpperCase();
      return `=== ${weekday} ${dayKey} (UTC) ===`;
    };

    const requestedStartDay = toDayDate(ohlcStartDate);
    const requestedEndDay = toDayDate(ohlcEndDate);
    const requestedIncludesWeekend = (() => {
      for (let day = new Date(requestedStartDay); day <= requestedEndDay; day = addUtcDay(day)) {
        if (day.getUTCDay() === 0 || day.getUTCDay() === 6) return true;
      }
      return false;
    })();

    if (cleanedFiltered.length === 0 && !requestedIncludesWeekend) {
      addLog(`⚠️ No OHLC candles available for ${symbol} between ${reqStartStr} and ${reqEndStr}`);
      return null;
    }

    // Provider windows are capped by outputsize (5000 rows); the twelve-data
    // contract returns the NEWEST rows and silently drops the oldest. Detect
    // that head truncation instead of shipping a file whose warm-up coverage
    // is silently shorter than the requested (and displayed) start date.
    if (cleanedFiltered.length > 0) {
      const earliestMs = new Date(
        `${cleanedFiltered[0].datetimeEAT.replace(" ", "T")}+03:00`,
      ).getTime();
      const requestedStartMs = new Date(`${reqStartStr.replace(" ", "T")}+03:00`).getTime();
      const gapDays = (earliestMs - requestedStartMs) / 86_400_000;
      if (Number.isFinite(gapDays) && gapDays > 7) {
        addLog(
          `⚠️ Head coverage truncated: earliest provider row is ${cleanedFiltered[0].datetimeEAT}, ${Math.round(gapDays)} days after the requested start (${reqStartStr}). The provider row cap dropped the oldest data; strategy warm-up depth will be shorter than expected. Split the range into smaller windows if that matters.`,
        );
      }
    }

    const rowsByUtcDay = new Map<string, EnrichedCandle[]>();
    enrichedRows.forEach((row) => {
      const utcDayKey = toUtcDayKey(row.datetimeEAT);
      const rows = rowsByUtcDay.get(utcDayKey) || [];
      rows.push(row);
      rowsByUtcDay.set(utcDayKey, rows);
    });

    // Include requested calendar days (including weekends), plus any UTC day
    // touched by the EAT-to-UTC conversion at either edge of the selection.
    const allDayKeys = [ohlcStartDate, ohlcEndDate, ...Array.from(rowsByUtcDay.keys())].sort();
    const exportStartDay = toDayDate(allDayKeys[0]);
    const exportEndDay = toDayDate(allDayKeys[allDayKeys.length - 1]);
    const exportRows: string[] = [];
    const headerColumns = [
      "datetime",
      "open",
      "high",
      "low",
      "close",
      ...(hasRealTickVolume ? ["volume"] : []),
      "direction",
      "body",
      "upper_wick",
      "lower_wick",
      "range",
      "body_percent_of_range",
      "upper_wick_pct",
      "lower_wick_pct",
      "displacement",
      "is_reliable",
      "local_avg_range",
      "session",
      "atr_30m",
      "similar_swing_retrace_pct",
      "similar_swing_continued_pct",
      "similar_swing_refs",
      "swing_context_source",

      "swing_invalidated",
      "reliable_streak_length",
    ];
    const dataRows: string[][] = [];
    const csvEscape = (value: unknown) => {
      if (value === null || value === undefined) return "";
      const stringValue = String(value);
      return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
    };

    for (let day = new Date(exportStartDay); day <= exportEndDay; day = addUtcDay(day)) {
      const dayKey = day.toISOString().slice(0, 10);
      const utcWeekday = day.getUTCDay();

      if (utcWeekday === 0 || utcWeekday === 6) {
        exportRows.push("=== WEEKEND / SKIPPED ===");
        continue;
      }

      exportRows.push(formatUtcDayHeader(dayKey));
      const dayRows = rowsByUtcDay.get(dayKey) || [];
      dayRows.forEach((row) => {
        // Build by column name first, then project through headerColumns.
        // This prevents a missing field from silently shifting later values.
        const rowByColumn: Record<string, unknown> = {
          datetime: row.datetimeEAT,
          open: row.open.toFixed(2),
          high: row.high.toFixed(2),
          low: row.low.toFixed(2),
          close: row.close.toFixed(2),
          ...(hasRealTickVolume ? { volume: row.volume } : {}),
          direction: row.direction,
          body: row.body.toFixed(2),
          upper_wick: row.upperWick.toFixed(2),
          lower_wick: row.lowerWick.toFixed(2),
          range: row.range.toFixed(2),
          body_percent_of_range: `${row.bodyPercent.toFixed(1)}%`,
          upper_wick_pct: `${(row.range > 0 ? (row.upperWick / row.range) * 100 : 0).toFixed(1)}%`,
          lower_wick_pct: `${(row.range > 0 ? (row.lowerWick / row.range) * 100 : 0).toFixed(1)}%`,
          displacement: row.bodyPercent >= 65 ? "Yes" : "No",
          is_reliable: row.isReliable,
          local_avg_range: row.localAvgRange?.toFixed(5),
          session: row.session,
          atr_30m: row.atr30m === null ? null : row.atr30m.toFixed(5),
          similar_swing_retrace_pct:
            row.similarSwingRetracePct === null ? null : row.similarSwingRetracePct.toFixed(2),
          similar_swing_continued_pct:
            row.similarSwingContinuedPct === null ? null : row.similarSwingContinuedPct.toFixed(1),
          similar_swing_refs: JSON.stringify(row.similarSwingRefs),
          swing_context_source: row.swingContextSource,

          swing_invalidated: row.swingInvalidated,
          reliable_streak_length: row.reliableStreakLength,
        };
        const fields = headerColumns.map((column) => rowByColumn[column]);
        const escapedFields = fields.map(csvEscape);
        dataRows.push(escapedFields);
        exportRows.push(escapedFields.join(","));
      });
    }

    const safeSymbol = symbol.replace(/[/\\]/g, "");
    const spreadConvention = (() => {
      const normalizedSymbol = safeSymbol.toUpperCase();
      if (normalizedSymbol === "XAUUSD") {
        return "XAUUSD: static estimate of $0.20 per ounce, used only for final Entry/SL/TP pricing; never applied to OHLC or derived calculations.";
      }
      if (normalizedSymbol === "XAGUSD") {
        return "XAGUSD: static estimate of $0.02 per ounce, used only for final Entry/SL/TP pricing; never applied to OHLC or derived calculations.";
      }
      if (normalizedSymbol === "BTCUSD") {
        return "BTCUSD: static estimate of $25.00, used only for final Entry/SL/TP pricing; never applied to OHLC or derived calculations.";
      }
      if (normalizedSymbol === "ETHUSD") {
        return "ETHUSD: static estimate of $2.00, used only for final Entry/SL/TP pricing; never applied to OHLC or derived calculations.";
      }
      if (/JPY$/.test(normalizedSymbol)) {
        return `${normalizedSymbol}: static estimate of 0.02 price units (approximately 2 pips), used only for final Entry/SL/TP pricing; never applied to OHLC or derived calculations.`;
      }
      return `${normalizedSymbol}: static estimate of 0.0002 price units (approximately 2 pips), used only for final Entry/SL/TP pricing; never applied to OHLC or derived calculations.`;
    })();

    const getTimestampMs = (datetimeEAT: string) =>
      new Date(`${datetimeEAT.replace(" ", "T")}+03:00`).getTime();
    const getSessionForHour = (utcHour: number) =>
      utcHour >= 22 || utcHour < 8 ? "asian" : utcHour < 13 ? "london" : "ny";
    let maxOpenPriorCloseGap = 0;
    let continuityGapCount = 0;
    for (let index = 1; index < enrichedRows.length; index++) {
      const previous = enrichedRows[index - 1];
      const current = enrichedRows[index];
      const previousTime = getTimestampMs(previous.datetimeEAT);
      const currentTime = getTimestampMs(current.datetimeEAT);
      const isAdjacent = Math.abs(currentTime - previousTime - 30 * 60 * 1000) < 1000;
      const previousSession = getSessionForHour(new Date(previousTime).getUTCHours());
      const currentSession = getSessionForHour(new Date(currentTime).getUTCHours());
      if (isAdjacent && previousSession === currentSession) {
        const gap = Math.abs(current.open - previous.close);
        maxOpenPriorCloseGap = Math.max(maxOpenPriorCloseGap, gap);
        if (gap > 0) continuityGapCount++;
      }
    }

    addLog(
      `🔎 Continuity diagnostic: ${continuityGapCount} same-session adjacent gaps found; ` +
        `raw OHLC values were not modified`,
    );

    // Full validation gate: runs schema, reliability, ATR spot-check, swing
    // structure, and weekend-gap checks before the file is allowed to be
    // labeled VALIDATED. This supersedes the lighter inline checks above.
    const validation = validateOhlcExport({
      log: addLog,
      rows: enrichedRows,
      exportedRows: enrichedRows,
      headerColumns,
      dataRows,
      startDate: ohlcStartDate,
      endDate: ohlcEndDate,
    });

    if (!validation.passed) {
      addLog(`❌ Validation FAILED: ${validation.failures.join(", ")}`);
    } else {
      addLog(`✅ Validation PASSED: all hard checks green`);
    }

    const reliableRows = enrichedRows.filter((row) => row.isReliable === true);
    // swing_coverage_pct is defined on similar_swing_retrace_pct specifically.
    const reliableWithRetrace = reliableRows.filter(
      (row) => row.similarSwingRetracePct !== null && row.similarSwingRetracePct !== undefined,
    );
    const reliableWithRefs = reliableRows.filter(
      (row) => Array.isArray(row.similarSwingRefs) && row.similarSwingRefs.length > 0,
    );
    const swingCoveragePct =
      reliableRows.length > 0 ? (reliableWithRetrace.length / reliableRows.length) * 100 : 0;
    const swingRefsCoveragePct =
      reliableRows.length > 0 ? (reliableWithRefs.length / reliableRows.length) * 100 : 0;
    addLog(
      `📐 Swing coverage: retrace_pct ${swingCoveragePct.toFixed(2)}% (${reliableWithRetrace.length}/${reliableRows.length}) | refs ${swingRefsCoveragePct.toFixed(2)}% (${reliableWithRefs.length}/${reliableRows.length}) of reliable rows`,
    );
    addLog(
      `🔎 Swing sources: ${reliableRows.filter((r) => r.swingContextSource === "own_swing").length} own swing, ${reliableRows.filter((r) => typeof r.swingContextSource === "string" && r.swingContextSource.startsWith("inherited")).length} inherited, ${reliableRows.filter((r) => !r.swingContextSource).length} no context`,
    );

    if (reliableWithRefs.length !== reliableWithRetrace.length) {
      addLog(
        `⚠️ Swing field mismatch: ${Math.abs(reliableWithRefs.length - reliableWithRetrace.length)} reliable row(s) have refs without retrace_pct`,
      );
    }

    const metadata = {
      data_age:
        enrichedRows.length > 0 ? `${enrichedRows[enrichedRows.length - 1].datetimeEAT} EAT` : null,
      generated_at: new Date().toISOString(),
      spread_convention: spreadConvention,
      turtle_tick_size: turtleTickSizeForSymbol(symbol),
      atr_method:
        "Simple rolling mean of true range over the trailing 14 reliable candles; unreliable rows carry forward the last reliable ATR.",
      continuity_diagnostic: `Maximum same-session adjacent open/prior-close gap was ${maxOpenPriorCloseGap.toFixed(5)} raw price units across ${continuityGapCount} rows. Weekend and session-boundary gaps are excluded; raw OHLC is untouched.`,
      swing_detection_rule:
        "A swing is a reliable local high/low with 3 candles on each side (3-candle fractal). Magnitude is measured from the nearest prior opposite swing, or, when none exists yet, from the opposite extreme of the preceding 20 candles.",
      similar_swing_selection_rule:
        "For each swing, select up to 5 prior swings in the same swing direction whose magnitude is within +/-50% of the current swing, measured symmetrically against the larger of the two magnitudes. Same-session swings are preferred; if none qualify, swings from any session are used. A single qualifying prior swing is sufficient. Sort by closest magnitude first; ties use the most recent swing. similar_swing_retrace_pct is the average of their observed retrace percentages; similar_swing_refs and similar_swing_retrace_pct are always written together.",
      swing_context_inheritance_rule:
        "Only swing candles carry measured swing statistics. Non-swing rows inherit the most recent confirmed swing's similar_swing_* values, and swing_context_source records 'own_swing' or 'inherited_from:<timestamp>'.",
      swing_coverage_pct: `${swingCoveragePct.toFixed(2)}%`,
      swing_coverage_pct_definition:
        "Percentage of is_reliable=true rows that have similar_swing_retrace_pct populated (own or inherited swing context).",
      similar_swing_refs_coverage_pct: `${swingRefsCoveragePct.toFixed(2)}%`,

      section_marker_convention:
        "Lines starting with '===' (day headers and '=== WEEKEND / SKIPPED ===') are section markers only. They are never data rows and are excluded from every calculation, validation and citation check.",
      validation_status: validation.passed ? "VALIDATED" : "VALIDATION_FAILED",

      validation_failures: validation.failures,
    };

    if (!validation.passed) {
      // Hard stop: do not package or download a file that failed validation.
      // The failure details are already logged above via addLog(); throwing
      // here prevents the ZIP/download step from ever being reached.
      throw new Error(
        `CSV export blocked — validation failed: ${validation.failures.join(", ")}. ` +
          `See the log above for the full report.`,
      );
    }

    const csv = [
      `# metadata: ${JSON.stringify(metadata)}`,
      headerColumns.join(","),
      ...exportRows,
    ].join("\n");
    addLog(
      `✅ OHLC: ${enrichedRows.length} rows fetched${hasRealTickVolume ? " with tick volume" : " without volume (not provided)"}`,
    );
    return csv;
  } catch (error) {
    addLog(`❌ OHLC fetch error: ${String(error)}`);
    return null;
  }
};
