/**
 * G0 AMENDMENT 8 — STAGE 3 dress-rehearsal world generator.
 *
 * Seeded random-walk M30 bars shaped so the REAL pipeline can run on them:
 * a realistic gold ATR scale, the same EAT wall clock and session structure,
 * and 3 segments separated by holes (one sealed 2012-like year and one
 * 2016-like year inside the DEV span, exactly as the real data has).
 *
 * The generator is the ONLY place a planted edge is defined. The verifier never
 * receives the planted size; it is compared afterwards.
 *
 * Conditions
 *   A  zero drift, no edge
 *   B  constant upward drift per bar such that a random long entry nets ~+0.15R
 *   C  one planted edge: after each donchian-20 signal bar, a known post-entry
 *      drift in the signal direction sized for true net ~+0.30R
 */
import { MAP, EXIT_HARNESS } from "../frozen.mjs";

/** Deterministic PRNG (identical to the one used elsewhere in the project). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller on top of the seeded uniform. */
function gauss(rng) {
  let u = 0,
    v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Two trading sessions per day is what the EAT clock gives us; keep M30 bars. */
export const SYNTH_CLOCK = Object.freeze({
  barsPerDay: 44, // ~22h of M30 bars, leaving a weekend-style gap at day end
  daysPerYear: 252,
});

/**
 * Build one world.
 *
 * @param {object} o
 *  - condition: "A" | "B" | "C"
 *  - seed
 *  - barsPerSegment: bars in each of the 3 segments
 *  - atrScale: typical M30 true range in price units (gold scale)
 *  - start: starting price
 *  - driftPerBarR: (B and C) drift expressed in R of the median ATR
 * @returns {{bars, meta}}
 */
export function buildWorld({
  condition,
  seed,
  barsPerSegment = 20000,
  atrScale = 1.6,
  start = 1200,
  driftPerBarR = null,
}) {
  const rng = mulberry32(seed);
  const segYears = [
    { id: "S1", years: [2009, 2010, 2011], firstYear: 2009 },
    { id: "S2", years: [2013, 2014, 2015], firstYear: 2013 },
    { id: "S3", years: [2017, 2018], firstYear: 2017 },
  ];
  // The holes between segments are sealed years 2012 and 2016.
  const holes = [2012, 2016];

  const bars = [];
  let px = start;
  const p2 = (x) => String(x).padStart(2, "0");

  // Donchian-20 signal detection needs the SAME rule the signal library uses:
  // bar i breaks the highest high / lowest low of the previous 20 bars.
  const recent = []; // rolling window of the last 20 completed bars

  const plantedEvents = []; // for condition C: where and how much we planted
  let plantedBarsLeft = 0;
  let plantedDirection = 0;

  const atrPx = atrScale; // working ATR estimate in price units
  const sigmaPerBar = atrScale / 1.6; // keep the ATR/|return| ratio realistic

  for (let s = 0; s < segYears.length; s++) {
    const seg = segYears[s];
    const t0 = Date.UTC(seg.firstYear, 0, 2, 7, 0, 0); // 10:00 EAT start
    for (let i = 0; i < barsPerSegment; i++) {
      const dayIdx = Math.floor(i / SYNTH_CLOCK.barsPerDay);
      const barOfDay = i % SYNTH_CLOCK.barsPerDay;
      const ts = t0 + (dayIdx * 1440 + barOfDay * 30) * 60 * 1000;
      const d = new Date(ts);

      // Drift is specified in R PER BAR. 1R = stopAtrMultiple * ATR by the
      // frozen exit harness, so the price drift is rBar * 1.5 * ATR.
      const pricePerR = EXIT_HARNESS.stopAtrMultiple * atrPx;

      // Condition B: a constant upward drift every bar.
      let drift = 0;
      if (condition === "B" && driftPerBarR) drift = driftPerBarR * pricePerR;

      // Condition C: a planted drift for a bounded window after each signal.
      let planted = 0;
      if (condition === "C" && plantedBarsLeft > 0) {
        planted = plantedDirection * (driftPerBarR ?? 0) * pricePerR;
        plantedBarsLeft--;
      }

      const o = px;
      const shock = gauss(rng) * sigmaPerBar;
      const c = o + shock + drift + planted;
      const wickUp = Math.abs(gauss(rng)) * atrScale * 0.35;
      const wickDown = Math.abs(gauss(rng)) * atrScale * 0.35;
      const h = Math.max(o, c) + wickUp;
      const l = Math.min(o, c) - wickDown;

      const bar = {
        datetime: `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:00`,
        o,
        h,
        l,
        c,
        v: 1,
      };
      bars.push(bar);
      px = c;

      // Donchian-20 test on the CLOSED bar (causal: uses bars strictly before).
      if (recent.length >= 20) {
        let hh = -Infinity;
        let ll = Infinity;
        for (let k = recent.length - 20; k < recent.length; k++) {
          if (recent[k].h > hh) hh = recent[k].h;
          if (recent[k].l < ll) ll = recent[k].l;
        }
        if (bar.h > hh) {
          if (condition === "C") {
            plantedBarsLeft = EXIT_HARNESS.maxHoldBars;
            plantedDirection = +1;
            plantedEvents.push({ segment: seg.id, index: bars.length - 1, side: "long", plantedR: driftPerBarR ?? 0 });
          }
        } else if (bar.l < ll) {
          if (condition === "C") {
            plantedBarsLeft = EXIT_HARNESS.maxHoldBars;
            plantedDirection = -1;
            plantedEvents.push({ segment: seg.id, index: bars.length - 1, side: "short", plantedR: driftPerBarR ?? 0 });
          }
        }
      }
      recent.push(bar);
      if (recent.length > 20) recent.shift();
    }
    // After a segment, the hole: no bars at all for the sealed year, and the
    // rolling window restarts so nothing crosses the boundary.
    recent.length = 0;
    plantedBarsLeft = 0;
    void holes;
  }

  return {
    bars,
    meta: {
      condition,
      seed,
      barsPerSegment,
      bars: bars.length,
      atrScale,
      start,
      driftPerBarR,
      segments: segYears.map((s) => ({ id: s.id, years: s.years })),
      sealedHoles: holes,
      plantedEvents: plantedEvents.length,
      plantedDriftPerBarPx: driftPerBarR ? driftPerBarR * EXIT_HARNESS.stopAtrMultiple * atrPx : 0,
      driftUnits: "R per bar, where 1R = stopAtrMultiple * ATR (frozen exit harness)",
      note:
        "Planted sizes are recorded HERE, by the generator. The verifier is never told them.",
    },
  };
}

/**
 * The EX-ANTE planted size for condition C, expressed as the true net R that the
 * generator intends a donchian-20 trade to earn. Used only to compare against
 * the measured value afterwards.
 *
 * A planted trade holds up to 96 bars at `driftPerBarR` R per bar, but it exits
 * early on the 2R target. So the intended GROSS is min(96*driftR, 2R) and the
 * intended NET subtracts the frozen baseline cost (~0.119R).
 */
export function intendedPlantedNetR(driftPerBarR, costR = 0.11897) {
  // driftPerBarR is R per bar, so a 96-bar hold accumulates 96 * driftPerBarR R.
  const gross = Math.min(EXIT_HARNESS.maxHoldBars * driftPerBarR, EXIT_HARNESS.targetR);
  return { grossR: gross, netR: gross - costR, driftPerBarR, cappedAtTarget: 96 * driftPerBarR >= EXIT_HARNESS.targetR };
}

/** The drift per bar (in R) that makes a 96-bar hold reach a target net R. */
export function driftForNetR(targetNetR, costR = 0.11897) {
  const gross = Math.min(targetNetR + costR, EXIT_HARNESS.targetR);
  return gross / EXIT_HARNESS.maxHoldBars;
}

/** Verdict state coverage sanity: what fraction of bars the Map will label. */
export const SYNTH_MAP_NOTE =
  "The synthetic worlds use the project's frozen MAP (ER 0.35 / ATR pctile 70). " +
  "Because the generator's volatility is stationary, most bars land in one ATR " +
  "regime; the rehearsal therefore tests the machinery, not the regime mix.";
void MAP;


/* ------------------------------------------------------------------ *
 * GENERATOR-SIDE CALIBRATION
 * ------------------------------------------------------------------ *
 * The drift a world needs depends on how long a trade actually survives, not on
 * the 96-bar cap: a barrier exit happens after ~20 bars, not 96. So the planted
 * size is calibrated on PILOT seeds that are disjoint from every scored world
 * (callers pass seeds >= 900000 and the scored seeds are < 300000).
 *
 * This function lives in the generator. The verifier is never told its result;
 * it only measures what comes out.
 */

/**
 * Calibrate the constant per-bar drift for condition B so that the matched
 * random control's LONG entries net approximately `targetNetR`.
 *
 * `measureLongNetR(drift)` must return the measured mean net R of long random
 * entries in a world built with that drift. It is supplied by the caller so this
 * module stays free of verification imports.
 */
export function calibrateConstantDrift(measureLongNetR, targetNetR, { iterations = 8, tol = 0.02 } = {}) {
  let drift = driftForNetR(targetNetR);
  const trace = [];
  for (let i = 0; i < iterations; i++) {
    const measured = measureLongNetR(drift);
    trace.push({ drift, measured });
    if (Math.abs(measured - targetNetR) < tol) break;
    // Response is close to linear in the drift for small drifts; damped update.
    const ratio = measured === 0 ? 3 : targetNetR / Math.max(measured, 1e-6);
    const next = drift * Math.min(Math.max(ratio, 0.2), 5);
    drift = drift * 0.3 + next * 0.7;
  }
  return { drift, trace, targetNetR };
}

/**
 * Calibrate the planted post-signal drift for condition C so that donchian-20
 * trades measure approximately `targetGrossR` GROSS (before costs).
 */
export function calibratePlantedDrift(measureDonchianGrossR, targetGrossR, { iterations = 8, tol = 0.02 } = {}) {
  let drift = driftForNetR(targetGrossR);
  const trace = [];
  for (let i = 0; i < iterations; i++) {
    const measured = measureDonchianGrossR(drift);
    trace.push({ drift, measured });
    if (Math.abs(measured - targetGrossR) < tol) break;
    const ratio = measured <= 0 ? 3 : targetGrossR / Math.max(measured, 1e-6);
    const next = drift * Math.min(Math.max(ratio, 0.2), 8);
    drift = drift * 0.3 + next * 0.7;
  }
  return { drift, trace, targetGrossR };
}
