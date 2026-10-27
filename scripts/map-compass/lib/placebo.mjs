/**
 * M5 — multiplicity / false-discovery control.
 *
 * 24 strategies x 2 claims = 48 tests, and the three variants inside a family
 * are NOT independent (they fire on overlapping conditions). A naive
 * Bonferroni correction is therefore wrong in both directions. Instead we
 * measure the actual null distribution of OUR specific test battery by
 * shuffling the state labels.
 *
 * Shuffle method: WITHIN-YEAR BLOCK CIRCULAR SHIFT. A plain i.i.d. shuffle
 * would destroy state persistence and per-year state counts, producing a null
 * that is too easy to beat. A circular shift of the whole state series within
 * each year preserves both, while breaking alignment with returns.
 *
 * Output: how many fake "CONFIRMED" claims the battery produces by chance.
 * That number is the false-discovery floor a real result must clear.
 */
import { ROLES } from "../frozen.mjs";

/** Deterministic PRNG so placebo runs are reproducible. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Circular-shift the `state` label of every trade within each year by a random
 * offset. Returns a NEW array; input is untouched.
 */
export function blockCircularShift(trades, rng) {
  const byYear = new Map();
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    if (!ROLES.DEV.includes(t.year)) continue; // holdout never enters the null
    if (!byYear.has(t.year)) byYear.set(t.year, []);
    byYear.get(t.year).push(i); // store INDICES, not object refs (O(n) not O(n^2))
  }
  const out = trades.map((t) => ({ ...t }));
  const offsets = new Map();
  for (const [year, idx] of byYear.entries()) {
    const shift = Math.floor(rng() * idx.length);
    offsets.set(year, shift);
    const states = idx.map((i) => trades[i].state);
    for (let k = 0; k < idx.length; k++) {
      out[idx[k]].state = states[(k + shift) % idx.length];
    }
  }
  return { shifted: out, offsets: Object.fromEntries(offsets) };
}

/**
 * Run the battery over `shuffles` independent label shifts.
 * `runBattery(trades)` must return an array of verdict objects with a
 * `.verdict` field. Returns the distribution of CONFIRMED counts.
 */
export function placeboDistribution(trades, runBattery, { shuffles = 40, seed = 20261026 } = {}) {
  const rng = mulberry32(seed);
  const counts = [];
  for (let s = 0; s < shuffles; s++) {
    const { shifted } = blockCircularShift(trades, rng);
    const verdicts = runBattery(shifted);
    counts.push(verdicts.filter((v) => v.verdict === "CONFIRMED").length);
  }
  counts.sort((a, b) => a - b);
  const q = (p) => counts[Math.min(counts.length - 1, Math.floor(p * counts.length))];
  return {
    shuffles,
    seed,
    counts,
    medianFakeConfirms: q(0.5),
    p95FakeConfirms: q(0.95),
    maxFakeConfirms: counts[counts.length - 1],
    note: "A real CONFIRMED count must exceed p95FakeConfirms to be credible.",
  };
}
