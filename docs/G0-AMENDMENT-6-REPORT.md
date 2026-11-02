# G0 Amendment 6 — owner-approved pre-result changes

**Date:** 2026-11-02. **Freeze:** DRAFT; approver/date remain null. No strategy verification or strategy outcome was run.
**Scope:** only remove the two owner-approved cards; preserve every other card/state/parameter and the surviving relative TEST_ORDER. Priorities are renumbered by deletion only. Map, costs, exits, frozen thresholds and CONFIRMED rule are unchanged.

## 1. Approved deletions and family-overlap change

Removed `dual-thrust` (old priority 3): its prior-day high/low k=0 evaluator was an exact 1.000 Jaccard duplicate of `pdh-pdl-break`, and opened sources did not establish universal textbook defaults. Removed `stochastic-14-fade` (old priority 15): its signal bars exactly duplicated Williams %R (Jaccard 1.000). Each removal deletes the card, its two verdict claim cells, evaluator and parameter entry. No replacement cards are added.

Priorities use original rank minus the number of deleted priorities below it: old 1–2 unchanged; old 4–14 become 3–13; old 16–24 become 14–22. TEST_ORDER preserves v1.2 relative order after deleting those IDs; it is not re-sorted by priority.

| Family | A5 variants / Jaccards / Kish nEff | A6 variants / Jaccards / Kish nEff | Change |
|---|---|---|---|
| channel-breakout | 3; donchian-20/donchian-55 J=0.506796 (12790 shared); donchian-20/dual-thrust J=0.221759 (13516 shared); donchian-55/dual-thrust J=0.238304 (11935 shared); 46497.95 | 2; donchian-20/donchian-55 J=0.506796 (12790 shared); 22734.18 | removed dual-thrust; duplicate pair(s) removed |
| ma-cross | 3; sma-20-50/macd-cross J=0.013229 (169 shared); sma-20-50/ichimoku-tk J=0.014844 (141 shared); macd-cross/ichimoku-tk J=0.029291 (479 shared); 18246.98 | 3; sma-20-50/macd-cross J=0.013229 (169 shared); sma-20-50/ichimoku-tk J=0.014844 (141 shared); macd-cross/ichimoku-tk J=0.029291 (479 shared); 18246.98 | unchanged; surviving signal sets and pairwise Jaccards retained |
| opening-range | 3; asian-range-break/london-orb-30 J=0.159032 (1413 shared); asian-range-break/pdh-pdl-break J=0.034877 (1789 shared); london-orb-30/pdh-pdl-break J=0.056999 (3002 shared); 49258.27 | 3; asian-range-break/london-orb-30 J=0.159032 (1413 shared); asian-range-break/pdh-pdl-break J=0.034877 (1789 shared); london-orb-30/pdh-pdl-break J=0.056999 (3002 shared); 49258.27 | unchanged; surviving signal sets and pairwise Jaccards retained |
| level-retest | 3; pdh-retest/pdl-retest J=0.000000 (0 shared); pdh-retest/classic-pivot J=0.022377 (183 shared); pdl-retest/classic-pivot J=0.019720 (155 shared); 9211.44 | 3; pdh-retest/pdl-retest J=0.000000 (0 shared); pdh-retest/classic-pivot J=0.022377 (183 shared); pdl-retest/classic-pivot J=0.019720 (155 shared); 9211.44 | unchanged; surviving signal sets and pairwise Jaccards retained |
| osc-fade | 3; rsi-14-30-70/williams-r-fade J=0.115649 (2305 shared); rsi-14-30-70/stochastic-14-fade J=0.115649 (2305 shared); williams-r-fade/stochastic-14-fade J=1.000000 (18216 shared); 19004.51 | 2; rsi-14-30-70/williams-r-fade J=0.115649 (2305 shared); 18417.63 | removed stochastic-14-fade; duplicate pair(s) removed |
| band-reversion | 3; bollinger-20-2/keltner-20-atr J=0.300727 (3431 shared); bollinger-20-2/bb-squeeze-fade J=0.336060 (2835 shared); keltner-20-atr/bb-squeeze-fade J=0.214539 (1632 shared); 9333.62 | 3; bollinger-20-2/keltner-20-atr J=0.300727 (3431 shared); bollinger-20-2/bb-squeeze-fade J=0.336060 (2835 shared); keltner-20-atr/bb-squeeze-fade J=0.214539 (1632 shared); 9333.62 | unchanged; surviving signal sets and pairwise Jaccards retained |
| candlestick-reversal | 3; engulfing/morning-evening-star J=0.014114 (216 shared); engulfing/three-soldiers-crows J=0.000000 (0 shared); morning-evening-star/three-soldiers-crows J=0.000000 (0 shared); 17266.3 | 3; engulfing/morning-evening-star J=0.014114 (216 shared); engulfing/three-soldiers-crows J=0.000000 (0 shared); morning-evening-star/three-soldiers-crows J=0.000000 (0 shared); 17266.3 | unchanged; surviving signal sets and pairwise Jaccards retained |
| vol-compression | 3; atr-squeeze-break/nr7-break J=0.004770 (73 shared); atr-squeeze-break/inside-bar-break J=0.005188 (128 shared); nr7-break/inside-bar-break J=0.229152 (7183 shared); 28614.74 | 3; atr-squeeze-break/nr7-break J=0.004770 (73 shared); atr-squeeze-break/inside-bar-break J=0.005188 (128 shared); nr7-break/inside-bar-break J=0.229152 (7183 shared); 28614.74 | unchanged; surviving signal sets and pairwise Jaccards retained |

A5 had 276 total card pairs; the 22-card A6 universe has 231 (45 fewer). Four deleted within-family pairs are removed from the family-overlap calculations. In channel-breakout, Donchian20/55 remains Jaccard 0.506796 (12,790 shared bars); the two Dual Thrust pairs are removed. In osc-fade, RSI/Williams remains Jaccard 0.115649 (2,305 bars); both Stochastic pairs disappear, including Williams/Stochastic Jaccard 1.000. The other six families' pair statistics are unchanged. There is no cross-family pair above .5 in the A6 22-card universe.

## 2. Slots and combined-book reconciliation

**Claim design:** exactly **one slot per card** (22 independent card slots total); one position maximum in each slot, long OR short. Long and short cannot coexist within a card. **Combined Compass/validation:** exactly **one book slot** total; same-bar conflict winner is the lowest renumbered priority, then one position maximum, long OR short. Long and short cannot coexist in that book. This is the declared DRAFT claim design; no verification was run.

After deletion the combined stream contains 165,865 eligible EFFICIENT/CHOPPY signal instances; same-bar priority resolution yields 74,886 unique candidate bars. **“Eligible same-bar candidates 74,886”** means those unique-bar events before dropping candidates that arrive while the combined slot is occupied. The kept combined-book count remains 6,903 because both deleted cards duplicated surviving signal events.

Reconciliation: 6,903 modeled trades × 17.89671157 mean sampled hold = 123,541 modeled occupied bar-units, versus 131,922 DEV bars; headroom 8,381 bars (93.65% utilization). Holds are baseline-histogram samples, not strategy exits/outcomes. The 6,903 count and mean hold are unchanged from A5; deleting duplicate losers changes raw emissions, not the surviving book events.

## 3. Signal frequency by DEV calendar day

Counts are all signal emissions on DEV bars, divided by 3137 actual EAT calendar dates containing DEV bars; zero-signal dates are included in the mean. Busiest is the top five by count. Quietest is the five lowest nonzero dates (ties ordered by date); zero-signal dates are reported separately. Signals only; no outcomes.

| Priority | Card | Signals/DEV day | DEV signals | Zero days | Five busiest date:count | Five quietest active date:count |
|--:|---|--:|--:|--:|---|---|
| 1 | donchian-20 | 8.04495 | 25237 | 175 | 2006-06-13:25, 2011-11-07:22, 2017-07-03:22, 2011-05-11:21, 2018-11-01:21 | 2004-06-25:1, 2004-11-26:1, 2005-02-04:1, 2005-09-06:1, 2006-12-21:1 |
| 2 | donchian-55 | 4.07714 | 12790 | 549 | 2011-11-07:21, 2017-07-03:21, 2009-07-20:20, 2006-06-13:19, 2009-11-25:19 | 2004-07-06:1, 2004-07-14:1, 2004-07-19:1, 2004-07-22:1, 2004-07-28:1 |
| 3 | sma-20-50 | 0.9168 | 2876 | 1057 | 2004-07-16:7, 2017-11-29:7, 2004-08-26:6, 2010-04-29:6, 2005-08-03:5 | 2004-06-14:1, 2004-06-16:1, 2004-06-17:1, 2004-06-23:1, 2004-06-24:1 |
| 4 | macd-cross | 3.20944 | 10068 | 195 | 2005-06-10:12, 2011-06-21:12, 2013-03-15:11, 2014-07-29:10, 2004-09-17:9 | 2004-06-14:1, 2004-06-16:1, 2004-06-30:1, 2004-07-06:1, 2004-07-27:1 |
| 5 | ichimoku-tk | 2.1562 | 6764 | 344 | 2014-02-28:10, 2011-11-09:9, 2014-01-22:8, 2005-07-08:7, 2006-10-06:7 | 2004-06-16:1, 2004-06-17:1, 2004-07-06:1, 2004-07-07:1, 2004-07-13:1 |
| 20 | atr-squeeze-break | 0.26267 | 824 | 2610 | 2010-10-25:8, 2005-08-15:5, 2009-06-26:5, 2009-09-22:5, 2004-09-28:4 | 2004-07-20:1, 2004-07-21:1, 2004-07-27:1, 2004-07-29:1, 2004-07-30:1 |
| 21 | nr7-break | 4.63915 | 14553 | 164 | 2007-08-07:12, 2004-09-15:11, 2005-06-21:11, 2005-10-11:11, 2007-04-06:11 | 2004-10-08:1, 2004-12-03:1, 2004-12-11:1, 2005-07-04:1, 2005-11-30:1 |
| 22 | inside-bar-break | 7.64297 | 23976 | 123 | 2004-09-08:16, 2005-08-23:16, 2004-08-11:15, 2004-09-09:15, 2004-11-16:15 | 2005-01-17:1, 2005-02-12:1, 2005-03-05:1, 2005-11-30:1, 2006-07-05:1 |
| 6 | asian-range-break | 1.2292 | 3856 | 2396 | 2011-05-24:10, 2011-05-26:10, 2011-08-16:10, 2011-08-25:10, 2011-09-09:10 | 2011-05-13:1, 2011-05-18:1, 2011-05-27:1, 2011-05-31:1, 2011-06-14:1 |
| 7 | london-orb-30 | 2.05355 | 6442 | 691 | 2004-06-14:4, 2004-06-15:4, 2004-06-16:4, 2004-06-25:4, 2004-07-12:4 | 2004-06-11:1, 2004-06-23:1, 2004-07-13:1, 2004-07-15:1, 2004-07-21:1 |
| 8 | pdh-pdl-break | 15.6927 | 49228 | 636 | 2011-07-18:46, 2011-07-25:46, 2011-08-08:46, 2011-08-09:46, 2013-04-01:46 | 2004-08-10:1, 2004-08-30:1, 2004-09-16:1, 2004-12-07:1, 2005-01-28:1 |
| 14 | bollinger-20-2 | 2.68919 | 8436 | 207 | 2006-10-20:7, 2007-10-26:7, 2011-01-18:7, 2017-09-18:7, 2018-04-02:7 | 2004-06-25:1, 2004-07-06:1, 2004-07-07:1, 2004-07-09:1, 2004-08-06:1 |
| 15 | keltner-20-atr | 2.04144 | 6404 | 469 | 2006-06-22:8, 2007-06-01:8, 2004-12-02:7, 2009-01-16:7, 2009-06-01:7 | 2004-06-23:1, 2004-06-25:1, 2004-07-06:1, 2004-07-07:1, 2004-07-08:1 |
| 16 | bb-squeeze-fade | 0.90373 | 2835 | 1359 | 2011-09-16:6, 2004-07-13:5, 2006-05-17:5, 2006-08-09:5, 2007-10-26:5 | 2004-06-21:1, 2004-06-22:1, 2004-06-23:1, 2004-07-02:1, 2004-07-06:1 |
| 9 | pdh-retest | 0.58304 | 1829 | 2270 | 2014-10-09:9, 2017-06-05:8, 2006-08-02:7, 2009-12-21:7, 2005-07-07:6 | 2004-06-15:1, 2004-06-16:1, 2004-07-08:1, 2004-07-27:1, 2004-08-02:1 |
| 10 | pdl-retest | 0.47274 | 1483 | 2418 | 2014-11-17:8, 2005-01-24:7, 2006-11-17:7, 2011-12-19:7, 2017-01-27:7 | 2004-06-14:1, 2004-06-28:1, 2004-06-29:1, 2004-07-06:1, 2004-07-13:1 |
| 11 | classic-pivot | 2.08224 | 6532 | 1308 | 2005-01-24:25, 2010-02-08:21, 2005-05-17:20, 2018-01-08:19, 2006-12-04:17 | 2004-06-14:1, 2004-06-24:1, 2004-07-06:1, 2004-07-07:1, 2004-07-13:1 |
| 12 | rsi-14-30-70 | 1.28148 | 4020 | 1041 | 2005-02-22:7, 2006-03-27:7, 2006-06-30:7, 2013-04-15:7, 2018-08-15:7 | 2004-06-14:1, 2004-06-17:1, 2004-06-18:1, 2004-06-21:1, 2004-06-23:1 |
| 13 | williams-r-fade | 5.80682 | 18216 | 154 | 2004-06-15:13, 2009-06-19:12, 2011-07-01:12, 2017-10-11:12, 2018-04-10:12 | 2004-06-11:1, 2005-01-17:1, 2005-01-22:1, 2005-03-05:1, 2005-07-04:1 |
| 17 | engulfing | 0.66018 | 2071 | 1671 | 2018-10-22:6, 2015-12-17:5, 2017-02-01:5, 2004-07-01:4, 2004-07-30:4 | 2004-06-15:1, 2004-06-17:1, 2004-06-18:1, 2004-06-22:1, 2004-06-23:1 |
| 18 | morning-evening-star | 4.28722 | 13449 | 219 | 2009-11-30:15, 2014-05-28:14, 2009-02-17:13, 2015-05-07:13, 2018-01-18:13 | 2004-06-17:1, 2004-06-18:1, 2004-06-21:1, 2004-07-01:1, 2004-07-07:1 |
| 19 | three-soldiers-crows | 0.69111 | 2168 | 1769 | 2006-09-07:8, 2005-09-19:6, 2006-02-09:6, 2006-04-20:6, 2006-09-06:6 | 2004-06-18:1, 2004-06-23:1, 2004-06-24:1, 2004-06-28:1, 2004-07-14:1 |

## 4. Current 22-card table — exact parameters and study registry

All rows remain DRAFT. `PRACTITIONER_ONLY` is the exact source-registry status, not an invented URL.

| TEST_ORDER | ID | Family | Strength | Weakness | Parameters (exact registry) | Study URL / status | Priority |
|--:|---|---|---|---|---|---|--:|
| 1 | donchian-20 | channel-breakout | EFFICIENT | CHOPPY | lookback=20, breakAt=prior-high/low, entryAt=close | http://technicalanalysis.org.uk/support-and-resistance/BrockLakonishokLeBaron1992.pdf | 1 |
| 2 | donchian-55 | channel-breakout | EFFICIENT | CHOPPY | lookback=55, breakAt=prior-high/low, entryAt=close | http://technicalanalysis.org.uk/support-and-resistance/BrockLakonishokLeBaron1992.pdf | 2 |
| 3 | sma-20-50 | ma-cross | EFFICIENT | CHOPPY | fast=20, slow=50, entryAt=close | https://ideas.repec.org/a/taf/apeclt/v15y2008i14p1111-1114.html | 3 |
| 4 | macd-cross | ma-cross | EFFICIENT | CHOPPY | fast=12, slow=26, signal=9, entryAt=close | https://ideas.repec.org/a/taf/apeclt/v15y2008i14p1111-1114.html | 4 |
| 5 | ichimoku-tk | ma-cross | EFFICIENT | CHOPPY | tenkan=9, kijun=26, entryAt=close | https://ideas.repec.org/a/taf/apeclt/v15y2008i14p1111-1114.html | 5 |
| 6 | atr-squeeze-break | vol-compression | CHOPPY | EFFICIENT | atrPeriod=14, squeezeFactor=0.8, lookback=50, breakRel=0.5 | PRACTITIONER_ONLY | 20 |
| 7 | nr7-break | vol-compression | CHOPPY | EFFICIENT | lookback=7, breakRel=0.25 | PRACTITIONER_ONLY | 21 |
| 8 | inside-bar-break | vol-compression | CHOPPY | EFFICIENT | lookback=1 | PRACTITIONER_ONLY | 22 |
| 9 | asian-range-break | opening-range | EFFICIENT | CHOPPY | rangeSession=asian, rangeBars=20, entrySession=london, entryAt=close | http://www.econ.umu.se/ueslpnr/ues845.pdf | 6 |
| 10 | london-orb-30 | opening-range | EFFICIENT | CHOPPY | rangeBars=6, entrySession=london, entryAt=close | http://www.econ.umu.se/ueslpnr/ues845.pdf | 7 |
| 11 | pdh-pdl-break | opening-range | EFFICIENT | CHOPPY | priorDayBars=48, entryAt=close | http://www.econ.umu.se/ueslpnr/ues845.pdf | 8 |
| 12 | bollinger-20-2 | band-reversion | CHOPPY | EFFICIENT | period=20, numerStd=2 | https://www.researchgate.net/publication/46527151_Investment_information_content_in_Bollinger_Bands | 14 |
| 13 | keltner-20-atr | band-reversion | CHOPPY | EFFICIENT | period=20, atrPeriod=20, atrMultiple=2 | https://www.researchgate.net/publication/46527151_Investment_information_content_in_Bollinger_Bands | 15 |
| 14 | bb-squeeze-fade | band-reversion | CHOPPY | EFFICIENT | period=20, numerStd=2, squeezeFactor=0.9 | https://www.researchgate.net/publication/46527151_Investment_information_content_in_Bollinger_Bands | 16 |
| 15 | pdh-retest | level-retest | EFFICIENT | CHOPPY | priorDayBars=48, touchRel=0.25, side=long | https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf | 9 |
| 16 | pdl-retest | level-retest | EFFICIENT | CHOPPY | priorDayBars=48, touchRel=0.25, side=short | https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf | 10 |
| 17 | classic-pivot | level-retest | EFFICIENT | CHOPPY | priorDayBars=48, touchRel=0.25, levels=PP,S1,R1 | https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf | 11 |
| 18 | rsi-14-30-70 | osc-fade | CHOPPY | EFFICIENT | period=14, oversold=30, overbought=70 | https://mpra.ub.uni-muenchen.de/54149/1/MPRA_paper_54149.pdf | 12 |
| 19 | williams-r-fade | osc-fade | CHOPPY | EFFICIENT | period=14, oversold=-80, overbought=-20 | https://mpra.ub.uni-muenchen.de/54149/1/MPRA_paper_54149.pdf | 13 |
| 20 | engulfing | candlestick-reversal | CHOPPY | EFFICIENT | bodyRatio=0.6 | https://scispace.com/pdf/candlestick-technical-trading-strategies-can-they-create-2whgphf6vm.pdf | 17 |
| 21 | morning-evening-star | candlestick-reversal | CHOPPY | EFFICIENT | bodyRatio=0.4 | https://scispace.com/pdf/candlestick-technical-trading-strategies-can-they-create-2whgphf6vm.pdf | 18 |
| 22 | three-soldiers-crows | candlestick-reversal | CHOPPY | EFFICIENT | bodyRatio=0.5 | https://scispace.com/pdf/candlestick-technical-trading-strategies-can-they-create-2whgphf6vm.pdf | 19 |

Full pseudo-code for every row is printed in `docs/CLAIM-SIGNAL-SPECIFICATIONS.md`. Rail/open clarification: there is no surviving Dual Thrust card. `pdh-pdl-break` measures its two rails from the previous EAT trading day's observed high and low; **neither rail is measured from that day's open**. Its stored `priorDayBars=48` is metadata only and is not consumed by the evaluator.

## 5. Family × verdict report-only power

Each power curve's unit is one verdict for one family × verdict-state cell (16 cells total). Edges are 0.00R, 0.05R, 0.10R, 0.15R, 0.20R, 0.30R. Counts sum surviving card-specific one-slot records; Kish nEff is measured over duplicated kept entry bars within each family/state. The SE uses session-mix-weighted matched random-baseline SD and measured calendar-day CR1 inflation: EFFICIENT 1.3222, CHOPPY 1.1202.

| Family | Verdict | n | Kish nEff | SD R | CR1 | Power 0.00 | .05 | .10 | .15 | .20 | .30 | Diagnostic at .20 |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|
| channel-breakout | EFFICIENT | 1398 | 1097.98 | 1.42298 | 1.3222 | 0.0157 | 0.1205 | 0.3943 | 0.7431 | 0.9388 | 0.9991 | — |
| channel-breakout | CHOPPY | 6771 | 5404.51 | 1.44844 | 1.1202 | 0 | 0.0118 | 0.4942 | 0.9901 | 1 | 1 | — |
| ma-cross | EFFICIENT | 1196 | 1188.05 | 1.42087 | 1.3222 | 0.0147 | 0.1241 | 0.4211 | 0.768 | 0.9554 | 0.9998 | — |
| ma-cross | CHOPPY | 7909 | 7583.01 | 1.44773 | 1.1202 | 0 | 0.0044 | 0.4931 | 0.9956 | 1 | 1 | — |
| opening-range | EFFICIENT | 1726 | 1569.59 | 1.42979 | 1.3222 | 0.013 | 0.1317 | 0.494 | 0.8452 | 0.9819 | 0.9999 | — |
| opening-range | CHOPPY | 5928 | 5303.53 | 1.45243 | 1.1202 | 0 | 0.0133 | 0.5033 | 0.9858 | 1 | 1 | — |
| level-retest | EFFICIENT | 684 | 670.28 | 1.42336 | 1.3222 | 0.0128 | 0.067 | 0.2313 | 0.4906 | 0.7571 | 0.984 | — |
| level-retest | CHOPPY | 2807 | 2695.6 | 1.44818 | 1.1202 | 0.0001 | 0.0531 | 0.4992 | 0.9448 | 0.9993 | 1 | — |
| osc-fade | EFFICIENT | 2126 | 1734.41 | 1.42174 | 1.3222 | 0.011 | 0.1284 | 0.4959 | 0.8674 | 0.986 | 1 | — |
| osc-fade | CHOPPY | 4886 | 4535.14 | 1.4478 | 1.1202 | 0 | 0.0156 | 0.4994 | 0.9804 | 1 | 1 | — |
| band-reversion | EFFICIENT | 1324 | 865.24 | 1.42485 | 1.3222 | 0.0173 | 0.0954 | 0.3274 | 0.6316 | 0.8703 | 0.9968 | — |
| band-reversion | CHOPPY | 6632 | 4209.75 | 1.44903 | 1.1202 | 0 | 0.0212 | 0.4906 | 0.977 | 0.9999 | 1 | — |
| candlestick-reversal | EFFICIENT | 1290 | 1280.08 | 1.42103 | 1.3222 | 0.0169 | 0.1434 | 0.4526 | 0.7938 | 0.9616 | 0.9999 | — |
| candlestick-reversal | CHOPPY | 5533 | 5436.71 | 1.44756 | 1.1202 | 0 | 0.0123 | 0.5006 | 0.9877 | 1 | 1 | — |
| vol-compression | EFFICIENT | 2289 | 1963.1 | 1.41935 | 1.3222 | 0.0076 | 0.1193 | 0.4873 | 0.8817 | 0.9918 | 1 | — |
| vol-compression | CHOPPY | 8808 | 7670.64 | 1.44747 | 1.1202 | 0 | 0.003 | 0.5078 | 0.9959 | 1 | 1 | — |

**THIN-POWER at +0.20R:** none; all 16 cells are at least 0.50. Diagnostic only; no criterion change.

### Veto failure shares at true +0.20R

Marginal Monte Carlo failure shares (not exclusive; a run can fail multiple gates):

| Family | Verdict | Net floor | tNet | Excess floor | tExcess | Concentration | LOYO | Min n | NO_BASELINE |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|
| channel-breakout | EFFICIENT | 0.0373 | 0.0609 | 0 | 0 | 0 | 0.0003 | 0 | 0 |
| channel-breakout | CHOPPY | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ma-cross | EFFICIENT | 0.0328 | 0.0439 | 0 | 0 | 0 | 0.0007 | 0 | 0 |
| ma-cross | CHOPPY | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| opening-range | EFFICIENT | 0.0177 | 0.0136 | 0 | 0 | 0 | 0.0004 | 0 | 0 |
| opening-range | CHOPPY | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| level-retest | EFFICIENT | 0.0865 | 0.2281 | 0 | 0.0037 | 0 | 0.0194 | 0 | 0 |
| level-retest | CHOPPY | 0.0007 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| osc-fade | EFFICIENT | 0.014 | 0.0075 | 0 | 0 | 0 | 0 | 0 | 0 |
| osc-fade | CHOPPY | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| band-reversion | EFFICIENT | 0.0592 | 0.1295 | 0 | 0.0005 | 0 | 0.0002 | 0 | 0 |
| band-reversion | CHOPPY | 0.0001 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| candlestick-reversal | EFFICIENT | 0.0302 | 0.0381 | 0 | 0 | 0 | 0.0003 | 0 | 0 |
| candlestick-reversal | CHOPPY | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| vol-compression | EFFICIENT | 0.0082 | 0.0024 | 0 | 0 | 0 | 0 | 0 | 0 |
| vol-compression | CHOPPY | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

### Analytic net-gate cross-check: analytic / Monte Carlo

For every family-cell/edge, `P(meanNet > .10 AND tNet > 2) = Φ((edge−max(.10,2·SE))/SE)` is compared with Monte Carlo using the same cell SE. This is the net gate only, not full-conjunction power.

| Family | Verdict | 0.00 | 0.05 | 0.10 | 0.15 | 0.20 | 0.30 |
|---|---|---:|---:|---:|---:|---:|---:|
| channel-breakout | EFFICIENT | 0.0227/0.0217 | 0.1315/0.1306 | 0.4056/0.4009 | 0.7395/0.7453 | 0.9360/0.9391 | 0.9995/0.9991 |
| channel-breakout | CHOPPY | 0.0000/0.0000 | 0.0117/0.0118 | 0.5000/0.4942 | 0.9883/0.9901 | 1.0000/1.0000 | 1.0000/1.0000 |
| ma-cross | EFFICIENT | 0.0227/0.0208 | 0.1395/0.1396 | 0.4344/0.4330 | 0.7740/0.7727 | 0.9525/0.9561 | 0.9998/0.9998 |
| ma-cross | CHOPPY | 0.0000/0.0000 | 0.0036/0.0044 | 0.5000/0.4931 | 0.9964/0.9956 | 1.0000/1.0000 | 1.0000/1.0000 |
| opening-range | EFFICIENT | 0.0181/0.0198 | 0.1474/0.1479 | 0.5000/0.5044 | 0.8526/0.8483 | 0.9819/0.9823 | 1.0000/0.9999 |
| opening-range | CHOPPY | 0.0000/0.0000 | 0.0126/0.0133 | 0.5000/0.5033 | 0.9874/0.9858 | 1.0000/1.0000 | 1.0000/1.0000 |
| level-retest | EFFICIENT | 0.0227/0.0216 | 0.0947/0.0942 | 0.2662/0.2685 | 0.5253/0.5210 | 0.7738/0.7719 | 0.9833/0.9853 |
| level-retest | CHOPPY | 0.0007/0.0003 | 0.0548/0.0532 | 0.5000/0.4994 | 0.9452/0.9448 | 0.9993/0.9993 | 1.0000/1.0000 |
| osc-fade | EFFICIENT | 0.0134/0.0124 | 0.1340/0.1315 | 0.5000/0.4965 | 0.8660/0.8674 | 0.9866/0.9860 | 1.0000/1.0000 |
| osc-fade | CHOPPY | 0.0000/0.0000 | 0.0189/0.0156 | 0.5000/0.4994 | 0.9811/0.9804 | 1.0000/1.0000 | 1.0000/1.0000 |
| band-reversion | EFFICIENT | 0.0227/0.0255 | 0.1114/0.1091 | 0.3305/0.3360 | 0.6338/0.6344 | 0.8692/0.8705 | 0.9964/0.9968 |
| band-reversion | CHOPPY | 0.0000/0.0000 | 0.0228/0.0212 | 0.5000/0.4906 | 0.9772/0.9770 | 1.0000/0.9999 | 1.0000/1.0000 |
| candlestick-reversal | EFFICIENT | 0.0227/0.0231 | 0.1474/0.1562 | 0.4618/0.4645 | 0.8041/0.7985 | 0.9647/0.9619 | 0.9999/0.9999 |
| candlestick-reversal | CHOPPY | 0.0000/0.0000 | 0.0115/0.0123 | 0.5000/0.5006 | 0.9885/0.9877 | 1.0000/1.0000 | 1.0000/1.0000 |
| vol-compression | EFFICIENT | 0.0091/0.0089 | 0.1189/0.1212 | 0.5000/0.4880 | 0.8811/0.8818 | 0.9909/0.9918 | 1.0000/1.0000 |
| vol-compression | CHOPPY | 0.0000/0.0000 | 0.0035/0.0030 | 0.5000/0.5078 | 0.9965/0.9959 | 1.0000/1.0000 | 1.0000/1.0000 |

Marginal veto shares for all six edges, exclusive first-failure attribution, annual survivor counts, exact day counts and edge-by-edge analytic deltas are recorded in `artifacts/map-compass/power-curve.json` and `artifacts/map-compass/slot-model.json`.

## 6. Guardrails

The A5 “eligible same-bar candidates” count remains 74,886, now explicitly defined as unique bar candidates before occupied-slot drops. FREEZE.status=DRAFT; approvedBy and approvedAt remain null. verify-claims stays blocked. No claim-verification.json or claimed-trades.jsonl was created. The frozen +0.10R floor, t>2 requirements, excess rule, vetoes, Map, costs and exit are unchanged. Cards are not frozen.
