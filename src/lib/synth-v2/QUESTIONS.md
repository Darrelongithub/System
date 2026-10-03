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

- **Options:** (A) use empirical 10th–90th percentiles of the applicable source daily or rolling-window statistic; (B) use the wider bootstrap 95% interval already used by the Stage 1 gates.
- **Recommendation:** A, because the Stage 2 check explicitly says “real-data band” and the generator's dials are calibrated at p10/p50/p90.
- **What I did meanwhile:** use source-data p10–p90 bands for daily ATR%, daily drift, and 120-weekday moving-window VR8/VR16. Check (a) will count segment-days outside those bands after excluding blend bars; any regime below 90% will be marked DEGRADED and left unchanged.
