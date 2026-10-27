# Claim cards — FULL TEXT (all 24, in TEST_ORDER)

**Generated:** 2026-10-27T04:22:05.680Z
**Card status:** `DRAFT` — DRAFT. NOT FROZEN. NOT TESTED.
**Cards:** 24 | **Families:** 8 | **Prior false fraction:** 0.8
**Order:** evidenceTier ascending, then priority ascending (fixed sequence)

> This file is generated mechanically from `scripts/map-compass/claim-cards.draft.mjs`
> by `print-claim-cards.mjs`. It is a REVIEW dump requested by G0 Amendment 2.
> **No card is frozen here.** Strength/weakness claims are written from published
> rationale BEFORE any result on our data. `verify-claims.mjs` refuses real
> verification while `FREEZE.status === "DRAFT"`. Editing a card after results
> would be the laundering this project forbids — change it NOW, during review.

## Tier key

- **Tier 1** — peer-reviewed momentum/trend or volatility phenomena exist
- **Tier 2** — some academic support, mostly at daily horizon
- **Tier 3** — practitioner literature, little rigorous evidence
- **Tier 4** — largely anecdotal; weakest prior — tested LAST

## Index

| # | ID | Family | Tier | Priority | Strength state | Weakness state |
| -: | -- | ------ | ---: | -------: | -------------- | -------------- |
| 1 | `donchian-20` | channel-breakout | 1 | 1 | EXPANSION | QUIET |
| 2 | `donchian-55` | channel-breakout | 1 | 2 | EXPANSION | QUIET |
| 3 | `dual-thrust` | channel-breakout | 1 | 3 | EXPANSION | QUIET |
| 4 | `sma-20-50` | ma-cross | 1 | 4 | GRIND | WHIPSAW |
| 5 | `macd-cross` | ma-cross | 1 | 5 | GRIND | WHIPSAW |
| 6 | `ichimoku-tk` | ma-cross | 1 | 6 | GRIND | WHIPSAW |
| 7 | `atr-squeeze-break` | vol-compression | 1 | 22 | EXPANSION | WHIPSAW |
| 8 | `nr7-break` | vol-compression | 1 | 23 | EXPANSION | WHIPSAW |
| 9 | `inside-bar-break` | vol-compression | 1 | 24 | EXPANSION | QUIET |
| 10 | `asian-range-break` | opening-range | 2 | 7 | EXPANSION | QUIET |
| 11 | `london-orb-30` | opening-range | 2 | 8 | EXPANSION | QUIET |
| 12 | `pdh-pdl-break` | opening-range | 2 | 9 | EXPANSION | QUIET |
| 13 | `bollinger-20-2` | band-reversion | 2 | 16 | QUIET | EXPANSION |
| 14 | `keltner-20-atr` | band-reversion | 2 | 17 | QUIET | EXPANSION |
| 15 | `bb-squeeze-fade` | band-reversion | 2 | 18 | QUIET | WHIPSAW |
| 16 | `pdh-retest` | level-retest | 3 | 10 | GRIND | WHIPSAW |
| 17 | `pdl-retest` | level-retest | 3 | 11 | GRIND | WHIPSAW |
| 18 | `classic-pivot` | level-retest | 3 | 12 | GRIND | WHIPSAW |
| 19 | `rsi-14-30-70` | osc-fade | 3 | 13 | QUIET | EXPANSION |
| 20 | `williams-r-fade` | osc-fade | 3 | 14 | QUIET | EXPANSION |
| 21 | `stochastic-14-fade` | osc-fade | 3 | 15 | QUIET | EXPANSION |
| 22 | `engulfing` | candlestick-reversal | 4 | 19 | QUIET | EXPANSION |
| 23 | `morning-evening-star` | candlestick-reversal | 4 | 20 | QUIET | EXPANSION |
| 24 | `three-soldiers-crows` | candlestick-reversal | 4 | 21 | QUIET | WHIPSAW |

---

## 1. `donchian-20`

| Field | Value |
| ----- | ----- |
| **Test order** | 1 of 24 (original index 0) |
| **ID** | `donchian-20` |
| **Family** | channel-breakout |
| **Variant** | Donchian 20-bar high/low break |
| **Evidence tier** | 1 |
| **Priority** | 1 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **EXPANSION**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed EXPANSION

**WEAKNESS claim**

- State: **QUIET**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed QUIET

**Rationale (as written, pre-results)**

> Breakouts capture the start of a sustained move; in a quiet range there is no follow-through, so entries reverse into whipsaw.

**Source(s)**

- Donchian / Turtle rules

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 2. `donchian-55`

| Field | Value |
| ----- | ----- |
| **Test order** | 2 of 24 (original index 1) |
| **ID** | `donchian-55` |
| **Family** | channel-breakout |
| **Variant** | Donchian 55-bar high/low break |
| **Evidence tier** | 1 |
| **Priority** | 2 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **EXPANSION**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed EXPANSION

**WEAKNESS claim**

- State: **QUIET**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed QUIET

**Rationale (as written, pre-results)**

> The classic Turtle long-term channel needs a genuine expansion; a slow channel in a range produces late, mean-reverting fills.

**Source(s)**

- Turtle Trading (Dennis/Eckhardt)

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 3. `dual-thrust`

| Field | Value |
| ----- | ----- |
| **Test order** | 3 of 24 (original index 2) |
| **ID** | `dual-thrust` |
| **Family** | channel-breakout |
| **Variant** | Dual Thrust opening range break |
| **Evidence tier** | 1 |
| **Priority** | 3 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **EXPANSION**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed EXPANSION

**WEAKNESS claim**

- State: **QUIET**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed QUIET

**Rationale (as written, pre-results)**

> Uses the prior day's range to set a breakout band; needs volatility expansion to travel beyond the band.

**Source(s)**

- Dual Thrust (Chalek)

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 4. `sma-20-50`

| Field | Value |
| ----- | ----- |
| **Test order** | 4 of 24 (original index 3) |
| **ID** | `sma-20-50` |
| **Family** | ma-cross |
| **Variant** | SMA20 x SMA50 crossover |
| **Evidence tier** | 1 |
| **Priority** | 4 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **GRIND**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed GRIND

**WEAKNESS claim**

- State: **WHIPSAW**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed WHIPSAW

**Rationale (as written, pre-results)**

> Moving-average crossovers need a persistent, low-noise trend; high-volatility chop generates repeated false crosses.

**Source(s)**

- Standard trend-following literature

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 5. `macd-cross`

| Field | Value |
| ----- | ----- |
| **Test order** | 5 of 24 (original index 4) |
| **ID** | `macd-cross` |
| **Family** | ma-cross |
| **Variant** | MACD signal-line cross |
| **Evidence tier** | 1 |
| **Priority** | 5 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **GRIND**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed GRIND

**WEAKNESS claim**

- State: **WHIPSAW**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed WHIPSAW

**Rationale (as written, pre-results)**

> MACD is a smoothed trend filter; it lags and whipsaws when volatility is high but direction is absent.

**Source(s)**

- Appel, MACD

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 6. `ichimoku-tk`

| Field | Value |
| ----- | ----- |
| **Test order** | 6 of 24 (original index 5) |
| **ID** | `ichimoku-tk` |
| **Family** | ma-cross |
| **Variant** | Ichimoku Tenkan/Kijun cross |
| **Evidence tier** | 1 |
| **Priority** | 6 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **GRIND**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed GRIND

**WEAKNESS claim**

- State: **WHIPSAW**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed WHIPSAW

**Rationale (as written, pre-results)**

> Ichimoku is designed for persistent trends; its equilibrium lines produce noise signals in choppy high-volatility conditions.

**Source(s)**

- Hosoda, Ichimoku Kinko Hyo

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 7. `atr-squeeze-break`

| Field | Value |
| ----- | ----- |
| **Test order** | 7 of 24 (original index 21) |
| **ID** | `atr-squeeze-break` |
| **Family** | vol-compression |
| **Variant** | ATR-squeeze breakout |
| **Evidence tier** | 1 |
| **Priority** | 22 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **EXPANSION**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed EXPANSION

**WEAKNESS claim**

- State: **WHIPSAW**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed WHIPSAW

**Rationale (as written, pre-results)**

> Compression stores energy; the resolution is a directional expansion. High-vol chop produces false resolutions.

**Source(s)**

- Volatility-contraction pattern literature

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 8. `nr7-break`

| Field | Value |
| ----- | ----- |
| **Test order** | 8 of 24 (original index 22) |
| **ID** | `nr7-break` |
| **Family** | vol-compression |
| **Variant** | NR7 narrowest-range breakout |
| **Evidence tier** | 1 |
| **Priority** | 23 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **EXPANSION**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed EXPANSION

**WEAKNESS claim**

- State: **WHIPSAW**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed WHIPSAW

**Rationale (as written, pre-results)**

> The narrowest range of 7 bars marks compression; the breakout should travel. In chop it reverses.

**Source(s)**

- Toby Crabel, NR7

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 9. `inside-bar-break`

| Field | Value |
| ----- | ----- |
| **Test order** | 9 of 24 (original index 23) |
| **ID** | `inside-bar-break` |
| **Family** | vol-compression |
| **Variant** | Inside-bar break |
| **Evidence tier** | 1 |
| **Priority** | 24 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **EXPANSION**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed EXPANSION

**WEAKNESS claim**

- State: **QUIET**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed QUIET

**Rationale (as written, pre-results)**

> An inside bar is single-bar compression; its break needs follow-through that a quiet market cannot supply.

**Source(s)**

- Price-action literature

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 10. `asian-range-break`

| Field | Value |
| ----- | ----- |
| **Test order** | 10 of 24 (original index 6) |
| **ID** | `asian-range-break` |
| **Family** | opening-range |
| **Variant** | Asian-session range breakout |
| **Evidence tier** | 2 |
| **Priority** | 7 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | london |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **EXPANSION**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed EXPANSION

**WEAKNESS claim**

- State: **QUIET**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed QUIET

**Rationale (as written, pre-results)**

> The Asian range is a compression box; London/NY expansion is claimed to resolve it directionally.

**Source(s)**

- Opening-range breakout literature

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 11. `london-orb-30`

| Field | Value |
| ----- | ----- |
| **Test order** | 11 of 24 (original index 7) |
| **ID** | `london-orb-30` |
| **Family** | opening-range |
| **Variant** | London first-30m ORB |
| **Evidence tier** | 2 |
| **Priority** | 8 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | london |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **EXPANSION**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed EXPANSION

**WEAKNESS claim**

- State: **QUIET**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed QUIET

**Rationale (as written, pre-results)**

> The first 30 minutes of London set the day's directional tone; quiet days fail to extend.

**Source(s)**

- Crabel, Open Range Breakout

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 12. `pdh-pdl-break`

| Field | Value |
| ----- | ----- |
| **Test order** | 12 of 24 (original index 8) |
| **ID** | `pdh-pdl-break` |
| **Family** | opening-range |
| **Variant** | Prior-day high/low break |
| **Evidence tier** | 2 |
| **Priority** | 9 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **EXPANSION**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed EXPANSION

**WEAKNESS claim**

- State: **QUIET**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed QUIET

**Rationale (as written, pre-results)**

> A break of the prior day's extremes signals new participation; in a range it is a fade trap.

**Source(s)**

- Classic price-action literature

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 13. `bollinger-20-2`

| Field | Value |
| ----- | ----- |
| **Test order** | 13 of 24 (original index 15) |
| **ID** | `bollinger-20-2` |
| **Family** | band-reversion |
| **Variant** | Bollinger 20/2 band fade |
| **Evidence tier** | 2 |
| **Priority** | 16 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **QUIET**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed QUIET

**WEAKNESS claim**

- State: **EXPANSION**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed EXPANSION

**Rationale (as written, pre-results)**

> Bands contain ~95% of range-bound prices; a strong trend walks the band instead of reverting.

**Source(s)**

- Bollinger, Bollinger Bands

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 14. `keltner-20-atr`

| Field | Value |
| ----- | ----- |
| **Test order** | 14 of 24 (original index 16) |
| **ID** | `keltner-20-atr` |
| **Family** | band-reversion |
| **Variant** | Keltner 20/ATR band fade |
| **Evidence tier** | 2 |
| **Priority** | 17 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **QUIET**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed QUIET

**WEAKNESS claim**

- State: **EXPANSION**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed EXPANSION

**Rationale (as written, pre-results)**

> ATR-based envelope fade assumes stable volatility; expansion breaks the envelope legitimately.

**Source(s)**

- Keltner channel literature

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 15. `bb-squeeze-fade`

| Field | Value |
| ----- | ----- |
| **Test order** | 15 of 24 (original index 17) |
| **ID** | `bb-squeeze-fade` |
| **Family** | band-reversion |
| **Variant** | Bollinger squeeze fade |
| **Evidence tier** | 2 |
| **Priority** | 18 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **QUIET**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed QUIET

**WEAKNESS claim**

- State: **WHIPSAW**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed WHIPSAW

**Rationale (as written, pre-results)**

> A squeeze precedes expansion, so fading the first move is claimed to work only while volatility stays compressed.

**Source(s)**

- Bollinger, squeeze

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 16. `pdh-retest`

| Field | Value |
| ----- | ----- |
| **Test order** | 16 of 24 (original index 9) |
| **ID** | `pdh-retest` |
| **Family** | level-retest |
| **Variant** | Prior-day high retest long |
| **Evidence tier** | 3 |
| **Priority** | 10 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **GRIND**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed GRIND

**WEAKNESS claim**

- State: **WHIPSAW**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed WHIPSAW

**Rationale (as written, pre-results)**

> A broken level turning into support is a trend-continuation entry; high-vol chop destroys the level's meaning.

**Source(s)**

- Support/resistance retest literature

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 17. `pdl-retest`

| Field | Value |
| ----- | ----- |
| **Test order** | 17 of 24 (original index 10) |
| **ID** | `pdl-retest` |
| **Family** | level-retest |
| **Variant** | Prior-day low retest short |
| **Evidence tier** | 3 |
| **Priority** | 11 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **GRIND**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed GRIND

**WEAKNESS claim**

- State: **WHIPSAW**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed WHIPSAW

**Rationale (as written, pre-results)**

> Mirror of the high retest; same dependence on persistent direction.

**Source(s)**

- Support/resistance retest literature

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 18. `classic-pivot`

| Field | Value |
| ----- | ----- |
| **Test order** | 18 of 24 (original index 11) |
| **ID** | `classic-pivot` |
| **Family** | level-retest |
| **Variant** | Classic floor-pivot bounce |
| **Evidence tier** | 3 |
| **Priority** | 12 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **GRIND**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed GRIND

**WEAKNESS claim**

- State: **WHIPSAW**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed WHIPSAW

**Rationale (as written, pre-results)**

> Pivot levels act as intraday support/resistance in an ordered market; they are run through in volatile chop.

**Source(s)**

- Floor-trader pivots

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 19. `rsi-14-30-70`

| Field | Value |
| ----- | ----- |
| **Test order** | 19 of 24 (original index 12) |
| **ID** | `rsi-14-30-70` |
| **Family** | osc-fade |
| **Variant** | RSI14 fade at 30/70 |
| **Evidence tier** | 3 |
| **Priority** | 13 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **QUIET**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed QUIET

**WEAKNESS claim**

- State: **EXPANSION**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed EXPANSION

**Rationale (as written, pre-results)**

> In a range, overbought/oversold readings revert; in a strong trend RSI stays extreme and fading catches a knife.

**Source(s)**

- Wilder, RSI

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 20. `williams-r-fade`

| Field | Value |
| ----- | ----- |
| **Test order** | 20 of 24 (original index 13) |
| **ID** | `williams-r-fade` |
| **Family** | osc-fade |
| **Variant** | Williams %R extreme fade |
| **Evidence tier** | 3 |
| **Priority** | 14 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **QUIET**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed QUIET

**WEAKNESS claim**

- State: **EXPANSION**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed EXPANSION

**Rationale (as written, pre-results)**

> Williams %R assumes mean reversion from extremes, which holds only in a non-trending market.

**Source(s)**

- Williams, %R

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 21. `stochastic-14-fade`

| Field | Value |
| ----- | ----- |
| **Test order** | 21 of 24 (original index 14) |
| **ID** | `stochastic-14-fade` |
| **Family** | osc-fade |
| **Variant** | Stochastic 14 extreme fade |
| **Evidence tier** | 3 |
| **Priority** | 15 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **QUIET**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed QUIET

**WEAKNESS claim**

- State: **EXPANSION**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed EXPANSION

**Rationale (as written, pre-results)**

> Stochastic extremes signal exhaustion in a range but persist during a directional expansion.

**Source(s)**

- Lane, Stochastic

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 22. `engulfing`

| Field | Value |
| ----- | ----- |
| **Test order** | 22 of 24 (original index 18) |
| **ID** | `engulfing` |
| **Family** | candlestick-reversal |
| **Variant** | Bull/bear engulfing reversal |
| **Evidence tier** | 4 |
| **Priority** | 19 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **QUIET**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed QUIET

**WEAKNESS claim**

- State: **EXPANSION**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed EXPANSION

**Rationale (as written, pre-results)**

> Reversal candles need a low-noise backdrop to be readable; in an expansion they are continuation noise.

**Source(s)**

- Nison, Japanese Candlestick Charting

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 23. `morning-evening-star`

| Field | Value |
| ----- | ----- |
| **Test order** | 23 of 24 (original index 19) |
| **ID** | `morning-evening-star` |
| **Family** | candlestick-reversal |
| **Variant** | Morning/evening star |
| **Evidence tier** | 4 |
| **Priority** | 20 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **QUIET**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed QUIET

**WEAKNESS claim**

- State: **EXPANSION**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed EXPANSION

**Rationale (as written, pre-results)**

> Three-candle reversal patterns assume exhaustion; a strong trend absorbs them.

**Source(s)**

- Nison, Japanese Candlestick Charting

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## 24. `three-soldiers-crows`

| Field | Value |
| ----- | ----- |
| **Test order** | 24 of 24 (original index 20) |
| **ID** | `three-soldiers-crows` |
| **Family** | candlestick-reversal |
| **Variant** | Three white soldiers / black crows fade |
| **Evidence tier** | 4 |
| **Priority** | 21 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |

**STRENGTH claim**

- State: **QUIET**
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in confirmed QUIET

**WEAKNESS claim**

- State: **WHIPSAW**
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in confirmed WHIPSAW

**Rationale (as written, pre-results)**

> A three-bar directional run in a quiet market is claimed to be exhausted; in high-vol chop it is meaningless.

**Source(s)**

- Nison, Japanese Candlestick Charting

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness state + rationale (pre-results only): _`______`_

---

## Freeze gate (decision #13)

Real verification stays BLOCKED until a reviewer sets `FREEZE.status = "FROZEN"`
with `approvedBy` and `approvedAt` in `claim-cards.draft.mjs`. **Amendment 2 does
not freeze anything.** See `docs/CLAIM-CARDS-REVIEW.md` for the review checklist.

