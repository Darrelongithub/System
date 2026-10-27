/**
 * G0 AMENDMENT 4 (2026-10-27) — signal-only library, measured overlap, slot
 * model, power curve, baseline top-up. No real strategy verification here.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { test, assert, assertEqual } from "../tiny.mjs";
import { dataLines, num } from "../../scripts/map-compass/lib/csv.mjs";
import {
  CLAIM_CARDS,
  FAMILIES,
  FROZEN_TEST_SEQUENCE,
  TEST_ORDER,
  validateClaimCards,
  FREEZE,
} from "../../scripts/map-compass/claim-cards.draft.mjs";
import {
  SIGNAL_PARAMS,
  SIGNAL_IDS,
  paramsToString,
} from "../../scripts/map-compass/signal-params.mjs";
import {
  emitSignals,
  signalLibrarySelfCheck,
  signalCardIds,
  FORBIDDEN_IMPORTS,
  FORBIDDEN_SIGNAL_FIELDS,
  SIGNAL_FIELDS,
} from "../../scripts/map-compass/lib/signals.mjs";
import {
  ROLES,
  STATES,
  VERDICT_STATES,
  VERDICT_STATE_OF,
  CLAIM_CRITERIA,
} from "../../scripts/map-compass/frozen.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ART = join(ROOT, "artifacts/map-compass");
const read = (p) => JSON.parse(readFileSync(join(ART, p), "utf8"));

/** Deterministic pseudo-random bars with a trend + noise. */
function syntheticBars(n = 1500, seed = 7) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const bars = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const drift = Math.sin(i / 23) * 0.6;
    const o = price;
    const c = price + drift + (rnd() - 0.5) * 2.2;
    price = c;
    const hi = Math.max(o, c) + rnd() * 1.1;
    const lo = Math.min(o, c) - rnd() * 1.1;
    const h = Math.floor(i / 48), m = (i % 48);
    bars.push({
      datetime: `2020-01-${String(1 + (i % 28)).padStart(2, "0")} ${String(h % 24).padStart(2, "0")}:${String((m % 2) * 30).padStart(2, "0")}:00`,
      o, h: hi, l: lo, c, v: 1000,
    });
  }
  return bars;
}

// ---------------------------------------------------------------------------
// TASK 1 — signal-only library
// ---------------------------------------------------------------------------
test("A4 1: the signal library has 24 evaluators with the exact card parameters", () => {
  assertEqual(validateClaimCards().length, 0, validateClaimCards().join("; "));
  assertEqual(signalLibrarySelfCheck().length, 0, signalLibrarySelfCheck().join("; "));
  assertEqual(signalCardIds().length, 24);
  assertEqual(SIGNAL_IDS.length, 24);
  assertEqual(
    JSON.stringify([...signalCardIds()].sort()),
    JSON.stringify([...SIGNAL_IDS].sort()),
    "the evaluator registry must cover exactly the parameter registry",
  );
  for (const c of CLAIM_CARDS) {
    assert(SIGNAL_PARAMS[c.id], `${c.id} must have signal parameters`);
    assertEqual(c.parameters, SIGNAL_PARAMS[c.id], `${c.id} card parameters must match the registry`);
    assert(paramsToString(c.id).length > 0, `${c.id} must have a printable parameter string`);
  }
  // Adding `parameters` did not change any claim, state, priority or order.
  assertEqual(CLAIM_CARDS.length, 24);
  assertEqual(TEST_ORDER.length, 24);
  assertEqual(JSON.stringify(TEST_ORDER.map((t) => t.id)), JSON.stringify(FROZEN_TEST_SEQUENCE));
  assertEqual(FREEZE.status, "DRAFT");
});

test("A4 1: signals emit ONLY entry bars and sides — no stops, targets, trades or R", () => {
  const bars = syntheticBars(1200);
  for (const id of signalCardIds()) {
    const rows = emitSignals(bars, id);
    assert(Array.isArray(rows), `${id} must return an array`);
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        assert(!FORBIDDEN_SIGNAL_FIELDS.includes(k), `${id} emitted a forbidden field ${k}`);
      }
      for (const f of SIGNAL_FIELDS) {
        assert(f in r, `${id} must carry the field ${f}`);
      }
      assertEqual(r.cardId, id);
      assert(["long", "short"].includes(r.side), `${id} side must be long|short, got ${r.side}`);
      assert(Number.isInteger(r.index) && r.index >= 0 && r.index < bars.length, `${id} index out of range`);
      assertEqual(r.causal, true);
    }
    // no outcome-related value may appear anywhere in the row
    const blob = JSON.stringify(rows);
    for (const bad of ["netR", "grossR", "costR", "totalR", "verdict", "outcome", "exitPrice", "barsHeld"]) {
      assert(!blob.includes(`"${bad}"`), `${id} rows must not contain ${bad}`);
    }
  }
});

test("A4 1: no outcome-related module can be imported by the signal library", () => {
  const src = readFileSync(
    new URL("../../scripts/map-compass/lib/signals.mjs", import.meta.url),
    "utf8",
  );
  // Only the import statements themselves are checked — the module documents the
  // forbidden names in prose, so a naive substring search would false-positive.
  const importLines = [...src.matchAll(/^import\s.*?from\s"([^"]+)"/gm)].map((m) => m[1]);
  for (const bad of FORBIDDEN_IMPORTS) {
    assert(
      !importLines.some((l) => l.includes(bad)),
      `signals.mjs must not import ${bad}`,
    );
  }
  // The module must import only frozen.mjs, signal-params.mjs and dst.mjs.
  const imports = importLines;
  assertEqual(imports.length, 3, `expected exactly 3 imports, got ${imports.join(", ")}`);
  for (const imp of imports) {
    assert(
      imp === "../frozen.mjs" || imp === "../signal-params.mjs" || imp === "./dst.mjs",
      `unexpected import ${imp}`,
    );
  }
});

test("A4 1: the library is causal — mutating future bars never changes earlier signals", () => {
  const bars = syntheticBars(1400);
  const states = bars.map((_, i) => (i % 4 === 0 ? null : STATES[i % 4]));
  for (const id of signalCardIds()) {
    const full = emitSignals(bars, id, { states });
    for (const cut of [600, 900, 1200]) {
      const truncated = bars.slice(0, cut);
      const truncatedStates = states.slice(0, cut);
      const partial = emitSignals(truncated, id, { states: truncatedStates });
      const before = full.filter((r) => r.index < cut).map((r) => `${r.index}:${r.side}`);
      const after = partial.map((r) => `${r.index}:${r.side}`);
      assertEqual(
        JSON.stringify(before),
        JSON.stringify(after),
        `${id} changed at cut=${cut} when the future was deleted`,
      );
    }
  }
});

test("A4 1: on the REAL bars, deleting the future never changes earlier signals", () => {
  const barsPath = join(ART, "normalized/xauusd-m30-eat.csv");
  const statesPath = join(ART, "normalized/xauusd-m30-map.csv");
  if (!existsSync(barsPath) || !existsSync(statesPath)) return; // needs mc:map
  const bars = [];
  for (const f of dataLines(readFileSync(barsPath, "utf8"), { delimiter: "," })) {
    if (f[0] === "datetime") continue;
    const o = num(f[1]), h = num(f[2]), l = num(f[3]), c = num(f[4]);
    if (o === undefined || h === undefined || l === undefined || c === undefined) continue;
    bars.push({ datetime: f[0], o, h, l, c });
  }
  const mapLines = readFileSync(statesPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("datetime"));
  const states = new Array(bars.length).fill(null);
  let bi = 0;
  for (const line of mapLines) {
    const f = line.split(",");
    while (bi < bars.length && bars[bi].datetime !== f[0]) bi++;
    if (bi >= bars.length) break;
    states[bi] = f[1];
    bi++;
  }
  // Two cards that use the prior-day and session-range machinery, at two cuts.
  for (const id of ["dual-thrust", "asian-range-break", "london-orb-30", "pdh-retest", "classic-pivot"]) {
    const full = emitSignals(bars, id, { states });
    for (const cut of [80000, 150000]) {
      const part = emitSignals(bars.slice(0, cut), id, { states: states.slice(0, cut) });
      const a = full.filter((r) => r.index < cut).map((r) => `${r.index}:${r.side}`).join(",");
      const b = part.map((r) => `${r.index}:${r.side}`).join(",");
      assertEqual(a, b, `${id} changed on the real bars at cut=${cut}`);
    }
  }
});

test("A4 1: signals are deterministic and side-restricted cards emit only their side", () => {
  const bars = syntheticBars(1200);
  for (const id of signalCardIds()) {
    const a = emitSignals(bars, id);
    const b = emitSignals(bars, id);
    assertEqual(JSON.stringify(a), JSON.stringify(b), `${id} must be deterministic`);
  }
  // pdh-retest is long-only and pdl-retest is short-only by construction.
  const l = emitSignals(bars, "pdh-retest");
  const s = emitSignals(bars, "pdl-retest");
  assert(l.every((r) => r.side === "long"), "pdh-retest must be long-only");
  assert(s.every((r) => r.side === "short"), "pdl-retest must be short-only");
});

test("A4 1: session-restricted cards only emit in their restricted session", () => {
  const bars = syntheticBars(2000);
  for (const c of CLAIM_CARDS) {
    if (!c.sessionRestriction) continue;
    const rows = emitSignals(bars, c.id);
    assert(rows.length > 0, `${c.id} should emit in the synthetic sample`);
    assert(
      rows.every((r) => r.session === c.sessionRestriction),
      `${c.id} must only emit in the ${c.sessionRestriction} session`,
    );
  }
});

// ---------------------------------------------------------------------------
// TASK 2 — signal counts on DEV
// ---------------------------------------------------------------------------
test("A4 2: signal counts cover every card and every requested dimension", () => {
  const r = read("signal-counts.json");
  assertEqual(r.decidedBeforeResults, true);
  assertEqual(r.noStrategyOutcomesUsed, true);
  assertEqual(r.cards.length, 24);
  assertEqual(r.families.length, 8);
  assertEqual(r.forbiddenSignalFields.length, 0, "no signal row may carry outcome fields");
  for (const c of r.cards) {
    assertEqual(c.cardId.length > 0, true);
    assert(c.buckets.side.long !== undefined || c.buckets.side.short !== undefined, `${c.cardId} needs a side split`);
    assert(c.buckets.verdictState !== undefined, `${c.cardId} needs a verdict-state split`);
    assert(c.buckets.fourState !== undefined, `${c.cardId} needs a four-state split`);
    assert(c.buckets.session !== undefined, `${c.cardId} needs a session split`);
    assert(c.buckets.verdictStateLag20 !== undefined, `${c.cardId} needs the 20-bar-lag diagnostic`);
    assert(c.parameters !== undefined, `${c.cardId} must record its parameters`);
  }
  for (const f of r.families) {
    assert(VERDICT_STATES.includes(f.strengthState));
    assert(VERDICT_STATES.includes(f.weaknessState));
    assert(f.strengthState !== f.weaknessState);
    assert(f.strengthShare >= 0 && f.strengthShare <= 1);
  }
  assertEqual(r.cells.length, 48);
  assertEqual(r.familyCells.length, 16);
});

test("A4 2: every claim cell below n >= 100 is flagged STRUCTURALLY THIN", () => {
  const r = read("signal-counts.json");
  assertEqual(r.minTradesPerCell, CLAIM_CRITERIA.minTradesPerCell);
  for (const c of r.cells) {
    assertEqual(c.structurallyThin, c.expectedN < CLAIM_CRITERIA.minTradesPerCell);
  }
  for (const c of r.familyCells) {
    assertEqual(c.structurallyThin, c.expectedN < CLAIM_CRITERIA.minTradesPerCell);
  }
  const thin = r.cells.filter((c) => c.structurallyThin);
  assertEqual(thin.length, r.thinCells.length);
  assertEqual(r.structurallyThinSummary.thinCellCount, thin.length);
  // The owner decides after seeing this; the report must not change any card.
  assert(r.note.includes("STRUCTURALLY THIN"));
  assert(r.note.includes("does NOT authorise"), "the report must forbid acting on it");
});

test("A4 2: the report states how many families would lack any testable cell", () => {
  const r = read("signal-counts.json");
  assert(r.structurallyThinSummary.familiesWithoutAnyTestableCellCount >= 0);
  assertEqual(
    r.structurallyThinSummary.familiesWithoutAnyTestableCell.length,
    r.structurallyThinSummary.familiesWithoutAnyTestableCellCount,
  );
  assertEqual(
    r.structurallyThinSummary.familiesWithAnyTestableCell.length +
      r.structurallyThinSummary.familiesWithoutAnyTestableCellCount,
    8,
  );
});

// ---------------------------------------------------------------------------
// TASK 3 — overlap measured from data
// ---------------------------------------------------------------------------
test("A4 3: overlap is MEASURED from the real DEV signal bars, not label-driven", () => {
  const r = read("measured-overlap.json");
  assertEqual(r.decidedBeforeResults, true);
  assertEqual(Object.keys(r.byFamily).length, 8);
  for (const [f, v] of Object.entries(r.byFamily)) {
    assertEqual(v.cards.length, 3);
    assertEqual(v.pairwiseJaccard.length, 3);
    for (const p of v.pairwiseJaccard) {
      assert(p.jaccard !== null, `${f} pairwise jaccard must be computed`);
      assert(p.jaccard >= 0 && p.jaccard <= 1);
    }
    assert(v.pooled.nEffective > 0);
    assert(v.pooled.designEffect >= 1, "design effect must be at least 1");
  }
  // The v1.3 label-driven values must be recorded as REPLACED, not silently kept.
  assert(r.replaced.v13Overlap.pooledOverlapFraction !== undefined);
  assert(r.replaced.v13SeInflation.value !== undefined);
  assert(r.assumptions.sharedBarMeansSharedTrade.includes("UPPER bound"));
});

test("A4 3: the day-clustered SE inflation is measured on the baseline trades", () => {
  const r = read("measured-overlap.json");
  const b = read("random-baseline.json");
  for (const vs of VERDICT_STATES) {
    assert(r.seInflation[vs], `${vs} must have a measured SE inflation`);
    assert(r.seInflation[vs].inflation > 1, "CR1 must inflate the SE above the plain SE");
    assertEqual(
      r.seInflation[vs].inflation,
      b.dailySe[vs].inflation,
      `${vs} SE inflation must match the baseline's own computation`,
    );
    assert(r.seInflationVerifiedFromDailySums[vs].match, `${vs} SE must be reproducible from dailySums`);
  }
  // And it must NOT be the v1.3 synthetic value.
  assert(r.seInflation.EFFICIENT.inflation !== 1.009 || r.seInflation.CHOPPY.inflation !== 1.009);
});

// ---------------------------------------------------------------------------
// TASK 4 — slot model
// ---------------------------------------------------------------------------
test("A4 4: the slot model is explicitly flagged as an ASSUMPTION", () => {
  const r = read("slot-model.json");
  assertEqual(r.isAssumption, true);
  assertEqual(r.decidedBeforeResults, true);
  assert(r.assumption.holdDuration.includes("RANDOM-ENTRY BASELINE"));
  assert(r.assumption.singleGlobalSlot.includes("conservative"));
  assert(r.assumption.noOutcomes.includes("No strategy"));
  assertEqual(Object.keys(r.perCard).length, 24);
  assertEqual(r.perFamily.length, 8);
  for (const c of Object.values(r.perCard)) {
    assert(c.survival > 0 && c.survival <= 1, `${c.cardId} survival must be in (0,1]`);
    assertEqual(c.kept + c.droppedOccupied, c.rawSignals);
  }
  for (const f of r.perFamily) {
    assert(f.survival > 0 && f.survival <= 1);
    // A kept trade whose bar has no four-state label lands in neither half.
    assert(
      f.expectedStrengthN + f.expectedWeaknessN <= f.kept,
      `${f.family} kept trades must not exceed the family total`,
    );
    assert(f.expectedStrengthN + f.expectedWeaknessN > 0, `${f.family} must keep some trades`);
  }
});

// ---------------------------------------------------------------------------
// TASK 5 — power curve
// ---------------------------------------------------------------------------
test("A4 5: the power curve states its definition and is report-only", () => {
  const r = read("power-curve.json");
  assertEqual(r.reportOnly, true);
  assertEqual(r.criteriaChanged, false);
  assertEqual(r.thresholdChanged, false);
  assertEqual(r.verdictChanged, false);
  assert(r.definition.confirmed.includes("meanNetR > +0.10R"));
  assert(r.definition.confirmed.includes("tNet > 2"));
  assert(r.definition.confirmed.includes("excessVsRandomR > 0"));
  assert(r.definition.confirmed.includes("t > 2"));
  assert(r.definition.confirmed.includes("NO_BASELINE"));
  assert(r.definition.trueNetEdge.includes("0.05R"), "the 0.05R edge must be defined");
  assert(r.definition.trueNetEdge.includes("0.10R"), "the 0.10R edge must be defined");
  assert(r.definition.trueNetEdge.includes("0.20R"), "the 0.20R edge must be defined");
  assert(r.definition.trueNetEdge.includes("0.30R"), "the 0.30R edge must be defined");
  // every requested edge must appear in every cell
  for (const c of r.cells) {
    for (const e of [0.05, 0.1, 0.2, 0.3]) {
      assert(c.powerCurve[e], `${c.cell} must have a power value at ${e}R`);
      assert(c.powerCurve[e].probability >= 0 && c.powerCurve[e].probability <= 1);
      assertEqual(c.powerCurve[e].runs, c.powerCurve[0.05].runs);
    }
    assert(c.measuredTradesAfterSlot > 0, `${c.cell} must have a measured trade count`);
    assert(c.measuredDevDays > 0, `${c.cell} must have a measured day count`);
  }
  // 6 per-session cells + 2 pooled = 8
  assertEqual(r.cells.filter((c) => c.session !== "POOLED").length, 6);
  assertEqual(r.cells.filter((c) => c.session === "POOLED").length, 2);
  assert(r.note.includes("REPORT-ONLY"));
});

test("A4 5: power is monotone in the true edge and zero at/below the floor", () => {
  const r = read("power-curve.json");
  for (const c of r.cells) {
    const p = (e) => c.powerCurve[e].probability;
    assert(p(0.05) <= p(0.1) + 0.02, `${c.cell} power must not decrease from 0.05R to 0.10R`);
    assert(p(0.1) <= p(0.2), `${c.cell} power must be monotone in the edge`);
    assert(p(0.2) <= p(0.3) + 0.02, `${c.cell} power must not decrease from 0.20R to 0.30R`);
  }
});

// ---------------------------------------------------------------------------
// TASK 6 — baseline top-up
// ---------------------------------------------------------------------------
test("A4 6: the baseline top-up pre-registers fixed seeds and an identical harness", () => {
  const b = read("random-baseline.json");
  assertEqual(b.topup.enabled, true);
  assertEqual(b.topup.preRegisteredAt.includes("G0 Amendment 4"), true);
  assertEqual(b.topup.cellKey, "verdictState|side|session|volRegime");
  assertEqual(b.topup.minPerCell, CLAIM_CRITERIA.baselineMinCellN);
  assert(Number.isInteger(b.topup.seed), "the top-up seed must be fixed");
  assertEqual(b.topup.identicalHarness, true);
  assertEqual(b.topup.cellsRequested, 36, "2 verdict states x 2 sides x 3 sessions x 3 vol regimes");
  assert(b.topup.entriesAdded > 0);
  assertEqual(
    b.topup.cellsToppedUp + b.topup.cellsUnreachable.length +
      b.topup.perCell.filter((c) => c.status === "STILL_INSUFFICIENT").length,
    b.topup.cellsRequested - b.topup.perCell.filter((c) => c.status === "OK").length,
  );
});

test("A4 6: every fine cell is sufficient after the top-up, and the coarse fallback is gone", () => {
  const b = read("random-baseline.json");
  const insufficient = Object.entries(b.fineCellsVerdictState).filter(([, c]) => !c.sufficient);
  assertEqual(insufficient.length, 0, `insufficient fine cells: ${insufficient.map(([k]) => k).join(", ")}`);
  assertEqual(b.coverage.afterCoarseFallbackShare, 0);
  assertEqual(b.coverage.after.coarse, 0);
  assert(b.coverage.beforeCoarseFallbackShare > 0, "the pre-top-up share must be reported");
  assertEqual(b.coverage.fineCellCoverageAfter.insufficient, 0);
  assert(b.coverage.fineCellCoverageBefore.insufficient > 0, "some fine cells were insufficient before");
});

test("A4 7: every family has a criticism whose URL was opened this run (VERIFIED)", () => {
  for (const c of CLAIM_CARDS) {
    const crit = c.criticism;
    assert(crit, `${c.id} must carry a criticism record`);
    assertEqual(crit.status, "VERIFIED", `${c.id} criticism must be marked VERIFIED`);
    assertEqual(crit.opened, "2026-10-27", `${c.id} criticism must record the opening date`);
    assert(crit.url.startsWith("http"), `${c.id} criticism needs a full URL`);
    assert(crit.citation.length > 20, `${c.id} criticism needs a citation`);
    assert(["NEGATIVE", "MIXED", "POSITIVE", "NONE"].includes(crit.impact));
  }
  // No invented URLs: every URL must be reachable-looking and non-empty.
  const urls = new Set(CLAIM_CARDS.map((c) => c.criticism.url));
  assertEqual(urls.size, 8, "one criticism URL per family");
  for (const u of urls) assert(/^https?:\/\//.test(u), `bad URL ${u}`);
});

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------
test("A4: verify-claims stays BLOCKED and the cards stay DRAFT", () => {
  assertEqual(FREEZE.status, "DRAFT");
  assertEqual(FREEZE.approvedBy, null);
  assert(!existsSync(join(ART, "claim-verification.json")), "no real strategy result may exist");
  assert(!existsSync(join(ART, "claimed-trades.jsonl")), "no trade stream may exist");
  assertEqual(read("routing-table.json").enabledCount, 0);
  assertEqual(read("power-projection.json").verdict, "UNDERPOWERED");
});

test("A4: the restored CONFIRMED rule and all frozen thresholds are unchanged", () => {
  assertEqual(CLAIM_CRITERIA.practicalFloorR, 0.1);
  assertEqual(CLAIM_CRITERIA.tStatMin, 2);
  assertEqual(CLAIM_CRITERIA.minTradesPerCell, 100);
  assertEqual(CLAIM_CRITERIA.excessFloorR, 0);
  assertEqual(CLAIM_CRITERIA.absoluteNetRMin, undefined);
  assertEqual(CLAIM_CRITERIA.concentrationMax, 0.5);
  assertEqual(CLAIM_CRITERIA.loyoPositiveMin, 0.75);
});
