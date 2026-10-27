/**
 * G0 AMENDMENT 3 (2026-10-27, before any strategy result) — WITHIN-FAMILY
 * ENTRY-BAR OVERLAP, recomputed after listing near-duplicate / mirror cards.
 *
 * WHY: a family cell pools THREE variants. If those variants fire on the same
 * entry bar, the trades are not independent and the raw n overstates the
 * information. Amendment 2 estimated the overlap globally (0.2071) from a
 * single shared bar pool. Amendment 3 refines it per family using the
 * CARD_RELATIONS metadata (near-duplicate / mirror-image / related pairs).
 *
 * NO OUTCOMES ARE USED. This module simulates only ENTRY-BAR CO-OCCURRENCE
 * from card metadata and a seeded RNG. It never reads netR, a verdict, a
 * strategy result, or any realised trade. It is safe to run before M6.
 */
import { CLAIM_CARDS, FAMILIES, CARD_RELATIONS } from "../claim-cards.draft.mjs";
import { mulberry32 } from "./placebo.mjs";

/**
 * Frozen overlap model. `share` is the probability that variant B fires on the
 * SAME entry bar as the most-closely-related earlier variant A, rather than
 * drawing independently. Values are pre-registered ASSUMPTIONS, not fitted:
 * no outcome data exists to fit them to, and none may be used.
 */
export const OVERLAP_MODEL = Object.freeze({
  seed: 20261027,
  barsPerCell: 1000, // candidate bars in one (family, verdictState, session) cell
  fireProbability: 0.3, // per-variant probability of firing on a candidate bar
  shareByType: Object.freeze({
    NEAR_DUPLICATE: 0.75,
    MIRROR_IMAGE: 0.55, // same bar, opposite side — still one entry bar
    RELATED: 0.3,
    INDEPENDENT: 0.1,
  }),
  decidedBeforeResults: true,
  usesOutcomes: false,
  note: "Assumptions frozen at G0 Amendment 3. A sensitivity sweep 0 -> 0.9 is reported alongside; no threshold depends on this value (power is report-only).",
});

/** Strongest relation share between a variant and the already-drawn variants. */
function shareFor(family, id, earlierIds) {
  let best = OVERLAP_MODEL.shareByType.INDEPENDENT;
  for (const other of earlierIds) {
    const rel = CARD_RELATIONS.find(
      (r) =>
        r.family === family &&
        ((r.a === id && r.b === other) || (r.b === id && r.a === other)),
    );
    if (rel && OVERLAP_MODEL.shareByType[rel.type] > best)
      best = OVERLAP_MODEL.shareByType[rel.type];
  }
  return best;
}

/** Kish statistics from a map of bar -> number of variants firing on it. */
function kish(barCounts) {
  let n = 0, sumN2 = 0, overlapping = 0, multiBars = 0;
  for (const c of barCounts.values()) {
    n += c;
    sumN2 += c * c;
    if (c > 1) { overlapping += c; multiBars++; }
  }
  const nEffective = sumN2 > 0 ? (n * n) / sumN2 : 0;
  return {
    n,
    distinctBars: barCounts.size,
    nEffective: +nEffective.toFixed(2),
    overlapFraction: n ? +(overlapping / n).toFixed(4) : 0,
    multiTradeBars: multiBars,
    designEffect: nEffective > 0 ? +(n / nEffective).toFixed(4) : null,
  };
}

/**
 * Simulate ONE family cell. Returns bar multiplicities AND Kish statistics.
 * `barCounts` contains ONLY entry-bar multiplicities — deliberately no netR.
 */
export function simulateFamilyCell(family, rng = mulberry32(OVERLAP_MODEL.seed)) {
  const ids = CLAIM_CARDS.filter((c) => c.family === family).map((c) => c.id);
  const q = OVERLAP_MODEL.fireProbability;
  const barCounts = new Map();
  for (let bar = 0; bar < OVERLAP_MODEL.barsPerCell; bar++) {
    const fired = [];
    let count = 0;
    for (let v = 0; v < ids.length; v++) {
      const share = v === 0 ? 0 : shareFor(family, ids[v], ids.slice(0, v));
      const copy = v > 0 && rng() < share;
      const ref = fired.findIndex((x) => x === true);
      let fire;
      if (copy && ref >= 0) fire = true;
      else if (copy) fire = false;
      else fire = rng() < q;
      fired.push(fire);
      if (fire) count++;
    }
    if (count > 0) barCounts.set(`${family}|${bar}`, count);
  }
  return { barCounts, stats: kish(barCounts) };
}

/**
 * Sensitivity sweep: rescale ALL relation shares by `scale` (0 = independent,
 * 1 = frozen assumptions, up to a hard cap of 0.95) and recompute the pooled
 * design effect. Report-only, so a reader can see how much the ASSUMPTION (not
 * any outcome) drives the power number.
 */
export function sweepShareScale(scales = [0, 0.25, 0.5, 0.75, 1]) {
  const out = [];
  for (const scale of scales) {
    // Shares are scaled inline; OVERLAP_MODEL itself is never mutated.
    const barCounts = new Map();
    for (let fi = 0; fi < FAMILIES.length; fi++) {
      const f = FAMILIES[fi];
      const rng = mulberry32(OVERLAP_MODEL.seed + fi * 7919);
      const ids = CLAIM_CARDS.filter((c) => c.family === f).map((c) => c.id);
      const q = OVERLAP_MODEL.fireProbability;
      for (let bar = 0; bar < OVERLAP_MODEL.barsPerCell; bar++) {
        const fired = [];
        let count = 0;
        for (let v = 0; v < ids.length; v++) {
          const base = v === 0 ? 0 : shareFor(f, ids[v], ids.slice(0, v));
          const share = Math.min(0.95, base * scale);
          const copy = v > 0 && rng() < share;
          const ref = fired.findIndex((x) => x === true);
          let fire;
          if (copy && ref >= 0) fire = true;
          else if (copy) fire = false;
          else fire = rng() < q;
          fired.push(fire);
          if (fire) count++;
        }
        if (count > 0) barCounts.set(`${f}|${bar}`, count);
      }
    }
    out.push({ scale, ...kish(barCounts) });
  }
  return out;
}

/**
 * Recompute the within-family overlap for ALL families and a pooled estimate.
 * Returns a report-only structure; nothing here changes a criterion.
 */
export function recomputeWithinFamilyOverlap() {
  const byFamily = {};
  const pooledBars = new Map();
  for (let fi = 0; fi < FAMILIES.length; fi++) {
    const f = FAMILIES[fi];
    const rng = mulberry32(OVERLAP_MODEL.seed + fi * 7919);
    const { barCounts, stats } = simulateFamilyCell(f, rng);
    for (const [k, v] of barCounts) pooledBars.set(k, v);
    const ids = CLAIM_CARDS.filter((c) => c.family === f).map((c) => c.id);
    byFamily[f] = {
      cards: ids,
      relations: CARD_RELATIONS.filter((r) => r.family === f).map((r) => ({
        pair: [r.a, r.b],
        type: r.type,
        share: OVERLAP_MODEL.shareByType[r.type],
        why: r.why,
      })),
      ...stats,
    };
  }

  return {
    id: "AMENDMENT-3-WITHIN-FAMILY-OVERLAP",
    date: "2026-10-27",
    decidedBeforeResults: true,
    usesOutcomes: false,
    model: OVERLAP_MODEL,
    nearDuplicatePairs: CARD_RELATIONS.filter((r) => r.type === "NEAR_DUPLICATE").map((r) => [r.a, r.b]),
    mirrorImagePairs: CARD_RELATIONS.filter((r) => r.type === "MIRROR_IMAGE").map((r) => [r.a, r.b]),
    relatedPairs: CARD_RELATIONS.filter((r) => r.type === "RELATED").map((r) => [r.a, r.b]),
    byFamily,
    pooled: kish(pooledBars),
    sensitivityByShareScale: sweepShareScale(),
    comparisonToV12: {
      v12OverlapFraction: 0.2071,
      v12DesignEffect: 1.2316,
      v12Source:
        "Amendment 2 measureDependence() in lib/amend2-report.mjs: syntheticTrades({seed:7, perCell:900, trueEdgeR:0, sd:1.43}) from verify-claims.mjs. Three variants per family drew entry bars from ONE shared pool of 900 bars keyed `${family}|${state}|${year}|${bar}`. effectiveCounts() (Kish over entry bars) on that synthetic set gave overlap 0.2071 / design effect 1.2316. Only the `entryBar` field was used; netR was pure Gaussian noise with ZERO injected edge and was NOT used. No strategy outcomes, no real trades.",
      v13Change:
        "Amendment 3 keeps the same Kish estimator but replaces the single uniform pool with relation-aware shares (NEAR_DUPLICATE 0.75, MIRROR_IMAGE 0.55, RELATED 0.30, INDEPENDENT 0.10) derived from CARD_RELATIONS. Still pure bar co-occurrence, still no outcomes.",
    },
    note: "Report-only: this design effect feeds the power table, not the t/CI (day-clustered CR1 already absorbs within-day correlation). No criterion changes.",
  };
}
