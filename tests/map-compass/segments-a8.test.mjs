/**
 * G0 AMENDMENT 8/9 — STAGE 2 unit tests for the segment machinery.
 *
 * Required by the amendment:
 *   (a) on synthetic data with no gaps, the segment Map equals the continuous
 *       Map after warm-up;
 *   (b) a sentinel bar placed in a hole (including a sealed year inside the DEV
 *       span) is never read by any component;
 *   (c) hand-computed trades: long, short, stop, target, time exit, gap-through,
 *       slot blocking;
 *   (d) causality.
 *
 * These tests contain NO real strategy result. They exercise structure only.
 */
import { readFileSync, existsSync } from "node:fs";
import { test, assert, assertEqual } from "../tiny.mjs";
import {
  MAP,
  ROLES,
  DEV_SEGMENTS,
  SEGMENT_WARMUP_BARS,
  SEGMENT_TAIL_BARS,
  SWEEP_GRID,
  EXIT_HARNESS,
  RANDOM_BASELINE,
} from "../../scripts/map-compass/frozen.mjs";
import {
  splitSegments,
  buildSegmentBundle,
  segmentMap,
  eligibilityWindow,
  yearOf,
  isReadableYear,
  segmentIdOfYear,
  sweepCells,
  SEGMENT_INVARIANTS,
} from "../../scripts/map-compass/lib/segments.mjs";
import {
  produceCardTrades,
  buildSegmentRandomControl,
  baselineCells,
  classifyWithCutoffs,
  binByVerdictState,
  sweepGrade,
} from "../../scripts/map-compass/lib/segmented.mjs";
import { computeFeatures, classify } from "../../scripts/map-compass/lib/map.mjs";
import { emitSignals } from "../../scripts/map-compass/lib/signals.mjs";
import { evaluateBook } from "../../scripts/map-compass/lib/trade.mjs";

const A = (p) => new URL(`../../artifacts/map-compass/${p}`, import.meta.url);
/** NaN-aware equality: two NaNs are the same "no value here". */
const sameNumber = (x, y) => (Number.isNaN(x) && Number.isNaN(y)) || x === y;
const json = (p) => JSON.parse(readFileSync(A(p), "utf8"));

/** Deterministic pseudo-random walk with a fixed ATR-ish scale. */
function walk(n, { start = 1000, seed = 12345, vol = 1.5, drift = 0 } = {}) {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const bars = [];
  let px = start;
  const t0 = Date.UTC(2013, 0, 2);
  for (let i = 0; i < n; i++) {
    const o = px;
    const c = o + (rnd() - 0.5) * 2 * vol + drift;
    const h = Math.max(o, c) + rnd() * vol * 0.5;
    const l = Math.min(o, c) - rnd() * vol * 0.5;
    const d = new Date(t0 + i * 30 * 60 * 1000);
    const p2 = (x) => String(x).padStart(2, "0");
    bars.push({
      datetime: `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:00`,
      o,
      h,
      l,
      c,
      v: 1,
    });
    px = c;
  }
  return bars;
}

/** Re-stamp bars into a chosen DEV year (keeps shape, changes year only). */
function stampYear(bars, year, startMonth = 0) {
  const t0 = Date.UTC(year, startMonth, 2);
  const p2 = (x) => String(x).padStart(2, "0");
  return bars.map((b, i) => {
    const d = new Date(t0 + i * 30 * 60 * 1000);
    return {
      ...b,
      datetime: `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:00`,
    };
  });
}

// ---------------------------------------------------------------------------
// Constants: the permitted additions are internally consistent and changed
// nothing that was frozen before them.
// ---------------------------------------------------------------------------
test("A8: segment constants are consistent and no pre-existing frozen value moved", () => {
  assert(SEGMENT_INVARIANTS.warmupEqualsMapWarmup, "SEGMENT_WARMUP_BARS must equal MAP.warmupBars");
  assert(SEGMENT_INVARIANTS.tailEqualsMaxHold, "SEGMENT_TAIL_BARS must equal EXIT_HARNESS.maxHoldBars");
  assert(SEGMENT_INVARIANTS.segmentsCoverDevExactly, "segments must cover ROLES.DEV exactly");
  assert(SEGMENT_INVARIANTS.noSealedYearInAnySegment, "no sealed year may appear in a segment");
  assert(SEGMENT_INVARIANTS.gridCellsMatchDeclaration, "grid must have 25 cells");
  assert(SEGMENT_INVARIANTS.centerIsInGrid, "the frozen centre must be a grid cell");
  assertEqual(SEGMENT_WARMUP_BARS, 1000);
  assertEqual(SEGMENT_TAIL_BARS, 96);
  assertEqual(DEV_SEGMENTS.length, 4);
  assertEqual(sweepCells().length, 25);
  // The original frozen values are untouched.
  assertEqual(MAP.erCutoff, 0.35);
  assertEqual(MAP.atrPctileCutoff, 70);
  assertEqual(MAP.warmupBars, 1000);
  assertEqual(MAP.hysteresisBars, 3);
  assertEqual(MAP.abstainBandPct, 10);
  assertEqual(EXIT_HARNESS.stopAtrMultiple, 1.5);
  assertEqual(EXIT_HARNESS.targetR, 2);
  assertEqual(EXIT_HARNESS.maxHoldBars, 96);
  assertEqual(SWEEP_GRID.center.erCutoff, MAP.erCutoff);
  assertEqual(SWEEP_GRID.center.atrPctileCutoff, MAP.atrPctileCutoff);
});

test("A8: sealed years are unreachable, DEV years map to exactly one segment", () => {
  for (const y of ROLES.HOLDOUT) {
    assert(!isReadableYear(y), `${y} is sealed and must not be readable`);
    assertEqual(segmentIdOfYear(y), null, `${y} must belong to no segment`);
  }
  for (const y of [...ROLES.VAL, ...ROLES.STRESS]) {
    assert(!isReadableYear(y), `${y} is ${ROLES.VAL.includes(y) ? "VAL" : "STRESS"} and must not be readable`);
    assertEqual(segmentIdOfYear(y), null);
  }
  for (const y of ROLES.DEV) {
    assert(isReadableYear(y), `${y} must be readable`);
    const hits = DEV_SEGMENTS.filter((s) => s.years.includes(y));
    assertEqual(hits.length, 1, `DEV year ${y} must belong to exactly one segment`);
  }
});

// ---------------------------------------------------------------------------
// (a) No-gap synthetic data: segmented Map == continuous Map after warm-up.
// ---------------------------------------------------------------------------
test("A8 (a): with no gaps the segment Map equals the continuous Map after warm-up", () => {
  const bars = stampYear(walk(6000, { seed: 999, vol: 2 }), 2013);
  const { segments } = splitSegments(bars);
  assertEqual(segments.length, 1, "a single DEV year is a single segment");
  const seg = segments[0];
  assertEqual(seg.bars.length, bars.length, "no bar may be dropped when there is no hole");

  const cont = computeFeatures(bars, MAP);
  const contStates = classify(cont, MAP);
  const segMap = segmentMap(seg, MAP);

  // Compare only after warm-up: both use identical trailing windows from index
  // MAP.warmupBars onward when the segment starts at bar 0.
  let compared = 0;
  let mismatches = 0;
  for (let i = MAP.warmupBars; i < bars.length; i++) {
    compared++;
    if (segMap.states[i].state !== contStates[i].state) mismatches++;
    if (Math.abs(segMap.features[i].er - cont[i].er) > 1e-12) mismatches++;
    if (Math.abs(segMap.features[i].atrPctile - cont[i].atrPctile) > 1e-12) mismatches++;
  }
  assert(compared > 4000, `expected a real comparison, got ${compared} bars`);
  assertEqual(mismatches, 0, "segment Map must be identical to the continuous Map after warm-up");
});

test("A8 (a): a gap-free multi-segment split behaves like independent series", () => {
  // Two segments of DIFFERENT DEV years, no sealed year between them.
  const a = stampYear(walk(3000, { seed: 1 }), 2009);
  const b = stampYear(walk(3000, { seed: 2 }), 2013);
  const { segments } = buildSegmentBundle([...a, ...b]);
  assertEqual(segments.length, 2, "a segment change must start a new segment");
  assertEqual(segments[0].bars.length, 3000);
  assertEqual(segments[1].bars.length, 3000);
  // The second segment's features must be identical to computing it alone.
  const alone = computeFeatures(b, MAP);
  const inBundle = segments[1];
  for (let i = MAP.warmupBars; i < 3000; i++) {
    assert(sameNumber(inBundle.features[i].er, alone[i].er), `bar ${i} er must not see segment 1`);
    assert(sameNumber(inBundle.features[i].atrPctile, alone[i].atrPctile), `bar ${i} atrPctile must not see segment 1`);
  }
});

// ---------------------------------------------------------------------------
// (b) SENTINEL: a bar placed in a hole is never read by any component.
// ---------------------------------------------------------------------------
test("A8 (b): a sentinel bar in a SEALED year inside the DEV span is never read", () => {
  const SENTINEL_C = 999999; // impossible price: any read is detectable
  const pre = stampYear(walk(2500, { seed: 11 }), 2011, 0);
  const post = stampYear(walk(2500, { seed: 12 }), 2013, 0);
  // A sealed 2012 bar carrying the sentinel value, exactly where the hole is.
  const sentinel = {
    datetime: "2012-06-15 10:00:00",
    o: SENTINEL_C,
    h: SENTINEL_C + 1,
    l: SENTINEL_C - 1,
    c: SENTINEL_C,
    v: 1,
  };
  const bars = [...pre, sentinel, ...post];
  const sentinelGlobalIndex = pre.length;

  const bundle = buildSegmentBundle(bars);

  // 1. It belongs to no segment.
  for (const seg of bundle.segments) {
    assert(!seg.globalIndex.includes(sentinelGlobalIndex), "sentinel must not enter a segment");
    assert(!seg.bars.some((b) => b.c === SENTINEL_C), "sentinel close must never appear in segment bars");
  }
  assertEqual(bundle.dropped.sealedBars, 1, "the sealed sentinel bar must be counted as dropped");
  assert(
    bundle.dropped.holes.some((h) => h.year === 2012 && h.role === "HOLDOUT_SEALED"),
    "the hole must be recorded as a sealed year",
  );

  // 2. No feature anywhere equals or exceeds the sentinel price.
  for (const seg of bundle.segments) {
    for (let i = 0; i < seg.features.length; i++) {
      const f = seg.features[i];
      assert(f.close < SENTINEL_C / 2, `feature close at segment ${seg.id} bar ${i} read the sentinel`);
      assert(!Number.isFinite(f.gapPct) || Math.abs(f.gapPct) < 100, `gapPct read the sentinel at ${seg.id} ${i}`);
    }
  }

  // 3. No signal is emitted at or around the sentinel in global index terms.
  for (const id of ["donchian-20", "sma-20-50", "inside-bar-break"]) {
    const res = produceCardTrades(bundle, { id, priority: 1 }, (b, c, o) => emitSignals(b, c, o));
    for (const t of res.trades) {
      assert(t.entryIndex >= 0 && t.entryIndex < 5000, "trade index must be local, never the sentinel");
    }
  }

  // 4. The random control never draws the sentinel: every pool bar is a segment bar.
  const ctrl = buildSegmentRandomControl(bundle, { entriesPerCellPerSide: 200 });
  assert(ctrl.entries.length > 0, "control must produce entries");
  for (const e of ctrl.entries) {
    const seg = bundle.segments.find((s) => s.id === e.segmentId);
    assert(e.localIndex >= seg.window.first && e.localIndex <= seg.window.last, "control entry outside window");
  }

  // 5. The two segments never see each other: the 2013 segment's first bar is
  //    the post array's first bar, so its prior-close lookback cannot reach 2011.
  const s2 = bundle.segments.find((s) => s.id === "S3");
  assert(s2, "the 2013 segment must exist");
  assertEqual(s2.bars[0].c, post[0].c, "segment 2 must start at its own first bar");
  assertEqual(s2.features[0].gapPct, 0, "the first bar of a segment has no cross-boundary gap");
});

test("A8 (b): a sentinel in a NON-sealed hole (VAL/STRESS year) is also never read", () => {
  const SENT = 888888;
  const pre = stampYear(walk(2000, { seed: 21 }), 2013);
  const post = stampYear(walk(2000, { seed: 22 }), 2017);
  const valBar = { datetime: "2022-03-01 05:00:00", o: SENT, h: SENT + 1, l: SENT - 1, c: SENT, v: 1 };
  const bundle = buildSegmentBundle([...pre, valBar, ...post]);
  assertEqual(bundle.dropped.otherBars, 1, "the VAL sentinel must be counted as dropped");
  for (const seg of bundle.segments)
    for (const f of seg.features) assert(f.close < SENT / 2, "no feature may read the VAL sentinel");
  assertEqual(bundle.segments.length, 2);
});

// ---------------------------------------------------------------------------
// (c) HAND-COMPUTED TRADES via the one-slot producer and the frozen resolver.
// ---------------------------------------------------------------------------
/** A flat scaffold long enough to hold a 1,000-bar warm-up plus a trade. */
function scaffold(n = 1200) {
  const bars = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2013, 0, 2) + i * 30 * 60 * 1000);
    const p2 = (x) => String(x).padStart(2, "0");
    bars.push({
      datetime: `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:00`,
      o: 1000,
      h: 1000.5,
      l: 999.5,
      c: 1000,
      v: 1,
    });
  }
  return bars;
}

test("A8 (c): hand-computed LONG — stop, target, gap-through and time exit", () => {
  const base = scaffold();
  const atr = 2; // stop distance = 1.5*2 = 3R in price; target = +6
  const mk = (i, bars0) => {
    const b = [...base];
    Object.assign(b[i], bars0);
    return b;
  };
  const run = (bars, entryIdx, side = "long") => {
    const segLike = { id: "S1", globalIndex: bars.map((_, k) => k), bars, features: bars.map(() => ({ atr })), states: bars.map(() => ({ state: "GRIND" })), window: { first: 0, last: bars.length - 1, eligible: bars.length } };
    return produceCardTrades({ segments: [segLike] }, { id: "x", priority: 1 }, (bs, cid, o) => [{ index: entryIdx, side, session: "ny", atr }]);
  };

  // TARGET: +6 from entry 1000 -> TP at 2R.
  let bars = mk(500, { o: 1000, h: 1003, l: 999, c: 1000 }); // entry bar
  bars[501] = { ...bars[501], o: 1000, h: 1006.5, l: 999.9, c: 1006 };
  let r = run(bars, 500);
  assertEqual(r.trades.length, 1);
  assertEqual(r.trades[0].outcome, "TP");
  assert(Math.abs(r.trades[0].grossR - 2) < 0.01, `TP must be +2R gross, got ${r.trades[0].grossR}`);

  // STOP: -3 from entry 1000 -> 997.
  bars = mk(500, { o: 1000, h: 1001, l: 999, c: 1000 });
  bars[501] = { ...bars[501], o: 1000, h: 1000.2, l: 996.9, c: 997 };
  r = run(bars, 500);
  assertEqual(r.trades[0].outcome, "SL");
  assert(Math.abs(r.trades[0].grossR + 1) < 0.01, `SL must be -1R gross, got ${r.trades[0].grossR}`);

  // GAP-THROUGH: the next bar OPENS below the stop -> fill at the open, worse than -1R.
  bars = mk(500, { o: 1000, h: 1001, l: 999, c: 1000 });
  bars[501] = { ...bars[501], o: 994, h: 994.5, l: 993, c: 994 };
  r = run(bars, 500);
  assertEqual(r.trades[0].outcome, "SL");
  assert(r.trades[0].grossR < -1.5, `gap fill must be worse than -1R, got ${r.trades[0].grossR}`);

  // SHORT target: mirror.
  bars = mk(500, { o: 1000, h: 1001, l: 999, c: 1000 });
  bars[501] = { ...bars[501], o: 1000, h: 1000.1, l: 993.4, c: 994 };
  r = run(bars, 500, "short");
  assertEqual(r.trades[0].outcome, "TP");
  assert(Math.abs(r.trades[0].grossR - 2) < 0.01, `short TP must be +2R, got ${r.trades[0].grossR}`);

  // TIME EXIT: nothing is hit for 96 bars -> closed at the cap bar's close.
  bars = scaffold();
  r = run(bars, 500);
  assertEqual(r.trades[0].outcome, "TIME_EXIT");
  assertEqual(r.trades[0].barsHeld, EXIT_HARNESS.maxHoldBars);
});

test("A8 (c): SLOT BLOCKING — one slot per card drops the overlapping signal", () => {
  const bars = scaffold();
  // A long that stops out at bar 505, and a second signal at 503 (inside the hold).
  bars[503] = { ...bars[503], o: 1000, h: 1000.2, l: 996.9, c: 997 };
  const segLike = { id: "S1", globalIndex: bars.map((_, k) => k), bars, features: bars.map(() => ({ atr: 2 })), states: bars.map(() => ({ state: "GRIND" })), window: { first: 0, last: bars.length - 1, eligible: bars.length } };
  const sig = [
    { index: 500, side: "long", session: "ny", atr: 2 },
    { index: 501, side: "long", session: "ny", atr: 2 },
    { index: 503, side: "short", session: "ny", atr: 2 },
  ];
  const r = produceCardTrades({ segments: [segLike] }, { id: "x", priority: 1 }, () => sig);
  assertEqual(r.trades.length, 1, "only the first signal may fill the slot");
  assertEqual(r.trades[0].entryIndex, 500);
  assertEqual(r.rejected.slot, 2, "both overlapping signals must be dropped, not queued");
});

test("A8 (c): a trade may never resolve past the segment tail", () => {
  const bars = scaffold(1200);
  const n = bars.length;
  const segLike = { id: "S1", globalIndex: bars.map((_, k) => k), bars, features: bars.map(() => ({ atr: 2 })), states: bars.map(() => ({ state: "GRIND" })), window: eligibilityWindow(n) };
  // A signal exactly at the last eligible bar is allowed; one bar later is not.
  const lastEligible = segLike.window.last;
  const allowed = produceCardTrades({ segments: [segLike] }, { id: "x", priority: 1 }, () => [
    { index: lastEligible, side: "long", session: "ny", atr: 2 },
  ]);
  assertEqual(allowed.trades.length, 1, "the last eligible bar may trade");
  const t = allowed.trades[0];
  assert(t.entryIndex + t.barsHeld <= n - 1, "resolution must stay inside the segment");

  const tooLate = produceCardTrades({ segments: [segLike] }, { id: "x", priority: 1 }, () => [
    { index: lastEligible + 1, side: "long", session: "ny", atr: 2 },
  ]);
  assertEqual(tooLate.trades.length, 0, "a signal in the tail must be rejected");
  assertEqual(tooLate.rejected.window, 1);
});

test("A8 (c): the eligibility window is exactly [1000, n-1-96]", () => {
  for (const n of [1097, 2000, 39448, 23465]) {
    const w = eligibilityWindow(n);
    assertEqual(w.first, 1000);
    assertEqual(w.last, n - 1 - 96);
    assertEqual(w.eligible, n - 96 - 1000);
  }
  assertEqual(eligibilityWindow(1000).eligible, 0, "a segment shorter than warm-up+tail has no eligible bar");
});

// ---------------------------------------------------------------------------
// (d) CAUSALITY
// ---------------------------------------------------------------------------
test("A8 (d): mutating the future never changes a past segment state or signal", () => {
  const bars = stampYear(walk(3000, { seed: 77, vol: 2 }), 2013);
  const bundle1 = buildSegmentBundle(bars);
  const cut = 2200;

  // Mutate every bar after `cut` violently.
  const mutated = bars.map((b, i) =>
    i <= cut ? b : { ...b, o: b.o * 3, h: b.h * 3, l: b.l * 3, c: b.c * 3 },
  );
  const bundle2 = buildSegmentBundle(mutated);

  const s1 = bundle1.segments[0];
  const s2 = bundle2.segments[0];
  for (let i = 0; i <= cut; i++) {
    assertEqual(s1.states[i].state, s2.states[i].state, `state at ${i} must be causal`);
    assert(sameNumber(s1.features[i].er, s2.features[i].er), `er at ${i} must be causal (${s1.features[i].er} vs ${s2.features[i].er})`);
    assert(sameNumber(s1.features[i].atrPctile, s2.features[i].atrPctile), `atrPctile at ${i} must be causal`);
  }

  for (const id of ["donchian-20", "rsi-14-30-70", "nr7-break"]) {
    const a = emitSignals(s1.bars, id, { states: s1.states.map((x) => x.state) });
    const b = emitSignals(s2.bars, id, { states: s2.states.map((x) => x.state) });
    const pa = a.filter((x) => x.index <= cut).map((x) => `${x.index}|${x.side}`);
    const pb = b.filter((x) => x.index <= cut).map((x) => `${x.index}|${x.side}`);
    assertEqual(JSON.stringify(pa), JSON.stringify(pb), `${id} signals must be causal`);
  }
});

test("A8 (d): a later segment's presence never changes an earlier segment", () => {
  const s1bars = stampYear(walk(2500, { seed: 41 }), 2013);
  const s2bars = stampYear(walk(2500, { seed: 42 }), 2017);
  const onlyFirst = buildSegmentBundle(s1bars);
  const both = buildSegmentBundle([...s1bars, ...s2bars]);
  const a = onlyFirst.segments.find((s) => s.id === "S3");
  const b = both.segments.find((s) => s.id === "S3");
  assertEqual(a.bars.length, b.bars.length);
  for (let i = 0; i < a.bars.length; i++) {
    assertEqual(a.states[i].state, b.states[i].state, `state ${i} must not depend on a later segment`);
  }
});

// ---------------------------------------------------------------------------
// Sweep mechanics
// ---------------------------------------------------------------------------
test("A8: the sweep centre reproduces the frozen Map exactly; off-centre cells move only the cutoffs", () => {
  const bars = stampYear(walk(4000, { seed: 55, vol: 2 }), 2013);
  const features = computeFeatures(bars, MAP);
  const frozen = classify(features, MAP);

  const atCentre = classifyWithCutoffs(features, SWEEP_GRID.center.erCutoff, SWEEP_GRID.center.atrPctileCutoff);
  let diff = 0;
  for (let i = 0; i < frozen.length; i++) if (frozen[i].state !== atCentre[i]) diff++;
  assertEqual(diff, 0, "the centre cell must reproduce classify() exactly");

  // Off-centre: the labels must actually change (otherwise the sweep is inert),
  // and no label may leave the frozen four-state set plus UNKNOWN.
  let moved = 0;
  for (const cell of sweepCells().filter((c) => !c.isCenter)) {
    const alt = classifyWithCutoffs(features, cell.erCutoff, cell.atrPctileCutoff);
    for (let i = 0; i < alt.length; i++) {
      assert(["EXPANSION", "GRIND", "WHIPSAW", "QUIET", "UNKNOWN"].includes(alt[i]), `bad label ${alt[i]}`);
      if (alt[i] !== frozen[i].state) moved++;
    }
  }
  assert(moved > 100, `off-centre cells must move labels, moved only ${moved}`);
});

test("A8: a cell with no baseline yields no verdict, never a zero fallback", () => {
  const cells = baselineCells([], 200);
  assertEqual(Object.keys(cells.fineCellsVerdictState).length, 0, "empty control -> no cells, not zeros");
});

// ---------------------------------------------------------------------------
// Structural guard: the Stage 2 report must exist and contain no verdict.
// ---------------------------------------------------------------------------
test("A8: the Stage 2 report exists, is DEV-only in its readable counts, and holds no strategy result", () => {
  if (!existsSync(A("a8/segments.json"))) {
    // Passing without the artifact would hide a missing build; assert instead.
    assert(false, "run node scripts/map-compass/a8-segments-report.mjs first (artifacts/map-compass/a8/segments.json)");
  }
  const r = json("a8/segments.json");
  assertEqual(r.strategyResults, "NONE — this report contains no trade outcome or verdict");
  assert(!("verdict" in r), "a Stage 2 build report must not carry a verdict");
  assert(!("trades" in r), "a Stage 2 build report must not carry trades");

  // Readable bars must be DEV only.
  for (const row of r.yearTable) {
    if (row.role === "DEV") assert(row.barsReadable > 0, `DEV year ${row.year} must be readable`);
    else assertEqual(row.barsReadable, 0, `${row.role} year ${row.year} must never be readable`);
  }
  // Counts that must sum.
  const segSum = r.segmentTable.reduce((a, s) => a + s.bars, 0);
  assertEqual(segSum, r.totals.readableDevBars, "segment bars must sum to the readable DEV total");
  const eligSum = r.segmentTable.reduce((a, s) => a + s.eligibleBars, 0);
  const lossSum = r.losses.reduce((a, l) => a + l.eligible, 0);
  assertEqual(eligSum, lossSum, "eligible bars must agree between the two tables");
  for (const l of r.losses) {
    assertEqual(l.bars - l.ineligible, l.eligible, "bars - ineligible must equal eligible");
    assert(l.eligiblePct > 0 && l.eligiblePct <= 100, "eligibility share must be inside (0,100]");
  }
  // Sealed months are declared.
  assertEqual(r.spreadMonths.inSealedYears.length, 3);
  assertEqual(r.spreadMonths.total, 44);
  // Every segment covers only DEV years.
  for (const s of r.segmentTable)
    for (const y of s.years.split(", ").map(Number)) assert(ROLES.DEV.includes(y) && !ROLES.HOLDOUT.includes(y));
});

// ---------------------------------------------------------------------------
// Binning and matched-control top-up (frozen A4 method, re-derived per cell)
// ---------------------------------------------------------------------------
test("A8: verdict binning keeps UNKNOWN entries visible and the bins sum to the book", () => {
  const trades = [
    { verdictState: "EFFICIENT", netR: 1 },
    { verdictState: "EFFICIENT", netR: -1 },
    { verdictState: "CHOPPY", netR: 0.5 },
    { verdictState: null, netR: 2 },
    { verdictState: "UNKNOWN", netR: -0.5 },
  ];
  const b = binByVerdictState(trades);
  assertEqual(b.EFFICIENT.length, 2, "EFFICIENT bin");
  assertEqual(b.CHOPPY.length, 1, "CHOPPY bin");
  assertEqual(b.unknownCount, 2, "UNKNOWN/blank entries are counted, never silently dropped");
  assertEqual(b.EFFICIENT.length + b.CHOPPY.length + b.unknownCount, trades.length, "bins must sum to the book");
  assert(b.unknownShare >= 0 && b.unknownShare <= 1, "share must be a fraction");
  assertEqual(b.unknownShare, 0.4);
});

test("A8: the control top-up reaches the frozen minimum and never invents a cell", () => {
  // A tiny synthetic pool: 5 entries in one cell, nothing in the others.
  const pool = Array.from({ length: 5 }, (_, i) => ({
    segmentId: "S1",
    localIndex: i,
    session: "ny",
    vol: "mid",
    verdictState: "EFFICIENT",
    year: 2013,
  }));
  const base = pool.map((p) => ({ ...p, side: "long", netR: 0.5 }));
  const res = baselineCells(base, 200, {
    poolOf: (vs, side, session, vol) =>
      vs === "EFFICIENT" && side === "long" && session === "ny" && vol === "mid" ? pool : [],
    perDraw: () => 0.5,
  });
  const filled = res.fineCellsVerdictState["EFFICIENT|long|ny|mid"];
  assertEqual(filled.n, 200, "a reachable cell must be topped up to exactly the frozen minimum");
  assertEqual(filled.sufficient, true);
  assertEqual(res.topup.entriesAdded, 195, "195 draws must be recorded");
  assert(res.topup.cellsUnreachable.length >= 1, "unreachable cells must be listed, not invented");
  // An unreachable cell must not appear as a usable cell.
  const missing = res.fineCellsVerdictState["CHOPPY|short|london|low"];
  assertEqual(missing, undefined, "an unreachable cell must be absent, never a zero");
});

test("A8: the sweep grade follows the frozen thresholds and is undefined off-centre", () => {
  const mk = (confirmedCount) => {
    const rows = [];
    let i = 0;
    for (const cell of sweepCells()) {
      rows.push({
        cell,
        key: "k",
        verdictState: "EFFICIENT",
        confirmed: i++ < confirmedCount,
      });
    }
    return rows;
  };
  // Not confirmed at centre -> no grade at all.
  assertEqual(sweepGrade(mk(25), "EFFICIENT", "REFUTED").defined, false);
  // 25/25 -> ROBUST (>=80%)
  assertEqual(sweepGrade(mk(25), "EFFICIENT", "CONFIRMED").grade, "ROBUST");
  // 20/25 = 80% -> ROBUST (>= boundary)
  assertEqual(sweepGrade(mk(20), "EFFICIENT", "CONFIRMED").grade, "ROBUST");
  // 19/25 = 76% -> FRAGILE
  assertEqual(sweepGrade(mk(19), "EFFICIENT", "CONFIRMED").grade, "FRAGILE");
  // 13/25 = 52% -> FRAGILE (>= 50)
  assertEqual(sweepGrade(mk(13), "EFFICIENT", "CONFIRMED").grade, "FRAGILE");
  // 12/25 = 48% -> DEFINITION_SENSITIVE
  assertEqual(sweepGrade(mk(12), "EFFICIENT", "CONFIRMED").grade, "DEFINITION_SENSITIVE");
  assertEqual(sweepGrade(mk(0), "EFFICIENT", "CONFIRMED").grade, "DEFINITION_SENSITIVE");
});

test("A8: no claim-verification artifact may exist at Stage 2", () => {
  assert(!existsSync(A("claim-verification.json")), "no real strategy result may exist yet");
  assert(!existsSync(A("claimed-trades.jsonl")), "no claimed trade stream may exist yet");
  assert(!existsSync(A("a8/claim-verification.json")), "no A8 verdict may exist yet");
});
