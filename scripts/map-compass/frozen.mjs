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

/** Four Map states. From v1.3 these are DIAGNOSTIC labels, not verdict cells. */
export const STATES = Object.freeze(["EXPANSION", "GRIND", "WHIPSAW", "QUIET"]);

/**
 * G0 AMENDMENT 3 (2026-10-27, before any strategy result) — VERDICT STATES.
 *
 * The four-state Map was too fine: EXPANSION and GRIND cells had projected
 * power 0.272 / 0.364, so most claims would land INCONCLUSIVE for lack of
 * data rather than lack of edge. Pooling by the ER axis doubles those cells.
 *
 *   EFFICIENT = EXPANSION + GRIND   (ER >= 0.35 — directional)
 *   CHOPPY    = WHIPSAW + QUIET    (ER <  0.35 — non-directional)
 *
 * Verdicts are decided on these TWO states. The four Map states are still
 * reported for every claim as diagnostics, but they do not decide verdicts.
 * The Map source hash and all Map thresholds are UNCHANGED.
 */
export const VERDICT_STATES = Object.freeze(["EFFICIENT", "CHOPPY"]);
export const VERDICT_STATE_OF = Object.freeze({
  EXPANSION: "EFFICIENT",
  GRIND: "EFFICIENT",
  WHIPSAW: "CHOPPY",
  QUIET: "CHOPPY",
});
/** Four Map states covered by a verdict state (diagnostic breakdown order). */
export const FOUR_STATES_OF = Object.freeze({
  EFFICIENT: Object.freeze(["EXPANSION", "GRIND"]),
  CHOPPY: Object.freeze(["WHIPSAW", "QUIET"]),
});
export function verdictStateOf(fourState) {
  return VERDICT_STATE_OF[fourState] ?? null;
}
export function otherVerdictState(s) {
  return s === "EFFICIENT" ? "CHOPPY" : "EFFICIENT";
}

/**
 * Family -> strength verdict state. Decided at G0 Amendment 3 before results.
 * Trend/continuation families claim EFFICIENT; reversion/compression families
 * claim CHOPPY. vol-compression is CHOPPY because its SIGNAL is observed
 * BEFORE the expansion (the entry bar is still a compression bar), so the
 * claim belongs to the pre-breakout regime, not the realised EXPANSION.
 * Weakness state = the other verdict state, for every family.
 */
export const FAMILY_STRENGTH_STATE = Object.freeze({
  "channel-breakout": "EFFICIENT",
  "ma-cross": "EFFICIENT",
  "opening-range": "EFFICIENT",
  "level-retest": "EFFICIENT",
  "band-reversion": "CHOPPY",
  "osc-fade": "CHOPPY",
  "candlestick-reversal": "CHOPPY",
  "vol-compression": "CHOPPY",
});

/**
 * Reversion families: their verdict is explicitly conditional on the ONE
 * standardised exit harness used in this cycle. No new exit is added.
 */
export const REVERSION_FAMILIES = Object.freeze([
  "band-reversion",
  "osc-fade",
  "candlestick-reversal",
]);
export const EXIT_CAVEAT =
  "under the standard exit (1.5 ATR stop, 2R target) only";

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
 * G0 AMENDMENT 3 (2026-10-27, before any real claim result) — RESTORED RULE:
 * "original floor plus the control". v1.1/v1.2 had replaced the original floor
 * with an EXCESS floor (excess > 0.10, net > 0). That was a mistake: it let a
 * claim ship on a strong *relative* edge while still being unprofitable in
 * absolute terms, and it spent the whole +0.10R budget on the control.
 *
 * The rule is now a CONJUNCTION of two independent, day-clustered tests:
 *
 *   (A) NET MEAN   > +0.10R   AND  day-clustered t(net)   > 2
 *   (B) EXCESS     >  0R      AND  day-clustered t(excess) > 2
 *
 * plus the existing vetoes (n >= 100, concentration, year consistency) and
 * the NO_BASELINE veto. The +0.10R floor is back on the ABSOLUTE NET MEAN —
 * the original v1.0 floor — while the matched random-entry control survives
 * as a second significance gate that must be merely positive.
 *
 * NO numeric constant changed: 0.10, 2, 100, 0.50, 0.75 are the same values
 * frozen at G0. Only their arrangement changed, and the SE estimator is the
 * day-clustered CR1 one from Amendment 2. `absoluteNetRMin` is REMOVED (it
 * was the "net > 0" half of the discarded v1.2 rule).
 */
export const CLAIM_CRITERIA = Object.freeze({
  minTradesPerCell: 100,
  practicalFloorR: 0.1, // NET MEAN floor — the ORIGINAL v1.0 floor restored
  tStatMin: 2, // day-clustered t, required for BOTH net mean and excess
  excessFloorR: 0, // excess over matched random baseline must be > 0
  concentrationMax: 0.5, // no single year may contribute >50% of cell R
  loyoPositiveMin: 0.75, // >=75% of leave-one-year-out windows positive
  requireMatchedBaseline: true, // a missing fine AND coarse cell -> NO_BASELINE veto
  baselineMinCellN: 200, // a fine cell needs >= 200 random entries to be sufficient
  note: "CONJUNCTION: net mean > +0.10R with clustered t > 2 AND excess > 0 with clustered t > 2, plus n/concentration/year/NO_BASELINE vetoes. Year-bucketing is a veto, not 24 independent significance tests. See BLUEPRINT.md §7.2.1.",
  amendedAt: "G0 Amendment 3, 2026-10-27, before any claim result",
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
    "The claim's VAL-window cell must independently reach CONFIRMED under the SAME frozen CLAIM_CRITERIA as amended at G0 Amendment 3 (net mean > +0.10R with day-clustered t > 2, AND excess over matched random > 0 with day-clustered t > 2, AND all vetoes clear), evaluated once, with the VAL role spent on promotion.",
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
 * EVIDENCE — G0 AMENDMENT 3 (2026-10-27) REPLACED THE FOUR SUBJECTIVE TIERS.
 *
 * Instead of "tier 1 = peer-reviewed phenomena exist" (an uncheckable claim),
 * each FAMILY now points at ONE empirical study that was actually located and
 * opened, with its full URL, or is marked PRACTITIONER_ONLY. No outcome from
 * our own data was used to build this registry — it is literature only.
 *
 * `evidenceTier` on a card is retained as a FROZEN ORDER RANK so the v1.2
 * TEST_ORDER stays byte-identical; it is DIAGNOSTIC and is NOT an ordering
 * key and NOT an evidence claim any more. The authoritative ordering is the
 * explicit frozen list in claim-cards.draft.mjs.
 */
export const EVIDENCE_GRADES = Object.freeze({
  PEER_REVIEWED_TEST: "at least one empirical study tests this family; URL opened 2026-10-27",
  PRACTITIONER_ONLY: "no empirical study found; claim rests on practitioner literature only",
});

/** One empirical study per family, opened 2026-10-27. Full URLs are literal. */
export const EMPIRICAL_STUDIES = Object.freeze({
  "channel-breakout": Object.freeze({
    grade: "PEER_REVIEWED_TEST",
    citation:
      "Brock, W., Lakonishok, J. & LeBaron, B. (1992). Simple Technical Trading Rules and the Stochastic Properties of Stock Returns. Journal of Finance 47(5), 1731-1764.",
    url: "http://technicalanalysis.org.uk/support-and-resistance/BrockLakonishokLeBaron1992.pdf",
    tests: "trading range break (channel/resistance-support breakout) rules on DJIA 1897-1986",
    finding: "in-sample support; later work (Sullivan, Timmermann & White 1999) warns of data-snooping",
  }),
  "ma-cross": Object.freeze({
    grade: "PEER_REVIEWED_TEST",
    citation:
      "Chong, T.T.-L. & Ng, W.-K. (2008). Technical analysis and the London stock exchange: testing the MACD and RSI rules using the FT30. Applied Economics Letters 15(14), 1111-1114. DOI 10.1080/13504850600993598.",
    url: "https://ideas.repec.org/a/taf/apeclt/v15y2008i14p1111-1114.html",
    tests: "MACD (exponential moving-average crossover) rule on 60 years of FT30",
    finding: "MACD/RSI beat buy-and-hold in most cases (positive, single-market study)",
  }),
  "opening-range": Object.freeze({
    grade: "PEER_REVIEWED_TEST",
    citation:
      "Holmberg, U., Lönnbark, C. & Lundström, C. (2013). Assessing the profitability of intraday opening range breakout strategies. Finance Research Letters 10(1), 47-53. DOI 10.1016/j.frl.2012.09.001.",
    url: "http://www.econ.umu.se/ueslpnr/ues845.pdf",
    tests: "opening-range breakout on US crude-oil futures, bootstrap test",
    finding: "full-sample success is NOT robust across three sub-periods (mixed/negative)",
  }),
  "level-retest": Object.freeze({
    grade: "PEER_REVIEWED_TEST",
    citation:
      "Osler, C. L. (2000). Support for Resistance: Technical Analysis and Intraday Exchange Rates. FRBNY Economic Policy Review 6(2), 53-68.",
    url: "https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf",
    tests: "support/resistance (level) signals from six FX firms, intraday 1996-1998",
    finding: "levels predict intraday trend interruptions, but firms mis-rank level strength",
  }),
  "osc-fade": Object.freeze({
    grade: "PEER_REVIEWED_TEST",
    citation:
      "Chong, T.T.-L., Ng, W.-K. & Liew, V.K.-S. (2014). Revisiting the Performance of MACD and RSI Oscillators. Journal of Risk and Financial Management 7(1), 1-12 / MPRA Paper 54149.",
    url: "https://mpra.ub.uni-muenchen.de/54149/1/MPRA_paper_54149.pdf",
    tests: "RSI(14,30/70) and RSI(21,50) oscillator rules on five OECD indices 1976-2002",
    finding: "RSI(14,30/70) profitable on DJIA but not consistently across markets",
  }),
  "band-reversion": Object.freeze({
    grade: "PEER_REVIEWED_TEST",
    citation:
      "Lento, C., Gradojevic, N. & Wright, C. S. (2007). Investment information content in Bollinger Bands? Applied Financial Economics Letters 3(4), 263-267. DOI 10.1080/17446540701206576.",
    url: "https://www.researchgate.net/publication/46527151_Investment_information_content_in_Bollinger_Bands",
    tests: "Bollinger Band (20,2) and variants, four markets 1995-2004, transaction costs",
    finding: "BB underperform buy-and-hold; contrarian inversion does better (negative for the textbook fade)",
  }),
  "candlestick-reversal": Object.freeze({
    grade: "PEER_REVIEWED_TEST",
    citation:
      "Marshall, B. R., Young, M. R. & Rose, L. C. (2006). Candlestick technical trading strategies: Can they create value for investors? Journal of Banking & Finance 30(8), 2303-2323. DOI 10.1016/j.jbankfin.2005.08.001.",
    url: "https://scispace.com/pdf/candlestick-technical-trading-strategies-can-they-create-2whgphf6vm.pdf",
    tests: "26 candlestick reversal patterns on DJIA component stocks 1992-2002, bootstrap",
    finding: "no value; neither bullish nor bearish signals beat buy-and-hold (negative)",
  }),
  "vol-compression": Object.freeze({
    grade: "PRACTITIONER_ONLY",
    citation:
      "Crabel, T. (1990). Day Trading with Short Term Price Patterns & Opening Range Breakout (Traders Press) — practitioner book, not a peer-reviewed test.",
    url: "https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7",
    tests: "NR7 / inside-bar / volatility-contraction patterns — NO academic test found",
    finding:
      "practitioner only. Holmberg et al. (2013) discusses Crabel's contraction-expansion principle but tests ORB, not NR7/inside-bar. This is the PLAINLY WRONG item: v1.2 ranked this family tier 1 with no empirical study.",
  }),
});

/**
 * STRONGEST PUBLISHED CRITICISM / FAILED REPLICATION per family.
 *
 * G0 AMENDMENT 4 TASK 7. Every URL below was OPENED AND READ on 2026-10-27, so
 * every entry is VERIFIED. Nothing is cited from memory and no URL, author or
 * year is invented. A family with no openable criticism is marked
 * "no openable criticism found" rather than left blank.
 */
export const CRITICISMS = Object.freeze({
  "channel-breakout": Object.freeze({
    opened: "2026-10-27",
    status: "VERIFIED",
    citation:
      "Sullivan, R., Timmermann, A. & White, H. (1999). Data-Snooping, Technical Trading Rule Performance, and the Bootstrap. Journal of Finance 54(5), 1647-1691.",
    url: "https://www.kevinsheppard.com/files/teaching/mfe/advanced-econometrics/Sullivan_Timmermann_White.pdf",
    what: "re-ran the BLL rules over ~7,846 parameterisations; the best rule's edge is largely a data-snooping artefact",
    impact: "NEGATIVE",
  }),
  "ma-cross": Object.freeze({
    opened: "2026-10-27",
    status: "VERIFIED",
    citation:
      "Allen, F. & Karjalainen, R. (1999). Using genetic algorithms to find technical trading rules. Journal of Financial Economics 51(2), 245-271.",
    url: "https://www.cs.montana.edu/courses/spring2007/536/materials/Lopez/genetic.pdf",
    what: "genetic-algorithm MA-style rules earn no consistent excess returns over buy-and-hold out-of-sample after transaction costs",
    impact: "NEGATIVE",
  }),
  "opening-range": Object.freeze({
    opened: "2026-10-27",
    status: "VERIFIED",
    citation:
      "Fetna, M. (2026). Opening-Range Breakout Does Not Survive Trading Costs: A Pre-Registered 225-Cell Study on Sixteen Years of Futures Data. SSRN 7428398.",
    url: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7428398",
    what: "pre-registered 225-cell grid over 16 years of one-minute futures data; zero cells meet the positive bar",
    impact: "NEGATIVE",
    also: {
      citation:
        "Sun, D. (2026). Pricing the fill: a pre-registered out-of-sample test of a 1,637% day-trading strategy. GitHub repository.",
      url: "https://github.com/js3872/Pricing-the-Fill",
      what: "the published 5-minute ORB claim returns -0.0855R/trade (t = -2.16) out-of-sample and was killed by its own pre-registered rule",
    },
  }),
  "level-retest": Object.freeze({
    opened: "2026-10-27",
    status: "VERIFIED",
    citation:
      "Curcio, R., Goodhart, C., Guillaume, D. & Payne, R. (1997). Do technical trading rules generate profits? Conclusions from the intra-day foreign exchange market. International Journal of Finance and Economics 2(4), 267-280.",
    url: "http://support-and-resistance.technicalanalysis.org.uk/Curcio-etal1997.pdf",
    what: "trader-supplied support/resistance rules are on average not profitable intraday; once spreads are accounted for virtually all profits are eliminated",
    impact: "NEGATIVE",
  }),
  "osc-fade": Object.freeze({
    opened: "2026-10-27",
    status: "VERIFIED",
    citation:
      "Muruganandan, S. (2020). Testing the profitability of technical trading rules across market cycles: Evidence from India. Colombo Business Journal 11(1), 24-46.",
    url: "https://mgmt.cmb.ac.lk/cbj/wp-content/uploads/2020/06/2.-Technical-trading-rules.pdf",
    what: "the RSI rule failed to deliver a positive return even before deducting transaction costs, across bull and bear sub-periods",
    impact: "NEGATIVE",
  }),
  "band-reversion": Object.freeze({
    opened: "2026-10-27",
    status: "VERIFIED",
    citation:
      "Fang, J., Jacobsen, B. & Qin, Y. (2017). Popularity versus Profitability: Evidence from Bollinger Bands. Journal of Portfolio Management 43(4), 152-159.",
    url: "https://acfr.aut.ac.nz/__data/assets/pdf_file/0007/29896/100009-Popularity-vs-Profitability-BB-August-Final.pdf",
    what: "Bollinger Band profitability self-destructs with popularity; largely disappeared since Bollinger's 2001 book, worst in the US first",
    impact: "NEGATIVE",
  }),
  "candlestick-reversal": Object.freeze({
    opened: "2026-10-27",
    status: "VERIFIED",
    citation:
      "Marshall, B. R., Young, M. R. & Cahan, R. (2008). Are candlestick technical trading strategies profitable in the Japanese equity market? Review of Quantitative Finance and Accounting 31, 191-207.",
    url: "https://link.springer.com/article/10.1007/s11156-007-0068-1",
    what: "no evidence candlestick strategies add value in Japan over 1975-2004, in the full sample, in three 10-year sub-periods, or in bull or bear markets",
    impact: "NEGATIVE",
  }),
  "vol-compression": Object.freeze({
    opened: "2026-10-27",
    status: "VERIFIED",
    citation:
      "Casey, A. (2024, updated 2026). Toby Crabel Patterns Tested: 17,424 Backtests on 8 Markets. StatOasis.",
    url: "https://statoasis.com/overfit/research/unveiling-toby-crabel-s-up-down-thrust-trading-patterns",
    what: "pre-registered 17,424 backtests of Crabel patterns across 8 markets: 'The pattern is real. The edge is mostly drift.' A random entry matched the up-thrust long on 4 of 8 markets",
    impact: "NEGATIVE",
    note:
      "PRACTITIONER ONLY for the primary study registry (no peer-reviewed NR7/inside-bar test exists). This criticism is a pre-registered backtest of Crabel's thrust patterns, the closest published test of the Crabel family.",
  }),
});

export const EVIDENCE = Object.freeze({
  priorFalseFraction: 0.8,
  testOrder:
    "EXPLICIT FROZEN SEQUENCE (v1.3, byte-identical to v1.2). evidenceTier is a diagnostic rank, NOT an ordering key and NOT an evidence claim.",
  grades: EVIDENCE_GRADES,
  studies: EMPIRICAL_STUDIES,
  openedAt: "2026-10-27, before any strategy result",
  note: "Each family has one opened empirical study or is marked PRACTITIONER_ONLY. Full URLs above. No outcomes from our own data were used.",
  criticisms: "See CRITICISMS: the strongest published criticism or failed replication per family, every URL opened 2026-10-27.",
});
