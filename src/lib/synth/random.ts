/** Small, explicit 32-bit PRNG. No ambient randomness, time, I/O, or mutable global state. */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    if (!Number.isFinite(seed)) throw new Error("seed must be a finite number");
    this.state = Math.trunc(seed) >>> 0;
  }

  nextUint32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  next(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  integer(minInclusive: number, maxInclusive: number): number {
    if (
      !Number.isInteger(minInclusive) ||
      !Number.isInteger(maxInclusive) ||
      maxInclusive < minInclusive
    ) {
      throw new Error("integer range must be ordered integers");
    }
    return minInclusive + Math.floor(this.next() * (maxInclusive - minInclusive + 1));
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new Error("cannot sample an empty collection");
    return values[Math.floor(this.next() * values.length)]!;
  }

  shuffle<T>(values: readonly T[]): T[] {
    const out = [...values];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }
}
