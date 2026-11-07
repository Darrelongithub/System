# G0 Amendment 8 — Part 2: C preregistration and calibration

**Generated:** 2026-11-07T11:16:31.704Z (Africa/Nairobi). **Part 2 only; no scored Stage 3 world has run.**

Real market input was used only for signal-only tables on the four independent DEV segments. No real DEV trades or outcomes were generated; no VAL/HOLDOUT/STRESS price entered features, signals, trades, controls or verdicts.

## Frozen selection: williams-r-fade

Selected by highest exclusive share among cards with at least 1,500 real DEV signals and expected strength-state trades ≥600 per 60,000-bar synthetic world. Strength state: **CHOPPY**; real DEV exclusive share: **39.22%**.

| Card | DEV signals | Exclusive | Exclusive share | Expected strength trades / 60k | Pilot counts | Eligible |
|---|---:|---:|---:|---:|---|---|
| rsi-14-30-70 | 3876 | 2341 | 60.40% | 316.000 | 314, 307, 327 | no |
| classic-pivot | 6252 | 3512 | 56.17% | 149.667 | 141, 143, 165 | no |
| pdh-pdl-break | 47235 | 19793 | 41.90% | 343.000 | 342, 340, 347 | no |
| engulfing | 2006 | 820 | 40.88% | 67.333 | 66, 70, 66 | no |
| keltner-20-atr | 6185 | 2495 | 40.34% | 311.667 | 315, 296, 324 | no |
| macd-cross | 9737 | 3903 | 40.08% | 446.333 | 434, 438, 467 | no |
| williams-r-fade | 17594 | 6900 | 39.22% | 1450.667 | 1450, 1449, 1453 | yes |
| sma-20-50 | 2789 | 1091 | 39.12% | 117.000 | 117, 108, 126 | no |
| bollinger-20-2 | 8148 | 3159 | 38.77% | 982.667 | 990, 995, 963 | yes |
| ichimoku-tk | 6555 | 2524 | 38.50% | 19.000 | 15, 20, 22 | no |
| morning-evening-star | 13029 | 4685 | 35.96% | 968.333 | 965, 993, 947 | yes |
| inside-bar-break | 23151 | 7983 | 34.48% | 1307.667 | 1345, 1333, 1245 | yes |
| london-orb-30 | 22359 | 5543 | 24.79% | 216.667 | 220, 214, 216 | no |
| nr7-break | 14052 | 3342 | 23.78% | 1238.000 | 1282, 1257, 1175 | yes |
| three-soldiers-crows | 2102 | 485 | 23.07% | 85.667 | 83, 82, 92 | no |
| donchian-20 | 24401 | 3211 | 13.16% | 293.000 | 285, 294, 300 | no |
| asian-range-break | 13408 | 609 | 4.54% | 130.333 | 130, 131, 130 | no |
| pdh-retest | 1756 | 10 | 0.57% | 76.667 | 76, 74, 80 | no |
| pdl-retest | 1413 | 2 | 0.14% | 72.000 | 72, 75, 69 | no |
| atr-squeeze-break | 800 | 0 | 0.00% | 5.000 | 6, 3, 6 | no |
| bb-squeeze-fade | 2732 | 0 | 0.00% | 522.667 | 549, 523, 496 | no |
| donchian-55 | 12359 | 0 | 0.00% | 277.333 | 259, 272, 301 | no |

## Real DEV pairwise co-fire and contamination exclusions (signal-only)

Contamination rule: exclude a card from C's “other-card confirmations” count when same-bar/same-side co-fire share is **>25% of williams-r-fade's DEV signal bars**. Frozen exclusions: **pdh-pdl-break**.

| Other card | Same-bar/same-side co-fires | Share of planted-card signals | Share of other-card signals | Excluded? |
|---|---:|---:|---:|---|
| pdh-pdl-break | 6038 | 34.32% | 12.78% | yes |
| donchian-20 | 3731 | 21.21% | 15.29% | no |
| london-orb-30 | 3225 | 18.33% | 14.42% | no |
| asian-range-break | 2764 | 15.71% | 20.61% | no |
| donchian-55 | 1693 | 9.62% | 13.70% | no |
| ichimoku-tk | 770 | 4.38% | 11.75% | no |
| inside-bar-break | 708 | 4.02% | 3.06% | no |
| sma-20-50 | 332 | 1.89% | 11.90% | no |
| morning-evening-star | 312 | 1.77% | 2.39% | no |
| nr7-break | 304 | 1.73% | 2.16% | no |
| macd-cross | 269 | 1.53% | 2.76% | no |
| classic-pivot | 142 | 0.81% | 2.27% | no |
| atr-squeeze-break | 135 | 0.77% | 16.88% | no |
| bollinger-20-2 | 90 | 0.51% | 1.10% | no |
| keltner-20-atr | 65 | 0.37% | 1.05% | no |
| pdl-retest | 39 | 0.22% | 2.76% | no |
| pdh-retest | 33 | 0.19% | 1.88% | no |
| bb-squeeze-fade | 27 | 0.15% | 0.99% | no |
| three-soldiers-crows | 15 | 0.09% | 0.71% | no |
| engulfing | 1 | 0.01% | 0.05% | no |

## Three disjoint synthetic pilot signals

Signal-only co-fire/exclusive diagnostics were also calculated on three separate 60,000-bar synthetic pilot seeds. Per-card/pair rows are saved in the JSON artifact before scored worlds.

| Pilot seed | Signal events | Unique bar-side keys | Cards with signals |
|---:|---:|---:|---:|
| 20261110 | 115860 | 62035 | 22 |
| 20261111 | 116000 | 61939 | 22 |
| 20261112 | 116888 | 62232 | 22 |

## Condition B calibration (diagnosed Part 1 fix)

The generator remains constant additive drift; only its benchmark drift scalar was re-calibrated through the exact production control path. Pilot drift: **0.03542774**; random-long mean net **0.1677R** (target +0.15R); gross **0.3264R**; cost **0.1587R**. UNKNOWN-bin random candidates are dropped before the matched baseline, as in scored worlds.

| Iteration | Drift / bar | Mean random-long net R | Mean gross R | Mean cost R | Per-seed net R |
|---:|---:|---:|---:|---:|---|
| 1 | 0.03143677 | 0.1135 | 0.2721 | 0.1587 | 20261110: 0.1218; 20261111: 0.1360; 20261112: 0.0825 |
| 2 | 0.03542774 | 0.1677 | 0.3264 | 0.1587 | 20261110: 0.1827; 20261111: 0.1755; 20261112: 0.1450 |

## 12-bar planting calibration

The 24-bar rule was checked first; its >40% window share triggered the preregistered 12-bar contingency. Calibrated on pilot seeds 20261110, 20261111, 20261112 using the same full Stage 3b scoring path (world-specific M15 seed+71, 25 grids, one-slot books, frozen costs/exits, random controls and verification battery). Drift: **0.23780454 price units/bar**. Pilot measured gross: **0.4964R**; measured net: **0.3466R** (target +0.30R); measured cost: **0.1497R**. Window share max: **68.81%** (40% limit; 12-bar contingency applied).

| Iteration | Drift / bar | Pilot strength trades | Mean gross R | Mean net R | Mean cost R | Max window share |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0.04000000 | 4013 | 0.1444 | -0.0050 | 0.1494 | 68.81% |
| 2 | 0.11601990 | 3482 | 0.3575 | 0.2073 | 0.1503 | 68.81% |
| 3 | 0.14922164 | 3276 | 0.3824 | 0.2326 | 0.1498 | 68.81% |
| 4 | 0.23780454 | 2808 | 0.4964 | 0.3466 | 0.1497 | 68.81% |

Frozen condition C gross target: **0.4964R**, derived from the three pilot means. Stage 3 C requires its measured planted-card gross within ±0.05R of this value and at least 8/10 CONFIRMED worlds; do not increase the edge if it misses 8/10.

Condition C-D retains the original Donchian-20 planting for report-only comparison; it has **no pass criterion**.

Freeze SHA-256 (card, strength state, drift, 12 bars, exclusions, gross target): `e594639f33c065beb7e8389b62a3768d2d3c1aaa478e94c6f670d9d522853a16`.

The Part 2 report and code are to be committed/pushed before the single Stage 3 run. No Stage 4 is authorized.
