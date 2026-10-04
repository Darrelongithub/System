# Synth V2 Stage 2 — planted, labelled regimes

Generated **2026-10-03**. Artifact generation/integrity: **PASS**. Realism is diagnostic, not a gate. Stage 1b G2: **PASS**.

## Provenance and Stage 1b handoff

- Frozen source CSV SHA-256: `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`; calibration-profile SHA-256: `6a5a387c00929697fda3ffdd3c32e866ca0c275a18e175a3969965ee60df2203`.
- Stage 1b commit: `cdaa863130df5ed5ac8da386302532868b24259c`. It was pushed to `origin/arena/01a0f7c9-system`; `git ls-remote` matched the local Stage 1b HEAD before Stage 2 began.
- Stage 1b G2 lag-1 and all other fixed gates passed; see `REPORT.md` and `gate-results.json`. No tolerance or Stage 2 setting was changed in response to LOCKED TEST.
- This is OHLC-only market-statistics work. No detector, strategy, trade, R, P&L, analyzer result, or strategy result was used or evaluated.
- DESIGN seeds **1–200** (200 paths); LOCKED TEST seeds **1001–1200** (200 paths); NULL seeds **2001–2700** (700 paths, 100 per base regime).

## Frozen base regimes and dial settings

The seven IDs/settings are those specified in the task. Volatility and drift use source p10/p50/p90. Trend extremes use the Stage 1b VR-constrained endpoints; the raw trend p10 is retained in the profile but is not used where it violates the registered real VR range. Gap and news dials default to source p50; selected overlays set the corresponding dial to source p90. The per-bar wobble is then applied and every out-of-range or VR-bound-exceeding bar is labelled EXTRAPOLATION.

| Regime | Volatility level | Drift | Trendiness | Gap size | News intensity | Base `EXTRAPOLATION` flags |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| quiet_range | p10 (0.00079830) | p50 (0.00071501) | VR-constrained p10 (-0.06972971) | p50 (0.10949466) | p50 (0.02433628) | none |
| normal_chop | p50 (0.00123003) | p50 (0.00071501) | p50 (-0.04303636) | p50 (0.10949466) | p50 (0.02433628) | none |
| trend_up | p50 (0.00123003) | p90 (0.01287576) | VR-constrained p90 (0.00452192) | p50 (0.10949466) | p50 (0.02433628) | none |
| trend_down | p50 (0.00123003) | p10 (-0.01234400) | VR-constrained p90 (0.00452192) | p50 (0.10949466) | p50 (0.02433628) | none |
| whipsaw | p90 (0.00217564) | p50 (0.00071501) | VR-constrained p10 (-0.06972971) | p50 (0.10949466) | p50 (0.02433628) | none |
| expansion_up | p90 (0.00217564) | p90 (0.01287576) | VR-constrained p90 (0.00452192) | p50 (0.10949466) | p50 (0.02433628) | none |
| expansion_down | p90 (0.00217564) | p10 (-0.01234400) | VR-constrained p90 (0.00452192) | p50 (0.10949466) | p50 (0.02433628) | none |

The news_storm/gap_shocks overlay high settings and their per-segment incidence are described below. Base settings shown above are not extrapolation settings; the DESIGN table below reports the realized per-bar extrapolation-label coverage after wobble/transition blending.

## Planting rules

- Each DESIGN/LOCKED TEST path has 3–6 randomly selected segments. Segment lengths are rounded log-uniform draws of 10–60 trading weekdays. Adjacent segments never repeat the same regime.
- Each boundary gets a 48–200-bar linear dial blend, split across the adjacent segments and capped at half either segment to avoid overlap.
- Within-segment dial wobble uses deterministic interpolated daily knots bounded by ±10% of the empirical p10–p90 dial-band width. This interpretation is recorded in `QUESTIONS.md`.
- The optional overlays are independently selected with a provisional 25% probability per segment. Each selected overlay occupies one contiguous 2–5 weekday episode whose whole bars lie outside adjacent transition-blend windows; a segment without enough safe weekdays receives no episode. This is a coverage convention, not a market event-frequency estimate.
- NULL paths contain one 140-weekday segment for a single regime, no transition, and no overlays.
- Every saved bar has a compact label aligned with its candle: regime id, segment, blend flag, active dial values, overlay flags, specific and generic EXTRAPOLATION flags, gap class, and sampled news-tail flag.

## Real-source bands and per-segment check (a)

The Stage 2 source band for ATR is Wilder ATR(14)/prior close per eligible weekday bar; daily drift is log(last close / first open) for each weekday with at least 24 rows. VR8/VR16 use overlapping five-weekday rolling close-return windows wholly inside the sampled source weekday series so the same horizon fits inside the minimum ten-weekday planted segment. Blend-labelled bars are excluded from synthetic segment checks. Coverage is the share of computed non-blend observations inside the real p10–p90 band; a missing/empty segment sample has zero coverage. A segment attains only if all four metric coverages are at least 90%. The five-weekday VR interpretation is recorded in `QUESTIONS.md`; it does not change Stage 1's registered 120-weekday G6 or trend-endpoint bands.

| Statistic | Source p10 | Source p50 | Source p90 | Samples | Window |
| --- | ---: | ---: | ---: | ---: | --- |
| ATR(14)/close per bar | 0.00115984 | 0.00179888 | 0.00308898 | 79257 | eligible weekday bars |
| Daily close/open log drift | -0.01234400 | 0.00071501 | 0.01287576 | 1727 | one weekday |
| Variance ratio, horizon 8 | 0.65569627 | 0.91157757 | 1.25070824 | 1723 | rolling 5 weekdays |
| Variance ratio, horizon 16 | 0.55335409 | 0.86070053 | 1.29950088 | 1723 | rolling 5 weekdays |

### DESIGN attainment

| Base regime | segments | segments ≥90% | segments attainment | ATR% coverage | Daily drift | VR8 | VR16 | Status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| quiet_range | 121 | 0/121 | 0.0% | 56.9% | 92.0% | 79.9% | 76.3% | DEGRADED |
| normal_chop | 127 | 0/127 | 0.0% | 49.5% | 81.0% | 80.8% | 76.3% | DEGRADED |
| trend_up | 135 | 0/135 | 0.0% | 54.4% | 47.6% | 80.1% | 77.9% | DEGRADED |
| trend_down | 130 | 0/130 | 0.0% | 48.6% | 47.1% | 80.2% | 75.6% | DEGRADED |
| whipsaw | 117 | 0/117 | 0.0% | 28.2% | 65.7% | 78.8% | 76.6% | DEGRADED |
| expansion_up | 134 | 0/134 | 0.0% | 29.3% | 43.6% | 80.8% | 77.4% | DEGRADED |
| expansion_down | 132 | 0/132 | 0.0% | 25.1% | 42.9% | 82.3% | 78.6% | DEGRADED |

**DEGRADED regimes (DESIGN):** quiet_range, normal_chop, trend_up, trend_down, whipsaw, expansion_up, expansion_down.

### NULL attainment

| Base regime | paths | paths ≥90% | paths attainment | ATR% coverage | Daily drift | VR8 | VR16 | Status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| quiet_range | 100 | 0/100 | 0.0% | 55.5% | 92.9% | 79.1% | 76.6% | DEGRADED |
| normal_chop | 100 | 0/100 | 0.0% | 52.0% | 83.2% | 80.2% | 77.4% | DEGRADED |
| trend_up | 100 | 0/100 | 0.0% | 54.2% | 47.8% | 79.8% | 76.0% | DEGRADED |
| trend_down | 100 | 0/100 | 0.0% | 52.8% | 47.8% | 79.3% | 75.7% | DEGRADED |
| whipsaw | 100 | 0/100 | 0.0% | 25.8% | 65.4% | 78.9% | 76.0% | DEGRADED |
| expansion_up | 100 | 0/100 | 0.0% | 23.6% | 43.1% | 78.9% | 75.8% | DEGRADED |
| expansion_down | 100 | 0/100 | 0.0% | 23.8% | 41.7% | 79.7% | 76.0% | DEGRADED |

**DEGRADED regimes (NULL):** quiet_range, normal_chop, trend_up, trend_down, whipsaw, expansion_up, expansion_down.

No Stage 2 check was patched or re-run with changed thresholds after seeing these outcomes.

## DESIGN overlay and EXTRAPOLATION coverage

| Overlay | DESIGN episodes | DESIGN weekdays | Coverage by base regime |
| --- | ---: | ---: | --- |
| news_storm | 230 | 796 | quiet_range: 30; normal_chop: 29; trend_up: 30; trend_down: 40; whipsaw: 32; expansion_up: 41; expansion_down: 28 |
| gap_shocks | 244 | 852 | quiet_range: 32; normal_chop: 29; trend_up: 30; trend_down: 40; whipsaw: 30; expansion_up: 44; expansion_down: 39 |

Selected overlay values are newsSpikeIntensity p90 for news_storm and gapSize p90 for gap_shocks. Values outside observed dial bands remain explicitly flagged per bar.

| Base regime | DESIGN bars | Bars flagged `EXTRAPOLATION` | Flagged share | Per-dial counts |
| --- | ---: | ---: | ---: | --- |
| quiet_range | 145215 | 103576 | 71.3% | gapSize: 2467, newsSpikeIntensity: 2301, trendinessVarianceRatio: 69512, volatilityLevel: 67941 |
| normal_chop | 171419 | 4932 | 2.9% | gapSize: 2715, newsSpikeIntensity: 2396 |
| trend_up | 166136 | 120231 | 72.4% | drift: 79199, gapSize: 1979, newsSpikeIntensity: 2446, trendiness: 78992, trendinessVarianceRatio: 78992 |
| trend_down | 160438 | 116608 | 72.7% | drift: 75327, gapSize: 3485, newsSpikeIntensity: 3212, trendiness: 76518, trendinessVarianceRatio: 76518 |
| whipsaw | 144613 | 103526 | 71.6% | gapSize: 2628, newsSpikeIntensity: 2381, trendinessVarianceRatio: 65893, volatilityLevel: 68781 |
| expansion_up | 182667 | 156455 | 85.7% | drift: 88115, gapSize: 3112, newsSpikeIntensity: 3616, trendiness: 90146, trendinessVarianceRatio: 90146, volatilityLevel: 87383 |
| expansion_down | 164707 | 139410 | 84.6% | drift: 77548, gapSize: 3775, newsSpikeIntensity: 2374, trendiness: 80272, trendinessVarianceRatio: 80272, volatilityLevel: 76885 |

## DESIGN-only separability check (b)

Four causal features are sampled every four bars from the past only: mean ATR(14)/close over the previous 48 completed bars, previous-48-return drift z-score, and rolling 240-return VR8/VR16. Blend-labelled and warm-up samples are omitted. The table shows each single-feature AUC oriented as max(AUC, 1−AUC), plus the best feature. Pair status is exactly the specified best-AUC <0.60 threshold. LOCKED TEST is not passed to this code.

| Regime pair | ATR% 48 | Drift z 48 | VR8 240 | VR16 240 | Best feature | Best AUC | Samples | Status |
| --- | ---: | ---: | ---: | ---: | --- | ---: | --- | --- |
| quiet_range vs normal_chop | 0.6760 | 0.5258 | 0.5406 | 0.5192 | rolling48AtrPercent | 0.6760 | 31777 / 38129 | SEPARABLE |
| quiet_range vs trend_up | 0.7016 | 0.8286 | 0.6252 | 0.5985 | rolling48DriftZ | 0.8286 | 31777 / 36688 | SEPARABLE |
| quiet_range vs trend_down | 0.7215 | 0.8593 | 0.6326 | 0.5990 | rolling48DriftZ | 0.8593 | 31777 / 35004 | SEPARABLE |
| quiet_range vs whipsaw | 0.8447 | 0.5208 | 0.5162 | 0.5196 | rolling48AtrPercent | 0.8447 | 31777 / 32084 | SEPARABLE |
| quiet_range vs expansion_up | 0.8542 | 0.7251 | 0.6175 | 0.5853 | rolling48AtrPercent | 0.8542 | 31777 / 40673 | SEPARABLE |
| quiet_range vs expansion_down | 0.8613 | 0.7821 | 0.6132 | 0.5856 | rolling48AtrPercent | 0.8613 | 31777 / 36237 | SEPARABLE |
| normal_chop vs trend_up | 0.5197 | 0.8407 | 0.5857 | 0.5793 | rolling48DriftZ | 0.8407 | 38129 / 36688 | SEPARABLE |
| normal_chop vs trend_down | 0.5455 | 0.8436 | 0.5930 | 0.5799 | rolling48DriftZ | 0.8436 | 38129 / 35004 | SEPARABLE |
| normal_chop vs whipsaw | 0.7189 | 0.5056 | 0.5571 | 0.5389 | rolling48AtrPercent | 0.7189 | 38129 / 32084 | SEPARABLE |
| normal_chop vs expansion_up | 0.7316 | 0.7429 | 0.5778 | 0.5660 | rolling48DriftZ | 0.7429 | 38129 / 40673 | SEPARABLE |
| normal_chop vs expansion_down | 0.7418 | 0.7617 | 0.5733 | 0.5664 | rolling48DriftZ | 0.7617 | 38129 / 36237 | SEPARABLE |
| trend_up vs trend_down | 0.5273 | 0.9677 | 0.5071 | 0.5006 | rolling48DriftZ | 0.9677 | 36688 / 35004 | SEPARABLE |
| trend_up vs whipsaw | 0.7099 | 0.8418 | 0.6417 | 0.6185 | rolling48DriftZ | 0.8418 | 36688 / 32084 | SEPARABLE |
| trend_up vs expansion_up | 0.7228 | 0.6399 | 0.5082 | 0.5140 | rolling48AtrPercent | 0.7228 | 36688 / 40673 | SEPARABLE |
| trend_up vs expansion_down | 0.7334 | 0.9446 | 0.5127 | 0.5131 | rolling48DriftZ | 0.9446 | 36688 / 36237 | SEPARABLE |
| trend_down vs whipsaw | 0.6865 | 0.8510 | 0.6490 | 0.6189 | rolling48DriftZ | 0.8510 | 35004 / 32084 | SEPARABLE |
| trend_down vs expansion_up | 0.6999 | 0.9413 | 0.5154 | 0.5146 | rolling48DriftZ | 0.9413 | 35004 / 40673 | SEPARABLE |
| trend_down vs expansion_down | 0.7108 | 0.6198 | 0.5199 | 0.5138 | rolling48AtrPercent | 0.7108 | 35004 / 36237 | SEPARABLE |
| whipsaw vs expansion_up | 0.5146 | 0.7426 | 0.6341 | 0.6054 | rolling48DriftZ | 0.7426 | 32084 / 40673 | SEPARABLE |
| whipsaw vs expansion_down | 0.5281 | 0.7700 | 0.6297 | 0.6057 | rolling48DriftZ | 0.7700 | 32084 / 36237 | SEPARABLE |
| expansion_up vs expansion_down | 0.5137 | 0.9024 | 0.5045 | 0.5008 | rolling48DriftZ | 0.9024 | 40673 / 36237 | SEPARABLE |

**INSEPARABLE pairs (best AUC <0.60):** none.

## Integrity checks

- Determinism: **PASS**; each DESIGN, LOCKED TEST, and NULL seed was generated twice with identical canonical encoded JSON SHA-256. Set counts are 200 DESIGN, 200 LOCKED TEST, and 700 NULL.
- No lookahead: **PASS**. Changing labels while holding the generated per-bar dials fixed left OHLC unchanged; mutating candles from bar 400 onward did not change the four-feature causal vector at that bar. AUC features use only bars completed before the classified bar.
- Engine parser round-trip: **PASS** on DESIGN seed 1; 2377 rows parsed with exact timestamp/OHLC equality.
- Stage 2 repairs after checks: **0**. Failures remain DEGRADED/INSEPARABLE; no detector or strategy work was done.

## LOCKED TEST handling

> **LOCKED — DO NOT DESIGN, TUNE, OR LOOK AT RESULTS AGAINST THIS SET UNTIL A DETECTOR IS FROZEN.**

Seeds 1001–1200 were generated from the frozen regime rules, deterministically reproduced, and SHA-256 hashed. No realism, feature, AUC, detector, or path-distribution diagnostic was computed or reviewed for LOCKED TEST. The only retained facts are seed range/count, compressed byte count, and hashes. Per-seed canonical and compressed hashes are in `LOCKED-TEST-SHA256SUMS.txt`; set digest: `72581f2f70d428b2ebf79b2cb9570206d433d3b081cfe5ce6ec34028ad438e15`.

## Artifact inventory and checksums

- DESIGN: 200 paths, 1135195 bars, 10060942 compressed bytes; set digest `7dd053544412e5e2b267c390a3f2e9d0c0045c4c6a9dd1030f642f3fbabf5249`.
- LOCKED TEST: 200 paths, 10460203 compressed bytes; set digest `72581f2f70d428b2ebf79b2cb9570206d433d3b081cfe5ce6ec34028ad438e15`. No test-set metrics are reported.
- NULL: 700 paths, 4497215 bars, 39163416 compressed bytes; set digest `e5ee967feaf969e2700857e54c9453f202d2083480216ce35954b8e25f9b608b`.
- Each set's checksum file stores per-seed canonical JSON and compressed-file SHA-256 values. Top-level output/source hashes are in `STAGE2-SHA256SUMS.txt`.

| Artifact | SHA-256 |
| --- | --- |
| src/lib/synth-v2/STAGE2-CHECKS.json | b5b3a0c613c4550962b99b3717914b4213a38169eb8b58c5477e040594029cc8 |
| src/lib/synth-v2/DESIGN-seed-1-engine.csv | 07786620ea080ba7fb078a905cdf8179f3189c61640189fb1b4e18384cbd56b2 |
| src/lib/synth-v2/DESIGN-SHA256SUMS.txt | 04f674c1e960684bbe59b9b7185587e580aed741b09d832d719f0efb62daf6f7 |
| src/lib/synth-v2/LOCKED-TEST-SHA256SUMS.txt | 316113d2f9a782bad56e9348bde2811fadd9941c65c8c4d8e385a389c1a6e2eb |
| src/lib/synth-v2/NULL-SHA256SUMS.txt | 2c561d10102eda64b2bef163dfd51ffe26a3f836bebfd459731f775a056cd1fd |
| src/lib/synth-v2/stage2-data/FORMAT.md | 8de5c3bd4e4dd95d1d5d962fd901b47ced5e7113009fce0379a9998a5de3237f |
| src/lib/synth-v2/regimes.ts | fa6ec133fa6a50944df1f511e52a7e95c02597236dc430ff5293efe39fa477dd |
| src/lib/synth-v2/stage2-validation.ts | d2f871289e2ec029382695e5873ccae9e66c01efa4f0b8bd753db46fbe6c920b |
| src/lib/synth-v2/stage2-artifacts.ts | f62e73a7cd4edc0bc935a79670fcab1528da641b91002abfa8f0a55af6d84586 |
| src/lib/synth-v2/generate.ts | 1a0941c56f5c1b618092100298748f463b3e7d96802ca6d70dd31c12fda52917 |
| src/lib/synth-v2/types.ts | 98239ee1b11be2535fd772c9584c21c701d79ba0b8f3b625882930b6aea52d41 |
| src/lib/synth-v2/index.ts | 402aaf397c8fc41f97ed680a783bf2c890ad32859d36b0ab1523984d7a064a02 |
| src/lib/synth-v2/README.md | 41501f25df29eaf25d4756ee65c21a7cf374d58d5e6b57b7a61f281a3350a0bb |
| src/lib/synth-v2/QUESTIONS.md | 404cff8fa4607619766b4b063c1793240c73049cd4779da56871dbe98ea316e5 |
| src/lib/synth-v2/SHA256SUMS.txt | 010ffd430e35fa80b33da9d8efef0782f1807ce40bba948bc02cb829a21a7c20 |
| src/lib/synth-v2/random.ts | d9b8415703b0a293841955e2bdbcf9de6c1260191794218e187055b65ab5534d |
| src/lib/synth-v2/time.ts | b1131f1f3156d1c57457cd90897888f8158d625cc2fae5227be063e5a1980b05 |
| src/lib/synth-v2/csv.ts | 0ac4507a2438fa04391248e9ae66b91366b601d662a954f196392ee495bf5aa8 |
| src/lib/synth-v2/metrics.ts | 473a62ef05826a582e4abbd27c4557c02f8bb0e754cf275ad18e8979e1e1f6fa |
| src/lib/synth-v2/validation.ts | ae988460658a0619e1c70c9fab5493b1a7547ad06af9d3aa05ef2943add488d5 |
| src/lib/synth-v2/profile.json | 6a5a387c00929697fda3ffdd3c32e866ca0c275a18e175a3969965ee60df2203 |
| src/lib/synth-v2/gate-results.json | af6084881afba94bc1f916ddc2c87e1fb7d9d51c3b789457ac4ffe8a6ed0470a |
| scripts/synth-v2-stage2.mjs | a53d4387942b95ce9c6de0d2d90923796d080a00f9aad11b79071bd169e6aa3d |
| tests/synth-v2.test.mjs | d1cc8807cef509698bc0437858ba71657bc33a8edc859d5f2e727efd50e36d02 |

## Assumptions and unverified items

- The Stage 0 clock audit supports fixed EAT, but the source's UTC section marker conflicts; evidence and the interim no-shift decision are in `REPORT.md` and `QUESTIONS.md`.
- Overlay event frequency/duration and additive wobble are disclosed conventions, not calibrated estimates. Stage 2 realism attainment is descriptive only.
- Stage 2 VR bands use five-weekday windows for segment-contained comparisons; this choice is explicit and separate from the registered Stage 1 gate.
- The source uses runtime IANA/Intl timezone data; tzdata version is not pinned.

## Out-of-scope working-tree edits at task entry

The following out-of-scope paths were present in `git status --short` at task entry and were not edited or staged for this task. Local HEAD/index was aligned to the already-pushed Stage 1b branch commit without overwriting their worktree contents; content under the retired `src/lib/synth/` tree was left untouched. The in-scope untracked `src/lib/synth-v2/QUESTIONS.md` at task entry was a blocker note for the previously missing prompt; it was replaced after the full task specification was supplied.

`M` means modified, `??` means untracked at task entry:

```text
 M .env.example
 M README.md
 M docs/MT5-AUTOMATION.md
 M src/components/MT5AutomationPanel.tsx
 M src/lib/market-data.ts
 M src/lib/mt5/bridge-auth.ts
 M src/lib/mt5/engine.ts
 M src/lib/mt5/mql5-ea.ts
 M src/lib/mt5/mt5-store.ts
 M src/lib/mt5/news-filter.ts
 M src/lib/mt5/server-daemon.ts
 M src/lib/mt5/standalone-ea.ts
 M src/lib/mt5/types.ts
 M src/lib/synth/ASSUMPTIONS.md
 M src/lib/synth/INTEGRATION.md
 M src/lib/synth/README.md
 M src/lib/synth/REPORT.md
 M src/lib/synth/SHA256SUMS.txt
 M src/lib/synth/calibrate.ts
 M src/lib/synth/generate.ts
 M src/lib/synth/math.ts
 M src/lib/synth/profile-default.ts
 M src/lib/synth/profile.json
 M src/lib/synth/types.ts
 M src/lib/synth/validation-report.json
 M src/pages/MapGenerator.tsx
 M src/routes/__root.tsx
 M src/routes/api/market-data.health.ts
 M src/routes/api/market-data.ts
 M src/routes/api/mt5.bridge.ts
 M src/routes/api/mt5.ea.ts
 M src/routes/api/mt5.ts
 M tests/mt5-automation.test.mjs
 M tests/mt5-bridge-auth.test.mjs
 M tests/run.mjs
 M tests/server-env.test.mjs
 M tests/synth.test.mjs
?? AUDIT-ARENA-2026-10-01.md
?? src/components/ServerAccessPanel.tsx
?? src/lib/app-access-client.ts
?? src/lib/mt5/validation.ts
?? src/lib/server-access.ts
?? src/lib/synth/QUESTIONS.md
?? src/lib/synth/backups/phase0-synth-no-dayblock-catalog.tar.gz
?? src/lib/synth/profile-summary.ts
?? tests/mt5-routes.test.mjs
?? tests/mt5-safety.test.mjs
```
