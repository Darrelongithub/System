# Synth V2 Stage 2b — pre-registered specification

**Frozen date:** 2026-10-03. This specification must be hashed and recorded before any Stage 2b path is generated. The pre-registered checks and settings below are not adjusted after generation.

## Provenance and scope

- Source: `XAUUSD_30min_2020-01-24_to_2026-10-01.csv`, expected SHA-256 `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`. Stop before calibration or generation if it differs.
- Interpret source wall-clock timestamps as fixed EAT (UTC+03:00). Do not shift source timestamps. The source `(UTC)` marker is recorded as a metadata conflict, not used to reinterpret bars.
- Use the committed Stage 1b profile and generator unchanged. Stage 1b G1–G8 and D1 passed; G2 passed. Stage 2's older data and reports remain in the repository but are superseded. Its LOCKED TEST cohort is ABANDONED and must not be opened, decompressed, or analyzed.
- Use market statistics only. No detector, strategy, trade, R, or P&L work is in scope.

## Window statistics and real calibration

Let `W = 20` eligible EAT weekdays. Eligible source weekdays are Monday–Friday dates with at least 24 bars, sorted by date. Windows slide one eligible weekday at a time; only complete W-day windows are used. Synthetic checks use the same W and stride, with 20 consecutive full weekdays wholly inside one segment and no bar in any of those weekdays labelled `inBlend`.

For every W-day window calculate:

1. **ATR%:** arithmetic mean of Wilder ATR(14) divided by prior close over its bars (the first bar uses its own close as denominator). Wilder ATR is computed chronologically over the eligible weekday series.
2. **Drift:** arithmetic mean of the 20 daily log returns `log(last close / first open)`.
3. **VR8 and VR16:** from close-to-close log returns in the W-day window, omitting the first bar's unavailable return. For horizon `q`, use `populationVariance(overlapping q-return sums) / (q * populationVariance(one-bar returns))`. Apply the identical formula to real and synthetic windows.

For each primary statistic (ATR%, drift, VR8, VR16), derive p5, p17, p33, p50, p67, p83, and p95 from all real W-day windows; also retain p90 for the auxiliary overlay-high settings. Here p33 and p67 mean probabilities 0.33 and 0.67 (not 1/3 and 2/3). Quantiles use linear interpolation at position `(n - 1) * p`. Terciles are LOW `< p33`, NORMAL `p33` through `p67` inclusive, and HIGH `> p67`.

The regime's planted target is p17 for LOW, p50 for NORMAL, and p83 for HIGH. Regime mapping is frozen as follows: `quiet_range` (vol LOW, drift NORMAL, VR8/VR16 LOW); `normal_chop` (NORMAL, NORMAL, NORMAL); `trend_up` (NORMAL, HIGH, HIGH); `trend_down` (NORMAL, LOW, HIGH); `whipsaw` (HIGH, NORMAL, LOW); `expansion_up` (HIGH, HIGH, HIGH); `expansion_down` (HIGH, LOW, HIGH).

The generator has one AR(1) `trendiness` dial but checks two VR horizons. For each target pair (VR8 p17/p50/p83, VR16 p17/p50/p83), set the dial to the `phi` in `[-0.94, 0.94]` minimizing the sum of squared errors from the theoretical AR(1) VR at horizons 8 and 16, each error divided by that statistic's `(p83 - p17)` width. The theoretical value is `1 + (2/q) * sum((q - k) * phi^k, k=1..q-1)`. Search the fixed grid `-0.94, -0.9399, ..., 0.94`; ties choose the lowest `phi`. The empirical VR estimator is defined for at least `2q` one-bar returns; every W=20 window and 48-return AUC window therefore supports both horizons. This uses real W-window VR medians only and does not edit Stage 1b bounds or code.

Two auxiliary W-window statistics are derived only to set/wobble/flag the optional overlay dials; they are not C1–C3 checks: (a) median absolute open-gap log size in prior ATR units for within-window transitions longer than 30 minutes; (b) fraction of bars whose absolute standardized close/open return exceeds the frozen Stage 1b source tail threshold. For (b), per-day close/open returns are centered and scaled by that day's population mean/SD and the frozen EAT exchange-slot seasonal factor; the global source residual mean and sample SD, computed once over eligible source bars, then normalize both real and synthetic bars before applying the frozen threshold. `gapSize` and `newsSpikeIntensity` base values use their auxiliary p50; `gap_shocks` and `news_storm` use the respective auxiliary p90, matching the prior overlay-high convention.

Every dial receives deterministic linearly interpolated daily-knot additive wobble bounded by ±10% of its real W-window p83–p17 width. The trendiness dial's width is `phi(p83) - phi(p17)`. Volatility and drift use their primary bands; gap/news use their auxiliary bands. Gap size is floored at zero and news intensity clamped to [0, 1].

## Real persistence ceiling

For each primary statistic, enumerate every rolling 60-eligible-weekday real stretch (stride one weekday). Its 41 contained, overlapping W-day window values define the stretch statistic as their median. Assign the stretch to LOW/NORMAL/HIGH using the frozen real p33/p67 cuts. For each statistic and tercile, the real ceiling is the arithmetic mean, over stretches assigned to that tercile, of the share of the stretch's 41 W-day windows also assigned to that tercile. Report the number `n` of qualifying stretches and mark `THIN` when `n < 15`.

## Fixed checks (DESIGN and NULL only)

- **C1, coverage:** for each regime and each of the four primary statistics it sets, compare the share of its synthetic W-day windows in the intended tercile with that statistic/tercile's real ceiling. Pass when the absolute difference is at most 0.15. Above the ceiling by more than 0.15 is `TOO CLEAN`; below by more than 0.15 is `TOO NOISY`. If the real ceiling is `THIN`, label C1 `THIN` and do not count it as a pass or failure for degradation. If a regime has no eligible synthetic W-day windows, label C1/C2 `NO_WINDOWS` and count them as failures.
- **C2, calibration:** `(synthetic median - planted target) / (real p83 - p17)` must be in `[-0.25, 0.25]` for each regime/statistic.
- **C3, ordering:** pool each cohort's W-day windows by intended level and statistic; the realized pooled medians must satisfy strict LOW < NORMAL < HIGH. Volatility levels are quiet_range; normal_chop/trend_up/trend_down; whipsaw/expansion_up/expansion_down. Drift levels are trend_down/expansion_down; quiet_range/normal_chop/whipsaw; trend_up/expansion_up. Trend levels are quiet_range/whipsaw; normal_chop; trend_up/trend_down/expansion_up/expansion_down, evaluated separately for VR8 and VR16. A failed ordering marks C3 failed for every regime in the affected level groups.
- A regime is `DEGRADED` if any assessable C1, any C2, or any C3 it sets fails. Report DESIGN and NULL separately. Do not repair degraded outcomes.

## Paths, seeds, labels, and extrapolation

- DESIGN: seeds 5001–5200; LOCKED TEST: 6001–6200; NULL: seeds 7001–7100 **for each regime**, with one 140-weekday single-regime path per seed/regime pair. NULL has no overlays. The regime order for seed lists is the seven IDs in the mapping above.
- DESIGN/LOCKED TEST chains have 3–6 segments, rounded log-uniform lengths from 20 to 80 eligible weekdays, and no repeated adjacent regime. Each transition is a linear dial blend of 48–200 bars, split around the boundary and capped at half of either segment. Independently choose each optional overlay with probability 0.25 per segment; place one contiguous 2–5 weekday episode wholly outside all blend bars when enough safe days exist. These are coverage conventions, not event-frequency estimates.
- Labels stay aligned one-for-one with candles and preserve regime, segment, blend, active dials, overlay, gap/news marks, and generic/specific extrapolation flags. A bar is flagged `EXTRAPOLATION` when any active setting is outside the real W-window p5–p95 reference: volatility against ATR%, drift against drift, trendiness after conversion to theoretical VR8/VR16 against their respective bands, and gap/news against their auxiliary W-window bands. Stage 2b replaces inherited Stage 1 per-bar extrapolation flags for this cohort; Stage 1b code and outputs are unchanged. Report DESIGN and NULL shares, never LOCKED TEST shares.
- Encode paths as deterministic gzip (`level=9`, mtime=0) over canonical JSON. Hash canonical JSON and compressed bytes per seed. LOCKED TEST is generated and hashed only: no decode, parser, path statistics, features, AUC, or path-distribution diagnostics.
- Rebuild verification uses 20 unique, pre-listed DESIGN/NULL paths selected by Fisher–Yates over candidates sorted as DESIGN seeds ascending, then NULL regimes in the listed order and seeds ascending, using `createRandom(20261003, "stage2b-rebuild-audit")`; take the first 20 after the shuffle. Rebuild canonical and compressed bytes from the same config/seed and compare both hashes. Never select LOCKED TEST for this audit.
- Parser round trip uses DESIGN seed 5001 only. Regime separability uses DESIGN only, evaluates every fourth observation bar outside blends beginning at bar index 61, and uses no current/future observations. Mean ATR% uses the 48 completed bars immediately before the observation; the first complete 48-value ATR window follows the 14-bar Wilder warm-up. Drift z-score and VR8/VR16 use the same 48 completed close-to-close returns immediately before it (48 returns require 49 prior closes). The VR estimator requires at least `2q` one-bar returns, so 48 returns suffice for both q=8 and q=16. Orient each single-feature AUC as `max(AUC, 1-AUC)`; a pair is `INSEPARABLE` below 0.60. Report all 21 pairs and the four requested hard pairs.

All fixed checks and cohort rules above are frozen before any Stage 2b synthetic path generation. The spec SHA-256 and the derived real-statistics/config hash are recorded before generation begins.
