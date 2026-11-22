# Stage 4 — DST-Correct, Long/Short-Split, MATCHED-RANDOM-ENTRY Verdict
**Date:** 2026-11-22 (this run — the ONLY one). All previous numbers are frozen in `artifacts/rc-test/verdict-*.json`.
**Primary verdict excludes 2020–2026 (IN-SAMPLE reported separately, labeled IN-SAMPLE).**
**Frozen engines:** CORE-8 = 9d7912c (PRIMARY) · v3.1 NINE = 2f87616 + working-tree pruning (CONTAMINATED — pruning used 2004–2019).
**Stack=3, no self-hedging, as built. No rule changed. No rerun after results.**

## Headline
| Engine | Window | Trades | Gross R | Net R (measured cost) | Net 2× cost | PASS |
|--------|--------|--------|---------|----------------------|-------------|------|
| **CORE-8 (PRIMARY)** | **2004–2019 UNSEEN** | **2,685** | **+132.87** | **−265.37** | **−663.60** | **0/8 FAIL** |
| v3.1 NINE (CONTAMINATED) | 2004–2019 UNSEEN | 1,869 | +139.62 | −81.18 | −301.98 | **0/9 FAIL** |
| CORE-8 (IN-SAMPLE 2020–2026) | 2020–2026 (IN-SAMPLE — labeled) | 1,121 | +334.72 | +253.01 | +171.31 | **2/8 PASS (donchian-55-coiled, supertrend-ema-pullback)** |

Side-split (2004–2019 UNSEEN):
- CORE-8: long Net R −81.65 (N=1,582) vs short Net R −183.71 (N=1,103). grossR long/short both positive in total-net terms
- v3.1 NINE: long Net R +48.62 (N=1,078) vs short Net R −129.80 (N=791)
- CORE-8 IN-SAMPLE: long Net R +343.06 (N=680) vs short Net R −90.05 (N=441)

Random baseline (side-matched, fixed seed 20261026, one-slot blocking per (bot, side) segment, 1.5×ATR stop / 2R target / maxHoldBars 96, same measured cost): **93,446 side-matched draws** (CORE-8) and **105,956** (v3.1), i.e. ≈ 11,000–12,000 per segment (≥4,000/side/segment ✓). Baseline mean netR ≈ −0.23 to −0.25 per trade on the standardised exit — a random entry loses money in this window (the truthful picture of what a random trade does).

## PASS gate (hard — all gates must pass, else bot = FAIL)
Gates: ≥100 trades; net mean > +0.10R with t > 2 (CR1 day-cluster); excess over matched random > 0 with t > 2; no year >50% of profit; ≥75% leave-one-year-out windows positive; positive after 2× cost (cumulative net2x > 0).

### CORE-8 (PRIMARY) — 2004–2019 UNSEEN
| Bot | T | Gross R | Net R | netMean | t_net | excess | t_excess | conc | LOYO | net2x | Verdict |
|-----|---|---------|-------|---------|-------|--------|----------|------|------|------|--------|
| donchian-55-coiled | 665 | +37.35 | −11.54 | −0.017 | −0.22 | +0.211 | 2.70 | 1.00 | 3/16 | −60.42 | FAIL |
| ny-pivot-s1r1-reject | 203 | +23.34 | −8.31 | −0.041 | −0.33 | +0.194 | 1.57 | 1.00 | 2/16 | −39.96 | FAIL |
| killzone-orb-stretch | 519 | +50.67 | −21.93 | −0.042 | −0.54 | +0.186 | 2.38 | 1.00 | 0/16 | −94.52 | FAIL |
| supertrend-ema-pullback | 592 | +31.69 | −71.03 | −0.120 | −1.70 | +0.115 | 1.62 | 1.00 | 0/16 | −173.74 | FAIL |
| keltner-squeeze-release | 273 | −1.43 | −57.38 | −0.210 | −2.02 | +0.016 | 0.15 | 1.00 | 0/16 | −113.32 | FAIL |
| asymmetric-vol-breakout | 182 | −45.86 | −86.48 | −0.475 | −4.12 | −0.260 | −2.25 | 1.00 | 0/16 | −127.09 | FAIL |
| kijun-cloud-continuation | 148 | +49.50 | +22.66 | +0.153 | 1.01 | +0.399 | 2.63 | 0.41 | 16/16 | −4.18 | FAIL* |
| engulfing-zone-retest | 103 | −12.38 | −31.37 | −0.305 | −1.85 | −0.060 | −0.37 | 1.00 | 0/16 | −50.36 | FAIL |

\* kijun-cloud-continuation: passes minTrades/netMean/excess/t_excess/concentration/loyo but fails tNet (1.01 < 2) and net2x (−4.18 ≤ 0) → FAIL.

**CORE-8 unseen: 0/8 PASS.** Combined: 2,685 trades, gross +132.87R, net (measured cost) −265.37R, net 2× cost −663.60R.

### v3.1 NINE (SECONDARY — CONTAMINATED, pruning used 2004–2019) — 2004–2019 UNSEEN
| Bot | T | Gross R | Net R | netMean | t_net | excess | t_excess | conc | LOYO | net2x | Verdict |
|-----|---|---------|-------|---------|-------|--------|----------|------|------|------|--------|
| donchian-55-coiled | 677 | +39.89 | −6.69 | −0.010 | −0.13 | +0.220 | 2.83 | 1.00 | 4/16 | −53.27 | FAIL |
| ny-pivot-s1r1-reject | 177 | +53.00 | +25.78 | +0.146 | 1.06 | +0.364 | 2.65 | 0.48 | 16/16 | −1.43 | FAIL* |
| supertrend-ema-pullback | 133 | +19.36 | −1.57 | −0.012 | −0.08 | +0.242 | 1.59 | 1.00 | 5/16 | −22.50 | FAIL |
| engulfing-zone-retest | 113 | −23.57 | −42.58 | −0.377 | −2.55 | −0.133 | −0.90 | 1.00 | 0/16 | −61.60 | FAIL |
| weekly-highlow-breakout | 107 | +1.74 | −12.22 | −0.114 | −0.66 | +0.117 | 0.68 | 1.00 | 0/16 | −26.18 | FAIL |
| crabel-nr7-ignition | 79 | +17.38 | +5.28 | +0.067 | 0.32 | +0.276 | 1.33 | 1.61 | 13/15 | −6.83 | FAIL |
| bollinger-bandwidth-pop | 94 | +11.44 | −3.63 | −0.039 | −0.20 | +0.174 | 0.92 | 1.00 | 4/15 | −18.70 | FAIL |
| lambert-cci20-momentum | 172 | +7.10 | −14.80 | −0.086 | −0.63 | +0.160 | 1.17 | 1.00 | 0/16 | −36.70 | FAIL |
| chandelier-22-flip | 317 | +13.28 | −30.75 | −0.097 | −0.95 | +0.138 | 1.34 | 1.00 | 0/16 | −74.77 | FAIL |

\* ny-pivot-s1r1-reject: passes minTrades/netMean/excess/t_excess/concentration/loyo but fails tNet (1.06) and net2x (−1.43) → FAIL.

**v3.1 NINE unseen: 0/9 PASS.** Combined: 1,869 trades, gross +139.62R, net (measured cost) −81.18R, net 2× cost −301.98R.
(CONTAMINATED — do not present as a clean result; see Stage 1.)

### CORE-8 IN-SAMPLE 2020–2026 (SECONDARY — IN-SAMPLE, labeled)
| Bot | T | Gross R | Net R | netMean | t_net | excess | t_excess | conc | LOYO | net2x | Verdict |
|-----|---|---------|-------|---------|-------|--------|----------|------|------|------|--------|
| donchian-55-coiled | 294 | +131.56 | +121.95 | +0.415 | 2.84 | +0.543 | 3.73 | 0.37 | 7/7 | +112.33 | PASS |
| supertrend-ema-pullback | 233 | +104.64 | +83.33 | +0.358 | 2.19 | +0.478 | 2.93 | 0.44 | 7/7 | +62.02 | PASS |
| ny-pivot-s1r1-reject | 69 | +8.59 | +3.49 | +0.051 | 0.23 | +0.184 | 0.85 | 3.52 | 4/6 | −1.61 | FAIL |
| killzone-orb-stretch | 207 | +30.53 | +16.29 | +0.079 | 0.63 | +0.180 | 1.45 | 0.94 | 7/7 | +2.06 | FAIL |
| keltner-squeeze-release | 123 | +14.12 | +1.52 | +0.012 | 0.07 | +0.133 | 0.81 | 4.00 | 4/7 | −11.09 | FAIL |
| asymmetric-vol-breakout | 77 | +16.26 | +8.49 | +0.110 | 0.51 | +0.212 | 0.98 | 1.57 | 6/7 | +0.73 | FAIL |
| kijun-cloud-continuation | 66 | +42.31 | +35.89 | +0.544 | 0.82 | +0.669 | 1.01 | 1.30 | 5/6 | +29.47 | FAIL |
| engulfing-zone-retest | 52 | −13.29 | −17.94 | −0.345 | −1.62 | −0.215 | −1.01 | 1.00 | 0/7 | −22.60 | FAIL |

**CORE-8 IN-SAMPLE: 2/8 PASS.** Combined: 1,121 trades, gross +334.72R, net (measured cost) +253.01R, net 2× cost +171.31R. **IN-SAMPLE — does NOT generalize to the unseen window (0/8).**

## Limitations (honestly documented)
- **Random baseline exit basis differs from strategy trades.** The baseline uses the lab-standardised exit (1.5×ATR stop, 2R target, maxHoldBars 96, gap-fill at open, conservative SL on tie, same measured cost) while the bots use their frozen strategy-specific SL/TP. Excess values are therefore not apples-to-apples in 1R units. They are used as a "random-expectancy bar" diagnostic, not as a re-derivation of the strategy.
- **a tiny double-count (~0.01R/trade).** The engine's embedded $0.20/oz spread is included in the engine rMultiple; we subtract the measured cost on top. Negligible; documented.
- **Day-cluster (CR1) over EAT calendar days** for t-stats — honest but with ~4,200 clusters.
- **Vol regime** from (h-l)/close on the entry bar (lab convention).
- **2004–2009 epoch A is EXTRAPOLATED** (no independent UTC reference pre-2010-01). All 2004–2009-2019 epoch B 2012+ cells are measured; epoch A 2009 (mostly) is not.
- **The full-archive conversion reproduced the unseen CSV byte-identically** (sha256 75608e…) — Stage 2 freeze verified.
- **No in-sample look-ahead**: the in-sample 2020–2026 report is labelled IN-SAMPLE for this reason; the PRIMARY verdict (0/8) is the honest one.
- **In-sample random baseline shortfall.** The IN-SAMPLE (2020–2026) window is short (~6 years); the random baseline's accepted per-side-per-segment count runs 3,000–3,400 (below the 4,000 target) because one-slot blocking rejects more draws relative to the available bar pool. Documented honestly, no re-run after results. The unseen (2004–2019) primary verdict meets the ≥4,000/side/segment requirement (min 5,455).
