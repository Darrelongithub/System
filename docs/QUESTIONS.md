# Questions and decisions — G0 Amendment 8

**Updated:** 2026-11-07 (Africa/Nairobi)

## Owner decisions recorded

- **Amendment 8C A/B no-edge criterion: APPROVED AND EXERCISED.** Use the A-only 44-cell λ model; report λ and old/new bounds beside observed A/B means/maxima. For λ≈0.2817011047, the limits are mean≤0.500 and max≤3. The accepted tradeoff is that the prior A result 0.700/max 4 is inside the replacement bound and this test will not detect a roughly 0.28-cards/world leaked-drift defect.
- **Parts 2–4: AUTHORIZED.** Part 2 was committed/pushed and remote-verified before Stage 3 at `14120e306815ba9456f2550c696621d290cb350f` (subsequent status-gate commit `3e32c067c39e184a3c85737dfb737ea0bfddb694`).
- **C-D: REPORT ONLY.** Original Donchian-20 planting has no pass criterion.
- **Hard stop:** exactly one Stage 3b run was performed. It failed A and C's non-planted/non-excluded confirmation criterion; no rerun and no Stage 4. The failed Stage 3 record is being published under explicit instruction.
- **UNKNOWN:** executed in card slots and counted in book coverage, but unbinned from EFFICIENT and CHOPPY verdict cells.

## Final Stage 3b status

The single 40-world Stage 3b run used the approved 8C criterion. A failed with mean **1.500** and max **7** against new limits **0.500/3** (and old limits **0.500/2**). B passed with mean 0.300/max 1. Planted C confirmed `williams-r-fade` 10/10 and met its gross tolerance, but non-planted/non-excluded confirmations averaged 13.400/world, failing ≤0.5. C-D was report-only 10/10. Coverage identities and the Stage 4 absence guard passed. Complete immutable run outputs: `docs/G0-AMENDMENT-8-STAGE3B.md` and `artifacts/map-compass/a8-stage3b-report.json`.

## Measurement-only diagnostic: existing A worlds only

The diagnostic used the ten recorded A seeds and existing trade/control construction path to reproduce only requested cell quantities. It did **not** run the Stage 3 runner/battery, call the claim verifier, make new verdicts, or use VAL/HOLDOUT/STRESS outcomes. All reconstructed confirmation IDs and verdict states matched the saved report. The `side` recorded by Stage 3 is the claim half (`weakness`, direction −1); `L/S` below is the reconstructed count of long/short executions within that card-state cell.

### Q1 — all ten recorded A worlds

| World | Seed | Count | Recorded confirmed card IDs (all `weakness`, direction −1) | State | Executed sides L/S |
|---:|---:|---:|---|---|---:|
| 1 | 20261201 | 0 | — | — | — |
| 2 | 20261202 | 7 | `bb-squeeze-fade`; `bollinger-20-2`; `keltner-20-atr`; `macd-cross`; `morning-evening-star`; `nr7-break`; `rsi-14-30-70` | EFFICIENT except `macd-cross` CHOPPY | 86/78; 113/115; 110/105; 552/480; 134/134; 179/156; 274/226 |
| 3 | 20261203 | 0 | — | — | — |
| 4 | 20261204 | 0 | — | — | — |
| 5 | 20261205 | 0 | — | — | — |
| 6 | 20261206 | 1 | `inside-bar-break` | EFFICIENT | 293/126 |
| 7 | 20261207 | 0 | — | — | — |
| 8 | 20261208 | 6 | `bb-squeeze-fade`; `bollinger-20-2`; `morning-evening-star`; `nr7-break`; `rsi-14-30-70`; `williams-r-fade` | EFFICIENT | 82/81; 106/105; 134/146; 206/168; 268/258; 217/257 |
| 9 | 20261209 | 1 | `inside-bar-break` | EFFICIENT | 310/138 |
| 10 | 20261210 | 0 | — | — | — |

The 10-world count vector is `[0,7,0,0,0,1,0,6,1,0]`: total 15; mean 1.500; **sample variance 7.1667**; variance/mean **4.7778**. Counts by world: six with 0, two with 1, zero with 2, and two with ≥3. The highest-count world contributes 7/15 = **46.67%**. This is descriptive evidence of over-dispersion across these ten worlds; it is not a population-level significance test.

### Q2 — recorded confirmations and the two original gates

Means are in R. Gross/cost/net are raw trade-book means (not claim-signed); `signed net` and excess apply the recorded weakness direction −1. The net gate is the frozen signed mean >0.10 and CR1 day-clustered t>2; the control gate is signed excess >0 and CR1 day-clustered t>2. All matched-control cells were available under the original baseline.

| World | Card / state / L:S | N | Gross | Cost | Net | Signed net; t; gate | Matched control mean | Signed excess; t; gate |
|---:|---|---:|---:|---:|---:|---|---:|---|
| 2 | `bb-squeeze-fade` / EFFICIENT / 86:78 | 164 | −0.255 | 0.141 | −0.396 | 0.396; 3.95; PASS | −0.032 | 0.364; 3.52; PASS |
| 2 | `bollinger-20-2` / EFFICIENT / 113:115 | 228 | −0.069 | 0.145 | −0.215 | 0.215; 2.35; PASS | −0.014 | 0.201; 2.10; PASS |
| 2 | `keltner-20-atr` / EFFICIENT / 110:105 | 215 | −0.153 | 0.145 | −0.298 | 0.298; 3.20; PASS | −0.024 | 0.274; 2.81; PASS |
| 2 | `macd-cross` / CHOPPY / 552:480 | 1,032 | −0.089 | 0.155 | −0.244 | 0.244; 5.73; PASS | −0.156 | 0.088; 2.07; PASS |
| 2 | `morning-evening-star` / EFFICIENT / 134:134 | 268 | −0.134 | 0.148 | −0.282 | 0.282; 3.43; PASS | 0.011 | 0.293; 3.34; PASS |
| 2 | `nr7-break` / EFFICIENT / 179:156 | 335 | −0.146 | 0.150 | −0.296 | 0.296; 4.15; PASS | −0.028 | 0.269; 3.57; PASS |
| 2 | `rsi-14-30-70` / EFFICIENT / 274:226 | 500 | −0.017 | 0.153 | −0.169 | 0.169; 2.75; PASS | 0.013 | 0.182; 2.77; PASS |
| 6 | `inside-bar-break` / EFFICIENT / 293:126 | 419 | −0.169 | 0.159 | −0.328 | 0.328; 4.88; PASS | −0.187 | 0.142; 2.12; PASS |
| 8 | `bb-squeeze-fade` / EFFICIENT / 82:81 | 163 | −0.151 | 0.143 | −0.294 | 0.294; 2.82; PASS | −0.017 | 0.276; 2.66; PASS |
| 8 | `bollinger-20-2` / EFFICIENT / 106:105 | 211 | −0.137 | 0.141 | −0.278 | 0.278; 3.03; PASS | −0.014 | 0.264; 2.87; PASS |
| 8 | `morning-evening-star` / EFFICIENT / 134:146 | 280 | −0.073 | 0.144 | −0.217 | 0.217; 2.66; PASS | −0.031 | 0.186; 2.27; PASS |
| 8 | `nr7-break` / EFFICIENT / 206:168 | 374 | −0.125 | 0.151 | −0.276 | 0.276; 3.97; PASS | −0.036 | 0.240; 3.45; PASS |
| 8 | `rsi-14-30-70` / EFFICIENT / 268:258 | 526 | −0.104 | 0.152 | −0.255 | 0.255; 4.31; PASS | −0.022 | 0.233; 3.94; PASS |
| 8 | `williams-r-fade` / EFFICIENT / 217:257 | 474 | −0.064 | 0.152 | −0.215 | 0.215; 3.40; PASS | −0.018 | 0.198; 3.08; PASS |
| 9 | `inside-bar-break` / EFFICIENT / 310:138 | 448 | −0.069 | 0.159 | −0.228 | 0.228; 3.40; PASS | −0.030 | 0.198; 2.83; PASS |

Across the 15 cells (equal weight per cell), mean raw gross was −0.117R, cost +0.149R, and raw net −0.266R; weighting all 5,637 trades instead gives −0.103R, +0.151R, and −0.255R. Every raw gross cell mean was already negative; costs deepened losses but did not alone create the weakness-direction net result. Every recorded confirmation passed both original gates.

### Q3 — one-slot-blocked matched-control counterfactual

For each confirmed card slot, the same seeded known-state random-control entries were replayed chronologically within each segment; a candidate at/before the occupied-through exit index was rejected. Existing matched-control cell hierarchy and minimum cell size (200) were retained. This is report-only. Control means are raw net-R means; excess is signed by weakness direction. `Coverage` is blocked matched-control observations / original cell trades. A subset result is not a full-cell gate verdict.

| World | Card | Before control → blocked control | Before excess (t) → blocked excess (t) | Coverage | Blocked-gate result |
|---:|---|---:|---:|---:|---|
| 2 | `bb-squeeze-fade` | −0.032 → −0.151 | 0.364 (3.52) → 0.307 (2.03) | 70/164 | PASS on subset only |
| 2 | `bollinger-20-2` | −0.014 → −0.151 | 0.201 (2.10) → 0.064 (0.44) | 90/228 | No on subset |
| 2 | `keltner-20-atr` | −0.024 → −0.151 | 0.274 (2.81) → 0.124 (0.84) | 90/215 | No on subset |
| 2 | `macd-cross` | −0.156 → −0.158 | 0.088 (2.07) → 0.086 (2.02) | 1,032/1,032 | **PASS — full coverage** |
| 2 | `morning-evening-star` | 0.011 → −0.151 | 0.293 (3.34) → −0.098 (−0.65) | 93/268 | No on subset; negative excess |
| 2 | `nr7-break` | −0.028 → −0.151 | 0.269 (3.57) → 0.132 (1.12) | 128/335 | No on subset |
| 2 | `rsi-14-30-70` | 0.013 → −0.151 | 0.182 (2.77) → 0.031 (0.32) | 198/500 | No on subset |
| 6 | `inside-bar-break` | −0.187 → −0.134 | 0.142 (2.12) → 0.170 (2.18) | 309/419 | PASS on subset only |
| 8 | `bb-squeeze-fade` | −0.017 → −0.203 | 0.276 (2.66) → 0.101 (0.61) | 68/163 | No on subset |
| 8 | `bollinger-20-2` | −0.014 → −0.203 | 0.264 (2.87) → 0.051 (0.35) | 88/211 | No on subset |
| 8 | `morning-evening-star` | −0.031 → −0.203 | 0.186 (2.27) → 0.296 (2.35) | 93/280 | PASS on subset only |
| 8 | `nr7-break` | −0.036 → −0.203 | 0.240 (3.45) → −0.019 (−0.16) | 145/374 | No on subset; negative excess |
| 8 | `rsi-14-30-70` | −0.022 → −0.203 | 0.233 (3.94) → 0.047 (0.49) | 203/526 | No on subset |
| 8 | `williams-r-fade` | −0.018 → −0.203 | 0.198 (3.08) → 0.271 (2.92) | 165/474 | PASS on subset only |
| 9 | `inside-bar-break` | −0.030 → −0.303 | 0.198 (2.83) → −0.010 (−0.07) | 96/448 | No on subset; negative excess |

Across the 15 cells, the equal-weight mean of cell-level matched-control means shifted from −0.039R before blocking to −0.181R after blocking; the equal-weight mean signed excess shifted from +0.227R to +0.104R. Weighting by matched observations instead, control means were −0.056R before and −0.171R after, and signed excesses were +0.199R and +0.099R. Only 2,868/5,637 (50.9%) of the original confirmation trades retained a valid blocked baseline; 14/15 cells were partially unmatched. Twelve cells retained positive excess on their matched subset, five had subset excess t>2, and only one cell had both a passing control gate and complete coverage. These counts are descriptive; do not read a partial-coverage row as a new verdict.

## Diagnostic conclusion and remaining unknowns

**Both, descriptively:** the A counts support over-dispersion (sample variance/mean 4.78 and a 46.67% maximum-world share), and the control-slot counterfactual signals excess-gate sensitivity/bias (large control-mean shift and substantially lower mean excess). The latter is not a definitive full-cell bias finding because 14/15 cells lose matched-baseline coverage under the existing minimum-cell rule. The net-gate confirmations were not solely cost-created: all gross means were negative before costs. Why the confirmations clustered in four worlds, and why original unblocked control means differ from the one-slot-blocked matched subset, remain unexplained. No recommendation follows from this measurement-only diagnostic.

## Test run for this publication

`npm test` was run once and stopped before test collection: **0 tests executed**. Runtime failure: `ERR_MODULE_NOT_FOUND: Cannot find package date-fns imported from src/lib/ohlc-generator.ts`. No test-case failures were emitted because the harness did not load. Do not rerun it under this task. The prior full run (before this publication) was 415 passed/1 failed; its sole test assertion failure was `tests/synth.test.mjs:694`, “UI shows the final recorded D1 count”.

**No open implementation questions.** The hard stop remains: do not rerun Stage 3, do not tune or recalibrate, and do not start Stage 4. The requested final publication does not authorize any of those actions.
