/**
 * M4/M6 — CLAIM CARDS (DRAFT).
 *
 * STATUS: DRAFT. NOT FROZEN. NOT TESTED.
 *
 * Decision #13: "Draft, review, freeze before testing." This file is the
 * DRAFT. `verify-claims.mjs` REFUSES to run against DRAFT cards unless a
 * reviewer explicitly flips `status` to FROZEN and records the approval.
 *
 * These are TEXTBOOK CLAIMS, not findings. They are written from the published
 * rationale for each strategy family, BEFORE looking at any result on our
 * data. The entire point of M5 is to falsify most of them. Where sources
 * disagree, the claim records the stronger/more common version so the test is
 * a real test rather than a soft target.
 *
 * Strength = state where the strategy is claimed to have positive NET R.
 * Weakness = state where it is claimed to have negative NET R.
 * Both must be CONFIRMED for a strategy to ship (no half-verified strategies).
 *
 * Priority is a FROZEN number (decision #10). It breaks same-bar ties in the
 * one-slot book. It is assigned by family/variant order, NOT by performance —
 * nothing here has been evaluated yet.
 */
import { STATES, EVIDENCE } from "./frozen.mjs";

export const CLAIM_CARD_STATUS = "DRAFT";

/** Freeze metadata — filled in only by an explicit review step. */
export const FREEZE = Object.freeze({
  status: CLAIM_CARD_STATUS,
  approvedBy: null,
  approvedAt: null,
  note: "DRAFT only. Set status=FROZEN with approver + date after human review.",
});

const card = (id, family, variant, strength, weakness, rationale, opts = {}) => ({
  id,
  family,
  variant,
  evidenceTier: opts.tier, // 1 = best-supported ... 4 = weakest (tested LAST)
  strength: { state: strength, direction: +1, claim: `positive net R in confirmed ${strength}` },
  weakness: { state: weakness, direction: -1, claim: `negative net R in confirmed ${weakness}` },
  sessionRestriction: opts.session ?? null, // null = all sessions
  direction: "both", // decision #11
  priority: opts.priority,
  rationale,
  sources: opts.sources ?? [],
});

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
    "WHIPSAW",
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
    "WHIPSAW",
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
 * FIXED-SEQUENCE TEST ORDER (decision: evidence quality, reviewed at G0).
 * Tier 1 first, tier 4 (candlestick) last. Ties break on frozen priority.
 * This is a PRE-REGISTERED order, not a result-dependent one.
 */
export const TEST_ORDER = Object.freeze(
  CLAIM_CARDS.map((c, i) => ({
    id: c.id,
    tier: c.evidenceTier,
    priority: c.priority,
    originalIndex: i,
  }))
    .sort((a, b) => a.tier - b.tier || a.priority - b.priority)
    .map((x, i) => ({ ...x, testOrder: i + 1 })),
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
    if (!STATES.includes(c.strength.state)) errors.push(`${c.id}: bad strength state`);
    if (!STATES.includes(c.weakness.state)) errors.push(`${c.id}: bad weakness state`);
    if (c.strength.state === c.weakness.state) errors.push(`${c.id}: strength == weakness`);
    if (c.sessionRestriction && !["asian", "london", "ny"].includes(c.sessionRestriction)) {
      errors.push(`${c.id}: bad session restriction`);
    }
    if (c.direction !== "both") errors.push(`${c.id}: must trade both sides (decision #11)`);
    if (!c.rationale || c.rationale.length < 30) errors.push(`${c.id}: rationale too short`);
    if (![1, 2, 3, 4].includes(c.evidenceTier)) errors.push(`${c.id}: bad evidence tier`);
  }
  if (CLAIM_CARDS.length !== 24) errors.push(`expected 24 cards, got ${CLAIM_CARDS.length}`);
  if (FAMILIES.length !== 8) errors.push(`expected 8 families, got ${FAMILIES.length}`);
  // Candlestick must be LAST in evidence order (explicit review decision).
  const lastTier = TEST_ORDER[TEST_ORDER.length - 1];
  const lastCard = CLAIM_CARDS.find((c) => c.id === lastTier.id);
  if (lastCard.family !== "candlestick-reversal")
    errors.push("candlestick-reversal must be tested LAST");
  if (EVIDENCE.priorFalseFraction < 0.75) errors.push("prior false fraction too optimistic");
  return errors;
}
