/**
 * M4 — Compass v0: binary allow-list routing table.
 *
 * Input: Map state (+ session). Output: sorted list of ENABLED strategy IDs.
 *
 * Rule (blueprint §6, REVISED at G0 after review): enable S in state B iff its
 * STRENGTH claim is CONFIRMED for B. Strength alone is sufficient. Everything
 * not CONFIRMED is blocked by default, so requiring weakness CONFIRMED too was
 * a redundant second gate that stacked the pass probability for no safety gain.
 * A CONFIRMED weakness still adds an explicit hard block. No learned weights,
 * no scoring, no optimizer — a fixed table is falsifiable, a learned policy is not.
 *
 * UNKNOWN state -> flat. No confirmed strategy -> flat.
 * Session is a GATE on top of the state allow-list, never a third Map axis.
 */
import { STATES, SENSITIVITY_RULE, CLAIM_CRITERIA } from "../frozen.mjs";
import { CLAIM_CARDS } from "../claim-cards.draft.mjs";

export const VERDICTS = Object.freeze(["CONFIRMED", "REFUTED", "INCONCLUSIVE"]);
export const NOT_SHIPPABLE = "NOT_SHIPPABLE";
export const CONDITIONAL_NOT_ENABLED = "CONDITIONAL_NOT_ENABLED";

/**
 * G0 AMENDMENT 2 (user default "no"): CONDITIONAL claims do not enable the
 * Compass. They may be promoted ONLY by VAL support under the criterion frozen
 * in SENSITIVITY_RULE.valSupportCriterion — the SAME frozen criteria, on the
 * VAL window, evaluated once. This function is a pure predicate over ledger
 * records; it never loosens a threshold.
 */
export function conditionalValPromotions(records = []) {
  const promoted = new Set();
  for (const r of records) {
    if (r.windowKind !== "VAL") continue;
    if (r.kind !== "strength") continue;
    if (!r.conditional && r.stability !== "DEFINITION_SENSITIVE") continue;
    const s = r.stats ?? {};
    const ok =
      r.verdict === "CONFIRMED" &&
      s.n >= CLAIM_CRITERIA.minTradesPerCell &&
      s.excessVsRandomR > CLAIM_CRITERIA.practicalFloorR &&
      s.t > CLAIM_CRITERIA.tStatMin &&
      s.meanNetR > CLAIM_CRITERIA.absoluteNetRMin &&
      Array.isArray(s.vetoes) &&
      s.vetoes.length === 0;
    if (ok) promoted.add(r.claimId);
  }
  return promoted;
}

/**
 * Build the routing table from a claim ledger.
 *
 * `verdicts`: Map or object keyed `${strategyId}|${state}` -> verdict. Each
 * card contributes up to two keys (strength state, weakness state). A state
 * not mentioned in a card is UNASSIGNED -> never enabled.
 *
 * Only CONFIRMED strengths enable. A CONFIRMED weakness adds a hard block for
 * that state (defence in depth even though the strength would already be
 * unconfirmed there). REFUTED/INCONCLUSIVE never enable anything.
 */
export function buildRoutingTable(
  verdicts,
  cards = CLAIM_CARDS,
  { conditionalIds = new Set(), valPromotedIds = new Set(), records = [] } = {},
) {
  const get = verdicts instanceof Map ? (k) => verdicts.get(k) : (k) => verdicts[k];
  const table = Object.fromEntries(STATES.map((s) => [s, []]));
  const reasons = [];
  const conditional = conditionalIds instanceof Set ? conditionalIds : new Set(conditionalIds);
  const valPromotions = new Set([
    ...(valPromotedIds instanceof Set ? valPromotedIds : new Set(valPromotedIds)),
    ...[...conditionalValPromotions(records)].filter((id) => conditional.has(id)),
  ]);

  for (const c of cards) {
    const strengthKey = `${c.id}|${c.strength.state}`;
    const weaknessKey = `${c.id}|${c.weakness.state}`;
    const sv = get(strengthKey);
    const wv = get(weaknessKey);

    // G0 AMENDMENT 2 (user default "no", still before any result): a
    // CONDITIONAL claim cannot enable the Compass. It is reported at M9/M10
    // and enabled only if VAL supports it under the frozen criterion.
    const isConditional = conditional.has(c.id);
    const valBacked = valPromotions.has(c.id);
    if (isConditional && !SENSITIVITY_RULE.compassCanEnableConditional && !valBacked) {
      reasons.push({
        id: c.id,
        decision: CONDITIONAL_NOT_ENABLED,
        strengthVerdict: sv ?? "MISSING",
        weaknessVerdict: wv ?? "MISSING",
        conditional: true,
        valSupport: false,
        note: `CONDITIONAL (DEFINITION_SENSITIVE). User default "no": reported at M9/M10, enabled only if VAL supports it. See SENSITIVITY_RULE.`,
      });
      continue;
    }

    // STRENGTH ALONE is sufficient (G0 revision). Everything not CONFIRMED is
    // blocked by default, so the weakness gate added no safety — it only
    // multiplied the already-low pass probability.
    if (sv !== "CONFIRMED") {
      reasons.push({
        id: c.id,
        decision: NOT_SHIPPABLE,
        strengthVerdict: sv ?? "MISSING",
        weaknessVerdict: wv ?? "MISSING",
        note: "strength not CONFIRMED",
      });
      continue;
    }

    // Hard block from the confirmed weakness.
    if (table[c.weakness.state].includes(c.id)) {
      table[c.weakness.state] = table[c.weakness.state].filter((x) => x !== c.id);
    }
    if (!table[c.strength.state].includes(c.id)) table[c.strength.state].push(c.id);
    reasons.push({
      id: c.id,
      decision: "ENABLED",
      state: c.strength.state,
      blocked: wv === "CONFIRMED" ? c.weakness.state : null,
      weaknessVerdict: wv ?? "MISSING",
      conditional: isConditional,
      valSupport: isConditional && valBacked,
      note: isConditional
        ? "CONDITIONAL enabled ONLY because VAL met the frozen support criterion (G0 Amendment 2)"
        : wv === "CONFIRMED"
          ? "strength CONFIRMED; weakness CONFIRMED adds hard block"
          : "strength CONFIRMED alone; weakness not required (G0 revision)",
    });
  }

  // Frozen numeric priority order (decision #10).
  const priority = new Map(cards.map((c) => [c.id, c.priority]));
  for (const s of STATES)
    table[s].sort((a, b) => (priority.get(a) ?? 1e9) - (priority.get(b) ?? 1e9));

  return {
    table,
    reasons,
    conditionalPolicy: {
      compassCanEnableConditional: SENSITIVITY_RULE.compassCanEnableConditional,
      conditionalRequiresValSupport: SENSITIVITY_RULE.conditionalRequiresValSupport,
      conditionalReportAt: SENSITIVITY_RULE.conditionalReportAt,
      conditionalIds: [...conditional],
      blockedConditionalIds: [...conditional].filter((id) => !valPromotions.has(id)),
      valPromotedConditionalIds: [...conditional].filter((id) => valPromotions.has(id)),
    },
    builtFrom: Object.keys(verdicts instanceof Map ? Object.fromEntries(verdicts) : verdicts)
      .length,
  };
}

/** Active strategy IDs for one bar. UNKNOWN / unrouted -> empty (flat). */
export function activeStrategies(state, session, routing, cards = CLAIM_CARDS) {
  if (!STATES.includes(state)) return [];
  const allowed = routing.table?.[state] ?? [];
  const byId = new Map(cards.map((c) => [c.id, c]));
  return allowed.filter((id) => {
    const c = byId.get(id);
    if (!c) return false;
    return !c.sessionRestriction || c.sessionRestriction === session;
  });
}

/** Is a single strategy allowed to fire on this bar? */
export function isAllowed(strategyId, state, session, routing, cards = CLAIM_CARDS) {
  return activeStrategies(state, session, routing, cards).includes(strategyId);
}

/**
 * Apply the Compass to a signal stream. Returns kept + dropped signals.
 * `signals`: [{ index, strategyId, side, state, session, ... }]
 * Uses `activeStrategies` for gating, then the frozen priority for tie-break.
 */
export function routeSignals(signals, routing, cards = CLAIM_CARDS) {
  const priority = new Map(cards.map((c) => [c.id, c.priority]));
  const allowedByBar = new Map();
  const kept = [];
  let droppedState = 0,
    droppedSession = 0,
    droppedUnrouted = 0;

  for (const s of signals) {
    if (!STATES.includes(s.state)) {
      droppedState++;
      continue;
    }
    const key = `${s.state}|${s.session}`;
    if (!allowedByBar.has(key))
      allowedByBar.set(key, activeStrategies(s.state, s.session, routing, cards));
    const allowed = allowedByBar.get(key);
    const card = cards.find((c) => c.id === s.strategyId);
    if (card?.sessionRestriction && card.sessionRestriction !== s.session) {
      droppedSession++;
      continue;
    }
    if (!allowed.includes(s.strategyId)) {
      droppedUnrouted++;
      continue;
    }
    kept.push({ ...s, priority: priority.get(s.strategyId) ?? 1e9 });
  }
  kept.sort((a, b) => a.index - b.index || a.priority - b.priority);
  return {
    kept,
    dropped: { state: droppedState, session: droppedSession, unrouted: droppedUnrouted },
  };
}

/** Hash the table so G4 can freeze it and detect any later edit. */
export function routingFingerprint(routing) {
  return JSON.stringify({ table: routing.table });
}
