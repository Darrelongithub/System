/** G0 AMENDMENT 2 (2026-10-27) — pin the pre-results decisions in tests. */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { test, assert, assertEqual } from "../tiny.mjs";
import {
  EXIT_HARNESS,
  CLAIM_CRITERIA,
  SENSITIVITY_RULE,
  ROLES,
  STATES,
} from "../../scripts/map-compass/frozen.mjs";
import { CLAIM_CARDS, FREEZE, TEST_ORDER } from "../../scripts/map-compass/claim-cards.draft.mjs";
import { clusterSe, effectiveCounts, dayKey, ci95 } from "../../scripts/map-compass/lib/cluster.mjs";
import { verifyClaim } from "../../scripts/map-compass/lib/verification.mjs";
import {
  buildRoutingTable,
  conditionalValPromotions,
  CONDITIONAL_NOT_ENABLED,
} from "../../scripts/map-compass/lib/compass.mjs";
import { resolveTrade } from "../../scripts/map-compass/lib/trade.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ART = join(ROOT, "artifacts/map-compass");
const DOCS = join(ROOT, "docs");
const read = (p) => JSON.parse(readFileSync(join(ART, p), "utf8"));

test("Amendment 2: frozen criteria are byte-for-byte unchanged", () => {
  assertEqual(CLAIM_CRITERIA.minTradesPerCell, 100);
  assertEqual(CLAIM_CRITERIA.practicalFloorR, 0.1);
  assertEqual(CLAIM_CRITERIA.tStatMin, 2);
  assertEqual(CLAIM_CRITERIA.excessFloorR, 0);
  assertEqual(CLAIM_CRITERIA.concentrationMax, 0.5);
  assertEqual(CLAIM_CRITERIA.loyoPositiveMin, 0.75);
  assertEqual(EXIT_HARNESS.stopAtrMultiple, 1.5);
  assertEqual(EXIT_HARNESS.targetR, 2);
  assertEqual(EXIT_HARNESS.trailing, false);
  const projection = read("power-projection.json");
  assertEqual(projection.verdict, "UNDERPOWERED");
  // v1.2's reportOnly block is a FROZEN HISTORICAL snapshot; its hash is the
  // v1.2 criteria hash, not the current one (Amendment 3 changed the rule).
  assertEqual(
    projection.reportOnly.criteriaHash,
    "788e01dff4bba7455058fdcdf7fecb31dfb8f4c5215702a0e8bf50e0ef98b5e6",
  );
  assertEqual(projection.reportOnly.supersededBy, "reportOnlyV13");
  assertEqual(
    projection.reportOnlyV13.criteriaHash,
    createHash("sha256").update(JSON.stringify(CLAIM_CRITERIA)).digest("hex"),
  );
  assertEqual(projection.reportOnly.criteriaChanged, false);
  assertEqual(projection.reportOnly.thresholdChanged, false);
  assertEqual(projection.reportOnly.verdictChanged, false);
});

test("Amendment 2: maxHoldBars 96 is frozen in EXIT_HARNESS with a pre-results record", () => {
  assertEqual(EXIT_HARNESS.maxHoldBars, 96);
  assertEqual(EXIT_HARNESS.timeExitLabel, "TIME_EXIT");
  assertEqual(EXIT_HARNESS.amendment.date, "2026-10-27");
  assertEqual(EXIT_HARNESS.amendment.decidedBeforeResults, true);
  assertEqual(EXIT_HARNESS.amendment.criteriaChanged, false);
  assertEqual(EXIT_HARNESS.amendment.baselineTimeExitCount, 398);
  assertEqual(EXIT_HARNESS.amendment.baselineResolvedTotal, 32000);
});

test("Amendment 2: resolveTrade defaults to the frozen TIME_EXIT cap", () => {
  const bars = Array.from({ length: 130 }, (_, i) => ({
    datetime: `2020-01-${String(1 + (i % 28)).padStart(2, "0")} 10:00`,
    o: 100,
    h: 100,
    l: 100,
    c: 100,
    v: 1,
  }));
  const r = resolveTrade(bars, 0, "long", 1, {});
  assertEqual(r.outcome, "TIME_EXIT");
  assertEqual(r.barsHeld, EXIT_HARNESS.maxHoldBars);
  // Flat bars must not be booked as a fictional +0R edge.
  assert(r.netR < 0, "round-trip cost must still be charged on TIME_EXIT");
});

test("Amendment 2: TIME_EXIT share is reported from baseline diagnostics", () => {
  const b = read("random-baseline.json");
  const t = b.timeExitShare;
  assert(t !== undefined, "timeExitShare must be reported");
  assertEqual(t.capBars, 96);
  assertEqual(t.count, 398);
  // Amendment 4's baseline top-up added 538 entries (none TIME_EXIT), so the
  // resolved total is now 32538. The v1.2 value 398/32000 = 1.24375% is kept in
  // EXIT_HARNESS.amendment as the historical pre-top-up record.
  assert(t.resolvedTotal >= 32000, "the top-up can only add entries");
  assert(Math.abs(t.share - t.count / t.resolvedTotal) < 1e-7, "share must equal count/resolvedTotal");
  assertEqual(EXIT_HARNESS.amendment.baselineResolvedTotal, 32000);
  assertEqual(EXIT_HARNESS.amendment.baselineTimeExitShare, 0.012438);
  assertEqual(EXIT_HARNESS.maxHoldBars, 96);
});

test("clusterSe: CR1 inflates the SE when same-day residuals correlate", () => {
  // 4 days x 3 identical trades each. Within a day the residual is identical,
  // so the clustered SE must exceed the i.i.d. SE.
  const values = [], keys = [];
  for (let d = 0; d < 4; d++) {
    for (let k = 0; k < 3; k++) {
      values.push(d === 0 ? 5 : d === 1 ? -5 : d === 2 ? 3 : -3);
      keys.push(`2020-01-0${d + 1}`);
    }
  }
  const r = clusterSe(values, keys);
  assertEqual(r.n, 12);
  assertEqual(r.clusters, 4);
  assert(r.se > r.plainSe * 1.4, `clustered SE ${r.se} must exceed plain ${r.plainSe}`);
  assert(r.inflation > 1.4);
  const ci = ci95(0, r.se);
  assert(ci[0] < 0 && ci[1] > 0);
});

test("clusterSe: one observation per day reduces to the ordinary SE (up to CR1)", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8];
  const keys = values.map((_, i) => `day-${i}`);
  const r = clusterSe(values, keys);
  assertEqual(r.clusters, 8);
  // With one observation per cluster the CR1 factor G/(G-1) exactly cancels,
  // so the clustered SE equals the ordinary one — no artificial inflation.
  assert(Math.abs(r.se - r.plainSe) < 1e-9, `clustered ${r.se} vs plain ${r.plainSe}`);
  assertEqual(dayKey({ year: 2011, day: "2011-05-09" }), "2011-05-09");
  assertEqual(dayKey({ year: 2011 }), "year:2011");
});

test("effectiveCounts: Kish effective N penalises overlapping variant entry bars", () => {
  const independent = effectiveCounts([{ entryBar: 1 }, { entryBar: 2 }, { entryBar: 3 }]);
  assertEqual(independent.nEffective, 3);
  assertEqual(independent.overlapFraction, 0);
  const overlapped = effectiveCounts([{ entryBar: 1 }, { entryBar: 1 }, { entryBar: 1 }]);
  assertEqual(overlapped.nEffective, 1);
  assertEqual(overlapped.overlapFraction, 1);
  assertEqual(overlapped.designEffect, 3);
  const mixed = effectiveCounts([
    { entryBar: 1 }, { entryBar: 1 }, { entryBar: 2 }, { entryBar: 3 },
  ]);
  assertEqual(mixed.overlapFraction, 0.5);
  assert(mixed.nEffective < 4 && mixed.nEffective > 1);
});

test("verifyClaim: every t/CI is CR1 cluster-robust by calendar day", () => {
  const trades = [];
  for (let d = 0; d < 200; d++) {
    for (let k = 0; k < 3; k++) {
      trades.push({
        year: ROLES.DEV[d % ROLES.DEV.length],
        day: `${ROLES.DEV[d % ROLES.DEV.length]}-${String(1 + (d % 12)).padStart(2, "0")}-${String(1 + (d % 28)).padStart(2, "0")}`,
        entryBar: `${ROLES.DEV[d % ROLES.DEV.length]}|${d}|${k}`,
        netR: 0.5 + (d % 2 ? 0.1 : -0.1),
        side: k % 2 ? "short" : "long",
        state: STATES[0],
      });
    }
  }
  const out = verifyClaim(trades, { direction: +1 });
  assertEqual(out.inference.method, "CR1_cluster_by_calendar_day");
  assertEqual(out.inference.clusterField, "day");
  assert(out.inference.clusters > 1);
  assert(out.inference.clusteredSe > 0);
  assertEqual(out.inference.effectiveNMethod, "Kish_over_entry_bars");
  assert(out.nEffective > 0 && out.nEffective <= out.n);
  assert(Array.isArray(out.excessCi95) && out.excessCi95.length === 2);
  assert(Array.isArray(out.meanCi95) && out.meanCi95.length === 2);
  assert(out.t !== undefined && out.tNet !== undefined);
  for (const y of Object.values(out.years)) assert(Array.isArray(y.ci95));
  for (const s of Object.values(out.bySide)) assert(Array.isArray(s.ci95));
});

test("Amendment 2: CONDITIONAL default NO — Compass cannot enable it", () => {
  const c = CLAIM_CARDS[0];
  const verdicts = new Map([[`${c.id}|${c.strength.state}`, "CONFIRMED"]]);
  const without = buildRoutingTable(verdicts, CLAIM_CARDS);
  assert(without.table[c.strength.state].includes(c.id), "control: non-conditional claim ships");

  const blocked = buildRoutingTable(verdicts, CLAIM_CARDS, { conditionalIds: new Set([c.id]) });
  assert(!blocked.table[c.strength.state].includes(c.id), "CONDITIONAL must NOT ship");
  assertEqual(
    blocked.reasons.find((r) => r.id === c.id).decision,
    CONDITIONAL_NOT_ENABLED,
  );
  assertEqual(blocked.conditionalPolicy.compassCanEnableConditional, false);
  assert(blocked.conditionalPolicy.blockedConditionalIds.includes(c.id));
  assertEqual(blocked.conditionalPolicy.valPromotedConditionalIds.length, 0);
  assertEqual(SENSITIVITY_RULE.conditionalReportAt.join(","), "M9,M10");
});

test("Amendment 2: only VAL support under the SAME frozen criteria promotes CONDITIONAL", () => {
  const c = CLAIM_CARDS[0];
  const stats = {
    n: 500,
    meanNetR: 0.25, // restored +0.10R NET floor
    tNet: 3.5,
    excessVsRandomR: 0.25, // control: excess > 0
    t: 3.1,
    baseline: { mode: "MATCHED_CONTROL", missing: 0 },
    vetoes: [],
  };
  const weak = [
    { claimId: c.id, kind: "strength", windowKind: "DEV", verdict: "CONFIRMED", conditional: true, stats },
    { claimId: c.id, kind: "strength", windowKind: "STRESS", verdict: "CONFIRMED", conditional: true, stats },
  ];
  assertEqual(conditionalValPromotions(weak).size, 0, "STRESS can never promote");
  const val = {
    claimId: c.id, kind: "strength", windowKind: "VAL",
    verdict: "CONFIRMED", conditional: true, stats,
  };
  assertEqual(conditionalValPromotions([val]).size, 1);
  const barely = { ...val, stats: { ...stats, tNet: 1.9 } };
  assertEqual(conditionalValPromotions([barely]).size, 0, "t > 2 must not be softened");
  const noNetFloor = { ...val, stats: { ...stats, meanNetR: 0.05 } };
  assertEqual(conditionalValPromotions([noNetFloor]).size, 0, "+0.10R net floor must not be softened");
  const vetoed = { ...val, stats: { ...stats, vetoes: ["CONCENTRATION_0.8"] } };
  assertEqual(conditionalValPromotions([vetoed]).size, 0);
  const noBaseline = { ...val, stats: { ...stats, baseline: { mode: "UNCONTROLLED_DRY_RUN", missing: 5 } } };
  assertEqual(conditionalValPromotions([noBaseline]).size, 0, "NO_BASELINE row cannot promote");

  const verdicts = new Map([[`${c.id}|${c.strength.state}`, "CONFIRMED"]]);
  const promoted = buildRoutingTable(verdicts, CLAIM_CARDS, {
    conditionalIds: new Set([c.id]),
    records: [val],
  });
  assert(promoted.table[c.strength.state].includes(c.id), "VAL-backed CONDITIONAL may ship");
  assertEqual(promoted.reasons.find((r) => r.id === c.id).valSupport, true);
  assert(promoted.conditionalPolicy.valPromotedConditionalIds.includes(c.id));
});

test("Amendment 2: power report-only block exists and does not change criteria", () => {
  const p = read("power-projection.json");
  const r = p.reportOnly;
  assert(r !== undefined);
  assertEqual(r.decidedBeforeResults, true);
  assertEqual(r.criteriaChanged, false);
  assertEqual(r.verdictUnchangedFrom, p.verdict);
  assertEqual(r.criteria.practicalFloorR, 0.1);
  assertEqual(r.criteria.tStatMin, 2);
  assert(r.inference.tAndCiMethod.includes("CR1"));
  assert(r.centralCaseAdjusted.length === STATES.length);
  for (const c of r.centralCaseAdjusted)
    assert(c.measuredOverlap.powerAtFloor <= c.iidPowerAtFloor, "clustering can only lower power");
  assert(r.forbiddenResponses.some((x) => x.includes("0.10R")));
  assert(r.conditional.userDefault === "no");
  assertEqual(r.conditional.compassCanEnableConditional, false);
  assertEqual(r.timeExit.maxHoldBars, 96);
  assertEqual(r.timeExit.baselineCount, 398);
});

test("Amendment 2: version snapshots, amendment log, and full-text card dump exist", () => {
  const v10 = join(DOCS, "BLUEPRINT-v1.0.md");
  const v11 = join(DOCS, "BLUEPRINT-v1.1.md");
  const v12 = join(DOCS, "BLUEPRINT-v1.2.md");
  const log = join(DOCS, "BLUEPRINT-AMENDMENTS.md");
  const cards = join(DOCS, "CLAIM-CARDS-FULL-TEXT.md");
  assert(existsSync(v10), "v1.0 must be preserved");
  assert(existsSync(v11), "v1.1 must be preserved");
  assert(existsSync(v12), "v1.2 must be preserved");
  assert(existsSync(log), "dated amendment log must exist");
  assert(existsSync(cards));
  assertEqual(
    createHash("sha256").update(readFileSync(v11)).digest("hex"),
    "72c078f335fb77b1a1260a49e39cbc856afda6ce9ac5635fd5ad345dcb7dd480",
  );
  const full = readFileSync(cards, "utf8");
  for (const o of TEST_ORDER) assert(full.includes(`## ${o.testOrder}. \`${o.id}\``), `missing card ${o.id}`);
  assert(full.includes("DRAFT"));
  const amendments = readFileSync(log, "utf8");
  for (const d of ["2026-10-26", "2026-10-27"]) assert(amendments.includes(d));
  assert(amendments.toLowerCase().includes("conditional"));
  assert(amendments.includes("1.24375"));
});

test("Amendment 2: claim cards are STILL DRAFT and no real verification was run", () => {
  assertEqual(FREEZE.status, "DRAFT");
  assertEqual(FREEZE.approvedBy, null);
  assertEqual(CLAIM_CARDS.length, 24);
  assert(!existsSync(join(ART, "claim-verification.json")), "no real strategy result may exist");
  const routing = read("routing-table.json");
  assertEqual(routing.enabledCount, 0);
  assertEqual(routing.conditionalPolicy.compassCanEnableConditional, false);
});
