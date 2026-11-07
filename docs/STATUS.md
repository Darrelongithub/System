# Work status — G0 Amendment 8 and Compass routing

**As of:** 2026-11-07 (Africa/Nairobi)
**Branch:** `arena/072665f9-system`
**Current status:** The Stage 3b hard-stop result remains final and was not rerun; Stage 4 remains unauthorized. The routing correction is published. This provenance repair restores the pinned v1.10 snapshot and versions current `BLUEPRINT.md` as v1.11 without editing `BLUEPRINT.md`. `npm ci`, `npm run mc:m1`, and `npm run mc:map` succeeded; the latest full suite reports 420 passed and one known synth UI failure (87.5 seconds).
**Base tip for this provenance fix:** `f28bddef5efc0df194f99928f6f03d2eca6d7b71`. Final commit and remote verification are reported in the handoff.

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

## Corrected test report and provenance verification — 2026-11-07

The earlier reports of **“415 passed / 1 failed”** and **“0 tests executed”** were **WRONG as the required verification position**. They do not describe the completed sequence below. The intermediate 416-passed/5-failed result was also from before the required data retrieval and provenance repair; its three missing-data failures and A6 v1.10 pin failure are now resolved.

- `npm ci`: succeeded; 360 packages installed (npm audit reported 19 existing dependency vulnerabilities: 7 moderate, 6 high, 6 critical; no audit fix was run).
- `npm run mc:m1`: succeeded. Fetch: **76 files, 0 errors**. Normalized outputs: XAU M30 248,912 bars, XAU M15 494,235 bars, EURUSD M30 115,200 bars. DST verification: PASS across 44 months; spread table matched 1,318,470 M1 minutes; data audit reported `problems: none`.
- `npm run mc:map`: succeeded; causality/truncation PASS, deterministic output, coverage problems 0, verdict PASS.
- `npm test`: **420 passed, 1 failed** in 87.5 seconds (latest run). The only failing test is `synth UI: the map generator discloses the latest exhausted D1 result without claiming certification` at `tests/synth.test.mjs:694` (“UI shows the final recorded D1 count”). The A6 blueprint-hash test now passes; all three data-contract tests now pass with M1 artifacts present. No other failure occurred.

The M1/map runs changed only `generatedAt` in tracked `artifacts/map-compass/data-manifest.json`, `dst-verification.json`, `map-validation.json`, and `spread-table.json`. Those timestamp-only changes were restored; they are not part of this patch. `BLUEPRINT.md` was not edited. The A6 failure is fixed by versioning: the v1.10 historical snapshot is restored to its pinned bytes and current content is recorded as v1.11.

## Freeze assertions and Stage 4 guard

The repository review recorded **seven actual current-card freeze test cases**, not ten. Their old→current assertions are tabulated in `docs/G0-AMENDMENT-8-REPORT.md`; the separate historical A6 output-absence assertion remains. The Stage 4 guard requires both `artifacts/map-compass/claim-verification.json` and `artifacts/map-compass/claimed-trades.jsonl` to remain absent until separate authorization.

## Prior records

Part 1/1b and freeze history remain in `docs/G0-AMENDMENT-8B-PART1-DIAGNOSIS.md`, `docs/BLUEPRINT-v1.10.md`, and `docs/G0-AMENDMENT-8-REPORT.md`. These are historical, not scored Stage 3b outputs.

## Compass routing fix — historical record from preceding change (2026-11-07)

**Risk-acceptance reason (a), corrected:** Weakness claims cannot ADD an enabled (card, state) pair. The single path by which a weakness confirmation could REMOVE one — unconditional promotion of any DEFINITION_SENSITIVE ledger record, including weakness and VAL-window records, into conditionalIds — was found by the verifier by code inspection and reproduction, and was fixed and regression-tested before any real result. Cause: build-compass.mjs built conditionalIds without a kind or window filter.

Other risk-acceptance reasons (b) through (e) are unchanged by this correction. The bug fix is restricted to selection of conditionalIds from strength records in the evaluated DEV window; verdict-map selection remains as before. Missing/falsey `windowKind` continues to be treated as DEV, matching the existing verdict loop. The exported selector is pure; direct CLI invocation is guarded so importing it for tests does not run the CLI or write `routing-table.json`.

**Complementarity finding — proved.** A direct test over all 22 `CLAIM_CARDS` confirms `weakness.state === otherVerdictState(strength.state)` and that all 44 `${claimId}|${state}` keys are unique. `validateClaimCards()` at `claim-cards.draft.mjs:446-451` already checks the complementary-state invariant; it is called by `compass.test.mjs:43`, `amendment3.test.mjs:288`, and `amendment4.test.mjs:70`. Those validator checks are logically sufficient to reject a non-complementary pair when run, but a direct CLAIM_CARDS test is still needed to explicitly pin the verdict-map key-collision invariant. The result is stated in the regression test name.

**Known open — not fixed in this cycle:** the weakness hard-block branch in `lib/compass.mjs:169-171` is dead code. Only a CONFIRMED strength reaches that branch; routing only adds the card to `table[c.strength.state]`, while weakness and strength states are complementary. Thus `table[c.weakness.state]` cannot contain that card at the check. A CONFIRMED strength plus CONFIRMED weakness currently enables the strength state with decision `ENABLED`; the blueprint statement that CONFIRMED weakness blocks the other state is not implemented. Deferred as a design question to the routing stage. The branch and its comment were left untouched.

**Frozen hashes:** `scripts/map-compass/frozen.mjs` SHA-256 `67f1c1eda386769fc262853856156bfdd74b3f05f50700a9aedb148e33840a22`; frozen `criteriaHash` `788e01dff4bba7455058fdcdf7fecb31dfb8f4c5215702a0e8bf50e0ef98b5e6`. Neither is changed.

**Historical stage note:** the conditional-routing correction was completed in the preceding change. Stage 3 was not rerun, no rehearsal was performed, and Stage 4 remained unauthorized. The dead-code weakness block remained a deferred routing-stage design question; this provenance task does not change it.

## Prior routing-fix test run (before data restoration/versioning; superseded)

`npm ci` succeeded (360 packages installed). The earlier full `npm test` run completed in 94.9 seconds: **416 passed, 5 failed**. This is a historical, data-incomplete run; the current verification position appears above after `mc:m1`, `mc:map`, and the versioning repair.

1. `synth UI: the map generator discloses the latest exhausted D1 result without claiming certification` — `tests/synth.test.mjs:694`, assertion “UI shows the final recorded D1 count”.
2. `every fetched blob still matches its pinned git oid` — missing `artifacts/map-compass/raw/fetch-manifest.json`.
3. `normalised outputs are LF-only, monotonic, and OHLC-valid` — missing `artifacts/map-compass/normalized/xauusd-m30-eat.csv`.
4. `no hindsight/derived column ever enters the normalised schema` — same missing normalized CSV.
5. `A6: full historical report is pinned and the A8 output state remains DEV-only` — pre-existing v1.10 hash mismatch: expected `3f1613e12b2e53b69aa360c0cc81490b59a6c2dc59b21273bd4cba7f3e87c5e2`, actual `decd0ae949288750c78a7939c67fb8c61003bcde356d270d93a1a17cca59d63c`. Per scope, no hash/blueprint file was changed.

All five routing regression tests passed, including the direct 22-card complementarity/key uniqueness proof. This historical test run is superseded by the corrected current run above; the A6 pin and data-contract failures were fixed by versioning and successful data retrieval. Stage 3 and Stage 4 remain prohibited.

## Blueprint provenance versioning — 2026-11-07, before Stage 4

- The commit immediately before the BLUEPRINT status edit in `1ba0e367a80e701358c0f336a6e8841149ebf319` is `3e32c067c39e184a3c85737dfb737ea0bfddb694`. `docs/BLUEPRINT-v1.10.md` was restored from that committed content.
- Restored v1.10 SHA-256: `3f1613e12b2e53b69aa360c0cc81490b59a6c2dc59b21273bd4cba7f3e87c5e2`; existing pinned v1.10 SHA-256: `3f1613e12b2e53b69aa360c0cc81490b59a6c2dc59b21273bd4cba7f3e87c5e2`. **They are equal.** The v1.10 pin entry was not changed.
- `docs/BLUEPRINT-v1.11.md` is byte-identical to the current, unchanged `BLUEPRINT.md`: 141,013 bytes, 2,097 lines, SHA-256 `decd0ae949288750c78a7939c67fb8c61003bcde356d270d93a1a17cca59d63c`. The registry adds `v111`; `current.matchesV111` is true and all other existing `matchesV*` flags are false.
- The amendment log now marks v1.10 “superseded by v1.11; preserved,” records the v1.11 metadata and reason, and explicitly states that `BLUEPRINT.md` content is unchanged by this commit. Snapshot tests now verify every versioned snapshot against its registry pin and separately verify `BLUEPRINT.md` against the single current snapshot.
- Integrity guards remain unchanged: `frozen.mjs` SHA-256 `67f1c1eda386769fc262853856156bfdd74b3f05f50700a9aedb148e33840a22`; `criteriaHash` `788e01dff4bba7455058fdcdf7fecb31dfb8f4c5215702a0e8bf50e0ef98b5e6`.

**Stage:** provenance/versioning repair before Stage 4. No Stage 3 rerun, Stage 4, rehearsal, or criteria change. The v1.10 pin remains immutable; v1.11 is current. Versioning commit `c3d853b7ff6f05c330d39793f469d208a0c4c49b` has been pushed to the authorized branch. The final remote tip is quoted in the handoff. **Next action:** await the separate follow-up; keep Stage 4 unauthorized.

## Stage 4 orchestrator authorization — 2026-11-08, before code

**Owner authorization (2026-11-08; recorded before any orchestrator code exists):** The Stage 4 orchestrator is authorized as a deliberate pre-registered component and is the **only new machinery permitted**. It consists of exactly one new driver script plus its tests. The driver may only wire the existing DEV segment builder, card signals, one-slot trade producer with the frozen exit harness, segmented random control, 25-cell sweep, `verifyReal` with `a8DevOnly=true`, and report generation. It must not change `scripts/map-compass/frozen.mjs`, `verifyReal`, `lib/verification.mjs`, `lib/signals.mjs`, `lib/compass.mjs`, or any threshold, card, cost, or exit rule. This authorization is dated before the code exists.

**Verifier review and signature (2026-11-08):** `docs/STAGE-4-ORCHESTRATOR-SPEC.md` was revised after line-by-line verifier review. The two requested corrections and four rulings were applied; it is now **SIGNED as the Step 2 build contract**. Section 10 records the one arithmetic inconsistency in the supplied DEV segment counts (sum 127,538 versus required total 131,922); do not guess or silently amend the counts. No orchestrator code or tests exist yet. This signature authorizes only Step 2 implementation within the recorded scope, not a Stage 4 run. If a real run fails after the first ledger append but before final publication, publish nothing further, do not retry or delete anything, and mark the run FAILED here.
