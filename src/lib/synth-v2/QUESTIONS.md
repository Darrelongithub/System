# Open questions and provisional decisions

## Q1 — Source clock versus contradictory section marker

- **Options:** (A) use the empirical fixed-EAT interpretation; (B) trust the source section marker `(UTC)` and treat the rows as UTC.
- **Recommendation:** A. The Monday reopen moves from 01:00 (US DST) to 02:00 (US standard), while the 08:30 New York activity proxy moves from 15:30 to 16:30 in the stamp clock. This matches EAT (UTC+3) around New York's DST cycle; the CSV `data_age` and `generated_at` metadata also align.
- **What I did meanwhile:** retained EAT timestamps and did not shift bars or recalibrate the profile. The UTC section-marker conflict is recorded in `REPORT.md`. If the source owner establishes that the marker is authoritative, the profile must be rebuilt from a UTC-to-EAT conversion and all gates rerun.

## Q2 — Overlay incidence for Stage 2

- **Options:** (A) let each overlay cover an entire segment when selected; (B) place a short internal episode of each selected overlay within a segment.
- **Recommendation:** B, so overlays can be observed both on and off within a base regime without changing the base regime labels.
- **What I did meanwhile:** unless stronger task details are supplied, the deterministic interim is an independent 25% chance per segment for each overlay, with one contiguous 2–5 trading-day window chosen uniformly inside the segment. The news overlay sets news intensity high; the gap overlay sets gap size high. This is a coverage convention, not a calibrated event frequency, and will be disclosed.

## Q3 — Stage 2 meaning of a “real-data band”

- **Options:** (A) derive empirical source p10–p90 bands at the same five-weekday VR horizon available inside the minimum ten-weekday planted segment; (B) reuse the Stage 1 120-weekday moving-window VR band even though it crosses segment boundaries or has no fully contained window in short segments.
- **Recommendation:** A, to avoid mixing two planted regimes in one statistic and to keep the VR observation wholly within a segment.
- **What I did meanwhile:** used source p10–p90 bands for Wilder ATR(14)/close per bar, one-weekday close/open log drift, and overlapping five-weekday VR8/VR16. Segment calculations exclude blend bars; missing samples count as zero. A segment attains only if at least 90% of each applicable sample is in-band. No failed check is repaired.

## Q4 — Exact names/settings of the seven Stage 2 base regimes

- **Options:** (A) use the established seven single-condition presets `quiet_range`, `normal_chop`, `slow_grind_up`, `strong_uptrend`, `slow_grind_down`, `strong_downtrend`, and `whipsaw`; (B) use a different explicit seven-regime list from the original task details.
- **Recommendation:** A as the conservative interim because those are the seven established base presets and keep `news_storm`/`gap_shocks` separate as the requested optional overlays.
- **What I did meanwhile:** planted A, mapping low/normal/high volatility to source p10/p50/p90, flat/up/down drift to p50/p90/p10, mean-reverting/random/trending dial to the constrained trend p10/source p50/constrained p90, respectively. The condensed task context did not contain the original explicit list; the Stage 2 report calls this out.

## Q5 — Meaning of “±10% within-segment dial wobble”

- **Options:** (A) additive wobble bounded by ±10% of each dial's empirical p10–p90 width; (B) multiply each dial by 0.9–1.1, which produces no useful wobble for a zero-centered flat drift dial.
- **Recommendation:** A, because it also gives meaningful bounded wobble to flat/negative drift and trend settings.
- **What I did meanwhile:** linearly interpolated deterministic daily wobble knots with amplitude at most 10% of the empirical dial-band width. Any resulting setting outside observed bands is marked `EXTRAPOLATION` per bar.

## Q6 — Pairwise AUC threshold for “inseparable”

- **Options:** (A) call a pair operationally inseparable when its best single-feature AUC is below 0.60; (B) use a stricter cutoff such as 0.65 or report AUCs without a binary class.
- **Recommendation:** A as a transparent, modest-above-chance reporting threshold; this is not a generator gate or detector-performance claim.
- **What I did meanwhile:** reported all four feature AUCs and labels pairs below 0.60 `INSEPARABLE`; the threshold is disclosed and no Stage 2 patch follows from it.
