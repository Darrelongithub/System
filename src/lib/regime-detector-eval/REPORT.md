# Market-regime detector evaluation

**Scope:** market statistics only; no trade, strategy, R, P&L, or backtester data was used as an evaluation input or result. The evaluation ran against an immutable pre-registered specification and a hash-pinned OHLC archive.

## Executive result

The guide makes no explicit claim about what happens *after* any label. Under the preregistered rule, all six labels are therefore **DESCRIPTIVE-ONLY**. The forward tables are provided as requested conditional market statistics, but they are not treated as predictive pass/fail tests. The causality check recorded 0 mismatches and is CLEAN; sample cells below 200 non-overlapping windows are marked THIN.

The frozen benchmark bars remain documented but are inapplicable without an explicit forward claim: the hypothesized sign, 95% CI excluding the unconditional value, effect beyond the relevant B3 tail, and an effect at least as large as B2; FVRR thresholds of ≥1.15 (high-volatility) or ≤0.90 (calm); and, for a directional claim, bullish-minus-bearish SATR ≥0.10 ATR at H=240. Claim-bearing tests would have to meet the preregistered H1/H2 and horizon requirements. No bar is used to turn these descriptive results into predictive validation.

## 1. Provenance and frozen inputs

- Input: XAUUSD_30min_2020-01-24_to_2026-10-01.csv — SHA-256 cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3 (verified).
- Parsed OHLC rows: 79,586; EAT coverage 2020-01-24 05:00:00 through 2026-10-01 15:00:00; documented section lines skipped: 2,443.
- Volume: no volume column; all detector volume values are null. Only timestamp and raw OHLC enter the detector; reliability and every derived/annotation column are ignored.
- Detector tree SHA-256: 05134d0d8201dfb368579bcf373fc52a406c1c4d49b3576ad1bc8cbc5e0993f1; defaults SHA-256: 7504bf25fb8875ee6e5c2eb211ad50581b00f2edd7052a943ae8fc7fefa452fe.
- Frozen default configuration: frozen-default-config.json; exact detector copy: frozen-detector/.
- Threshold/window line inventory and source-history limitation: [PROVENANCE.md](./PROVENANCE.md).
- Preregister: [SPEC-RD.md](./SPEC-RD.md), SHA-256 0f5bd4bd5e02c9a30a7a63f70195a79313289279cb2ba427047cd3bb9c4a923f (verified by the run script and recorded in [SPEC-RD.sha256](./SPEC-RD.sha256)).
- The detector/guide were untracked at the start and have no available Git path history. It is not possible to establish whether thresholds were ever chosen/tuned after viewing XAUUSD gold data or on what period; no evidence of such tuning was found in the available detector/guide materials. This is unknown, not proof of no tuning.

## 2. Part 1 — pre-registered claim map and verdicts

The guide describes current-state evidence and explicitly recommends separate validation before strategy use; it does not state forward continuation, expansion, persistence, or mean-reversion claims. No claim was invented from a regime name.

| Label | Guide-derived forward claim | Verdict |
| --- | --- | --- |
| bullish-trend | No explicit forward claim in the guide | DESCRIPTIVE-ONLY |
| bearish-trend | No explicit forward claim in the guide | DESCRIPTIVE-ONLY |
| range | No explicit forward claim in the guide | DESCRIPTIVE-ONLY |
| high-volatility | No explicit forward claim in the guide | DESCRIPTIVE-ONLY |
| compression | No explicit forward claim in the guide | DESCRIPTIVE-ONLY |
| transition | No explicit forward claim in the guide | DESCRIPTIVE-ONLY |

## 3. Part 2 — causality and description

- Execution: 19 isolated Node processes with batch sizes 5, 20; the exact deterministic cutpoint set was revalidated and merged.
- Truncation checks: 200 unique cut points; 8,645,440 prefix bar-state comparisons.
- Prefix truncation mismatches: **0** bar-state differences; 0/200 cut points affected.
- Random-suffix mutation mismatches: **0** bar-state differences; 0/200 cut points affected.
- Total mismatches: **0**; causal check clean: **YES**.
- Seeds: cut points 0xca05a1; suffix mutation 0x5eedc0de ^ cutoff. Prefix/suffix fields compared at every bar through each cutoff: committed label, candidate, changed flag, pending regime/count, confidence, and candidate confidence.

Seeds and the exact 200 cut indexes are retained in [part2-results.json](./part2-results.json). This checks committed label/candidate/hysteresis state and scores on prefixes; it does not certify the detector against any external causal implementation.

### Label frequencies and flips (all years)

| Scope | Bars | Committed label | Count | Share | Transition share | Flips | Flips / 1,000 bars |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FULL | 79,586 | bullish-trend | 17,953 | 22.56% | 20.18% | 6,891 | 86.586 |
| FULL | 79,586 | bearish-trend | 13,959 | 17.54% | 20.18% | 6,891 | 86.586 |
| FULL | 79,586 | range | 8,979 | 11.28% | 20.18% | 6,891 | 86.586 |
| FULL | 79,586 | high-volatility | 11,327 | 14.23% | 20.18% | 6,891 | 86.586 |
| FULL | 79,586 | compression | 11,307 | 14.21% | 20.18% | 6,891 | 86.586 |
| FULL | 79,586 | transition | 16,061 | 20.18% | 20.18% | 6,891 | 86.586 |
| Y2020 | 11,095 | bullish-trend | 2,776 | 25.02% | 19.89% | 914 | 82.379 |
| Y2020 | 11,095 | bearish-trend | 1,692 | 15.25% | 19.89% | 914 | 82.379 |
| Y2020 | 11,095 | range | 1,406 | 12.67% | 19.89% | 914 | 82.379 |
| Y2020 | 11,095 | high-volatility | 1,513 | 13.64% | 19.89% | 914 | 82.379 |
| Y2020 | 11,095 | compression | 1,501 | 13.53% | 19.89% | 914 | 82.379 |
| Y2020 | 11,095 | transition | 2,207 | 19.89% | 19.89% | 914 | 82.379 |
| Y2021 | 11,584 | bullish-trend | 2,485 | 21.45% | 19.79% | 1,026 | 88.570 |
| Y2021 | 11,584 | bearish-trend | 2,057 | 17.76% | 19.79% | 1,026 | 88.570 |
| Y2021 | 11,584 | range | 1,383 | 11.94% | 19.79% | 1,026 | 88.570 |
| Y2021 | 11,584 | high-volatility | 1,732 | 14.95% | 19.79% | 1,026 | 88.570 |
| Y2021 | 11,584 | compression | 1,635 | 14.11% | 19.79% | 1,026 | 88.570 |
| Y2021 | 11,584 | transition | 2,292 | 19.79% | 19.79% | 1,026 | 88.570 |
| Y2022 | 11,779 | bullish-trend | 2,326 | 19.75% | 20.71% | 1,074 | 91.179 |
| Y2022 | 11,779 | bearish-trend | 2,360 | 20.04% | 20.71% | 1,074 | 91.179 |
| Y2022 | 11,779 | range | 1,390 | 11.80% | 20.71% | 1,074 | 91.179 |
| Y2022 | 11,779 | high-volatility | 1,588 | 13.48% | 20.71% | 1,074 | 91.179 |
| Y2022 | 11,779 | compression | 1,676 | 14.23% | 20.71% | 1,074 | 91.179 |
| Y2022 | 11,779 | transition | 2,439 | 20.71% | 20.71% | 1,074 | 91.179 |
| Y2023 | 11,662 | bullish-trend | 2,288 | 19.62% | 19.77% | 1,070 | 91.751 |
| Y2023 | 11,662 | bearish-trend | 2,197 | 18.84% | 19.77% | 1,070 | 91.751 |
| Y2023 | 11,662 | range | 1,190 | 10.20% | 19.77% | 1,070 | 91.751 |
| Y2023 | 11,662 | high-volatility | 1,923 | 16.49% | 19.77% | 1,070 | 91.751 |
| Y2023 | 11,662 | compression | 1,759 | 15.08% | 19.77% | 1,070 | 91.751 |
| Y2023 | 11,662 | transition | 2,305 | 19.77% | 19.77% | 1,070 | 91.751 |
| Y2024 | 11,810 | bullish-trend | 2,869 | 24.29% | 19.25% | 1,085 | 91.871 |
| Y2024 | 11,810 | bearish-trend | 1,764 | 14.94% | 19.25% | 1,085 | 91.871 |
| Y2024 | 11,810 | range | 1,343 | 11.37% | 19.25% | 1,085 | 91.871 |
| Y2024 | 11,810 | high-volatility | 1,798 | 15.22% | 19.25% | 1,085 | 91.871 |
| Y2024 | 11,810 | compression | 1,762 | 14.92% | 19.25% | 1,085 | 91.871 |
| Y2024 | 11,810 | transition | 2,274 | 19.25% | 19.25% | 1,085 | 91.871 |
| Y2025 | 12,187 | bullish-trend | 3,380 | 27.73% | 20.41% | 949 | 77.870 |
| Y2025 | 12,187 | bearish-trend | 1,898 | 15.57% | 20.41% | 949 | 77.870 |
| Y2025 | 12,187 | range | 1,438 | 11.80% | 20.41% | 949 | 77.870 |
| Y2025 | 12,187 | high-volatility | 1,539 | 12.63% | 20.41% | 949 | 77.870 |
| Y2025 | 12,187 | compression | 1,445 | 11.86% | 20.41% | 949 | 77.870 |
| Y2025 | 12,187 | transition | 2,487 | 20.41% | 20.41% | 949 | 77.870 |
| Y2026 | 9,469 | bullish-trend | 1,829 | 19.32% | 21.72% | 772 | 81.529 |
| Y2026 | 9,469 | bearish-trend | 1,991 | 21.03% | 21.72% | 772 | 81.529 |
| Y2026 | 9,469 | range | 829 | 8.75% | 21.72% | 772 | 81.529 |
| Y2026 | 9,469 | high-volatility | 1,234 | 13.03% | 21.72% | 772 | 81.529 |
| Y2026 | 9,469 | compression | 1,529 | 16.15% | 21.72% | 772 | 81.529 |
| Y2026 | 9,469 | transition | 2,057 | 21.72% | 21.72% | 772 | 81.529 |

### Run lengths (all years)

Weekday equivalents are nominal 30-minute weekday bars (bars / 48), not elapsed calendar weekdays. Annual runs are clipped at year boundaries; clipped fragments are retained.

| Scope | Label | Runs | Length in bars (n · p10 · median · p90) | Nominal 30-min weekdays (bars / 48) |
| --- | --- | --- | --- | --- |
| FULL | bullish-trend | 1,169 | 1,169 · p10 4.0 · med 12.0 · p90 30.0 | 1,169 · p10 0.1 · med 0.3 · p90 0.6 |
| FULL | bearish-trend | 1,012 | 1,012 · p10 4.0 · med 11.0 · p90 27.0 | 1,012 · p10 0.1 · med 0.2 · p90 0.6 |
| FULL | range | 808 | 808 · p10 4.0 · med 9.0 · p90 21.3 | 808 · p10 0.1 · med 0.2 · p90 0.4 |
| FULL | high-volatility | 1,119 | 1,119 · p10 3.0 · med 8.0 · p90 19.0 | 1,119 · p10 0.1 · med 0.2 · p90 0.4 |
| FULL | compression | 1,325 | 1,325 · p10 3.0 · med 7.0 · p90 16.0 | 1,325 · p10 0.1 · med 0.1 · p90 0.3 |
| FULL | transition | 1,459 | 1,459 · p10 4.0 · med 9.0 · p90 21.0 | 1,459 · p10 0.1 · med 0.2 · p90 0.4 |
| Y2020 | bullish-trend | 161 | 161 · p10 4.0 · med 15.0 · p90 33.0 | 161 · p10 0.1 · med 0.3 · p90 0.7 |
| Y2020 | bearish-trend | 127 | 127 · p10 4.0 · med 11.0 · p90 23.4 | 127 · p10 0.1 · med 0.2 · p90 0.5 |
| Y2020 | range | 121 | 121 · p10 5.0 · med 9.0 · p90 20.0 | 121 · p10 0.1 · med 0.2 · p90 0.4 |
| Y2020 | high-volatility | 143 | 143 · p10 3.0 · med 8.0 · p90 21.4 | 143 · p10 0.1 · med 0.2 · p90 0.4 |
| Y2020 | compression | 172 | 172 · p10 3.0 · med 7.0 · p90 16.0 | 172 · p10 0.1 · med 0.1 · p90 0.3 |
| Y2020 | transition | 191 | 191 · p10 4.0 · med 9.0 · p90 22.0 | 191 · p10 0.1 · med 0.2 · p90 0.5 |
| Y2021 | bullish-trend | 162 | 162 · p10 4.0 · med 13.0 · p90 29.9 | 162 · p10 0.1 · med 0.3 · p90 0.6 |
| Y2021 | bearish-trend | 163 | 163 · p10 4.0 · med 10.0 · p90 24.8 | 163 · p10 0.1 · med 0.2 · p90 0.5 |
| Y2021 | range | 114 | 114 · p10 4.0 · med 10.0 · p90 23.0 | 114 · p10 0.1 · med 0.2 · p90 0.5 |
| Y2021 | high-volatility | 168 | 168 · p10 3.0 · med 8.5 · p90 19.3 | 168 · p10 0.1 · med 0.2 · p90 0.4 |
| Y2021 | compression | 200 | 200 · p10 3.0 · med 7.0 · p90 15.0 | 200 · p10 0.1 · med 0.1 · p90 0.3 |
| Y2021 | transition | 220 | 220 · p10 3.0 · med 9.0 · p90 20.0 | 220 · p10 0.1 · med 0.2 · p90 0.4 |
| Y2022 | bullish-trend | 160 | 160 · p10 4.0 · med 12.0 · p90 27.0 | 160 · p10 0.1 · med 0.3 · p90 0.6 |
| Y2022 | bearish-trend | 184 | 184 · p10 4.3 · med 10.0 · p90 24.7 | 184 · p10 0.1 · med 0.2 · p90 0.5 |
| Y2022 | range | 126 | 126 · p10 4.0 · med 9.0 · p90 20.0 | 126 · p10 0.1 · med 0.2 · p90 0.4 |
| Y2022 | high-volatility | 173 | 173 · p10 3.0 · med 8.0 · p90 18.0 | 173 · p10 0.1 · med 0.2 · p90 0.4 |
| Y2022 | compression | 204 | 204 · p10 3.0 · med 6.0 · p90 16.0 | 204 · p10 0.1 · med 0.1 · p90 0.3 |
| Y2022 | transition | 228 | 228 · p10 4.0 · med 9.0 · p90 21.0 | 228 · p10 0.1 · med 0.2 · p90 0.4 |
| Y2023 | bullish-trend | 171 | 171 · p10 4.0 · med 11.0 · p90 25.0 | 171 · p10 0.1 · med 0.2 · p90 0.5 |
| Y2023 | bearish-trend | 155 | 155 · p10 4.0 · med 11.0 · p90 26.6 | 155 · p10 0.1 · med 0.2 · p90 0.6 |
| Y2023 | range | 116 | 116 · p10 3.5 · med 8.5 · p90 19.0 | 116 · p10 0.1 · med 0.2 · p90 0.4 |
| Y2023 | high-volatility | 194 | 194 · p10 4.0 · med 8.0 · p90 17.7 | 194 · p10 0.1 · med 0.2 · p90 0.4 |
| Y2023 | compression | 208 | 208 · p10 3.0 · med 7.0 · p90 16.0 | 208 · p10 0.1 · med 0.1 · p90 0.3 |
| Y2023 | transition | 227 | 227 · p10 4.0 · med 8.0 · p90 19.0 | 227 · p10 0.1 · med 0.2 · p90 0.4 |
| Y2024 | bullish-trend | 203 | 203 · p10 5.0 · med 12.0 · p90 27.8 | 203 · p10 0.1 · med 0.3 · p90 0.6 |
| Y2024 | bearish-trend | 134 | 134 · p10 4.0 · med 10.0 · p90 28.7 | 134 · p10 0.1 · med 0.2 · p90 0.6 |
| Y2024 | range | 137 | 137 · p10 3.0 · med 8.0 · p90 18.4 | 137 · p10 0.1 · med 0.2 · p90 0.4 |
| Y2024 | high-volatility | 178 | 178 · p10 3.0 · med 8.0 · p90 19.0 | 178 · p10 0.1 · med 0.2 · p90 0.4 |
| Y2024 | compression | 209 | 209 · p10 3.0 · med 7.0 · p90 16.0 | 209 · p10 0.1 · med 0.1 · p90 0.3 |
| Y2024 | transition | 225 | 225 · p10 4.0 · med 8.0 · p90 18.0 | 225 · p10 0.1 · med 0.2 · p90 0.4 |
| Y2025 | bullish-trend | 196 | 196 · p10 5.0 · med 13.0 · p90 37.5 | 196 · p10 0.1 · med 0.3 · p90 0.8 |
| Y2025 | bearish-trend | 121 | 121 · p10 5.0 · med 13.0 · p90 26.0 | 121 · p10 0.1 · med 0.3 · p90 0.5 |
| Y2025 | range | 122 | 122 · p10 4.0 · med 10.0 · p90 22.0 | 122 · p10 0.1 · med 0.2 · p90 0.5 |
| Y2025 | high-volatility | 150 | 150 · p10 3.0 · med 8.0 · p90 20.1 | 150 · p10 0.1 · med 0.2 · p90 0.4 |
| Y2025 | compression | 161 | 161 · p10 3.0 · med 7.0 · p90 18.0 | 161 · p10 0.1 · med 0.1 · p90 0.4 |
| Y2025 | transition | 200 | 200 · p10 4.0 · med 10.5 · p90 22.1 | 200 · p10 0.1 · med 0.2 · p90 0.5 |
| Y2026 | bullish-trend | 118 | 118 · p10 5.0 · med 13.0 · p90 33.0 | 118 · p10 0.1 · med 0.3 · p90 0.7 |
| Y2026 | bearish-trend | 128 | 128 · p10 3.7 · med 13.0 · p90 32.2 | 128 · p10 0.1 · med 0.3 · p90 0.7 |
| Y2026 | range | 73 | 73 · p10 4.0 · med 9.0 · p90 22.0 | 73 · p10 0.1 · med 0.2 · p90 0.5 |
| Y2026 | high-volatility | 114 | 114 · p10 3.0 · med 8.0 · p90 20.7 | 114 · p10 0.1 · med 0.2 · p90 0.4 |
| Y2026 | compression | 171 | 171 · p10 4.0 · med 7.0 · p90 16.0 | 171 · p10 0.1 · med 0.1 · p90 0.3 |
| Y2026 | transition | 169 | 169 · p10 4.0 · med 10.0 · p90 23.0 | 169 · p10 0.1 · med 0.2 · p90 0.5 |

### Confidence distributions (all years)

The detector's confidence is a rule-support score, not a probability. Rows show n, mean, P10, P50, P90.

| Scope | Committed label | Confidence (n · mean · p10 · p50 · p90) |
| --- | --- | --- |
| FULL | ALL | 79,586 · 0.5602 · 0.0000 · 0.5770 · 0.9000 |
| FULL | bullish-trend | 17,953 · 0.6652 · 0.4794 · 0.6554 · 0.8707 |
| FULL | bearish-trend | 13,959 · 0.6478 · 0.4550 · 0.6428 · 0.8425 |
| FULL | range | 8,979 · 0.8030 · 0.5175 · 0.8750 · 0.9500 |
| FULL | high-volatility | 11,327 · 0.4330 · 0.0000 · 0.5754 · 0.8769 |
| FULL | compression | 11,307 · 0.4091 · 0.0000 · 0.0000 · 0.9532 |
| FULL | transition | 16,061 · 0.4270 · 0.3438 · 0.4416 · 0.4755 |
| Y2020 | ALL | 11,095 · 0.5632 · 0.0000 · 0.5768 · 0.9105 |
| Y2020 | bullish-trend | 2,776 · 0.6622 · 0.4775 · 0.6579 · 0.8572 |
| Y2020 | bearish-trend | 1,692 · 0.6177 · 0.4532 · 0.6007 · 0.8010 |
| Y2020 | range | 1,406 · 0.8268 · 0.5500 · 0.8750 · 0.9750 |
| Y2020 | high-volatility | 1,513 · 0.4318 · 0.0000 · 0.5745 · 0.8950 |
| Y2020 | compression | 1,501 · 0.4109 · 0.0000 · 0.0000 · 0.9601 |
| Y2020 | transition | 2,207 · 0.4229 · 0.3387 · 0.4400 · 0.4750 |
| Y2021 | ALL | 11,584 · 0.5624 · 0.0000 · 0.5808 · 0.9030 |
| Y2021 | bullish-trend | 2,485 · 0.6605 · 0.4903 · 0.6475 · 0.8557 |
| Y2021 | bearish-trend | 2,057 · 0.6606 · 0.4749 · 0.6576 · 0.8446 |
| Y2021 | range | 1,383 · 0.8084 · 0.5250 · 0.8750 · 0.9600 |
| Y2021 | high-volatility | 1,732 · 0.4307 · 0.0000 · 0.5764 · 0.8808 |
| Y2021 | compression | 1,635 · 0.4098 · 0.0000 · 0.0000 · 0.9544 |
| Y2021 | transition | 2,292 · 0.4278 · 0.3418 · 0.4454 · 0.4770 |
| Y2022 | ALL | 11,779 · 0.5635 · 0.0000 · 0.5796 · 0.9000 |
| Y2022 | bullish-trend | 2,326 · 0.6575 · 0.4827 · 0.6469 · 0.8518 |
| Y2022 | bearish-trend | 2,360 · 0.6591 · 0.4625 · 0.6535 · 0.8504 |
| Y2022 | range | 1,390 · 0.8034 · 0.5250 · 0.8750 · 0.9500 |
| Y2022 | high-volatility | 1,588 · 0.4349 · 0.0000 · 0.5753 · 0.8650 |
| Y2022 | compression | 1,676 · 0.4188 · 0.0000 · 0.0000 · 0.9559 |
| Y2022 | transition | 2,439 · 0.4276 · 0.3438 · 0.4400 · 0.4790 |
| Y2023 | ALL | 11,662 · 0.5496 · 0.0000 · 0.5735 · 0.8971 |
| Y2023 | bullish-trend | 2,288 · 0.6519 · 0.4738 · 0.6388 · 0.8493 |
| Y2023 | bearish-trend | 2,197 · 0.6653 · 0.4904 · 0.6607 · 0.8598 |
| Y2023 | range | 1,190 · 0.7924 · 0.5000 · 0.8750 · 0.9500 |
| Y2023 | high-volatility | 1,923 · 0.4282 · 0.0000 · 0.5742 · 0.8650 |
| Y2023 | compression | 1,759 · 0.3975 · 0.0000 · 0.0000 · 0.9443 |
| Y2023 | transition | 2,305 · 0.4299 · 0.3438 · 0.4482 · 0.4750 |
| Y2024 | ALL | 11,810 · 0.5542 · 0.0000 · 0.5751 · 0.9000 |
| Y2024 | bullish-trend | 2,869 · 0.6692 · 0.4941 · 0.6590 · 0.8665 |
| Y2024 | bearish-trend | 1,764 · 0.6344 · 0.4378 · 0.6222 · 0.8314 |
| Y2024 | range | 1,343 · 0.7914 · 0.5000 · 0.8750 · 0.9500 |
| Y2024 | high-volatility | 1,798 · 0.4302 · 0.0000 · 0.5737 · 0.8650 |
| Y2024 | compression | 1,762 · 0.3989 · 0.0000 · 0.0000 · 0.9443 |
| Y2024 | transition | 2,274 · 0.4253 · 0.3402 · 0.4400 · 0.4750 |
| Y2025 | ALL | 12,187 · 0.5718 · 0.0000 · 0.5817 · 0.9105 |
| Y2025 | bullish-trend | 3,380 · 0.6820 · 0.4722 · 0.6772 · 0.9042 |
| Y2025 | bearish-trend | 1,898 · 0.6328 · 0.4332 · 0.6275 · 0.8272 |
| Y2025 | range | 1,438 · 0.8022 · 0.5100 · 0.8750 · 0.9750 |
| Y2025 | high-volatility | 1,539 · 0.4212 · 0.0000 · 0.5695 · 0.8950 |
| Y2025 | compression | 1,445 · 0.4152 · 0.0000 · 0.0000 · 0.9556 |
| Y2025 | transition | 2,487 · 0.4264 · 0.3438 · 0.4415 · 0.4761 |
| Y2026 | ALL | 9,469 · 0.5556 · 0.0000 · 0.5718 · 0.9099 |
| Y2026 | bullish-trend | 1,829 · 0.6655 · 0.4571 · 0.6610 · 0.8865 |
| Y2026 | bearish-trend | 1,991 · 0.6540 · 0.4360 · 0.6584 · 0.8548 |
| Y2026 | range | 829 · 0.7883 · 0.4128 · 0.8750 · 0.9500 |
| Y2026 | high-volatility | 1,234 · 0.4616 · 0.0000 · 0.5902 · 0.8950 |
| Y2026 | compression | 1,529 · 0.4156 · 0.0000 · 0.0000 · 0.9556 |
| Y2026 | transition | 2,057 · 0.4292 · 0.3438 · 0.4428 · 0.4759 |

## 4. Part 3 — real-gold forward statistics

The exact formulas, horizons, non-overlapping schedule, scope boundary policy, B1/B2/B3 definitions, randomization seeds, uncertainty method and claim verdict bars are frozen in SPEC-RD.md. Statistics are computed on the committed label at close t and returns from t+1 onward. The outcome table is descriptive because no label has a guide-stated forward claim.

| Item | Result |
| --- | --- |
| Rows/cells | 380 |
| THIN cells (<200 non-overlapping starts) | 364 |
| H horizons | 48, 240 |
| Placebo shifts | 1000 unique offsets; D5=242 rows |
| Bootstrap | 2000 ISO EAT week-block resamples; 95% percentile intervals |
| Verdicts | All six labels DESCRIPTIVE-ONLY; Part 3 values are conditional descriptive statistics, not predictive claim tests |

### Forward realized-volatility ratio

| Scope | H | Label | n | n bull / bear | Conditional mean | B1 mean | Effect | 95% block CI (valid bootstrap n) | B2 comparator | B3 p05 / p95; observed rank (valid shifts) | Verdict / sample |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FULL | 48 | bullish-trend | 363 |  | 1.00151 | 1.00953 | 0.99205 | 0.95474 to 1.03069 (2,000/2,000 valid) | low n=646, mean=0.8501, vs B1=0.8420; high n=477, mean=1.2593, vs B1=1.2474 | 0.96317 / 1.03293; rank 36.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY |
| FULL | 48 | bearish-trend | 266 |  | 1.00567 | 1.00953 | 0.99618 | 0.95588 to 1.03706 (2,000/2,000 valid) | low n=646, mean=0.8501, vs B1=0.8420; high n=477, mean=1.2593, vs B1=1.2474 | 0.96062 / 1.04198; rank 44.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY |
| FULL | 48 | range | 175 |  | 0.98265 | 1.00953 | 0.97338 | 0.92972 to 1.01869 (2,000/2,000 valid) | low n=646, mean=0.8501, vs B1=0.8420; high n=477, mean=1.2593, vs B1=1.2474 | 0.95746 / 1.04577; rank 15.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| FULL | 48 | high-volatility | 255 |  | 1.11914 | 1.00953 | 1.10858 | 1.04831 to 1.18164 (2,000/2,000 valid) | low n=646, mean=0.8501, vs B1=0.8420; high n=477, mean=1.2593, vs B1=1.2474 | 0.95985 / 1.04675; rank 100.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY |
| FULL | 48 | compression | 205 |  | 0.99074 | 1.00953 | 0.98139 | 0.92534 to 1.04855 (2,000/2,000 valid) | low n=646, mean=0.8501, vs B1=0.8420; high n=477, mean=1.2593, vs B1=1.2474 | 0.95420 / 1.05051; rank 24.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY |
| FULL | 48 | transition | 344 |  | 0.96459 | 1.00953 | 0.95549 | 0.91832 to 0.99526 (2,000/2,000 valid) | low n=646, mean=0.8501, vs B1=0.8420; high n=477, mean=1.2593, vs B1=1.2474 | 0.96899 / 1.03355; rank 0.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY |
| FULL | 240 | bullish-trend | 75 |  | 1.01974 | 1.01337 | 1.00629 | 0.93475 to 1.08297 (2,000/2,000 valid) | low n=127, mean=0.8548, vs B1=0.8435; high n=99, mean=1.2308, vs B1=1.2146 | 0.94475 / 1.06494; rank 58.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| FULL | 240 | bearish-trend | 49 |  | 0.98901 | 1.01337 | 0.97596 | 0.91408 to 1.04216 (2,000/2,000 valid) | low n=127, mean=0.8548, vs B1=0.8435; high n=99, mean=1.2308, vs B1=1.2146 | 0.93411 / 1.07193; rank 31.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| FULL | 240 | range | 28 |  | 1.08661 | 1.01337 | 1.07228 | 0.90376 to 1.33140 (2,000/2,000 valid) | low n=127, mean=0.8548, vs B1=0.8435; high n=99, mean=1.2308, vs B1=1.2146 | 0.92067 / 1.09539; rank 90.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| FULL | 240 | high-volatility | 46 |  | 1.06116 | 1.01337 | 1.04716 | 0.95868 to 1.14368 (2,000/2,000 valid) | low n=127, mean=0.8548, vs B1=0.8435; high n=99, mean=1.2308, vs B1=1.2146 | 0.93017 / 1.08811; rank 84.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| FULL | 240 | compression | 45 |  | 0.98439 | 1.01337 | 0.97140 | 0.90963 to 1.03974 (2,000/2,000 valid) | low n=127, mean=0.8548, vs B1=0.8435; high n=99, mean=1.2308, vs B1=1.2146 | 0.92976 / 1.08600; rank 31.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| FULL | 240 | transition | 78 |  | 0.98478 | 1.01337 | 0.97180 | 0.91272 to 1.03470 (2,000/2,000 valid) | low n=127, mean=0.8548, vs B1=0.8435; high n=99, mean=1.2308, vs B1=1.2146 | 0.94218 / 1.06898; rank 23.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 48 | bullish-trend | 170 |  | 0.98956 | 0.98052 | 1.00922 | 0.96285 to 1.05325 (2,000/2,000 valid) | low n=326, mean=0.8548, vs B1=0.8718; high n=207, mean=1.1812, vs B1=1.2047 | 0.96090 / 1.04269; rank 65.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 48 | bearish-trend | 124 |  | 0.97593 | 0.98052 | 0.99532 | 0.95351 to 1.03910 (2,000/2,000 valid) | low n=326, mean=0.8548, vs B1=0.8718; high n=207, mean=1.1812, vs B1=1.2047 | 0.95236 / 1.04773; rank 45.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 48 | range | 91 |  | 0.96022 | 0.98052 | 0.97929 | 0.91727 to 1.04205 (2,000/2,000 valid) | low n=326, mean=0.8548, vs B1=0.8718; high n=207, mean=1.1812, vs B1=1.2047 | 0.94816 / 1.05667; rank 26.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 48 | high-volatility | 121 |  | 1.08081 | 0.98052 | 1.10227 | 1.03893 to 1.17754 (2,000/2,000 valid) | low n=326, mean=0.8548, vs B1=0.8718; high n=207, mean=1.1812, vs B1=1.2047 | 0.95006 / 1.05700; rank 99.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 48 | compression | 103 |  | 0.93970 | 0.98052 | 0.95837 | 0.90637 to 1.01359 (2,000/2,000 valid) | low n=326, mean=0.8548, vs B1=0.8718; high n=207, mean=1.1812, vs B1=1.2047 | 0.94539 / 1.05767; rank 10.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 48 | transition | 179 |  | 0.94114 | 0.98052 | 0.95984 | 0.92078 to 0.99835 (2,000/2,000 valid) | low n=326, mean=0.8548, vs B1=0.8718; high n=207, mean=1.1812, vs B1=1.2047 | 0.95989 / 1.04212; rank 4.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 240 | bullish-trend | 36 |  | 1.00313 | 0.98158 | 1.02195 | 0.93244 to 1.11711 (2,000/2,000 valid) | low n=65, mean=0.8654, vs B1=0.8817; high n=47, mean=1.1557, vs B1=1.1773 | 0.93535 / 1.06672; rank 71.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 240 | bearish-trend | 24 |  | 0.98850 | 0.98158 | 1.00704 | 0.92086 to 1.09770 (2,000/2,000 valid) | low n=65, mean=0.8654, vs B1=0.8817; high n=47, mean=1.1557, vs B1=1.1773 | 0.92691 / 1.07603; rank 58.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 240 | range | 11 |  | 0.96181 | 0.98158 | 0.97986 | 0.88910 to 1.07261 (2,000/2,000 valid) | low n=65, mean=0.8654, vs B1=0.8817; high n=47, mean=1.1557, vs B1=1.1773 | 0.89997 / 1.10674; rank 40.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 240 | high-volatility | 24 |  | 1.05029 | 0.98158 | 1.06999 | 0.96306 to 1.19359 (2,000/2,000 valid) | low n=65, mean=0.8654, vs B1=0.8817; high n=47, mean=1.1557, vs B1=1.1773 | 0.91359 / 1.09465; rank 89.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 240 | compression | 20 |  | 0.95474 | 0.98158 | 0.97265 | 0.88829 to 1.06128 (2,000/2,000 valid) | low n=65, mean=0.8654, vs B1=0.8817; high n=47, mean=1.1557, vs B1=1.1773 | 0.91690 / 1.09060; rank 33.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 240 | transition | 42 |  | 0.93786 | 0.98158 | 0.95546 | 0.89140 to 1.02089 (2,000/2,000 valid) | low n=65, mean=0.8654, vs B1=0.8817; high n=47, mean=1.1557, vs B1=1.1773 | 0.93304 / 1.07594; rank 13.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 48 | bullish-trend | 193 |  | 1.01203 | 1.03760 | 0.97536 | 0.92008 to 1.02889 (2,000/2,000 valid) | low n=319, mean=0.8451, vs B1=0.8145; high n=270, mean=1.3191, vs B1=1.2713 | 0.94874 / 1.05392; rank 22.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 48 | bearish-trend | 141 |  | 1.03273 | 1.03760 | 0.99531 | 0.93414 to 1.05630 (2,000/2,000 valid) | low n=319, mean=0.8451, vs B1=0.8145; high n=270, mean=1.3191, vs B1=1.2713 | 0.94555 / 1.07002; rank 45.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 48 | range | 84 |  | 1.00696 | 1.03760 | 0.97047 | 0.90828 to 1.03697 (2,000/2,000 valid) | low n=319, mean=0.8451, vs B1=0.8145; high n=270, mean=1.3191, vs B1=1.2713 | 0.93170 / 1.07162; rank 25.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 48 | high-volatility | 134 |  | 1.15376 | 1.03760 | 1.11195 | 1.01025 to 1.22853 (2,000/2,000 valid) | low n=319, mean=0.8451, vs B1=0.8145; high n=270, mean=1.3191, vs B1=1.2713 | 0.93420 / 1.06780; rank 99.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 48 | compression | 102 |  | 1.04228 | 1.03760 | 1.00451 | 0.91100 to 1.12764 (2,000/2,000 valid) | low n=319, mean=0.8451, vs B1=0.8145; high n=270, mean=1.3191, vs B1=1.2713 | 0.93018 / 1.08198; rank 55.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 48 | transition | 165 |  | 0.99004 | 1.03760 | 0.95416 | 0.88953 to 1.02324 (2,000/2,000 valid) | low n=319, mean=0.8451, vs B1=0.8145; high n=270, mean=1.3191, vs B1=1.2713 | 0.95126 / 1.05426; rank 6.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 240 | bullish-trend | 39 |  | 1.03507 | 1.04519 | 0.99032 | 0.88104 to 1.10933 (2,000/2,000 valid) | low n=61, mean=0.8441, vs B1=0.8076; high n=52, mean=1.2987, vs B1=1.2426 | 0.91404 / 1.11047; rank 46.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 240 | bearish-trend | 25 |  | 0.98950 | 1.04519 | 0.94672 | 0.85920 to 1.03966 (2,000/2,000 valid) | low n=61, mean=0.8441, vs B1=0.8076; high n=52, mean=1.2987, vs B1=1.2426 | 0.90227 / 1.12223; rank 23.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 240 | range | 17 |  | 1.16737 | 1.04519 | 1.11690 | 0.85945 to 1.50920 (2,000/2,000 valid) | low n=61, mean=0.8441, vs B1=0.8076; high n=52, mean=1.2987, vs B1=1.2426 | 0.87826 / 1.17049; rank 89.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 240 | high-volatility | 22 |  | 1.07301 | 1.04519 | 1.02663 | 0.90222 to 1.15574 (2,000/2,000 valid) | low n=61, mean=0.8441, vs B1=0.8076; high n=52, mean=1.2987, vs B1=1.2426 | 0.88815 / 1.13997; rank 68.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 240 | compression | 25 |  | 1.00810 | 1.04519 | 0.96452 | 0.87292 to 1.06265 (2,000/2,000 valid) | low n=61, mean=0.8441, vs B1=0.8076; high n=52, mean=1.2987, vs B1=1.2426 | 0.88307 / 1.15604; rank 36.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 240 | transition | 35 |  | 1.04588 | 1.04519 | 1.00066 | 0.89624 to 1.10469 (2,000/2,000 valid) | low n=61, mean=0.8441, vs B1=0.8076; high n=52, mean=1.2987, vs B1=1.2426 | 0.90678 / 1.11064; rank 54.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 48 | bullish-trend | 38 |  | 1.00881 | 0.92860 | 1.08638 | 0.95481 to 1.20769 (2,000/2,000 valid) | low n=91, mean=0.7432, vs B1=0.8003; high n=39, mean=1.3357, vs B1=1.4384 | 0.89604 / 1.11787; rank 90.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 48 | bearish-trend | 27 |  | 0.86579 | 0.92860 | 0.93237 | 0.83464 to 1.02237 (2,000/2,000 valid) | low n=91, mean=0.7432, vs B1=0.8003; high n=39, mean=1.3357, vs B1=1.4384 | 0.87913 / 1.13674; rank 21.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 48 | range | 22 |  | 0.87495 | 0.92860 | 0.94223 | 0.77635 to 1.11517 (2,000/2,000 valid) | low n=91, mean=0.7432, vs B1=0.8003; high n=39, mean=1.3357, vs B1=1.4384 | 0.85781 / 1.16678; rank 28.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 48 | high-volatility | 25 |  | 1.19074 | 0.92860 | 1.28229 | 1.09566 to 1.50950 (2,000/2,000 valid) | low n=91, mean=0.7432, vs B1=0.8003; high n=39, mean=1.3357, vs B1=1.4384 | 0.87465 / 1.16408; rank 99.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 48 | compression | 23 |  | 0.83288 | 0.92860 | 0.89692 | 0.75862 to 1.04126 (2,000/2,000 valid) | low n=91, mean=0.7432, vs B1=0.8003; high n=39, mean=1.3357, vs B1=1.4384 | 0.85560 / 1.17457; rank 11.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 48 | transition | 46 |  | 0.83025 | 0.92860 | 0.89409 | 0.79285 to 0.99509 (2,000/2,000 valid) | low n=91, mean=0.7432, vs B1=0.8003; high n=39, mean=1.3357, vs B1=1.4384 | 0.89938 / 1.12154; rank 4.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 240 | bullish-trend | 10 |  | 0.84613 | 0.92842 | 0.91137 | 0.75297 to 1.10017 (2,000/2,000 valid) | low n=19, mean=0.7713, vs B1=0.8307; high n=8, mean=1.3157, vs B1=1.4171 | 0.82171 / 1.20044; rank 22.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 240 | bearish-trend | 4 |  | 0.87400 | 0.92842 | 0.94139 | 0.62445 to 1.20773 (1,975/2,000 valid) | low n=19, mean=0.7713, vs B1=0.8307; high n=8, mean=1.3157, vs B1=1.4171 | 0.79323 / 1.23588; rank 38.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 240 | range | 2 |  | 1.00294 | 0.92842 | 1.08027 | 0.95409 to 1.22083 (1,744/2,000 valid) | low n=19, mean=0.7713, vs B1=0.8307; high n=8, mean=1.3157, vs B1=1.4171 | 0.71195 / 1.35365; rank 70.33%; 991/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 240 | high-volatility | 8 |  | 1.21767 | 0.92842 | 1.31156 | 1.04942 to 1.62787 (2,000/2,000 valid) | low n=19, mean=0.7713, vs B1=0.8307; high n=8, mean=1.3157, vs B1=1.4171 | 0.76940 / 1.28334; rank 95.98%; 994/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 240 | compression | 1 |  | 0.59239 | 0.92842 | 0.63807 | 0.57051 to 0.72010 (1,310/2,000 valid) | low n=19, mean=0.7713, vs B1=0.8307; high n=8, mean=1.3157, vs B1=1.4171 | 0.74544 / 1.33274; rank 1.41%; 996/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 240 | transition | 11 |  | 0.82964 | 0.92842 | 0.89361 | 0.73247 to 1.05583 (2,000/2,000 valid) | low n=19, mean=0.7713, vs B1=0.8307; high n=8, mean=1.3157, vs B1=1.4171 | 0.79809 / 1.24908; rank 21.39%; 996/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 48 | bullish-trend | 55 |  | 0.88316 | 0.97204 | 0.90856 | 0.85265 to 0.96731 (2,000/2,000 valid) | low n=94, mean=0.9130, vs B1=0.9392; high n=76, mean=1.0422, vs B1=1.0722 | 0.94498 / 1.05974; rank 0.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 48 | bearish-trend | 32 |  | 0.99461 | 0.97204 | 1.02321 | 0.94386 to 1.10914 (2,000/2,000 valid) | low n=94, mean=0.9130, vs B1=0.9392; high n=76, mean=1.0422, vs B1=1.0722 | 0.92821 / 1.06676; rank 72.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 48 | range | 25 |  | 1.03003 | 0.97204 | 1.05966 | 0.93639 to 1.18041 (2,000/2,000 valid) | low n=94, mean=0.9130, vs B1=0.9392; high n=76, mean=1.0422, vs B1=1.0722 | 0.91869 / 1.08756; rank 88.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 48 | high-volatility | 44 |  | 0.98179 | 0.97204 | 1.01002 | 0.91871 to 1.11292 (2,000/2,000 valid) | low n=94, mean=0.9130, vs B1=0.9392; high n=76, mean=1.0422, vs B1=1.0722 | 0.92781 / 1.08337; rank 58.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 48 | compression | 33 |  | 0.98079 | 0.97204 | 1.00900 | 0.92105 to 1.10881 (2,000/2,000 valid) | low n=94, mean=0.9130, vs B1=0.9392; high n=76, mean=1.0422, vs B1=1.0722 | 0.92451 / 1.08957; rank 58.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 48 | transition | 51 |  | 1.01125 | 0.97204 | 1.04034 | 0.98483 to 1.10167 (2,000/2,000 valid) | low n=94, mean=0.9130, vs B1=0.9392; high n=76, mean=1.0422, vs B1=1.0722 | 0.93661 / 1.06237; rank 87.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 240 | bullish-trend | 10 |  | 0.95168 | 0.96930 | 0.98182 | 0.87328 to 1.08845 (2,000/2,000 valid) | low n=19, mean=0.9336, vs B1=0.9631; high n=18, mean=1.0126, vs B1=1.0447 | 0.91871 / 1.09407; rank 35.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 240 | bearish-trend | 4 |  | 1.07463 | 0.96930 | 1.10867 | 0.75209 to 1.44319 (1,972/2,000 valid) | low n=19, mean=0.9336, vs B1=0.9631; high n=18, mean=1.0126, vs B1=1.0447 | 0.90657 / 1.10121; rank 95.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 240 | range | 5 |  | 0.91192 | 0.96930 | 0.94080 | 0.73200 to 1.10639 (1,989/2,000 valid) | low n=19, mean=0.9336, vs B1=0.9631; high n=18, mean=1.0126, vs B1=1.0447 | 0.86659 / 1.13680; rank 23.35%; 998/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 240 | high-volatility | 10 |  | 0.95250 | 0.96930 | 0.98266 | 0.88406 to 1.09218 (2,000/2,000 valid) | low n=19, mean=0.9336, vs B1=0.9631; high n=18, mean=1.0126, vs B1=1.0447 | 0.88470 / 1.12258; rank 40.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 240 | compression | 7 |  | 1.01690 | 0.96930 | 1.04911 | 0.94132 to 1.17643 (1,999/2,000 valid) | low n=19, mean=0.9336, vs B1=0.9631; high n=18, mean=1.0126, vs B1=1.0447 | 0.88712 / 1.12136; rank 78.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 240 | transition | 11 |  | 0.95809 | 0.96930 | 0.98843 | 0.91778 to 1.06073 (2,000/2,000 valid) | low n=19, mean=0.9336, vs B1=0.9631; high n=18, mean=1.0126, vs B1=1.0447 | 0.90523 / 1.09968; rank 41.83%; 997/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 48 | bullish-trend | 49 |  | 1.04210 | 1.02813 | 1.01359 | 0.93516 to 1.09685 (2,000/2,000 valid) | low n=85, mean=0.8818, vs B1=0.8577; high n=64, mean=1.2863, vs B1=1.2511 | 0.93210 / 1.07329; rank 62.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 48 | bearish-trend | 46 |  | 1.03750 | 1.02813 | 1.00911 | 0.93744 to 1.08162 (2,000/2,000 valid) | low n=85, mean=0.8818, vs B1=0.8577; high n=64, mean=1.2863, vs B1=1.2511 | 0.91863 / 1.08826; rank 60.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 48 | range | 31 |  | 0.97040 | 1.02813 | 0.94385 | 0.85557 to 1.02398 (2,000/2,000 valid) | low n=85, mean=0.8818, vs B1=0.8577; high n=64, mean=1.2863, vs B1=1.2511 | 0.90747 / 1.10460; rank 16.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 48 | high-volatility | 34 |  | 1.14917 | 1.02813 | 1.11772 | 1.00163 to 1.29186 (2,000/2,000 valid) | low n=85, mean=0.8818, vs B1=0.8577; high n=64, mean=1.2863, vs B1=1.2511 | 0.91639 / 1.08979; rank 97.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 48 | compression | 29 |  | 0.99769 | 1.02813 | 0.97039 | 0.87830 to 1.06851 (2,000/2,000 valid) | low n=85, mean=0.8818, vs B1=0.8577; high n=64, mean=1.2863, vs B1=1.2511 | 0.91003 / 1.10833; rank 38.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 48 | transition | 55 |  | 0.98163 | 1.02813 | 0.95476 | 0.88995 to 1.01574 (2,000/2,000 valid) | low n=85, mean=0.8818, vs B1=0.8577; high n=64, mean=1.2863, vs B1=1.2511 | 0.93397 / 1.07929; rank 12.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 240 | bullish-trend | 9 |  | 1.20126 | 1.03546 | 1.16011 | 0.92372 to 1.46707 (2,000/2,000 valid) | low n=16, mean=0.8764, vs B1=0.8464; high n=14, mean=1.2761, vs B1=1.2324 | 0.88299 / 1.13740; rank 97.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 240 | bearish-trend | 10 |  | 1.03940 | 1.03546 | 1.00380 | 0.88584 to 1.13804 (2,000/2,000 valid) | low n=16, mean=0.8764, vs B1=0.8464; high n=14, mean=1.2761, vs B1=1.2324 | 0.86504 / 1.18000; rank 58.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 240 | range | 3 |  | 1.02517 | 1.03546 | 0.99006 | 0.83664 to 1.12116 (1,909/2,000 valid) | low n=16, mean=0.8764, vs B1=0.8464; high n=14, mean=1.2761, vs B1=1.2324 | 0.84840 / 1.24227; rank 54.15%; 999/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 240 | high-volatility | 4 |  | 1.01150 | 1.03546 | 0.97686 | 0.77040 to 1.21897 (1,960/2,000 valid) | low n=16, mean=0.8764, vs B1=0.8464; high n=14, mean=1.2761, vs B1=1.2324 | 0.85453 / 1.20973; rank 49.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 240 | compression | 6 |  | 0.94522 | 1.03546 | 0.91285 | 0.77446 to 1.08671 (1,996/2,000 valid) | low n=16, mean=0.8764, vs B1=0.8464; high n=14, mean=1.2761, vs B1=1.2324 | 0.85058 / 1.23484; rank 24.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 240 | transition | 16 |  | 0.98151 | 1.03546 | 0.94789 | 0.83713 to 1.05632 (2,000/2,000 valid) | low n=16, mean=0.8764, vs B1=0.8464; high n=14, mean=1.2761, vs B1=1.2324 | 0.88107 / 1.16919; rank 28.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 48 | bullish-trend | 55 |  | 1.05267 | 0.99470 | 1.05828 | 0.97960 to 1.13909 (2,000/2,000 valid) | low n=114, mean=0.8878, vs B1=0.8925; high n=60, mean=1.2035, vs B1=1.2099 | 0.93421 / 1.07031; rank 91.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 48 | bearish-trend | 45 |  | 0.96522 | 0.99470 | 0.97037 | 0.90120 to 1.03133 (2,000/2,000 valid) | low n=114, mean=0.8878, vs B1=0.8925; high n=60, mean=1.2035, vs B1=1.2099 | 0.92325 / 1.08345; rank 27.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 48 | range | 24 |  | 0.97159 | 0.99470 | 0.97676 | 0.90202 to 1.04964 (2,000/2,000 valid) | low n=114, mean=0.8878, vs B1=0.8925; high n=60, mean=1.2035, vs B1=1.2099 | 0.91058 / 1.09465; rank 34.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 48 | high-volatility | 39 |  | 1.03169 | 0.99470 | 1.03719 | 0.95112 to 1.14493 (2,000/2,000 valid) | low n=114, mean=0.8878, vs B1=0.8925; high n=60, mean=1.2035, vs B1=1.2099 | 0.92284 / 1.08827; rank 78.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 48 | compression | 31 |  | 0.93845 | 0.99470 | 0.94345 | 0.86575 to 1.03014 (2,000/2,000 valid) | low n=114, mean=0.8878, vs B1=0.8925; high n=60, mean=1.2035, vs B1=1.2099 | 0.91782 / 1.09638; rank 15.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 48 | transition | 48 |  | 0.97374 | 0.99470 | 0.97893 | 0.88927 to 1.07457 (2,000/2,000 valid) | low n=114, mean=0.8878, vs B1=0.8925; high n=60, mean=1.2035, vs B1=1.2099 | 0.93922 / 1.06989; rank 30.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 240 | bullish-trend | 11 |  | 0.97903 | 0.99257 | 0.98636 | 0.89010 to 1.10769 (2,000/2,000 valid) | low n=21, mean=0.8607, vs B1=0.8671; high n=12, mean=1.1698, vs B1=1.1785 | 0.89838 / 1.10676; rank 43.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 240 | bearish-trend | 9 |  | 0.90669 | 0.99257 | 0.91348 | 0.82317 to 1.01981 (2,000/2,000 valid) | low n=21, mean=0.8607, vs B1=0.8671; high n=12, mean=1.1698, vs B1=1.1785 | 0.87957 / 1.12722; rank 12.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 240 | range | 4 |  | 0.87593 | 0.99257 | 0.88248 | 0.73787 to 1.00276 (1,964/2,000 valid) | low n=21, mean=0.8607, vs B1=0.8671; high n=12, mean=1.1698, vs B1=1.1785 | 0.85513 / 1.17970; rank 11.06%; 995/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 240 | high-volatility | 4 |  | 1.34735 | 0.99257 | 1.35744 | 0.95367 to 1.64256 (1,969/2,000 valid) | low n=21, mean=0.8607, vs B1=0.8671; high n=12, mean=1.1698, vs B1=1.1785 | 0.88043 / 1.15399; rank 99.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 240 | compression | 8 |  | 0.92221 | 0.99257 | 0.92911 | 0.82822 to 1.03413 (2,000/2,000 valid) | low n=21, mean=0.8607, vs B1=0.8671; high n=12, mean=1.1698, vs B1=1.1785 | 0.86342 / 1.16149; rank 22.32%; 999/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 240 | transition | 12 |  | 1.03692 | 0.99257 | 1.04468 | 0.93334 to 1.17041 (2,000/2,000 valid) | low n=21, mean=0.8607, vs B1=0.8671; high n=12, mean=1.1698, vs B1=1.1785 | 0.89380 / 1.10903; rank 75.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 48 | bullish-trend | 64 |  | 1.01182 | 1.02468 | 0.98745 | 0.92252 to 1.06059 (2,000/2,000 valid) | low n=78, mean=0.8964, vs B1=0.8748; high n=78, mean=1.1868, vs B1=1.1582 | 0.93465 / 1.06544; rank 39.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 48 | bearish-trend | 39 |  | 0.94679 | 1.02468 | 0.92399 | 0.83196 to 1.01932 (2,000/2,000 valid) | low n=78, mean=0.8964, vs B1=0.8748; high n=78, mean=1.1868, vs B1=1.1582 | 0.92577 / 1.07937; rank 4.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 48 | range | 21 |  | 1.12462 | 1.02468 | 1.09753 | 0.94981 to 1.24963 (2,000/2,000 valid) | low n=78, mean=0.8964, vs B1=0.8748; high n=78, mean=1.1868, vs B1=1.1582 | 0.91184 / 1.09839; rank 94.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 48 | high-volatility | 36 |  | 1.15832 | 1.02468 | 1.13042 | 1.02557 to 1.26036 (2,000/2,000 valid) | low n=78, mean=0.8964, vs B1=0.8748; high n=78, mean=1.1868, vs B1=1.1582 | 0.91753 / 1.08898; rank 98.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 48 | compression | 35 |  | 1.04638 | 1.02468 | 1.02118 | 0.93199 to 1.11022 (2,000/2,000 valid) | low n=78, mean=0.8964, vs B1=0.8748; high n=78, mean=1.1868, vs B1=1.1582 | 0.91489 / 1.10258; rank 66.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 48 | transition | 50 |  | 0.94850 | 1.02468 | 0.92566 | 0.85667 to 0.99318 (2,000/2,000 valid) | low n=78, mean=0.8964, vs B1=0.8748; high n=78, mean=1.1868, vs B1=1.1582 | 0.93165 / 1.06947; rank 3.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 240 | bullish-trend | 15 |  | 1.04911 | 1.02796 | 1.02058 | 0.90370 to 1.15190 (2,000/2,000 valid) | low n=13, mean=0.8853, vs B1=0.8612; high n=16, mean=1.1591, vs B1=1.1275 | 0.89391 / 1.11284; rank 65.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 240 | bearish-trend | 8 |  | 0.93479 | 1.02796 | 0.90937 | 0.78347 to 1.02286 (2,000/2,000 valid) | low n=13, mean=0.8853, vs B1=0.8612; high n=16, mean=1.1591, vs B1=1.1275 | 0.87751 / 1.14549; rank 12.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 240 | range | 3 |  | 1.12177 | 1.02796 | 1.09126 | 0.78094 to 1.43097 (1,919/2,000 valid) | low n=13, mean=0.8853, vs B1=0.8612; high n=16, mean=1.1591, vs B1=1.1275 | 0.84650 / 1.19706; rank 81.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 240 | high-volatility | 5 |  | 1.21735 | 1.02796 | 1.18424 | 0.89231 to 1.55309 (1,988/2,000 valid) | low n=13, mean=0.8853, vs B1=0.8612; high n=16, mean=1.1591, vs B1=1.1275 | 0.86108 / 1.19507; rank 94.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 240 | compression | 7 |  | 0.93030 | 1.02796 | 0.90499 | 0.79888 to 0.99800 (1,998/2,000 valid) | low n=13, mean=0.8853, vs B1=0.8612; high n=16, mean=1.1591, vs B1=1.1275 | 0.85101 / 1.17746; rank 16.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 240 | transition | 10 |  | 1.01629 | 1.02796 | 0.98865 | 0.88698 to 1.10177 (2,000/2,000 valid) | low n=13, mean=0.8853, vs B1=0.8612; high n=16, mean=1.1591, vs B1=1.1275 | 0.88717 / 1.13144; rank 46.25%; 999/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 48 | bullish-trend | 64 |  | 1.03346 | 1.05554 | 0.97908 | 0.87828 to 1.07859 (2,000/2,000 valid) | low n=112, mean=0.7884, vs B1=0.7470; high n=86, mean=1.4554, vs B1=1.3788 | 0.90768 / 1.09624; rank 37.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 48 | bearish-trend | 32 |  | 1.07212 | 1.05554 | 1.01572 | 0.86700 to 1.19576 (2,000/2,000 valid) | low n=112, mean=0.7884, vs B1=0.7470; high n=86, mean=1.4554, vs B1=1.3788 | 0.89415 / 1.11241; rank 59.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 48 | range | 29 |  | 0.99042 | 1.05554 | 0.93831 | 0.83060 to 1.04348 (2,000/2,000 valid) | low n=112, mean=0.7884, vs B1=0.7470; high n=86, mean=1.4554, vs B1=1.3788 | 0.87816 / 1.14505; rank 21.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 48 | high-volatility | 43 |  | 1.12901 | 1.05554 | 1.06961 | 0.93949 to 1.22883 (2,000/2,000 valid) | low n=112, mean=0.7884, vs B1=0.7470; high n=86, mean=1.4554, vs B1=1.3788 | 0.89052 / 1.11198; rank 83.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 48 | compression | 27 |  | 0.98572 | 1.05554 | 0.93386 | 0.77787 to 1.08007 (2,000/2,000 valid) | low n=112, mean=0.7884, vs B1=0.7470; high n=86, mean=1.4554, vs B1=1.3788 | 0.86382 / 1.14715; rank 24.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 48 | transition | 58 |  | 1.08133 | 1.05554 | 1.02443 | 0.89547 to 1.15623 (2,000/2,000 valid) | low n=112, mean=0.7884, vs B1=0.7470; high n=86, mean=1.4554, vs B1=1.3788 | 0.91222 / 1.09393; rank 67.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 240 | bullish-trend | 13 |  | 1.13117 | 1.06819 | 1.05896 | 0.81898 to 1.30936 (2,000/2,000 valid) | low n=21, mean=0.7845, vs B1=0.7344; high n=16, mean=1.5029, vs B1=1.4069 | 0.82943 / 1.19954; rank 71.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 240 | bearish-trend | 3 |  | 1.18814 | 1.06819 | 1.11229 | 0.96963 to 1.26731 (1,900/2,000 valid) | low n=21, mean=0.7845, vs B1=0.7344; high n=16, mean=1.5029, vs B1=1.4069 | 0.81052 / 1.22821; rank 80.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 240 | range | 6 |  | 0.92654 | 1.06819 | 0.86739 | 0.69161 to 1.06544 (1,998/2,000 valid) | low n=21, mean=0.7845, vs B1=0.7344; high n=16, mean=1.5029, vs B1=1.4069 | 0.76336 / 1.31324; rank 25.45%; 998/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 240 | high-volatility | 10 |  | 0.97035 | 1.06819 | 0.90841 | 0.75306 to 1.07990 (2,000/2,000 valid) | low n=21, mean=0.7845, vs B1=0.7344; high n=16, mean=1.5029, vs B1=1.4069 | 0.79178 / 1.27273; rank 29.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 240 | compression | 7 |  | 1.18147 | 1.06819 | 1.10605 | 0.85650 to 1.42015 (1,999/2,000 valid) | low n=21, mean=0.7845, vs B1=0.7344; high n=16, mean=1.5029, vs B1=1.4069 | 0.77489 / 1.28004; rank 78.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 240 | transition | 11 |  | 1.05517 | 1.06819 | 0.98781 | 0.75581 to 1.24822 (2,000/2,000 valid) | low n=21, mean=0.7845, vs B1=0.7344; high n=16, mean=1.5029, vs B1=1.4069 | 0.81825 / 1.21835; rank 49.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 48 | bullish-trend | 35 |  | 0.95996 | 1.04665 | 0.91717 | 0.75711 to 1.07413 (2,000/2,000 valid) | low n=67, mean=0.8438, vs B1=0.8062; high n=74, mean=1.3123, vs B1=1.2538 | 0.87036 / 1.15129; rank 20.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 48 | bearish-trend | 44 |  | 1.10464 | 1.04665 | 1.05540 | 0.91370 to 1.18472 (2,000/2,000 valid) | low n=67, mean=0.8438, vs B1=0.8062; high n=74, mean=1.3123, vs B1=1.2538 | 0.85726 / 1.20847; rank 72.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 48 | range | 23 |  | 0.92283 | 1.04665 | 0.88169 | 0.77289 to 0.99183 (2,000/2,000 valid) | low n=67, mean=0.8438, vs B1=0.8062; high n=74, mean=1.3123, vs B1=1.2538 | 0.83996 / 1.23078; rank 15.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 48 | high-volatility | 34 |  | 1.26058 | 1.04665 | 1.20439 | 0.90731 to 1.56422 (2,000/2,000 valid) | low n=67, mean=0.8438, vs B1=0.8062; high n=74, mean=1.3123, vs B1=1.2538 | 0.84427 / 1.22844; rank 93.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 48 | compression | 25 |  | 1.14878 | 1.04665 | 1.09757 | 0.83358 to 1.53456 (2,000/2,000 valid) | low n=67, mean=0.8438, vs B1=0.8062; high n=74, mean=1.3123, vs B1=1.2538 | 0.84654 / 1.22763; rank 77.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 48 | transition | 36 |  | 0.86623 | 1.04665 | 0.82761 | 0.71982 to 0.93466 (2,000/2,000 valid) | low n=67, mean=0.8438, vs B1=0.8062; high n=74, mean=1.3123, vs B1=1.2538 | 0.86830 / 1.15702; rank 1.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 240 | bullish-trend | 7 |  | 0.92567 | 1.06511 | 0.86908 | 0.63445 to 1.14598 (1,999/2,000 valid) | low n=14, mean=0.8811, vs B1=0.8272; high n=15, mean=1.2402, vs B1=1.1644 | 0.79773 / 1.36225; rank 23.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 240 | bearish-trend | 8 |  | 1.05950 | 1.06511 | 0.99473 | 0.78437 to 1.23106 (2,000/2,000 valid) | low n=14, mean=0.8811, vs B1=0.8272; high n=15, mean=1.2402, vs B1=1.1644 | 0.77458 / 1.47331; rank 69.67%; 999/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 240 | range | 5 |  | 1.67118 | 1.06511 | 1.56901 | 0.74788 to 2.76107 (1,995/2,000 valid) | low n=14, mean=0.8811, vs B1=0.8272; high n=15, mean=1.2402, vs B1=1.1644 | 0.74458 / 1.59854; rank 94.35%; 991/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 240 | high-volatility | 4 |  | 0.83231 | 1.06511 | 0.78143 | 0.64152 to 0.93425 (1,980/2,000 valid) | low n=14, mean=0.8811, vs B1=0.8272; high n=15, mean=1.2402, vs B1=1.1644 | 0.75664 / 1.53478; rank 7.44%; 994/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 240 | compression | 7 |  | 0.94316 | 1.06511 | 0.88551 | 0.72968 to 1.04744 (1,999/2,000 valid) | low n=14, mean=0.8811, vs B1=0.8272; high n=15, mean=1.2402, vs B1=1.1644 | 0.76390 / 1.56045; rank 36.91%; 997/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 240 | transition | 7 |  | 1.03304 | 1.06511 | 0.96989 | 0.72628 to 1.27180 (2,000/2,000 valid) | low n=14, mean=0.8811, vs B1=0.8272; high n=15, mean=1.2402, vs B1=1.1644 | 0.79110 / 1.40592; rank 57.16%; 999/1,000 valid | DESCRIPTIVE-ONLY · THIN |

### Forward trend efficiency

| Scope | H | Label | n | n bull / bear | Conditional mean | B1 mean | Effect | 95% block CI (valid bootstrap n) | B2 comparator | B3 p05 / p95; observed rank (valid shifts) | Verdict / sample |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FULL | 48 | bullish-trend | 363 |  | 0.16434 | 0.16282 | 0.00152 | -0.00968 to 0.01275 (2,000/2,000 valid) | n/a | -0.00903 / 0.00872; rank 63.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY |
| FULL | 48 | bearish-trend | 266 |  | 0.15330 | 0.16282 | -0.00952 | -0.02242 to 0.00380 (2,000/2,000 valid) | n/a | -0.01037 / 0.01081; rank 7.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY |
| FULL | 48 | range | 175 |  | 0.17850 | 0.16282 | 0.01568 | -0.00166 to 0.03421 (2,000/2,000 valid) | n/a | -0.01467 / 0.01524; rank 95.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| FULL | 48 | high-volatility | 255 |  | 0.16031 | 0.16282 | -0.00251 | -0.01768 to 0.01262 (2,000/2,000 valid) | n/a | -0.01220 / 0.01188; rank 37.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY |
| FULL | 48 | compression | 205 |  | 0.17017 | 0.16282 | 0.00735 | -0.00816 to 0.02427 (2,000/2,000 valid) | n/a | -0.01176 / 0.01216; rank 83.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY |
| FULL | 48 | transition | 344 |  | 0.15809 | 0.16282 | -0.00473 | -0.01567 to 0.00594 (2,000/2,000 valid) | n/a | -0.00989 / 0.01014; rank 23.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY |
| FULL | 240 | bullish-trend | 75 |  | 0.06786 | 0.07871 | -0.01085 | -0.02177 to 0.00076 (2,000/2,000 valid) | n/a | -0.00981 / 0.00996; rank 2.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| FULL | 240 | bearish-trend | 49 |  | 0.08364 | 0.07871 | 0.00494 | -0.00876 to 0.01783 (2,000/2,000 valid) | n/a | -0.01106 / 0.01146; rank 76.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| FULL | 240 | range | 28 |  | 0.08705 | 0.07871 | 0.00834 | -0.01423 to 0.03344 (2,000/2,000 valid) | n/a | -0.01504 / 0.01528; rank 82.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| FULL | 240 | high-volatility | 46 |  | 0.09555 | 0.07871 | 0.01684 | 0.00153 to 0.03242 (2,000/2,000 valid) | n/a | -0.01345 / 0.01395; rank 97.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| FULL | 240 | compression | 45 |  | 0.07683 | 0.07871 | -0.00187 | -0.01575 to 0.01279 (2,000/2,000 valid) | n/a | -0.01389 / 0.01259; rank 42.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| FULL | 240 | transition | 78 |  | 0.07419 | 0.07871 | -0.00452 | -0.01593 to 0.00789 (2,000/2,000 valid) | n/a | -0.00998 / 0.01121; rank 22.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 48 | bullish-trend | 170 |  | 0.16736 | 0.15905 | 0.00831 | -0.00762 to 0.02379 (2,000/2,000 valid) | n/a | -0.01303 / 0.01298; rank 85.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 48 | bearish-trend | 124 |  | 0.15811 | 0.15905 | -0.00094 | -0.01819 to 0.01760 (2,000/2,000 valid) | n/a | -0.01487 / 0.01520; rank 48.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 48 | range | 91 |  | 0.18067 | 0.15905 | 0.02162 | -0.00059 to 0.04509 (2,000/2,000 valid) | n/a | -0.01826 / 0.02010; rank 96.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 48 | high-volatility | 121 |  | 0.14960 | 0.15905 | -0.00945 | -0.03107 to 0.01247 (2,000/2,000 valid) | n/a | -0.01720 / 0.01651; rank 17.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 48 | compression | 103 |  | 0.15988 | 0.15905 | 0.00083 | -0.02038 to 0.02426 (2,000/2,000 valid) | n/a | -0.01715 / 0.01658; rank 54.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 48 | transition | 179 |  | 0.14672 | 0.15905 | -0.01233 | -0.02603 to 0.00183 (2,000/2,000 valid) | n/a | -0.01393 / 0.01423; rank 6.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 240 | bullish-trend | 36 |  | 0.06448 | 0.07299 | -0.00852 | -0.02284 to 0.00588 (2,000/2,000 valid) | n/a | -0.01286 / 0.01307; rank 13.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 240 | bearish-trend | 24 |  | 0.07292 | 0.07299 | -0.00008 | -0.01701 to 0.01573 (2,000/2,000 valid) | n/a | -0.01418 / 0.01518; rank 48.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 240 | range | 11 |  | 0.10325 | 0.07299 | 0.03026 | -0.01745 to 0.08149 (2,000/2,000 valid) | n/a | -0.02017 / 0.01883; rank 99.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 240 | high-volatility | 24 |  | 0.10426 | 0.07299 | 0.03127 | 0.01329 to 0.04977 (2,000/2,000 valid) | n/a | -0.01698 / 0.01778; rank 99.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 240 | compression | 20 |  | 0.07438 | 0.07299 | 0.00139 | -0.01833 to 0.02386 (2,000/2,000 valid) | n/a | -0.01766 / 0.01633; rank 58.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 240 | transition | 42 |  | 0.05389 | 0.07299 | -0.01911 | -0.03068 to -0.00748 (2,000/2,000 valid) | n/a | -0.01296 / 0.01380; rank 1.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 48 | bullish-trend | 193 |  | 0.16169 | 0.16649 | -0.00480 | -0.02076 to 0.01093 (2,000/2,000 valid) | n/a | -0.01344 / 0.01225; rank 31.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 48 | bearish-trend | 141 |  | 0.14917 | 0.16649 | -0.01732 | -0.03604 to 0.00319 (2,000/2,000 valid) | n/a | -0.01553 / 0.01562; rank 3.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 48 | range | 84 |  | 0.17615 | 0.16649 | 0.00966 | -0.01604 to 0.03413 (2,000/2,000 valid) | n/a | -0.01974 / 0.02256; rank 77.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 48 | high-volatility | 134 |  | 0.16999 | 0.16649 | 0.00350 | -0.01503 to 0.02395 (2,000/2,000 valid) | n/a | -0.01805 / 0.01690; rank 65.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 48 | compression | 102 |  | 0.18057 | 0.16649 | 0.01408 | -0.01018 to 0.04034 (2,000/2,000 valid) | n/a | -0.01657 / 0.01844; rank 89.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 48 | transition | 165 |  | 0.17043 | 0.16649 | 0.00394 | -0.01275 to 0.02074 (2,000/2,000 valid) | n/a | -0.01527 / 0.01458; rank 67.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 240 | bullish-trend | 39 |  | 0.07098 | 0.08467 | -0.01369 | -0.03007 to 0.00203 (2,000/2,000 valid) | n/a | -0.01488 / 0.01458; rank 6.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 240 | bearish-trend | 25 |  | 0.09394 | 0.08467 | 0.00927 | -0.01315 to 0.03167 (2,000/2,000 valid) | n/a | -0.01765 / 0.01679; rank 82.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 240 | range | 17 |  | 0.07656 | 0.08467 | -0.00811 | -0.03390 to 0.01886 (2,000/2,000 valid) | n/a | -0.02284 / 0.02277; rank 28.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 240 | high-volatility | 22 |  | 0.08605 | 0.08467 | 0.00138 | -0.02141 to 0.02586 (2,000/2,000 valid) | n/a | -0.01868 / 0.02173; rank 57.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 240 | compression | 25 |  | 0.07879 | 0.08467 | -0.00588 | -0.02515 to 0.01362 (2,000/2,000 valid) | n/a | -0.02070 / 0.02028; rank 32.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 240 | transition | 35 |  | 0.10058 | 0.08467 | 0.01591 | -0.00400 to 0.03911 (2,000/2,000 valid) | n/a | -0.01442 / 0.01706; rank 93.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 48 | bullish-trend | 38 |  | 0.15369 | 0.15753 | -0.00384 | -0.03774 to 0.03174 (2,000/2,000 valid) | n/a | -0.02636 / 0.02723; rank 43.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 48 | bearish-trend | 27 |  | 0.15735 | 0.15753 | -0.00019 | -0.03530 to 0.03661 (2,000/2,000 valid) | n/a | -0.03392 / 0.03482; rank 50.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 48 | range | 22 |  | 0.20422 | 0.15753 | 0.04669 | -0.00641 to 0.10336 (2,000/2,000 valid) | n/a | -0.04108 / 0.04349; rank 96.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 48 | high-volatility | 25 |  | 0.17462 | 0.15753 | 0.01708 | -0.02824 to 0.05940 (2,000/2,000 valid) | n/a | -0.03435 / 0.03778; rank 78.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 48 | compression | 23 |  | 0.12400 | 0.15753 | -0.03354 | -0.07960 to 0.01037 (2,000/2,000 valid) | n/a | -0.03748 / 0.03467; rank 7.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 48 | transition | 46 |  | 0.14597 | 0.15753 | -0.01156 | -0.04236 to 0.02129 (2,000/2,000 valid) | n/a | -0.02711 / 0.03251; rank 24.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 240 | bullish-trend | 10 |  | 0.05753 | 0.07907 | -0.02154 | -0.05331 to 0.00835 (2,000/2,000 valid) | n/a | -0.03108 / 0.03488; rank 13.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 240 | bearish-trend | 4 |  | 0.05439 | 0.07907 | -0.02468 | -0.07072 to 0.01565 (1,975/2,000 valid) | n/a | -0.03591 / 0.03956; rank 13.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 240 | range | 2 |  | 0.19565 | 0.07907 | 0.11658 | 0.07300 to 0.16369 (1,744/2,000 valid) | n/a | -0.05079 / 0.05566; rank 99.39%; 991/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 240 | high-volatility | 8 |  | 0.11784 | 0.07907 | 0.03877 | 0.00864 to 0.07303 (2,000/2,000 valid) | n/a | -0.04266 / 0.05035; rank 90.85%; 994/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 240 | compression | 1 |  | 0.00776 | 0.07907 | -0.07131 | -0.08899 to -0.05294 (1,310/2,000 valid) | n/a | -0.04363 / 0.04935; rank 0.40%; 996/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 240 | transition | 11 |  | 0.06471 | 0.07907 | -0.01436 | -0.04078 to 0.01025 (2,000/2,000 valid) | n/a | -0.03398 / 0.03751; rank 23.39%; 996/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 48 | bullish-trend | 55 |  | 0.16197 | 0.15984 | 0.00213 | -0.02535 to 0.02875 (2,000/2,000 valid) | n/a | -0.02220 / 0.02585; rank 55.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 48 | bearish-trend | 32 |  | 0.14675 | 0.15984 | -0.01310 | -0.04254 to 0.02171 (2,000/2,000 valid) | n/a | -0.02748 / 0.02838; rank 23.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 48 | range | 25 |  | 0.13255 | 0.15984 | -0.02729 | -0.05848 to 0.00862 (2,000/2,000 valid) | n/a | -0.03395 / 0.03917; rank 9.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 48 | high-volatility | 44 |  | 0.16844 | 0.15984 | 0.00860 | -0.02912 to 0.05144 (2,000/2,000 valid) | n/a | -0.03419 / 0.03426; rank 70.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 48 | compression | 33 |  | 0.20658 | 0.15984 | 0.04674 | 0.00390 to 0.09015 (2,000/2,000 valid) | n/a | -0.03234 / 0.03683; rank 98.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 48 | transition | 51 |  | 0.14147 | 0.15984 | -0.01837 | -0.04609 to 0.00650 (2,000/2,000 valid) | n/a | -0.02489 / 0.02601; rank 10.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 240 | bullish-trend | 10 |  | 0.08514 | 0.07157 | 0.01356 | -0.01663 to 0.04526 (2,000/2,000 valid) | n/a | -0.02405 / 0.02660; rank 82.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 240 | bearish-trend | 4 |  | 0.07970 | 0.07157 | 0.00813 | -0.02878 to 0.07378 (1,972/2,000 valid) | n/a | -0.02692 / 0.02971; rank 69.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 240 | range | 5 |  | 0.05778 | 0.07157 | -0.01379 | -0.05319 to 0.05403 (1,989/2,000 valid) | n/a | -0.03764 / 0.03942; rank 30.96%; 998/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 240 | high-volatility | 10 |  | 0.09159 | 0.07157 | 0.02002 | -0.00979 to 0.05096 (2,000/2,000 valid) | n/a | -0.03176 / 0.03430; rank 84.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 240 | compression | 7 |  | 0.07067 | 0.07157 | -0.00090 | -0.03521 to 0.03450 (1,999/2,000 valid) | n/a | -0.03270 / 0.03053; rank 49.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 240 | transition | 11 |  | 0.04493 | 0.07157 | -0.02664 | -0.04899 to -0.00559 (2,000/2,000 valid) | n/a | -0.02591 / 0.02618; rank 4.61%; 997/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 48 | bullish-trend | 49 |  | 0.16329 | 0.15432 | 0.00897 | -0.02103 to 0.03864 (2,000/2,000 valid) | n/a | -0.02259 / 0.02317; rank 74.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 48 | bearish-trend | 46 |  | 0.15221 | 0.15432 | -0.00211 | -0.02703 to 0.02439 (2,000/2,000 valid) | n/a | -0.02763 / 0.02819; rank 47.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 48 | range | 31 |  | 0.19979 | 0.15432 | 0.04546 | 0.00926 to 0.08619 (2,000/2,000 valid) | n/a | -0.03396 / 0.03494; rank 98.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 48 | high-volatility | 34 |  | 0.12277 | 0.15432 | -0.03155 | -0.06999 to 0.00846 (2,000/2,000 valid) | n/a | -0.02908 / 0.03049; rank 3.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 48 | compression | 29 |  | 0.15087 | 0.15432 | -0.00345 | -0.03439 to 0.03302 (2,000/2,000 valid) | n/a | -0.02997 / 0.02811; rank 42.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 48 | transition | 55 |  | 0.14379 | 0.15432 | -0.01053 | -0.03693 to 0.01451 (2,000/2,000 valid) | n/a | -0.02397 / 0.02535; rank 24.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 240 | bullish-trend | 9 |  | 0.04198 | 0.07073 | -0.02875 | -0.05202 to -0.00434 (2,000/2,000 valid) | n/a | -0.02202 / 0.02358; rank 2.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 240 | bearish-trend | 10 |  | 0.07701 | 0.07073 | 0.00627 | -0.02183 to 0.03421 (2,000/2,000 valid) | n/a | -0.02754 / 0.02924; rank 63.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 240 | range | 3 |  | 0.11681 | 0.07073 | 0.04608 | -0.03485 to 0.16731 (1,909/2,000 valid) | n/a | -0.03596 / 0.04246; rank 96.20%; 999/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 240 | high-volatility | 4 |  | 0.12979 | 0.07073 | 0.05906 | 0.03053 to 0.09433 (1,960/2,000 valid) | n/a | -0.03129 / 0.03497; rank 99.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 240 | compression | 6 |  | 0.08075 | 0.07073 | 0.01001 | -0.03040 to 0.06370 (1,996/2,000 valid) | n/a | -0.03295 / 0.03013; rank 73.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 240 | transition | 16 |  | 0.05583 | 0.07073 | -0.01491 | -0.03491 to 0.00391 (2,000/2,000 valid) | n/a | -0.02296 / 0.02825; rank 15.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 48 | bullish-trend | 55 |  | 0.18308 | 0.16782 | 0.01527 | -0.01376 to 0.04825 (2,000/2,000 valid) | n/a | -0.02307 / 0.02484; rank 85.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 48 | bearish-trend | 45 |  | 0.17003 | 0.16782 | 0.00221 | -0.03116 to 0.03843 (2,000/2,000 valid) | n/a | -0.02839 / 0.02971; rank 56.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 48 | range | 24 |  | 0.17497 | 0.16782 | 0.00716 | -0.03727 to 0.04458 (2,000/2,000 valid) | n/a | -0.03684 / 0.03890; rank 61.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 48 | high-volatility | 39 |  | 0.13973 | 0.16782 | -0.02809 | -0.05702 to 0.00081 (2,000/2,000 valid) | n/a | -0.03066 / 0.03259; rank 7.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 48 | compression | 31 |  | 0.15493 | 0.16782 | -0.01289 | -0.05095 to 0.02383 (2,000/2,000 valid) | n/a | -0.03023 / 0.03254; rank 24.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 48 | transition | 48 |  | 0.17582 | 0.16782 | 0.00800 | -0.02309 to 0.04234 (2,000/2,000 valid) | n/a | -0.02366 / 0.02666; rank 67.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 240 | bullish-trend | 11 |  | 0.07301 | 0.08679 | -0.01377 | -0.04196 to 0.01205 (2,000/2,000 valid) | n/a | -0.02505 / 0.02796; rank 19.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 240 | bearish-trend | 9 |  | 0.09044 | 0.08679 | 0.00365 | -0.01922 to 0.02596 (2,000/2,000 valid) | n/a | -0.02968 / 0.03395; rank 61.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 240 | range | 4 |  | 0.09533 | 0.08679 | 0.00855 | -0.03735 to 0.04089 (1,964/2,000 valid) | n/a | -0.03531 / 0.03869; rank 69.55%; 995/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 240 | high-volatility | 4 |  | 0.11555 | 0.08679 | 0.02877 | -0.05796 to 0.18769 (1,969/2,000 valid) | n/a | -0.03497 / 0.03859; rank 90.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 240 | compression | 8 |  | 0.09187 | 0.08679 | 0.00508 | -0.02655 to 0.03587 (2,000/2,000 valid) | n/a | -0.03451 / 0.03873; rank 62.76%; 999/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 240 | transition | 12 |  | 0.08085 | 0.08679 | -0.00594 | -0.03688 to 0.02695 (2,000/2,000 valid) | n/a | -0.02629 / 0.03129; rank 34.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 48 | bullish-trend | 64 |  | 0.16047 | 0.16625 | -0.00578 | -0.03321 to 0.02073 (2,000/2,000 valid) | n/a | -0.02396 / 0.02340; rank 34.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 48 | bearish-trend | 39 |  | 0.14364 | 0.16625 | -0.02262 | -0.06096 to 0.01102 (2,000/2,000 valid) | n/a | -0.02490 / 0.02725; rank 6.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 48 | range | 21 |  | 0.18200 | 0.16625 | 0.01574 | -0.03034 to 0.06151 (2,000/2,000 valid) | n/a | -0.03358 / 0.03671; rank 76.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 48 | high-volatility | 36 |  | 0.17775 | 0.16625 | 0.01149 | -0.02606 to 0.05507 (2,000/2,000 valid) | n/a | -0.03035 / 0.03212; rank 70.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 48 | compression | 35 |  | 0.18388 | 0.16625 | 0.01763 | -0.02635 to 0.05497 (2,000/2,000 valid) | n/a | -0.03030 / 0.03309; rank 80.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 48 | transition | 50 |  | 0.16407 | 0.16625 | -0.00219 | -0.02912 to 0.02341 (2,000/2,000 valid) | n/a | -0.02658 / 0.02329; rank 46.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 240 | bullish-trend | 15 |  | 0.05427 | 0.08303 | -0.02876 | -0.05341 to -0.00585 (2,000/2,000 valid) | n/a | -0.03076 / 0.03221; rank 6.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 240 | bearish-trend | 8 |  | 0.07872 | 0.08303 | -0.00431 | -0.04566 to 0.04344 (2,000/2,000 valid) | n/a | -0.03474 / 0.04080; rank 41.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 240 | range | 3 |  | 0.12491 | 0.08303 | 0.04188 | -0.05400 to 0.10198 (1,919/2,000 valid) | n/a | -0.04704 / 0.05675; rank 91.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 240 | high-volatility | 5 |  | 0.07151 | 0.08303 | -0.01153 | -0.06715 to 0.05678 (1,988/2,000 valid) | n/a | -0.04397 / 0.04898; rank 34.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 240 | compression | 7 |  | 0.07776 | 0.08303 | -0.00527 | -0.04903 to 0.03960 (1,998/2,000 valid) | n/a | -0.04470 / 0.04861; rank 44.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 240 | transition | 10 |  | 0.12652 | 0.08303 | 0.04349 | -0.00518 to 0.09426 (2,000/2,000 valid) | n/a | -0.03387 / 0.03700; rank 97.30%; 999/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 48 | bullish-trend | 64 |  | 0.15933 | 0.16383 | -0.00450 | -0.03285 to 0.02514 (2,000/2,000 valid) | n/a | -0.02414 / 0.02350; rank 39.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 48 | bearish-trend | 32 |  | 0.16123 | 0.16383 | -0.00260 | -0.04749 to 0.04605 (2,000/2,000 valid) | n/a | -0.02767 / 0.02807; rank 45.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 48 | range | 29 |  | 0.14847 | 0.16383 | -0.01536 | -0.05498 to 0.02924 (2,000/2,000 valid) | n/a | -0.03538 / 0.03705; rank 24.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 48 | high-volatility | 43 |  | 0.16877 | 0.16383 | 0.00495 | -0.02820 to 0.04204 (2,000/2,000 valid) | n/a | -0.03121 / 0.03274; rank 61.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 48 | compression | 27 |  | 0.16400 | 0.16383 | 0.00018 | -0.04671 to 0.05744 (2,000/2,000 valid) | n/a | -0.03242 / 0.03313; rank 50.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 48 | transition | 58 |  | 0.17415 | 0.16383 | 0.01032 | -0.01412 to 0.03414 (2,000/2,000 valid) | n/a | -0.02547 / 0.02792; rank 75.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 240 | bullish-trend | 13 |  | 0.07898 | 0.07679 | 0.00219 | -0.02734 to 0.03176 (2,000/2,000 valid) | n/a | -0.02512 / 0.02953; rank 58.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 240 | bearish-trend | 3 |  | 0.06181 | 0.07679 | -0.01498 | -0.06814 to 0.03731 (1,900/2,000 valid) | n/a | -0.02791 / 0.03033; rank 22.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 240 | range | 6 |  | 0.07193 | 0.07679 | -0.00486 | -0.04569 to 0.04017 (1,998/2,000 valid) | n/a | -0.03592 / 0.04791; rank 41.48%; 998/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 240 | high-volatility | 10 |  | 0.07101 | 0.07679 | -0.00578 | -0.02804 to 0.01462 (2,000/2,000 valid) | n/a | -0.03430 / 0.03663; rank 44.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 240 | compression | 7 |  | 0.07109 | 0.07679 | -0.00570 | -0.04185 to 0.03673 (1,999/2,000 valid) | n/a | -0.03460 / 0.04270; rank 42.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 240 | transition | 11 |  | 0.08982 | 0.07679 | 0.01303 | -0.02409 to 0.05841 (2,000/2,000 valid) | n/a | -0.02582 / 0.03140; rank 77.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 48 | bullish-trend | 35 |  | 0.15987 | 0.16881 | -0.00894 | -0.04431 to 0.02595 (2,000/2,000 valid) | n/a | -0.02862 / 0.02929; rank 32.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 48 | bearish-trend | 44 |  | 0.14371 | 0.16881 | -0.02510 | -0.05726 to 0.00734 (2,000/2,000 valid) | n/a | -0.03274 / 0.03705; rank 12.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 48 | range | 23 |  | 0.21353 | 0.16881 | 0.04472 | -0.01248 to 0.09859 (2,000/2,000 valid) | n/a | -0.04285 / 0.04607; rank 94.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 48 | high-volatility | 34 |  | 0.17124 | 0.16881 | 0.00244 | -0.03501 to 0.04256 (2,000/2,000 valid) | n/a | -0.04081 / 0.04096; rank 57.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 48 | compression | 25 |  | 0.19203 | 0.16881 | 0.02322 | -0.02885 to 0.09376 (2,000/2,000 valid) | n/a | -0.03847 / 0.04271; rank 81.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 48 | transition | 36 |  | 0.16118 | 0.16881 | -0.00763 | -0.04521 to 0.03368 (2,000/2,000 valid) | n/a | -0.03344 / 0.03333; rank 33.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 240 | bullish-trend | 7 |  | 0.09156 | 0.08348 | 0.00808 | -0.04254 to 0.05973 (1,999/2,000 valid) | n/a | -0.02971 / 0.03195; rank 67.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 240 | bearish-trend | 8 |  | 0.11856 | 0.08348 | 0.03508 | -0.00311 to 0.07476 (2,000/2,000 valid) | n/a | -0.03583 / 0.03909; rank 93.59%; 999/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 240 | range | 5 |  | 0.04380 | 0.08348 | -0.03968 | -0.07629 to 0.00339 (1,995/2,000 valid) | n/a | -0.05151 / 0.05373; rank 9.59%; 991/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 240 | high-volatility | 4 |  | 0.09693 | 0.08348 | 0.01345 | -0.04058 to 0.07134 (1,980/2,000 valid) | n/a | -0.04503 / 0.04555; rank 70.52%; 994/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 240 | compression | 7 |  | 0.07312 | 0.08348 | -0.01036 | -0.04864 to 0.02234 (1,999/2,000 valid) | n/a | -0.04435 / 0.04265; rank 34.10%; 997/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 240 | transition | 7 |  | 0.06632 | 0.08348 | -0.01716 | -0.05660 to 0.01761 (2,000/2,000 valid) | n/a | -0.03387 / 0.03316; rank 19.52%; 999/1,000 valid | DESCRIPTIVE-ONLY · THIN |

### Signed forward return in ATR(14) units

| Scope | H | Label | n | n bull / bear | Conditional mean | B1 mean | Effect | 95% block CI (valid bootstrap n) | B2 comparator | B3 p05 / p95; observed rank (valid shifts) | Verdict / sample |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FULL | 48 | bullish-trend | 363 |  | 1.12465 | 0.41002 | 0.71463 | 0.19032 to 1.24390 (2,000/2,000 valid) | n+=916, n-=692; +=0.6542, -=0.0867, Δ=0.5675 | -0.47832 / 0.38185; rank 99.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY |
| FULL | 48 | bearish-trend | 266 |  | 0.33411 | 0.41002 | -0.07590 | -0.62555 to 0.49955 (2,000/2,000 valid) | n+=916, n-=692; +=0.6542, -=0.0867, Δ=0.5675 | -0.45005 / 0.52328; rank 38.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY |
| FULL | 48 | range | 175 |  | -0.09541 | 0.41002 | -0.50542 | -1.39677 to 0.35668 (2,000/2,000 valid) | n+=916, n-=692; +=0.6542, -=0.0867, Δ=0.5675 | -0.68040 / 0.67244; rank 10.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| FULL | 48 | high-volatility | 255 |  | 0.31435 | 0.41002 | -0.09567 | -0.64871 to 0.43955 (2,000/2,000 valid) | n+=916, n-=692; +=0.6542, -=0.0867, Δ=0.5675 | -0.58720 / 0.58543; rank 40.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY |
| FULL | 48 | compression | 205 |  | 0.43375 | 0.41002 | 0.02373 | -0.85184 to 0.93130 (2,000/2,000 valid) | n+=916, n-=692; +=0.6542, -=0.0867, Δ=0.5675 | -0.58902 / 0.56113; rank 51.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY |
| FULL | 48 | transition | 344 |  | 0.02850 | 0.41002 | -0.38152 | -0.88901 to 0.13530 (2,000/2,000 valid) | n+=916, n-=692; +=0.6542, -=0.0867, Δ=0.5675 | -0.41020 / 0.50581; rank 6.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY |
| FULL | 240 | bullish-trend | 75 |  | 4.25807 | 2.16324 | 2.09484 | -0.67021 to 4.89761 (2,000/2,000 valid) | n+=181, n-=140; +=3.0831, -=0.9740, Δ=2.1090 | -2.50008 / 2.27462; rank 93.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| FULL | 240 | bearish-trend | 49 |  | 0.85182 | 2.16324 | -1.31141 | -5.06270 to 2.36813 (2,000/2,000 valid) | n+=181, n-=140; +=3.0831, -=0.9740, Δ=2.1090 | -2.52628 / 2.74517; rank 18.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| FULL | 240 | range | 28 |  | -3.61499 | 2.16324 | -5.77823 | -11.30871 to -0.30457 (2,000/2,000 valid) | n+=181, n-=140; +=3.0831, -=0.9740, Δ=2.1090 | -3.42586 / 3.59080; rank 0.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| FULL | 240 | high-volatility | 46 |  | 2.20522 | 2.16324 | 0.04199 | -3.11277 to 3.07821 (2,000/2,000 valid) | n+=181, n-=140; +=3.0831, -=0.9740, Δ=2.1090 | -3.32996 / 2.94342; rank 53.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| FULL | 240 | compression | 45 |  | 4.74305 | 2.16324 | 2.57981 | -1.11484 to 6.36559 (2,000/2,000 valid) | n+=181, n-=140; +=3.0831, -=0.9740, Δ=2.1090 | -3.15119 / 3.23416; rank 90.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| FULL | 240 | transition | 78 |  | 1.53393 | 2.16324 | -0.62931 | -3.35403 to 2.21828 (2,000/2,000 valid) | n+=181, n-=140; +=3.0831, -=0.9740, Δ=2.1090 | -2.29391 / 2.81786; rank 33.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 48 | bullish-trend | 170 |  | 0.69331 | 0.10439 | 0.58892 | -0.18203 to 1.42943 (2,000/2,000 valid) | n+=414, n-=374; +=0.0795, -=0.1319, Δ=-0.0523 | -0.63746 / 0.55947; rank 95.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 48 | bearish-trend | 124 |  | 0.72325 | 0.10439 | 0.61886 | -0.23229 to 1.52057 (2,000/2,000 valid) | n+=414, n-=374; +=0.0795, -=0.1319, Δ=-0.0523 | -0.66045 / 0.72535; rank 90.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 48 | range | 91 |  | -0.38769 | 0.10439 | -0.49208 | -1.60212 to 0.69483 (2,000/2,000 valid) | n+=414, n-=374; +=0.0795, -=0.1319, Δ=-0.0523 | -1.02342 / 0.96347; rank 20.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 48 | high-volatility | 121 |  | 0.58778 | 0.10439 | 0.48340 | -0.38421 to 1.26303 (2,000/2,000 valid) | n+=414, n-=374; +=0.0795, -=0.1319, Δ=-0.0523 | -0.82844 / 0.81326; rank 83.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 48 | compression | 103 |  | -0.56130 | 0.10439 | -0.66569 | -1.85904 to 0.55549 (2,000/2,000 valid) | n+=414, n-=374; +=0.0795, -=0.1319, Δ=-0.0523 | -0.78387 / 0.77642; rank 8.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 48 | transition | 179 |  | -0.57718 | 0.10439 | -0.68157 | -1.34010 to -0.02663 (2,000/2,000 valid) | n+=414, n-=374; +=0.0795, -=0.1319, Δ=-0.0523 | -0.61483 / 0.68267; rank 3.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 240 | bullish-trend | 36 |  | 3.17197 | 0.94519 | 2.22678 | -1.68070 to 6.26238 (2,000/2,000 valid) | n+=80, n-=77; +=2.0374, -=-0.1896, Δ=2.2270 | -3.51264 / 2.99839; rank 88.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 240 | bearish-trend | 24 |  | -1.82569 | 0.94519 | -2.77089 | -7.25307 to 1.49205 (2,000/2,000 valid) | n+=80, n-=77; +=2.0374, -=-0.1896, Δ=2.2270 | -3.61397 / 3.70379; rank 10.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 240 | range | 11 |  | -0.76303 | 0.94519 | -1.70822 | -13.68104 to 9.66334 (2,000/2,000 valid) | n+=80, n-=77; +=2.0374, -=-0.1896, Δ=2.2270 | -4.69849 / 4.90298; rank 28.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 240 | high-volatility | 24 |  | 1.04694 | 0.94519 | 0.10175 | -4.03271 to 4.15883 (2,000/2,000 valid) | n+=80, n-=77; +=2.0374, -=-0.1896, Δ=2.2270 | -4.27240 / 4.10578; rank 54.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 240 | compression | 20 |  | 3.74070 | 0.94519 | 2.79551 | -2.73377 to 8.95919 (2,000/2,000 valid) | n+=80, n-=77; +=2.0374, -=-0.1896, Δ=2.2270 | -3.95847 / 4.36380; rank 86.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 240 | transition | 42 |  | -0.32206 | 0.94519 | -1.26725 | -3.87378 to 1.25881 (2,000/2,000 valid) | n+=80, n-=77; +=2.0374, -=-0.1896, Δ=2.2270 | -3.27361 / 3.52829; rank 23.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 48 | bullish-trend | 193 |  | 1.50459 | 0.69975 | 0.80484 | 0.10963 to 1.46609 (2,000/2,000 valid) | n+=502, n-=317; +=1.1282, -=0.0213, Δ=1.1069 | -0.62085 / 0.58893; rank 98.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 48 | bearish-trend | 141 |  | -0.03378 | 0.69975 | -0.73353 | -1.49411 to 0.01523 (2,000/2,000 valid) | n+=502, n-=317; +=1.1282, -=0.0213, Δ=1.1069 | -0.71142 / 0.71685; rank 4.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 48 | range | 84 |  | 0.22124 | 0.69975 | -0.47851 | -1.76606 to 0.73929 (2,000/2,000 valid) | n+=502, n-=317; +=1.1282, -=0.0213, Δ=1.1069 | -0.89586 / 0.92810; rank 18.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 48 | high-volatility | 134 |  | 0.06744 | 0.69975 | -0.63231 | -1.34386 to 0.10151 (2,000/2,000 valid) | n+=502, n-=317; +=1.1282, -=0.0213, Δ=1.1069 | -0.83850 / 0.87037; rank 12.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 48 | compression | 102 |  | 1.43856 | 0.69975 | 0.73881 | -0.46670 to 2.13417 (2,000/2,000 valid) | n+=502, n-=317; +=1.1282, -=0.0213, Δ=1.1069 | -0.80442 / 0.78095; rank 94.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 48 | transition | 165 |  | 0.68557 | 0.69975 | -0.01419 | -0.72945 to 0.72858 (2,000/2,000 valid) | n+=502, n-=317; +=1.1282, -=0.0213, Δ=1.1069 | -0.60305 / 0.67531; rank 49.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 240 | bullish-trend | 39 |  | 5.26063 | 3.34658 | 1.91404 | -1.81773 to 5.75952 (2,000/2,000 valid) | n+=101, n-=62; +=3.9113, -=2.4267, Δ=1.4846 | -3.41037 / 3.57984; rank 82.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 240 | bearish-trend | 25 |  | 3.42224 | 3.34658 | 0.07566 | -5.72869 to 5.86878 (2,000/2,000 valid) | n+=101, n-=62; +=3.9113, -=2.4267, Δ=1.4846 | -3.82250 / 4.30426; rank 49.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 240 | range | 17 |  | -5.46038 | 3.34658 | -8.80696 | -14.34966 to -3.45343 (2,000/2,000 valid) | n+=101, n-=62; +=3.9113, -=2.4267, Δ=1.4846 | -5.35097 / 5.61459; rank 0.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 240 | high-volatility | 22 |  | 3.46880 | 3.34658 | 0.12222 | -3.99184 to 4.70833 (2,000/2,000 valid) | n+=101, n-=62; +=3.9113, -=2.4267, Δ=1.4846 | -5.19899 / 4.83496; rank 52.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 240 | compression | 25 |  | 5.54493 | 3.34658 | 2.19834 | -2.98310 to 7.29136 (2,000/2,000 valid) | n+=101, n-=62; +=3.9113, -=2.4267, Δ=1.4846 | -4.83798 / 4.99320; rank 76.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 240 | transition | 35 |  | 3.79035 | 3.34658 | 0.44376 | -4.50797 to 5.83065 (2,000/2,000 valid) | n+=101, n-=62; +=3.9113, -=2.4267, Δ=1.4846 | -3.96335 / 4.02177; rank 57.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 48 | bullish-trend | 38 |  | 2.10157 | 0.38204 | 1.71953 | -0.06122 to 3.56553 (2,000/2,000 valid) | n+=109, n-=72; +=0.0005, -=0.9596, Δ=-0.9591 | -1.29097 / 1.19023; rank 98.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 48 | bearish-trend | 27 |  | 1.43035 | 0.38204 | 1.04831 | -0.45065 to 2.57535 (2,000/2,000 valid) | n+=109, n-=72; +=0.0005, -=0.9596, Δ=-0.9591 | -1.39715 / 1.54020; rank 87.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 48 | range | 22 |  | -1.24654 | 0.38204 | -1.62858 | -4.78886 to 1.42370 (2,000/2,000 valid) | n+=109, n-=72; +=0.0005, -=0.9596, Δ=-0.9591 | -2.00417 / 1.91753; rank 9.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 48 | high-volatility | 25 |  | 0.82853 | 0.38204 | 0.44649 | -1.70673 to 2.28809 (2,000/2,000 valid) | n+=109, n-=72; +=0.0005, -=0.9596, Δ=-0.9591 | -1.63876 / 1.63394; rank 68.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 48 | compression | 23 |  | -1.06583 | 0.38204 | -1.44787 | -3.02990 to -0.01398 (2,000/2,000 valid) | n+=109, n-=72; +=0.0005, -=0.9596, Δ=-0.9591 | -1.70592 / 1.71460; rank 8.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 48 | transition | 46 |  | -0.39358 | 0.38204 | -0.77562 | -2.02047 to 0.38778 (2,000/2,000 valid) | n+=109, n-=72; +=0.0005, -=0.9596, Δ=-0.9591 | -1.39519 / 1.41669; rank 16.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 240 | bullish-trend | 10 |  | 3.78013 | 1.64059 | 2.13955 | -6.42325 to 14.29197 (2,000/2,000 valid) | n+=20, n-=16; +=2.1005, -=1.0657, Δ=1.0348 | -8.40603 / 8.96434; rank 70.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 240 | bearish-trend | 4 |  | 4.60893 | 1.64059 | 2.96835 | -5.19905 to 10.85863 (1,975/2,000 valid) | n+=20, n-=16; +=2.1005, -=1.0657, Δ=1.0348 | -8.69175 / 10.47933; rank 72.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 240 | range | 2 |  | -10.41871 | 1.64059 | -12.05929 | -46.33332 to 21.39769 (1,744/2,000 valid) | n+=20, n-=16; +=2.1005, -=1.0657, Δ=1.0348 | -12.74279 / 12.76962; rank 5.95%; 991/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 240 | high-volatility | 8 |  | 3.91126 | 1.64059 | 2.27067 | -6.63027 to 9.68195 (2,000/2,000 valid) | n+=20, n-=16; +=2.1005, -=1.0657, Δ=1.0348 | -10.78209 / 11.29432; rank 68.51%; 994/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 240 | compression | 1 |  | -0.89756 | 1.64059 | -2.53814 | -7.49530 to 2.02580 (1,310/2,000 valid) | n+=20, n-=16; +=2.1005, -=1.0657, Δ=1.0348 | -9.60146 / 11.28172; rank 34.14%; 996/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 240 | transition | 11 |  | -0.61192 | 1.64059 | -2.25250 | -8.57639 to 3.42969 (2,000/2,000 valid) | n+=20, n-=16; +=2.1005, -=1.0657, Δ=1.0348 | -8.78187 / 9.84904; rank 35.04%; 996/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 48 | bullish-trend | 55 |  | 0.27216 | -0.10518 | 0.37734 | -0.91428 to 1.67702 (2,000/2,000 valid) | n+=130, n-=110; +=-0.1635, -=-0.0363, Δ=-0.1272 | -1.20984 / 1.12490; rank 71.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 48 | bearish-trend | 32 |  | 1.29623 | -0.10518 | 1.40141 | -0.09574 to 2.76991 (2,000/2,000 valid) | n+=130, n-=110; +=-0.1635, -=-0.0363, Δ=-0.1272 | -1.33705 / 1.29556; rank 96.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 48 | range | 25 |  | -0.29206 | -0.10518 | -0.18689 | -1.90581 to 1.94952 (2,000/2,000 valid) | n+=130, n-=110; +=-0.1635, -=-0.0363, Δ=-0.1272 | -1.96068 / 1.67878; rank 42.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 48 | high-volatility | 44 |  | -0.25739 | -0.10518 | -0.15221 | -1.93545 to 1.19600 (2,000/2,000 valid) | n+=130, n-=110; +=-0.1635, -=-0.0363, Δ=-0.1272 | -1.58878 / 1.53089; rank 41.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 48 | compression | 33 |  | -1.39541 | -0.10518 | -1.29023 | -4.14607 to 1.36547 (2,000/2,000 valid) | n+=130, n-=110; +=-0.1635, -=-0.0363, Δ=-0.1272 | -1.48791 / 1.54879; rank 7.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 48 | transition | 51 |  | -0.33364 | -0.10518 | -0.22846 | -1.58593 to 1.13442 (2,000/2,000 valid) | n+=130, n-=110; +=-0.1635, -=-0.0363, Δ=-0.1272 | -1.18896 / 1.27085; rank 38.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 240 | bullish-trend | 10 |  | -0.49806 | 0.21379 | -0.71184 | -8.71071 to 7.73606 (2,000/2,000 valid) | n+=24, n-=23; +=1.0429, -=-0.6513, Δ=1.6942 | -6.04687 / 5.55914; rank 41.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 240 | bearish-trend | 4 |  | -5.09127 | 0.21379 | -5.30506 | -22.28421 to 5.75024 (1,972/2,000 valid) | n+=24, n-=23; +=1.0429, -=-0.6513, Δ=1.6942 | -6.43443 / 6.94471; rank 8.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 240 | range | 5 |  | -3.68017 | 0.21379 | -3.89396 | -14.48954 to 4.24112 (1,989/2,000 valid) | n+=24, n-=23; +=1.0429, -=-0.6513, Δ=1.6942 | -8.68771 / 8.06510; rank 19.64%; 998/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 240 | high-volatility | 10 |  | -0.30349 | 0.21379 | -0.51728 | -6.21333 to 5.35770 (2,000/2,000 valid) | n+=24, n-=23; +=1.0429, -=-0.6513, Δ=1.6942 | -7.19886 / 7.32345; rank 45.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 240 | compression | 7 |  | 6.65219 | 0.21379 | 6.43840 | -2.75601 to 15.63569 (1,999/2,000 valid) | n+=24, n-=23; +=1.0429, -=-0.6513, Δ=1.6942 | -7.66233 / 7.00902; rank 93.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 240 | transition | 11 |  | 0.93310 | 0.21379 | 0.71931 | -3.88781 to 5.39527 (2,000/2,000 valid) | n+=24, n-=23; +=1.0429, -=-0.6513, Δ=1.6942 | -5.67466 / 6.10932; rank 55.27%; 997/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 48 | bullish-trend | 49 |  | -0.05387 | -0.02593 | -0.02794 | -1.23301 to 0.99851 (2,000/2,000 valid) | n+=117, n-=127; +=0.1901, -=-0.2250, Δ=0.4151 | -1.08964 / 0.95668; rank 52.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 48 | bearish-trend | 46 |  | -0.05018 | -0.02593 | -0.02425 | -1.29220 to 1.34802 (2,000/2,000 valid) | n+=117, n-=127; +=0.1901, -=-0.2250, Δ=0.4151 | -1.22065 / 1.33593; rank 46.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 48 | range | 31 |  | -0.29230 | -0.02593 | -0.26637 | -2.07091 to 1.70317 (2,000/2,000 valid) | n+=117, n-=127; +=0.1901, -=-0.2250, Δ=0.4151 | -1.57681 / 1.54268; rank 35.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 48 | high-volatility | 34 |  | 1.42803 | -0.02593 | 1.45396 | 0.25148 to 2.64235 (2,000/2,000 valid) | n+=117, n-=127; +=0.1901, -=-0.2250, Δ=0.4151 | -1.29758 / 1.44084; rank 95.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 48 | compression | 29 |  | 0.95493 | -0.02593 | 0.98086 | -1.01917 to 3.08333 (2,000/2,000 valid) | n+=117, n-=127; +=0.1901, -=-0.2250, Δ=0.4151 | -1.27740 / 1.35588; rank 89.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 48 | transition | 55 |  | -1.24661 | -0.02593 | -1.22068 | -2.19382 to -0.19519 (2,000/2,000 valid) | n+=117, n-=127; +=0.1901, -=-0.2250, Δ=0.4151 | -1.04575 / 1.11074; rank 3.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 240 | bullish-trend | 9 |  | 2.58375 | 0.08137 | 2.50238 | -2.60895 to 7.25190 (2,000/2,000 valid) | n+=23, n-=25; +=-0.5442, -=0.6569, Δ=-1.2011 | -5.17019 / 4.92788; rank 80.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 240 | bearish-trend | 10 |  | -2.39340 | 0.08137 | -2.47478 | -9.51268 to 4.82156 (2,000/2,000 valid) | n+=23, n-=25; +=-0.5442, -=0.6569, Δ=-1.2011 | -6.23928 / 6.49095; rank 27.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 240 | range | 3 |  | 14.88834 | 0.08137 | 14.80696 | 4.32653 to 33.22308 (1,909/2,000 valid) | n+=23, n-=25; +=-0.5442, -=0.6569, Δ=-1.2011 | -8.28172 / 9.19822; rank 99.50%; 999/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 240 | high-volatility | 4 |  | -2.73630 | 0.08137 | -2.81767 | -11.43943 to 14.80928 (1,960/2,000 valid) | n+=23, n-=25; +=-0.5442, -=0.6569, Δ=-1.2011 | -7.03894 / 7.61513; rank 25.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 240 | compression | 6 |  | -1.29291 | 0.08137 | -1.37428 | -10.52561 to 12.10028 (1,996/2,000 valid) | n+=23, n-=25; +=-0.5442, -=0.6569, Δ=-1.2011 | -6.50712 / 7.19661; rank 38.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 240 | transition | 16 |  | -1.33601 | 0.08137 | -1.41739 | -5.64616 to 2.66538 (2,000/2,000 valid) | n+=23, n-=25; +=-0.5442, -=0.6569, Δ=-1.2011 | -5.67825 / 6.27844; rank 32.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 48 | bullish-trend | 55 |  | 0.29534 | 0.36987 | -0.07454 | -1.73570 to 1.59732 (2,000/2,000 valid) | n+=126, n-=116; +=1.1371, -=-0.4635, Δ=1.6007 | -1.24018 / 1.14812; rank 44.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 48 | bearish-trend | 45 |  | 0.31411 | 0.36987 | -0.05577 | -1.77617 to 1.80958 (2,000/2,000 valid) | n+=126, n-=116; +=1.1371, -=-0.4635, Δ=1.6007 | -1.50474 / 1.45680; rank 46.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 48 | range | 24 |  | -0.39654 | 0.36987 | -0.76641 | -2.62923 to 1.04259 (2,000/2,000 valid) | n+=126, n-=116; +=1.1371, -=-0.4635, Δ=1.6007 | -1.86668 / 1.91874; rank 25.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 48 | high-volatility | 39 |  | 0.04400 | 0.36987 | -0.32587 | -1.34036 to 0.77487 (2,000/2,000 valid) | n+=126, n-=116; +=1.1371, -=-0.4635, Δ=1.6007 | -1.60609 / 1.63829; rank 39.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 48 | compression | 31 |  | 0.41709 | 0.36987 | 0.04722 | -2.08725 to 2.32132 (2,000/2,000 valid) | n+=126, n-=116; +=1.1371, -=-0.4635, Δ=1.6007 | -1.55607 / 1.61979; rank 52.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 48 | transition | 48 |  | 1.12504 | 0.36987 | 0.75517 | -0.74528 to 2.35760 (2,000/2,000 valid) | n+=126, n-=116; +=1.1371, -=-0.4635, Δ=1.6007 | -1.24734 / 1.44452; rank 80.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 240 | bullish-trend | 11 |  | 8.09180 | 1.39539 | 6.69641 | 0.62355 to 12.77334 (2,000/2,000 valid) | n+=22, n-=26; +=4.1849, -=-0.9649, Δ=5.1498 | -7.21494 / 6.04431; rank 96.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 240 | bearish-trend | 9 |  | 0.37673 | 1.39539 | -1.01866 | -8.71673 to 6.81546 (2,000/2,000 valid) | n+=22, n-=26; +=4.1849, -=-0.9649, Δ=5.1498 | -7.39085 / 7.93407; rank 40.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 240 | range | 4 |  | -10.42689 | 1.39539 | -11.82228 | -17.61230 to -5.71514 (1,964/2,000 valid) | n+=22, n-=26; +=4.1849, -=-0.9649, Δ=5.1498 | -9.63987 / 9.33014; rank 1.81%; 995/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 240 | high-volatility | 4 |  | 7.17270 | 1.39539 | 5.77731 | -6.54058 to 21.11620 (1,969/2,000 valid) | n+=22, n-=26; +=4.1849, -=-0.9649, Δ=5.1498 | -9.20267 / 8.77671; rank 87.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 240 | compression | 8 |  | 5.67469 | 1.39539 | 4.27930 | -5.58692 to 14.76435 (2,000/2,000 valid) | n+=22, n-=26; +=4.1849, -=-0.9649, Δ=5.1498 | -8.45328 / 9.51166; rank 78.28%; 999/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 240 | transition | 12 |  | -4.81687 | 1.39539 | -6.21226 | -13.45885 to 0.03948 (2,000/2,000 valid) | n+=22, n-=26; +=4.1849, -=-0.9649, Δ=5.1498 | -7.00659 / 7.22438; rank 7.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 48 | bullish-trend | 64 |  | 1.50673 | 0.66464 | 0.84209 | -0.34042 to 2.06502 (2,000/2,000 valid) | n+=152, n-=93; +=0.8793, -=0.3138, Δ=0.5654 | -1.22048 / 1.22466; rank 87.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 48 | bearish-trend | 39 |  | -0.53965 | 0.66464 | -1.20429 | -2.55073 to 0.05677 (2,000/2,000 valid) | n+=152, n-=93; +=0.8793, -=0.3138, Δ=0.5654 | -1.28378 / 1.30094; rank 6.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 48 | range | 21 |  | -0.71030 | 0.66464 | -1.37493 | -4.18991 to 1.45349 (2,000/2,000 valid) | n+=152, n-=93; +=0.8793, -=0.3138, Δ=0.5654 | -1.70119 / 1.83325; rank 8.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 48 | high-volatility | 36 |  | 1.02958 | 0.66464 | 0.36494 | -1.08420 to 1.77019 (2,000/2,000 valid) | n+=152, n-=93; +=0.8793, -=0.3138, Δ=0.5654 | -1.62526 / 1.51909; rank 65.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 48 | compression | 35 |  | 1.58518 | 0.66464 | 0.92055 | -1.38694 to 3.70318 (2,000/2,000 valid) | n+=152, n-=93; +=0.8793, -=0.3138, Δ=0.5654 | -1.53023 / 1.44394; rank 85.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 48 | transition | 50 |  | 0.19643 | 0.66464 | -0.46820 | -1.58876 to 0.57464 (2,000/2,000 valid) | n+=152, n-=93; +=0.8793, -=0.3138, Δ=0.5654 | -1.20442 / 1.23811; rank 25.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 240 | bullish-trend | 15 |  | 2.97458 | 4.21779 | -1.24321 | -6.40958 to 3.95742 (2,000/2,000 valid) | n+=31, n-=17; +=3.9779, -=4.6553, Δ=-0.6775 | -6.89508 / 6.32949; rank 39.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 240 | bearish-trend | 8 |  | 3.29908 | 4.21779 | -0.91871 | -7.76128 to 6.29165 (2,000/2,000 valid) | n+=31, n-=17; +=3.9779, -=4.6553, Δ=-0.6775 | -7.31040 / 8.76001; rank 42.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 240 | range | 3 |  | -12.20663 | 4.21779 | -16.42441 | -28.00042 to 0.41884 (1,919/2,000 valid) | n+=31, n-=17; +=3.9779, -=4.6553, Δ=-0.6775 | -9.99809 / 10.50331; rank 0.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 240 | high-volatility | 5 |  | 2.02510 | 4.21779 | -2.19268 | -11.47832 to 9.63172 (1,988/2,000 valid) | n+=31, n-=17; +=3.9779, -=4.6553, Δ=-0.6775 | -8.85487 / 9.60809; rank 37.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 240 | compression | 7 |  | 6.95266 | 4.21779 | 2.73487 | -7.30603 to 12.30505 (1,998/2,000 valid) | n+=31, n-=17; +=3.9779, -=4.6553, Δ=-0.6775 | -8.53805 / 9.48093; rank 70.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 240 | transition | 10 |  | 10.92681 | 4.21779 | 6.70903 | -4.02437 to 17.79808 (2,000/2,000 valid) | n+=31, n-=17; +=3.9779, -=4.6553, Δ=-0.6775 | -6.68902 / 7.28398; rank 93.39%; 999/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 48 | bullish-trend | 64 |  | 1.94661 | 1.28094 | 0.66566 | -0.43222 to 1.82213 (2,000/2,000 valid) | n+=180, n-=73; +=1.3003, -=1.2332, Δ=0.0672 | -0.96549 / 0.98766; rank 86.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 48 | bearish-trend | 32 |  | 1.41511 | 1.28094 | 0.13416 | -1.20680 to 1.48991 (2,000/2,000 valid) | n+=180, n-=73; +=1.3003, -=1.2332, Δ=0.0672 | -1.20740 / 1.14778; rank 58.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 48 | range | 29 |  | 2.00549 | 1.28094 | 0.72455 | -0.85529 to 2.45506 (2,000/2,000 valid) | n+=180, n-=73; +=1.3003, -=1.2332, Δ=0.0672 | -1.45193 / 1.60021; rank 77.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 48 | high-volatility | 43 |  | 0.32116 | 1.28094 | -0.95978 | -2.35680 to 0.51188 (2,000/2,000 valid) | n+=180, n-=73; +=1.3003, -=1.2332, Δ=0.0672 | -1.23540 / 1.27520; rank 10.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 48 | compression | 27 |  | 1.63623 | 1.28094 | 0.35528 | -1.68103 to 2.85738 (2,000/2,000 valid) | n+=180, n-=73; +=1.3003, -=1.2332, Δ=0.0672 | -1.28318 / 1.33883; rank 67.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 48 | transition | 58 |  | 0.65629 | 1.28094 | -0.62465 | -1.72594 to 0.54920 (2,000/2,000 valid) | n+=180, n-=73; +=1.3003, -=1.2332, Δ=0.0672 | -1.05892 / 1.03786; rank 16.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 240 | bullish-trend | 13 |  | 6.56317 | 6.98667 | -0.42350 | -6.76703 to 6.00258 (2,000/2,000 valid) | n+=37, n-=13; +=7.5067, -=5.5065, Δ=2.0002 | -5.65292 / 6.43497; rank 47.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 240 | bearish-trend | 3 |  | 8.65074 | 6.98667 | 1.66407 | -6.88312 to 11.27468 (1,900/2,000 valid) | n+=37, n-=13; +=7.5067, -=5.5065, Δ=2.0002 | -6.52684 / 6.88877; rank 69.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 240 | range | 6 |  | -0.48784 | 6.98667 | -7.47451 | -17.77676 to 2.70295 (1,998/2,000 valid) | n+=37, n-=13; +=7.5067, -=5.5065, Δ=2.0002 | -9.30848 / 11.36792; rank 7.72%; 998/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 240 | high-volatility | 10 |  | 3.85938 | 6.98667 | -3.12729 | -8.83456 to 1.99528 (2,000/2,000 valid) | n+=37, n-=13; +=7.5067, -=5.5065, Δ=2.0002 | -7.66906 / 9.00852; rank 26.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 240 | compression | 7 |  | 11.65257 | 6.98667 | 4.66590 | -2.79353 to 14.15001 (1,999/2,000 valid) | n+=37, n-=13; +=7.5067, -=5.5065, Δ=2.0002 | -7.59332 / 8.73540; rank 82.90%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 240 | transition | 11 |  | 10.98413 | 6.98667 | 3.99745 | -3.81956 to 13.89945 (2,000/2,000 valid) | n+=37, n-=13; +=7.5067, -=5.5065, Δ=2.0002 | -6.08441 / 6.44165; rank 84.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 48 | bullish-trend | 35 |  | 1.51410 | 0.07088 | 1.44322 | -0.18717 to 2.95192 (2,000/2,000 valid) | n+=99, n-=98; +=0.7120, -=-0.5768, Δ=1.2889 | -1.32572 / 1.31715; rank 96.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 48 | bearish-trend | 44 |  | -0.56569 | 0.07088 | -0.63657 | -1.78938 to 0.55662 (2,000/2,000 valid) | n+=99, n-=98; +=0.7120, -=-0.5768, Δ=1.2889 | -1.53497 / 1.60720; rank 25.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 48 | range | 23 |  | -0.28849 | 0.07088 | -0.35937 | -3.08069 to 2.62750 (2,000/2,000 valid) | n+=99, n-=98; +=0.7120, -=-0.5768, Δ=1.2889 | -2.07802 / 1.93961; rank 38.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 48 | high-volatility | 34 |  | -0.89333 | 0.07088 | -0.96421 | -2.29251 to 0.47174 (2,000/2,000 valid) | n+=99, n-=98; +=0.7120, -=-0.5768, Δ=1.2889 | -1.74064 / 1.96120; rank 18.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 48 | compression | 25 |  | 0.45081 | 0.07088 | 0.37993 | -2.32234 to 3.82245 (2,000/2,000 valid) | n+=99, n-=98; +=0.7120, -=-0.5768, Δ=1.2889 | -1.71981 / 1.77059; rank 64.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 48 | transition | 36 |  | 0.32218 | 0.07088 | 0.25130 | -1.44248 to 2.06705 (2,000/2,000 valid) | n+=99, n-=98; +=0.7120, -=-0.5768, Δ=1.2889 | -1.38637 / 1.42211; rank 61.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 240 | bullish-trend | 7 |  | 6.33302 | -0.73795 | 7.07097 | -5.25881 to 21.77737 (1,999/2,000 valid) | n+=19, n-=19; +=-0.5845, -=-0.8914, Δ=0.3069 | -8.05251 / 9.48277; rank 89.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 240 | bearish-trend | 8 |  | -1.93903 | -0.73795 | -1.20107 | -16.57444 to 13.44322 (2,000/2,000 valid) | n+=19, n-=19; +=-0.5845, -=-0.8914, Δ=0.3069 | -9.99433 / 11.01095; rank 44.64%; 999/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 240 | range | 5 |  | -5.07840 | -0.73795 | -4.34045 | -14.21725 to 4.96700 (1,995/2,000 valid) | n+=19, n-=19; +=-0.5845, -=-0.8914, Δ=0.3069 | -13.64606 / 14.48919; rank 26.84%; 991/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 240 | high-volatility | 4 |  | -0.89857 | -0.73795 | -0.16062 | -13.11912 to 13.24739 (1,980/2,000 valid) | n+=19, n-=19; +=-0.5845, -=-0.8914, Δ=0.3069 | -12.12818 / 12.17472; rank 48.99%; 994/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 240 | compression | 7 |  | 0.98951 | -0.73795 | 1.72746 | -8.65653 to 11.78886 (1,999/2,000 valid) | n+=19, n-=19; +=-0.5845, -=-0.8914, Δ=0.3069 | -12.27362 / 11.77078; rank 63.69%; 997/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 240 | transition | 7 |  | -4.97163 | -0.73795 | -4.23368 | -13.12897 to 4.91174 (2,000/2,000 valid) | n+=19, n-=19; +=-0.5845, -=-0.8914, Δ=0.3069 | -8.79390 / 9.24509; rank 22.02%; 999/1,000 valid | DESCRIPTIVE-ONLY · THIN |

### Bullish-minus-bearish SATR contrast

| Scope | H | Label | n | n bull / bear | Conditional mean | B1 mean | Effect | 95% block CI (valid bootstrap n) | B2 comparator | B3 p05 / p95; observed rank (valid shifts) | Verdict / sample |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FULL | 48 | bullish-minus-bearish | 266 | 363 / 266 | 0.79054 | 0.00000 | 0.79054 | -0.01097 to 1.63674 (2,000/2,000 valid) | n+=916, n-=692; +=0.6542, -=0.0867, Δ=0.5675 | -0.78220 / 0.66902; rank 97.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY |
| FULL | 240 | bullish-minus-bearish | 49 | 75 / 49 | 3.40625 | 0.00000 | 3.40625 | -1.65446 to 8.82547 (2,000/2,000 valid) | n+=181, n-=140; +=3.0831, -=0.9740, Δ=2.1090 | -4.00154 / 3.90988; rank 93.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 48 | bullish-minus-bearish | 124 | 170 / 124 | -0.02994 | 0.00000 | -0.02994 | -1.27387 to 1.21848 (2,000/2,000 valid) | n+=414, n-=374; +=0.0795, -=0.1319, Δ=-0.0523 | -1.13908 / 0.95910; rank 51.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H1 | 240 | bullish-minus-bearish | 24 | 36 / 24 | 4.99766 | 0.00000 | 4.99766 | -1.40696 to 12.09228 (2,000/2,000 valid) | n+=80, n-=77; +=2.0374, -=-0.1896, Δ=2.2270 | -5.89493 / 5.36136; rank 93.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 48 | bullish-minus-bearish | 141 | 193 / 141 | 1.53837 | 0.00000 | 1.53837 | 0.37368 to 2.61953 (2,000/2,000 valid) | n+=502, n-=317; +=1.1282, -=0.0213, Δ=1.1069 | -1.08886 / 1.01890; rank 99.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| H2 | 240 | bullish-minus-bearish | 25 | 39 / 25 | 1.83839 | 0.00000 | 1.83839 | -5.87454 to 9.48717 (2,000/2,000 valid) | n+=101, n-=62; +=3.9113, -=2.4267, Δ=1.4846 | -6.30900 / 5.82759; rank 70.80%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 48 | bullish-minus-bearish | 27 | 38 / 27 | 0.67122 | 0.00000 | 0.67122 | -2.04779 to 3.50831 (2,000/2,000 valid) | n+=109, n-=72; +=0.0005, -=0.9596, Δ=-0.9591 | -2.13990 / 2.11316; rank 72.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2020 | 240 | bullish-minus-bearish | 4 | 10 / 4 | -0.82880 | 0.00000 | -0.82880 | -13.36195 to 16.58125 (1,975/2,000 valid) | n+=20, n-=16; +=2.1005, -=1.0657, Δ=1.0348 | -14.77067 / 13.70225; rank 49.20%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 48 | bullish-minus-bearish | 32 | 55 / 32 | -1.02408 | 0.00000 | -1.02408 | -3.04245 to 0.90456 (2,000/2,000 valid) | n+=130, n-=110; +=-0.1635, -=-0.0363, Δ=-0.1272 | -1.84792 / 1.96617; rank 21.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2021 | 240 | bullish-minus-bearish | 4 | 10 / 4 | 4.59321 | 0.00000 | 4.59321 | -10.57885 to 23.84685 (1,972/2,000 valid) | n+=24, n-=23; +=1.0429, -=-0.6513, Δ=1.6942 | -10.15786 / 9.57734; rank 77.40%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 48 | bullish-minus-bearish | 46 | 49 / 46 | -0.00369 | 0.00000 | -0.00369 | -1.83038 to 1.50790 (2,000/2,000 valid) | n+=117, n-=127; +=0.1901, -=-0.2250, Δ=0.4151 | -1.97854 / 1.75113; rank 52.30%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2022 | 240 | bullish-minus-bearish | 9 | 9 / 10 | 4.97715 | 0.00000 | 4.97715 | -4.79590 to 13.49383 (2,000/2,000 valid) | n+=23, n-=25; +=-0.5442, -=0.6569, Δ=-1.2011 | -9.36420 / 9.10760; rank 80.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 48 | bullish-minus-bearish | 45 | 55 / 45 | -0.01877 | 0.00000 | -0.01877 | -2.84328 to 2.74052 (2,000/2,000 valid) | n+=126, n-=116; +=1.1371, -=-0.4635, Δ=1.6007 | -2.11171 / 2.11032; rank 49.60%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2023 | 240 | bullish-minus-bearish | 9 | 11 / 9 | 7.71507 | 0.00000 | 7.71507 | -2.55527 to 17.51609 (2,000/2,000 valid) | n+=22, n-=26; +=4.1849, -=-0.9649, Δ=5.1498 | -11.92388 / 10.50572; rank 89.50%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 48 | bullish-minus-bearish | 39 | 64 / 39 | 2.04638 | 0.00000 | 2.04638 | 0.20069 to 3.91367 (2,000/2,000 valid) | n+=152, n-=93; +=0.8793, -=0.3138, Δ=0.5654 | -2.06280 / 1.88117; rank 96.00%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2024 | 240 | bullish-minus-bearish | 8 | 15 / 8 | -0.32450 | 0.00000 | -0.32450 | -8.97796 to 7.83402 (2,000/2,000 valid) | n+=31, n-=17; +=3.9779, -=4.6553, Δ=-0.6775 | -12.00057 / 10.77197; rank 49.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 48 | bullish-minus-bearish | 32 | 64 / 32 | 0.53150 | 0.00000 | 0.53150 | -1.23769 to 2.35806 (2,000/2,000 valid) | n+=180, n-=73; +=1.3003, -=1.2332, Δ=0.0672 | -1.61206 / 1.65771; rank 68.70%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2025 | 240 | bullish-minus-bearish | 3 | 13 / 3 | -2.08757 | 0.00000 | -2.08757 | -13.34896 to 8.98457 (1,900/2,000 valid) | n+=37, n-=13; +=7.5067, -=5.5065, Δ=2.0002 | -10.04568 / 9.67999; rank 35.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 48 | bullish-minus-bearish | 35 | 35 / 44 | 2.07979 | 0.00000 | 2.07979 | -0.20032 to 3.98190 (2,000/2,000 valid) | n+=99, n-=98; +=0.7120, -=-0.5768, Δ=1.2889 | -2.31983 / 2.30251; rank 93.10%; 1,000/1,000 valid | DESCRIPTIVE-ONLY · THIN |
| Y2026 | 240 | bullish-minus-bearish | 7 | 7 / 8 | 8.27205 | 0.00000 | 8.27205 | -13.96551 to 32.62115 (1,999/2,000 valid) | n+=19, n-=19; +=-0.5845, -=-0.8914, Δ=0.3069 | -14.81060 / 15.71469; rank 81.08%; 999/1,000 valid | DESCRIPTIVE-ONLY · THIN |

Machine-readable full cell table: [forward-cells.csv](./forward-cells.csv). Raw aggregate structures, the exact 1,000 B3 offsets, each cell’s 1,000-position null-effect array (null where an offset yields an undefined cell), B1/B2/B3 comparisons and bootstrap metadata: [part3-results.json](./part3-results.json). B3 percentile summaries use finite null draws only.

## 5. Part 4 — synthetic secondary analysis

The required commit object f640c4d is not present in the local Git object database (git cat-file -e f640c4d^{commit} failed). Network access outside the npm registry was not used, and the Part 4 prerequisite—verifying the generator source hash against that commit—could not be satisfied. Per the preregistered rule, no new synthetic paths or NULL flips were generated and generator files were not changed.

| Planted regime | Hit rate | Median 3-confirmation delay | NULL flips / weekday | Status |
| --- | --- | --- | --- | --- |
| trend_up | N/A | N/A | N/A | NOT RUN / UNVERIFIED |
| trend_down | N/A | N/A | N/A | NOT RUN / UNVERIFIED |
| expansion_up | N/A | N/A | N/A | NOT RUN / UNVERIFIED |
| expansion_down | N/A | N/A | N/A | NOT RUN / UNVERIFIED |
| whipsaw | N/A | N/A | N/A | NOT RUN / UNVERIFIED |
| quiet_range | N/A | N/A | N/A | NOT RUN / UNVERIFIED |
| normal_chop | N/A | N/A | N/A | NOT RUN / UNVERIFIED |

## 6. Assumptions, limitations and unverified items

- Timestamp date/week/split grouping uses the input's EAT wall-clock calendar with no timezone shift. Horizon and detector windows are measured in source bars.
- All valid OHLC rows, including any row carrying an unreliable annotation, are retained; no OHLC repair, sorting, duplicate removal, or reliability filtering is performed. Input hash, chronology, geometry and positive-price checks are enforced.
- The dataset has no volume column, so the detector receives null volume throughout.
- The guide's lack of explicit forward claims makes the required per-label pass bars inapplicable. Conditional effects and B2/B3 comparisons are descriptive diagnostics only; they must not be described as validation of predictive ability.
- Detector/guide tuning provenance is unknown because those source files had no available Git history at the start. The exact guide snapshot is [frozen-guide.md](./frozen-guide.md), SHA-256 13f20307c138bb36bead5bba5e760d02b5a8c041ed71e4bd10fee0a5bc800edd; guide-source-manifest.json also binds it to the original docs path.
- Part 4 is unverified and not run because f640c4d is unavailable locally.
- No external price source or other network source was accessed. The required GitHub push/verification is reported in the delivery message; Part 1 checkpoint commit was 503ddcfd0a2c54462d4bb713528402602cb825ca.
- Dependency setup reported 3 npm audit advisories (2 high, 1 critical); dependencies were not changed beyond the required clean install.

## 7. Reproducibility and inventory

Run the complete analysis with:

node --max-old-space-size=2800 --expose-gc --experimental-strip-types --import ./tests/register.mjs scripts/regime-eval-all.mjs

The resumable orchestrator reuses completed batches and validates the exact seeded cutpoint union before merging. This execution reused seven completed 20-cutpoint processes and ran the remaining 60 cut points as twelve five-cutpoint processes; a fresh run uses forty five-cutpoint processes. It then runs Part 3, with all batch files retained. Then generate this report with node scripts/regime-eval-report.mjs and write the hash inventory with node scripts/regime-eval-inventory.mjs. [SHA256SUMS.txt](./SHA256SUMS.txt) uses standard sha256sum file entries, including the canonical detector-tree and guide-source manifest files; verify it from the repository root with sha256sum -c src/lib/regime-detector-eval/SHA256SUMS.txt. The inventory intentionally does not hash itself.

## 8. Post-analysis software verification

- Clean dependency install: npm ci passed; npm reported 3 audit advisories (2 high, 1 critical).
- TypeScript: npx tsc --noEmit passed.
- Full repository regression suite: 246 passed, 0 failed. Evaluation-specific tests: 7 passed, 0 failed.
- Scoped ESLint, Prettier and JavaScript syntax checks passed for the new evaluation code.

These are software QA checks only; their outputs were not used to calculate any market-statistical result.
