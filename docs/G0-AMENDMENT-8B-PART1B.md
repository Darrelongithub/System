# G0 Amendment 8B — Part 1b: no-edge anomaly reassessment

**Date:** 2026-11-06 (Africa/Nairobi). **Scope:** report-only, synthetic A/B diagnostics. No production code, generator, cost, threshold, or verifier was changed; no real bars or non-DEV prices were read in this task. The A-only null calculations use the saved deterministic replays documented in Part 1.

## 1b.1 — Gate probabilities under the zero-gross-edge A null

For every A condition cell in each of 10 worlds, raw net null mean is `−meanCostR`. The verifier signs it by claim direction: strength has `μ_signed=−cost`; weakness has `μ_signed=+cost`. The A-cell net-gate probability is evaluated with that cell’s own n, signed-R SD, and calendar-day CR1 SE: `P[Normal(μ_signed, SE_CR1) > max(0.10, 2·SE_CR1)]`. The matched-control excess null has mean zero; for the frozen one-sided `t>2` gate, `P_excess=Φ(−2)=0.0227501` for each cell (its own CR1 SE sets the t scale). The joint probability below is the Part 1 independence approximation `pNet × pExcess`; it omits later concentration/LOYO veto probabilities. Per-card-half rows average the ten world-specific probabilities, not a shared n/SE.

| Half | A cell-worlds | Mean cost R | Mean signed null R | Mean p(net gate) | Mean p(excess gate) | Mean joint p | Mean CR1/plain SE |
|---|---:|---:|---:|---:|---:|---:|---:|
| strength | 220 | 0.154573 | -0.154573 | 0.001129 | 0.022750 | 0.000025 | 1.002684 |
| weakness | 220 | 0.152785 | 0.152785 | 0.578189 | 0.022750 | 0.012779 | 1.000811 |

The 220/220 A weakness half-worlds have mean cost between 0.119951R and 0.194167R, all above the +0.10R floor; therefore cost drag alone clears the weakness signed-mean floor. Their tNet probability is not 1 because the CR1 t gate still applies (mean pNet 0.578189). Strength null means are negative (mean −0.154573R), so the strength net gate almost never passes (mean pNet 0.001129). The excess gate is the limiting gate for both halves. This directly explains the directional asymmetry in A: 7 A confirmations are weakness and 0 are strength. The other seven saved confirmations are in B. B has upward drift, so this A-only null model is not used to assign B-specific gate probabilities; its seven observed confirmations were also weakness halves. The A result alone shows that the earlier B-calibration explanation cannot account for the whole anomaly.

### Per-card-half probabilities and CR1 inflation

Each row is the average of that card × half × verdict-state across the ten A worlds. `pNet`, `pExcess` and `pJoint` are probabilities, not observed pass rates. `CR1/plain` is the mean finite clustered/plain SE ratio for that same cell across worlds.

| Card | Half | Verdict state | Mean n | Mean SD R | Mean CR1 SE | Mean cost R | Signed null mean R | pNet | pExcess | pJoint | CR1/plain |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| donchian-20 | strength | EFFICIENT | 302.80 | 1.412839 | 0.083209 | 0.154867 | -0.154867 | 0.000057 | 0.022750 | 0.000001 | 1.0202 |
| donchian-20 | weakness | CHOPPY | 1551.00 | 1.404231 | 0.035541 | 0.151328 | 0.151328 | 0.925601 | 0.022750 | 0.021057 | 0.9974 |
| donchian-55 | strength | EFFICIENT | 282.00 | 1.419578 | 0.086339 | 0.152258 | -0.152258 | 0.000086 | 0.022750 | 0.000002 | 1.0203 |
| donchian-55 | weakness | CHOPPY | 938.80 | 1.402811 | 0.045405 | 0.148884 | 0.148884 | 0.859218 | 0.022750 | 0.019547 | 0.9919 |
| sma-20-50 | strength | EFFICIENT | 125.20 | 1.379541 | 0.123071 | 0.159471 | -0.159471 | 0.000500 | 0.022750 | 0.000010 | 0.9969 |
| sma-20-50 | weakness | CHOPPY | 647.00 | 1.404647 | 0.055158 | 0.158383 | 0.158383 | 0.807829 | 0.022750 | 0.018378 | 0.9992 |
| macd-cross | strength | EFFICIENT | 455.40 | 1.401519 | 0.066280 | 0.156964 | -0.156964 | 0.000007 | 0.022750 | 0.000000 | 1.0090 |
| macd-cross | weakness | CHOPPY | 1035.60 | 1.398400 | 0.043478 | 0.156626 | 0.156626 | 0.903499 | 0.022750 | 0.020555 | 1.0008 |
| ichimoku-tk | strength | EFFICIENT | 20.80 | 1.393488 | 0.310063 | 0.158734 | -0.158734 | 0.005983 | 0.022750 | 0.000136 | 1.0030 |
| ichimoku-tk | weakness | CHOPPY | 1216.00 | 1.404838 | 0.039839 | 0.157670 | 0.157670 | 0.926071 | 0.022750 | 0.021068 | 0.9894 |
| atr-squeeze-break | strength | CHOPPY | 3.50 | 1.226656 | 0.696130 | 0.143726 | -0.143726 | 0.010978 | 0.022750 | 0.000250 | 1.0000 |
| atr-squeeze-break | weakness | EFFICIENT | 3.90 | 1.055495 | 0.500328 | 0.149920 | 0.149920 | 0.126159 | 0.022750 | 0.002870 | 1.0000 |
| nr7-break | strength | CHOPPY | 1234.80 | 1.407139 | 0.040233 | 0.151372 | -0.151372 | 0.000000 | 0.022750 | 0.000000 | 1.0049 |
| nr7-break | weakness | EFFICIENT | 351.30 | 1.416546 | 0.076352 | 0.151093 | 0.151093 | 0.492604 | 0.022750 | 0.010122 | 1.0075 |
| inside-bar-break | strength | CHOPPY | 1310.90 | 1.406431 | 0.038695 | 0.157516 | -0.157516 | 0.000000 | 0.022750 | 0.000000 | 0.9967 |
| inside-bar-break | weakness | EFFICIENT | 433.40 | 1.415505 | 0.068554 | 0.158345 | 0.158345 | 0.621940 | 0.022750 | 0.012675 | 1.0049 |
| asian-range-break | strength | EFFICIENT | 130.40 | 1.406570 | 0.124353 | 0.171689 | -0.171689 | 0.000369 | 0.022750 | 0.000008 | 1.0047 |
| asian-range-break | weakness | CHOPPY | 600.40 | 1.402847 | 0.057455 | 0.164935 | 0.164935 | 0.807950 | 0.022750 | 0.018381 | 1.0031 |
| london-orb-30 | strength | EFFICIENT | 218.00 | 1.400056 | 0.095213 | 0.178510 | -0.178510 | 0.000055 | 0.022750 | 0.000001 | 1.0019 |
| london-orb-30 | weakness | CHOPPY | 947.50 | 1.403576 | 0.045577 | 0.176734 | 0.176734 | 0.953827 | 0.022750 | 0.021700 | 0.9993 |
| pdh-pdl-break | strength | EFFICIENT | 347.40 | 1.414970 | 0.075620 | 0.157543 | -0.157543 | 0.000023 | 0.022750 | 0.000000 | 0.9936 |
| pdh-pdl-break | weakness | CHOPPY | 1064.50 | 1.408153 | 0.043169 | 0.150263 | 0.150263 | 0.877833 | 0.022750 | 0.019971 | 1.0005 |
| bollinger-20-2 | strength | CHOPPY | 998.00 | 1.399833 | 0.044552 | 0.144229 | -0.144229 | 0.000000 | 0.022750 | 0.000000 | 1.0052 |
| bollinger-20-2 | weakness | EFFICIENT | 219.20 | 1.385000 | 0.093871 | 0.142278 | 0.142278 | 0.314645 | 0.022750 | 0.006454 | 1.0041 |
| keltner-20-atr | strength | CHOPPY | 321.00 | 1.392839 | 0.078091 | 0.141731 | -0.141731 | 0.000072 | 0.022750 | 0.000002 | 1.0023 |
| keltner-20-atr | weakness | EFFICIENT | 239.50 | 1.398812 | 0.090488 | 0.143778 | 0.143778 | 0.342532 | 0.022750 | 0.007072 | 1.0012 |
| bb-squeeze-fade | strength | CHOPPY | 529.00 | 1.396961 | 0.060749 | 0.142782 | -0.142782 | 0.000007 | 0.022750 | 0.000000 | 0.9990 |
| bb-squeeze-fade | weakness | EFFICIENT | 159.90 | 1.372348 | 0.108870 | 0.141832 | 0.141832 | 0.243499 | 0.022750 | 0.004989 | 1.0034 |
| pdh-retest | strength | EFFICIENT | 73.80 | 1.380609 | 0.160805 | 0.165514 | -0.165514 | 0.001235 | 0.022750 | 0.000026 | 0.9986 |
| pdh-retest | weakness | CHOPPY | 268.70 | 1.421280 | 0.086303 | 0.159623 | 0.159623 | 0.442257 | 0.022750 | 0.010061 | 0.9945 |
| pdl-retest | strength | EFFICIENT | 69.60 | 1.394881 | 0.167585 | 0.165296 | -0.165296 | 0.001420 | 0.022750 | 0.000032 | 0.9999 |
| pdl-retest | weakness | CHOPPY | 263.50 | 1.406489 | 0.086999 | 0.160631 | 0.160631 | 0.439503 | 0.022750 | 0.009999 | 1.0038 |
| classic-pivot | strength | EFFICIENT | 160.30 | 1.380993 | 0.108887 | 0.160988 | -0.160988 | 0.000257 | 0.022750 | 0.000005 | 0.9964 |
| classic-pivot | weakness | CHOPPY | 772.80 | 1.388299 | 0.050457 | 0.155151 | 0.155151 | 0.854133 | 0.022750 | 0.019432 | 1.0092 |
| rsi-14-30-70 | strength | CHOPPY | 308.80 | 1.395201 | 0.079894 | 0.153969 | -0.153969 | 0.000045 | 0.022750 | 0.000001 | 1.0056 |
| rsi-14-30-70 | weakness | EFFICIENT | 513.90 | 1.400452 | 0.062030 | 0.152056 | 0.152056 | 0.674540 | 0.022750 | 0.013854 | 1.0043 |
| williams-r-fade | strength | CHOPPY | 1442.70 | 1.409394 | 0.037011 | 0.150604 | -0.150604 | 0.000000 | 0.022750 | 0.000000 | 0.9984 |
| williams-r-fade | weakness | EFFICIENT | 451.60 | 1.410024 | 0.066584 | 0.150670 | 0.150670 | 0.604612 | 0.022750 | 0.012511 | 1.0035 |
| engulfing | strength | CHOPPY | 67.20 | 1.391442 | 0.170681 | 0.140196 | -0.140196 | 0.002396 | 0.022750 | 0.000054 | 1.0003 |
| engulfing | weakness | EFFICIENT | 12.50 | 1.412403 | 0.417230 | 0.137919 | 0.137919 | 0.049327 | 0.022750 | 0.001122 | 1.0000 |
| morning-evening-star | strength | CHOPPY | 942.90 | 1.418769 | 0.046339 | 0.146896 | -0.146896 | 0.000000 | 0.022750 | 0.000000 | 1.0030 |
| morning-evening-star | weakness | EFFICIENT | 269.00 | 1.395213 | 0.085682 | 0.146719 | 0.146719 | 0.389191 | 0.022750 | 0.008008 | 1.0044 |
| three-soldiers-crows | strength | CHOPPY | 88.30 | 1.369258 | 0.145898 | 0.145757 | -0.145757 | 0.001359 | 0.022750 | 0.000031 | 0.9993 |
| three-soldiers-crows | weakness | EFFICIENT | 21.70 | 1.441407 | 0.312829 | 0.146422 | 0.146422 | 0.063388 | 0.022750 | 0.001320 | 0.9952 |

### Observed excesses for the 14 confirmed strategy-level cells

`SE_excess = excessR / tExcess`; the frozen single-gate boundary is 2 SE. “Above boundary” is `tExcess−2`, in SE units. These are post-selection observations: every listed cell necessarily cleared tExcess>2.

| Condition | World | Card | Half / state | n | Excess R | SE_excess R | Excess / SE | Above 2-SE gate |
|---|---:|---|---|---:|---:|---:|---:|---:|
| A | 1 | donchian-55 | weakness / CHOPPY | 971 | 0.094932 | 0.043611 | 2.1768 | 0.1768 SE |
| A | 2 | classic-pivot | weakness / CHOPPY | 769 | 0.136849 | 0.047747 | 2.8661 | 0.8661 SE |
| A | 6 | macd-cross | weakness / CHOPPY | 1043 | 0.087127 | 0.042511 | 2.0495 | 0.0495 SE |
| A | 7 | london-orb-30 | weakness / CHOPPY | 967 | 0.099105 | 0.044332 | 2.2355 | 0.2355 SE |
| A | 7 | bb-squeeze-fade | weakness / EFFICIENT | 165 | 0.280909 | 0.101408 | 2.7701 | 0.7701 SE |
| A | 7 | classic-pivot | weakness / CHOPPY | 790 | 0.166570 | 0.048151 | 3.4593 | 1.4593 SE |
| A | 7 | rsi-14-30-70 | weakness / EFFICIENT | 510 | 0.138373 | 0.062218 | 2.2240 | 0.2240 SE |
| B | 1 | bollinger-20-2 | weakness / EFFICIENT | 242 | 0.402816 | 0.080507 | 5.0035 | 3.0035 SE |
| B | 1 | keltner-20-atr | weakness / EFFICIENT | 282 | 0.238028 | 0.082093 | 2.8995 | 0.8995 SE |
| B | 1 | bb-squeeze-fade | weakness / EFFICIENT | 163 | 0.444736 | 0.097800 | 4.5474 | 2.5474 SE |
| B | 1 | rsi-14-30-70 | weakness / EFFICIENT | 569 | 0.265789 | 0.057024 | 4.6610 | 2.6610 SE |
| B | 2 | bb-squeeze-fade | weakness / EFFICIENT | 165 | 0.196400 | 0.093908 | 2.0914 | 0.0914 SE |
| B | 6 | donchian-20 | weakness / CHOPPY | 1540 | 0.077812 | 0.035153 | 2.2135 | 0.2135 SE |
| B | 10 | classic-pivot | weakness / CHOPPY | 738 | 0.125426 | 0.048878 | 2.5661 | 0.5661 SE |

The observed excesses range from 2.0495 to 5.0582 SE: they exceed the single-gate t>2 boundary by 0.0495–3.0582 SE. That is more extreme than the null-gate mean of 2.275% would commonly produce, but it is a selected set from 440 A cell-world tests (plus B tests), not 14 pre-specified single tests.

### CR1 inflation

| Pool | Finite cell-world ratios | Mean CR1/plain SE | Min | Max |
|---|---:|---:|---:|---:|
| strength | 220 | 1.002684 | 0.8989 | 1.0662 |
| weakness | 218 | 1.000811 | 0.9514 | 1.0530 |
| pooled | 438 | 1.001752 | 0.8989 | 1.0662 |

Clustering is behaving in this diagnostic: the pooled CR1/plain ratio is 1.001752 (range 0.8989–1.0662), not a material downward SE distortion. It does not explain the confirmations.

## 1b.2 — Criterion scale and counting object

The saved Stage 3a `cardConfirmedCount` counts unique card IDs with at least one strategy-level diagnostic half `CONFIRMED`; the 0.700 mean / max 4 therefore counts card-level diagnostics, not official family verdicts. Per world there are **22 cards × 2 halves = 44 strategy-level claim cells**. The authoritative family × verdict-state grid has **8 families × 2 halves = 16 rows**. The strategy-level 44-cell search is the relevant multiplicity for the reported card count; the criteria were not derived/calibrated to the family-pooled 16-row count or to a stated familywise error target.

| A-only model check over 10 worlds | Probability |
|---|---:|
| Expected false unique-card confirmations per world, λ | 0.281701 |
| Expected false card-half cell confirmations per world | 0.281706 |
| Expected total across 10 worlds | 2.817011 |
| Observed total = 7 (mean 0.700), exact Poisson probability | 0.016698 |
| Observed total ≥7, tail probability | 0.025110 |
| Maximum ≥4 across 10 worlds | 0.002095 |
| Both total ≥7 and maximum ≥4 | 0.001004 |
| Current mean criterion fails (total ≥6) | 0.066604 |
| Current max criterion fails (max ≥3) | 0.029800 |
| Current two-part criterion fails (mean >0.5 OR max >2) | 0.067167 |

Thus 0.700 / 4 is a rare joint tail result under this approximation (about 0.10%), but it is within the model, not outside its support. The current `mean≤0.5, max≤2` rule was not calibrated to 44 cell tests: under λ=0.281701 its approximate ten-world false-fail rate is 6.72%. The count should be compared with **λ=0.281701 unique diagnostic cards/world**, derived by summing the 44 cell joint probabilities per world and combining the two halves by card; this is a model reference, not a changed acceptance threshold.

### Explicit checks for the proposed verifier/generator defects

- **Segment/warm-up leakage:** both card signals and random candidates use `eligibleEntryRange(segment.bars.length)`, with local entry index ≥1,000 and the 96-bar tail inside that segment; `computeFeatures` and exit resolution receive one segment at a time. No boundary crossing was found.
- **Random-control candidate set:** the control does not draw only from card-signal bars. It samples the eligible bar universe per segment × entry year × session × volatility regime, separately by side, then remaps each sampled local entry to the same Map state and drops UNKNOWN before constructing fine matched cells. Card trades are the card’s emitted signal bars, one slot per card. These are intentionally different candidate sets for a random-entry comparison, matched on the frozen state/side/session/volatility/year axes; this is not evidence of a leaked or mislabeled control. The sampled random control is with replacement and is not subject to the card-specific one-slot blocking; that is the frozen random-entry null design (not a signal-bar placebo), and no claim is made that it reproduces the slot-selected signal-time distribution exactly.
- **Entry-state timing:** strategy trades carry `signal.fourState` and `signal.verdictState` from `signalIndex` in `normalizeStrategyTrade`; random entries use `states[record.localIndex]`. Both use the entry bar, not the exit or a future bar.
- **Weakness sign:** `verifyClaim` computes `signed = netR * direction`, with +1 for strength and −1 for weakness. Thus negative raw net under the weakness null becomes positive signed `+cost`; the implementation agrees with the model, not the opposite sign.
- **CR1/day:** `clusterSe` groups by EAT calendar day and includes the finite-sample `G/(G−1)` correction. The measured clustered/plain ratios in the tables above are centered at 1.001752 pooled.

## 1b.3 — Closure: conclusion (i)

**Conclusion (i): the anomaly is explained by the 44-cell multiplicity plus the direction-aware net gate; no parameter is outside the A null model.** I withdraw the earlier classification (ii) as an explanation of the anomaly. The B pilot/scored construction difference noted in Part 1 cannot explain condition A, which has no drift parameter and accounts for 7 of the 14 observed confirmations. A’s own signed-cost asymmetry predicts weakness net-gate probability 0.578 versus strength 0.00113, while every half must still pass the 2.275% excess gate. The A model gives strength-confirmation λ≈0.000560 and weakness-confirmation λ≈0.281146 per world: over ten worlds, P(no strength confirmation)≈0.9944 and P(at least 7 weakness confirmations)≈0.02488, joint≈0.02474 under independent Poisson counts. This accounts for A’s 7 weakness / 0 strength result. The observed 7 A weakness confirmations have P(total≥7)=0.0251 under total λ. The maximum of 4 makes the joint event rarer (about 0.0010), but no warm-up leak, wrong sign, material CR1 underestimation, or other demonstrated verifier defect was found. No bar, generator, threshold, or code is changed in this part.

## 1b.4 — Dated proposal only; pending owner approval

**Proposed criterion (not effective and not applied):** on ten no-edge worlds, count unique strategy-level confirmed card IDs and compare with `λ=0.2817011047` computed from the 44 card-half tests. Require (a) mean confirmed cards/world `≤ max(0.5, 1.5λ) = 0.500`; and (b) maximum per world `≤ k`, where k is the smallest integer `k≥2` satisfying `P(Poisson(λ)>k)<0.001`. Here `P(X>2)=0.003021` and `P(X>3)=0.000210`, so `k=3`. This is a proposal for owner approval only; no current Stage 3 criterion is replaced.

**Data preflight:** `npm run mc:a8-audit` failed before opening any bars with the exact error: `Error: missing /home/user/System/artifacts/map-compass/normalized/xauusd-m30-eat.csv; run the appropriate M1/Map inputs first`. Per the task’s explicit instruction, `mc:m1` and `mc:map` were not run. The existing committed segment-audit artifact reports 131,922 total bars, 127,538 eligible, 4,000 warm-up exclusions and 384 tail exclusions. This Part 1b used synthetic A/B diagnostics only; its no-real-data scope filter was `condition === "A_ZERO_DRIFT"` for λ, with no market bars loaded. The frozen DEV year filter, if/when real computations are separately authorized, is `{2004,2005,2006,2007,2009,2010,2011,2013,2014,2015,2017,2018}`, split into 2004–2007, 2009–2011, 2013–2015 and 2017–2018 before any signal/trade computation.

**STOP:** preregistration only. No Stage 3 rerun, no Part 4, and no Stage 4. Await the owner’s approval of the proposed criterion.
