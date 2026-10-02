function hashSeed(seed: string | number, stream: string): number {
  const text = `${String(seed)}|${stream}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** Independent named streams keep dial changes from shifting unrelated draws. */
export function createRandom(seed: string | number, stream: string): () => number {
  let state = hashSeed(seed, stream) || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickIndex(random: () => number, length: number): number {
  if (!Number.isInteger(length) || length <= 0) throw new Error("cannot pick from an empty pool");
  return Math.min(length - 1, Math.floor(random() * length));
}

export function quantile(values: readonly number[], probability: number): number {
  if (values.length === 0) throw new Error("cannot compute a quantile of an empty sample");
  if (probability < 0 || probability > 1) throw new Error("quantile probability must be in [0, 1]");
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.min(sorted.length - 1, lower + 1);
  const fraction = position - lower;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * fraction;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

export function sampleSd(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  let sum = 0;
  for (const value of values) sum += (value - average) ** 2;
  return Math.sqrt(sum / (values.length - 1));
}

export function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}
