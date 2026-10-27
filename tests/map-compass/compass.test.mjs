/** M4 Compass + claim-card structure tests. */
import { readFileSync, existsSync } from "node:fs";
import { test, assert, assertEqual } from "../tiny.mjs";
import { STATES, ROLES, CONFLICT_RULE, EVIDENCE } from "../../scripts/map-compass/frozen.mjs";
import {
  CLAIM_CARDS,
  FAMILIES,
  FREEZE,
  TEST_ORDER,
  validateClaimCards,
} from "../../scripts/map-compass/claim-cards.draft.mjs";
import {
  buildRoutingTable,
  activeStrategies,
  isAllowed,
  routeSignals,
  routingFingerprint,
} from "../../scripts/map-compass/lib/compass.mjs";
import {
  verifyClaim,
  tStat,
  stdev,
  mde,
  powerAt,
  groupByFamilyState,
} from "../../scripts/map-compass/lib/verification.mjs";
import {
  blockCircularShift,
  mulberry32,
  placeboDistribution,
} from "../../scripts/map-compass/lib/placebo.mjs";
import {
  assertCardsFrozen,
  claimHash,
  readLedger,
  appendVerdict,
  writeLedger,
} from "../../scripts/map-compass/lib/claim-ledger.mjs";

const A = (p) => new URL(`../../artifacts/map-compass/${p}`, import.meta.url);

test("24 claim cards across 8 families, structurally valid", () => {
  assertEqual(validateClaimCards().length, 0, validateClaimCards().join("; "));
  assertEqual(CLAIM_CARDS.length, 24);
  assertEqual(FAMILIES.length, 8);
  for (const f of FAMILIES) assertEqual(CLAIM_CARDS.filter((c) => c.family === f).length, 3);
});

test("claim cards are DRAFT — real verification must be BLOCKED", () => {
  assertEqual(FREEZE.status, "DRAFT");
  let threw = false;
  try {
    assertCardsFrozen(FREEZE);
  } catch {
    threw = true;
  }
  assert(threw, "DRAFT cards must not authorize testing");
  const approved = { status: "FROZEN", approvedBy: "human", approvedAt: "2026-10-26" };
  assertCardsFrozen(approved); // no throw
});

test("every card has a frozen numeric priority, all distinct 1..24", () => {
  const p = CLAIM_CARDS.map((c) => c.priority).sort((a, b) => a - b);
  assertEqual(new Set(p).size, 24);
  for (let i = 0; i < 24; i++) assertEqual(p[i], i + 1);
  assertEqual(CONFLICT_RULE.onePositionPerSlot, true);
});

test("claims are written from literature, with real rationales", () => {
  for (const c of CLAIM_CARDS) {
    assert(c.rationale.length >= 30, `${c.id} needs a substantive rationale`);
    assert(c.sources.length >= 1, `${c.id} needs a source`);
    assert(STATES.includes(c.strength.state) && STATES.includes(c.weakness.state));
    assertEqual(c.strength.direction, +1);
    assertEqual(c.weakness.direction, -1);
  }
});

test("Compass with NO confirmed claims is flat everywhere", () => {
  const r = buildRoutingTable(new Map());
  for (const s of STATES) assertEqual(r.table[s].length, 0, `${s} must be empty`);
  assertEqual(r.reasons.filter((x) => x.decision === "NOT_SHIPPABLE").length, 24);
  for (const s of STATES) assertEqual(activeStrategies(s, "london", r).length, 0);
  assertEqual(activeStrategies("UNKNOWN", "london", r).length, 0);
});

test("G0 REVISION: strength ALONE ships; weakness alone does not", () => {
  // Everything not CONFIRMED is blocked by default, so requiring weakness
  // CONFIRMED too was a redundant gate that stacked the pass probability.
  const c = CLAIM_CARDS[0];
  const onlyStrength = new Map([[`${c.id}|${c.strength.state}`, "CONFIRMED"]]);
  const r1 = buildRoutingTable(onlyStrength);
  assert(r1.table[c.strength.state].includes(c.id), "strength alone MUST enable");
  const reason = r1.reasons.find((x) => x.id === c.id);
  assertEqual(reason.decision, "ENABLED");
  assert(reason.note.includes("weakness not required"));

  const onlyWeakness = new Map([[`${c.id}|${c.weakness.state}`, "CONFIRMED"]]);
  const r2 = buildRoutingTable(onlyWeakness);
  assert(!STATES.some((s) => r2.table[s].includes(c.id)), "weakness alone must not enable");
});

test("a CONFIRMED weakness still adds a hard block when strength is CONFIRMED", () => {
  const c = CLAIM_CARDS[0];
  const v = new Map([
    [`${c.id}|${c.strength.state}`, "CONFIRMED"],
    [`${c.id}|${c.weakness.state}`, "CONFIRMED"],
  ]);
  const r = buildRoutingTable(v);
  const reason = r.reasons.find((x) => x.id === c.id);
  assertEqual(reason.blocked, c.weakness.state);
});

test("both halves CONFIRMED enables ONLY in the strength state", () => {
  const c = CLAIM_CARDS[0];
  const v = new Map([
    [`${c.id}|${c.strength.state}`, "CONFIRMED"],
    [`${c.id}|${c.weakness.state}`, "CONFIRMED"],
  ]);
  const r = buildRoutingTable(v);
  assert(r.table[c.strength.state].includes(c.id));
  assert(!r.table[c.weakness.state].includes(c.id), "confirmed weakness must hard-block");
  for (const s of STATES.filter((x) => x !== c.strength.state)) {
    assert(!r.table[s].includes(c.id), `${s} must not be enabled`);
  }
});

test("REFUTED / INCONCLUSIVE never enable anything", () => {
  for (const verdict of ["REFUTED", "INCONCLUSIVE"]) {
    const c = CLAIM_CARDS[3];
    const v = new Map([
      [`${c.id}|${c.strength.state}`, verdict],
      [`${c.id}|${c.weakness.state}`, "CONFIRMED"],
    ]);
    const r = buildRoutingTable(v);
    assert(!STATES.some((s) => r.table[s].includes(c.id)), `${verdict} must not enable`);
  }
});

test("session restriction gates on top of the state allow-list", () => {
  const c = CLAIM_CARDS.find((x) => x.sessionRestriction);
  assert(c, "at least one card must have a session restriction");
  const v = new Map([
    [`${c.id}|${c.strength.state}`, "CONFIRMED"],
    [`${c.id}|${c.weakness.state}`, "CONFIRMED"],
  ]);
  const r = buildRoutingTable(v);
  assertEqual(isAllowed(c.id, c.strength.state, c.sessionRestriction, r), true);
  const other = ["asian", "london", "ny"].find((s) => s !== c.sessionRestriction);
  assertEqual(isAllowed(c.id, c.strength.state, other, r), false);
});

test("allow-list is sorted by frozen numeric priority", () => {
  const v = new Map();
  const chosen = CLAIM_CARDS.slice(0, 5);
  for (const c of chosen) {
    v.set(`${c.id}|${c.strength.state}`, "CONFIRMED");
    v.set(`${c.id}|${c.weakness.state}`, "CONFIRMED");
  }
  const r = buildRoutingTable(v);
  for (const s of STATES) {
    const ids = r.table[s];
    const ps = ids.map((id) => chosen.find((c) => c.id === id).priority);
    assertEqual(JSON.stringify(ps), JSON.stringify([...ps].sort((a, b) => a - b)));
  }
});

test("routing is deterministic and hashable (G4 freeze)", () => {
  const v = new Map();
  for (const c of CLAIM_CARDS.slice(0, 6)) {
    v.set(`${c.id}|${c.strength.state}`, "CONFIRMED");
    v.set(`${c.id}|${c.weakness.state}`, "CONFIRMED");
  }
  assertEqual(routingFingerprint(buildRoutingTable(v)), routingFingerprint(buildRoutingTable(v)));
});

test("routeSignals drops unrouted/wrong-session/UNKNOWN signals exactly", () => {
  const r = buildRoutingTable(new Map());
  const signals = [
    { index: 0, strategyId: CLAIM_CARDS[0].id, state: "EXPANSION", session: "london" },
    { index: 1, strategyId: CLAIM_CARDS[0].id, state: "UNKNOWN", session: "london" },
    { index: 2, strategyId: CLAIM_CARDS[6].id, state: "EXPANSION", session: "ny" },
  ];
  const out = routeSignals(signals, r);
  assertEqual(out.kept.length, 0);
  assertEqual(out.dropped.state, 1);
  assertEqual(out.dropped.session, 1);
  assertEqual(out.dropped.unrouted, 1);
});

test("M4 report is inert pre-verification (no strategy enabled)", () => {
  const p = A("routing-table.json");
  assert(existsSync(p), "run build-compass.mjs first");
  const r = JSON.parse(readFileSync(p, "utf8"));
  assertEqual(r.enabledCount, 0);
  assertEqual(r.cardsFrozen, false);
  assertEqual(r.plumbing.exact, true);
  assertEqual(r.plumbing.kept, 0);
});

test("evidence tiers are assigned and the prior is honestly low", () => {
  assert(EVIDENCE.priorFalseFraction >= 0.75, "most textbook claims are assumed false");
  const counts = {};
  for (const c of CLAIM_CARDS) counts[c.evidenceTier] = (counts[c.evidenceTier] ?? 0) + 1;
  assertEqual(Object.keys(counts).length, 4);
  assertEqual(counts[4], 3, "candlestick family is the whole tier 4");
});

test("FIXED-SEQUENCE test order puts best evidence first and candlestick LAST", () => {
  assertEqual(TEST_ORDER.length, 24);
  const tiers = TEST_ORDER.map((t) => t.tier);
  assertEqual(
    JSON.stringify(tiers),
    JSON.stringify([...tiers].sort((a, b) => a - b)),
    "tiers must be ascending",
  );
  const last3 = TEST_ORDER.slice(-3).map((t) => CLAIM_CARDS.find((c) => c.id === t.id).family);
  assert(
    last3.every((f) => f === "candlestick-reversal"),
    "candlesticks tested last",
  );
  assertEqual(TEST_ORDER[0].testOrder, 1);
  assertEqual(TEST_ORDER[23].testOrder, 24);
});
