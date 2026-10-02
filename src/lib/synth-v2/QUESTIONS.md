# Questions / provisional assumptions

## Q1 — Source timestamp interpretation

- **Options:** (A) treat the unzoned row timestamps as EAT wall-clock time, matching the engine CSV contract and the file's `data_age` metadata; (B) treat them as UTC, as suggested by some section-marker text, then convert to EAT.
- **Recommendation:** A, because the source rows themselves have no offset and the generated CSV must follow the engine's unzoned EAT contract. This is the least disruptive interpretation for a parser-ready output.
- **What I did meanwhile:** used EAT for calibration and for mapping source instants to London/New York local time; the ambiguity is disclosed in `REPORT.md`. I did not shift or repair source timestamps.
- **How to change it:** if the source owner confirms UTC, revise the input epoch conversion in `time.ts`, recalibrate, rerun G1–G8 and D1, regenerate all artifacts, then commit/push a stage update.

## Q2 — Trend-dial variance-ratio endpoint

- **Options:** (A) constrain the trendiness dial endpoints so VR(8) and VR(16) remain inside the real-data bootstrap range; (B) keep the empirical p10/p50/p90 lag-1-ACF endpoints and treat the normal-setting G6 gate as the only variance-ratio pass/fail check.
- **Recommendation:** A for any future certified release, because the suggested method explicitly says the trend dial is bounded by the observed variance-ratio range.
- **What I did meanwhile:** kept the p10/p50/p90 lag-1-ACF dial values, recorded the endpoint check in `REPORT.md`, and did not clamp or remap it. At p10, VR(8) and VR(16) fall below their real 120-weekday bootstrap intervals. The normal-setting G6 checks pass. Both permitted structural repair attempts were already used, and G2 lag-1 remains a fixed-gate failure, so I stopped without another model change.
- **How to change it:** in a separately authorized follow-up, choose the empirical VR range/bound definition, recalibrate the trend-dial mapping, and rerun all realism and D1 checks. Do not widen the current gates.

The earlier missing Stage 1 prompt is resolved: the full prompt was provided before implementation began. No other open user decisions were required for this stage.
