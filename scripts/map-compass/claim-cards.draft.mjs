/**
 * M4/M6 — CLAIM CARDS (DRAFT).
 *
 * STATUS: DRAFT. NOT FROZEN. NOT TESTED. (G0 Amendment 3 did NOT freeze them.)
 *
 * Decision #13: "Draft, review, freeze before testing." This file is the
 * DRAFT. `verify-claims.mjs` REFUSES to run against DRAFT cards unless a
 * reviewer explicitly flips `status` to FROZEN and records the approval.
 *
 * These are TEXTBOOK CLAIMS, not findings. They are written from the published
 * rationale for each strategy family, BEFORE looking at any result on our
 * data. The entire point of M5 is to falsify most of them.
 *
 * G0 AMENDMENT 3 (2026-10-27, before any result) — VERDICT STATES:
 * strength/weakness `state` is now one of TWO verdict states, EFFICIENT or
 * CHOPPY (see frozen.mjs VERDICT_STATES). The old four Map states are kept as
 * `textbookState` + `fourStates` DIAGNOSTICS and never decide a verdict.
 *
 * EVIDENCE: the old subjective 1-4 tiers were REPLACED by one opened empirical
 * study per family (full URL in frozen.mjs EMPIRICAL_STUDIES) or the label
 * PRACTITIONER_ONLY. `evidenceTier` survives only as a frozen ORDER RANK.
 * TEST_ORDER is an EXPLICIT frozen list, byte-identical to v1.2.
 *
 * Priority is a FROZEN number (decision #10), assigned by family/variant
 * order, NOT by performance — nothing here has been evaluated yet.
 */
import {
  STATES,
  VERDICT_STATES,
  FOUR_STATES_OF,
  FAMILY_STRENGTH_STATE,
  otherVerdictState,
  REVERSION_FAMILIES,
  EXIT_CAVEAT,
  EMPIRICAL_STUDIES,
  EVIDENCE,
} from "./frozen.mjs";

export const CLAIM_CARD_STATUS = "DRAFT";

/** Freeze metadata — filled in only by an explicit review step. */
export const FREEZE = Object.freeze({
  status: CLAIM_CARD_STATUS,
  approvedBy: null,
  approvedAt: null,
  note: "DRAFT only. Set status=FROZEN with approver + date after human review.",
});

/**
 * `strength`/`weakness` arguments below are the ORIGINAL four-state textbook
 * labels; they are retained as DIAGNOSTICS. The authoritative claim states are
 * derived from the family mapping frozen at G0 Amendment 3.
 */
const card = (id, family, variant, textbookStrength, textbookWeakness, rationale, opts = {}) => {
  const vs = FAMILY_STRENGTH_STATE[family];
  const ws = otherVerdictState(vs);
  const ev = EMPIRICAL_STUDIES[family];
  if (!ev) throw new Error(`no evidence registry entry for family ${family}`);
  return {
    id,
    family,
    variant,
    evidenceTier: opts.tier, // FROZEN ORDER RANK only — not an evidence claim
    evidence: ev, // { grade, citation, url, tests, finding }
    verdictStrength: vs,
    verdictWeakness: ws,
    strength: {
      state: vs,
      direction: +1,
      claim: `positive net R in ${vs}`,
      textbookState: textbookStrength, // four-state diagnostic
      fourStates: FOUR_STATES_OF[vs],
    },
    weakness: {
      state: ws,
      direction: -1,
      claim: `negative net R in ${ws}`,
      textbookState: textbookWeakness,
      fourStates: FOUR_STATES_OF[ws],
    },
    sessionRestriction: opts.session ?? null,
    direction: "both", // decision #11
    priority: opts.priority,
    rationale,
    sources: [...(opts.sources ?? []), ev.citation, ev.url],
    // Task 4: reversion-family verdicts are exit-conditional, printed verbatim.
    exitCaveat: REVERSION_FAMILIES.includes(family) ? EXIT_CAVEAT : null,
  };
};

/**
 * 8 families x 3 variants = 24 known strategies.
 * States: EXPANSION (trending+high vol), GRIND (trending+normal vol),
 *         WHIPSAW (choppy+high vol), QUIET (choppy+normal vol).
 */
export const CLAIM_CARDS = Object.freeze([
  // --- F1 channel breakout -------------------------------------------------
  card(
    "donchian-20",
    "channel-breakout",
    "Donchian 20-bar high/low break",
    "EXPANSION",
    "QUIET",
    "Breakouts capture the start of a sustained move; in a quiet range there is no follow-through, so entries reverse into whipsaw.",
    { tier: 1, priority: 1, sources: ["Donchian / Turtle rules"] },
  ),
  card(
    "donchian-55",
    "channel-breakout",
    "Donchian 55-bar high/low break",
    "EXPANSION",
    "QUIET",
    "The classic Turtle long-term channel needs a genuine expansion; a slow channel in a range produces late, mean-reverting fills.",
    { tier: 1, priority: 2, sources: ["Turtle Trading (Dennis/Eckhardt)"] },
  ),
  card(
    "dual-thrust",
    "channel-breakout",
    "Dual Thrust opening range break",
    "EXPANSION",
    "QUIET",
    "Uses the prior day's range to set a breakout band; needs volatility expansion to travel beyond the band.",
    { tier: 1, priority: 3, sources: ["Dual Thrust (Chalek)"] },
  ),

  // --- F2 MA / MACD / Ichimoku cross --------------------------------------
  card(
    "sma-20-50",
    "ma-cross",
    "SMA20 x SMA50 crossover",
    "GRIND",
    "WHIPSAW",
    "Moving-average crossovers need a persistent, low-noise trend; high-volatility chop generates repeated false crosses.",
    { tier: 1, priority: 4, sources: ["Standard trend-following literature"] },
  ),
  card(
    "macd-cross",
    "ma-cross",
    "MACD signal-line cross",
    "GRIND",
    "WHIPSAW",
    "MACD is a smoothed trend filter; it lags and whipsaws when volatility is high but direction is absent.",
    { tier: 1, priority: 5, sources: ["Appel, MACD"] },
  ),
  card(
    "ichimoku-tk",
    "ma-cross",
    "Ichimoku Tenkan/Kijun cross",
    "GRIND",
    "WHIPSAW",
    "Ichimoku is designed for persistent trends; its equilibrium lines produce noise signals in choppy high-volatility conditions.",
    { tier: 1, priority: 6, sources: ["Hosoda, Ichimoku Kinko Hyo"] },
  ),

  // --- F3 opening range / session range breakout ---------------------------
  card(
    "asian-range-break",
    "opening-range",
    "Asian-session range breakout",
    "EXPANSION",
    "QUIET",
    "The Asian range is a compression box; London/NY expansion is claimed to resolve it directionally.",
    { tier: 2, priority: 7, session: "london", sources: ["Opening-range breakout literature"] },
  ),
  card(
    "london-orb-30",
    "opening-range",
    "London first-30m ORB",
    "EXPANSION",
    "QUIET",
    "The first 30 minutes of London set the day's directional tone; quiet days fail to extend.",
    { tier: 2, priority: 8, session: "london", sources: ["Crabel, Open Range Breakout"] },
  ),
  card(
    "pdh-pdl-break",
    "opening-range",
    "Prior-day high/low break",
    "EXPANSION",
    "QUIET",
    "A break of the prior day's extremes signals new participation; in a range it is a fade trap.",
    { tier: 2, priority: 9, sources: ["Classic price-action literature"] },
  ),

  // --- F4 level retest / pivots -------------------------------------------
  card(
    "pdh-retest",
    "level-retest",
    "Prior-day high retest long",
    "GRIND",
    "WHIPSAW",
    "A broken level turning into support is a trend-continuation entry; high-vol chop destroys the level's meaning.",
    { tier: 3, priority: 10, sources: ["Support/resistance retest literature"] },
  ),
  card(
    "pdl-retest",
    "level-retest",
    "Prior-day low retest short",
    "GRIND",
    "WHIPSAW",
    "Mirror of the high retest; same dependence on persistent direction.",
    { tier: 3, priority: 11, sources: ["Support/resistance retest literature"] },
  ),
  card(
    "classic-pivot",
    "level-retest",
    "Classic floor-pivot bounce",
    "GRIND",
    "WHIPSAW",
    "Pivot levels act as intraday support/resistance in an ordered market; they are run through in volatile chop.",
    { tier: 3, priority: 12, sources: ["Floor-trader pivots"] },
  ),

  // --- F5 oscillator fade -------------------------------------------------
  card(
    "rsi-14-30-70",
    "osc-fade",
    "RSI14 fade at 30/70",
    "QUIET",
    "EXPANSION",
    "In a range, overbought/oversold readings revert; in a strong trend RSI stays extreme and fading catches a knife.",
    { tier: 3, priority: 13, sources: ["Wilder, RSI"] },
  ),
  card(
    "williams-r-fade",
    "osc-fade",
    "Williams %R extreme fade",
    "QUIET",
    "EXPANSION",
    "Williams %R assumes mean reversion from extremes, which holds only in a non-trending market.",
    { tier: 3, priority: 14, sources: ["Williams, %R"] },
  ),
  card(
    "stochastic-14-fade",
    "osc-fade",
    "Stochastic 14 extreme fade",
    "QUIET",
    "EXPANSION",
    "Stochastic extremes signal exhaustion in a range but persist during a directional expansion.",
    { tier: 3, priority: 15, sources: ["Lane, Stochastic"] },
  ),

  // --- F6 band reversion --------------------------------------------------
  card(
    "bollinger-20-2",
    "band-reversion",
    "Bollinger 20/2 band fade",
    "QUIET",
    "EXPANSION",
    "Bands contain ~95% of range-bound prices; a strong trend walks the band instead of reverting.",
    { tier: 2, priority: 16, sources: ["Bollinger, Bollinger Bands"] },
  ),
  card(
    "keltner-20-atr",
    "band-reversion",
    "Keltner 20/ATR band fade",
    "QUIET",
    "EXPANSION",
    "ATR-based envelope fade assumes stable volatility; expansion breaks the envelope legitimately.",
    { tier: 2, priority: 17, sources: ["Keltner channel literature"] },
  ),
  card(
    "bb-squeeze-fade",
    "band-reversion",
    "Bollinger squeeze fade",
    "QUIET",
    // G0 Amendment 3 STATE CORRECTION (pre-results): v1.2 used WHIPSAW as the
    // textbook weakness, which is in the SAME CHOPPY verdict state as its
    // strength QUIET. With "weakness = the other verdict state" that is plainly
    // wrong. Corrected to EXPANSION (EFFICIENT). Verdict was already CHOPPY/EFFICIENT.
    "EXPANSION",
    "A squeeze precedes expansion, so fading the first move is claimed to work only while volatility stays compressed.",
    { tier: 2, priority: 18, sources: ["Bollinger, squeeze"] },
  ),

  // --- F7 candlestick reversal --------------------------------------------
  card(
    "engulfing",
    "candlestick-reversal",
    "Bull/bear engulfing reversal",
    "QUIET",
    "EXPANSION",
    "Reversal candles need a low-noise backdrop to be readable; in an expansion they are continuation noise.",
    { tier: 4, priority: 19, sources: ["Nison, Japanese Candlestick Charting"] },
  ),
  card(
    "morning-evening-star",
    "candlestick-reversal",
    "Morning/evening star",
    "QUIET",
    "EXPANSION",
    "Three-candle reversal patterns assume exhaustion; a strong trend absorbs them.",
    { tier: 4, priority: 20, sources: ["Nison, Japanese Candlestick Charting"] },
  ),
  card(
    "three-soldiers-crows",
    "candlestick-reversal",
    "Three white soldiers / black crows fade",
    "QUIET",
    // G0 Amendment 3 STATE CORRECTION (pre-results): same CHOPPY/CHOPPY
    // conflict as bb-squeeze-fade. Corrected to EXPANSION (EFFICIENT).
    "EXPANSION",
    "A three-bar directional run in a quiet market is claimed to be exhausted; in high-vol chop it is meaningless.",
    { tier: 4, priority: 21, sources: ["Nison, Japanese Candlestick Charting"] },
  ),

  // --- F8 volatility compression -> expansion ------------------------------
  card(
    "atr-squeeze-break",
    "vol-compression",
    "ATR-squeeze breakout",
    "EXPANSION",
    "WHIPSAW",
    "Compression stores energy; the resolution is a directional expansion. High-vol chop produces false resolutions.",
    { tier: 1, priority: 22, sources: ["Volatility-contraction pattern literature"] },
  ),
  card(
    "nr7-break",
    "vol-compression",
    "NR7 narrowest-range breakout",
    "EXPANSION",
    "WHIPSAW",
    "The narrowest range of 7 bars marks compression; the breakout should travel. In chop it reverses.",
    { tier: 1, priority: 23, sources: ["Toby Crabel, NR7"] },
  ),
  card(
    "inside-bar-break",
    "vol-compression",
    "Inside-bar break",
    "EXPANSION",
    "QUIET",
    "An inside bar is single-bar compression; its break needs follow-through that a quiet market cannot supply.",
    { tier: 1, priority: 24, sources: ["Price-action literature"] },
  ),
]);

export const FAMILIES = Object.freeze([...new Set(CLAIM_CARDS.map((c) => c.family))]);

/**
 * CARD RELATIONS (G0 Amendment 3) — near-duplicate and mirror-image cards.
 *
 * Near-duplicates are two variants of essentially the SAME signal (different
 * lookback or parameter), so they fire on overlapping entry bars. Mirror
 * images are the long/short versions of one pattern. Both reduce the
 * effective sample of a pooled family cell. Listed exhaustively for all
 * 8 families x 3 pairs = 24 within-family pairs.
 */
export const CARD_RELATIONS = Object.freeze([
  // F1 channel-breakout
  { family: "channel-breakout", a: "donchian-20", b: "donchian-55", type: "NEAR_DUPLICATE", why: "same Donchian rule, 20 vs 55-bar lookback" },
  { family: "channel-breakout", a: "donchian-20", b: "dual-thrust", type: "RELATED", why: "both range breakouts, different range definition" },
  { family: "channel-breakout", a: "donchian-55", b: "dual-thrust", type: "RELATED", why: "both range breakouts, different range definition" },
  // F2 ma-cross
  { family: "ma-cross", a: "sma-20-50", b: "macd-cross", type: "NEAR_DUPLICATE", why: "MACD is an EMA crossover of the same family" },
  { family: "ma-cross", a: "sma-20-50", b: "ichimoku-tk", type: "NEAR_DUPLICATE", why: "both two-moving-average crosses" },
  { family: "ma-cross", a: "macd-cross", b: "ichimoku-tk", type: "NEAR_DUPLICATE", why: "both EMA-based crosses" },
  // F3 opening-range
  { family: "opening-range", a: "asian-range-break", b: "london-orb-30", type: "NEAR_DUPLICATE", why: "both session-range breakouts" },
  { family: "opening-range", a: "asian-range-break", b: "pdh-pdl-break", type: "RELATED", why: "prior-day range vs session range" },
  { family: "opening-range", a: "london-orb-30", b: "pdh-pdl-break", type: "RELATED", why: "prior-day range vs session range" },
  // F4 level-retest
  { family: "level-retest", a: "pdh-retest", b: "pdl-retest", type: "MIRROR_IMAGE", why: "prior-day HIGH retest long vs prior-day LOW retest short" },
  { family: "level-retest", a: "pdh-retest", b: "classic-pivot", type: "RELATED", why: "both retest a reference level" },
  { family: "level-retest", a: "pdl-retest", b: "classic-pivot", type: "RELATED", why: "both retest a reference level" },
  // F5 osc-fade
  { family: "osc-fade", a: "rsi-14-30-70", b: "williams-r-fade", type: "NEAR_DUPLICATE", why: "Williams %R is a normalised stochastic/RSI-family oscillator" },
  { family: "osc-fade", a: "rsi-14-30-70", b: "stochastic-14-fade", type: "NEAR_DUPLICATE", why: "both 14-period bounded oscillators with 30/70-style extremes" },
  { family: "osc-fade", a: "williams-r-fade", b: "stochastic-14-fade", type: "NEAR_DUPLICATE", why: "Williams %R is a linear transform of the raw stochastic" },
  // F6 band-reversion
  { family: "band-reversion", a: "bollinger-20-2", b: "keltner-20-atr", type: "NEAR_DUPLICATE", why: "both 20-bar envelope fades, sigma vs ATR width" },
  { family: "band-reversion", a: "bollinger-20-2", b: "bb-squeeze-fade", type: "RELATED", why: "both Bollinger-based, different trigger (band vs squeeze)" },
  { family: "band-reversion", a: "keltner-20-atr", b: "bb-squeeze-fade", type: "RELATED", why: "envelope fade vs volatility-squeeze fade" },
  // F7 candlestick-reversal
  { family: "candlestick-reversal", a: "engulfing", b: "morning-evening-star", type: "NEAR_DUPLICATE", why: "both multi-bar reversal candle patterns" },
  { family: "candlestick-reversal", a: "engulfing", b: "three-soldiers-crows", type: "RELATED", why: "both candle-body reversal/exhaustion" },
  { family: "candlestick-reversal", a: "morning-evening-star", b: "three-soldiers-crows", type: "RELATED", why: "both multi-candle exhaustion patterns" },
  // F8 vol-compression
  { family: "vol-compression", a: "atr-squeeze-break", b: "nr7-break", type: "NEAR_DUPLICATE", why: "both narrow-range compression breakouts" },
  { family: "vol-compression", a: "atr-squeeze-break", b: "inside-bar-break", type: "RELATED", why: "both compression, different bar definition" },
  { family: "vol-compression", a: "nr7-break", b: "inside-bar-break", type: "RELATED", why: "multi-bar vs single-bar compression" },
]);

export const NEAR_DUPLICATES = Object.freeze(
  CARD_RELATIONS.filter((r) => r.type === "NEAR_DUPLICATE").map((r) => [r.a, r.b]),
);
export const MIRROR_IMAGES = Object.freeze(
  CARD_RELATIONS.filter((r) => r.type === "MIRROR_IMAGE").map((r) => [r.a, r.b]),
);

/**
 * CROSS-FAMILY mirror images (diagnostic only; they do NOT change within-family
 * overlap because pooling is per family). Listed so a reviewer can see them.
 */
export const CROSS_FAMILY_MIRRORS = Object.freeze([
  { a: "pdh-pdl-break", b: "pdh-retest", why: "break vs retest of the same prior-day high" },
  { a: "pdh-pdl-break", b: "pdl-retest", why: "break vs retest of the same prior-day low" },
  { a: "rsi-14-30-70", b: "bollinger-20-2", why: "oscillator extreme vs band extreme fade" },
  { a: "engulfing", b: "three-soldiers-crows", why: "reversal candle vs continuation-candle fade" },
]);

/**
 * EXPLICIT FROZEN TEST SEQUENCE — byte-identical to v1.2 (tier ascending,
 * then priority). G0 Amendment 3 replaced the tier DEFINITIONS but deliberately
 * did NOT re-sort this sequence. Any change here is a new cycle.
 */
export const FROZEN_TEST_SEQUENCE = Object.freeze([
  "donchian-20", "donchian-55", "dual-thrust",
  "sma-20-50", "macd-cross", "ichimoku-tk",
  "atr-squeeze-break", "nr7-break", "inside-bar-break",
  "asian-range-break", "london-orb-30", "pdh-pdl-break",
  "bollinger-20-2", "keltner-20-atr", "bb-squeeze-fade",
  "pdh-retest", "pdl-retest", "classic-pivot",
  "rsi-14-30-70", "williams-r-fade", "stochastic-14-fade",
  "engulfing", "morning-evening-star", "three-soldiers-crows",
]);

export const TEST_ORDER = Object.freeze(
  FROZEN_TEST_SEQUENCE.map((id, i) => {
    const c = CLAIM_CARDS.find((x) => x.id === id);
    return {
      id,
      tier: c.evidenceTier,
      priority: c.priority,
      originalIndex: CLAIM_CARDS.indexOf(c),
      testOrder: i + 1,
    };
  }),
);

/** Structural validation — run by tests, not by a human. */
export function validateClaimCards() {
  const errors = [];
  const ids = new Set();
  const priorities = new Set();
  for (const c of CLAIM_CARDS) {
    if (ids.has(c.id)) errors.push(`duplicate id ${c.id}`);
    ids.add(c.id);
    if (priorities.has(c.priority)) errors.push(`duplicate priority ${c.priority}`);
    priorities.add(c.priority);
    if (!VERDICT_STATES.includes(c.strength.state)) errors.push(`${c.id}: bad strength verdict state`);
    if (!VERDICT_STATES.includes(c.weakness.state)) errors.push(`${c.id}: bad weakness verdict state`);
    if (c.strength.state === c.weakness.state) errors.push(`${c.id}: strength == weakness`);
    if (c.strength.state !== FAMILY_STRENGTH_STATE[c.family])
      errors.push(`${c.id}: strength state contradicts family mapping`);
    if (c.weakness.state !== otherVerdictState(c.strength.state))
      errors.push(`${c.id}: weakness must be the other verdict state`);
    if (!STATES.includes(c.strength.textbookState))
      errors.push(`${c.id}: bad four-state strength diagnostic`);
    if (!STATES.includes(c.weakness.textbookState))
      errors.push(`${c.id}: bad four-state weakness diagnostic`);
    if (!c.evidence?.url || !c.evidence?.grade)
      errors.push(`${c.id}: missing empirical study / practitioner-only mark`);
    if (REVERSION_FAMILIES.includes(c.family) && c.exitCaveat !== EXIT_CAVEAT)
      errors.push(`${c.id}: reversion family must carry the standard-exit caveat`);
    if (c.sessionRestriction && !["asian", "london", "ny"].includes(c.sessionRestriction)) {
      errors.push(`${c.id}: bad session restriction`);
    }
    if (c.direction !== "both") errors.push(`${c.id}: must trade both sides (decision #11)`);
    if (!c.rationale || c.rationale.length < 30) errors.push(`${c.id}: rationale too short`);
    if (![1, 2, 3, 4].includes(c.evidenceTier)) errors.push(`${c.id}: bad frozen order rank`);
  }
  if (CLAIM_CARDS.length !== 24) errors.push(`expected 24 cards, got ${CLAIM_CARDS.length}`);
  if (FAMILIES.length !== 8) errors.push(`expected 8 families, got ${FAMILIES.length}`);
  if (CARD_RELATIONS.length !== 24) errors.push("expected 24 within-family card pairs");
  for (const f of FAMILIES) {
    if (CARD_RELATIONS.filter((r) => r.family === f).length !== 3)
      errors.push(`${f}: expected 3 within-family pairs`);
  }
  // TEST_ORDER is EXACTLY the frozen sequence — no re-sorting by new tiers.
  if (JSON.stringify(TEST_ORDER.map((t) => t.id)) !== JSON.stringify(FROZEN_TEST_SEQUENCE))
    errors.push("TEST_ORDER is not the frozen v1.2 sequence");
  // Candlestick must be LAST in evidence order (explicit review decision).
  const lastTier = TEST_ORDER[TEST_ORDER.length - 1];
  const lastCard = CLAIM_CARDS.find((c) => c.id === lastTier.id);
  if (lastCard.family !== "candlestick-reversal")
    errors.push("candlestick-reversal must be tested LAST");
  if (EVIDENCE.priorFalseFraction < 0.75) errors.push("prior false fraction too optimistic");
  return errors;
}
