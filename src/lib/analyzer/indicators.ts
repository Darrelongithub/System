import type { Candle } from "./types";

/** EMA over close; undefined until `period` closes are available. */
export function ema(candles: Candle[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(candles.length).fill(undefined);
  const k = 2 / (period + 1);
  let prev: number | undefined;
  const seed: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const close = candles[i]!.close;
    if (candles[i]!.invalid || close === undefined) {
      out[i] = prev;
      continue;
    }
    if (prev === undefined) {
      seed.push(close);
      if (seed.length === period) {
        prev = seed.reduce((a, b) => a + b, 0) / period;
        out[i] = prev;
      }
      continue;
    }
    prev = close * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}
