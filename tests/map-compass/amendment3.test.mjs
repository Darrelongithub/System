/** G0 AMENDMENT 3 (2026-10-27) — pin the restored rule, sign convention,
 *  NO_BASELINE fail-closed behaviour, verdict states, evidence registry and
 *  the report-only 2x3 power table. No real strategy verification here. */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { test, assert, assertEqual } from "../tiny.mjs";
import {
  ROLES,
  STATES,
  VERDICT_STATES,
  VERDICT_STATE_OF,
  FOUR_STATES_OF,
  FAMILY_STRENGTH_STATE,
  verdictStateOf,
  otherVerdictState,
  CLAIM_CRITERIA,
  EMPIRICAL_STUDIES,
  EVIDENCE,
  REVERSION_FAMILIES,
  EXIT_CAVEAT,
} from "../../scripts/map-compass/frozen.mjs";
import {
  CLAIM_CARDS,
  TEST_ORDER,
  FROZEN_TEST_SEQUENCE,
  FREEZE,
  CARD_RELATIONS,
  NEAR_DUPLICATES,
  MIRROR_IMAGES,
  validateClaimCards,
} from "../../scripts/map-compass/claim-cards.draft.mjs";
import {
  verifyClaim,
  matchedBaseline,
  excessFor,
  NO_BASELINE,
  UNCONTROLLED,
  groupByFamilyVerdictState,
} from "../../scripts/map-compass/lib/verification.mjs";
import { recomputeWithinFamilyOverlap, sweepShareScale } from "../../scripts/map-compass/lib/overlap.mjs";
import { measureDependence, V12_CRITERIA } from "../../scripts/map-compass/lib/amend2-report.mjs";
import { runBattery, syntheticTradesV12 } from "../../scripts/map-compass/verify-claims.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ART = join(ROOT, "artifacts/map-compass");
const DOCS = join(ROOT, "docs");
const read = (p) => JSON.parse(readFileSync(join(ART, p), "utf8"));

const YEARS = ROLES.DEV;
function mkTrades({ meanR, n = 400, side = "long", state = "EXPANSION", session = "london", vol = "mid", jitter = 0.01 } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const y = YEARS[i % YEARS.length];
    return {
      netR: meanR + ((i % 7) - 3) * jitter,
      year: y,
      day: `${y}-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`,
      entryBar: `bar-${i}`,
      strategyId: "unit-test",
      state,
      side,
      session,
      vol,
    };
  });
}
function baselineWith(meanR, { fine = true, coarse = true, states = STATES } = {}) {
  const fineCells = {}, cells = {};
  for (const s of states) {
    for (const side of ["long", "short"]) {
      if (coarse) cells[`${s}|${side}`] = { n: 4000, meanNetR: meanR };
      for (const ses of ["asian", "london", "ny"])
        for (const v of ["low", "mid", "high"])
          if (fine) fineCells[`${s}|${side}|${ses}|${v}`] = { n: 4000, meanNetR: meanR, sufficient: true };
    }
  }
  return { cells, fineCells };
}

// ---------------------------------------------------------------------------
// TASK 1 — restored rule
// ---------------------------------------------------------------------------
test("A3 rule: +0.10R floor is on NET MEAN, excess control is > 0, both t > 2", () => {
  assertEqual(CLAIM_CRITERIA.practicalFloorR, 0.1);
  assertEqual(CLAIM_CRITERIA.excessFloorR, 0);
  assertEqual(CLAIM_CRITERIA.tStatMin, 2);
  assertEqual(CLAIM_CRITERIA.absoluteNetRMin, undefined, "v1.2 'net > 0' gate removed");
  assertEqual(CLAIM_CRITERIA.requireMatchedBaseline, true);
  assertEqual(CLAIM_CRITERIA.baselineMinCellN, 200);
  assertEqual(V12_CRITERIA.absoluteNetRMin, 0, "v1.2 criteria preserved as history");
});

test("A3 rule: CONFIRMED requires BOTH gates — net floor alone is not enough", () => {
  // Net mean +0.20 clears the floor; excess = 0.20 - 0.25 = -0.05 fails control.
  const notConfirmed = verifyClaim(mkTrades({ meanR: 0.2 }), {
    direction: +1,
    baseline: baselineWith(0.25),
  });
  assert(notConfirmed.meanNetR > 0.1, "net floor does pass");
  assert(notConfirmed.tNet > 2, "net t does pass");
  assert(notConfirmed.excessVsRandomR < 0, "control fails");
  assertEqual(notConfirmed.rule.netGatePass, true);
  assertEqual(notConfirmed.rule.controlGatePass, false);
  assert(notConfirmed.verdict !== "CONFIRMED", "a conjunction must not ship on one gate");
});

test("A3 rule: beating random with net mean BELOW +0.10R is NOT confirmed", () => {
  // This is the exact v1.2 hole: net mean +0.05, excess +0.15 (baseline -0.10).
  // v1.2 would have confirmed (excess > 0.10 and net > 0). v1.3 must not.
  const r = verifyClaim(mkTrades({ meanR: 0.05 }), {
    direction: +1,
    baseline: baselineWith(-0.1),
  });
  assert(r.meanNetR > 0 && r.meanNetR < 0.1, "net is positive but below the floor");
  assert(r.excessVsRandomR > 0.1, "excess would have cleared the v1.2 floor");
  assert(r.t > 2, "excess is significant");
  assertEqual(r.rule.controlGatePass, true);
  assertEqual(r.rule.netGatePass, false);
  assert(r.verdict !== "CONFIRMED", "restored net floor must block it");
});

test("A3 rule: BOTH gates passing gives CONFIRMED with no vetoes", () => {
  const r = verifyClaim(mkTrades({ meanR: 0.2 }), {
    direction: +1,
    baseline: baselineWith(-0.1),
  });
  assertEqual(r.rule.netGatePass, true);
  assertEqual(r.rule.controlGatePass, true);
  assertEqual(r.verdict, "CONFIRMED");
  assertEqual(r.vetoes.length, 0);
  assertEqual(r.baseline.mode, "MATCHED_CONTROL");
});

// ---------------------------------------------------------------------------
// TASK 2a — sign convention for shorts and longs
// ---------------------------------------------------------------------------
test("A3 2a: a SHORT winning +1.0R vs random-short -0.10R gives excess +1.10, not -1.10", () => {
  assert(Math.abs(excessFor(1.0, -0.1, +1) - 1.1) < 1e-12);
  const baseline = baselineWith(-0.1);
  const r = verifyClaim(mkTrades({ meanR: 1.0, n: 300, side: "short", jitter: 0 }), {
    direction: +1,
    baseline,
  });
  assert(Math.abs(r.excessVsRandomR - 1.1) < 1e-9, `got ${r.excessVsRandomR}`);
  assert(r.excessVsRandomR > 0, "must be POSITIVE, never -1.10");
  assert(Math.abs(r.bySide.short.excessR - 1.1) < 1e-9);
  assertEqual(r.baseline.matchLevels.fine, 300);
});

test("A3 2a: a LONG winning +1.0R vs random-long -0.10R also gives excess +1.10", () => {
  assert(Math.abs(excessFor(1.0, -0.1, +1) - 1.1) < 1e-12);
  const r = verifyClaim(mkTrades({ meanR: 1.0, n: 300, side: "long", jitter: 0 }), {
    direction: +1,
    baseline: baselineWith(-0.1),
  });
  assert(Math.abs(r.excessVsRandomR - 1.1) < 1e-9, `got ${r.excessVsRandomR}`);
  assert(Math.abs(r.bySide.long.excessR - 1.1) < 1e-9);
});

test("A3 2a: claim direction is applied to the DIFFERENCE, never to one term", () => {
  // Weakness claim (direction -1): a +1.0R short against -0.10R gives -1.10
  // in the claim's signed space, which is CORRECT (a winner refutes weakness).
  assert(Math.abs(excessFor(1.0, -0.1, -1) + 1.1) < 1e-12);
  // Baseline mean is never silently negated for a short.
  const b = matchedBaseline({ state: "EXPANSION", side: "short", session: "london", vol: "mid" }, baselineWith(-0.1));
  assertEqual(b.level, "fine");
  assertEqual(b.mean, -0.1);
});

// ---------------------------------------------------------------------------
// TASK 2b — NO_BASELINE fail-closed, never a zero fallback
// ---------------------------------------------------------------------------
test("A3 2b: missing fine AND coarse cell yields INCONCLUSIVE (NO_BASELINE)", () => {
  const empty = { cells: {}, fineCells: {} };
  const b = matchedBaseline({ state: "EXPANSION", side: "long", session: "london", vol: "mid" }, empty);
  assertEqual(b.level, NO_BASELINE);
  assertEqual(b.mean, null, "mean must be NULL, never 0");
  assertEqual(b.missing, true);

  const r = verifyClaim(mkTrades({ meanR: 0.5 }), { direction: +1, baseline: empty });
  assertEqual(r.verdict, "INCONCLUSIVE");
  assert(r.vetoes.some((v) => v.startsWith(`${NO_BASELINE}_`)), `vetoes: ${r.vetoes}`);
  assertEqual(r.baseline.mode, "MATCHED_CONTROL");
  assertEqual(r.baseline.missing, 400);
  assertEqual(r.baseline.missingFraction, 1);
  assertEqual(r.excessVsRandomR, 0, "no control data -> no fabricated excess");
  assertEqual(r.rule.controlGatePass, false);
});

test("A3 2b: even ONE unmatched trade fail-closes the whole claim", () => {
  const partial = baselineWith(-0.1);
  const trades = [
    ...mkTrades({ meanR: 0.5, n: 399 }),
    { ...mkTrades({ meanR: 0.5, n: 1 })[0], state: "ATLANTIS", verdictState: "EFFICIENT" },
  ];
  const r = verifyClaim(trades, { direction: +1, baseline: partial });
  assertEqual(r.verdict, "INCONCLUSIVE", "one missing cell cannot be rescued");
  assert(r.vetoes.some((v) => v.startsWith(`${NO_BASELINE}_1_OF_400`)));
  assertEqual(r.baseline.missing, 1);
});

test("A3 2b: baseline === null is the ONLY zero-null mode and is explicitly flagged", () => {
  const b = matchedBaseline({ state: "EXPANSION", side: "long" }, null);
  assertEqual(b.level, UNCONTROLLED);
  assertEqual(b.mean, 0);
  assertEqual(b.missing, false);
  const r = verifyClaim(mkTrades({ meanR: 0.2 }), { direction: +1 });
  assertEqual(r.baseline.mode, UNCONTROLLED);
  assertEqual(r.baseline.required, true);
  const calib = read("harness-calibration.json");
  assert(calib.baselineMode.includes("UNCONTROLLED"), "calibration must disclose this mode");
});

test("A3 2b: coverage audit reports exactly how many claim/state/session cells hit NO_BASELINE", () => {
  const cov = read("baseline-coverage.json");
  assertEqual(cov.decidedBeforeResults, true);
  assertEqual(cov.noStrategyOutcomesUsed, true);
  assertEqual(cov.rule.zeroFallback, false);
  assertEqual(cov.universe.cards, 24);
  assertEqual(cov.universe.claimHalves, 48);
  assertEqual(cov.universe.claimVerdictStateSessionCells, 136);
  assertEqual(cov.universe.claimFourStateSessionCells, 272);
  assertEqual(cov.universe.tradeLevelLookupCells, 1632);
  assertEqual(cov.answer.noBaselineTradeLevelCells, 0);
  assertEqual(cov.answer.noBaselineClaimVerdictStateSessionCells, 0);
  assertEqual(cov.answer.noBaselineClaimFourStateSessionCells, 0);
  assertEqual(cov.answer.noBaselineCards, 0);
  // Amendment 4 topped the baseline up so every verdict-state fine cell is
  // sufficient: the coarse fallback is no longer exercised, and NO_BASELINE
  // stays at zero. The v1.3 state (648 coarse fallbacks) is preserved in the
  // top-up record's before/after coverage.
  assert(cov.resolutionCounts.FINE_VERDICT_STATE > 0, "verdict-state fine cells must be exercised");
  assertEqual(cov.resolutionCounts.COARSE_FALLBACK, 0, "the top-up removed every coarse fallback");
  assertEqual(cov.answer.noBaselineTradeLevelCells, 0);
  assert(cov.topup && cov.topup.enabled, "the top-up record must be present");
  assert(cov.topup.entriesAdded > 0, "the top-up must add entries");
  const baselineReport = read("random-baseline.json");
  assertEqual(
    baselineReport.dailySumsRef,
    "artifacts/map-compass/random-baseline-daily-sums.json",
    "the per-day aggregates live in their own artifact",
  );
  assert(
    baselineReport.coverage.beforeCoarseFallbackShare >
      baselineReport.coverage.afterCoarseFallbackShare,
    "coarse fallback share must fall after the top-up",
  );
  assertEqual(baselineReport.coverage.afterCoarseFallbackShare, 0);
  assert(baselineReport.coverage.beforeCoarseFallbackShare > 0, "the pre-top-up share is a real number");
});

// ---------------------------------------------------------------------------
// TASK 3 — verdict states + report-only 2x3 power
// ---------------------------------------------------------------------------
test("A3 verdict states: EFFICIENT = EXPANSION+GRIND, CHOPPY = WHIPSAW+QUIET", () => {
  assertEqual(VERDICT_STATES.length, 2);
  assertEqual(verdictStateOf("EXPANSION"), "EFFICIENT");
  assertEqual(verdictStateOf("GRIND"), "EFFICIENT");
  assertEqual(verdictStateOf("WHIPSAW"), "CHOPPY");
  assertEqual(verdictStateOf("QUIET"), "CHOPPY");
  assertEqual(verdictStateOf("UNKNOWN"), null);
  assertEqual(otherVerdictState("EFFICIENT"), "CHOPPY");
  assertEqual(otherVerdictState("CHOPPY"), "EFFICIENT");
  assertEqual(FOUR_STATES_OF.EFFICIENT.length, 2);
  assertEqual(FOUR_STATES_OF.CHOPPY.length, 2);
});

test("A3 strength state mapping per family; weakness = the other one", () => {
  const expected = {
    "channel-breakout": "EFFICIENT",
    "ma-cross": "EFFICIENT",
    "opening-range": "EFFICIENT",
    "level-retest": "EFFICIENT",
    "band-reversion": "CHOPPY",
    "osc-fade": "CHOPPY",
    "candlestick-reversal": "CHOPPY",
    "vol-compression": "CHOPPY", // signal observed BEFORE expansion
  };
  for (const [f, s] of Object.entries(expected)) assertEqual(FAMILY_STRENGTH_STATE[f], s);
  for (const c of CLAIM_CARDS) {
    assertEqual(c.strength.state, FAMILY_STRENGTH_STATE[c.family]);
    assertEqual(c.weakness.state, otherVerdictState(c.strength.state));
    assertEqual(c.verdictStrength, c.strength.state);
    assertEqual(c.verdictWeakness, c.weakness.state);
  }
  assertEqual(validateClaimCards().length, 0, validateClaimCards().join("; "));
});

test("A3 the four Map states are reported for every claim as diagnostics only", () => {
  const r = verifyClaim(
    [
      ...mkTrades({ meanR: 0.2, n: 200, state: "EXPANSION", side: "long" }),
      ...mkTrades({ meanR: 0.2, n: 200, state: "GRIND", side: "short" }),
      ...mkTrades({ meanR: 0.2, n: 200, state: "WHIPSAW", side: "long" }),
      ...mkTrades({ meanR: 0.2, n: 200, state: "QUIET", side: "short" }),
    ],
    { direction: +1, baseline: baselineWith(-0.1) },
  );
  for (const s of STATES) {
    assert(r.byFourState[s], `${s} diagnostic must be reported`);
    assertEqual(r.byFourState[s].diagnosticOnly, true);
    assertEqual(r.byFourState[s].verdictState, VERDICT_STATE_OF[s]);
  }
  const grouped = groupByFamilyVerdictState(
    mkTrades({ meanR: 0.2, n: 12, state: "EXPANSION" }).map((t) => ({ ...t, family: "ma-cross" })),
    new Map([["unit-test", "ma-cross"]]),
  );
  assertEqual(grouped.get("ma-cross|EFFICIENT").length, 12);
});

test("A3 runBattery decides on verdict states and carries four-state diagnostics + exit caveat", () => {
  const rows = runBattery(syntheticTradesV12({ seed: 3, perCell: 30, trueEdgeR: 0 }));
  assertEqual(rows.length, 48);
  for (const row of rows) {
    assert(VERDICT_STATES.includes(row.state), `${row.claimId} state ${row.state}`);
    assert(row.fourStateDiagnostics !== undefined, "four-state diagnostics must be reported");
    assertEqual(row.fourStatesInCell.length, 2);
    if (REVERSION_FAMILIES.includes(row.family)) assertEqual(row.exitCaveat, EXIT_CAVEAT);
    else assertEqual(row.exitCaveat, null);
  }
});

test("A3 0.2071 overlap provenance is reproducible and used NO outcomes", () => {
  const dep = measureDependence();
  assertEqual(dep.overlapFraction, 0.2071);
  assertEqual(dep.designEffect, 1.2316);
  assertEqual(dep.seInflation, 1.009);
  assertEqual(dep.dayClusters, 4032);
  assertEqual(syntheticTradesV12({ seed: 7, perCell: 900, trueEdgeR: 0 }).length, 43200);
  const v13 = read("power-projection.json").reportOnlyV13;
  assert(v13.overlapProvenance.v12.v12Source.includes("trueEdgeR:0"), "provenance must name the zero-edge data");
  assert(v13.overlapProvenance.v12.v12Source.includes("NOT used"));
  assertEqual(v13.overlapProvenance.v13.noOutcomesUsed, true);
  assertEqual(v13.overlapProvenance.seInflationProvenance.value, 1.009);
});

test("A3 recomputed within-family overlap uses only card relations + a seeded RNG", () => {
  const o = recomputeWithinFamilyOverlap();
  assertEqual(o.usesOutcomes, false);
  assertEqual(o.decidedBeforeResults, true);
  assertEqual(o.nearDuplicatePairs.length, 11);
  assertEqual(o.mirrorImagePairs.length, 1);
  assertEqual(o.relatedPairs.length, 12);
  assertEqual(Object.keys(o.byFamily).length, 8);
  assert(o.pooled.designEffect > 1.2316, "near-duplicates must raise the design effect");
  assert(o.pooled.overlapFraction > 0.2071);
  const sweep = sweepShareScale([0, 0.5, 1]);
  assertEqual(sweep.length, 3);
  assert(sweep[2].designEffect >= sweep[0].designEffect, "more sharing -> higher design effect");
  assertEqual(CARD_RELATIONS.length, 24);
  assert(NEAR_DUPLICATES.some((p) => p.includes("donchian-20") && p.includes("donchian-55")));
  assert(MIRROR_IMAGES.some((p) => p.includes("pdh-retest") && p.includes("pdl-retest")));
});

test("A3 report-only power table is exactly 2 verdict states x 3 sessions", () => {
  const p = read("power-projection.json");
  const v = p.reportOnlyV13;
  assert(v !== undefined);
  assertEqual(v.criteriaChanged, false);
  assertEqual(v.thresholdChanged, false);
  assertEqual(v.verdictChanged, false);
  assertEqual(v.verdictUnchangedFrom, p.verdict);
  assertEqual(v.criteriaHash, createHash("sha256").update(JSON.stringify(CLAIM_CRITERIA)).digest("hex"));
  assertEqual(v.powerTable2x3.length, 6);
  assertEqual(v.verdictStates.cells, "2 states x 3 sessions = 6");
  for (const row of v.powerTable2x3) {
    assert(VERDICT_STATES.includes(row.verdictState));
    assert(["asian", "london", "ny"].includes(row.session));
    assert(row.devCalendarDays > 0, "real day-cluster count");
    assert(row.dayClusterSeInflation === 1.009);
    assertEqual(row.designEffect, v.overlapProvenance.v13.pooled.designEffect);
    assert(row.nEffective < row.projectedTrades, "effective N must be smaller");
    assert(row.jointPowerConservative <= row.iidPowerAtFloor, "clustering cannot raise power");
  }
  assertEqual(v.pooledByVerdictState.length, 2);
  assertEqual(p.verdict, "UNDERPOWERED");
  assert(v.readout.totalCells === 6);
  assertEqual(p.reportOnly.supersededBy, "reportOnlyV13");
});

// ---------------------------------------------------------------------------
// TASK 4 — reversion exit caveat
// ---------------------------------------------------------------------------
test("A3 4: reversion families carry the standard-exit caveat; no new exit exists", () => {
  assertEqual(EXIT_CAVEAT, "under the standard exit (1.5 ATR stop, 2R target) only");
  for (const f of REVERSION_FAMILIES) {
    const cards = CLAIM_CARDS.filter((c) => c.family === f);
    assertEqual(cards.length, 3);
    for (const c of cards) assertEqual(c.exitCaveat, EXIT_CAVEAT);
  }
  const v = read("power-projection.json").reportOnlyV13;
  assertEqual(v.reversionCaveat.label, EXIT_CAVEAT);
  assert(v.reversionCaveat.note.includes("No new exit") || v.reversionCaveat.note.includes("NO new exit"));
  const cov = read("baseline-coverage.json");
  assertEqual(cov.reversionCaveat.label, EXIT_CAVEAT);
  assertEqual(cov.verdictLabelSummary.totalVerdictSlots, 48);
  assertEqual(cov.verdictLabelSummary.labelledReversionSlots, 18); // 3 families x 3 cards x 2 halves
  assertEqual(cov.verdictLabels.length, 48);
  for (const l of cov.verdictLabels) {
    assertEqual(l.verdictExists, false, "no real verdict may exist yet");
    if (l.reversionFamily) assert(l.verdictLabel.endsWith(EXIT_CAVEAT), `${l.claimId} ${l.kind} must be labelled`);
    else assert(!l.verdictLabel.includes(EXIT_CAVEAT));
  }
});

// ---------------------------------------------------------------------------
// TASK 5 — tiers replaced, TEST_ORDER stable
// ---------------------------------------------------------------------------
test("A3 5: one opened empirical study per family (full URL) or PRACTITIONER_ONLY", () => {
  assertEqual(Object.keys(EMPIRICAL_STUDIES).length, 8);
  let practitioner = 0;
  for (const [f, s] of Object.entries(EMPIRICAL_STUDIES)) {
    assert(s.url.startsWith("http"), `${f} needs a full URL, got ${s.url}`);
    assert(s.citation.length > 20, `${f} needs a citation`);
    assert(s.tests.length > 10, `${f} must state what was tested`);
    assert(["PEER_REVIEWED_TEST", "PRACTITIONER_ONLY"].includes(s.grade));
    if (s.grade === "PRACTITIONER_ONLY") practitioner++;
    for (const c of CLAIM_CARDS.filter((x) => x.family === f))
      assertEqual(c.evidence.url, s.url, `${c.id} must carry the study URL`);
  }
  assertEqual(practitioner, 1, "only vol-compression is practitioner only");
  assertEqual(EMPIRICAL_STUDIES["vol-compression"].grade, "PRACTITIONER_ONLY");
  assertEqual(EVIDENCE.tiers, undefined, "old subjective tiers must be gone");
  assert(EVIDENCE.studies !== undefined);
});

test("A3 5: TEST_ORDER is byte-identical to v1.2 (explicit frozen sequence)", () => {
  assertEqual(TEST_ORDER.length, 24);
  assertEqual(FROZEN_TEST_SEQUENCE.length, 24);
  assertEqual(JSON.stringify(TEST_ORDER.map((t) => t.id)), JSON.stringify(FROZEN_TEST_SEQUENCE));
  const tiers = TEST_ORDER.map((t) => t.tier);
  assertEqual(JSON.stringify(tiers), JSON.stringify([...tiers].sort((a, b) => a - b)));
  const last3 = TEST_ORDER.slice(-3).map((t) => CLAIM_CARDS.find((c) => c.id === t.id).family);
  assert(last3.every((f) => f === "candlestick-reversal"));
});

// ---------------------------------------------------------------------------
// TASK 6 — version snapshots / hashes
// ---------------------------------------------------------------------------
test("A3 6: v1.0, v1.1, v1.2, v1.3 snapshots are preserved with full SHA-256", () => {
  const h = (f) => createHash("sha256").update(readFileSync(join(DOCS, f))).digest("hex");
  const v10 = h("BLUEPRINT-v1.0.md");
  const v11 = h("BLUEPRINT-v1.1.md");
  const v12 = h("BLUEPRINT-v1.2.md");
  const v13 = h("BLUEPRINT-v1.3.md");
  const v14 = h("BLUEPRINT-v1.4.md");
  assertEqual(v10.length, 64);
  assertEqual(v11.length, 64);
  assertEqual(v12.length, 64);
  assertEqual(v13.length, 64);
  assertEqual(v11, "72c078f335fb77b1a1260a49e39cbc856afda6ce9ac5635fd5ad345dcb7dd480");
  assertEqual(v12, "cf3c94b1f505dc31828ce740dceb0e7989a606f62cf28c8d48cf91713917d543");
  const hashes = read("blueprint-hashes.json");
  assertEqual(hashes.v10.full, v10);
  assertEqual(hashes.v11.full, v11);
  assertEqual(hashes.v12.full, v12);
  assertEqual(hashes.v13.full, v13);
  assertEqual(v14.length, 64);
  assertEqual(hashes.v14.full, v14);
  const log = readFileSync(join(DOCS, "BLUEPRINT-AMENDMENTS.md"), "utf8");
  assert(
    log.includes(v10) && log.includes(v11) && log.includes(v12) && log.includes(v13) && log.includes(v14),
    "all five hashes printed in the log",
  );
  assert(log.toLowerCase().includes("reconstruct"), "v1.0 reconstruction described");
});

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------
test("A3: cards are STILL DRAFT and no real verification was run", () => {
  assertEqual(FREEZE.status, "DRAFT");
  assertEqual(FREEZE.approvedBy, null);
  assert(!existsSync(join(ART, "claim-verification.json")), "no real strategy result may exist");
  const routing = read("routing-table.json");
  assertEqual(routing.enabledCount, 0);
  assertEqual(routing.conditionalPolicy.compassCanEnableConditional, false);
  assertEqual(routing.verdictStates.length, 2);
});
