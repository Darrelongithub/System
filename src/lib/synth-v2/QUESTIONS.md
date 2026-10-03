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
