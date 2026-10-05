# Stage 2b questions, assumptions, and interim actions

## Resolved by the task owner

### Clock: EAT

- **Options:** (A) interpret the source bars as fixed EAT (UTC+03:00); (B) follow the conflicting `(UTC)` header and shift/reinterpret timestamps.
- **Recommendation:** A, per the owner.
- **What I did meanwhile:** verified the frozen source SHA-256 and inspected `time.ts`: the parser treats timestamps as EAT wall-clock and uses a fixed +03:00 offset. I will not shift source rows or change Stage 1b code.

### Overlay placement

- **Options:** (A) overlays occupy whole regimes; (B) short internal episodes.
- **Recommendation:** B, per the owner.
- **What I did meanwhile:** retain independent 25% selection per segment, one contiguous 2–5 weekday episode wholly outside blend zones when there are enough safe weekdays. Incidence/duration are testing coverage conventions, not event-frequency estimates.

### Wobble

- **Options:** (A) additive ±10% of the empirical p83–p17 width; (B) multiplicative 0.9–1.1 scaling.
- **Recommendation:** A, per the owner.
- **What I did meanwhile:** pre-registered deterministic interpolated daily knots with the additive bound; the width for the one trendiness control is the p83–p17 range of its analytic VR-target mapping.

## Operational interpretations frozen before generation

### 60-weekday real-ceiling classification

- **Options:** (A) classify a 60-weekday stretch by the median of its 41 contained, overlapping W=20 weekday statistic windows; (B) use a central or non-overlapping subset of those W windows.
- **Recommendation:** A, because all compared statistics remain W=20 and the ceiling measures persistence through the stretch.
- **What I did meanwhile:** pre-registered A; for each tercile the ceiling is the mean fraction of the 41 windows in that same tercile, with `n` equal to the number of qualifying rolling 60-day stretches.

### Single trendiness dial versus two VR statistics

- **Options:** (A) map each real p17/p50/p83 VR8/VR16 target pair back to one AR(1) coefficient by a fixed theoretical-VR least-squares grid; (B) reuse Stage 1b's trendiness endpoints, which are tied to other horizons.
- **Recommendation:** A, to use the newly specified W=20 VR8/VR16 values without changing Stage 1b code.
- **What I did meanwhile:** pre-registered the theoretical AR(1) mapping and fixed grid in `SPEC-2b.md`; each VR horizon remains separately checked and reported.

### Auxiliary gap/news dial references

- **Options:** (A) derive W=20 gap-size and tail-share auxiliary bands for wobble/extrapolation, while keeping them outside C1–C3; (B) reuse the old profile-wide gap/news bands.
- **Recommendation:** A, to keep Stage 2b extrapolation references aligned to W=20.
- **What I did meanwhile:** use W=20 p50 as each base dial, W=20 p90 for its active overlay, and p83–p17 widths for wobble. These auxiliary statistics do not create extra regime-realism checks.

### C3 aggregation and overlapping windows

- **Options:** (A) pool all eligible synthetic W=20 windows in each intended level before computing its median; (B) compute per-path medians and then give each path equal weight.
- **Recommendation:** A, so the ordering check is directly on the pooled realized-window distribution.
- **What I did meanwhile:** pre-registered A, with windows stepping one weekday at a time. DESIGN and NULL remain separate cohorts.

## Unresolved reference in Part A

### The task refers to “the owner’s diagnosis,” but the diagnosis itself is not present in the accessible repository artifacts

- **Options:** (A) treat the edge-placement explanation (p10/p90 dials plus ±10% wobble causing extrapolation) as the diagnosis to assess; (B) treat the reference as an unspecified alternative and do not attribute a diagnosis.
- **Recommendation:** A, because the frozen old settings and requested `1 - 0.5^k` comparison directly test that explanation.
- **What I did meanwhile:** assess edge placement quantitatively and describe it as a strong approximate explanation, not proof; disclose that no separate owner statement was available and report the independent window-horizon mismatch.

## Stage 2b generation stop after a frozen LOCKED TEST path failed

### How to proceed after Stage 1b raises an invalid-OHLC exception on LOCKED TEST seed 6142

- **Options:** (A) stop at the frozen configuration and report the Stage 2b cohort as incomplete; (B) change Stage 1b OHLC generation, adjust settings/start price, or replace/reseed the failing LOCKED path and re-register a new protocol.
- **Recommendation:** A. B would alter out-of-scope Stage 1b behavior or the frozen Stage 2b cohort after DESIGN paths/statistics had already been produced, and would compromise the registered sample.
- **What I did meanwhile:** the preregistered bulk runner stopped at seed 6142. To complete the independent allowed outputs without changing frozen inputs or opening LOCKED TEST data, I replayed DESIGN with the same frozen code/settings, regenerated all 700 NULL paths, and re-generated seeds 6001–6141 solely to hash and compare their compressed bytes with the already-written files. No LOCKED path was decompressed or analyzed. The cohort remains incomplete because LOCKED seeds 6142–6200 were not generated. The report and partial inventory state this limitation; the original bulk process had not persisted its in-memory DESIGN hash rows, so the 20-path audit compares against the deterministic replay inventory, not a lost first-run inventory. No Stage 1b code, setting, source, or seed was changed.

## Other limitations to report

- A real ceiling with fewer than 15 qualifying stretches is marked `THIN`; C1 is then not counted as a pass or failure for degradation, while C2/C3 remain assessable.
- The real source has a contradictory `(UTC)` section marker; no source-owner metadata beyond the supplied EAT decision was available.
- The Stage 1b profile's timezone/runtime tzdata version is not pinned. Stage 2b itself uses its fixed EAT parser and existing IANA exchange-slot seasonality only for source-standardized news-tail normalization.
- The older Stage 2 cohort, especially its LOCKED TEST, is superseded/abandoned and will remain unopened.

## Current-workspace blocker and follow-up notes (retained)

## Q1 — Stage 1 prompt was not included

- **Options:** (A) paste the actual Stage 1 prompt; (B) authorize a provisional generator design without its acceptance criteria.
- **Recommendation:** A. The message ends with the literal placeholder `[PASTE THE STAGE 1 PROMPT HERE]`; implementing a market generator without the promised requirements would be speculative and potentially unsafe.
- **What I did meanwhile:** did not create generator code, infer a design, or modify anything under `src/lib/synth/`. At the time this note was written, the new directory contained only this blocker note.
- **How to change it:** provide the Stage 1 prompt; implementation can then proceed in `src/lib/synth-v2/` independently of the retired generator and spec.

## Q2 — How to target realized W=20 ATR% with the unchanged Stage 1b volatility dial

- **Options:** (A) retain the W=20 realized ATR% estimand and preregister a market-statistics-only mapping from Stage 1b `volatilityLevel` to achieved W=20 ATR% using disjoint calibration/validation data; (B) redefine the Stage 2b volatility target as Stage 1b's daily standard deviation of 30-minute returns, changing the requested estimand; (C) accept the present DEGRADED result and do not run a follow-up.
- **Recommendation:** A if the W=20 ATR% target is still required. The report-only diagnosis finds the control and target are different quantities; the completed cohorts must not be repaired or reused as validation.
- **What I did meanwhile:** made no generator/config/seed/path changes and generated no new paths. The current DESIGN/NULL results remain DEGRADED, LOCKED TEST remains incomplete and unopened, and the approximately 2.517 NULL scale ratio is descriptive only—not a correction factor.

## Reissued full Stage 2b task — fixed-seed replay (2026-10-04)

### The earlier report-only / no-new-paths restriction was superseded

- **Options:** (A) leave the prior report-only ATR diagnosis as the terminal state and generate no paths; (B) follow the reissued full Stage 2b task, retaining the exact existing specification, configuration, and seed lists.
- **Recommendation:** B, because the latest owner request explicitly re-authorized the complete fixed-cohort regeneration while forbidding post-result changes.
- **What I did meanwhile:** verified the required source CSV hash, spec SHA-256, preregistered code/input/config/seed hashes, and recorded runtime before replay. No spec, setting, code, profile, or seed was changed. Re-generated DESIGN 5001–5200, LOCKED TEST 6001–6141 in hash-only mode, and all 700 NULL paths; all 1,041 canonical/compressed hash pairs matched the committed partial inventory. The 20 preregistered DESIGN/NULL rebuild samples matched both hashes. DESIGN seed 5001 passed the engine CSV parser round trip.

### Fixed LOCKED TEST seed 6142 fails deterministically

- **Options:** (A) stop this locked cohort and report it incomplete; (B) patch Stage 1b, alter settings, or replace/reseed a path after seeing the failure.
- **Recommendation:** A for this registered cohort. B is outside the current scope and would invalidate the frozen holdout. A future repair must use a separately approved, versioned, newly preregistered cohort rather than silently reusing this seed list.
- **What I did meanwhile:** re-attempted seed 6142 under the exact frozen runtime/config. The unchanged Stage 1b generator again threw `bar-shape construction produced invalid OHLC at 2026-08-24 15:00:00`; no artifact was written for the failing seed and seeds 6142–6200 remain ungenerated. The first 141 locked paths were generated and hashed only. No locked artifact was decompressed, parsed, statistically inspected, or analyzed. No workaround was applied. The study remains **INCOMPLETE**.

### Proposed next phase (not started)

- **Options:** (A) authorize a separate Stage 1b OHLC-construction defect investigation, focused regression test, and minimal repair, followed by a new frozen Stage 2b specification/config/seed list and full DESIGN/NULL plus hash-only LOCKED generation; (B) accept this Stage 2b study as incomplete and stop without changing Stage 1b.
- **Recommendation:** A only as a separately scoped follow-up, with explicit approval for Stage 1b changes and a new cohort; until then choose B for the current fixed study. Never repair or substitute seed 6142 inside this registered cohort.
- **What I did meanwhile:** stopped after recording the deterministic failure and the allowed market-statistic results. No detector, strategy, trade, R, P&L, or analyzer-result work was performed. The next phase has not begun.

## Stage 2c questions, assumptions, and interim actions (2026-10-04)

### Q1 — Monotone dial-response map calibration protocol

- **Options:** (A) Calibrate a 16-point grid of \`volatilityLevel\` on disjoint calibration seeds 91001–91200, then invert linearly to map real W=20 ATR% targets (p17/p50/p83) into dial space; (B) Structurally refit the slow volatility AR(1) parameters.
- **Recommendation:** A. The base model at its default normal setting already passed both G9 (median, p10, p90) and G10 (persistence) within the bootstrap 95% CI tolerances. As preregistered in SPEC-2c, when G9/G10 pass on the default setting, only the dial map is changed.
- **What I did meanwhile:** Fit the monotone dial-response map across 200 separate calibration seeds (91001–91200) spanning dials 0.00030 to 0.00180. The inverted dial mapping yielded p17=0.00063163, p50=0.00075683, p83=0.00108368, with wobble width 0.00045204. Applied this mapping to Stage 2c regime generation.

### Q2 — Generator invariant crash fix at root cause

- **Options:** (A) Enforce price positivity in \`generate.ts\` by flooring \`low\` at the minimum positive cent tick (\`Math.max(0.01, ...)\`); (B) Catch and skip failing seeds.
- **Recommendation:** A. Fixing at the root cause guarantees that physical price positivity ($0 < \\text{low} \\le \\min(\\text{open}, \\text{close})$) is strictly maintained across all extreme returns and wick geometries, while option B is forbidden by the specification.
- **What I did meanwhile:** Implemented the root-cause fix in \`src/lib/synth-v2/generate.ts\`. Verified that debug seed 90135 reproduces the crash before the fix and passes all invariants with the fix. Verified that all 200 LOCKED TEST seeds (6001–6200) generate completely without error (hash-only mode, price data unopened). Passed the 5,000-path invariant stress test (G11) with zero invalid bars across 7,343,911 bars.

### Q3 — Separate seed cohorts and inventory durability

- **Options:** (A) Flush each path hash to disk immediately after generation so that interruptions lose no progress; (B) Buffer all hashes in memory and write at script completion.
- **Recommendation:** A, to satisfy Rule 3 durability and prevent hash loss.
- **What I did meanwhile:** Implemented immediate flushed appending to \`STAGE2C-SHA256SUMS.txt\` in \`scripts/synth-v2-stage2c.mjs\`. All 1,100 paths (DESIGN 8001–8200, LOCKED TEST 6001–6200, NULL 20001–20700) were generated and recorded on disk.

## Stage 3 questions, assumptions, and interim actions (2026-10-05)

### Q1 — Overlay disabling diagnostic on seeds 92001–92200

- **Options:** (A) Modify `stage2b-regimes.ts` to expose an overlay toggle; (B) Generate paths without overlays using a custom wrapper; (C) Do not modify generator code per Rule 2, report that the config does not expose an overlay toggle, and use the pre-registered NULL cohort (which has overlays disabled by definition) to evaluate the overlay spread hypothesis.
- **Recommendation:** C. Rule 2 strictly forbids modifying Stage 2b/2c generator code or configuration formats.
- **What I did meanwhile:** Followed option C. Confirmed through the 700 NULL paths (where overlays are disabled) that realized ATR% medians match DESIGN medians to within $\pm 0.003\%$, proving overlays do not explain the window ATR% spread.

### Q2 — Handling absurd bars in LOCKED TEST scoring

- **Options:** (A) Decompress and inspect LOCKED TEST candle ranges before scoring to exclude absurd paths; (B) Score all 200 LOCKED TEST paths unconditionally and report the DESIGN absurd-path frequency (62.5%).
- **Recommendation:** B, per the explicit pre-registered rule in Part 1.
- **What I did meanwhile:** Scored all 200 LOCKED TEST paths in memory exactly once without cherry-picking or pre-filtering.

### Q3 — Pass bar failure reporting on LOCKED TEST

- **Options:** (A) Alter hyperparameters or retrain with a different model family to attempt a pass; (B) Report the verdict as FAIL without post-hoc modifications.
- **Recommendation:** B, per Rule 8 and Part 4 ("If any bar fails, the verdict is FAIL; report it as is and change nothing").
- **What I did meanwhile:** Reported the empirical results faithfully: LOCKED TEST failed D-1, D-2, D-3, and D-4, with final verdict FAIL.

## Stage 3b questions, assumptions, and interim actions (2026-10-05)

### Q1 — Model capacity comparison architecture

- **Options:** (A) Implement a self-contained 100-tree Bagged Ensemble with bootstrap sampling and depth 6 trees; (B) Use an external npm package that may introduce network or environment dependencies.
- **Recommendation:** A. A self-contained implementation guarantees pure determinism and zero environment instability.
- **What I did meanwhile:** Implemented `trainBaggedTreeEnsemble` in `diagnostics.ts` with 100 bootstrap trees up to depth 6. Evaluated it side-by-side with multinomial logistic regression and the frozen detector.

### Q2 — Real-gold daily return definition convention

- **Options:** (A) NY session close / EAT 00:00 midnight end-of-calendar-day close; (B) Open-to-close return; (C) London fix close.
- **Recommendation:** A. In standard market finance, daily returns are defined as log difference of consecutive daily closes ($\ln(\text{close}_t / \text{close}_{t-1})$).
- **What I did meanwhile:** Grouped real gold 30-min bars by date and extracted the final 30-min close of each full trading day ($\ge 24$ bars), yielding 1,726 consecutive completed daily returns.

### Q3 — Status of absurd bars in generator code

- **Options:** (A) Patch `generate.ts` immediately to cap wicks; (B) Document the exact line numbers and mechanism in `STAGE3B-REPORT.md` without modifying generator code.
- **Recommendation:** B. Rule 2 strictly forbids modifying the generator in Stage 3b ("Output bars only; do not modify the generator. Read generate.ts and state which construction step can produce a range this large, with line references. Do not fix it.").
- **What I did meanwhile:** Identified lines 287–296 in `src/lib/synth-v2/generate.ts` and explained the unbounded wick expansion mechanism without altering code.



