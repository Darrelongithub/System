import type { Candle } from "./types";
import { parseEatDatetime } from "./math";

const ENGINE_METADATA = {
  spread_convention:
    "XAUUSD: static estimate of 0.20 price units; ASSUMPTION only, no historical spread data exists.",
  atr_method:
    "Wilder ATR(14), first value = SMA of first 14 true ranges; atr_30m intentionally omitted so the analyzer computes Wilder ATR from OHLC.",
  similar_swing_selection_rule:
    "Synthetic OHLC has no hindsight-derived similar-swing columns; analyzer structure is computed from the OHLC series.",
} as const;

function validateCandles(candles: readonly Candle[]): void {
  let previousTime: number | undefined;
  for (let index = 0; index < candles.length; index++) {
    const candle = candles[index]!;
    const time = parseEatDatetime(candle.datetime);
    if (time === undefined)
      throw new Error(`invalid EAT timestamp at candle ${index}: ${candle.datetime}`);
    if (previousTime !== undefined && time <= previousTime) {
      throw new Error(
        `timestamps must be strictly increasing; duplicate/out-of-order at ${candle.datetime}`,
      );
    }
    previousTime = time;
    if (
      ![candle.open, candle.high, candle.low, candle.close].every(Number.isFinite) ||
      candle.open <= 0 ||
      candle.high <= 0 ||
      candle.low <= 0 ||
      candle.close <= 0 ||
      candle.low > candle.open ||
      candle.open > candle.high ||
      candle.low > candle.close ||
      candle.close > candle.high
    ) {
      throw new Error(`invalid positive OHLC geometry at candle ${index} (${candle.datetime})`);
    }
  }
}

/**
 * Serialize the minimal CSV shape that src/lib/analyzer/parse.ts actually
 * consumes: metadata line, header-name columns, EAT wall-clock timestamps, and
 * the six required fields. No `atr_30m` column is emitted: that column overrides
 * the analyzer's Wilder ATR fallback and research inputs may carry a simple mean.
 */
export function toCsv(candles: readonly Candle[]): string {
  validateCandles(candles);
  if (candles.length === 0) throw new Error("toCsv requires at least one candle");
  const metadata = {
    data_age: candles[candles.length - 1]!.datetime,
    ...ENGINE_METADATA,
  };
  const lines = [
    `# metadata: ${JSON.stringify(metadata)}`,
    "datetime,open,high,low,close,is_reliable",
    ...candles.map((candle) =>
      [
        candle.datetime,
        String(candle.open),
        String(candle.high),
        String(candle.low),
        String(candle.close),
        "true",
      ].join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}
