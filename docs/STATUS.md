# Work status — G0 Amendment 8, authorized Parts 2–4

**As of:** 2026-11-07 (Africa/Nairobi)
**Branch:** `arena/072665f9-system`
**Current task stage:** Part 2 is implemented and calibrated; Part 2 commit/push is the next gate. The owner approved Amendment 8C’s A/B no-edge criterion and authorized Parts 2–4, including exactly one Stage 3 run. **Do not run Stage 4 or rerun Stage 3 after results exist.**
**Verified starting remote tip:** `ad1f9433ba3cdf8be20393ebe8e34b6c11ba031a`.
**Stage 3b scored worlds:** none yet. **Stage 4:** not run; `claim-verification.json` and `claimed-trades.jsonl` remain guarded/absent.

## Dated decisions and acceptance criteria

- **2026-11-07 — Amendment 8C approved.** Use the A/B no-edge rule: mean unique strategy-level confirmed cards/world ≤ `max(0.5,1.5λ)`; maximum ≤ smallest `k≥2` with `P(Poisson(λ)>k)<0.001`. Recompute λ from the 44 card-half A model. At λ≈0.2817011047 this gives mean≤0.500 and max≤3. Always report the previous mean≤0.5/max≤2 bounds beside the new bounds and observed A/B values.
- The owner accepted the caveat: the prior A result 0.700 mean / max 4 is inside the new bounds, so the approved rule will not flag a roughly 0.28-cards/world leaked-drift defect. The change is justified as calibration to 44-cell multiplicity, not as evidence the anomaly is benign.
- Parts 2–4 are authorized. Stage 3 is one-time: A, B, C and C-D; 10 worlds/condition; 60,000 bars/world. Any criterion failure is a hard stop; no rerun and no Stage 4.
- C-D preserves the original Donchian-20 planting as report-only and has no pass criterion. If C confirms in fewer than 8/10 worlds, report the power result; do not increase edge.
- UNKNOWN is UNBINNED: execute trades in each card’s slot; count/share them in the book totals, but exclude them from both EFFICIENT and CHOPPY verdict cells.

## Part 2 — completed, not yet committed

### Data and role boundary

- `npm install`, `npm run mc:m1`, and the safe `npm run mc:map` completed. M1 fetched 76 files with no errors; the normalized XAUUSD M30 feed has 248,912 rows. The three tracked metadata files changed only in `generatedAt`, so those timestamp-only edits were restored; frozen cost inputs were not altered.
- The original map builder computed features on the full feed. It was made DEV-segment-only **before running** `mc:map`: Map/features/statistics now receive only the four frozen DEV segments (131,922 bars); 116,990 non-DEV rows are emitted as `EXCLUDED` with blank feature cells. Causality, truncation, determinism, sensitivity and coverage report PASS. No VAL/HOLDOUT/STRESS OHLC entered features or signals.
- `npm run mc:a8-audit` now recomputes each DEV segment independently. Totals: 131,922 DEV bars; 4,000 warm-up and 384 tail exclusions; 127,538 eligible entry bars. The old full-feed continuous-Map comparator was omitted rather than computing features on sealed rows.
- Real DEV input was used in Part 2 for **signal-only** tables. No real DEV trade/outcome was generated. Synthetic pilots alone were used for expected strength-state trade counts and calibration. The frozen cost file remains unchanged.

### C card, exclusions and calibration — frozen before scored worlds

- Selected card: **`williams-r-fade`**, strength state CHOPPY; 17,594 DEV signals; 6,900 exclusive (39.22%); expected strength-state trades 1,450.667 per 60,000-bar pilot world.
- The next eligible exclusivity candidates were `bollinger-20-2` (38.77%), `morning-evening-star` (35.96%), `inside-bar-break` (34.48%) and `nr7-break` (23.78%). Higher-share cards did not meet the ≥600 expected strength-state trade requirement.
- Frozen contamination exclusion: **`pdh-pdl-break`**; 6,038 same-bar/same-side co-fires, 34.32% of planted-card DEV signal bars (>25%). The full signal-only pairwise table and all real/synthetic pilot card tables are in `artifacts/map-compass/a8-part2-prep.json` and `docs/G0-AMENDMENT-8-PART2.md`.
- Three disjoint pilot seeds: 20261110, 20261111, 20261112. Condition B retained its constant additive drift generator, but recalibrated only the drift scalar against the production matched-control pipeline (world-specific M15 `seed+71`, UNKNOWN-state random entries dropped): 0.03143677 → **0.03542774**; mean pilot random-long net +0.1677R (target +0.15R), gross +0.3264R, cost 0.1587R.
- For C, the 24-bar pilot window share exceeded 40%, so the preregistered 12-bar contingency was applied before scoring. Final drift is **0.23780454 price units/bar**; across three pilots, measured gross +0.4964R, net +0.3466R (target about +0.30R), and cost +0.1497R. The 12-bar window share remains 68.81%; this is explicitly reported and no further shortening is authorized by the pre-registration.
- Part 2 freeze SHA-256: `e594639f33c065beb7e8389b62a3768d2d3c1aaa478e94c6f670d9d522853a16`. Part 2 code/report and the safe map-role correction must be committed and pushed before Stage 3.

## Existing freeze assertions and Stage 4 guard

The repository review recorded **seven actual current-card freeze test cases**, not ten. Their old → current assertions are documented in `docs/G0-AMENDMENT-8-REPORT.md`: Amendment 2 full-text and freeze guard; A3 historical guard; A4 signal-library contract and verifier guard; A5 calendar-baseline guard; A6 sequence/history guard. A6’s separate historical output-absence assertion is retained. Historical v1.5 “24 DRAFT cards” prose remains historical. The Stage 4 guard still requires both `artifacts/map-compass/claim-verification.json` and `artifacts/map-compass/claimed-trades.jsonl` to be absent before separate Stage 4 authorization.

New tests additionally pin DEV-only map computation, Part 2 freeze-hash integrity, UNKNOWN book totals, and UNKNOWN exclusion from both verdict cells.

## Test status before Part 2 commit

The last full `npm test` run, before the stale historical-hash assertion was updated, reported **414 passed, 2 failed** in 88.2 seconds. Failures: (1) existing unrelated `tests/synth.test.mjs:694` D1 display assertion (“UI shows the final recorded D1 count”); (2) `tests/map-compass/amendment6.test.mjs:71` expected current blueprint v1.9 SHA `c91ee38…` while `blueprint-hashes.json` and current `BLUEPRINT.md` correctly identify v1.10 SHA `3f1613e…`. The A6 test now checks the already-recorded v1.10 hash, and its focused test passes. The final full-suite result is still pending. All new A8 Part 2/map/UNKNOWN tests passed in the prior full run; do not represent the full suite as green.

## Next actions — strictly ordered

1. Final static review, inspect Stage 4 output absence, run tests/role checks as needed.
2. Commit and push Part 2 to `arena/072665f9-system`; verify the remote tip equals the pushed commit.
3. Only after remote verification, run `npm run mc:a8-stage3b` exactly once. It refuses an existing output and refuses Stage 4 output files.
4. Report all four-condition tables, λ recomputation, old/new bounds beside A/B observations, confirmation lists, C planting/exclusions and coverage identities, and the final full test result.
5. If every criterion passes, commit/push results, verify the remote tip, then stop. If any criterion fails, hard stop without rerun. Never run Stage 4.

## Prior records

Part 1/1b and earlier freeze/pre-registration records remain in `docs/G0-AMENDMENT-8B-PART1-DIAGNOSIS.md`, `docs/G0-AMENDMENT-8B-PART1B.md`, `docs/BLUEPRINT-v1.10.md`, `docs/G0-AMENDMENT-8-REPORT.md`, and the existing `a8-stage3b-part1-diagnostics.json` artifact. These historical files are not scored Stage 3b output.
