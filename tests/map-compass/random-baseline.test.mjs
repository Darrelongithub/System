/**
 * Random-entry control + seal-bleed documentation tests.
 * The bull-run control is the most important addition from the G0 review:
 * without it, "go long with 2R target" looks like an edge in a rising market.
 */
import { readFileSync, existsSync } from "node:fs";
import { test, assert, assertEqual } from "../tiny.mjs";
import {
  RANDOM_BASELINE,
  ROLES,
  STATES,
  CLAIM_CRITERIA,
  SENSITIVITY_RULE,
  EVIDENCE,
} from "../../scripts/map-compass/frozen.mjs";
import { verifyClaim, matchedBaseline } from "../../scripts/map-compass/lib/verification.mjs";
import { TEST_ORDER, CLAIM_CARDS } from "../../scripts/map-compass/claim-cards.draft.mjs";

const A = (p) => new URL(`../../artifacts/map-compass/${p}`, import.meta.url);
const baseline = existsSync(A("random-baseline.json"))
  ? JSON.parse(readFileSync(A("random-baseline.json"), "utf8"))
  : null;

const rng = (() => {
  let s = 12345;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
})();
function trades(meanR, n, side = "long", state = "QUIET", session = "london", vol = "mid") {
  return Array.from({ length: n }, (_, i) => ({
    netR: meanR + 1.43 * (rng() + rng() + rng() + rng() + rng() + rng() - 3) * 1.414,
    year: ROLES.DEV[i % ROLES.DEV.length],
    state,
    side,
    session,
    vol,
  }));
}

test("random baseline exists and uses the frozen config", () => {
  assert(baseline, "run random-baseline.mjs first");
  assertEqual(baseline.frozenConfig.seed, RANDOM_BASELINE.seed);
  assertEqual(baseline.frozenConfig.entriesPerCellPerSide, 4000);
  assert(baseline.frozenConfig.reportLongAndShortSeparately);
  assert(baseline.bars > 200000);
});

test("the random null is NOT zero, and long/short differ materially", () => {
  assert(baseline);
  for (const s of STATES) {
    for (const side of ["long", "short"]) {
      const c = baseline.cells[`${s}|${side}`];
      assert(c && c.n > 1000, `${s}|${side} must have a large sample`);
      assert(Math.abs(c.meanNetR) > 0.01, `${s}|${side} mean ${c.meanNetR} must not be ~0`);
      assert(c.ci95[0] < c.meanNetR && c.meanNetR < c.ci95[1]);
    }
  }
  const gaps = Object.values(baseline.asymmetry).map((a) => Math.abs(a.longMinusShort));
  assert(Math.max(...gaps) > 0.05, "directional drift must be visible");
  assertEqual(baseline.verdict.includes("ASYMMETRY"), true);
});

test("win rates are near 1/3 — confirming the reviewer's arithmetic", () => {
  assert(baseline);
  for (const s of STATES) {
    for (const side of ["long", "short"]) {
      const w = baseline.cells[`${s}|${side}`].winRate;
      assert(w > 0.25 && w < 0.42, `${s}|${side} win rate ${w} should be near 1/3`);
    }
  }
});

test("matchedBaseline resolves fine -> coarse -> zero with a recorded level", () => {
  assert(baseline);
  const fine = matchedBaseline(
    { state: "QUIET", side: "long", session: "london", vol: "mid" },
    baseline,
  );
  assert(["fine", "coarse"].includes(fine.level), `got ${fine.level}`);
  assert(fine.n > 0);
  const unknown = matchedBaseline(
    { state: "QUIET", side: "long", session: "nowhere", vol: "x" },
    baseline,
  );
  assertEqual(unknown.level, "coarse", "must fall back to state|side, never silently to zero");
  assertEqual(matchedBaseline({ state: "QUIET", side: "long" }, null).level, "NONE_ASSUMED_ZERO");
});

test("a claim that only matches the random baseline is NOT confirmed", () => {
  assert(baseline);
  const b = matchedBaseline(
    { state: "QUIET", side: "long", session: "london", vol: "mid" },
    baseline,
  );
  // Trades whose mean equals the baseline mean have zero excess.
  const r = verifyClaim(trades(b.mean, 1200), { direction: +1, baseline });
  assert(r.excessVsRandomR < 0.05, `excess should be ~0, got ${r.excessVsRandomR}`);
  assertEqual(r.verdict, "INCONCLUSIVE");
});

test("a claim that beats the matched baseline by >0.10R IS confirmed", () => {
  assert(baseline);
  const b = matchedBaseline(
    { state: "QUIET", side: "long", session: "london", vol: "mid" },
    baseline,
  );
  const r = verifyClaim(trades(b.mean + 0.3, 1200), { direction: +1, baseline });
  assert(r.excessVsRandomR > CLAIM_CRITERIA.practicalFloorR, `excess ${r.excessVsRandomR}`);
  assertEqual(r.verdict, "CONFIRMED");
  assert(r.excessCi95[0] > 0, "CI must exclude zero");
  assertEqual(r.conditional, false);
});

test("beating a LOSING baseline but still losing money is NOT confirmed", () => {
  assert(baseline);
  // Baseline in EXPANSION|long is ~-0.20. Trades at -0.05 beat it by +0.15
  // but absolute net R is negative -> not tradeable.
  const b = matchedBaseline(
    { state: "EXPANSION", side: "long", session: "london", vol: "mid" },
    baseline,
  );
  const r = verifyClaim(trades(-0.05, 1200, "long", "EXPANSION"), { direction: +1, baseline });
  assert(r.meanNetR < 0, "absolute net R must be negative");
  assert(r.excessVsRandomR > 0, "but it beats the (losing) baseline");
  assertEqual(r.verdict, "INCONCLUSIVE");
  assert(r.vetoes.some((v) => v.startsWith("ABSOLUTE_NET_R")));
});

test("every claim reports excess + CI + long/short split regardless of verdict", () => {
  const r = verifyClaim(trades(0.4, 600), { direction: +1, baseline });
  assert(Number.isFinite(r.excessVsRandomR));
  assert(r.excessCi95.length === 2);
  assert(r.bySide.long && r.bySide.long.n > 0, "long split must be reported");
  assert(r.bySide.long.winRate !== undefined);
  assert(r.meanNetR !== r.excessVsRandomR, "absolute and excess must be distinct");
});

test("G0 decisions are frozen in code, not just prose", () => {
  assertEqual(SENSITIVITY_RULE.sweepsCanNullifyVerdict, false);
  assertEqual(SENSITIVITY_RULE.authoritativeCutoffs, "frozen");
  assertEqual(SENSITIVITY_RULE.thresholdsImmutableAfterResults, true);
  assert(SENSITIVITY_RULE.decidedAt.includes("before any claim result"));
  assert(EVIDENCE.priorFalseFraction >= 0.75);
  assertEqual(CLAIM_CRITERIA.practicalFloorR, 0.1);
  assertEqual(CLAIM_CRITERIA.absoluteNetRMin, 0);
});

test("candlestick cards are the LAST three in test order", () => {
  const last3 = TEST_ORDER.slice(-3).map((t) => CLAIM_CARDS.find((c) => c.id === t.id).family);
  assert(last3.every((f) => f === "candlestick-reversal"));
  assertEqual(new Set(TEST_ORDER.map((t) => t.testOrder)).size, 24);
});
