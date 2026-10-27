/**
 * G0 FROZEN CONSTANTS — side-effect-free, safe to import from tests.
 *
 * Editing anything in this file is a product decision that starts a NEW
 * hypothesis and a NEW evaluation window. See BLUEPRINT.md §9 (freeze gates).
 *
 * Frozen 2026-10-26, before any strategy result was seen.
 */

/**
 * Map thresholds. Round numbers from the literature; sweeps VETO, never optimise.
 *
 * G0 CLARIFICATION (2026-10-26, before any strategy result): `warmupBars`,
 * `atrPeriod` and `rangeLookback` below encode values ALREADY stated in
 * BLUEPRINT.md §3-§5 and the generator's ATR metadata. None of the six locked
 * thresholds changed; this only makes the referenced constants explicit.
 */
export const MAP = Object.freeze({
  erCutoff: 0.35, // Kaufman efficiency ratio over trailing 20 bars
  erLookback: 20,
  atrPeriod: 14, // simple mean of true range; matches generator ATR metadata
  atrPctileCutoff: 70, // trailing ATR percentile
  atrPctileLookback: 500, // ~10 trading days of M30 bars
  rangeLookback: 50, // trailing channel for range_pos
  warmupBars: 1000, // MIN_PRODUCTION_BARS; >= atrPctileLookback
  hysteresisBars: 3, // consecutive bars before a state change is confirmed
  abstainBandPct: 10, // +/- around either threshold -> UNKNOWN -> flat
});

export const STATES = Object.freeze(["EXPANSION", "GRIND", "WHIPSAW", "QUIET"]);

/**
 * Data roles. Decision #6: preserve roles and sealed datasets, but break the
 * era/role confound by INTERLEAVING the sealed holdout years across eras.
 * HOLDOUT is never read by Map building, claim verification, LOYO or routing.
 */
export const ROLES = Object.freeze({
  DEV: Object.freeze([2004, 2005, 2006, 2007, 2009, 2010, 2011, 2013, 2014, 2015, 2017, 2018]),
  HOLDOUT: Object.freeze([2008, 2012, 2016, 2019]),
  VAL: Object.freeze([2020, 2021, 2022, 2023, 2024]),
  STRESS: Object.freeze([2025, 2026]),
});

/** Columns computed from LATER bars. Never a feature, never an input. */
export const DENYLIST = Object.freeze([
  "similar_swing_retrace_pct",
  "similar_swing_continued_pct",
  "swing_invalidated",
  "similar_swing_refs",
  "swing_context_source",
]);

/**
 * Standardised exit harness — identical for every strategy during verification.
 *
 * G0 AMENDMENT 2 (2026-10-27), decided BEFORE any real claim result exists:
 * `maxHoldBars: 96` is added here (48h of M30 bars). A trade that has neither
 * hit the 1.5xATR stop nor the 2R target by bar 96 is closed at the market as
 * TIME_EXIT. Previously unresolved trades were effectively booked as 0R / left
 * OPEN, which biased expectancy by whatever drift remained. The SAME cap was
 * already used by the matched random-entry control (`RANDOM_BASELINE`), so this
 * makes the claim and its null use an identical harness — a fairness fix, not
 * a threshold change.
 *
 * Pre-results evidence that the cap is not vacuous: on the frozen random
 * baseline, TIME_EXIT = 398 of 32,000 resolved entries = 1.2438%. So ~1.24% of
 * trades are affected; left unresolved they would have been scored 0R.
 * No stop/target/threshold/criterion value in this file changed.
 */
export const EXIT_HARNESS = Object.freeze({
  stopAtrMultiple: 1.5,
  atrPeriod: 14,
  targetR: 2,
  maxHoldBars: 96, // TIME_EXIT: close at market after 48h of M30 bars
  timeExitLabel: "TIME_EXIT",
  trailing: false,
  breakeven: false,
  partials: false,
  note: "Old engine's RR_THRESHOLD=2 rejects rr<=2. With a 2R target, disable that gate or set target slightly above 2R. TIME_EXIT at maxHoldBars added by G0 Amendment 2 (2026-10-27), pre-results. See ENGINE-BIAS-REGISTER.md.",
  amendment: {
    date: "2026-10-27",
    id: "G0-AMENDMENT-2-TIME-EXIT",
    decidedBeforeResults: true,
    criteriaChanged: false,
    baselineTimeExitShare: 0.012438,
    baselineTimeExitCount: 398,
    baselineResolvedTotal: 32000,
  },
});

/**
 * Cost model, frozen at G0. Slippage is expressed as a fraction of ATR so it
 * transports across the $381 -> $5,597 price range. Evidence for 0.02:
 * measured |next open - signal close| / ATR had median 0.0112, p75 0.0402.
 */
export const COST = Object.freeze({
  slippage: Object.freeze({ atrFractionPerSide: 0.02, stressMultiplier: 2 }),
  volRegime: Object.freeze({ lowMax: 0.0006, highMin: 0.0016 }),
});

/** Allow-list conflict rule (decision #10): one position per slot, frozen numeric priorities. */
export const CONFLICT_RULE = Object.freeze({
  onePositionPerSlot: true,
  tieBreak: "frozen numeric priority ascending",
  note: "Priority numbers are assigned in the frozen claim-card registry before any test runs.",
});

/**
 * Pre-registered claim-verification criteria (family level, not strategy level).
 *
 * REVISED at G0 (2026-10-26, before any real claim result) in response to the
 * review. Two changes, both made BEFORE results so neither can be laundering:
 *
 *  1. The null is no longer zero. A claim must beat a MATCHED RANDOM-ENTRY
 *     baseline (same state, same side, same stop/target/cost) by the practical
 *     floor. DEV 2004-2011 is a bull run (mean close 414 -> 1,579), so an
 *     unconditional long with a 2R target has positive expectancy. Testing
 *     against zero would confirm drift, not skill.
 *  2. Every claim reports a continuous estimate + 95% CI regardless of verdict,
 *     so "nothing CONFIRMED" is still a readable answer.
 */
export const CLAIM_CRITERIA = Object.freeze({
  minTradesPerCell: 100,
  practicalFloorR: 0.1, // EXCESS over matched random baseline, net R/trade
  tStatMin: 2, // t of the difference vs the random baseline
  absoluteNetRMin: 0, // a claim beating random but losing money is not tradeable
  concentrationMax: 0.5, // no single year may contribute >50% of cell R
  loyoPositiveMin: 0.75, // >=75% of leave-one-year-out windows positive
  note: "Year-bucketing is a veto, not 24 independent significance tests. See BLUEPRINT.md §7.",
});

/**
 * DEFINITION-SENSITIVITY RULE — DECIDED NOW, before any result exists.
 *
 * The frozen cutoffs (ER 0.35 / ATR pctile 70) are the SOLE authoritative test.
 * A claim CONFIRMED there does NOT lose its verdict because it flips elsewhere
 * in the sweep grid; letting the sweep nullify the pre-registered test would
 * hand threshold selection to the sweep — exactly the laundering forbidden.
 *
 * Instead the sweep produces a STABILITY GRADE that is reported and constrains
 * use, never the verdict:
 *   ROBUST              CONFIRMED in >=80% of grid cells
 *   FRAGILE             CONFIRMED in 50-80% of grid cells
 *   DEFINITION_SENSITIVE CONFIRMED in <50% of grid cells
 *
 * G0 AMENDMENT 2 (2026-10-27, still before any real claim result) — the user
 * took the DEFAULT "no" on CONDITIONAL shipping:
 *
 *   A CONFIRMED + DEFINITION_SENSITIVE claim is tagged CONDITIONAL and DOES
 *   **NOT** ship. The Compass must NOT enable it. It is REPORTED at M9 and M10
 *   (always separately from ROBUST claims), and is enabled ONLY IF VAL supplies
 *   positive support under the pre-registered criterion below. There is no
 *   discretionary post-hoc promotion: the criterion is frozen now.
 *
 * No threshold may be changed after results. REFUTED and INCONCLUSIVE verdicts
 * are never rescued by the sweep.
 */
export const SENSITIVITY_RULE = Object.freeze({
  authoritativeCutoffs: "frozen",
  sweepsCanNullifyVerdict: false,
  robustMinPct: 80,
  fragileMinPct: 50,
  conditionalTag: "CONDITIONAL",
  // USER DEFAULT "no" (G0 Amendment 2): CONDITIONAL claims cannot enable Compass.
  compassCanEnableConditional: false,
  conditionalRequiresValSupport: true,
  conditionalReportAt: ["M9", "M10"],
  valSupportCriterion:
    "The claim's VAL-window cell must independently reach CONFIRMED under the SAME frozen CLAIM_CRITERIA (excess > 0.10R, clustered t > 2, absolute net R > 0, no vetoes), evaluated once, with the VAL role spent on promotion.",
  requiresM9GridReport: true,
  requiresM10SeparateReport: true,
  thresholdsImmutableAfterResults: true,
  decidedAt: "G0, 2026-10-26, before any claim result",
  amendedAt: "G0 Amendment 2, 2026-10-27, before any claim result",
});

/** Random-entry control — pre-registered before results. */
export const RANDOM_BASELINE = Object.freeze({
  entriesPerCellPerSide: 4000,
  seed: 20261026,
  maxHoldBars: 96, // 48h of M30 bars; bounds the forward scan for BOTH claims and baseline
  matchOn: ["state", "side", "session", "volRegime"],
  reportLongAndShortSeparately: true,
  note: "Identical exit harness (1.5xATR stop, 2R target) and identical cost model. Only entry timing/side is random.",
});

/**
 * Evidence prior. The original "assume 60% are false" was too gentle: most
 * textbook intraday rules lack peer-reviewed out-of-sample support. Cards carry
 * an evidence tier and are TESTED IN TIER ORDER (fixed sequence), so the
 * best-supported claims are examined first and weak claims cannot consume the
 * multiplicity budget before them.
 */
export const EVIDENCE = Object.freeze({
  priorFalseFraction: 0.8,
  testOrder: "evidenceTier ascending, then priority ascending (fixed sequence)",
  tiers: Object.freeze({
    1: "peer-reviewed momentum/trend or volatility phenomena exist",
    2: "some academic support, mostly at daily horizon",
    3: "practitioner literature, little rigorous evidence",
    4: "largely anecdotal; weakest prior — tested LAST",
  }),
});
