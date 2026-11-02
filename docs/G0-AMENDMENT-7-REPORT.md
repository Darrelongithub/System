# G0 Amendment 7 — pre-result DRAFT corrections and report-only controls

**Date:** 2026-11-02. **Status:** pre-result amendment; every card remains `DRAFT`; `verify-claims` remains blocked. No strategy verification, strategy return, trade-result, claim-verification, or ledger artifact was produced.
**Unchanged:** Map, costs, exits, frozen numerical thresholds, claim states (including the preserved CHOPPY/EFFICIENT three-soldiers pair), and the CONFIRMED rule. CONFIRMED remains: net mean > +0.10R and day-clustered t(net)>2 AND matched-control excess >0R and day-clustered t(excess)>2, with the unchanged frozen vetoes.
**Versioning:** v1.6 and all earlier snapshots are preserved byte-for-byte. This report accompanies BLUEPRINT v1.7; full SHA-256 is recorded in `artifacts/map-compass/blueprint-hashes.json` and `docs/BLUEPRINT-AMENDMENTS.md`.

## 1. DRAFT-only signal corrections (no outcome data)

1. `asian-range-break`: replace the A6 ‘first 20 observed Asian bars’ range with **all observed bars in the EAT Asian session clock window, 01:00–10:59**; London entries start only after the range window has ended. There is no 20-bar minimum.
2. `london-orb-30`: replace the six-bar/three-hour range with the fixed **11:00–11:29 EAT** opening range (`[11:00,11:30)`); entry eligibility begins at 11:30. The range is the high/low of available bars in that 30-minute clock window; at least one observed range bar is required.
3. `classic-pivot`: pre-fix exact code line was `const pp = (prev.hi + prev.lo + prev.open) / 3;`. This used prior-open, not prior-close. The opened textbook source gives **PP = (previous session high + previous session low + previous session close) / 3**: [TradeAlgo floor-trader pivots](https://www.tradealgo.com/trading-guides/technical-analysis/pivot-points-how-floor-traders-calculate-daily-support-and-resistance-levels). Current DRAFT line: `const pp = (prev.hi + prev.lo + prev.close) / 3;` (`prev.close` is the last observed prior EAT-day bar close). A6→A7 DEV signal count change: **6,532 → 6,443 (−89)**.
4. `three-soldiers-crows`: the pre-fix variant said **“Three white soldiers / black crows fade”**; the claim text was **“positive net R in CHOPPY”** (strength) / **“negative net R in EFFICIENT”** (weakness), with rationale **“A three-bar directional run in a quiet market is claimed to be exhausted; in high-vol chop it is meaningless.”** The current card claim strings and their CHOPPY/EFFICIENT states are preserved; current variant text is `Three white soldiers LONG / black crows SHORT (textbook direction)`, and rationale now describes a continuation signal. The opened [ThinkMarkets pattern guide](https://www.thinkmarkets.com/en/trading-academy/indicators-and-patterns/three-soldiers-black-crows-pattern/) defines three white soldiers as three consecutive bullish candles after a decline, with opens within prior real bodies and higher closes near highs; three black crows are the bearish mirror after an advance. **Direction fix:** soldiers emit LONG; crows emit SHORT. Source definition and direction were opened and are **VERIFIED** this run. The empirical Marshall–Young–Rose study is separate; its full text is not needed to establish this pattern definition. A6→A7 total signals **2,168 → 2,168 (0 change)**; side counts below show the direction swap.

### Affected-card signal counts and direction-side audit (DEV only)

| Card | A6 total | A7 total | Δ total | A6 long | A7 long | Δ long | A6 short | A7 short | Δ short |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| asian-range-break | 3856 | 13948 | 10092 | 1762 | 6858 | 5096 | 2094 | 7090 | 4996 |
| london-orb-30 | 6442 | 23115 | 16673 | 3273 | 11590 | 8317 | 3169 | 11525 | 8356 |
| classic-pivot | 6532 | 6443 | -89 | 3144 | 3080 | -64 | 3388 | 3363 | -25 |
| three-soldiers-crows | 2168 | 2168 | 0 | 1039 | 1129 | 90 | 1129 | 1039 | -90 |

## 2. Session coverage and Asian-range diagnosis

Clock-window range validity is defined as at least one observed M30 bar in that window on a DEV EAT calendar date. Signal-day shares count unique signal dates, not repeated same-day emissions.

| DEV year | DEV days | M30 bars/day | Asian-session bars/day | Max Asian bars on any DEV day | Asian valid-range days | Asian valid-range share | London ORB valid-range days | London ORB valid-range share |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2004 | 143 | 41.72 | 16.18 | 18 | 141 | 98.60% | 140 | 97.90% |
| 2005 | 263 | 41.62 | 16.25 | 18 | 253 | 96.20% | 249 | 94.68% |
| 2006 | 262 | 41.92 | 16.06 | 18 | 250 | 95.42% | 247 | 94.27% |
| 2007 | 276 | 41.86 | 16.31 | 18 | 257 | 93.12% | 256 | 92.75% |
| 2009 | 277 | 41.96 | 16.41 | 18 | 257 | 92.78% | 256 | 92.42% |
| 2010 | 271 | 40.65 | 16.20 | 18 | 257 | 94.83% | 255 | 94.10% |
| 2011 | 274 | 40.97 | 16.61 | 20 | 255 | 93.07% | 254 | 92.70% |
| 2013 | 273 | 42.96 | 18.04 | 20 | 258 | 94.51% | 258 | 94.51% |
| 2014 | 275 | 42.67 | 17.80 | 20 | 258 | 93.82% | 258 | 93.82% |
| 2015 | 274 | 42.65 | 17.89 | 20 | 258 | 94.16% | 257 | 93.80% |
| 2017 | 274 | 42.78 | 17.95 | 20 | 257 | 93.80% | 257 | 93.80% |
| 2018 | 275 | 42.71 | 17.91 | 20 | 258 | 93.82% | 258 | 93.82% |

**Why A6 had zero Asian-break signals before 2011-05-13:** it demanded 20 prior Asian bars, but the observed Asian clock window averaged fewer than 20 M30 bars/day (see means above); the legacy evaluator skipped these days. The new logic uses all bars that actually fall in 01:00–10:59; no post-signal price or outcome is used.

## 3. All 22 cards — source timeframe and status

Each strength and weakness verdict label is explicitly DRAFT and includes the required disclosure **“tested on M30 gold; the source used <timeframe>.”** This phrase describes the target test design vs the cited literature timeframe; it is not a performance finding. VERIFIED means the cited page or full-text mirror was opened this run; UNVERIFIED means it was not.

| Card | Strength / weakness state | Strength verdict label | Weakness verdict label | Source timeframe | Source status | Full cited URL |
|---|---|---|---|---|---|---|
| donchian-20 | EFFICIENT / CHOPPY | DRAFT: positive net R in EFFICIENT; tested on M30 gold; the source used Daily DJIA data (1897–1986). | DRAFT: negative net R in CHOPPY; tested on M30 gold; the source used Daily DJIA data (1897–1986). | Daily DJIA data (1897–1986). | **UNVERIFIED** — The opened search result identifies daily data; no source page/PDF was opened this run. | http://technicalanalysis.org.uk/support-and-resistance/BrockLakonishokLeBaron1992.pdf |
| donchian-55 | EFFICIENT / CHOPPY | DRAFT: positive net R in EFFICIENT; tested on M30 gold; the source used Daily DJIA data (1897–1986). | DRAFT: negative net R in CHOPPY; tested on M30 gold; the source used Daily DJIA data (1897–1986). | Daily DJIA data (1897–1986). | **UNVERIFIED** — Same cited BLL study as Donchian-20; the PDF was not opened this run. | http://technicalanalysis.org.uk/support-and-resistance/BrockLakonishokLeBaron1992.pdf |
| sma-20-50 | EFFICIENT / CHOPPY | DRAFT: positive net R in EFFICIENT; tested on M30 gold; the source used Monthly observations for FT30, 1935–1994 (interval described in the opened 2014 article). | DRAFT: negative net R in CHOPPY; tested on M30 gold; the source used Monthly observations for FT30, 1935–1994 (interval described in the opened 2014 article). | Monthly observations for FT30, 1935–1994 (interval described in the opened 2014 article). | **VERIFIED** — The 2008 bibliographic record was opened this run but does not expose its interval; monthly detail came from the opened 2014 article. The cited study is not an SMA20/50 test. | https://ideas.repec.org/a/taf/apeclt/v15y2008i14p1111-1114.html |
| macd-cross | EFFICIENT / CHOPPY | DRAFT: positive net R in EFFICIENT; tested on M30 gold; the source used Monthly observations for FT30, 1935–1994 (interval described in the opened 2014 article). | DRAFT: negative net R in CHOPPY; tested on M30 gold; the source used Monthly observations for FT30, 1935–1994 (interval described in the opened 2014 article). | Monthly observations for FT30, 1935–1994 (interval described in the opened 2014 article). | **VERIFIED** — The 2008 record was opened but does not expose its interval; accessible monthly detail came from the opened 2014 paper citing it. | https://ideas.repec.org/a/taf/apeclt/v15y2008i14p1111-1114.html |
| ichimoku-tk | EFFICIENT / CHOPPY | DRAFT: positive net R in EFFICIENT; tested on M30 gold; the source used Monthly observations for FT30, 1935–1994 (interval described in the opened 2014 article). | DRAFT: negative net R in CHOPPY; tested on M30 gold; the source used Monthly observations for FT30, 1935–1994 (interval described in the opened 2014 article). | Monthly observations for FT30, 1935–1994 (interval described in the opened 2014 article). | **VERIFIED** — Source record opened this run; 2014 article supplies the monthly interval detail. Ichimoku itself was not tested there. | https://ideas.repec.org/a/taf/apeclt/v15y2008i14p1111-1114.html |
| atr-squeeze-break | CHOPPY / EFFICIENT | DRAFT: positive net R in CHOPPY; tested on M30 gold; the source used Daily NR7 ranges; ATR-squeeze sampling interval is unspecified by the cited page. | DRAFT: negative net R in EFFICIENT; tested on M30 gold; the source used Daily NR7 ranges; ATR-squeeze sampling interval is unspecified by the cited page. | Daily NR7 ranges; ATR-squeeze sampling interval is unspecified by the cited page. | **VERIFIED** — Linked page opened this run; no academic test or direct ATR-squeeze timeframe was established. | https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7 |
| nr7-break | CHOPPY / EFFICIENT | DRAFT: positive net R in CHOPPY; tested on M30 gold; the source used Daily bars: NR7 is the narrowest absolute high-low range over seven days. | DRAFT: negative net R in EFFICIENT; tested on M30 gold; the source used Daily bars: NR7 is the narrowest absolute high-low range over seven days. | Daily bars: NR7 is the narrowest absolute high-low range over seven days. | **VERIFIED** — Linked ChartSchool page opened this run. | https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7 |
| inside-bar-break | CHOPPY / EFFICIENT | DRAFT: positive net R in CHOPPY; tested on M30 gold; the source used Daily NR7 context; the cited page does not specify an inside-bar sampling interval. | DRAFT: negative net R in EFFICIENT; tested on M30 gold; the source used Daily NR7 context; the cited page does not specify an inside-bar sampling interval. | Daily NR7 context; the cited page does not specify an inside-bar sampling interval. | **VERIFIED** — Linked page opened this run; the timeframe for the inside-bar evaluator is not established by that page. | https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7 |
| asian-range-break | EFFICIENT / CHOPPY | DRAFT: positive net R in EFFICIENT; tested on M30 gold; the source used Daily OHLC records for an intraday opening-range study. | DRAFT: negative net R in CHOPPY; tested on M30 gold; the source used Daily OHLC records for an intraday opening-range study. | Daily OHLC records for an intraday opening-range study. | **VERIFIED** — ScienceDirect article page opened this run. | https://www.sciencedirect.com/science/article/abs/pii/S1544612312000438 |
| london-orb-30 | EFFICIENT / CHOPPY | DRAFT: positive net R in EFFICIENT; tested on M30 gold; the source used Daily OHLC records for intraday ORB assessment. | DRAFT: negative net R in CHOPPY; tested on M30 gold; the source used Daily OHLC records for intraday ORB assessment. | Daily OHLC records for intraday ORB assessment. | **VERIFIED** — ScienceDirect article page opened this run. | https://www.sciencedirect.com/science/article/abs/pii/S1544612312000438 |
| pdh-pdl-break | EFFICIENT / CHOPPY | DRAFT: positive net R in EFFICIENT; tested on M30 gold; the source used Daily OHLC records for intraday ORB strategies. | DRAFT: negative net R in CHOPPY; tested on M30 gold; the source used Daily OHLC records for intraday ORB strategies. | Daily OHLC records for intraday ORB strategies. | **VERIFIED** — Holmberg et al. is a related ORB source, not a test of this exact prior-day-level evaluator. | https://www.sciencedirect.com/science/article/abs/pii/S1544612312000438 |
| bollinger-20-2 | CHOPPY / EFFICIENT | DRAFT: positive net R in CHOPPY; tested on M30 gold; the source used Daily closing prices, four markets, May 1995–December 2004. | DRAFT: negative net R in EFFICIENT; tested on M30 gold; the source used Daily closing prices, four markets, May 1995–December 2004. | Daily closing prices, four markets, May 1995–December 2004. | **VERIFIED** — Full paper content opened this run. | https://www.researchgate.net/publication/46527151_Investment_information_content_in_Bollinger_Bands |
| keltner-20-atr | CHOPPY / EFFICIENT | DRAFT: positive net R in CHOPPY; tested on M30 gold; the source used Daily closing prices for four markets, May 1995–December 2004. | DRAFT: negative net R in EFFICIENT; tested on M30 gold; the source used Daily closing prices for four markets, May 1995–December 2004. | Daily closing prices for four markets, May 1995–December 2004. | **VERIFIED** — Full paper content opened this run. Rule-to-source mismatch disclosed. | https://www.researchgate.net/publication/46527151_Investment_information_content_in_Bollinger_Bands |
| bb-squeeze-fade | CHOPPY / EFFICIENT | DRAFT: positive net R in CHOPPY; tested on M30 gold; the source used Daily closing prices, four markets, May 1995–December 2004 in the cited Bollinger study. | DRAFT: negative net R in EFFICIENT; tested on M30 gold; the source used Daily closing prices, four markets, May 1995–December 2004 in the cited Bollinger study. | Daily closing prices, four markets, May 1995–December 2004 in the cited Bollinger study. | **VERIFIED** — Full paper content opened this run; its tested variants are not identical to this squeeze-release fade. | https://www.researchgate.net/publication/46527151_Investment_information_content_in_Bollinger_Bands |
| pdh-retest | EFFICIENT / CHOPPY | DRAFT: positive net R in EFFICIENT; tested on M30 gold; the source used Daily published FX support/resistance levels; intraday one-minute indicative FX quotes (1996–1998). | DRAFT: negative net R in CHOPPY; tested on M30 gold; the source used Daily published FX support/resistance levels; intraday one-minute indicative FX quotes (1996–1998). | Daily published FX support/resistance levels; intraday one-minute indicative FX quotes (1996–1998). | **VERIFIED** — The paper's full text was opened this run via a ResearchGate mirror: https://www.researchgate.net/publication/5050393_Support_for_Resistance_Technical_Analysis_and_Intraday_Exchange_Rates . The NYFed PDF URL itself did not fetch. | https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf |
| pdl-retest | EFFICIENT / CHOPPY | DRAFT: positive net R in EFFICIENT; tested on M30 gold; the source used Daily published FX support/resistance levels; intraday one-minute indicative FX quotes (1996–1998). | DRAFT: negative net R in CHOPPY; tested on M30 gold; the source used Daily published FX support/resistance levels; intraday one-minute indicative FX quotes (1996–1998). | Daily published FX support/resistance levels; intraday one-minute indicative FX quotes (1996–1998). | **VERIFIED** — Full text opened via the ResearchGate mirror noted above; source does not test these exact prior-day-level triggers. | https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf |
| classic-pivot | EFFICIENT / CHOPPY | DRAFT: positive net R in EFFICIENT; tested on M30 gold; the source used Daily floor-pivot formula uses prior-session H/L/C; related Osler S/R study uses one-minute FX quote observations. | DRAFT: negative net R in CHOPPY; tested on M30 gold; the source used Daily floor-pivot formula uses prior-session H/L/C; related Osler S/R study uses one-minute FX quote observations. | Daily floor-pivot formula uses prior-session H/L/C; related Osler S/R study uses one-minute FX quote observations. | **UNVERIFIED** — Osler source PDF did not open this run; it is not a pivot study. Formula source opened and VERIFIED: https://www.tradealgo.com/trading-guides/technical-analysis/pivot-points-how-floor-traders-calculate-daily-support-and-resistance-levels . | https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf |
| rsi-14-30-70 | CHOPPY / EFFICIENT | DRAFT: positive net R in CHOPPY; tested on M30 gold; the source used Daily closing prices for five equity indices, January 1976–December 2002. | DRAFT: negative net R in EFFICIENT; tested on M30 gold; the source used Daily closing prices for five equity indices, January 1976–December 2002. | Daily closing prices for five equity indices, January 1976–December 2002. | **VERIFIED** — The published article was opened this run at https://www.mdpi.com/1911-8074/7/1/1 . | https://mpra.ub.uni-muenchen.de/54149/1/MPRA_paper_54149.pdf |
| williams-r-fade | CHOPPY / EFFICIENT | DRAFT: positive net R in CHOPPY; tested on M30 gold; the source used Daily closing prices for five equity indices, January 1976–December 2002. | DRAFT: negative net R in EFFICIENT; tested on M30 gold; the source used Daily closing prices for five equity indices, January 1976–December 2002. | Daily closing prices for five equity indices, January 1976–December 2002. | **VERIFIED** — Published article opened at https://www.mdpi.com/1911-8074/7/1/1 . Rule-to-source mismatch disclosed. | https://mpra.ub.uni-muenchen.de/54149/1/MPRA_paper_54149.pdf |
| engulfing | CHOPPY / EFFICIENT | DRAFT: positive net R in CHOPPY; tested on M30 gold; the source used Daily stock OHLC for 35 DJIA component stocks, 1992–2002. | DRAFT: negative net R in EFFICIENT; tested on M30 gold; the source used Daily stock OHLC for 35 DJIA component stocks, 1992–2002. | Daily stock OHLC for 35 DJIA component stocks, 1992–2002. | **VERIFIED** — ScienceDirect article and section snippets opened this run. | https://www.sciencedirect.com/science/article/abs/pii/S0378426605002116 |
| morning-evening-star | CHOPPY / EFFICIENT | DRAFT: positive net R in CHOPPY; tested on M30 gold; the source used Daily stock OHLC for 35 DJIA component stocks, 1992–2002. | DRAFT: negative net R in EFFICIENT; tested on M30 gold; the source used Daily stock OHLC for 35 DJIA component stocks, 1992–2002. | Daily stock OHLC for 35 DJIA component stocks, 1992–2002. | **VERIFIED** — ScienceDirect article opened this run; the article's full pattern table is access-restricted. | https://www.sciencedirect.com/science/article/abs/pii/S0378426605002116 |
| three-soldiers-crows | CHOPPY / EFFICIENT | DRAFT: positive net R in CHOPPY; tested on M30 gold; the source used Daily stock OHLC for 35 DJIA component stocks, 1992–2002. | DRAFT: negative net R in EFFICIENT; tested on M30 gold; the source used Daily stock OHLC for 35 DJIA component stocks, 1992–2002. | Daily stock OHLC for 35 DJIA component stocks, 1992–2002. | **VERIFIED** — ScienceDirect article opened this run; direction definition separately verified from ThinkMarkets. | https://www.sciencedirect.com/science/article/abs/pii/S0378426605002116 |

**Source-use caution:** citations are family motivation, not evidence on XAUUSD M30 and not proof that every exact card rule was studied. `sma-20-50`, Ichimoku, Williams %R, Keltner, and the specific BB squeeze are not the exact rule studied by their family citation; the table states that mismatch rather than implying equivalence. `three-soldiers-crows` empirical study tested candlestick patterns, while the direction definition is supported by the separately opened ThinkMarkets guide.

## 4. Signal counts by card and DEV year

Each cell is the number of signal emissions (not trades or outcomes); `0` is explicit and is also flagged in the card's zero-year column. Dates are EAT calendar dates. The detailed machine-readable artifact reports every card-year first/last signal date and zero flag.

| Card | Total | 2004 | 2005 | 2006 | 2007 | 2009 | 2010 | 2011 | 2013 | 2014 | 2015 | 2017 | 2018 | First signal date | Last signal date | Zero-signal DEV years |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| donchian-20 | 25237 | 972 | 1948 | 2146 | 2176 | 2275 | 2201 | 2331 | 2137 | 2025 | 2132 | 2363 | 2531 | 2004-06-14 | 2018-12-31 | none |
| donchian-55 | 12790 | 455 | 1040 | 1164 | 1027 | 1179 | 1183 | 1322 | 968 | 942 | 1028 | 1261 | 1221 | 2004-06-15 | 2018-12-31 | none |
| sma-20-50 | 2876 | 140 | 213 | 230 | 245 | 237 | 259 | 217 | 252 | 275 | 267 | 251 | 290 | 2004-06-14 | 2018-12-27 | none |
| macd-cross | 10068 | 456 | 840 | 818 | 867 | 963 | 848 | 892 | 838 | 925 | 873 | 876 | 872 | 2004-06-14 | 2018-12-31 | none |
| ichimoku-tk | 6764 | 311 | 559 | 544 | 595 | 584 | 576 | 571 | 586 | 623 | 650 | 568 | 597 | 2004-06-14 | 2018-12-31 | none |
| atr-squeeze-break | 824 | 41 | 83 | 90 | 59 | 97 | 106 | 93 | 65 | 28 | 38 | 57 | 67 | 2004-06-29 | 2018-12-31 | none |
| nr7-break | 14553 | 845 | 1538 | 1441 | 1390 | 1222 | 1078 | 1155 | 1197 | 1173 | 1112 | 1173 | 1229 | 2004-06-11 | 2018-12-31 | none |
| inside-bar-break | 23976 | 1483 | 2611 | 2246 | 2341 | 1966 | 1825 | 1779 | 2124 | 2027 | 1968 | 1877 | 1729 | 2004-06-11 | 2018-12-31 | none |
| asian-range-break | 13948 | 730 | 1086 | 1024 | 1281 | 1345 | 1258 | 1232 | 1317 | 1160 | 1118 | 1159 | 1238 | 2004-06-14 | 2018-12-31 | none |
| london-orb-30 | 23115 | 1045 | 1835 | 1923 | 2026 | 2082 | 2050 | 1998 | 2010 | 2075 | 2022 | 2027 | 2022 | 2004-06-11 | 2018-12-31 | none |
| pdh-pdl-break | 49228 | 1733 | 4085 | 4077 | 4036 | 4471 | 4355 | 4617 | 4095 | 4192 | 4169 | 5104 | 4294 | 2004-06-14 | 2018-12-31 | none |
| bollinger-20-2 | 8436 | 403 | 708 | 701 | 752 | 734 | 724 | 728 | 725 | 726 | 726 | 759 | 750 | 2004-06-14 | 2018-12-31 | none |
| keltner-20-atr | 6404 | 267 | 584 | 642 | 609 | 554 | 552 | 554 | 539 | 504 | 503 | 577 | 519 | 2004-06-15 | 2018-12-31 | none |
| bb-squeeze-fade | 2835 | 133 | 229 | 220 | 266 | 248 | 235 | 271 | 250 | 240 | 218 | 275 | 250 | 2004-06-17 | 2018-12-31 | none |
| pdh-retest | 1829 | 61 | 147 | 156 | 157 | 174 | 188 | 201 | 119 | 146 | 109 | 214 | 157 | 2004-06-15 | 2018-12-31 | none |
| pdl-retest | 1483 | 38 | 107 | 106 | 106 | 126 | 99 | 132 | 129 | 142 | 161 | 151 | 186 | 2004-06-14 | 2018-12-31 | none |
| classic-pivot | 6443 | 289 | 533 | 490 | 481 | 526 | 597 | 598 | 573 | 478 | 593 | 612 | 673 | 2004-06-14 | 2018-12-31 | none |
| rsi-14-30-70 | 4020 | 163 | 337 | 345 | 371 | 348 | 327 | 338 | 377 | 334 | 344 | 378 | 358 | 2004-06-14 | 2018-12-31 | none |
| williams-r-fade | 18216 | 866 | 1574 | 1538 | 1600 | 1648 | 1611 | 1529 | 1586 | 1591 | 1532 | 1555 | 1586 | 2004-06-11 | 2018-12-31 | none |
| engulfing | 2071 | 120 | 265 | 205 | 182 | 158 | 156 | 161 | 149 | 172 | 161 | 166 | 176 | 2004-06-15 | 2018-12-31 | none |
| morning-evening-star | 13449 | 271 | 657 | 1013 | 1116 | 1331 | 1328 | 1280 | 1262 | 1261 | 1294 | 1308 | 1328 | 2004-06-14 | 2018-12-31 | none |
| three-soldiers-crows | 2168 | 92 | 212 | 366 | 239 | 194 | 169 | 171 | 148 | 148 | 146 | 127 | 156 | 2004-06-18 | 2018-12-27 | none |

### Share of DEV dates with at least one signal, by card and year

This is unique signal dates / DEV dates. For the two clock-range cards, the additional range-valid denominator appears in the following table.

| Card | 2004 | 2005 | 2006 | 2007 | 2009 | 2010 | 2011 | 2013 | 2014 | 2015 | 2017 | 2018 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| donchian-20 | 97.20% | 95.44% | 95.04% | 93.12% | 92.78% | 94.46% | 93.07% | 95.24% | 94.55% | 94.53% | 94.53% | 94.55% |
| donchian-55 | 78.32% | 83.65% | 86.64% | 77.54% | 81.23% | 82.29% | 84.67% | 82.78% | 79.64% | 82.12% | 86.13% | 83.27% |
| sma-20-50 | 70.63% | 61.98% | 63.36% | 67.75% | 61.37% | 68.27% | 59.85% | 69.60% | 68.73% | 66.79% | 67.52% | 71.64% |
| macd-cross | 95.10% | 95.82% | 95.04% | 92.75% | 93.50% | 91.88% | 93.80% | 92.67% | 94.18% | 94.53% | 93.80% | 93.09% |
| ichimoku-tk | 91.61% | 91.25% | 90.46% | 89.13% | 87.36% | 85.98% | 88.32% | 88.64% | 89.82% | 91.97% | 86.50% | 88.73% |
| atr-squeeze-break | 16.08% | 16.73% | 19.47% | 15.58% | 21.30% | 24.35% | 21.17% | 16.85% | 8.00% | 10.58% | 14.60% | 16.73% |
| nr7-break | 99.30% | 95.82% | 96.56% | 94.20% | 93.50% | 94.10% | 93.43% | 94.87% | 94.18% | 94.89% | 94.16% | 94.55% |
| inside-bar-break | 98.60% | 96.96% | 96.95% | 95.29% | 95.31% | 96.31% | 95.26% | 96.34% | 96.36% | 94.89% | 96.35% | 95.64% |
| asian-range-break | 88.81% | 79.47% | 78.24% | 82.61% | 83.39% | 84.13% | 79.93% | 78.75% | 81.09% | 76.64% | 79.56% | 73.45% |
| london-orb-30 | 97.90% | 94.30% | 94.27% | 92.75% | 92.06% | 94.10% | 92.34% | 94.14% | 93.82% | 93.43% | 93.07% | 93.45% |
| pdh-pdl-break | 74.13% | 84.03% | 84.73% | 75.36% | 76.90% | 80.81% | 82.85% | 78.39% | 77.09% | 78.10% | 82.48% | 79.64% |
| bollinger-20-2 | 96.50% | 94.68% | 95.04% | 93.12% | 92.42% | 92.99% | 91.24% | 94.14% | 92.73% | 93.80% | 93.07% | 92.73% |
| keltner-20-atr | 81.82% | 84.79% | 92.37% | 88.04% | 84.12% | 86.35% | 83.21% | 84.62% | 83.27% | 83.58% | 83.94% | 83.27% |
| bb-squeeze-fade | 61.54% | 54.37% | 56.11% | 59.06% | 56.32% | 57.20% | 56.93% | 57.14% | 54.55% | 50.73% | 61.68% | 56.73% |
| pdh-retest | 27.27% | 28.52% | 27.48% | 31.16% | 28.88% | 31.37% | 36.13% | 21.25% | 22.55% | 19.34% | 32.48% | 25.09% |
| pdl-retest | 18.88% | 18.63% | 22.52% | 19.93% | 23.47% | 20.66% | 21.90% | 23.08% | 22.91% | 25.18% | 25.55% | 30.18% |
| classic-pivot | 64.34% | 58.94% | 57.63% | 55.43% | 55.60% | 58.67% | 61.68% | 54.21% | 53.09% | 58.76% | 58.03% | 63.64% |
| rsi-14-30-70 | 62.94% | 66.92% | 72.14% | 66.67% | 63.54% | 65.31% | 62.04% | 65.93% | 66.18% | 71.90% | 68.98% | 67.64% |
| williams-r-fade | 97.90% | 97.34% | 96.18% | 94.20% | 93.14% | 94.83% | 93.80% | 94.51% | 95.27% | 95.99% | 94.53% | 94.91% |
| engulfing | 57.34% | 61.22% | 52.29% | 43.84% | 42.96% | 43.91% | 44.89% | 40.29% | 47.64% | 41.61% | 44.16% | 46.55% |
| morning-evening-star | 82.52% | 85.17% | 93.89% | 93.48% | 94.22% | 95.57% | 94.16% | 94.51% | 94.91% | 94.89% | 93.80% | 93.82% |
| three-soldiers-crows | 45.45% | 44.87% | 69.08% | 52.90% | 45.49% | 41.33% | 40.88% | 37.36% | 39.27% | 37.59% | 29.56% | 41.45% |

### Signal dates as a share of valid range days

| Card / valid range | 2004 | 2005 | 2006 | 2007 | 2009 | 2010 | 2011 | 2013 | 2014 | 2015 | 2017 | 2018 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| asian-range-break / valid clock-window range | 90.07% | 82.61% | 82.00% | 88.72% | 89.88% | 88.72% | 85.88% | 83.33% | 86.43% | 81.40% | 84.82% | 78.29% |
| london-orb-30 / valid clock-window range | 100.00% | 99.60% | 100.00% | 100.00% | 99.61% | 100.00% | 99.61% | 99.61% | 100.00% | 99.61% | 99.22% | 99.61% |

Zero-signal card-years across all 22 cards after the corrections: **0**. A6 no-signal Asian years are corrected; every card-year remains explicitly listed in `artifacts/map-compass/amendment7/signal-yearly.json`.

## 5. Matched baseline means by fine cell

The existing frozen matched random baseline uses the fine key verdict-state×side×session×volatility. Positive baseline means exist in **3/36** legacy fine cells and **1/36** year-matched equal-year cell means. Thus **yes**, the matched control can change whether a claim clears the control gate even if its absolute net mean exceeds +0.10R: CONFIRMED still requires positive matched excess and its unchanged t>2 gate. No actual claim verdict was computed.

| Fine cell | Legacy baseline mean (n) | Year-matched equal-year mean | Year-matched baseline sampling SE | Legacy − year-matched control delta | Combined control-delta SE | Delta t |
|---|---:|---:|---:|---:|---:|---:|
| CHOPPY\|long\|asian\|high | -0.061076 (904) | -0.125148 | 0.040816 | 0.064072 | 0.062777 | 1.0206 |
| CHOPPY\|long\|asian\|low | -0.179476 (491) | -0.097366 | 0.042146 | -0.082110 | 0.076989 | -1.0665 |
| CHOPPY\|long\|asian\|mid | -0.129143 (1676) | -0.125847 | 0.041233 | -0.003296 | 0.054354 | -0.0606 |
| CHOPPY\|long\|london\|high | -0.066245 (648) | -0.123325 | 0.041406 | 0.057080 | 0.069773 | 0.8181 |
| CHOPPY\|long\|london\|low | -0.181490 (200) | -0.096683 | 0.041712 | -0.084807 | 0.110415 | -0.7681 |
| CHOPPY\|long\|london\|mid | -0.171588 (617) | -0.209516 | 0.040083 | 0.037928 | 0.069420 | 0.5464 |
| CHOPPY\|long\|ny\|high | 0.008801 (2069) | 0.011968 | 0.043077 | -0.003167 | 0.053586 | -0.0591 |
| CHOPPY\|long\|ny\|low | -0.030878 (237) | -0.107203 | 0.043489 | 0.076325 | 0.104871 | 0.7278 |
| CHOPPY\|long\|ny\|mid | -0.038180 (1291) | -0.036612 | 0.042808 | -0.001568 | 0.059577 | -0.0263 |
| CHOPPY\|short\|asian\|high | -0.059884 (858) | -0.000510 | 0.041869 | -0.059374 | 0.064330 | -0.9230 |
| CHOPPY\|short\|asian\|low | -0.237684 (447) | -0.242624 | 0.041984 | 0.004940 | 0.082772 | 0.0597 |
| CHOPPY\|short\|asian\|mid | -0.130208 (1696) | -0.180702 | 0.042563 | 0.050494 | 0.054933 | 0.9192 |
| CHOPPY\|short\|london\|high | -0.133915 (647) | -0.063485 | 0.041381 | -0.070430 | 0.069708 | -1.0104 |
| CHOPPY\|short\|london\|low | -0.089995 (200) | -0.171150 | 0.040911 | 0.081155 | 0.119672 | 0.6781 |
| CHOPPY\|short\|london\|mid | -0.008381 (611) | -0.096390 | 0.042965 | 0.088009 | 0.075116 | 1.1716 |
| CHOPPY\|short\|ny\|high | -0.175861 (2116) | -0.181222 | 0.040355 | 0.005361 | 0.050701 | 0.1057 |
| CHOPPY\|short\|ny\|low | -0.189757 (248) | -0.182818 | 0.042615 | -0.006939 | 0.101765 | -0.0682 |
| CHOPPY\|short\|ny\|mid | -0.207810 (1314) | -0.175917 | 0.041642 | -0.031893 | 0.057385 | -0.5558 |
| EFFICIENT\|long\|asian\|high | -0.161865 (972) | -0.161707 | 0.040390 | -0.000158 | 0.060354 | -0.0026 |
| EFFICIENT\|long\|asian\|low | -0.410157 (425) | -0.248139 | 0.039833 | -0.162018 | 0.075589 | -2.1434 |
| EFFICIENT\|long\|asian\|mid | -0.208963 (1518) | -0.213302 | 0.040982 | 0.004339 | 0.054829 | 0.0791 |
| EFFICIENT\|long\|london\|high | -0.071573 (806) | -0.172120 | 0.040522 | 0.100547 | 0.064820 | 1.5512 |
| EFFICIENT\|long\|london\|low | 0.202162 (200) | -0.092617 | 0.041528 | 0.294779 | 0.117999 | 2.4981 |
| EFFICIENT\|long\|london\|mid | -0.081586 (717) | -0.071422 | 0.041148 | -0.010164 | 0.067695 | -0.1502 |
| EFFICIENT\|long\|ny\|high | -0.117474 (2206) | -0.101225 | 0.041409 | -0.016249 | 0.050905 | -0.3192 |
| EFFICIENT\|long\|ny\|low | -0.192397 (200) | -0.140303 | 0.040904 | -0.052094 | 0.114070 | -0.4567 |
| EFFICIENT\|long\|ny\|mid | -0.160699 (1080) | -0.070738 | 0.041273 | -0.089961 | 0.058982 | -1.5252 |
| EFFICIENT\|short\|asian\|high | -0.118089 (927) | -0.084347 | 0.041152 | -0.033742 | 0.062629 | -0.5388 |
| EFFICIENT\|short\|asian\|low | -0.133694 (448) | -0.155107 | 0.041008 | 0.021413 | 0.079699 | 0.2687 |
| EFFICIENT\|short\|asian\|mid | -0.097688 (1565) | -0.199397 | 0.040079 | 0.101709 | 0.054451 | 1.8679 |
| EFFICIENT\|short\|london\|high | -0.049820 (778) | -0.007508 | 0.041867 | -0.042312 | 0.066539 | -0.6359 |
| EFFICIENT\|short\|london\|low | -0.091527 (200) | -0.170422 | 0.040756 | 0.078895 | 0.113436 | 0.6955 |
| EFFICIENT\|short\|london\|mid | -0.097664 (666) | -0.163419 | 0.040829 | 0.065755 | 0.069058 | 0.9522 |
| EFFICIENT\|short\|ny\|high | -0.140451 (2192) | -0.255167 | 0.039063 | 0.114716 | 0.049047 | 2.3389 |
| EFFICIENT\|short\|ny\|low | 0.013547 (200) | -0.143685 | 0.040636 | 0.157232 | 0.119513 | 1.3156 |
| EFFICIENT\|short\|ny\|mid | -0.303771 (1168) | -0.308174 | 0.037894 | 0.004403 | 0.054814 | 0.0803 |

Positive legacy fine-cell means: `EFFICIENT|long|london|low` = +0.202162R; `EFFICIENT|short|ny|low` = +0.013547R; `CHOPPY|long|ny|high` = +0.008801R. These are control means, not strategy returns.

### Report-only year-matched baseline (cell × year)

The fixed seed generated **43,200** random entries: 432/432 cell-years have n=100; 330 used the exact fine key; 102 had fewer than 100 exact fine-cell candidate bars and fell back to side×verdict-state×year; 0 unavailable. Entries are random baseline only, generated with the frozen 1.5×ATR stop, 2R target, costs, 96-bar cap, and within-year DEV eligibility. Fixed seed 40522128.
Fallback cell-years: EFFICIENT|long|asian|low|2004, EFFICIENT|long|asian|high|2004, EFFICIENT|long|london|low|2004, EFFICIENT|long|london|mid|2004, EFFICIENT|long|london|high|2004, EFFICIENT|long|ny|low|2004, EFFICIENT|long|ny|mid|2004, EFFICIENT|short|asian|low|2004, EFFICIENT|short|asian|high|2004, EFFICIENT|short|london|low|2004, EFFICIENT|short|london|mid|2004, EFFICIENT|short|london|high|2004, EFFICIENT|short|ny|low|2004, EFFICIENT|short|ny|mid|2004, EFFICIENT|long|london|low|2005, EFFICIENT|short|london|low|2005, EFFICIENT|long|asian|low|2006, EFFICIENT|long|london|low|2006, EFFICIENT|long|london|mid|2006, EFFICIENT|long|ny|low|2006, EFFICIENT|short|asian|low|2006, EFFICIENT|short|london|low|2006, EFFICIENT|short|london|mid|2006, EFFICIENT|short|ny|low|2006, CHOPPY|long|london|low|2006, CHOPPY|long|ny|low|2006, CHOPPY|short|london|low|2006, CHOPPY|short|ny|low|2006, EFFICIENT|long|london|low|2007, EFFICIENT|long|ny|low|2007, EFFICIENT|short|london|low|2007, EFFICIENT|short|ny|low|2007, CHOPPY|long|london|low|2007, CHOPPY|short|london|low|2007, EFFICIENT|long|asian|low|2009, EFFICIENT|long|london|low|2009, EFFICIENT|long|ny|low|2009, EFFICIENT|short|asian|low|2009, EFFICIENT|short|london|low|2009, EFFICIENT|short|ny|low|2009, CHOPPY|long|london|low|2009, CHOPPY|short|london|low|2009, EFFICIENT|long|asian|low|2010, EFFICIENT|long|london|low|2010, EFFICIENT|long|ny|low|2010, EFFICIENT|short|asian|low|2010, EFFICIENT|short|london|low|2010, EFFICIENT|short|ny|low|2010, CHOPPY|long|london|low|2010, CHOPPY|long|ny|low|2010, CHOPPY|short|london|low|2010, CHOPPY|short|ny|low|2010, EFFICIENT|long|asian|low|2011, EFFICIENT|long|london|low|2011, EFFICIENT|long|ny|low|2011, EFFICIENT|short|asian|low|2011, EFFICIENT|short|london|low|2011, EFFICIENT|short|ny|low|2011, CHOPPY|long|london|low|2011, CHOPPY|long|ny|low|2011, CHOPPY|short|london|low|2011, CHOPPY|short|ny|low|2011, EFFICIENT|long|asian|low|2013, EFFICIENT|long|london|low|2013, EFFICIENT|long|london|mid|2013, EFFICIENT|long|ny|low|2013, EFFICIENT|short|asian|low|2013, EFFICIENT|short|london|low|2013, EFFICIENT|short|london|mid|2013, EFFICIENT|short|ny|low|2013, CHOPPY|long|london|low|2013, CHOPPY|short|london|low|2013, EFFICIENT|long|asian|low|2014, EFFICIENT|long|london|low|2014, EFFICIENT|long|ny|low|2014, EFFICIENT|short|asian|low|2014, EFFICIENT|short|london|low|2014, EFFICIENT|short|ny|low|2014, CHOPPY|long|london|low|2014, CHOPPY|short|london|low|2014, EFFICIENT|long|asian|low|2015, EFFICIENT|long|london|low|2015, EFFICIENT|long|ny|low|2015, EFFICIENT|short|asian|low|2015, EFFICIENT|short|london|low|2015, EFFICIENT|short|ny|low|2015, CHOPPY|long|london|low|2015, CHOPPY|short|london|low|2015, EFFICIENT|long|london|low|2017, EFFICIENT|long|london|high|2017, EFFICIENT|long|ny|low|2017, EFFICIENT|short|london|low|2017, EFFICIENT|short|london|high|2017, EFFICIENT|short|ny|low|2017, EFFICIENT|long|asian|high|2018, EFFICIENT|long|london|low|2018, EFFICIENT|long|ny|low|2018, EFFICIENT|short|asian|high|2018, EFFICIENT|short|london|low|2018, EFFICIENT|short|ny|low|2018, CHOPPY|long|london|low|2018, CHOPPY|short|london|low|2018.

All 36 fine cells × 12 DEV years; each value is that cell-year baseline mean net R (n=100). Exact annual SEs and fallback labels are in `artifacts/map-compass/amendment7/year-matched-baseline.json`.

| Fine cell | 2004 | 2005 | 2006 | 2007 | 2009 | 2010 | 2011 | 2013 | 2014 | 2015 | 2017 | 2018 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| CHOPPY\|long\|asian\|high | -0.2433 | 0.1629 | -0.3720 | -0.1815 | -0.1532 | 0.1385 | 0.1493 | -0.3008 | -0.0992 | -0.3608 | -0.2408 | -0.0008 |
| CHOPPY\|long\|asian\|low | 0.1507 | -0.0572 | -0.5126 | -0.1411 | 0.0058 | -0.0018 | -0.0341 | -0.0542 | 0.0586 | -0.3542 | 0.2158 | -0.4442 |
| CHOPPY\|long\|asian\|mid | -0.0893 | 0.0869 | -0.2183 | -0.0186 | -0.0200 | -0.2004 | -0.2302 | -0.3800 | 0.1000 | -0.0802 | 0.0400 | -0.5000 |
| CHOPPY\|long\|london\|high | -0.1979 | -0.3591 | -0.0020 | -0.1508 | -0.1201 | 0.1499 | -0.1685 | 0.0024 | -0.2401 | -0.1535 | -0.0601 | -0.1801 |
| CHOPPY\|long\|london\|low | 0.5042 | 0.1111 | -0.0465 | -0.0423 | 0.1960 | -0.3485 | -0.4752 | -0.4105 | -0.0601 | -0.2799 | -0.1574 | -0.1511 |
| CHOPPY\|long\|london\|mid | 0.2823 | -0.1163 | -0.3372 | -0.1592 | 0.0519 | -0.3981 | -0.2389 | -0.4581 | -0.1264 | -0.4281 | -0.3381 | -0.2481 |
| CHOPPY\|long\|ny\|high | 0.1483 | 0.0227 | 0.1340 | 0.2137 | 0.0439 | 0.0143 | 0.0216 | -0.1514 | -0.1714 | -0.1240 | -0.0305 | 0.0223 |
| CHOPPY\|long\|ny\|low | 0.2180 | 0.2938 | -0.1564 | -0.5357 | -0.1719 | -0.0258 | -0.0473 | -0.1736 | -0.0841 | -0.1255 | -0.2441 | -0.2341 |
| CHOPPY\|long\|ny\|mid | 0.1101 | 0.0292 | -0.2593 | -0.0346 | 0.1138 | 0.1629 | 0.3456 | -0.1560 | -0.3412 | -0.1219 | -0.3113 | 0.0233 |
| CHOPPY\|short\|asian\|high | -0.0997 | -0.3376 | 0.1773 | 0.0268 | 0.0234 | -0.2108 | 0.0285 | 0.2692 | -0.1508 | 0.0592 | -0.0008 | 0.2092 |
| CHOPPY\|short\|asian\|low | -0.3610 | -0.4641 | -0.0677 | -0.3158 | -0.4460 | -0.5642 | -0.1442 | -0.1742 | -0.2337 | 0.0876 | -0.2042 | -0.0242 |
| CHOPPY\|short\|asian\|mid | -0.3544 | -0.1380 | -0.0238 | -0.4921 | -0.3500 | -0.2300 | -0.5051 | 0.0649 | -0.1700 | 0.1600 | -0.1400 | 0.0100 |
| CHOPPY\|short\|london\|high | -0.0586 | -0.0306 | -0.1241 | 0.2699 | -0.1801 | -0.0901 | -0.2101 | -0.1676 | -0.0504 | 0.2099 | -0.3301 | -0.0001 |
| CHOPPY\|short\|london\|low | -0.5997 | -0.2883 | -0.2107 | -0.0939 | 0.0342 | -0.3261 | -0.0974 | -0.0145 | -0.2920 | 0.1142 | -0.3980 | 0.1183 |
| CHOPPY\|short\|london\|mid | -0.5152 | -0.1650 | 0.1811 | -0.0096 | 0.0219 | -0.0381 | -0.3664 | 0.0772 | -0.0381 | 0.1617 | -0.3381 | -0.1281 |
| CHOPPY\|short\|ny\|high | -0.3231 | -0.2239 | -0.2233 | -0.1051 | -0.3760 | -0.1396 | -0.2088 | -0.2824 | -0.0525 | 0.1671 | -0.2408 | -0.1661 |
| CHOPPY\|short\|ny\|low | -0.2764 | -0.4330 | -0.0858 | 0.2699 | -0.3559 | -0.0432 | -0.1369 | -0.3367 | -0.2268 | -0.2804 | -0.1143 | -0.1743 |
| CHOPPY\|short\|ny\|mid | -0.3895 | -0.0420 | -0.1868 | -0.1244 | -0.4863 | -0.2908 | -0.4441 | -0.1123 | 0.2788 | -0.1924 | -0.0053 | -0.1160 |
| EFFICIENT\|long\|asian\|high | 0.0084 | -0.0629 | 0.0294 | -0.0008 | -0.1208 | -0.0170 | -0.1332 | -0.3200 | -0.2403 | -0.2191 | -0.3924 | -0.4717 |
| EFFICIENT\|long\|asian\|low | -0.1456 | -0.4496 | -0.1633 | -0.4769 | 0.2201 | -0.0691 | -0.1984 | -0.2444 | -0.3742 | -0.3979 | -0.2942 | -0.3842 |
| EFFICIENT\|long\|asian\|mid | -0.2506 | -0.3852 | 0.0713 | -0.2641 | 0.2470 | -0.2380 | 0.0700 | -0.6500 | -0.4100 | -0.0800 | -0.1400 | -0.5300 |
| EFFICIENT\|long\|london\|high | 0.0657 | -0.0102 | -0.0603 | -0.2679 | -0.1801 | -0.1201 | -0.5418 | -0.2256 | -0.2471 | -0.3301 | -0.1781 | 0.0299 |
| EFFICIENT\|long\|london\|low | 0.0261 | -0.1101 | -0.0086 | 0.1227 | 0.0304 | -0.3503 | -0.0964 | -0.3248 | -0.3032 | 0.0525 | 0.0513 | -0.2010 |
| EFFICIENT\|long\|london\|mid | -0.1249 | 0.0443 | -0.2833 | 0.3513 | 0.5019 | -0.3737 | 0.2820 | -0.2624 | -0.3381 | -0.3081 | -0.0981 | -0.2481 |
| EFFICIENT\|long\|ny\|high | 0.1268 | -0.0545 | 0.0746 | 0.0780 | -0.1234 | -0.2404 | -0.1537 | -0.5742 | -0.1520 | 0.0615 | -0.2198 | -0.0378 |
| EFFICIENT\|long\|ny\|low | -0.1866 | 0.1091 | 0.1174 | -0.1140 | 0.1531 | -0.0083 | -0.0845 | -0.5009 | -0.4298 | -0.3536 | -0.3252 | -0.0604 |
| EFFICIENT\|long\|ny\|mid | -0.1461 | 0.0731 | -0.2530 | -0.1249 | -0.2359 | 0.2457 | 0.0407 | -0.1931 | 0.0075 | -0.0830 | 0.0500 | -0.2299 |
| EFFICIENT\|short\|asian\|high | -0.1514 | -0.0871 | -0.2233 | -0.0644 | -0.0914 | -0.1600 | 0.1792 | 0.1070 | -0.3030 | 0.1622 | -0.1462 | -0.2336 |
| EFFICIENT\|short\|asian\|low | -0.1607 | -0.0984 | -0.3898 | -0.4036 | -0.1683 | -0.3168 | -0.0291 | 0.0205 | -0.2186 | -0.1981 | 0.0358 | 0.0658 |
| EFFICIENT\|short\|asian\|mid | 0.1607 | -0.2074 | -0.4862 | -0.5035 | -0.5300 | -0.2600 | -0.3500 | 0.1000 | -0.2900 | -0.1500 | -0.0964 | 0.2200 |
| EFFICIENT\|short\|london\|high | -0.3014 | 0.1499 | 0.0845 | 0.0899 | -0.1034 | 0.0341 | 0.1799 | -0.1141 | 0.0691 | -0.3301 | 0.1515 | -0.0001 |
| EFFICIENT\|short\|london\|low | -0.1608 | -0.1417 | -0.3381 | -0.1035 | -0.2729 | -0.1679 | -0.4322 | 0.0953 | -0.1006 | -0.0216 | -0.3945 | -0.0066 |
| EFFICIENT\|short\|london\|mid | -0.1513 | 0.0742 | -0.3735 | -0.5785 | -0.4069 | 0.1344 | -0.1435 | 0.0930 | 0.2019 | -0.4281 | -0.4948 | 0.1119 |
| EFFICIENT\|short\|ny\|high | -0.4092 | -0.2775 | -0.4959 | -0.3297 | -0.3962 | -0.4575 | -0.2296 | -0.0036 | -0.1649 | -0.2725 | -0.0248 | -0.0006 |
| EFFICIENT\|short\|ny\|low | -0.1820 | -0.2710 | 0.0968 | -0.4128 | -0.2200 | -0.3914 | -0.3045 | 0.3084 | 0.0043 | -0.0168 | -0.1253 | -0.2097 |
| EFFICIENT\|short\|ny\|mid | -0.1906 | -0.4143 | -0.3729 | -0.2824 | -0.1625 | -0.7773 | -0.3917 | -0.2653 | -0.2422 | -0.1459 | -0.4738 | 0.0207 |

**No strategy excess/t is printed**: that would require strategy outcomes, which were prohibited in this amendment. The table above instead prints a control-only calibration delta (legacy matched-control mean minus equal-year mean) and its SE, including sampling error from both random controls. For future strategy verification, year-matched excess is `mean(strategy netR × claim direction) − weighted year-matched baseline mean`; its SE is `sqrt(CR1_SE(strategy excess)^2 + Σ(w_cellYear² × baselineSamplingSE_cellYear²))`. The current code emits `DRIFT_DEPENDENT` when year-matched excess t≤2; that tag does not change the frozen CONFIRMED rule. Compass does not enable a DRIFT_DEPENDENT claim unless independent VAL confirmation passes the frozen gates and year-matched excess t>2.

## 6. Hold-time discrepancy and capacity reconciliation

A4 v1.4 prose stated mean hold 37.9 bars / median 33 / p90 77 / max 96. That statement conflicts with the committed A4 random-baseline artifact at c3e1ba9, which already reports mean 17.532, median 10, p90 40, max 96. This is a documentation/artifact mismatch, not a duration change introduced by A6. The A5 change was a day-cluster-key repair only; it did not change `barsHeld`, `resolveTrade`, the stop, target, costs, or cap. The A6 combined-book sample mean is 17.89671157; the underlying A6 random-entry histogram mean remains 17.532.

| Hold record | Mean | Median | P90 | Max | N (histogram entries/draws) |
|---|---:|---:|---:|---:|---:|
| A4 v1.4 prose (reported, not supported by committed histogram) | 37.900 | 33 | 77 | 96 | not reported |
| A4 committed random-baseline artifact (c3e1ba9) | 17.532 | 10 | 40 | 96 | 32,538 |
| A6 random baseline histogram | 17.532 | 10 | 40 | 96 | 32,538 |
| A6 combined-book sampled holds | 17.89660650 | — | — | 96 cap | 6,925 sampled draws |

A5 exact code change (day-clustering only):

```diff
- const dayKeyOf = (s) => `${s.year}-${String(s.barIndex).slice(-4)}`;
+ const dayKeyOf = (s) => s.day;
+ day: bars[pick.i].datetime.slice(0, 10) // added to each sampled baseline row
```


| Hold bars | Entries | Share |
|---|---:|---:|
| 1–10 | 16,643 | 51.15% |
| 11–20 | 5,859 | 18.01% |
| 21–40 | 6,914 | 21.25% |
| 41–95 | 2,718 | 8.35% |
| 96 (TIME_EXIT cap) | 404 | 1.24% |

A7 slot/capacity emulation uses the unchanged one-slot design and unchanged A6 baseline hold histogram, but the corrected A7 signal streams:

| Raw eligible signal instances | Unique same-bar candidates | Kept one-book positions | Mean sampled hold | Occupied bar-equivalents | DEV bars | Headroom | Utilization | Over DEV bars? |
|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 186,856 | 78,022 | 6,925 | 17.89660650 | 123,934 | 131,922 | 7,988 | 93.94% | **No** |

Occupied bar-equivalents are below the DEV-bar count; no capacity threshold or strategy result is implied. The one-slot emulation is report-only, with baseline-sampled durations.

## 7. Regenerated data pin and map checks

M1 (npm run mc:m1) and M2 (npm run mc:map) completed; raw pins and regenerated normalized outputs were rechecked against scripts/map-compass/pins.json and data-manifest.json: **76/76 raw Git blob SHA-1 pins match; 0 missing, 0 mismatched; normalized hashes 3/3 match data-manifest.json**. The map-validation artifact reports PASS, zero coverage problems, and deterministic output.

## 8. Full-suite results (no strategy verification)

`npm test`: **399 passed, 1 failed** in 77.6 seconds. The sole failure is the unchanged synth UI assertion at `tests/synth.test.mjs:694`: it expects “28/32 market-statistic checks,” while the unchanged `src/pages/MapGenerator.tsx` copy discloses 26/32 and the six failed hours 04:00, 08:00, 09:00, 10:00, 15:00, and 19:00. This UI/test mismatch is unrelated to Map Compass/A7; both files are unchanged from the base commit. Focused A7 tests: 6/6 pass. A6 regression group after its explicitly authorized A7 clock-window exceptions: 8/8 pass. No strategy verification was run.

## 9. Pseudocode for every changed card

```text
asian-range-break:
  on each EAT date, rangeBars = all observed bars with sessionOfEat == asian
                 (Asian clock window 01:00–10:59)
  require rangeBars is nonempty
  for each London bar strictly after Asian window, in chronological order:
    if bar.high > max(rangeBars.high): emit LONG
    else if bar.low < min(rangeBars.low): emit SHORT
  emit signals only; no exit/outcome logic

london-orb-30:
  for each EAT date, rangeBars = observed London bars timestamped [11:00, 11:30)
  require rangeBars is nonempty
  for each London bar timestamped >= 11:30, in chronological order:
    if bar.high > max(rangeBars.high): emit LONG
    else if bar.low < min(rangeBars.low): emit SHORT
  emit signals only; no exit/outcome logic

classic-pivot:
  prev = immediately preceding contiguous EAT trading day's observed OHLC
  PP = (prev.high + prev.low + prev.close) / 3
  S1 = 2*PP - prev.high; R1 = 2*PP - prev.low
  band = 0.25 * ATR14
  if current.low is within S1 ± band and current.close > S1: emit LONG
  else if current.high is within R1 ± band and current.close < R1: emit SHORT
  (priorDayBars=48 remains metadata and is not consumed)

three-soldiers-crows:
  require each of the last 3 candles to have body >= 0.5 * candle range
  if all 3 are bullish and closes strictly rise: emit LONG (soldiers)
  else if all 3 are bearish and closes strictly fall: emit SHORT (crows)
  preserve claim state labels: strength CHOPPY; weakness EFFICIENT
```

## 10. Guardrails and generated files

Claim cards remain DRAFT, `FREEZE.approvedBy`/`approvedAt` remain null, and real `verify-claims` was not run. No `claim-verification.json`, `claimed-trades.jsonl`, or new strategy-result artifact was created. Map, costs, exits, frozen thresholds, and CONFIRMED rule are unchanged. Report-only artifacts: `artifacts/map-compass/amendment7/signal-yearly.json`, `year-matched-baseline.json`, `slot-model.json`, and `pin-verification.json`.

The source timeframe notes do not assert that the source tested XAUUSD, M30, or every exact evaluator. Source status reflects this run's access only. No source URL is inferred beyond those listed in existing card references or opened this run.
