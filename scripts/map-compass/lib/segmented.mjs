/**
 * G0 AMENDMENT 8/9 — A8 VERIFICATION ENGINE (Method 1 + Method 2).
 *
 * Produces, from a raw bar array:
 *   1. per-card, per-segment ONE-SLOT trade books (unconditional entry),
 *   2. a matched random-entry control built on the SAME segment boundaries,
 *      SAME eligibility window, SAME frozen costs and SAME frozen exit harness,
 *   3. the 25-cell sweep re-binning of both, with the UNCHANGED CONFIRMED rule
 *      applied per cell and the grade computed for claims CONFIRMED at the
 *      frozen centre.
 *
 * IT CHANGES NOTHING FROZEN. Every constant is imported from frozen.mjs.
 * It deliberately does NOT import CLAIM_CRITERIA or invent thresholds: the
 * verdict itself is produced by lib/verification.mjs (verifyClaim), untouched.
 */
import {
  MAP,
  ROLES,
  STATES,
  VERDICT_STATE_OF,
  RANDOM_BASELINE,
  SWEEP_GRID,
  SENSITIVITY_RULE,
} from "../frozen.mjs";
import { rawStateOf, classify } from "./map.mjs";
import { resolveTrade } from "./trade.mjs";
import { volRegimeOf } from "./cost.mjs";
import { mulberry32 } from "./placebo.mjs";
import { verifyClaim } from "./verification.mjs";
import {
  buildSegmentBundle,
  eligibilityWindow,
  yearOf,
  sweepCells,
  sweepCellKey,
  verdictStateOf,
} from "./segments.mjs";

/* ------------------------------------------------------------------ *
 * 1. ONE-SLOT TRADE PRODUCTION (Method 1)
 * ------------------------------------------------------------------ */

/**
 * Produce the one-slot trade book for ONE card across all DEV segments.
 *
 * - Signals come from the segment's own bars (warm-up never crosses a hole).
 * - A signal is a candidate only inside the segment's eligibility window
 *   [SEGMENT_WARMUP_BARS, n-1-SEGMENT_TAIL_BARS].
 * - The slot is the card's own slot. Entry is UNCONDITIONAL: the Map state does
 *   not gate entry. The state at entry is recorded for binning and reported as
 *   a diagnostic.
 * - Exits resolve inside the same segment (guaranteed by the tail rule).
 *
 * @param bundle   output of buildSegmentBundle()
 * @param card     { id, priority }
 * @param signalFn (segmentBars, cardId, {states}) => raw local signals
 */
export function produceCardTrades(bundle, card, signalFn) {
  const trades = [];
  const rejected = { slot: 0, window: 0, invalidAtr: 0 };
  const perSegment = [];

  for (const seg of bundle.segments) {
    const raw = signalFn(seg.bars, card.id, { states: seg.states.map((s) => s.state) });
    const { first, last } = seg.window;

    // Keep only in-window candidates, then resolve with the card's own slot.
    const cands = [];
    for (const s of raw) {
      if (s.index < first || s.index > last) {
        rejected.window++;
        continue;
      }
      const atr = seg.features[s.index].atr;
      if (!Number.isFinite(atr) || atr <= 0) {
        rejected.invalidAtr++;
        continue;
      }
      cands.push({ ...s, atr });
    }
    cands.sort((a, b) => a.index - b.index);

    let occupiedUntil = -1;
    const kept = [];
    for (const s of cands) {
      if (s.index <= occupiedUntil) {
        rejected.slot++;
        continue;
      }
      const bar = seg.bars[s.index];
      const costs = { session: s.session, vol: volRegimeOf(bar), variant: "baseline" };
      const t = resolveTrade(seg.bars, s.index, s.side, s.atr, {
        session: costs.session,
        vol: costs.vol,
        variant: "baseline",
        maxBars: RANDOM_BASELINE.maxHoldBars,
      });
      if (t.outcome === "INVALID_ATR") {
        rejected.invalidAtr++;
        continue;
      }
      occupiedUntil = t.exitIndex;
      kept.push({
        cardId: card.id,
        priority: card.priority,
        segmentId: seg.id,
        side: s.side,
        year: yearOf(bar.datetime),
        day: String(bar.datetime).slice(0, 10),
        session: costs.session,
        vol: costs.vol,
        state: seg.states[s.index].state, // four-state at entry (diagnostic)
        verdictState: verdictStateOf(seg.states[s.index].state),
        netR: t.netR,
        grossR: t.grossR,
        costR: t.costR,
        outcome: t.outcome,
        barsHeld: t.barsHeld,
        entryIndex: s.index,
      });
    }

    perSegment.push({
      segmentId: seg.id,
      signalsRaw: raw.length,
      signalsInWindow: cands.length,
      trades: kept.length,
    });
    trades.push(...kept);
  }

  return { cardId: card.id, trades, rejected, perSegment };
}

/* ------------------------------------------------------------------ *
 * 2. MATCHED RANDOM-ENTRY CONTROL (Method 1)
 * ------------------------------------------------------------------ */

/**
 * Random-entry control inside the SAME segments.
 *
 * Candidates are the segment bars inside the eligibility window — the identical
 * set a signal could use. Entries are drawn per (four-state, side) with the
 * frozen seed and the frozen 4,000-per-cell-per-side count, resolved by the
 * identical harness. Draws are NOT filtered to the modelled state after the
 * fact: each draw is one random entry, exactly as the pre-A8 control did.
 *
 * Every entry carries its segment features so the sweep can re-bin it.
 *
 * @returns {{ entries: Array, cells: Object, poolSize: Object }}
 */
export function buildSegmentRandomControl(bundle, opts = {}) {
  const perCell = opts.entriesPerCellPerSide ?? RANDOM_BASELINE.entriesPerCellPerSide;
  const seed = opts.seed ?? RANDOM_BASELINE.seed;

  // Candidate pools per (four-state, side): in-window segment bars.
  const barsByState = new Map(); // state -> [{segId,i,atr,session,vol,state}]
  for (const seg of bundle.segments) {
    const { first, last } = seg.window;
    for (let i = first; i <= last; i++) {
      const atr = seg.features[i].atr;
      if (!Number.isFinite(atr) || atr <= 0) continue;
      const st = seg.states[i].state;
      if (!STATES.includes(st)) continue; // UNKNOWN -> flat, never a candidate
      const bar = seg.bars[i];
      if (!barsByState.has(st)) barsByState.set(st, []);
      barsByState.get(st).push({
        segId: seg.id,
        i,
        atr,
        session: seg.features[i].session,
        vol: volRegimeOf(bar),
        state: st,
      });
    }
  }
  // Two independent pools per state so a draw cannot correlate sides.
  const pools = new Map();
  const poolSize = {};
  for (const [st, barsOfState] of barsByState) {
    for (const side of ["long", "short"]) {
      const k = `${st}|${side}`;
      pools.set(k, barsOfState.map((b) => ({ ...b, side })));
      poolSize[k] = barsOfState.length;
    }
  }

  const rng = mulberry32(seed);
  const entries = [];
  const diagnostics = { TP: 0, SL: 0, TIME_EXIT: 0, INVALID_ATR: 0, ambiguous: 0 };

  for (const state of STATES) {
    for (const side of ["long", "short"]) {
      const pool = pools.get(`${state}|${side}`) ?? [];
      if (!pool.length) continue;
      const n = Math.min(perCell, pool.length);
      for (let s = 0; s < n; s++) {
        const pick = pool[Math.floor(rng() * pool.length)];
        const seg = bundle.segments.find((x) => x.id === pick.segId);
        const t = resolveTrade(seg.bars, pick.i, side, pick.atr, {
          session: pick.session,
          vol: pick.vol,
          variant: "baseline",
          maxBars: RANDOM_BASELINE.maxHoldBars,
        });
        diagnostics[t.outcome] = (diagnostics[t.outcome] ?? 0) + 1;
        if (t.ambiguousFallback) diagnostics.ambiguous++;
        if (t.outcome === "INVALID_ATR") continue;
        entries.push({
          segmentId: pick.segId,
          localIndex: pick.i,
          side,
          session: pick.session,
          vol: pick.vol,
          state: pick.state,
          verdictState: VERDICT_STATE_OF[pick.state],
          year: yearOf(seg.bars[pick.i].datetime),
          day: String(seg.bars[pick.i].datetime).slice(0, 10),
          netR: t.netR,
          grossR: t.grossR,
          outcome: t.outcome,
          barsHeld: t.barsHeld,
        });
      }
    }
  }

  return { entries, diagnostics, poolSize, perCell, seed };
}

/**
 * Aggregate random entries into verdict-state fine cells, replicating the
 * FROZEN Amendment 4 top-up method inside segments:
 *   - base draws contribute first,
 *   - every one of the 36 (verdictState|side|session|vol) cells is then topped
 *     up, WITH REPLACEMENT, from the same (verdictState|side) pool filtered by
 *     session and vol, until it reaches `baselineMinCellN` (200) or the pool is
 *     exhausted,
 *   - the top-up RNG is seeded `RANDOM_BASELINE.seed + 7919`, exactly as A4.
 *
 * A cell that cannot reach the minimum stays under-filled and `sufficient:false`
 * so verifyClaim treats it as NO_BASELINE. Nothing falls back to zero.
 */
export function baselineCells(entries, baselineMinCellN, opts = {}) {
  const topUp = opts.topUp !== false;
  const seed = opts.seed ?? RANDOM_BASELINE.seed + 7919;
  const perDraw = opts.perDraw; // (entry, side) => resolved netR, for top-up draws
  const poolOf = opts.poolOf; // (vs, side, session, vol) => candidate entries

  const toCells = (rows) => {
    const acc = new Map();
    for (const e of rows) {
      if (!e.verdictState) continue; // UNKNOWN/blank -> no verdict cell
      const k = `${e.verdictState}|${e.side}|${e.session}|${e.vol}`;
      if (!acc.has(k)) acc.set(k, { n: 0, sum: 0 });
      const c = acc.get(k);
      c.n++;
      c.sum += e.netR;
    }
    return acc;
  };

  const all = [...entries];
  const acc = toCells(all);
  const topupRecord = {
    enabled: !!topUp,
    minPerCell: baselineMinCellN,
    seed,
    derivedFrom: "RANDOM_BASELINE.seed + 7919 (frozen A4 method)",
    identicalHarness: true,
    cellsRequested: 0,
    cellsToppedUp: 0,
    cellsUnreachable: [],
    entriesAdded: 0,
    perCell: [],
  };

  if (topUp && perDraw && poolOf) {
    const rng = mulberry32(seed);
    for (const vs of ["EFFICIENT", "CHOPPY"]) {
      for (const side of ["long", "short"]) {
        for (const session of ["asian", "london", "ny"]) {
          for (const vol of ["low", "mid", "high"]) {
            const k = `${vs}|${side}|${session}|${vol}`;
            const have = acc.get(k)?.n ?? 0;
            topupRecord.cellsRequested++;
            if (have >= baselineMinCellN) {
              topupRecord.perCell.push({ cell: k, before: have, after: have, added: 0, status: "OK" });
              continue;
            }
            const pool = poolOf(vs, side, session, vol);
            if (!pool.length) {
              topupRecord.cellsUnreachable.push({ cell: k, have, status: "NO_CANDIDATE_BARS" });
              topupRecord.perCell.push({ cell: k, before: have, after: have, added: 0, status: "NO_CANDIDATE_BARS" });
              continue;
            }
            let added = 0;
            const guard = Math.min(pool.length * 40, 20000);
            // The cell total is updated inside the loop, so it must NOT be
            // combined with `added` here (that double-counts the draws).
            for (let d = 0; d < guard && (acc.get(k)?.n ?? 0) < baselineMinCellN; d++) {
              const pick = pool[Math.floor(rng() * pool.length)];
              const netR = perDraw(pick, side);
              if (netR === null) continue;
              const rec = { ...pick, side, netR, verdictState: vs, topup: true };
              all.push(rec);
              const a = toCells([rec]).get(k);
              if (!acc.has(k)) acc.set(k, { n: 0, sum: 0 });
              acc.get(k).n += a.n;
              acc.get(k).sum += netR * a.n;
              added++;
            }
            const after = acc.get(k)?.n ?? 0;
            topupRecord.entriesAdded += added;
            if (added > 0) topupRecord.cellsToppedUp++;
            if (after < baselineMinCellN)
              topupRecord.cellsUnreachable.push({ cell: k, have: after, status: "BELOW_MIN_AFTER_GUARD" });
            topupRecord.perCell.push({
              cell: k,
              before: have,
              after,
              added,
              status: after >= baselineMinCellN ? "TOPUP_OK" : "BELOW_MIN",
            });
          }
        }
      }
    }
  }

  const fineCellsVerdictState = {};
  for (const [k, c] of acc) {
    fineCellsVerdictState[k] = {
      n: c.n,
      meanNetR: +(c.sum / c.n).toFixed(6),
      sufficient: c.n >= baselineMinCellN,
    };
  }
  return { fineCellsVerdictState, topup: topupRecord, entriesWithTopUp: all };
}

/**
 * Split a card's trades into verdict-state bins.
 *
 * A trade is attributed to a verdict cell ONLY if its ENTRY bar was classified
 * EFFICIENT or CHOPPY. An entry on an UNKNOWN bar (warm-up, abstain band, or a
 * pending transition that never confirmed) is `flat` in the frozen Map, so it
 * belongs to neither cell. It still happened and still occupied the card's
 * slot: the exclusion is from OUTCOME ATTRIBUTION, not from entry.
 *
 * This is reported, never hidden: `unknown` carries the count and share.
 */
export function binByVerdictState(trades) {
  const bins = { EFFICIENT: [], CHOPPY: [], unknown: [] };
  for (const t of trades) {
    if (t.verdictState === "EFFICIENT") bins.EFFICIENT.push(t);
    else if (t.verdictState === "CHOPPY") bins.CHOPPY.push(t);
    else bins.unknown.push(t);
  }
  return {
    ...bins,
    unknownCount: bins.unknown.length,
    unknownShare: trades.length ? +(bins.unknown.length / trades.length).toFixed(4) : 0,
    note: "UNKNOWN entries occupy the slot but are not attributed to a verdict cell.",
  };
}

/* ------------------------------------------------------------------ *
 * 3. SWEEP RE-BINNING (Method 2)
 * ------------------------------------------------------------------ */

/**
 * Re-derive the verdict state of a bar under an arbitrary (erCutoff,
 * atrPctileCutoff) pair, using the SAME frozen feature values and the SAME
 * abstain band + hysteresis rules. Only the two cutoffs move.
 *
 * Hysteresis is path-dependent, so it must be replayed from the segment start
 * with the cell's cutoffs — not patched per bar.
 */
export function classifyWithCutoffs(features, erCutoff, atrPctileCutoff) {
  const cfg = { ...MAP, erCutoff, atrPctileCutoff };
  const raw = features.map((f) => rawStateOf(f, cfg));
  // Replay the frozen classify() hysteresis on the substituted raw labels.
  const out = new Array(features.length);
  let confirmed = "UNKNOWN";
  let pending = null;
  let pendingCount = 0;
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (r === "UNKNOWN") {
      pending = null;
      pendingCount = 0;
      out[i] = "UNKNOWN";
      continue;
    }
    if (r === confirmed) {
      pending = null;
      pendingCount = 0;
      out[i] = confirmed;
      continue;
    }
    if (pending === r) pendingCount++;
    else {
      pending = r;
      pendingCount = 1;
    }
    if (pendingCount >= MAP.hysteresisBars) {
      confirmed = r;
      pending = null;
      pendingCount = 0;
      out[i] = confirmed;
    } else out[i] = confirmed;
  }
  return out;
}

/**
 * The 25-cell sweep (Method 2). For every cell and EVERY verdict state:
 *   - re-label the card's trades and the SAME deterministic random entries by
 *     the state at the entry bar under that cell's cutoffs (hysteresis replayed
 *     from the segment start, not patched per bar),
 *   - rebuild the matched control for that cell using the frozen A4 top-up,
 *   - run the UNCHANGED verifyClaim on that verdict state's bin.
 *
 * Binning note: a trade whose entry bar was UNKNOWN belongs to NO verdict cell
 * (the frozen Map is flat there) and is not attributed to either bin. It still
 * consumed the card's slot. `unknown` reports how many, so the exclusion is
 * visible rather than silent.
 *
 * A cell where the bin has no usable matched baseline yields NO_BASELINE ->
 * INCONCLUSIVE. Never a zero fallback (verifyClaim enforces it).
 */
export function runSweep({
  bundle,
  tradesByCard,
  randomEntries,
  card,
  kind,
  baselineMinCellN,
  cells = sweepCells(),
}) {
  const segById = new Map(bundle.segments.map((s) => [s.id, s]));
  const results = [];

  for (const cell of cells) {
    const k = sweepCellKey(cell);
    const perSeg = new Map();
    for (const seg of bundle.segments) {
      perSeg.set(seg.id, classifyWithCutoffs(seg.features, cell.erCutoff, cell.atrPctileCutoff));
    }

    // Re-label the card's trades under this cell.
    const trades = tradesByCard.map((t) => {
      const st = perSeg.get(t.segmentId)[t.entryIndex];
      return { ...t, state: st, verdictState: VERDICT_STATE_OF[st] ?? null };
    });
    // Re-label the SAME random entries.
    const relabelled = randomEntries.map((e) => {
      const st = perSeg.get(e.segmentId)[e.localIndex];
      return { ...e, state: st, verdictState: VERDICT_STATE_OF[st] ?? null };
    });

    // Matched control for this cell, with the frozen A4 top-up re-derived.
    const poolCache = new Map();
    const poolOf = (vs, side, session, vol) => {
      const pk = `${vs}|${side}|${session}|${vol}`;
      if (poolCache.has(pk)) return poolCache.get(pk);
      const out = [];
      for (const seg of bundle.segments) {
        const states = perSeg.get(seg.id);
        const { first, last } = seg.window;
        for (let i = first; i <= last; i++) {
          if (VERDICT_STATE_OF[states[i]] !== vs) continue;
          const atr = seg.features[i].atr;
          if (!Number.isFinite(atr) || atr <= 0) continue;
          const bar = seg.bars[i];
          if (seg.features[i].session !== session) continue;
          if (volRegimeOf(bar) !== vol) continue;
          out.push({
            segmentId: seg.id,
            localIndex: i,
            session,
            vol,
            state: states[i],
            verdictState: vs,
            year: yearOf(bar.datetime),
            day: String(bar.datetime).slice(0, 10),
          });
        }
      }
      poolCache.set(pk, out);
      return out;
    };
    const perDraw = (pick, side) => {
      const seg = segById.get(pick.segmentId);
      const atr = seg.features[pick.localIndex].atr;
      const t = resolveTrade(seg.bars, pick.localIndex, side, atr, {
        session: pick.session,
        vol: pick.vol,
        variant: "baseline",
        maxBars: RANDOM_BASELINE.maxHoldBars,
      });
      return t.outcome === "INVALID_ATR" ? null : t.netR;
    };
    const baseline = baselineCells(relabelled, baselineMinCellN, { poolOf, perDraw });
    const direction = kind === "strength" ? +1 : -1;

    for (const vs of ["EFFICIENT", "CHOPPY"]) {
      const bin = trades.filter((t) => t.verdictState === vs);
      const res = verifyClaim(bin, { direction, baseline });
      results.push({
        cell,
        key: k,
        verdictState: vs,
        verdict: res.verdict,
        reason: res.reason ?? null,
        n: res.n,
        meanNetR: res.meanNetR,
        excessVsRandomR: res.excessVsRandomR,
        t: res.t,
        tNet: res.tNet,
        confirmed: res.verdict === "CONFIRMED",
        baselineMissing: res.baseline?.missing ?? null,
        baselineCells: Object.keys(baseline.fineCellsVerdictState).length,
        baselineInsufficient: Object.values(baseline.fineCellsVerdictState).filter((c) => !c.sufficient).length,
        topupAdded: baseline.topup.entriesAdded,
      });
    }
  }
  return results;
}

/**
 * Grade ONE verdict state of a claim that is CONFIRMED at the frozen centre.
 * ROBUST >= 80%, FRAGILE >= 50%, else DEFINITION_SENSITIVE (frozen thresholds).
 * The grade is defined ONLY for CONFIRMED-at-centre claims; otherwise null.
 */
export function sweepGrade(sweepResults, verdictState, centreVerdict) {
  const rows = sweepResults.filter((r) => r.verdictState === verdictState);
  const centre = rows.find((r) => r.cell.isCenter);
  const totalCells = rows.length;
  const confirmedCells = rows.filter((r) => r.confirmed).length;
  if (!centre || centreVerdict !== "CONFIRMED") {
    return {
      defined: false,
      grade: null,
      confirmedCells,
      totalCells,
      note: "grade is defined only for a claim CONFIRMED at the frozen centre",
    };
  }
  const pct = (confirmedCells / totalCells) * 100;
  const grade =
    pct >= SENSITIVITY_RULE.robustMinPct
      ? "ROBUST"
      : pct >= SENSITIVITY_RULE.fragileMinPct
        ? "FRAGILE"
        : "DEFINITION_SENSITIVE";
  return {
    defined: true,
    grade,
    confirmedCells,
    totalCells,
    pct: +pct.toFixed(2),
    thresholds: {
      robustMinPct: SENSITIVITY_RULE.robustMinPct,
      fragileMinPct: SENSITIVITY_RULE.fragileMinPct,
    },
  };
}

/** Centre verdict helper used by tests and the Stage 4 runner. */
export function centreCell() {
  return sweepCells().find((c) => c.isCenter);
}

export { buildSegmentBundle, eligibilityWindow, sweepCells, sweepCellKey };

/* ------------------------------------------------------------------ *
 * 4. TOP-LEVEL WIRING (used by Stage 4; also exercised by Stage 2 tests)
 * ------------------------------------------------------------------ */

/**
 * Full A8 verification for ONE card and ONE claim kind.
 *
 *  1. one-slot trades per segment (unconditional entry),
 *  2. matched random control on the same boundaries,
 *  3. per-segment and per-year book diagnostics,
 *  4. the authoritative verdict per VERDICT STATE at the frozen centre, using
 *     the UNCHANGED verifyClaim and the A4-topped-up matched control,
 *  5. the matched 25-cell sweep and its grade for CONFIRMED-at-centre claims.
 *
 * It returns numbers only. Deciding what to print, tag or route is the caller's
 * job; it deliberately does not import the Compass.
 */
export function verifyCardA8({ bundle, card, kind, signalFn, baselineMinCellN = 200, withSweep = true }) {
  const book = produceCardTrades(bundle, card, signalFn);
  const control = buildSegmentRandomControl(bundle);
  const { fineCellsVerdictState, topup } = baselineCells(
    [...control.entries],
    baselineMinCellN,
    {
      poolOf: (vs, side, session, vol) =>
        control.entries.filter(
          (e) =>
            e.verdictState === vs &&
            e.side === side &&
            e.session === session &&
            e.vol === vol,
        ),
      perDraw: (pick, side) => {
        const seg = bundle.segments.find((x) => x.id === pick.segmentId);
        const atr = seg.features[pick.localIndex].atr;
        const t = resolveTrade(seg.bars, pick.localIndex, side, atr, {
          session: pick.session,
          vol: pick.vol,
          variant: "baseline",
          maxBars: RANDOM_BASELINE.maxHoldBars,
        });
        return t.outcome === "INVALID_ATR" ? null : t.netR;
      },
    },
  );
  const baseline = { fineCellsVerdictState };
  const direction = kind === "strength" ? +1 : -1;
  const bins = binByVerdictState(book.trades);

  const centre = {};
  for (const vs of ["EFFICIENT", "CHOPPY"]) {
    centre[vs] = verifyClaim(bins[vs], { direction, baseline });
  }

  let sweep = null;
  let grades = null;
  if (withSweep) {
    sweep = runSweep({
      bundle,
      tradesByCard: book.trades,
      randomEntries: control.entries,
      card,
      kind,
      baselineMinCellN,
    });
    grades = {};
    for (const vs of ["EFFICIENT", "CHOPPY"]) {
      grades[vs] = sweepGrade(sweep, vs, centre[vs].verdict);
    }
  }

  return {
    cardId: card.id,
    kind,
    book,
    bins: { EFFICIENT: bins.EFFICIENT.length, CHOPPY: bins.CHOPPY.length, unknown: bins.unknownCount, unknownShare: bins.unknownShare },
    control: { entries: control.entries.length, diagnostics: control.diagnostics, topup },
    centre,
    sweep,
    grades,
  };
}
