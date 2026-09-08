export const STANDARD_LOOKBACK_CALENDAR_DAYS = 30;

/**
 * Unavoidable OHLC ambiguity: a single bar can print both TP and SL levels.
 * Higher-resolution data would be required to know which was touched first.
 * Current deterministic convention (do not change without regenerating all results):
 * after fill, if both TP and SL are touched on the same later candle, TP is resolved first.
 */
export const SAME_CANDLE_TP_SL_RULE =
  "After fill, if both TP and SL are touched in the same OHLC candle, TP is resolved first (deterministic OHLC ambiguity convention; not a claim about true tick order).";

export function closedSignalCandleCount(
  candleCount: number,
  seriesEndsComplete: boolean,
): number {
  if (candleCount <= 0) return 0;
  if (seriesEndsComplete) return candleCount;
  return Math.max(0, candleCount - 1);
}
