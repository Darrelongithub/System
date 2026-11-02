# Claim cards — FULL TEXT (all 24, in TEST_ORDER)

**Generated:** 2026-10-27T14:04:37.624Z
**Card status:** `DRAFT` — NOT FROZEN. NOT TESTED.
**Cards:** 24 | **Families:** 8 | **Prior false fraction:** 0.8
**Order:** EXPLICIT FROZEN SEQUENCE (v1.3, byte-identical to v1.2). evidenceTier is a diagnostic rank, NOT an ordering key and NOT an evidence claim.
**Verdict states:** EFFICIENT / CHOPPY — EFFICIENT = EXPANSION+GRIND (ER >= 0.35), CHOPPY = WHIPSAW+QUIET.

> Generated mechanically from `scripts/map-compass/claim-cards.draft.mjs`
> by `print-claim-cards.mjs`. **No card is frozen here.** Verdicts are decided on the
> TWO verdict states; the four Map states are DIAGNOSTICS only. Editing a card after
> results would be the laundering this project forbids — change it NOW, during review.

## Empirical-study registry (tiers REPLACED at G0 Amendment 3)

The old 1-4 subjective tiers are gone. Each family has ONE empirical study that
was located and **opened on 2026-10-27**, with its full URL, or is marked
**PRACTITIONER ONLY**. No outcome from our own data was used.

| Family | Grade | Study (opened) | Full URL | Finding |
| ------ | ----- | -------------- | -------- | ------- |
| channel-breakout | PEER_REVIEWED_TEST | Brock, W., Lakonishok, J. & LeBaron, B. (1992). Simple Technical Trading Rules and the Stochastic Properties of Stock Returns. Journal of Finance 47(5), 1731-1764. | http://technicalanalysis.org.uk/support-and-resistance/BrockLakonishokLeBaron1992.pdf | in-sample support; later work (Sullivan, Timmermann & White 1999) warns of data-snooping |
| ma-cross | PEER_REVIEWED_TEST | Chong, T.T.-L. & Ng, W.-K. (2008). Technical analysis and the London stock exchange: testing the MACD and RSI rules using the FT30. Applied Economics Letters 15(14), 1111-1114. DOI 10.1080/13504850600993598. | https://ideas.repec.org/a/taf/apeclt/v15y2008i14p1111-1114.html | MACD/RSI beat buy-and-hold in most cases (positive, single-market study) |
| opening-range | PEER_REVIEWED_TEST | Holmberg, U., Lönnbark, C. & Lundström, C. (2013). Assessing the profitability of intraday opening range breakout strategies. Finance Research Letters 10(1), 47-53. DOI 10.1016/j.frl.2012.09.001. | http://www.econ.umu.se/ueslpnr/ues845.pdf | full-sample success is NOT robust across three sub-periods (mixed/negative) |
| level-retest | PEER_REVIEWED_TEST | Osler, C. L. (2000). Support for Resistance: Technical Analysis and Intraday Exchange Rates. FRBNY Economic Policy Review 6(2), 53-68. | https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf | levels predict intraday trend interruptions, but firms mis-rank level strength |
| osc-fade | PEER_REVIEWED_TEST | Chong, T.T.-L., Ng, W.-K. & Liew, V.K.-S. (2014). Revisiting the Performance of MACD and RSI Oscillators. Journal of Risk and Financial Management 7(1), 1-12 / MPRA Paper 54149. | https://mpra.ub.uni-muenchen.de/54149/1/MPRA_paper_54149.pdf | RSI(14,30/70) profitable on DJIA but not consistently across markets |
| band-reversion | PEER_REVIEWED_TEST | Lento, C., Gradojevic, N. & Wright, C. S. (2007). Investment information content in Bollinger Bands? Applied Financial Economics Letters 3(4), 263-267. DOI 10.1080/17446540701206576. | https://www.researchgate.net/publication/46527151_Investment_information_content_in_Bollinger_Bands | BB underperform buy-and-hold; contrarian inversion does better (negative for the textbook fade) |
| candlestick-reversal | PEER_REVIEWED_TEST | Marshall, B. R., Young, M. R. & Rose, L. C. (2006). Candlestick technical trading strategies: Can they create value for investors? Journal of Banking & Finance 30(8), 2303-2323. DOI 10.1016/j.jbankfin.2005.08.001. | https://scispace.com/pdf/candlestick-technical-trading-strategies-can-they-create-2whgphf6vm.pdf | no value; neither bullish nor bearish signals beat buy-and-hold (negative) |
| vol-compression | PRACTITIONER_ONLY | Crabel, T. (1990). Day Trading with Short Term Price Patterns & Opening Range Breakout (Traders Press) — practitioner book, not a peer-reviewed test. | https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7 | practitioner only. Holmberg et al. (2013) discusses Crabel's contraction-expansion principle but tests ORB, not NR7/inside-bar. This is the PLAINLY WRONG item: v1.2 ranked this family tier 1 with no empirical study. |

**Grades:** `PEER_REVIEWED_TEST` = at least one empirical study tests this family; URL opened 2026-10-27; `PRACTITIONER_ONLY` = no empirical study found; claim rests on practitioner literature only

**PLAINLY WRONG item:** `vol-compression` is PRACTITIONER ONLY but was ranked tier 1 in v1.2. Its evidence grade is corrected; its position in TEST_ORDER is deliberately KEPT STABLE per the Amendment-3 instruction (see BLUEPRINT-AMENDMENTS.md A4.5).

## Verdict-state mapping (Amendment 3)

| Family | Strength verdict state | Weakness verdict state |
| ------ | ---------------------- | ---------------------- |
| channel-breakout | EFFICIENT | CHOPPY |
| ma-cross | EFFICIENT | CHOPPY |
| opening-range | EFFICIENT | CHOPPY |
| level-retest | EFFICIENT | CHOPPY |
| osc-fade | CHOPPY | EFFICIENT |
| band-reversion | CHOPPY | EFFICIENT |
| candlestick-reversal | CHOPPY | EFFICIENT |
| vol-compression | CHOPPY | EFFICIENT |

Four Map states: EXPANSION, GRIND, WHIPSAW, QUIET. Mapping: EXPANSION->EFFICIENT, GRIND->EFFICIENT, WHIPSAW->CHOPPY, QUIET->CHOPPY.

**Standard-exit caveat (task 4):** every verdict for band-reversion, osc-fade, candlestick-reversal is labelled _"under the standard exit (1.5 ATR stop, 2R target) only"_. No new exit is added in this cycle.

## Strongest published criticism / failed replication (all VERIFIED)

Every URL below was opened and read on **2026-10-27**. Nothing is cited from memory and no URL,
author or year is invented. A family with no openable criticism is marked as such rather than left blank.

| Family | Status | Criticism / failed replication | Full URL | Impact |
| ------ | ------ | ---------------------------- | -------- | ------ |
| channel-breakout | VERIFIED | Sullivan, R., Timmermann, A. & White, H. (1999). Data-Snooping, Technical Trading Rule Performance, and the Bootstrap. Journal of Finance 54(5), 1647-1691. | https://www.kevinsheppard.com/files/teaching/mfe/advanced-econometrics/Sullivan_Timmermann_White.pdf | NEGATIVE |
| ma-cross | VERIFIED | Allen, F. & Karjalainen, R. (1999). Using genetic algorithms to find technical trading rules. Journal of Financial Economics 51(2), 245-271. | https://www.cs.montana.edu/courses/spring2007/536/materials/Lopez/genetic.pdf | NEGATIVE |
| opening-range | VERIFIED | Fetna, M. (2026). Opening-Range Breakout Does Not Survive Trading Costs: A Pre-Registered 225-Cell Study on Sixteen Years of Futures Data. SSRN 7428398. | https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7428398 | NEGATIVE |
| level-retest | VERIFIED | Curcio, R., Goodhart, C., Guillaume, D. & Payne, R. (1997). Do technical trading rules generate profits? Conclusions from the intra-day foreign exchange market. International Journal of Finance and Economics 2(4), 267-280. | http://support-and-resistance.technicalanalysis.org.uk/Curcio-etal1997.pdf | NEGATIVE |
| osc-fade | VERIFIED | Muruganandan, S. (2020). Testing the profitability of technical trading rules across market cycles: Evidence from India. Colombo Business Journal 11(1), 24-46. | https://mgmt.cmb.ac.lk/cbj/wp-content/uploads/2020/06/2.-Technical-trading-rules.pdf | NEGATIVE |
| band-reversion | VERIFIED | Fang, J., Jacobsen, B. & Qin, Y. (2017). Popularity versus Profitability: Evidence from Bollinger Bands. Journal of Portfolio Management 43(4), 152-159. | https://acfr.aut.ac.nz/__data/assets/pdf_file/0007/29896/100009-Popularity-vs-Profitability-BB-August-Final.pdf | NEGATIVE |
| candlestick-reversal | VERIFIED | Marshall, B. R., Young, M. R. & Cahan, R. (2008). Are candlestick technical trading strategies profitable in the Japanese equity market? Review of Quantitative Finance and Accounting 31, 191-207. | https://link.springer.com/article/10.1007/s11156-007-0068-1 | NEGATIVE |
| vol-compression | VERIFIED | Casey, A. (2024, updated 2026). Toby Crabel Patterns Tested: 17,424 Backtests on 8 Markets. StatOasis. | https://statoasis.com/overfit/research/unveiling-toby-crabel-s-up-down-thrust-trading-patterns | NEGATIVE |

---

## Card relations (near-duplicates and mirror images)

Within-family pairs: 24 (11 near-duplicate, 1 mirror-image, 12 related).

| Type | Pair | Family | Why |
| ---- | ---- | ------ | --- |
| NEAR_DUPLICATE | `donchian-20` / `donchian-55` | channel-breakout | same Donchian rule, 20 vs 55-bar lookback |
| RELATED | `donchian-20` / `dual-thrust` | channel-breakout | both range breakouts, different range definition |
| RELATED | `donchian-55` / `dual-thrust` | channel-breakout | both range breakouts, different range definition |
| NEAR_DUPLICATE | `sma-20-50` / `macd-cross` | ma-cross | MACD is an EMA crossover of the same family |
| NEAR_DUPLICATE | `sma-20-50` / `ichimoku-tk` | ma-cross | both two-moving-average crosses |
| NEAR_DUPLICATE | `macd-cross` / `ichimoku-tk` | ma-cross | both EMA-based crosses |
| NEAR_DUPLICATE | `asian-range-break` / `london-orb-30` | opening-range | both session-range breakouts |
| RELATED | `asian-range-break` / `pdh-pdl-break` | opening-range | prior-day range vs session range |
| RELATED | `london-orb-30` / `pdh-pdl-break` | opening-range | prior-day range vs session range |
| MIRROR_IMAGE | `pdh-retest` / `pdl-retest` | level-retest | prior-day HIGH retest long vs prior-day LOW retest short |
| RELATED | `pdh-retest` / `classic-pivot` | level-retest | both retest a reference level |
| RELATED | `pdl-retest` / `classic-pivot` | level-retest | both retest a reference level |
| NEAR_DUPLICATE | `rsi-14-30-70` / `williams-r-fade` | osc-fade | Williams %R is a normalised stochastic/RSI-family oscillator |
| NEAR_DUPLICATE | `rsi-14-30-70` / `stochastic-14-fade` | osc-fade | both 14-period bounded oscillators with 30/70-style extremes |
| NEAR_DUPLICATE | `williams-r-fade` / `stochastic-14-fade` | osc-fade | Williams %R is a linear transform of the raw stochastic |
| NEAR_DUPLICATE | `bollinger-20-2` / `keltner-20-atr` | band-reversion | both 20-bar envelope fades, sigma vs ATR width |
| RELATED | `bollinger-20-2` / `bb-squeeze-fade` | band-reversion | both Bollinger-based, different trigger (band vs squeeze) |
| RELATED | `keltner-20-atr` / `bb-squeeze-fade` | band-reversion | envelope fade vs volatility-squeeze fade |
| NEAR_DUPLICATE | `engulfing` / `morning-evening-star` | candlestick-reversal | both multi-bar reversal candle patterns |
| RELATED | `engulfing` / `three-soldiers-crows` | candlestick-reversal | both candle-body reversal/exhaustion |
| RELATED | `morning-evening-star` / `three-soldiers-crows` | candlestick-reversal | both multi-candle exhaustion patterns |
| NEAR_DUPLICATE | `atr-squeeze-break` / `nr7-break` | vol-compression | both narrow-range compression breakouts |
| RELATED | `atr-squeeze-break` / `inside-bar-break` | vol-compression | both compression, different bar definition |
| RELATED | `nr7-break` / `inside-bar-break` | vol-compression | multi-bar vs single-bar compression |

Cross-family mirror images (diagnostic only; pooling is per family):
- `pdh-pdl-break` / `pdh-retest` — break vs retest of the same prior-day high
- `pdh-pdl-break` / `pdl-retest` — break vs retest of the same prior-day low
- `rsi-14-30-70` / `bollinger-20-2` — oscillator extreme vs band extreme fade
- `engulfing` / `three-soldiers-crows` — reversal candle vs continuation-candle fade

## Index (TEST_ORDER)

| # | ID | Family | Rank | Priority | Strength state | Weakness state | Four-state textbook |
| -: | -- | ------ | ---: | -------: | -------------- | -------------- | ------------------- |
| 1 | `donchian-20` | channel-breakout | 1 | 1 | EFFICIENT | CHOPPY | EXPANSION / QUIET |
| 2 | `donchian-55` | channel-breakout | 1 | 2 | EFFICIENT | CHOPPY | EXPANSION / QUIET |
| 3 | `dual-thrust` | channel-breakout | 1 | 3 | EFFICIENT | CHOPPY | EXPANSION / QUIET |
| 4 | `sma-20-50` | ma-cross | 1 | 4 | EFFICIENT | CHOPPY | GRIND / WHIPSAW |
| 5 | `macd-cross` | ma-cross | 1 | 5 | EFFICIENT | CHOPPY | GRIND / WHIPSAW |
| 6 | `ichimoku-tk` | ma-cross | 1 | 6 | EFFICIENT | CHOPPY | GRIND / WHIPSAW |
| 7 | `atr-squeeze-break` | vol-compression | 1 | 22 | CHOPPY | EFFICIENT | EXPANSION / WHIPSAW |
| 8 | `nr7-break` | vol-compression | 1 | 23 | CHOPPY | EFFICIENT | EXPANSION / WHIPSAW |
| 9 | `inside-bar-break` | vol-compression | 1 | 24 | CHOPPY | EFFICIENT | EXPANSION / QUIET |
| 10 | `asian-range-break` | opening-range | 2 | 7 | EFFICIENT | CHOPPY | EXPANSION / QUIET |
| 11 | `london-orb-30` | opening-range | 2 | 8 | EFFICIENT | CHOPPY | EXPANSION / QUIET |
| 12 | `pdh-pdl-break` | opening-range | 2 | 9 | EFFICIENT | CHOPPY | EXPANSION / QUIET |
| 13 | `bollinger-20-2` | band-reversion | 2 | 16 | CHOPPY | EFFICIENT | QUIET / EXPANSION |
| 14 | `keltner-20-atr` | band-reversion | 2 | 17 | CHOPPY | EFFICIENT | QUIET / EXPANSION |
| 15 | `bb-squeeze-fade` | band-reversion | 2 | 18 | CHOPPY | EFFICIENT | QUIET / EXPANSION |
| 16 | `pdh-retest` | level-retest | 3 | 10 | EFFICIENT | CHOPPY | GRIND / WHIPSAW |
| 17 | `pdl-retest` | level-retest | 3 | 11 | EFFICIENT | CHOPPY | GRIND / WHIPSAW |
| 18 | `classic-pivot` | level-retest | 3 | 12 | EFFICIENT | CHOPPY | GRIND / WHIPSAW |
| 19 | `rsi-14-30-70` | osc-fade | 3 | 13 | CHOPPY | EFFICIENT | QUIET / EXPANSION |
| 20 | `williams-r-fade` | osc-fade | 3 | 14 | CHOPPY | EFFICIENT | QUIET / EXPANSION |
| 21 | `stochastic-14-fade` | osc-fade | 3 | 15 | CHOPPY | EFFICIENT | QUIET / EXPANSION |
| 22 | `engulfing` | candlestick-reversal | 4 | 19 | CHOPPY | EFFICIENT | QUIET / EXPANSION |
| 23 | `morning-evening-star` | candlestick-reversal | 4 | 20 | CHOPPY | EFFICIENT | QUIET / EXPANSION |
| 24 | `three-soldiers-crows` | candlestick-reversal | 4 | 21 | CHOPPY | EFFICIENT | QUIET / EXPANSION |

---

## 1. `donchian-20`

| Field | Value |
| ----- | ----- |
| **Test order** | 1 of 24 (original index 0) |
| **ID** | `donchian-20` |
| **Family** | channel-breakout |
| **Variant** | Donchian 20-bar high/low break |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Brock, W., Lakonishok, J. & LeBaron, B. (1992). Simple Technical Trading Rules and the Stochastic Properties of Stock Returns. Journal of Finance 47(5), 1731-1764. |
| **Study full URL** | http://technicalanalysis.org.uk/support-and-resistance/BrockLakonishokLeBaron1992.pdf |
| **What the study tests** | trading range break (channel/resistance-support breakout) rules on DJIA 1897-1986 |
| **Study finding** | in-sample support; later work (Sullivan, Timmermann & White 1999) warns of data-snooping |
| **Strongest criticism** | Sullivan, R., Timmermann, A. & White, H. (1999). Data-Snooping, Technical Trading Rule Performance, and the Bootstrap. Journal of Finance 54(5), 1647-1691. |
| **Criticism URL** | https://www.kevinsheppard.com/files/teaching/mfe/advanced-econometrics/Sullivan_Timmermann_White.pdf |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 1 (diagnostic only; NOT an evidence claim) |
| **Priority** | 1 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | none |

**STRENGTH claim**

- Verdict state: **EFFICIENT** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): EXPANSION
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in EFFICIENT

**WEAKNESS claim**

- Verdict state: **CHOPPY** (the other one)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): QUIET
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in CHOPPY

**Rationale (as written, pre-results)**

> Breakouts capture the start of a sustained move; in a quiet range there is no follow-through, so entries reverse into whipsaw.

**Source(s)**

- Donchian / Turtle rules
- Brock, W., Lakonishok, J. & LeBaron, B. (1992). Simple Technical Trading Rules and the Stochastic Properties of Stock Returns. Journal of Finance 47(5), 1731-1764.
- http://technicalanalysis.org.uk/support-and-resistance/BrockLakonishokLeBaron1992.pdf

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 2. `donchian-55`

| Field | Value |
| ----- | ----- |
| **Test order** | 2 of 24 (original index 1) |
| **ID** | `donchian-55` |
| **Family** | channel-breakout |
| **Variant** | Donchian 55-bar high/low break |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Brock, W., Lakonishok, J. & LeBaron, B. (1992). Simple Technical Trading Rules and the Stochastic Properties of Stock Returns. Journal of Finance 47(5), 1731-1764. |
| **Study full URL** | http://technicalanalysis.org.uk/support-and-resistance/BrockLakonishokLeBaron1992.pdf |
| **What the study tests** | trading range break (channel/resistance-support breakout) rules on DJIA 1897-1986 |
| **Study finding** | in-sample support; later work (Sullivan, Timmermann & White 1999) warns of data-snooping |
| **Strongest criticism** | Sullivan, R., Timmermann, A. & White, H. (1999). Data-Snooping, Technical Trading Rule Performance, and the Bootstrap. Journal of Finance 54(5), 1647-1691. |
| **Criticism URL** | https://www.kevinsheppard.com/files/teaching/mfe/advanced-econometrics/Sullivan_Timmermann_White.pdf |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 1 (diagnostic only; NOT an evidence claim) |
| **Priority** | 2 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | none |

**STRENGTH claim**

- Verdict state: **EFFICIENT** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): EXPANSION
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in EFFICIENT

**WEAKNESS claim**

- Verdict state: **CHOPPY** (the other one)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): QUIET
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in CHOPPY

**Rationale (as written, pre-results)**

> The classic Turtle long-term channel needs a genuine expansion; a slow channel in a range produces late, mean-reverting fills.

**Source(s)**

- Turtle Trading (Dennis/Eckhardt)
- Brock, W., Lakonishok, J. & LeBaron, B. (1992). Simple Technical Trading Rules and the Stochastic Properties of Stock Returns. Journal of Finance 47(5), 1731-1764.
- http://technicalanalysis.org.uk/support-and-resistance/BrockLakonishokLeBaron1992.pdf

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 3. `dual-thrust`

| Field | Value |
| ----- | ----- |
| **Test order** | 3 of 24 (original index 2) |
| **ID** | `dual-thrust` |
| **Family** | channel-breakout |
| **Variant** | Dual Thrust opening range break |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Brock, W., Lakonishok, J. & LeBaron, B. (1992). Simple Technical Trading Rules and the Stochastic Properties of Stock Returns. Journal of Finance 47(5), 1731-1764. |
| **Study full URL** | http://technicalanalysis.org.uk/support-and-resistance/BrockLakonishokLeBaron1992.pdf |
| **What the study tests** | trading range break (channel/resistance-support breakout) rules on DJIA 1897-1986 |
| **Study finding** | in-sample support; later work (Sullivan, Timmermann & White 1999) warns of data-snooping |
| **Strongest criticism** | Sullivan, R., Timmermann, A. & White, H. (1999). Data-Snooping, Technical Trading Rule Performance, and the Bootstrap. Journal of Finance 54(5), 1647-1691. |
| **Criticism URL** | https://www.kevinsheppard.com/files/teaching/mfe/advanced-econometrics/Sullivan_Timmermann_White.pdf |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 1 (diagnostic only; NOT an evidence claim) |
| **Priority** | 3 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | none |

**STRENGTH claim**

- Verdict state: **EFFICIENT** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): EXPANSION
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in EFFICIENT

**WEAKNESS claim**

- Verdict state: **CHOPPY** (the other one)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): QUIET
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in CHOPPY

**Rationale (as written, pre-results)**

> Uses the prior day's range to set a breakout band; needs volatility expansion to travel beyond the band.

**Source(s)**

- Dual Thrust (Chalek)
- Brock, W., Lakonishok, J. & LeBaron, B. (1992). Simple Technical Trading Rules and the Stochastic Properties of Stock Returns. Journal of Finance 47(5), 1731-1764.
- http://technicalanalysis.org.uk/support-and-resistance/BrockLakonishokLeBaron1992.pdf

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 4. `sma-20-50`

| Field | Value |
| ----- | ----- |
| **Test order** | 4 of 24 (original index 3) |
| **ID** | `sma-20-50` |
| **Family** | ma-cross |
| **Variant** | SMA20 x SMA50 crossover |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Chong, T.T.-L. & Ng, W.-K. (2008). Technical analysis and the London stock exchange: testing the MACD and RSI rules using the FT30. Applied Economics Letters 15(14), 1111-1114. DOI 10.1080/13504850600993598. |
| **Study full URL** | https://ideas.repec.org/a/taf/apeclt/v15y2008i14p1111-1114.html |
| **What the study tests** | MACD (exponential moving-average crossover) rule on 60 years of FT30 |
| **Study finding** | MACD/RSI beat buy-and-hold in most cases (positive, single-market study) |
| **Strongest criticism** | Allen, F. & Karjalainen, R. (1999). Using genetic algorithms to find technical trading rules. Journal of Financial Economics 51(2), 245-271. |
| **Criticism URL** | https://www.cs.montana.edu/courses/spring2007/536/materials/Lopez/genetic.pdf |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 1 (diagnostic only; NOT an evidence claim) |
| **Priority** | 4 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | none |

**STRENGTH claim**

- Verdict state: **EFFICIENT** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): GRIND
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in EFFICIENT

**WEAKNESS claim**

- Verdict state: **CHOPPY** (the other one)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): WHIPSAW
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in CHOPPY

**Rationale (as written, pre-results)**

> Moving-average crossovers need a persistent, low-noise trend; high-volatility chop generates repeated false crosses.

**Source(s)**

- Standard trend-following literature
- Chong, T.T.-L. & Ng, W.-K. (2008). Technical analysis and the London stock exchange: testing the MACD and RSI rules using the FT30. Applied Economics Letters 15(14), 1111-1114. DOI 10.1080/13504850600993598.
- https://ideas.repec.org/a/taf/apeclt/v15y2008i14p1111-1114.html

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 5. `macd-cross`

| Field | Value |
| ----- | ----- |
| **Test order** | 5 of 24 (original index 4) |
| **ID** | `macd-cross` |
| **Family** | ma-cross |
| **Variant** | MACD signal-line cross |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Chong, T.T.-L. & Ng, W.-K. (2008). Technical analysis and the London stock exchange: testing the MACD and RSI rules using the FT30. Applied Economics Letters 15(14), 1111-1114. DOI 10.1080/13504850600993598. |
| **Study full URL** | https://ideas.repec.org/a/taf/apeclt/v15y2008i14p1111-1114.html |
| **What the study tests** | MACD (exponential moving-average crossover) rule on 60 years of FT30 |
| **Study finding** | MACD/RSI beat buy-and-hold in most cases (positive, single-market study) |
| **Strongest criticism** | Allen, F. & Karjalainen, R. (1999). Using genetic algorithms to find technical trading rules. Journal of Financial Economics 51(2), 245-271. |
| **Criticism URL** | https://www.cs.montana.edu/courses/spring2007/536/materials/Lopez/genetic.pdf |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 1 (diagnostic only; NOT an evidence claim) |
| **Priority** | 5 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | none |

**STRENGTH claim**

- Verdict state: **EFFICIENT** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): GRIND
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in EFFICIENT

**WEAKNESS claim**

- Verdict state: **CHOPPY** (the other one)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): WHIPSAW
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in CHOPPY

**Rationale (as written, pre-results)**

> MACD is a smoothed trend filter; it lags and whipsaws when volatility is high but direction is absent.

**Source(s)**

- Appel, MACD
- Chong, T.T.-L. & Ng, W.-K. (2008). Technical analysis and the London stock exchange: testing the MACD and RSI rules using the FT30. Applied Economics Letters 15(14), 1111-1114. DOI 10.1080/13504850600993598.
- https://ideas.repec.org/a/taf/apeclt/v15y2008i14p1111-1114.html

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 6. `ichimoku-tk`

| Field | Value |
| ----- | ----- |
| **Test order** | 6 of 24 (original index 5) |
| **ID** | `ichimoku-tk` |
| **Family** | ma-cross |
| **Variant** | Ichimoku Tenkan/Kijun cross |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Chong, T.T.-L. & Ng, W.-K. (2008). Technical analysis and the London stock exchange: testing the MACD and RSI rules using the FT30. Applied Economics Letters 15(14), 1111-1114. DOI 10.1080/13504850600993598. |
| **Study full URL** | https://ideas.repec.org/a/taf/apeclt/v15y2008i14p1111-1114.html |
| **What the study tests** | MACD (exponential moving-average crossover) rule on 60 years of FT30 |
| **Study finding** | MACD/RSI beat buy-and-hold in most cases (positive, single-market study) |
| **Strongest criticism** | Allen, F. & Karjalainen, R. (1999). Using genetic algorithms to find technical trading rules. Journal of Financial Economics 51(2), 245-271. |
| **Criticism URL** | https://www.cs.montana.edu/courses/spring2007/536/materials/Lopez/genetic.pdf |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 1 (diagnostic only; NOT an evidence claim) |
| **Priority** | 6 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | none |

**STRENGTH claim**

- Verdict state: **EFFICIENT** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): GRIND
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in EFFICIENT

**WEAKNESS claim**

- Verdict state: **CHOPPY** (the other one)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): WHIPSAW
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in CHOPPY

**Rationale (as written, pre-results)**

> Ichimoku is designed for persistent trends; its equilibrium lines produce noise signals in choppy high-volatility conditions.

**Source(s)**

- Hosoda, Ichimoku Kinko Hyo
- Chong, T.T.-L. & Ng, W.-K. (2008). Technical analysis and the London stock exchange: testing the MACD and RSI rules using the FT30. Applied Economics Letters 15(14), 1111-1114. DOI 10.1080/13504850600993598.
- https://ideas.repec.org/a/taf/apeclt/v15y2008i14p1111-1114.html

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 7. `atr-squeeze-break`

| Field | Value |
| ----- | ----- |
| **Test order** | 7 of 24 (original index 21) |
| **ID** | `atr-squeeze-break` |
| **Family** | vol-compression |
| **Variant** | ATR-squeeze breakout |
| **Evidence grade** | PRACTITIONER_ONLY |
| **Empirical study** | Crabel, T. (1990). Day Trading with Short Term Price Patterns & Opening Range Breakout (Traders Press) — practitioner book, not a peer-reviewed test. |
| **Study full URL** | https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7 |
| **What the study tests** | NR7 / inside-bar / volatility-contraction patterns — NO academic test found |
| **Study finding** | practitioner only. Holmberg et al. (2013) discusses Crabel's contraction-expansion principle but tests ORB, not NR7/inside-bar. This is the PLAINLY WRONG item: v1.2 ranked this family tier 1 with no empirical study. |
| **Strongest criticism** | Casey, A. (2024, updated 2026). Toby Crabel Patterns Tested: 17,424 Backtests on 8 Markets. StatOasis. |
| **Criticism URL** | https://statoasis.com/overfit/research/unveiling-toby-crabel-s-up-down-thrust-trading-patterns |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 1 (diagnostic only; NOT an evidence claim) |
| **Priority** | 22 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | none |

**STRENGTH claim**

- Verdict state: **CHOPPY** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): EXPANSION
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in CHOPPY

**WEAKNESS claim**

- Verdict state: **EFFICIENT** (the other one)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): WHIPSAW
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in EFFICIENT

**Rationale (as written, pre-results)**

> Compression stores energy; the resolution is a directional expansion. High-vol chop produces false resolutions.

**Source(s)**

- Volatility-contraction pattern literature
- Crabel, T. (1990). Day Trading with Short Term Price Patterns & Opening Range Breakout (Traders Press) — practitioner book, not a peer-reviewed test.
- https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 8. `nr7-break`

| Field | Value |
| ----- | ----- |
| **Test order** | 8 of 24 (original index 22) |
| **ID** | `nr7-break` |
| **Family** | vol-compression |
| **Variant** | NR7 narrowest-range breakout |
| **Evidence grade** | PRACTITIONER_ONLY |
| **Empirical study** | Crabel, T. (1990). Day Trading with Short Term Price Patterns & Opening Range Breakout (Traders Press) — practitioner book, not a peer-reviewed test. |
| **Study full URL** | https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7 |
| **What the study tests** | NR7 / inside-bar / volatility-contraction patterns — NO academic test found |
| **Study finding** | practitioner only. Holmberg et al. (2013) discusses Crabel's contraction-expansion principle but tests ORB, not NR7/inside-bar. This is the PLAINLY WRONG item: v1.2 ranked this family tier 1 with no empirical study. |
| **Strongest criticism** | Casey, A. (2024, updated 2026). Toby Crabel Patterns Tested: 17,424 Backtests on 8 Markets. StatOasis. |
| **Criticism URL** | https://statoasis.com/overfit/research/unveiling-toby-crabel-s-up-down-thrust-trading-patterns |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 1 (diagnostic only; NOT an evidence claim) |
| **Priority** | 23 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | none |

**STRENGTH claim**

- Verdict state: **CHOPPY** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): EXPANSION
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in CHOPPY

**WEAKNESS claim**

- Verdict state: **EFFICIENT** (the other one)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): WHIPSAW
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in EFFICIENT

**Rationale (as written, pre-results)**

> The narrowest range of 7 bars marks compression; the breakout should travel. In chop it reverses.

**Source(s)**

- Toby Crabel, NR7
- Crabel, T. (1990). Day Trading with Short Term Price Patterns & Opening Range Breakout (Traders Press) — practitioner book, not a peer-reviewed test.
- https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 9. `inside-bar-break`

| Field | Value |
| ----- | ----- |
| **Test order** | 9 of 24 (original index 23) |
| **ID** | `inside-bar-break` |
| **Family** | vol-compression |
| **Variant** | Inside-bar break |
| **Evidence grade** | PRACTITIONER_ONLY |
| **Empirical study** | Crabel, T. (1990). Day Trading with Short Term Price Patterns & Opening Range Breakout (Traders Press) — practitioner book, not a peer-reviewed test. |
| **Study full URL** | https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7 |
| **What the study tests** | NR7 / inside-bar / volatility-contraction patterns — NO academic test found |
| **Study finding** | practitioner only. Holmberg et al. (2013) discusses Crabel's contraction-expansion principle but tests ORB, not NR7/inside-bar. This is the PLAINLY WRONG item: v1.2 ranked this family tier 1 with no empirical study. |
| **Strongest criticism** | Casey, A. (2024, updated 2026). Toby Crabel Patterns Tested: 17,424 Backtests on 8 Markets. StatOasis. |
| **Criticism URL** | https://statoasis.com/overfit/research/unveiling-toby-crabel-s-up-down-thrust-trading-patterns |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 1 (diagnostic only; NOT an evidence claim) |
| **Priority** | 24 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | none |

**STRENGTH claim**

- Verdict state: **CHOPPY** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): EXPANSION
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in CHOPPY

**WEAKNESS claim**

- Verdict state: **EFFICIENT** (the other one)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): QUIET
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in EFFICIENT

**Rationale (as written, pre-results)**

> An inside bar is single-bar compression; its break needs follow-through that a quiet market cannot supply.

**Source(s)**

- Price-action literature
- Crabel, T. (1990). Day Trading with Short Term Price Patterns & Opening Range Breakout (Traders Press) — practitioner book, not a peer-reviewed test.
- https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 10. `asian-range-break`

| Field | Value |
| ----- | ----- |
| **Test order** | 10 of 24 (original index 6) |
| **ID** | `asian-range-break` |
| **Family** | opening-range |
| **Variant** | Asian-session range breakout |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Holmberg, U., Lönnbark, C. & Lundström, C. (2013). Assessing the profitability of intraday opening range breakout strategies. Finance Research Letters 10(1), 47-53. DOI 10.1016/j.frl.2012.09.001. |
| **Study full URL** | http://www.econ.umu.se/ueslpnr/ues845.pdf |
| **What the study tests** | opening-range breakout on US crude-oil futures, bootstrap test |
| **Study finding** | full-sample success is NOT robust across three sub-periods (mixed/negative) |
| **Strongest criticism** | Fetna, M. (2026). Opening-Range Breakout Does Not Survive Trading Costs: A Pre-Registered 225-Cell Study on Sixteen Years of Futures Data. SSRN 7428398. |
| **Criticism URL** | https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7428398 |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 2 (diagnostic only; NOT an evidence claim) |
| **Priority** | 7 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | london |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | none |

**STRENGTH claim**

- Verdict state: **EFFICIENT** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): EXPANSION
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in EFFICIENT

**WEAKNESS claim**

- Verdict state: **CHOPPY** (the other one)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): QUIET
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in CHOPPY

**Rationale (as written, pre-results)**

> The Asian range is a compression box; London/NY expansion is claimed to resolve it directionally.

**Source(s)**

- Opening-range breakout literature
- Holmberg, U., Lönnbark, C. & Lundström, C. (2013). Assessing the profitability of intraday opening range breakout strategies. Finance Research Letters 10(1), 47-53. DOI 10.1016/j.frl.2012.09.001.
- http://www.econ.umu.se/ueslpnr/ues845.pdf

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 11. `london-orb-30`

| Field | Value |
| ----- | ----- |
| **Test order** | 11 of 24 (original index 7) |
| **ID** | `london-orb-30` |
| **Family** | opening-range |
| **Variant** | London first-30m ORB |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Holmberg, U., Lönnbark, C. & Lundström, C. (2013). Assessing the profitability of intraday opening range breakout strategies. Finance Research Letters 10(1), 47-53. DOI 10.1016/j.frl.2012.09.001. |
| **Study full URL** | http://www.econ.umu.se/ueslpnr/ues845.pdf |
| **What the study tests** | opening-range breakout on US crude-oil futures, bootstrap test |
| **Study finding** | full-sample success is NOT robust across three sub-periods (mixed/negative) |
| **Strongest criticism** | Fetna, M. (2026). Opening-Range Breakout Does Not Survive Trading Costs: A Pre-Registered 225-Cell Study on Sixteen Years of Futures Data. SSRN 7428398. |
| **Criticism URL** | https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7428398 |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 2 (diagnostic only; NOT an evidence claim) |
| **Priority** | 8 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | london |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | none |

**STRENGTH claim**

- Verdict state: **EFFICIENT** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): EXPANSION
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in EFFICIENT

**WEAKNESS claim**

- Verdict state: **CHOPPY** (the other one)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): QUIET
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in CHOPPY

**Rationale (as written, pre-results)**

> The first 30 minutes of London set the day's directional tone; quiet days fail to extend.

**Source(s)**

- Crabel, Open Range Breakout
- Holmberg, U., Lönnbark, C. & Lundström, C. (2013). Assessing the profitability of intraday opening range breakout strategies. Finance Research Letters 10(1), 47-53. DOI 10.1016/j.frl.2012.09.001.
- http://www.econ.umu.se/ueslpnr/ues845.pdf

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 12. `pdh-pdl-break`

| Field | Value |
| ----- | ----- |
| **Test order** | 12 of 24 (original index 8) |
| **ID** | `pdh-pdl-break` |
| **Family** | opening-range |
| **Variant** | Prior-day high/low break |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Holmberg, U., Lönnbark, C. & Lundström, C. (2013). Assessing the profitability of intraday opening range breakout strategies. Finance Research Letters 10(1), 47-53. DOI 10.1016/j.frl.2012.09.001. |
| **Study full URL** | http://www.econ.umu.se/ueslpnr/ues845.pdf |
| **What the study tests** | opening-range breakout on US crude-oil futures, bootstrap test |
| **Study finding** | full-sample success is NOT robust across three sub-periods (mixed/negative) |
| **Strongest criticism** | Fetna, M. (2026). Opening-Range Breakout Does Not Survive Trading Costs: A Pre-Registered 225-Cell Study on Sixteen Years of Futures Data. SSRN 7428398. |
| **Criticism URL** | https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7428398 |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 2 (diagnostic only; NOT an evidence claim) |
| **Priority** | 9 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | none |

**STRENGTH claim**

- Verdict state: **EFFICIENT** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): EXPANSION
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in EFFICIENT

**WEAKNESS claim**

- Verdict state: **CHOPPY** (the other one)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): QUIET
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in CHOPPY

**Rationale (as written, pre-results)**

> A break of the prior day's extremes signals new participation; in a range it is a fade trap.

**Source(s)**

- Classic price-action literature
- Holmberg, U., Lönnbark, C. & Lundström, C. (2013). Assessing the profitability of intraday opening range breakout strategies. Finance Research Letters 10(1), 47-53. DOI 10.1016/j.frl.2012.09.001.
- http://www.econ.umu.se/ueslpnr/ues845.pdf

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 13. `bollinger-20-2`

| Field | Value |
| ----- | ----- |
| **Test order** | 13 of 24 (original index 15) |
| **ID** | `bollinger-20-2` |
| **Family** | band-reversion |
| **Variant** | Bollinger 20/2 band fade |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Lento, C., Gradojevic, N. & Wright, C. S. (2007). Investment information content in Bollinger Bands? Applied Financial Economics Letters 3(4), 263-267. DOI 10.1080/17446540701206576. |
| **Study full URL** | https://www.researchgate.net/publication/46527151_Investment_information_content_in_Bollinger_Bands |
| **What the study tests** | Bollinger Band (20,2) and variants, four markets 1995-2004, transaction costs |
| **Study finding** | BB underperform buy-and-hold; contrarian inversion does better (negative for the textbook fade) |
| **Strongest criticism** | Fang, J., Jacobsen, B. & Qin, Y. (2017). Popularity versus Profitability: Evidence from Bollinger Bands. Journal of Portfolio Management 43(4), 152-159. |
| **Criticism URL** | https://acfr.aut.ac.nz/__data/assets/pdf_file/0007/29896/100009-Popularity-vs-Profitability-BB-August-Final.pdf |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 2 (diagnostic only; NOT an evidence claim) |
| **Priority** | 16 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | under the standard exit (1.5 ATR stop, 2R target) only |

**STRENGTH claim**

- Verdict state: **CHOPPY** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): QUIET
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in CHOPPY

**WEAKNESS claim**

- Verdict state: **EFFICIENT** (the other one)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): EXPANSION
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in EFFICIENT

**Rationale (as written, pre-results)**

> Bands contain ~95% of range-bound prices; a strong trend walks the band instead of reverting.

**Source(s)**

- Bollinger, Bollinger Bands
- Lento, C., Gradojevic, N. & Wright, C. S. (2007). Investment information content in Bollinger Bands? Applied Financial Economics Letters 3(4), 263-267. DOI 10.1080/17446540701206576.
- https://www.researchgate.net/publication/46527151_Investment_information_content_in_Bollinger_Bands

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 14. `keltner-20-atr`

| Field | Value |
| ----- | ----- |
| **Test order** | 14 of 24 (original index 16) |
| **ID** | `keltner-20-atr` |
| **Family** | band-reversion |
| **Variant** | Keltner 20/ATR band fade |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Lento, C., Gradojevic, N. & Wright, C. S. (2007). Investment information content in Bollinger Bands? Applied Financial Economics Letters 3(4), 263-267. DOI 10.1080/17446540701206576. |
| **Study full URL** | https://www.researchgate.net/publication/46527151_Investment_information_content_in_Bollinger_Bands |
| **What the study tests** | Bollinger Band (20,2) and variants, four markets 1995-2004, transaction costs |
| **Study finding** | BB underperform buy-and-hold; contrarian inversion does better (negative for the textbook fade) |
| **Strongest criticism** | Fang, J., Jacobsen, B. & Qin, Y. (2017). Popularity versus Profitability: Evidence from Bollinger Bands. Journal of Portfolio Management 43(4), 152-159. |
| **Criticism URL** | https://acfr.aut.ac.nz/__data/assets/pdf_file/0007/29896/100009-Popularity-vs-Profitability-BB-August-Final.pdf |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 2 (diagnostic only; NOT an evidence claim) |
| **Priority** | 17 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | under the standard exit (1.5 ATR stop, 2R target) only |

**STRENGTH claim**

- Verdict state: **CHOPPY** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): QUIET
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in CHOPPY

**WEAKNESS claim**

- Verdict state: **EFFICIENT** (the other one)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): EXPANSION
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in EFFICIENT

**Rationale (as written, pre-results)**

> ATR-based envelope fade assumes stable volatility; expansion breaks the envelope legitimately.

**Source(s)**

- Keltner channel literature
- Lento, C., Gradojevic, N. & Wright, C. S. (2007). Investment information content in Bollinger Bands? Applied Financial Economics Letters 3(4), 263-267. DOI 10.1080/17446540701206576.
- https://www.researchgate.net/publication/46527151_Investment_information_content_in_Bollinger_Bands

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 15. `bb-squeeze-fade`

| Field | Value |
| ----- | ----- |
| **Test order** | 15 of 24 (original index 17) |
| **ID** | `bb-squeeze-fade` |
| **Family** | band-reversion |
| **Variant** | Bollinger squeeze fade |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Lento, C., Gradojevic, N. & Wright, C. S. (2007). Investment information content in Bollinger Bands? Applied Financial Economics Letters 3(4), 263-267. DOI 10.1080/17446540701206576. |
| **Study full URL** | https://www.researchgate.net/publication/46527151_Investment_information_content_in_Bollinger_Bands |
| **What the study tests** | Bollinger Band (20,2) and variants, four markets 1995-2004, transaction costs |
| **Study finding** | BB underperform buy-and-hold; contrarian inversion does better (negative for the textbook fade) |
| **Strongest criticism** | Fang, J., Jacobsen, B. & Qin, Y. (2017). Popularity versus Profitability: Evidence from Bollinger Bands. Journal of Portfolio Management 43(4), 152-159. |
| **Criticism URL** | https://acfr.aut.ac.nz/__data/assets/pdf_file/0007/29896/100009-Popularity-vs-Profitability-BB-August-Final.pdf |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 2 (diagnostic only; NOT an evidence claim) |
| **Priority** | 18 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | under the standard exit (1.5 ATR stop, 2R target) only |

**STRENGTH claim**

- Verdict state: **CHOPPY** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): QUIET
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in CHOPPY

**WEAKNESS claim**

- Verdict state: **EFFICIENT** (the other one)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): EXPANSION
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in EFFICIENT

**Rationale (as written, pre-results)**

> A squeeze precedes expansion, so fading the first move is claimed to work only while volatility stays compressed.

**Source(s)**

- Bollinger, squeeze
- Lento, C., Gradojevic, N. & Wright, C. S. (2007). Investment information content in Bollinger Bands? Applied Financial Economics Letters 3(4), 263-267. DOI 10.1080/17446540701206576.
- https://www.researchgate.net/publication/46527151_Investment_information_content_in_Bollinger_Bands

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 16. `pdh-retest`

| Field | Value |
| ----- | ----- |
| **Test order** | 16 of 24 (original index 9) |
| **ID** | `pdh-retest` |
| **Family** | level-retest |
| **Variant** | Prior-day high retest long |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Osler, C. L. (2000). Support for Resistance: Technical Analysis and Intraday Exchange Rates. FRBNY Economic Policy Review 6(2), 53-68. |
| **Study full URL** | https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf |
| **What the study tests** | support/resistance (level) signals from six FX firms, intraday 1996-1998 |
| **Study finding** | levels predict intraday trend interruptions, but firms mis-rank level strength |
| **Strongest criticism** | Curcio, R., Goodhart, C., Guillaume, D. & Payne, R. (1997). Do technical trading rules generate profits? Conclusions from the intra-day foreign exchange market. International Journal of Finance and Economics 2(4), 267-280. |
| **Criticism URL** | http://support-and-resistance.technicalanalysis.org.uk/Curcio-etal1997.pdf |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 3 (diagnostic only; NOT an evidence claim) |
| **Priority** | 10 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | none |

**STRENGTH claim**

- Verdict state: **EFFICIENT** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): GRIND
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in EFFICIENT

**WEAKNESS claim**

- Verdict state: **CHOPPY** (the other one)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): WHIPSAW
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in CHOPPY

**Rationale (as written, pre-results)**

> A broken level turning into support is a trend-continuation entry; high-vol chop destroys the level's meaning.

**Source(s)**

- Support/resistance retest literature
- Osler, C. L. (2000). Support for Resistance: Technical Analysis and Intraday Exchange Rates. FRBNY Economic Policy Review 6(2), 53-68.
- https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 17. `pdl-retest`

| Field | Value |
| ----- | ----- |
| **Test order** | 17 of 24 (original index 10) |
| **ID** | `pdl-retest` |
| **Family** | level-retest |
| **Variant** | Prior-day low retest short |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Osler, C. L. (2000). Support for Resistance: Technical Analysis and Intraday Exchange Rates. FRBNY Economic Policy Review 6(2), 53-68. |
| **Study full URL** | https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf |
| **What the study tests** | support/resistance (level) signals from six FX firms, intraday 1996-1998 |
| **Study finding** | levels predict intraday trend interruptions, but firms mis-rank level strength |
| **Strongest criticism** | Curcio, R., Goodhart, C., Guillaume, D. & Payne, R. (1997). Do technical trading rules generate profits? Conclusions from the intra-day foreign exchange market. International Journal of Finance and Economics 2(4), 267-280. |
| **Criticism URL** | http://support-and-resistance.technicalanalysis.org.uk/Curcio-etal1997.pdf |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 3 (diagnostic only; NOT an evidence claim) |
| **Priority** | 11 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | none |

**STRENGTH claim**

- Verdict state: **EFFICIENT** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): GRIND
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in EFFICIENT

**WEAKNESS claim**

- Verdict state: **CHOPPY** (the other one)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): WHIPSAW
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in CHOPPY

**Rationale (as written, pre-results)**

> Mirror of the high retest; same dependence on persistent direction.

**Source(s)**

- Support/resistance retest literature
- Osler, C. L. (2000). Support for Resistance: Technical Analysis and Intraday Exchange Rates. FRBNY Economic Policy Review 6(2), 53-68.
- https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 18. `classic-pivot`

| Field | Value |
| ----- | ----- |
| **Test order** | 18 of 24 (original index 11) |
| **ID** | `classic-pivot` |
| **Family** | level-retest |
| **Variant** | Classic floor-pivot bounce |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Osler, C. L. (2000). Support for Resistance: Technical Analysis and Intraday Exchange Rates. FRBNY Economic Policy Review 6(2), 53-68. |
| **Study full URL** | https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf |
| **What the study tests** | support/resistance (level) signals from six FX firms, intraday 1996-1998 |
| **Study finding** | levels predict intraday trend interruptions, but firms mis-rank level strength |
| **Strongest criticism** | Curcio, R., Goodhart, C., Guillaume, D. & Payne, R. (1997). Do technical trading rules generate profits? Conclusions from the intra-day foreign exchange market. International Journal of Finance and Economics 2(4), 267-280. |
| **Criticism URL** | http://support-and-resistance.technicalanalysis.org.uk/Curcio-etal1997.pdf |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 3 (diagnostic only; NOT an evidence claim) |
| **Priority** | 12 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | none |

**STRENGTH claim**

- Verdict state: **EFFICIENT** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): GRIND
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in EFFICIENT

**WEAKNESS claim**

- Verdict state: **CHOPPY** (the other one)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): WHIPSAW
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in CHOPPY

**Rationale (as written, pre-results)**

> Pivot levels act as intraday support/resistance in an ordered market; they are run through in volatile chop.

**Source(s)**

- Floor-trader pivots
- Osler, C. L. (2000). Support for Resistance: Technical Analysis and Intraday Exchange Rates. FRBNY Economic Policy Review 6(2), 53-68.
- https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 19. `rsi-14-30-70`

| Field | Value |
| ----- | ----- |
| **Test order** | 19 of 24 (original index 12) |
| **ID** | `rsi-14-30-70` |
| **Family** | osc-fade |
| **Variant** | RSI14 fade at 30/70 |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Chong, T.T.-L., Ng, W.-K. & Liew, V.K.-S. (2014). Revisiting the Performance of MACD and RSI Oscillators. Journal of Risk and Financial Management 7(1), 1-12 / MPRA Paper 54149. |
| **Study full URL** | https://mpra.ub.uni-muenchen.de/54149/1/MPRA_paper_54149.pdf |
| **What the study tests** | RSI(14,30/70) and RSI(21,50) oscillator rules on five OECD indices 1976-2002 |
| **Study finding** | RSI(14,30/70) profitable on DJIA but not consistently across markets |
| **Strongest criticism** | Muruganandan, S. (2020). Testing the profitability of technical trading rules across market cycles: Evidence from India. Colombo Business Journal 11(1), 24-46. |
| **Criticism URL** | https://mgmt.cmb.ac.lk/cbj/wp-content/uploads/2020/06/2.-Technical-trading-rules.pdf |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 3 (diagnostic only; NOT an evidence claim) |
| **Priority** | 13 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | under the standard exit (1.5 ATR stop, 2R target) only |

**STRENGTH claim**

- Verdict state: **CHOPPY** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): QUIET
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in CHOPPY

**WEAKNESS claim**

- Verdict state: **EFFICIENT** (the other one)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): EXPANSION
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in EFFICIENT

**Rationale (as written, pre-results)**

> In a range, overbought/oversold readings revert; in a strong trend RSI stays extreme and fading catches a knife.

**Source(s)**

- Wilder, RSI
- Chong, T.T.-L., Ng, W.-K. & Liew, V.K.-S. (2014). Revisiting the Performance of MACD and RSI Oscillators. Journal of Risk and Financial Management 7(1), 1-12 / MPRA Paper 54149.
- https://mpra.ub.uni-muenchen.de/54149/1/MPRA_paper_54149.pdf

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 20. `williams-r-fade`

| Field | Value |
| ----- | ----- |
| **Test order** | 20 of 24 (original index 13) |
| **ID** | `williams-r-fade` |
| **Family** | osc-fade |
| **Variant** | Williams %R extreme fade |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Chong, T.T.-L., Ng, W.-K. & Liew, V.K.-S. (2014). Revisiting the Performance of MACD and RSI Oscillators. Journal of Risk and Financial Management 7(1), 1-12 / MPRA Paper 54149. |
| **Study full URL** | https://mpra.ub.uni-muenchen.de/54149/1/MPRA_paper_54149.pdf |
| **What the study tests** | RSI(14,30/70) and RSI(21,50) oscillator rules on five OECD indices 1976-2002 |
| **Study finding** | RSI(14,30/70) profitable on DJIA but not consistently across markets |
| **Strongest criticism** | Muruganandan, S. (2020). Testing the profitability of technical trading rules across market cycles: Evidence from India. Colombo Business Journal 11(1), 24-46. |
| **Criticism URL** | https://mgmt.cmb.ac.lk/cbj/wp-content/uploads/2020/06/2.-Technical-trading-rules.pdf |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 3 (diagnostic only; NOT an evidence claim) |
| **Priority** | 14 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | under the standard exit (1.5 ATR stop, 2R target) only |

**STRENGTH claim**

- Verdict state: **CHOPPY** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): QUIET
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in CHOPPY

**WEAKNESS claim**

- Verdict state: **EFFICIENT** (the other one)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): EXPANSION
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in EFFICIENT

**Rationale (as written, pre-results)**

> Williams %R assumes mean reversion from extremes, which holds only in a non-trending market.

**Source(s)**

- Williams, %R
- Chong, T.T.-L., Ng, W.-K. & Liew, V.K.-S. (2014). Revisiting the Performance of MACD and RSI Oscillators. Journal of Risk and Financial Management 7(1), 1-12 / MPRA Paper 54149.
- https://mpra.ub.uni-muenchen.de/54149/1/MPRA_paper_54149.pdf

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 21. `stochastic-14-fade`

| Field | Value |
| ----- | ----- |
| **Test order** | 21 of 24 (original index 14) |
| **ID** | `stochastic-14-fade` |
| **Family** | osc-fade |
| **Variant** | Stochastic 14 extreme fade |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Chong, T.T.-L., Ng, W.-K. & Liew, V.K.-S. (2014). Revisiting the Performance of MACD and RSI Oscillators. Journal of Risk and Financial Management 7(1), 1-12 / MPRA Paper 54149. |
| **Study full URL** | https://mpra.ub.uni-muenchen.de/54149/1/MPRA_paper_54149.pdf |
| **What the study tests** | RSI(14,30/70) and RSI(21,50) oscillator rules on five OECD indices 1976-2002 |
| **Study finding** | RSI(14,30/70) profitable on DJIA but not consistently across markets |
| **Strongest criticism** | Muruganandan, S. (2020). Testing the profitability of technical trading rules across market cycles: Evidence from India. Colombo Business Journal 11(1), 24-46. |
| **Criticism URL** | https://mgmt.cmb.ac.lk/cbj/wp-content/uploads/2020/06/2.-Technical-trading-rules.pdf |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 3 (diagnostic only; NOT an evidence claim) |
| **Priority** | 15 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | under the standard exit (1.5 ATR stop, 2R target) only |

**STRENGTH claim**

- Verdict state: **CHOPPY** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): QUIET
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in CHOPPY

**WEAKNESS claim**

- Verdict state: **EFFICIENT** (the other one)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): EXPANSION
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in EFFICIENT

**Rationale (as written, pre-results)**

> Stochastic extremes signal exhaustion in a range but persist during a directional expansion.

**Source(s)**

- Lane, Stochastic
- Chong, T.T.-L., Ng, W.-K. & Liew, V.K.-S. (2014). Revisiting the Performance of MACD and RSI Oscillators. Journal of Risk and Financial Management 7(1), 1-12 / MPRA Paper 54149.
- https://mpra.ub.uni-muenchen.de/54149/1/MPRA_paper_54149.pdf

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 22. `engulfing`

| Field | Value |
| ----- | ----- |
| **Test order** | 22 of 24 (original index 18) |
| **ID** | `engulfing` |
| **Family** | candlestick-reversal |
| **Variant** | Bull/bear engulfing reversal |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Marshall, B. R., Young, M. R. & Rose, L. C. (2006). Candlestick technical trading strategies: Can they create value for investors? Journal of Banking & Finance 30(8), 2303-2323. DOI 10.1016/j.jbankfin.2005.08.001. |
| **Study full URL** | https://scispace.com/pdf/candlestick-technical-trading-strategies-can-they-create-2whgphf6vm.pdf |
| **What the study tests** | 26 candlestick reversal patterns on DJIA component stocks 1992-2002, bootstrap |
| **Study finding** | no value; neither bullish nor bearish signals beat buy-and-hold (negative) |
| **Strongest criticism** | Marshall, B. R., Young, M. R. & Cahan, R. (2008). Are candlestick technical trading strategies profitable in the Japanese equity market? Review of Quantitative Finance and Accounting 31, 191-207. |
| **Criticism URL** | https://link.springer.com/article/10.1007/s11156-007-0068-1 |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 4 (diagnostic only; NOT an evidence claim) |
| **Priority** | 19 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | under the standard exit (1.5 ATR stop, 2R target) only |

**STRENGTH claim**

- Verdict state: **CHOPPY** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): QUIET
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in CHOPPY

**WEAKNESS claim**

- Verdict state: **EFFICIENT** (the other one)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): EXPANSION
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in EFFICIENT

**Rationale (as written, pre-results)**

> Reversal candles need a low-noise backdrop to be readable; in an expansion they are continuation noise.

**Source(s)**

- Nison, Japanese Candlestick Charting
- Marshall, B. R., Young, M. R. & Rose, L. C. (2006). Candlestick technical trading strategies: Can they create value for investors? Journal of Banking & Finance 30(8), 2303-2323. DOI 10.1016/j.jbankfin.2005.08.001.
- https://scispace.com/pdf/candlestick-technical-trading-strategies-can-they-create-2whgphf6vm.pdf

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 23. `morning-evening-star`

| Field | Value |
| ----- | ----- |
| **Test order** | 23 of 24 (original index 19) |
| **ID** | `morning-evening-star` |
| **Family** | candlestick-reversal |
| **Variant** | Morning/evening star |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Marshall, B. R., Young, M. R. & Rose, L. C. (2006). Candlestick technical trading strategies: Can they create value for investors? Journal of Banking & Finance 30(8), 2303-2323. DOI 10.1016/j.jbankfin.2005.08.001. |
| **Study full URL** | https://scispace.com/pdf/candlestick-technical-trading-strategies-can-they-create-2whgphf6vm.pdf |
| **What the study tests** | 26 candlestick reversal patterns on DJIA component stocks 1992-2002, bootstrap |
| **Study finding** | no value; neither bullish nor bearish signals beat buy-and-hold (negative) |
| **Strongest criticism** | Marshall, B. R., Young, M. R. & Cahan, R. (2008). Are candlestick technical trading strategies profitable in the Japanese equity market? Review of Quantitative Finance and Accounting 31, 191-207. |
| **Criticism URL** | https://link.springer.com/article/10.1007/s11156-007-0068-1 |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 4 (diagnostic only; NOT an evidence claim) |
| **Priority** | 20 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | under the standard exit (1.5 ATR stop, 2R target) only |

**STRENGTH claim**

- Verdict state: **CHOPPY** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): QUIET
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in CHOPPY

**WEAKNESS claim**

- Verdict state: **EFFICIENT** (the other one)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): EXPANSION
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in EFFICIENT

**Rationale (as written, pre-results)**

> Three-candle reversal patterns assume exhaustion; a strong trend absorbs them.

**Source(s)**

- Nison, Japanese Candlestick Charting
- Marshall, B. R., Young, M. R. & Rose, L. C. (2006). Candlestick technical trading strategies: Can they create value for investors? Journal of Banking & Finance 30(8), 2303-2323. DOI 10.1016/j.jbankfin.2005.08.001.
- https://scispace.com/pdf/candlestick-technical-trading-strategies-can-they-create-2whgphf6vm.pdf

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## 24. `three-soldiers-crows`

| Field | Value |
| ----- | ----- |
| **Test order** | 24 of 24 (original index 20) |
| **ID** | `three-soldiers-crows` |
| **Family** | candlestick-reversal |
| **Variant** | Three white soldiers / black crows fade |
| **Evidence grade** | PEER_REVIEWED_TEST |
| **Empirical study** | Marshall, B. R., Young, M. R. & Rose, L. C. (2006). Candlestick technical trading strategies: Can they create value for investors? Journal of Banking & Finance 30(8), 2303-2323. DOI 10.1016/j.jbankfin.2005.08.001. |
| **Study full URL** | https://scispace.com/pdf/candlestick-technical-trading-strategies-can-they-create-2whgphf6vm.pdf |
| **What the study tests** | 26 candlestick reversal patterns on DJIA component stocks 1992-2002, bootstrap |
| **Study finding** | no value; neither bullish nor bearish signals beat buy-and-hold (negative) |
| **Strongest criticism** | Marshall, B. R., Young, M. R. & Cahan, R. (2008). Are candlestick technical trading strategies profitable in the Japanese equity market? Review of Quantitative Finance and Accounting 31, 191-207. |
| **Criticism URL** | https://link.springer.com/article/10.1007/s11156-007-0068-1 |
| **Criticism status** | VERIFIED (opened 2026-10-27) |
| **Frozen order rank** | 4 (diagnostic only; NOT an evidence claim) |
| **Priority** | 21 (frozen numeric, decision #10) |
| **Trade direction** | both (decision #11) |
| **Session restriction** | none (all sessions) |
| **Status** | DRAFT (approvedBy: null, approvedAt: null) |
| **Exit caveat** | under the standard exit (1.5 ATR stop, 2R target) only |

**STRENGTH claim**

- Verdict state: **CHOPPY** (DECIDES the verdict)
- Four Map states in this cell (diagnostics): WHIPSAW, QUIET
- Textbook four-state label (diagnostic): QUIET
- Direction: +1 (expect POSITIVE net R)
- Claim: positive net R in CHOPPY

**WEAKNESS claim**

- Verdict state: **EFFICIENT** (the other one)
- Four Map states in this cell (diagnostics): EXPANSION, GRIND
- Textbook four-state label (diagnostic): EXPANSION
- Direction: -1 (expect NEGATIVE net R)
- Claim: negative net R in EFFICIENT

**Rationale (as written, pre-results)**

> A three-bar directional run in a quiet market is claimed to be exhausted; in high-vol chop it is meaningless.

**Source(s)**

- Nison, Japanese Candlestick Charting
- Marshall, B. R., Young, M. R. & Rose, L. C. (2006). Candlestick technical trading strategies: Can they create value for investors? Journal of Banking & Finance 30(8), 2303-2323. DOI 10.1016/j.jbankfin.2005.08.001.
- https://scispace.com/pdf/candlestick-technical-trading-strategies-can-they-create-2whgphf6vm.pdf

**Review fields (leave blank until the human freeze)**

- Reviewer decision: _keep / edit / remove — `_
- If edited, new strength/weakness verdict state + rationale (pre-results only): _`______`_

---

## Freeze gate (decision #13) — NOT DONE

Real verification stays BLOCKED until a reviewer sets `FREEZE.status = "FROZEN"`
with `approvedBy` and `approvedAt` in `claim-cards.draft.mjs`. **Amendment 3 did
not freeze anything.** See `docs/CLAIM-CARDS-REVIEW.md` for the review checklist.

