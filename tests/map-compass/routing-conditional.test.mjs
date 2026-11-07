/** Regression coverage for DEV-strength-only conditional Compass routing. */
import { test, assert, assertEqual } from "../tiny.mjs";
import { otherVerdictState, VERDICT_STATES } from "../../scripts/map-compass/frozen.mjs";
import { CLAIM_CARDS, validateClaimCards } from "../../scripts/map-compass/claim-cards.draft.mjs";
import { selectRoutingInputs } from "../../scripts/map-compass/build-compass.mjs";
import {
  buildRoutingTable,
  CONDITIONAL_NOT_ENABLED,
} from "../../scripts/map-compass/lib/compass.mjs";

function ledgerRecord(card, kind, overrides = {}) {
  const half = card[kind];
  return {
    claimId: card.id,
    kind,
    state: half.state,
    verdict: "INCONCLUSIVE",
    windowKind: "DEV",
    conditional: false,
    stability: "ROBUST",
    ...overrides,
  };
}

function routeFromLedger(records, card) {
  const selected = selectRoutingInputs(records);
  const routing = buildRoutingTable(selected.verdicts, [card], {
    conditionalIds: selected.conditionalIds,
    records,
  });
  return { ...selected, routing };
}

test("DEFINITION_SENSITIVE weakness cannot suppress a CONFIRMED strength", () => {
  const card = CLAIM_CARDS[0];
  const records = [
    ledgerRecord(card, "strength", { verdict: "CONFIRMED" }),
    ledgerRecord(card, "weakness", { stability: "DEFINITION_SENSITIVE" }),
  ];
  const { conditionalIds, routing } = routeFromLedger(records, card);

  assert(!conditionalIds.has(card.id), "weakness records must not enter conditionalIds");
  assert(routing.table[card.strength.state].includes(card.id), "confirmed strength remains enabled");
  assertEqual(routing.reasons.find((row) => row.id === card.id).decision, "ENABLED");
});

test("VAL-window conditional record cannot suppress a DEV-enabled strength", () => {
  const card = CLAIM_CARDS[1];
  const records = [
    ledgerRecord(card, "strength", { verdict: "CONFIRMED" }),
    ledgerRecord(card, "strength", {
      windowKind: "VAL",
      stability: "DEFINITION_SENSITIVE",
    }),
  ];
  const { conditionalIds, verdicts, ignored, routing } = routeFromLedger(records, card);

  assert(!conditionalIds.has(card.id), "VAL records must not enter the DEV conditional set");
  assertEqual(ignored, 1);
  assertEqual(verdicts.get(`${card.id}|${card.strength.state}`), "CONFIRMED");
  assert(routing.table[card.strength.state].includes(card.id), "DEV-confirmed strength remains enabled");
});

test("a strength's own DEFINITION_SENSITIVE grade and conditional flag still block it", () => {
  const card = CLAIM_CARDS[2];
  for (const ownConditional of [
    { stability: "DEFINITION_SENSITIVE" },
    { conditional: true },
  ]) {
    const records = [
      ledgerRecord(card, "strength", {
        verdict: "CONFIRMED",
        ...ownConditional,
      }),
    ];
    const { conditionalIds, routing } = routeFromLedger(records, card);
    assert(conditionalIds.has(card.id));
    assertEqual(routing.reasons.find((row) => row.id === card.id).decision, CONDITIONAL_NOT_ENABLED);
  }
});

test("weakness CONFIRMED with strength MISSING enables no state for the card", () => {
  const card = CLAIM_CARDS[3];
  const verdicts = new Map([[`${card.id}|${card.weakness.state}`, "CONFIRMED"]]);
  const routing = buildRoutingTable(verdicts, [card]);

  assertEqual(verdicts.get(`${card.id}|${card.strength.state}`), undefined);
  assert(!VERDICT_STATES.some((state) => routing.table[state].includes(card.id)));
});

test("PROVED: all 22 cards have complementary states and non-colliding half keys", () => {
  // validateClaimCards already rejects equal states and a non-complementary
  // weakness. This direct CLAIM_CARDS test explicitly proves the routing-key
  // invariant, so it does not rely only on the validator's indirect checks.
  assertEqual(validateClaimCards().length, 0);
  assertEqual(CLAIM_CARDS.length, 22);
  const claimIds = new Set();
  const verdictKeys = new Set();

  for (const card of CLAIM_CARDS) {
    assert(!claimIds.has(card.id), `claimId must be unique: ${card.id}`);
    claimIds.add(card.id);
    assertEqual(card.weakness.state, otherVerdictState(card.strength.state), `${card.id} weakness is complementary`);

    const strengthKey = `${card.id}|${card.strength.state}`;
    const weaknessKey = `${card.id}|${card.weakness.state}`;
    assert(strengthKey !== weaknessKey, `${card.id} halves cannot share a verdict key`);
    assert(!verdictKeys.has(strengthKey), `duplicate strength verdict key: ${strengthKey}`);
    assert(!verdictKeys.has(weaknessKey), `duplicate weakness verdict key: ${weaknessKey}`);
    verdictKeys.add(strengthKey);
    verdictKeys.add(weaknessKey);
  }
  assertEqual(verdictKeys.size, 44);
});
