# Open questions and interim decisions

## Q1 — Source clock versus contradictory section marker

- **Options:** (A) use the empirical fixed-EAT interpretation; (B) trust the CSV section marker `(UTC)` and interpret rows as UTC.
- **Recommendation:** A. The empirical weekend reopen and New York activity-slot shifts support fixed EAT, and the source metadata aligns with the final EAT row.
- **What I did meanwhile:** retained EAT timestamps; no rows were shifted and no profile/gates were rerun for a clock conversion. `REPORT.md` records the full evidence. If the source owner establishes that the UTC marker is authoritative, convert the source to EAT, recalibrate, and rerun all Stage 1 gates.

## Q2 — Optional overlay incidence

- **Options:** (A) selected overlays persist for a whole segment; (B) selected overlays occupy one short internal episode, allowing on/off examples within each regime.
- **Recommendation:** B for label coverage without changing the base regime.
- **What I did meanwhile:** independently selected each overlay with 25% probability per segment and placed one contiguous 2–5 weekday episode uniformly inside that segment. This is a deterministic coverage convention, not a calibrated event-frequency estimate. `news_storm` sets news intensity to source p90 and `gap_shocks` sets gap size to source p90.

## Q3 — Stage 2 variance-ratio band horizon

- **Options:** (A) derive real-source VR8/VR16 p10–p90 bands from rolling five-weekday windows wholly within a segment; (B) reuse Stage 1's 120-weekday VR bands, which cannot be evaluated wholly inside the minimum ten-weekday segment.
- **Recommendation:** A to avoid mixing planted regimes and to retain a meaningful within-segment sample.
- **What I did meanwhile:** derived the Stage 2 source bands at five weekdays; Stage 1's fixed 120-weekday gate and trend-endpoint bands remain unchanged. Blend-labelled bars are excluded from segment checks, and windows without enough clean observations contribute zero coverage. No failed Stage 2 check is repaired.

## Q4 — Meaning of “±10% within-segment dial wobble”

- **Options:** (A) additive wobble bounded by ±10% of each dial's empirical p10–p90 width; (B) multiply the dial by 0.9–1.1, which gives little useful wobble around zero/negative values.
- **Recommendation:** A so flat and negative drift settings also receive meaningful bounded variation.
- **What I did meanwhile:** used deterministic daily wobble knots with amplitude at most 10% of the source dial-band width, interpolated across each day. Every per-bar value outside its observed band, or outside the Stage 1b trend VR constraint, is flagged `EXTRAPOLATION`.

## Resolved by the supplied task specification

- The seven regimes are exactly `quiet_range`, `normal_chop`, `trend_up`, `trend_down`, `whipsaw`, `expansion_up`, and `expansion_down`, with the supplied low/normal/high volatility, flat/up/down drift, and mean-reverting/random/trending combinations. The Stage 1b VR-constrained trend endpoints are used for the mean-reverting/trending extremes.
- A pair is labelled `INSEPARABLE` exactly when its best single-feature DESIGN AUC is below 0.60; this is a reporting threshold, not a gate or detector-performance claim.
