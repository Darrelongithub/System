# G0 Amendment 5 — pre-result reconciliation report

**Date:** 2026-10-28. **Cards:** DRAFT (approval null); **real verification:** blocked; report-only changes only.
**No change:** Map, state assignments, priorities, registered parameters, cost model, exit harness, thresholds or CONFIRMED conjunction. Full pseudocode for all cards: CLAIM-SIGNAL-SPECIFICATIONS.md.

## 1. Slot reconciliation and survivors

The v1.4 statement “7,401 kept × 37.9 mean held bars” would require 280,297 occupied bars, exceeding the 131,922 DEV bars by 2.13×. It cannot describe one non-overlapping slot. Amendment 5 separates two units: (a) per-card validation uses one independent slot per card; (b) a combined Compass book is one slot total and resolves same-bar conflicts by the frozen lowest numeric priority. This architecture is recommended, not owner-approved.

Of 291501 DEV signal emissions, 215099 have a recognized EFFICIENT/CHOPPY verdict state and enter claim-slot counts; 76402 outside-state signals are excluded. The corrected baseline-hold sample mean is 17.532 bars. The priority-resolved combined-book illustration keeps 6903 of 74886 same-bar candidates after 215099 raw card-signal instances, with simulated mean hold 17.897 bars. It is a capacity illustration only, not the per-card validation denominator.

| # | Card | Family | Priority | Strength / weakness state | Session | Parameters (registered, unchanged) | Raw eligible | Kept | EFFICIENT | CHOPPY |
|--:|---|---|--:|---|---|---|--:|--:|--:|--:|
| 1 | donchian-20 | channel-breakout | 1 | EFFICIENT / CHOPPY | all | lookback=20, breakAt=prior-high/low, entryAt=close | 18611 | 4959 | 702 | 4257 |
| 2 | donchian-55 | channel-breakout | 2 | EFFICIENT / CHOPPY | all | lookback=55, breakAt=prior-high/low, entryAt=close | 9023 | 3210 | 696 | 2514 |
| 3 | dual-thrust | channel-breakout | 3 | EFFICIENT / CHOPPY | all | priorDayBars=48, k=0 | 35218 | 4599 | 1147 | 3452 |
| 4 | sma-20-50 | ma-cross | 4 | EFFICIENT / CHOPPY | all | fast=20, slow=50, entryAt=close | 2124 | 1725 | 255 | 1470 |
| 5 | macd-cross | ma-cross | 5 | EFFICIENT / CHOPPY | all | fast=12, slow=26, signal=9, entryAt=close | 7656 | 4044 | 852 | 3192 |
| 6 | ichimoku-tk | ma-cross | 6 | EFFICIENT / CHOPPY | all | tenkan=9, kijun=26, entryAt=close | 5529 | 3336 | 89 | 3247 |
| 7 | atr-squeeze-break | vol-compression | 22 | CHOPPY / EFFICIENT | all | atrPeriod=14, squeezeFactor=0.8, lookback=50, breakRel=0.5 | 682 | 498 | 108 | 390 |
| 8 | nr7-break | vol-compression | 23 | CHOPPY / EFFICIENT | all | lookback=7, breakRel=0.25 | 11177 | 4888 | 974 | 3914 |
| 9 | inside-bar-break | vol-compression | 24 | CHOPPY / EFFICIENT | all | lookback=1 | 18385 | 5711 | 1207 | 4504 |
| 10 | asian-range-break | opening-range | 7 | EFFICIENT / CHOPPY | london | rangeSession=asian, rangeBars=20, entrySession=london, entryAt=close | 2802 | 824 | 163 | 661 |
| 11 | london-orb-30 | opening-range | 8 | EFFICIENT / CHOPPY | london | rangeBars=6, entrySession=london, entryAt=close | 4771 | 2225 | 390 | 1835 |
| 12 | pdh-pdl-break | opening-range | 9 | EFFICIENT / CHOPPY | all | priorDayBars=48, entryAt=close | 35218 | 4605 | 1173 | 3432 |
| 13 | bollinger-20-2 | band-reversion | 16 | CHOPPY / EFFICIENT | all | period=20, numerStd=2 | 6287 | 3679 | 436 | 3243 |
| 14 | keltner-20-atr | band-reversion | 17 | CHOPPY / EFFICIENT | all | period=20, atrPeriod=20, atrMultiple=2 | 4418 | 2790 | 540 | 2250 |
| 15 | bb-squeeze-fade | band-reversion | 18 | CHOPPY / EFFICIENT | all | period=20, numerStd=2, squeezeFactor=0.9 | 1903 | 1487 | 348 | 1139 |
| 16 | pdh-retest | level-retest | 10 | EFFICIENT / CHOPPY | all | priorDayBars=48, touchRel=0.25, side=long | 1323 | 823 | 181 | 642 |
| 17 | pdl-retest | level-retest | 11 | EFFICIENT / CHOPPY | all | priorDayBars=48, touchRel=0.25, side=short | 1052 | 683 | 151 | 532 |
| 18 | classic-pivot | level-retest | 12 | EFFICIENT / CHOPPY | all | priorDayBars=48, touchRel=0.25, levels=PP,S1,R1 | 4695 | 1985 | 352 | 1633 |
| 19 | rsi-14-30-70 | osc-fade | 13 | CHOPPY / EFFICIENT | all | period=14, oversold=30, overbought=70 | 2557 | 1827 | 1025 | 802 |
| 20 | williams-r-fade | osc-fade | 14 | CHOPPY / EFFICIENT | all | period=14, oversold=-80, overbought=-20 | 14016 | 5185 | 1101 | 4084 |
| 21 | stochastic-14-fade | osc-fade | 15 | CHOPPY / EFFICIENT | all | period=14, kSmooth=1, dSmooth=3, low=20, high=80 | 14016 | 5236 | 1103 | 4133 |
| 22 | engulfing | candlestick-reversal | 19 | CHOPPY / EFFICIENT | all | bodyRatio=0.6 | 1604 | 1277 | 231 | 1046 |
| 23 | morning-evening-star | candlestick-reversal | 20 | CHOPPY / EFFICIENT | all | bodyRatio=0.4 | 10311 | 4279 | 826 | 3453 |
| 24 | three-soldiers-crows | candlestick-reversal | 21 | CHOPPY / EFFICIENT | all | bodyRatio=0.5 | 1721 | 1267 | 233 | 1034 |

### Family survivor totals (sum of three independent card slots)

| Family | Raw signal instances | Kept | EFFICIENT kept | CHOPPY kept |
|---|--:|--:|--:|--:|
| channel-breakout | 62852 | 12768 | 2545 | 10223 |
| ma-cross | 15309 | 9105 | 1196 | 7909 |
| opening-range | 42791 | 7654 | 1726 | 5928 |
| level-retest | 7070 | 3491 | 684 | 2807 |
| osc-fade | 30589 | 12248 | 3229 | 9019 |
| band-reversion | 12608 | 7956 | 1324 | 6632 |
| candlestick-reversal | 13636 | 6823 | 1290 | 5533 |
| vol-compression | 30244 | 11097 | 2289 | 8808 |

### Harness defect / enforcement boundary

The current real harness is a consumer of supplied trade records. runBattery groups variants by family×verdict state; it does not apply a card-level slot or frozen priorities. No M6 signal-to-trade producer exists, so whether another card blocks an individual card is not presently enforced or observed. M6 must provide per-card slot-constrained trades for claims and a separate priority-resolved one-slot book for Compass. The previous single global 7,401 denominator was a conceptual mix-up, not an executed harness result.

## 2. Repaired report-only power curve

Counts are card-slot survivors by their actual Map session and verdict state; no equal-third split. Per-state pooled n is exactly the sum of session n. Entries sharing a bar across cards are Kish-adjusted; measured baseline CR1 inflation is 1.3222 EFFICIENT and 1.1202 CHOPPY after correcting day keys to actual EAT calendar dates. Baseline day clusters are 2026 EFFICIENT and 2913 CHOPPY.

| Verdict state | Session | n | n-effective | true 0R | .05R | .10R | .15R | .20R | .30R |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|
| EFFICIENT | asian | 5138 | 2356.64 | 0.0052 | 0.0931 | 0.4923 | 0.9048 | 0.9953 | 1 |
| EFFICIENT | london | 3887 | 1674.84 | 0.0079 | 0.1243 | 0.4974 | 0.8551 | 0.9838 | 1 |
| EFFICIENT | ny | 5258 | 2668.59 | 0.0023 | 0.0773 | 0.4979 | 0.9161 | 0.9973 | 1 |
| EFFICIENT | POOLED | 14283 | 6670.51 | 0 | 0.0156 | 0.5006 | 0.9857 | 1 | 1 |
| CHOPPY | asian | 22266 | 9934.97 | 0 | 0.0006 | 0.4921 | 0.9994 | 1 | 1 |
| CHOPPY | london | 16535 | 6353.7 | 0 | 0.0049 | 0.5032 | 0.9921 | 1 | 1 |
| CHOPPY | ny | 18058 | 7942.6 | 0 | 0.0036 | 0.5021 | 0.9965 | 1 | 1 |
| CHOPPY | POOLED | 56859 | 24128.44 | 0 | 0 | 0.5032 | 1 | 1 | 1 |

At each cell/edge, power-curve.json records Monte Carlo failure shares for net floor, net t, excess floor, excess t, concentration, LOYO, min n and NO_BASELINE, plus exclusive first-failure attribution and analytic net-gate cross-check. Curves are monotone in edge. Pooled n equals the sum of session n. The requested pooled-power ≥ every session relation holds for .10R, .15R, .20R and .30R in the recorded simulation but cannot hold for all edges: with the frozen +.10R floor, at true μ<.10R the probability of a noisy false crossing tends to zero as n grows, whereas smaller sessions retain a positive crossing probability. The report flags rather than falsifies this mathematical conflict; thresholds are untouched.

At .05R the pooled full-conjunction probabilities are lower than the strongest session: EFFICIENT pooled 0.0156 vs max session 0.1243; CHOPPY pooled 0 vs max 0.0049. At .10R pooled probabilities are 0.5006 and 0.5032; at .15R they are 0.9857 and 1. These are parametric report-only estimates, not strategy results.

### Why v1.4's pooled .33 at .05R was impossible

With n≈6,170, SD≈1.42 and SE≈.02, a true mean of .05R is 2.5 SE below the frozen +.10R floor; a ~33% chance of meeting that net-mean component is arithmetically incompatible with the normal approximation. The v1.4 simulation generated net and excess samples independently and misattributed pooled counts; Amendment 5 uses one common draw for net/excess, correct measured counts, and reports the analytic probability P(mean>.10 and t>2)=Φ((μ−max(.10,2SE))/SE). The Monte Carlo net-gate estimates are cross-checked against that formula.

## 3. DRAFT cleanup and overlap

| Pair | Families | DEV entry-bar Jaccard | shared bars | Treatment |
|---|---|--:|--:|---|
| dual-thrust / pdh-pdl-break | channel-breakout / opening-range | 1.000 | 49228 | DRAFT proposal only; not merged/dropped |

Exact cleanup proposals are recorded in CLAIM-SIGNAL-SPECIFICATIONS.md: (1) current Dual Thrust k=0 signal is identical to PDH/PDL break (Jaccard 1.000); propose drop/merge or re-spec from a verified formula before freeze; (2) Williams %R/Stochastic Jaccard=1.000; propose retaining Williams %R and treating Stochastic as a DRAFT merge/drop candidate. Neither is applied. Each proposed drop would remove one card, two claim cells, and its strategy diagnostics, while leaving all surviving priorities untouched (3 or 15 becomes vacant). Re-specification requires rerunning counts/overlap/slots/power before freeze.

## 4. Criticism / failed-replication table

All URLs below were opened/read and marked VERIFIED in the existing registry (2026-10-27). They inform expectations only and do not pre-decide results.

| Family | Verified criticism / failed replication | Status | Full URL |
|---|---|---|---|
| channel-breakout | Sullivan, R., Timmermann, A. & White, H. (1999). Data-Snooping, Technical Trading Rule Performance, and the Bootstrap. Journal of Finance 54(5), 1647-1691. — NEGATIVE | VERIFIED | https://www.kevinsheppard.com/files/teaching/mfe/advanced-econometrics/Sullivan_Timmermann_White.pdf |
| ma-cross | Allen, F. & Karjalainen, R. (1999). Using genetic algorithms to find technical trading rules. Journal of Financial Economics 51(2), 245-271. — NEGATIVE | VERIFIED | https://www.cs.montana.edu/courses/spring2007/536/materials/Lopez/genetic.pdf |
| opening-range | Fetna, M. (2026). Opening-Range Breakout Does Not Survive Trading Costs: A Pre-Registered 225-Cell Study on Sixteen Years of Futures Data. SSRN 7428398. — NEGATIVE | VERIFIED | https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7428398 |
| level-retest | Curcio, R., Goodhart, C., Guillaume, D. & Payne, R. (1997). Do technical trading rules generate profits? Conclusions from the intra-day foreign exchange market. International Journal of Finance and Economics 2(4), 267-280. — NEGATIVE | VERIFIED | http://support-and-resistance.technicalanalysis.org.uk/Curcio-etal1997.pdf |
| osc-fade | Muruganandan, S. (2020). Testing the profitability of technical trading rules across market cycles: Evidence from India. Colombo Business Journal 11(1), 24-46. — NEGATIVE | VERIFIED | https://mgmt.cmb.ac.lk/cbj/wp-content/uploads/2020/06/2.-Technical-trading-rules.pdf |
| band-reversion | Fang, J., Jacobsen, B. & Qin, Y. (2017). Popularity versus Profitability: Evidence from Bollinger Bands. Journal of Portfolio Management 43(4), 152-159. — NEGATIVE | VERIFIED | https://acfr.aut.ac.nz/__data/assets/pdf_file/0007/29896/100009-Popularity-vs-Profitability-BB-August-Final.pdf |
| candlestick-reversal | Marshall, B. R., Young, M. R. & Cahan, R. (2008). Are candlestick technical trading strategies profitable in the Japanese equity market? Review of Quantitative Finance and Accounting 31, 191-207. — NEGATIVE | VERIFIED | https://link.springer.com/article/10.1007/s11156-007-0068-1 |
| vol-compression | Casey, A. (2024, updated 2026). Toby Crabel Patterns Tested: 17,424 Backtests on 8 Markets. StatOasis. — NEGATIVE | VERIFIED | https://statoasis.com/overfit/research/unveiling-toby-crabel-s-up-down-thrust-trading-patterns |

Dual Thrust source audit (opened 2026-10-28): VERIFIED FMZ Quant implementation article, https://www.fmz.com/digest-topic/9872 (four-extreme range, K1/K2 rails, demonstration K1=K2=.5; no universal parameter pair); VERIFIED ProRealCode description, https://www.prorealcode.com/prorealtime-indicators/dual-thrust-strategy-indicator/ (formula, no fixed pair). Their exact limitations are in docs/EMPIRICAL-EVIDENCE.md.

## 5. Frozen-state guard

No source edit to claim-cards.draft.mjs, signal-params.mjs, frozen.mjs, the Map, costs, exit or verification thresholds. FREEZE remains DRAFT with null approver/date. No claim-verification.json or claimed-trades.jsonl exists. verify-claims remains blocked. Do not read this report as real verification.
