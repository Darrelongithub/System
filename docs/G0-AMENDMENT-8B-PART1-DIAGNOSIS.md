# G0 Amendment 8B — Part 1 diagnosis (report only)

**Part 1 report; no production-code changes were made.** All replay data are synthetic. No real DEV bars/outcomes were read. The saved Stage 3a JSON omitted per-cell verifier rows, so this report deterministically replayed the exact saved A/B seeds and verified that each replayed strategy-level confirmed-card list matched the saved Stage 3a artifact.

## 1(a,b). Counting unit and every A/B confirmation

Stage 3a `cardConfirmedCount` was computed from strategy-level rows whose verdict was `CONFIRMED`, then deduplicated by `claimId`. The measured object was unique card IDs with at least one card-specific strategy-level diagnostic half confirmed, after evaluating 44 strategy-level cells (22 cards × strength/weakness half; each half uses its frozen verdict state). It was **not** the official family-pooled center verdict. The criterion says “confirmed cards per world”, so the unique-card numerator matches that literal count, but it is a diagnostic card-level verdict, not an authoritative A8 family × verdict-state verdict. Official center rows are family-pooled and repeated on each variant card. A had 0 official family rows confirmed in every world; B had 11 confirmed rows across worlds 1–2, representing 4 unique family × half × verdict-state cells (below).

| Condition | World | Unique card count | Strategy-level CONFIRMED cells (card / half / verdict state) | Official family-pooled rows CONFIRMED |
|---|--:|--:|---|--:|
| A | 1 | 1 | donchian-55 / weakness / CHOPPY | 0 |
| A | 2 | 1 | classic-pivot / weakness / CHOPPY | 0 |
| A | 3 | 0 | none | 0 |
| A | 4 | 0 | none | 0 |
| A | 5 | 0 | none | 0 |
| A | 6 | 1 | macd-cross / weakness / CHOPPY | 0 |
| A | 7 | 4 | london-orb-30 / weakness / CHOPPY; bb-squeeze-fade / weakness / EFFICIENT; classic-pivot / weakness / CHOPPY; rsi-14-30-70 / weakness / EFFICIENT | 0 |
| A | 8 | 0 | none | 0 |
| A | 9 | 0 | none | 0 |
| A | 10 | 0 | none | 0 |
| B | 1 | 4 | bollinger-20-2 / weakness / EFFICIENT; keltner-20-atr / weakness / EFFICIENT; bb-squeeze-fade / weakness / EFFICIENT; rsi-14-30-70 / weakness / EFFICIENT | 8 |
| B | 2 | 1 | bb-squeeze-fade / weakness / EFFICIENT | 3 |
| B | 3 | 0 | none | 0 |
| B | 4 | 0 | none | 0 |
| B | 5 | 0 | none | 0 |
| B | 6 | 1 | donchian-20 / weakness / CHOPPY | 0 |
| B | 7 | 0 | none | 0 |
| B | 8 | 0 | none | 0 |
| B | 9 | 0 | none | 0 |
| B | 10 | 1 | classic-pivot / weakness / CHOPPY | 0 |

### Strategy-level confirmed-cell statistics

| Condition | World | Card | Half | Verdict state | n | Signed net mean R | tNet (CR1/day) | Signed excess R | tExcess (CR1/day) | Net gate | Excess gate | Other vetoes |
|---|--:|---|---|---|--:|--:|--:|--:|--:|---|---|---|
| A | 1 | donchian-55 | weakness | CHOPPY | 971 | 0.253161 | 5.8075 | 0.094932 | 2.1768 | PASS | PASS | none |
| A | 2 | classic-pivot | weakness | CHOPPY | 769 | 0.317895 | 6.6283 | 0.136849 | 2.8661 | PASS | PASS | none |
| A | 6 | macd-cross | weakness | CHOPPY | 1043 | 0.260523 | 6.1420 | 0.087127 | 2.0495 | PASS | PASS | none |
| A | 7 | london-orb-30 | weakness | CHOPPY | 967 | 0.261385 | 5.8842 | 0.099105 | 2.2355 | PASS | PASS | none |
| A | 7 | bb-squeeze-fade | weakness | EFFICIENT | 165 | 0.400334 | 3.9347 | 0.280909 | 2.7701 | PASS | PASS | none |
| A | 7 | classic-pivot | weakness | CHOPPY | 790 | 0.299455 | 6.2043 | 0.166570 | 3.4593 | PASS | PASS | none |
| A | 7 | rsi-14-30-70 | weakness | EFFICIENT | 510 | 0.255079 | 4.0995 | 0.138373 | 2.2240 | PASS | PASS | none |
| B | 1 | bollinger-20-2 | weakness | EFFICIENT | 242 | 0.451291 | 5.5695 | 0.402816 | 5.0035 | PASS | PASS | none |
| B | 1 | keltner-20-atr | weakness | EFFICIENT | 282 | 0.332791 | 4.0849 | 0.238028 | 2.8995 | PASS | PASS | none |
| B | 1 | bb-squeeze-fade | weakness | EFFICIENT | 163 | 0.508789 | 5.1904 | 0.444736 | 4.5474 | PASS | PASS | none |
| B | 1 | rsi-14-30-70 | weakness | EFFICIENT | 569 | 0.350235 | 6.2000 | 0.265789 | 4.6610 | PASS | PASS | none |
| B | 2 | bb-squeeze-fade | weakness | EFFICIENT | 165 | 0.481978 | 5.0802 | 0.196400 | 2.0914 | PASS | PASS | none |
| B | 6 | donchian-20 | weakness | CHOPPY | 1540 | 0.211156 | 5.8218 | 0.077812 | 2.2135 | PASS | PASS | none |
| B | 10 | classic-pivot | weakness | CHOPPY | 738 | 0.336500 | 6.7869 | 0.125426 | 2.5661 | PASS | PASS | none |

All 14 strategy-level confirmed cells passed both numeric gates and had no vetoes. Every one was a WEAKNESS half; in claim-signed space a raw net loss becomes positive.

### Official family-pooled confirmed cells

A had none. B’s 11 confirmed card rows collapse to these four unique family cells:

| Condition | World | Family | Half | Verdict state | n | Signed net mean R | tNet | Signed excess R | tExcess | Numeric gates |
|---|--:|---|---|---|--:|--:|--:|--:|--:|---|
| B | 1 | band-reversion | weakness | EFFICIENT | 687 | 0.416291 | 6.0920 | 0.345120 | 5.0582 | net PASS; excess PASS; no vetoes (3 repeated card rows) |
| B | 1 | osc-fade | weakness | EFFICIENT | 1073 | 0.239087 | 6.9946 | 0.185223 | 5.4138 | net PASS; excess PASS; no vetoes (2 repeated card rows) |
| B | 1 | candlestick-reversal | weakness | EFFICIENT | 333 | 0.253864 | 3.4272 | 0.202588 | 2.8009 | net PASS; excess PASS; no vetoes (3 repeated card rows) |
| B | 2 | band-reversion | weakness | EFFICIENT | 611 | 0.436853 | 6.2733 | 0.162132 | 2.3673 | net PASS; excess PASS; no vetoes (3 repeated card rows) |

## 1(c). Analytic false-confirmation expectation

For each of the 44 card × claim-half cells, the replay supplies n, signed SD, actual per-trade mean cost and the exact calendar-day CR1 SE. With zero gross edge, raw net mean is `−meanCostR`; in verifier-signed space the null mean is `direction × (−meanCostR)` (so a weakness half has positive signed cost, not negative). The net-gate probability uses the verifier’s normal approximation with the cell CR1 SE and acceptance threshold `max(+0.10R, 2 × SE_CR1)`. Under the matched-control null, the excess-gate probability is `Φ(−2)=0.0227501`. Cell probabilities are multiplied (independence approximation) and summed; concentration and LOYO veto probabilities are omitted, making λ an upper-bound estimate. The two half-cell probabilities are combined for each card, then summed over 22 unique cards.

| Quantity | Value |
|---|---:|
| Average card-cell n across 440 A cells | 486.69 |
| Average SD of signed net R | 1.389721 |
| Average mean cost R | 0.153679 |
| Average cell CR1 SE | 0.120725 |
| Average CR1/plain-SE inflation | 1.001752 |
| One-sided excess-gate probability at t>2 | 0.0227501 |
| λ expected false CONFIRMED claim cells/world (44 cells) | 0.281706 |
| λ expected unique cards/world | 0.281701 |
| Observed A mean / max confirmed cards | 0.700 / 4 |
| Poisson mean across ten worlds (10λ) | 2.817011 |
| P(total exactly 7; observed mean 0.700) | 0.016698 |
| P(total ≥7; observed mean at least 0.700) | 0.025110 |
| P(max exactly 4 across 10 worlds) | 0.001978 |
| P(max ≥4 across 10 worlds) | 0.002095 |
| Single-world P(X≥4), equivalently P(X>3) | 0.000210 |

If conclusion (i) were selected, the pre-authorized thresholds derived from this λ would be mean ≤ `max(0.5,1.5λ)=0.500` and max ≤ `k=3` (`P(X>2)=0.003021`, `P(X>3)=0.000210`). The observed A summary (0.700, max 4) would still fail them. These replacement thresholds are **not activated** because the diagnosis below selects (ii).

## 1(d). Purity of A/B bars and random-entry outcomes

Returns are M30 close-minus-open price deltas, computed independently within each synthetic segment. Lag-1 autocorrelation is on bar deltas; VRq is variance of q-bar sums divided by q times one-bar variance; trend persistence is the fraction of adjacent, non-overlapping 8-bar blocks with same-sign cumulative return. B’s reference uses the same per-segment Gaussian noise arrays at zero drift, the same ATR scale and the same OHLC/M15 code path.

| Condition | Random long n | Mean gross R | Mean cost R | Mean net R | Random short n | Mean gross R | Mean cost R | Mean net R | acf1 | VR8 | VR16 | 8→next-8 sign persistence | Pure-RW acf1 / VR8 / VR16 / persistence |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|
| A | 6010.3 | -0.0388 | 0.1546 | -0.1934 | 6020.6 | -0.0227 | 0.1547 | -0.1774 | 0.000938 | 1.002447 | 1.003821 | 0.497067 | 0.000938 / 1.002447 / 1.003821 / 0.497067 |
| B | 5598.4 | 0.2573 | 0.1583 | 0.0990 | 5587.9 | -0.2832 | 0.1585 | -0.4417 | 0.000739 | 1.006944 | 1.006819 | 0.504293 | 0.000739 / 1.006944 / 1.006819 / 0.497360 |

A has near-zero bar-return persistence: acf≈0, VR8/16≈1, and sign persistence≈0.5. Its random-entry net means are close to cost drag (long −0.1934R vs cost 0.1546R; short −0.1774R vs cost 0.1547R), with small negative gross sampling means. B has the same white-noise variance ratios/acf as its paired pure-RW reference; upward drift raises sign persistence slightly. The diagnostic `meanRange` field was a mislabel: it equals mean absolute close-open change, not high-low range. The report uses the accurate close-open statistic only and does not rely on it as an ATR proxy.

**B calibration mismatch:** Stage 3a calibration reported +0.1492R from its pilot, but scored B worlds averaged +0.0990R on actual matched long entries (target about +0.15R). Code review found that the calibration used fixed M15 sub-bar seed 88201 rather than the scored world’s `seed+71`, and calibrated on all eligible bars before the production pipeline’s UNKNOWN-state random-entry exclusion. This is a generator/calibration mismatch. The existing calibration and scored-control construction are not the same code path.

## 1(e). Conclusion — (ii) generator defect

The A bar process itself is a pure random walk at the requested ATR scale, and the verifier’s CR1/day and segment-local state path show no defect in the checked diagnostics. The selected classification is **(ii)** because the B drift calibrator did not reproduce the scored random-control construction, so its “about +0.15R” condition was not actually achieved in the scored worlds. The weakness-only A confirmations are consistent with the calculated multiple-cell null rate at a low but nonzero tail probability; there is no evidence here of a verifier defect.

**Required one fix cycle (Part 2):** calibrate B against the exact 60,000-bar production random-control pipeline, including world-specific synthetic M15 construction and exclusion of UNKNOWN-bin entries, using pilot seeds disjoint from scored seeds. Keep A/B confirmation criteria unchanged under classification (ii). No bar, rule, cost, threshold, card, or verifier changes. Part 2 must finish and be committed before the single Part 4 run.

Replay JSON: `artifacts/map-compass/a8-stage3b-part1-diagnostics.json`. No Stage 4 output was created.
