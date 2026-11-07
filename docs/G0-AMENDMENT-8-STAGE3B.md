# G0 Amendment 8 — one-time Stage 3b synthetic run

**Run:** 2026-11-07T11:36:17.400Z (Africa/Nairobi). **FAIL.** Four conditions × 10 worlds × 60,000 bars. Stage 4 was not run.

The authorized A/B bound is mean ≤ max(0.5, 1.5λ) and max ≤ the smallest k≥2 with P(Poisson(λ)>k)<0.001. λ was recomputed as 0.281701105 from the A-only 44-cell model (22 card IDs × strength/weakness, ten A worlds). The observed A/B values below are always adjacent to λ and both old/new bounds.

| Condition | Observed mean confirmed cards | Observed max | λ | Old mean/max bound | New mean/max bound | Old result | New result |
|---|---:|---:|---:|---|---|---|---|
| A | 1.500 | 7 | 0.281701105 | ≤0.500 / ≤2 | ≤0.500 / ≤3 | FAIL | FAIL |
| B | 0.300 | 1 | 0.281701105 | ≤0.500 / ≤2 | ≤0.500 / ≤3 | PASS | PASS |

λ recomputation: 44 cell probabilities/world × 10 A worlds; union per card then sum 22 card probabilities = 0.281701104658. Poisson tails: P(X>2)=0.003021, P(X>3)=0.000210.

A/B tradeoff reminder: A’s prior 0.700 mean / max 4 is inside the new bounds; this approved calibration will not detect an approximately 0.28-cards/world leaked-drift defect. The change calibrates the criterion to 44-cell multiplicity; it does not treat that anomaly as benign.

B control: constant additive drift 0.03542774 price/bar; scored random-long net 0.1538R versus the +0.15R pilot target.

## Condition C preregistration and result

Planted card **williams-r-fade** (CHOPPY); exclusions frozen before scored worlds: **pdh-pdl-break**. Calibration target gross 0.4964R; scored gross 0.4542R; planted-card confirmations 10/10; mean non-planted/non-excluded confirmations 13.400.

| Condition C criterion | Result |
|---|---|
| plantedCardConfirmedAtLeast8Of10 | PASS |
| measuredGrossWithin005ROfPilotTarget | PASS |
| nonPlantedNonExcludedConfirmationsMeanAtMostHalf | FAIL |

Condition C event diagnostics (24-bar first; 12-bar contingency applied if preregistered): edge=12 bars, drift=0.23780454 price/bar, gross target=0.4964R, pilot measured cost=0.1497R, exclusions=pdh-pdl-break.

| World | Seed | Planted signal events | Planted windows | Window-bar share | Planted strength trades | Gross R | Net R | Cards confirmed |
|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 20263201 | 7986 | 3231 | 68.37% | 925 | 0.3337 | 0.1841 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, nr7-break, pdh-pdl-break, pdh-retest, pdl-retest, rsi-14-30-70, sma-20-50, williams-r-fade |
| 2 | 20263202 | 7813 | 3212 | 67.96% | 993 | 0.4400 | 0.2867 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, pdh-pdl-break, pdh-retest, pdl-retest, rsi-14-30-70, sma-20-50, three-soldiers-crows, williams-r-fade |
| 3 | 20263203 | 7976 | 3223 | 68.20% | 913 | 0.4688 | 0.3161 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, morning-evening-star, nr7-break, pdh-pdl-break, pdh-retest, pdl-retest, rsi-14-30-70, sma-20-50, williams-r-fade |
| 4 | 20263204 | 7997 | 3237 | 68.49% | 874 | 0.4725 | 0.3214 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, nr7-break, pdh-pdl-break, pdh-retest, pdl-retest, rsi-14-30-70, sma-20-50, three-soldiers-crows, williams-r-fade |
| 5 | 20263205 | 7864 | 3220 | 68.13% | 912 | 0.4868 | 0.3369 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, inside-bar-break, keltner-20-atr, london-orb-30, nr7-break, pdh-pdl-break, pdh-retest, pdl-retest, rsi-14-30-70, sma-20-50, three-soldiers-crows, williams-r-fade |
| 6 | 20263206 | 8039 | 3255 | 68.87% | 926 | 0.3769 | 0.2255 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, nr7-break, pdh-pdl-break, pdh-retest, pdl-retest, rsi-14-30-70, sma-20-50, williams-r-fade |
| 7 | 20263207 | 7900 | 3244 | 68.64% | 924 | 0.4407 | 0.2930 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, nr7-break, pdh-pdl-break, pdh-retest, pdl-retest, rsi-14-30-70, sma-20-50, three-soldiers-crows, williams-r-fade |
| 8 | 20263208 | 8066 | 3237 | 68.49% | 942 | 0.4887 | 0.3393 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, nr7-break, pdh-pdl-break, pdl-retest, rsi-14-30-70, sma-20-50, williams-r-fade |
| 9 | 20263209 | 8007 | 3235 | 68.45% | 901 | 0.5283 | 0.3785 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, nr7-break, pdh-pdl-break, pdh-retest, pdl-retest, rsi-14-30-70, sma-20-50, williams-r-fade |
| 10 | 20263210 | 7977 | 3256 | 68.90% | 928 | 0.5097 | 0.3612 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, nr7-break, pdh-pdl-break, pdh-retest, pdl-retest, rsi-14-30-70, sma-20-50, williams-r-fade |

## Condition C-D — report-only

Original Donchian-20 planting: 10/10 worlds confirmed the card; no pass criterion applies. Per-world confirmed card lists:

- World 1, seed 20264201: asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, pdh-pdl-break, rsi-14-30-70, williams-r-fade
- World 2, seed 20264202: asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, pdh-pdl-break, pdl-retest, rsi-14-30-70, sma-20-50, williams-r-fade
- World 3, seed 20264203: asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, pdh-pdl-break, rsi-14-30-70, sma-20-50, williams-r-fade
- World 4, seed 20264204: bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, nr7-break, pdh-pdl-break, pdh-retest, rsi-14-30-70, williams-r-fade
- World 5, seed 20264205: asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, pdh-pdl-break, pdh-retest, pdl-retest, rsi-14-30-70, sma-20-50, three-soldiers-crows, williams-r-fade
- World 6, seed 20264206: asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, pdh-pdl-break, rsi-14-30-70, sma-20-50, williams-r-fade
- World 7, seed 20264207: asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, nr7-break, pdh-pdl-break, rsi-14-30-70, williams-r-fade
- World 8, seed 20264208: asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, pdh-pdl-break, pdl-retest, rsi-14-30-70, williams-r-fade
- World 9, seed 20264209: bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, pdh-pdl-break, pdl-retest, rsi-14-30-70, sma-20-50, williams-r-fade
- World 10, seed 20264210: asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, pdh-pdl-break, pdl-retest, rsi-14-30-70, williams-r-fade

## Per-world A/B/C/C-D confirmation lists

| Condition | World | Seed | Unique confirmed cards | Count | B random-long net R |
|---|---:|---:|---|---:|---:|
| A_ZERO_DRIFT | 1 | 20261201 | none | 0 | -0.2689 |
| A_ZERO_DRIFT | 2 | 20261202 | bb-squeeze-fade, bollinger-20-2, keltner-20-atr, macd-cross, morning-evening-star, nr7-break, rsi-14-30-70 | 7 | -0.1218 |
| A_ZERO_DRIFT | 3 | 20261203 | none | 0 | -0.2129 |
| A_ZERO_DRIFT | 4 | 20261204 | none | 0 | -0.1805 |
| A_ZERO_DRIFT | 5 | 20261205 | none | 0 | -0.1032 |
| A_ZERO_DRIFT | 6 | 20261206 | inside-bar-break | 1 | -0.3417 |
| A_ZERO_DRIFT | 7 | 20261207 | none | 0 | -0.1114 |
| A_ZERO_DRIFT | 8 | 20261208 | bb-squeeze-fade, bollinger-20-2, morning-evening-star, nr7-break, rsi-14-30-70, williams-r-fade | 6 | -0.0697 |
| A_ZERO_DRIFT | 9 | 20261209 | inside-bar-break | 1 | -0.0362 |
| A_ZERO_DRIFT | 10 | 20261210 | none | 0 | -0.1383 |
| B_CONSTANT_UP_DRIFT | 1 | 20262201 | none | 0 | 0.1455 |
| B_CONSTANT_UP_DRIFT | 2 | 20262202 | none | 0 | 0.1488 |
| B_CONSTANT_UP_DRIFT | 3 | 20262203 | sma-20-50 | 1 | 0.1102 |
| B_CONSTANT_UP_DRIFT | 4 | 20262204 | nr7-break | 1 | 0.2394 |
| B_CONSTANT_UP_DRIFT | 5 | 20262205 | none | 0 | 0.0897 |
| B_CONSTANT_UP_DRIFT | 6 | 20262206 | none | 0 | 0.1237 |
| B_CONSTANT_UP_DRIFT | 7 | 20262207 | none | 0 | 0.1481 |
| B_CONSTANT_UP_DRIFT | 8 | 20262208 | none | 0 | 0.2330 |
| B_CONSTANT_UP_DRIFT | 9 | 20262209 | none | 0 | 0.1830 |
| B_CONSTANT_UP_DRIFT | 10 | 20262210 | sma-20-50 | 1 | 0.1160 |
| C_CARD_PLANTED | 1 | 20263201 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, nr7-break, pdh-pdl-break, pdh-retest, pdl-retest, rsi-14-30-70, sma-20-50, williams-r-fade | 15 | -0.0589 |
| C_CARD_PLANTED | 2 | 20263202 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, pdh-pdl-break, pdh-retest, pdl-retest, rsi-14-30-70, sma-20-50, three-soldiers-crows, williams-r-fade | 15 | -0.0145 |
| C_CARD_PLANTED | 3 | 20263203 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, morning-evening-star, nr7-break, pdh-pdl-break, pdh-retest, pdl-retest, rsi-14-30-70, sma-20-50, williams-r-fade | 16 | 0.0188 |
| C_CARD_PLANTED | 4 | 20263204 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, nr7-break, pdh-pdl-break, pdh-retest, pdl-retest, rsi-14-30-70, sma-20-50, three-soldiers-crows, williams-r-fade | 16 | -0.1001 |
| C_CARD_PLANTED | 5 | 20263205 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, inside-bar-break, keltner-20-atr, london-orb-30, nr7-break, pdh-pdl-break, pdh-retest, pdl-retest, rsi-14-30-70, sma-20-50, three-soldiers-crows, williams-r-fade | 17 | -0.1012 |
| C_CARD_PLANTED | 6 | 20263206 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, nr7-break, pdh-pdl-break, pdh-retest, pdl-retest, rsi-14-30-70, sma-20-50, williams-r-fade | 15 | 0.0667 |
| C_CARD_PLANTED | 7 | 20263207 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, nr7-break, pdh-pdl-break, pdh-retest, pdl-retest, rsi-14-30-70, sma-20-50, three-soldiers-crows, williams-r-fade | 16 | 0.0572 |
| C_CARD_PLANTED | 8 | 20263208 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, nr7-break, pdh-pdl-break, pdl-retest, rsi-14-30-70, sma-20-50, williams-r-fade | 14 | 0.0112 |
| C_CARD_PLANTED | 9 | 20263209 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, nr7-break, pdh-pdl-break, pdh-retest, pdl-retest, rsi-14-30-70, sma-20-50, williams-r-fade | 15 | -0.0148 |
| C_CARD_PLANTED | 10 | 20263210 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, nr7-break, pdh-pdl-break, pdh-retest, pdl-retest, rsi-14-30-70, sma-20-50, williams-r-fade | 15 | -0.0503 |
| C-D_DONCHIAN20_REPORT_ONLY | 1 | 20264201 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, pdh-pdl-break, rsi-14-30-70, williams-r-fade | 10 | -0.0349 |
| C-D_DONCHIAN20_REPORT_ONLY | 2 | 20264202 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, pdh-pdl-break, pdl-retest, rsi-14-30-70, sma-20-50, williams-r-fade | 12 | -0.0227 |
| C-D_DONCHIAN20_REPORT_ONLY | 3 | 20264203 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, pdh-pdl-break, rsi-14-30-70, sma-20-50, williams-r-fade | 11 | -0.0336 |
| C-D_DONCHIAN20_REPORT_ONLY | 4 | 20264204 | bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, nr7-break, pdh-pdl-break, pdh-retest, rsi-14-30-70, williams-r-fade | 11 | 0.0641 |
| C-D_DONCHIAN20_REPORT_ONLY | 5 | 20264205 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, pdh-pdl-break, pdh-retest, pdl-retest, rsi-14-30-70, sma-20-50, three-soldiers-crows, williams-r-fade | 14 | -0.0355 |
| C-D_DONCHIAN20_REPORT_ONLY | 6 | 20264206 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, pdh-pdl-break, rsi-14-30-70, sma-20-50, williams-r-fade | 11 | -0.0501 |
| C-D_DONCHIAN20_REPORT_ONLY | 7 | 20264207 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, nr7-break, pdh-pdl-break, rsi-14-30-70, williams-r-fade | 12 | 0.1444 |
| C-D_DONCHIAN20_REPORT_ONLY | 8 | 20264208 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, pdh-pdl-break, pdl-retest, rsi-14-30-70, williams-r-fade | 11 | -0.0230 |
| C-D_DONCHIAN20_REPORT_ONLY | 9 | 20264209 | bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, pdh-pdl-break, pdl-retest, rsi-14-30-70, sma-20-50, williams-r-fade | 11 | -0.0512 |
| C-D_DONCHIAN20_REPORT_ONLY | 10 | 20264210 | asian-range-break, bb-squeeze-fade, bollinger-20-2, classic-pivot, donchian-20, donchian-55, keltner-20-atr, london-orb-30, pdh-pdl-break, pdl-retest, rsi-14-30-70, williams-r-fade | 12 | -0.1140 |

## UNKNOWN entry coverage (executed in card slots; unbinned from both verdict cells)

Every kept card trade is categorized by its entry-time verdict state. UNKNOWN trades remain executed in their independent per-card slot books, but `groupByStrategyVerdictState` excludes null verdict states from both EFFICIENT and CHOPPY verdict cells.

| Condition | Card | EFFICIENT | CHOPPY | UNKNOWN | Total book | UNKNOWN share | Identity |
|---|---|---:|---:|---:|---:|---:|---|
| A_ZERO_DRIFT | donchian-20 | 3095 | 15467 | 5818 | 24380 | 23.86% | PASS |
| A_ZERO_DRIFT | donchian-55 | 2873 | 9535 | 4693 | 17101 | 27.44% | PASS |
| A_ZERO_DRIFT | sma-20-50 | 1248 | 6384 | 2908 | 10540 | 27.59% | PASS |
| A_ZERO_DRIFT | macd-cross | 4598 | 10383 | 4789 | 19770 | 24.22% | PASS |
| A_ZERO_DRIFT | ichimoku-tk | 205 | 12092 | 2815 | 15112 | 18.63% | PASS |
| A_ZERO_DRIFT | asian-range-break | 1317 | 5992 | 2599 | 9908 | 26.23% | PASS |
| A_ZERO_DRIFT | london-orb-30 | 2200 | 9371 | 3482 | 15053 | 23.13% | PASS |
| A_ZERO_DRIFT | pdh-pdl-break | 3471 | 10730 | 5251 | 19452 | 26.99% | PASS |
| A_ZERO_DRIFT | pdh-retest | 647 | 2726 | 1312 | 4685 | 28.00% | PASS |
| A_ZERO_DRIFT | pdl-retest | 695 | 2718 | 1397 | 4810 | 29.04% | PASS |
| A_ZERO_DRIFT | classic-pivot | 1565 | 7677 | 3473 | 12715 | 27.31% | PASS |
| A_ZERO_DRIFT | rsi-14-30-70 | 5152 | 3031 | 4098 | 12281 | 33.37% | PASS |
| A_ZERO_DRIFT | williams-r-fade | 4563 | 14506 | 5973 | 25042 | 23.85% | PASS |
| A_ZERO_DRIFT | bollinger-20-2 | 2134 | 10189 | 3916 | 16239 | 24.11% | PASS |
| A_ZERO_DRIFT | keltner-20-atr | 2376 | 3200 | 2387 | 7963 | 29.98% | PASS |
| A_ZERO_DRIFT | bb-squeeze-fade | 1584 | 5324 | 2767 | 9675 | 28.60% | PASS |
| A_ZERO_DRIFT | engulfing | 116 | 733 | 279 | 1128 | 24.73% | PASS |
| A_ZERO_DRIFT | morning-evening-star | 2691 | 9603 | 4107 | 16401 | 25.04% | PASS |
| A_ZERO_DRIFT | three-soldiers-crows | 210 | 902 | 404 | 1516 | 26.65% | PASS |
| A_ZERO_DRIFT | atr-squeeze-break | 25 | 34 | 5 | 64 | 7.81% | PASS |
| A_ZERO_DRIFT | nr7-break | 3570 | 12276 | 5224 | 21070 | 24.79% | PASS |
| A_ZERO_DRIFT | inside-bar-break | 4419 | 13210 | 5970 | 23599 | 25.30% | PASS |
| B_CONSTANT_UP_DRIFT | donchian-20 | 3398 | 15176 | 6020 | 24594 | 24.48% | PASS |
| B_CONSTANT_UP_DRIFT | donchian-55 | 3241 | 9392 | 4882 | 17515 | 27.87% | PASS |
| B_CONSTANT_UP_DRIFT | sma-20-50 | 1235 | 6165 | 2747 | 10147 | 27.07% | PASS |
| B_CONSTANT_UP_DRIFT | macd-cross | 4924 | 10255 | 4872 | 20051 | 24.30% | PASS |
| B_CONSTANT_UP_DRIFT | ichimoku-tk | 188 | 11918 | 2730 | 14836 | 18.40% | PASS |
| B_CONSTANT_UP_DRIFT | asian-range-break | 1520 | 5894 | 2524 | 9938 | 25.40% | PASS |
| B_CONSTANT_UP_DRIFT | london-orb-30 | 2307 | 9270 | 3497 | 15074 | 23.20% | PASS |
| B_CONSTANT_UP_DRIFT | pdh-pdl-break | 3923 | 10758 | 5339 | 20020 | 26.67% | PASS |
| B_CONSTANT_UP_DRIFT | pdh-retest | 1058 | 3779 | 1871 | 6708 | 27.89% | PASS |
| B_CONSTANT_UP_DRIFT | pdl-retest | 408 | 1680 | 765 | 2853 | 26.81% | PASS |
| B_CONSTANT_UP_DRIFT | classic-pivot | 1660 | 7575 | 3385 | 12620 | 26.82% | PASS |
| B_CONSTANT_UP_DRIFT | rsi-14-30-70 | 5618 | 3178 | 4474 | 13270 | 33.72% | PASS |
| B_CONSTANT_UP_DRIFT | williams-r-fade | 4944 | 14135 | 6081 | 25160 | 24.17% | PASS |
| B_CONSTANT_UP_DRIFT | bollinger-20-2 | 2383 | 10132 | 4080 | 16595 | 24.59% | PASS |
| B_CONSTANT_UP_DRIFT | keltner-20-atr | 2773 | 3411 | 2549 | 8733 | 29.19% | PASS |
| B_CONSTANT_UP_DRIFT | bb-squeeze-fade | 1699 | 5222 | 2796 | 9717 | 28.77% | PASS |
| B_CONSTANT_UP_DRIFT | engulfing | 123 | 671 | 234 | 1028 | 22.76% | PASS |
| B_CONSTANT_UP_DRIFT | morning-evening-star | 2856 | 9484 | 4150 | 16490 | 25.17% | PASS |
| B_CONSTANT_UP_DRIFT | three-soldiers-crows | 248 | 865 | 433 | 1546 | 28.01% | PASS |
| B_CONSTANT_UP_DRIFT | atr-squeeze-break | 40 | 38 | 20 | 98 | 20.41% | PASS |
| B_CONSTANT_UP_DRIFT | nr7-break | 3749 | 12049 | 5260 | 21058 | 24.98% | PASS |
| B_CONSTANT_UP_DRIFT | inside-bar-break | 4504 | 12823 | 6047 | 23374 | 25.87% | PASS |
| C_CARD_PLANTED | donchian-20 | 10285 | 11968 | 6800 | 29053 | 23.41% | PASS |
| C_CARD_PLANTED | donchian-55 | 9867 | 6102 | 5271 | 21240 | 24.82% | PASS |
| C_CARD_PLANTED | sma-20-50 | 2858 | 4517 | 2716 | 10091 | 26.92% | PASS |
| C_CARD_PLANTED | macd-cross | 9343 | 5528 | 5129 | 20000 | 25.64% | PASS |
| C_CARD_PLANTED | ichimoku-tk | 329 | 9514 | 2404 | 12247 | 19.63% | PASS |
| C_CARD_PLANTED | asian-range-break | 4163 | 4476 | 2808 | 11447 | 24.53% | PASS |
| C_CARD_PLANTED | london-orb-30 | 5540 | 6516 | 3717 | 15773 | 23.57% | PASS |
| C_CARD_PLANTED | pdh-pdl-break | 10506 | 7792 | 5873 | 24171 | 24.30% | PASS |
| C_CARD_PLANTED | pdh-retest | 1778 | 1810 | 1283 | 4871 | 26.34% | PASS |
| C_CARD_PLANTED | pdl-retest | 1795 | 1778 | 1275 | 4848 | 26.30% | PASS |
| C_CARD_PLANTED | classic-pivot | 3790 | 4658 | 3101 | 11549 | 26.85% | PASS |
| C_CARD_PLANTED | rsi-14-30-70 | 11808 | 2884 | 6650 | 21342 | 31.16% | PASS |
| C_CARD_PLANTED | williams-r-fade | 10413 | 9238 | 6813 | 26464 | 25.74% | PASS |
| C_CARD_PLANTED | bollinger-20-2 | 6803 | 9195 | 4781 | 20779 | 23.01% | PASS |
| C_CARD_PLANTED | keltner-20-atr | 8846 | 4274 | 4251 | 17371 | 24.47% | PASS |
| C_CARD_PLANTED | bb-squeeze-fade | 4595 | 3484 | 2839 | 10918 | 26.00% | PASS |
| C_CARD_PLANTED | engulfing | 314 | 467 | 284 | 1065 | 26.67% | PASS |
| C_CARD_PLANTED | morning-evening-star | 6803 | 6635 | 4809 | 18247 | 26.36% | PASS |
| C_CARD_PLANTED | three-soldiers-crows | 1002 | 986 | 641 | 2629 | 24.38% | PASS |
| C_CARD_PLANTED | atr-squeeze-break | 115 | 34 | 16 | 165 | 9.70% | PASS |
| C_CARD_PLANTED | nr7-break | 9433 | 8643 | 6052 | 24128 | 25.08% | PASS |
| C_CARD_PLANTED | inside-bar-break | 11242 | 9515 | 7124 | 27881 | 25.55% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | donchian-20 | 6581 | 13072 | 6517 | 26170 | 24.90% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | donchian-55 | 6307 | 7643 | 5379 | 19329 | 27.83% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | sma-20-50 | 1990 | 4986 | 2786 | 9762 | 28.54% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | macd-cross | 7245 | 7558 | 5418 | 20221 | 26.79% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | ichimoku-tk | 265 | 9799 | 2367 | 12431 | 19.04% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | asian-range-break | 2660 | 5214 | 2890 | 10764 | 26.85% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | london-orb-30 | 3890 | 7838 | 3802 | 15530 | 24.48% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | pdh-pdl-break | 7170 | 8791 | 5873 | 21834 | 26.90% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | pdh-retest | 1326 | 2194 | 1381 | 4901 | 28.18% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | pdl-retest | 1277 | 2227 | 1296 | 4800 | 27.00% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | classic-pivot | 2662 | 5777 | 3445 | 11884 | 28.99% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | rsi-14-30-70 | 9218 | 3218 | 6137 | 18573 | 33.04% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | williams-r-fade | 7768 | 10967 | 6608 | 25343 | 26.07% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | bollinger-20-2 | 4472 | 9892 | 4622 | 18986 | 24.34% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | keltner-20-atr | 5539 | 4124 | 3522 | 13185 | 26.71% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | bb-squeeze-fade | 3165 | 4342 | 2924 | 10431 | 28.03% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | engulfing | 240 | 516 | 304 | 1060 | 28.68% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | morning-evening-star | 4784 | 7769 | 4615 | 17168 | 26.88% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | three-soldiers-crows | 523 | 882 | 501 | 1906 | 26.29% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | atr-squeeze-break | 68 | 28 | 10 | 106 | 9.43% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | nr7-break | 6675 | 10015 | 5858 | 22548 | 25.98% | PASS |
| C-D_DONCHIAN20_REPORT_ONLY | inside-bar-break | 8072 | 10885 | 6912 | 25869 | 26.72% | PASS |

All-world identities: PASS; every card satisfies EFFICIENT + CHOPPY + UNKNOWN = total book.

## Conditions and hard-stop result

| Criterion | Result |
|---|---|
| A_old_mean_max | FAIL |
| A_new_mean_max | FAIL |
| B_old_mean_max | PASS |
| B_new_mean_max | PASS |
| C_plantedCardConfirmedAtLeast8Of10 | PASS |
| C_measuredGrossWithin005ROfPilotTarget | PASS |
| C_nonPlantedNonExcludedConfirmationsMeanAtMostHalf | FAIL |
| All Part 4 criteria (C-D excluded as report-only) | FAIL |
| Unknown-entry book identities | PASS |
| Stage 4 output absence guard | PASS |

**FAIL — HARD STOP:** do not rerun Stage 3 and do not start Stage 4.

## Full test result after the one Stage 3 run

`npm test`: **415 passed, 1 failed** in 84.1 seconds. The only failure is the unrelated existing D1 UI display assertion at `tests/synth.test.mjs:694` (“UI shows the final recorded D1 count”). All A8 map, Part 2, UNKNOWN-entry, and segment tests passed. The suite is not fully green.

Full JSON output: `artifacts/map-compass/a8-stage3b-report.json`.
