/**
 * G0 AMENDMENT 8/9 — strict DEV-only SEGMENTS + matched 5x5 sweep (Method 1 & 2).
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * The sealed HOLDOUT years (2008, 2012, 2016, 2019) sit INSIDE the DEV date
 * span. Any component that reads a bar across one of those holes is reading a
 * sealed year without saying so. Amendment 8 therefore makes every non-DEV gap
 * a HARD boundary and rebuilds Map, signals, entries and the random control
 * inside each segment.
 *
 * THE RULES (verbatim from the frozen amendment, enforced here)
 * ------------------------------------------------------------
 *  1. A non-DEV gap is a segment boundary. The four DEV segments are
 *     DEV_SEGMENTS in frozen.mjs (2004-07, 2009-11, 2013-15, 2017-18).
 *  2. Per segment the UNCHANGED Map rules are recomputed from that segment's
 *     bars only; signal warm-up comes from that segment only.
 *  3. Entries are eligible only at local index >= SEGMENT_WARMUP_BARS (1000)
 *     AND with >= SEGMENT_TAIL_BARS (96) bars left in the SAME segment.
 *  4. A trade's year is its ENTRY year.
 *  5. One independent slot per card, UNCONDITIONAL (state does not gate
 *     entry); outcomes are binned by the verdict state at entry.
 *  6. No trade, warm-up bar, Map feature or baseline entry may read across a
 *     boundary.
 *
 * NOTHING IN THIS FILE CHANGES A FROZEN VALUE. It consumes MAP,
 * EXIT_HARNESS, ROLES, DEV_SEGMENTS and SWEEP_GRID from frozen.mjs and passes
 * their values through unchanged.
 */
import {
  MAP,
  ROLES,
  DEV_SEGMENTS,
  SEGMENT_WARMUP_BARS,
  SEGMENT_TAIL_BARS,
  SWEEP_GRID,
  VERDICT_STATE_OF,
  EXIT_HARNESS,
} from "../frozen.mjs";
import { computeFeatures, classify } from "./map.mjs";
import { emitSignals } from "./signals.mjs";

/** Verdict state of a four-state label, or null. Re-exported for convenience. */
export const verdictStateOf = (four) => VERDICT_STATE_OF[four] ?? null;

/**
 * Load-time consistency assertions. These make a silent divergence between the
 * segment exclusions and the frozen Map/exit constants impossible: if someone
 * later edits MAP.warmupBars or EXIT_HARNESS.maxHoldBars, this throws.
 */
export const SEGMENT_INVARIANTS = Object.freeze({
  warmupEqualsMapWarmup: SEGMENT_WARMUP_BARS === MAP.warmupBars,
  tailEqualsMaxHold: SEGMENT_TAIL_BARS === EXIT_HARNESS.maxHoldBars,
  segmentsCoverDevExactly:
    JSON.stringify(DEV_SEGMENTS.flatMap((s) => s.years).sort((a, b) => a - b)) ===
    JSON.stringify([...ROLES.DEV].sort((a, b) => a - b)),
  noSealedYearInAnySegment: DEV_SEGMENTS.every((s) =>
    s.years.every((y) => ROLES.DEV.includes(y) && !ROLES.HOLDOUT.includes(y)),
  ),
  gridCellsMatchDeclaration:
    SWEEP_GRID.erCutoffs.length * SWEEP_GRID.atrPctileCutoffs.length === SWEEP_GRID.cellCount,
  centerIsInGrid:
    SWEEP_GRID.erCutoffs.includes(SWEEP_GRID.center.erCutoff) &&
    SWEEP_GRID.atrPctileCutoffs.includes(SWEEP_GRID.center.atrPctileCutoff),
});
for (const [k, ok] of Object.entries(SEGMENT_INVARIANTS)) {
  if (!ok) throw new Error(`segment invariant failed at load: ${k}`);
}

/** Inclusive year of a `YYYY-MM-DD HH:MM:SS` bar datetime. */
export function yearOf(datetime) {
  return Number(String(datetime).slice(0, 4));
}

/**
 * Which segment (if any) owns this bar's year.
 * A bar whose year is not in any DEV segment — i.e. a SEALED year or VAL/STRESS
 * — belongs to NO segment and must never enter any computation.
 */
export function segmentIdOfYear(year) {
  for (const s of DEV_SEGMENTS) if (s.years.includes(year)) return s.id;
  return null;
}

/** True when `year` may be read at all (DEV only). */
export function isReadableYear(year) {
  return ROLES.DEV.includes(year) && !ROLES.HOLDOUT.includes(year);
}

/**
 * Split the full bar series into DEV-only segments.
 *
 * A new segment starts at the first DEV bar after any bar whose year is not the
 * Dev-year of that segment, and also whenever the calendar year advances into a
 * different Dev segment. Bars in sealed/VAL/STRESS years are DROPPED, not
 * carried: they are the holes, and nothing may read them.
 *
 * @returns {{segments: Array, dropped: {sealedBars:number, otherBars:number, holes:Array}}}
 */
export function splitSegments(bars) {
  const segments = [];
  const holes = [];
  let current = null;
  let droppedSealed = 0;
  let droppedOther = 0;

  const closeSegment = () => {
    if (current && current.bars.length) segments.push(current);
    current = null;
  };

  for (let g = 0; g < bars.length; g++) {
    const y = yearOf(bars[g].datetime);
    const devSeg = ROLES.DEV.includes(y) && !ROLES.HOLDOUT.includes(y) ? segmentIdOfYear(y) : null;

    if (devSeg === null) {
      // Sealed / VAL / STRESS year: a hard hole. Record it once per run.
      if (!holes.length || holes[holes.length - 1].year !== y) {
        holes.push({
          year: y,
          role: ROLES.HOLDOUT.includes(y)
            ? "HOLDOUT_SEALED"
            : ROLES.VAL.includes(y)
              ? "VAL"
              : ROLES.STRESS.includes(y)
                ? "STRESS"
                : "UNKNOWN",
          firstGlobalIndex: g,
          firstDatetime: bars[g].datetime,
        });
      }
      if (ROLES.HOLDOUT.includes(y)) droppedSealed++;
      else droppedOther++;
      closeSegment();
      continue;
    }

    if (!current || current.id !== devSeg) {
      closeSegment();
      const def = DEV_SEGMENTS.find((s) => s.id === devSeg);
      current = {
        id: devSeg,
        label: def.label,
        years: def.years,
        /** local index -> global index */
        globalIndex: [],
        bars: [],
      };
    }
    current.globalIndex.push(g);
    current.bars.push(bars[g]);
  }
  closeSegment();

  return {
    segments,
    dropped: { sealedBars: droppedSealed, otherBars: droppedOther, holes },
  };
}

/**
 * Entry eligibility window for a segment of `n` local bars.
 *
 *   firstEligible = SEGMENT_WARMUP_BARS              (warm-up never crosses)
 *   lastEligible  = n - 1 - SEGMENT_TAIL_BARS        (forward scan never crosses)
 *
 * Returns { first, last, eligible } where `eligible` is the count.
 */
export function eligibilityWindow(n) {
  const first = SEGMENT_WARMUP_BARS;
  const last = n - 1 - SEGMENT_TAIL_BARS;
  return { first, last, eligible: Math.max(0, last - first + 1) };
}

/**
 * Per-segment Map. The UNCHANGED rules from lib/map.mjs, applied to the
 * segment's own bars, so no trailing window can reach across a hole.
 */
export function segmentMap(segment, cfg = MAP) {
  const features = computeFeatures(segment.bars, cfg);
  const states = classify(features, cfg);
  return { features, states };
}

/**
 * Per-segment signals for ONE card, using that segment's own bars for warm-up.
 * Returns signals translated to GLOBAL bar indices, each tagged with its
 * segment id and the verdict state at entry.
 */
export function segmentSignals(segment, cardId, states, opts = {}) {
  const local = emitSignals(segment.bars, cardId, {
    states: states.map((s) => s.state),
    ...opts,
  });
  return local.map((s) => ({
    ...s,
    segmentId: segment.id,
    localIndex: s.index,
    index: segment.globalIndex[s.index],
    fourState: states[s.index].state,
    verdictState: verdictStateOf(states[s.index].state),
    year: yearOf(segment.bars[s.index].datetime),
    atr: Number.isFinite(segment.performance?.atrPlaceholder)
      ? segment.performance.atrPlaceholder
      : null, // filled by the caller from the segment features
    session: s.session,
  }));
}

/**
 * Build everything the verification needs from a raw bar array.
 * Returns one entry per segment with its Map, eligible window and stats.
 */
export function buildSegmentBundle(bars) {
  const { segments, dropped } = splitSegments(bars);
  return {
    dropped,
    segments: segments.map((seg) => {
      const { features, states } = segmentMap(seg);
      const win = eligibilityWindow(seg.bars.length);
      return {
        ...seg,
        features,
        states,
        window: win,
        barsPerYear: countYears(seg),
      };
    }),
  };
}

/** Bars per calendar year inside one segment. */
export function countYears(segment) {
  const out = {};
  for (const b of segment.bars) {
    const y = yearOf(b.datetime);
    out[y] = (out[y] ?? 0) + 1;
  }
  return out;
}

/**
 * Canonical sweep cell list for Method 2, in a fixed order so every artifact
 * and table is reproducible.
 */
export function sweepCells() {
  const cells = [];
  for (const erCutoff of SWEEP_GRID.erCutoffs) {
    for (const atrPctileCutoff of SWEEP_GRID.atrPctileCutoffs) {
      cells.push({
        erCutoff,
        atrPctileCutoff,
        isCenter:
          erCutoff === SWEEP_GRID.center.erCutoff &&
          atrPctileCutoff === SWEEP_GRID.center.atrPctileCutoff,
      });
    }
  }
  return cells;
}

export function sweepCellKey(cell) {
  return `${cell.erCutoff.toFixed(2)}|${cell.atrPctileCutoff}`;
}
