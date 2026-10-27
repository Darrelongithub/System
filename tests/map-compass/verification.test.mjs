/** M5 verification harness, placebo, ledger and power tests. */
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, assert, assertEqual } from "../tiny.mjs";
import { ROLES, CLAIM_CRITERIA, STATES } from "../../scripts/map-compass/frozen.mjs";
import {
  verifyClaim,
  tStat,
  stdev,
  mde,
  powerAt,
  groupByFamilyState,
  groupByStrategyState,
} from "../../scripts/map-compass/lib/verification.mjs";
import {
  blockCircularShift,
  mulberry32,
  placeboDistribution,
} from "../../scripts/map-compass/lib/placebo.mjs";
import {
  readLedger,
  appendVerdict,
  writeLedger,
  claimHash,
} from "../../scripts/map-compass/lib/claim-ledger.mjs";
import { runBattery, syntheticTrades } from "../../scripts/map-compass/verify-claims.mjs";
import { CLAIM_CARDS } from "../../scripts/map-compass/claim-cards.draft.mjs";

const A = (p) => new URL(`../../artifacts/map-compass/${p}`, import.meta.url);
const rng = mulberry32(42);
const normal = (mean, sd, n) =>
  Array.from({ length: n }, (_, i) => ({
    netR: mean + sd * (rng() + rng() + rng() + rng() + rng() + rng() - 3) * 1.414,
    year: ROLES.DEV[i % ROLES.DEV.length],
    state: "QUIET",
  }));

test("stdev / tStat are correct on a known series", () => {
  assertEqual(stdev([1, 1, 1]), 0);
  assertEqual(stdev([2, 4, 4, 4, 5, 5, 7, 9]), 2.138089935299395);
  assert(
    tStat(normal(0.5, 1, 200).map((t) => t.netR)) > 5,
    "a large known mean must give a large t",
  );
});

test("verifyClaim CONFIRMS a real, consistent edge", () => {
  const trades = normal(0.25, 1.43, 1200);
  const r = verifyClaim(trades, { direction: +1 });
  assertEqual(r.verdict, "CONFIRMED");
  assert(r.meanNetR > CLAIM_CRITERIA.practicalFloorR);
  assert(r.t > CLAIM_CRITERIA.tStatMin);
  assertEqual(r.vetoes.length, 0);
});

test("verifyClaim REFUTES a claim whose edge points the other way", () => {
  const r = verifyClaim(normal(-0.3, 1.43, 1200), { direction: +1 });
  assertEqual(r.verdict, "REFUTED");
});

test("weakness claims use direction -1 (negative expectancy is the win)", () => {
  const r = verifyClaim(normal(-0.25, 1.43, 1200), { direction: -1 });
  assertEqual(r.verdict, "CONFIRMED");
});

test("too few trades -> INCONCLUSIVE, never CONFIRMED", () => {
  const r = verifyClaim(normal(0.9, 1.43, 40), { direction: +1 });
  assertEqual(r.verdict, "INCONCLUSIVE");
  assert(r.vetoes.some((v) => v.startsWith("MIN_TRADES")));
});

test("concentration veto kills a one-year wonder", () => {
  const trades = [];
  for (let i = 0; i < 1200; i++) {
    // all the profit in 2010, noise elsewhere
    const y = ROLES.DEV[i % ROLES.DEV.length];
    trades.push({ netR: (y === 2010 ? 2.5 : 0) + (rng() - 0.5) * 0.5, year: y, state: "QUIET" });
  }
  const r = verifyClaim(trades, { direction: +1 });
  assert(
    r.vetoes.some((v) => v.startsWith("CONCENTRATION")),
    `vetoes: ${r.vetoes}`,
  );
  assertEqual(r.verdict, "INCONCLUSIVE");
});

test("LOYO veto kills an edge present in too few years", () => {
  const trades = [];
  for (let i = 0; i < 1200; i++) {
    const y = ROLES.DEV[i % ROLES.DEV.length];
    const good = [2004, 2005, 2006].includes(y);
    trades.push({ netR: (good ? 0.4 : -0.4) + (rng() - 0.5) * 0.5, year: y, state: "QUIET" });
  }
  const r = verifyClaim(trades, { direction: +1 });
  assert(
    r.vetoes.some((v) => v.startsWith("LOYO")) ||
      r.vetoes.some((v) => v.startsWith("CONCENTRATION")),
    `vetoes: ${r.vetoes}`,
  );
  assert(r.verdict !== "CONFIRMED", "a vetoed claim must never be CONFIRMED");
});

test("G0 RULE: definition-sensitivity GRADES but does NOT nullify the verdict", () => {
  // Decided before results: frozen cutoffs are authoritative. Letting the
  // sweep nullify them would hand threshold selection to the sweep.
  const robust = verifyClaim(normal(0.25, 1.43, 1200), {
    direction: +1,
    sensitivityAgreementPct: 100,
  });
  assertEqual(robust.verdict, "CONFIRMED");
  assertEqual(robust.stability, "ROBUST");
  assertEqual(robust.conditional, false);

  const fragile = verifyClaim(normal(0.25, 1.43, 1200), {
    direction: +1,
    sensitivityAgreementPct: 60,
  });
  assertEqual(fragile.verdict, "CONFIRMED", "verdict must survive a sweep flip");
  assertEqual(fragile.stability, "FRAGILE");
  assertEqual(fragile.conditional, false);

  const defSens = verifyClaim(normal(0.25, 1.43, 1200), {
    direction: +1,
    sensitivityAgreementPct: 20,
  });
  assertEqual(defSens.verdict, "CONFIRMED");
  assertEqual(defSens.stability, "DEFINITION_SENSITIVE");
  assertEqual(defSens.conditional, true, "tagged CONDITIONAL for separate M9/M10 reporting");
  assert(!defSens.vetoes.some((v) => v.startsWith("DEFINITION_SENSITIVE")));
});

test("holdout years are NEVER read by verification", () => {
  const trades = [
    ...normal(0, 1.43, 100),
    ...ROLES.HOLDOUT.flatMap((y) =>
      Array.from({ length: 500 }, () => ({ netR: 99, year: y, state: "QUIET" })),
    ),
  ];
  const r = verifyClaim(trades, { direction: +1 });
  for (const y of ROLES.HOLDOUT) assert(!(y in r.years), `holdout ${y} leaked into stats`);
  assert(r.meanNetR < 1, `injected holdout profit must not affect the mean (got ${r.meanNetR})`);
  assertEqual(r.n, 100, "only the 100 DEV trades may be counted");
});

test("mde / powerAt match the analytic values", () => {
  assert(Math.abs(mde(1600, 1.43) - 0.1001) < 0.002);
  assert(powerAt(1600, 1.43, 0.1) > 0.75);
  assert(powerAt(100, 1.43, 0.1) < 0.2);
  assertEqual(powerAt(0, 1.43, 0.1), 0);
});

test("blockCircularShift preserves per-year state counts and persistence", () => {
  const trades = [];
  for (let i = 0; i < 300; i++) {
    const y = ROLES.DEV[i % 4];
    const s = STATES[Math.floor(i / 20) % 4]; // runs of 20 -> persistence
    trades.push({ netR: rng(), year: y, state: s, strategyId: "x" });
  }
  const { shifted, offsets } = blockCircularShift(trades, mulberry32(7));
  assertEqual(shifted.length, trades.length);
  assert(Object.keys(offsets).length > 0);
  const before = {},
    after = {};
  for (const t of trades)
    before[`${t.year}|${t.state}`] = (before[`${t.year}|${t.state}`] ?? 0) + 1;
  for (const t of shifted) after[`${t.year}|${t.state}`] = (after[`${t.year}|${t.state}`] ?? 0) + 1;
  const sorted = (o) => JSON.stringify(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  assertEqual(sorted(before), sorted(after), "per-year state counts must be preserved");
  assert(
    trades.every((t, i) => t.netR === shifted[i].netR),
    "returns must be untouched",
  );
  assert(
    trades.some((t, i) => t.state !== shifted[i].state),
    "labels must actually move",
  );
});

test("placebo null distribution has a bounded false-confirm floor", () => {
  const trades = syntheticTrades({ seed: 5, perCell: 120, trueEdgeR: 0 });
  const p = placeboDistribution(trades, (t) => runBattery(t), { shuffles: 8, seed: 1 });
  assert(p.counts.length === 8);
  assert(p.medianFakeConfirms >= 0);
  assert(p.p95FakeConfirms >= p.medianFakeConfirms);
  assert(p.note.includes("p95FakeConfirms"));
});

test("ledger is append-only and re-runs are flagged", () => {
  const dir = mkdtempSync(join(tmpdir(), "mc-ledger-"));
  const path = join(dir, "l.jsonl");
  try {
    const rec = {
      claimId: "x",
      state: "QUIET",
      kind: "strength",
      windowKind: "DEV",
      verdict: "CONFIRMED",
      stats: { n: 10 },
    };
    const a = appendVerdict(path, rec);
    const b = appendVerdict(path, rec);
    assertEqual(a.rerun, false);
    assertEqual(b.rerun, true, "second evaluation must be flagged as a rerun");
    const lines = readLedger(path);
    assertEqual(lines.length, 2, "prior line must not be deleted");
    assertEqual(lines[0].seq, 1);
    assertEqual(lines[1].seq, 2);
    assertNotEqual(lines[0].id, lines[1].id);
    writeLedger(path, lines);
    assertEqual(readLedger(path).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  function assertNotEqual(a, b) {
    assert(a !== b, "ids must differ");
  }
});

test("claimHash is deterministic", () => {
  assertEqual(claimHash({ a: 1 }), claimHash({ a: 1 }));
  assert(claimHash({ a: 1 }) !== claimHash({ a: 2 }));
});

test("groupByFamilyState pools 3 variants; strategy level stays separate", () => {
  const cards = new Map(CLAIM_CARDS.map((c) => [c.id, c.family]));
  const trades = CLAIM_CARDS.slice(0, 3).flatMap((c) => [
    { strategyId: c.id, state: "QUIET", netR: 0.2, year: 2004 },
    { strategyId: c.id, state: "QUIET", netR: 0.3, year: 2005 },
  ]);
  const fam = groupByFamilyState(trades, cards);
  const strat = groupByStrategyState(trades);
  assertEqual(fam.get(`${CLAIM_CARDS[0].family}|QUIET`).length, 6, "pooled across 3 variants");
  assertEqual(strat.get(`${CLAIM_CARDS[0].id}|QUIET`).length, 2);
});

test("M5 dry-run calibration report exists and passes the harness kill criterion", () => {
  const p = A("harness-calibration.json");
  assert(existsSync(p), "run verify-claims.mjs --dry-run first");
  const d = JSON.parse(readFileSync(p, "utf8"));
  assertEqual(d.mode, "DRY_RUN_CALIBRATION");
  assertEqual(d.cardsFrozen, false, "dry-run must not require frozen cards");
  assert(d.calibration.falsePositiveRate < 0.05, "false positives must be controlled");
  assert(d.calibration.knownEdgeDetectionRate > 0.8, "a known edge must be detected");
  assert(d.powerTable.length >= 6);
});

test("power projection is HONEST: EXPANSION is underpowered at realistic density", () => {
  const p = A("power-projection.json");
  assert(existsSync(p), "run power-check.mjs first");
  const d = JSON.parse(readFileSync(p, "utf8"));
  assert(d.flatPct > 20, "flat-bar rate must be surfaced");
  assert(d.grossEdgeNeededR > 0.2, "cost must be included in the required gross edge");
  assert(
    d.centralCase.find((r) => r.state === "EXPANSION").powerAtFloor < 0.8,
    "EXPANSION underpowerment must be reported, not hidden",
  );
  assert(d.centralCase.find((r) => r.state === "QUIET").powerAtFloor > 0.8);
  assertEqual(d.verdict, "UNDERPOWERED");
});
