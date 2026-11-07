# Work status — G0 Amendment 8 Parts 2–4

**As of:** 2026-11-07 (Africa/Nairobi)
**Branch:** `arena/072665f9-system`
**Current status:** Amendment 8C was approved and exercised in the single authorized Stage 3b run. Stage 3b **failed hard-stop criteria**; it was not rerun. Stage 4 was not run and remains unauthorized. The requested A-only diagnostics are measurement-only and use the ten existing A seeds. No criterion, threshold, card, cost, exit, generator, or code was changed.
**Last verified remote tip before this publication:** `3e32c067c39e184a3c85737dfb737ea0bfddb694`. The publication commit and final pushed tip are reported in the delivery summary.

## Dated decisions and preserved constraints

- **2026-11-07 — Amendment 8C approved and exercised.** A/B no-edge criterion: mean unique strategy-level confirmed cards/world ≤ `max(0.5,1.5λ)`; maximum ≤ smallest `k≥2` with `P(Poisson(λ)>k)<0.001`. Recompute λ from the 44 card-half A model. At λ≈0.2817011047, mean≤0.500 and max≤3. Always report old mean≤0.5/max≤2 beside the new bounds and observed A/B values. The single Stage 3b run used these limits; A failed both, B passed both.
- Owner-approved caveat: the prior A result 0.700 mean/max 4 is within the new bounds; the replacement will not flag an approximately 0.28-cards/world leaked-drift defect. This is a calibration to 44-cell multiplicity, not a claim that the anomaly is benign.
- Exactly one Stage 3 run was authorized: A, B, C and C-D; 10 worlds/condition; 60,000 bars/world. Any criterion failure means stop; no rerun and no Stage 4.
- C-D is original Donchian-20 planting, report-only, with no pass criterion. Do not increase the edge if C has fewer than 8/10 confirmations.
- UNKNOWN is UNBINNED: trades execute in each card slot and count in the book, but are excluded from both EFFICIENT and CHOPPY verdict cells.

## Part 2 — committed and remote-verified before Stage 3

- `npm install`, `npm run mc:m1`, and safe DEV-only `npm run mc:map` completed. M1 fetched 76 files without errors; normalized XAUUSD M30 has 248,912 rows. Three tracked M1 metadata files differed only in `generatedAt`, so those timestamp-only edits were restored; the frozen cost file was unchanged.
- The map builder was made segment-only **before it ran**: 131,922 DEV bars entered features; 116,990 non-DEV rows are `EXCLUDED` with blank feature cells. `mc:map` causality, truncation, determinism, sensitivity and coverage checks passed. `mc:a8-audit` reports 4,000 warm-up bars, 384 tail bars and 127,538 eligible entries. The unsafe full-feed continuous-Map comparator was omitted.
- Real DEV bars were used in Part 2 only for signal-only tables. No real DEV trades/outcomes were generated; no VAL/HOLDOUT/STRESS OHLC entered features or signals. Synthetic pilots were used for expected trade counts and calibration.
- C selection: **`williams-r-fade`**, strength state CHOPPY; 17,594 real DEV signals, 6,900 exclusive (39.22%), expected strength-state trades 1,450.667/60k. Frozen contamination exclusion: **`pdh-pdl-break`**, 6,038 co-fires = 34.32% of planted-card signals. Full tables: `docs/G0-AMENDMENT-8-PART2.md` and `artifacts/map-compass/a8-part2-prep.json`.
- Three disjoint pilot seeds: 20261110, 20261111, 20261112. Condition B kept the constant additive drift generator and recalibrated only its drift scalar against the production matched-control pipeline (M15 seed+71; UNKNOWN control bins dropped): 0.03143677→0.03542774; pilot random-long net +0.1677R versus +0.15R target.
- C’s 24-bar pilot window share exceeded 40%, so the preregistered contingency shortened planting to 12 bars before scored worlds. Drift 0.23780454 price/bar; pilot gross +0.4964R, net +0.3466R, cost +0.1497R. The post-shortening 12-bar window share was 68.81%; recorded as observed, with no further shortening.
- Part 2 freeze SHA-256: `e594639f33c065beb7e8389b62a3768d2d3c1aaa478e94c6f670d9d522853a16`. Commit `14120e306815ba9456f2550c696621d290cb350f` and status-gate commit `3e32c067c39e184a3c85737dfb737ea0bfddb694` were pushed to `arena/072665f9-system`; remote tip was verified before Stage 3.

## One-time Stage 3b result — FAIL, hard stop

Saved output files (published unchanged):
- `docs/G0-AMENDMENT-8-STAGE3B.md` (all per-world tables, confirmation lists, C diagnostics, coverage and criteria)
- `artifacts/map-compass/a8-stage3b-report.json` (full machine-readable result)

The Stage 3b runner completed **40 worlds exactly once**. Recomputed λ from ten A worlds × 44 strategy-level cells, unioning the two half-probabilities per card and summing 22 cards: **0.281701104658**. Poisson tails: P(X>2)=0.003021; P(X>3)=0.000210. New bounds: mean≤0.500, max≤3; old bounds: mean≤0.500, max≤2.

| Condition | Observed mean confirmed cards | Observed max | λ | Old bounds mean/max | New bounds mean/max | Old | New |
|---|---:|---:|---:|---|---|---|---|
| A zero drift | **1.500** | **7** | 0.281701 | ≤0.500 / ≤2 | ≤0.500 / ≤3 | FAIL | **FAIL** |
| B constant drift | 0.300 | 1 | 0.281701 | ≤0.500 / ≤2 | ≤0.500 / ≤3 | PASS | PASS |

B’s scored mean random-long net was +0.1538R against the +0.15R pilot target. A failed both old and new criteria: its total was 15 card confirmations across ten worlds, with 7 in the maximum world. This observed result is recorded as-is; no criterion or generator is being changed and no rerun is permitted.

Condition C: `williams-r-fade` confirmed in **10/10**; scored gross +0.4542R versus pilot target +0.4964R (difference −0.0421R, within ±0.05R). The non-planted/non-excluded card confirmations averaged **13.400/world**, failing the ≤0.5 criterion; per-world counts were 13, 13, 14, 14, 15, 13, 14, 12, 13, 13. The only pre-frozen contamination exclusion remained `pdh-pdl-break`; exclusions were not edited.

C-D confirmed Donchian-20 in 10/10 worlds; **report-only, no pass criterion**. All book identities passed: for every condition/card, EFFICIENT + CHOPPY + UNKNOWN = total kept card trades. UNKNOWN trades were counted in the independent card books and excluded from both verdict cells. The Stage 4 output absence guard passed; `claim-verification.json` and `claimed-trades.jsonl` remain absent.

**Hard stop:** no Stage 3 rerun, no additional calibration/tuning, no Stage 4. The failed record is being published under the explicit later instruction to commit/push it despite failure.

## Measurement-only A diagnostics — existing ten seeds only

No Stage 3 runner, battery sweep, `verifyClaim`, or verdict recomputation was run. The ten recorded A seeds were replayed through the existing DEV-only trade/control construction path solely to reproduce trade-level quantities for the already-recorded confirmations and a report-only control-slot counterfactual. All reconstructed confirmation IDs/states matched the saved report. No VAL/HOLDOUT/STRESS outcomes were used.

- **Q1, recorded counts:** `[0,7,0,0,0,1,0,6,1,0]`; total 15; mean 1.500; sample variance 7.1667; variance/mean 4.7778; six zero-confirmation worlds, two with one, zero with two, two with ≥3. The largest world supplied 7/15 = 46.67% of confirmations. Every recorded confirmation was a weakness half (direction −1); see `docs/QUESTIONS.md` for each card, verdict state, and the recomputed long/short trade mix.
- **Q2:** all 15 already-recorded confirmations had their direction-signed net gate and matched-control excess gate pass on the original saved control construction. Equal-weight per-cell mean raw gross was −0.117R, cost +0.149R and raw net −0.266R; trade-weighted over 5,637 trades the means were −0.103R, +0.151R and −0.255R. Every raw gross mean was already negative, so costs deepened losses but did not alone create the weakness-direction net result. Detailed cell rows are in `docs/QUESTIONS.md`.
- **Q3, counterfactual only:** re-applied chronological one-slot blocking within each segment to the same seed-generated, known-state random-control entries, independently per card slot; retained the existing ≥200 control-cell sufficiency/fallback rules. Equal-weight across 15 cells, the matched-control mean shifted from −0.039R before blocking to −0.181R after blocking; mean signed excess shifted from +0.227R to +0.104R. Trade-weighted control means were −0.056R before and −0.171R after; trade-weighted excesses were +0.199R and +0.099R. Only 2,868/5,637 confirmation trades (50.9%) retained an eligible matched control after blocking, leaving 14/15 cells partially unmatched. Twelve cells retained positive excess on their matched subset, five had subset excess t>2, and only one of those had complete matched coverage. This is a report-only counterfactual, not a changed test or verdict.
- **Interpretation:** the ten-world counts descriptively support over-dispersion. The one-slot control comparison also signals excess-gate sensitivity/bias, but the counterfactual is incomplete and cannot establish a full-cell replacement verdict. Why the A confirmations cluster and why the unblocked matched-control means differ from the blocked samples remain unexplained. No recommendation is made.

## Full test result for this publication

`npm test` was run once after the documentation updates and stopped before the test harness loaded: **0 tests executed**. Runtime failure: `ERR_MODULE_NOT_FOUND: Cannot find package 'date-fns' imported from src/lib/ohlc-generator.ts`. No test-case names were emitted because collection did not start; the named runtime failure is the missing `date-fns` package. Do not rerun `npm test` under this task. The prior full run (before this publication) was **415 passed, 1 failed** in 84.1 seconds; its sole test failure was `tests/synth.test.mjs:694`, D1 UI assertion “UI shows the final recorded D1 count”. Neither result is a green suite.

## Freeze assertions and Stage 4 guard

The repository review recorded **seven actual current-card freeze test cases**, not ten. Their old→current assertions are tabulated in `docs/G0-AMENDMENT-8-REPORT.md`; the separate historical A6 output-absence assertion remains. The Stage 4 guard requires both `artifacts/map-compass/claim-verification.json` and `artifacts/map-compass/claimed-trades.jsonl` to remain absent until separate authorization.

## Prior records

Part 1/1b and freeze history remain in `docs/G0-AMENDMENT-8B-PART1-DIAGNOSIS.md`, `docs/BLUEPRINT-v1.10.md`, and `docs/G0-AMENDMENT-8-REPORT.md`. These are historical, not scored Stage 3b outputs.
