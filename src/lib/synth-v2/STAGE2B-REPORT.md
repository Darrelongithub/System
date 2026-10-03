# Synth V2 Stage 2b — preregistered W=20 regime study (INCOMPLETE)

**Status: INCOMPLETE.** DESIGN 5001–5200 and all 700 NULL paths were generated; the LOCKED TEST cohort stopped during generation at seed 6142 after seeds 6001–6141. The failure arose from the unchanged Stage 1b OHLC generator. No LOCKED TEST artifact was decompressed or analyzed. Do not treat this as a completed holdout or a completed preregistered study.

Initial report compiled **2026-10-03**. The same fixed inputs, runtime, and seeds were replayed on **2026-10-04** after revalidating all frozen hashes; no criterion, setting, executable, profile, or seed was changed. Calibration, protocol, settings, seeds, and executable code hashes were frozen before any cohort paths. Results here are descriptive market-statistic checks only; no detector, strategy, trade, R, P&L, or analyzer outcome was used.

## Part A — report-only audit of superseded Stage 2

The previous Stage 2 cohort and its checks are **SUPERSEDED**; its old LOCKED TEST is **ABANDONED** and was not opened, decompressed, or analyzed. This section uses only the preserved old report/settings and the reported per-regime extrapolation shares.

### Old per-regime edge dials vs. observed extrapolation

The old dial labels were evaluated against their source p10–p90 bands, with the trendiness dial additionally bounded by Stage 1b's VR-constrained endpoints. For an idealized regime with k independent dials planted exactly on a p10/p90 edge, additive symmetric wobble crosses the edge with probability 0.5 per dial, giving union share 1 − 0.5^k. The observed shares are the old DESIGN shares; this is a comparison, not a reanalysis of old paths.

| Old regime | Edge-positioned dials | k | 1 − 0.5^k | Observed EXTRAPOLATION | Observed − ideal |
| --- | --- | --- | --- | --- | --- |
| quiet_range | vol p10=0.00079830; trend VR-bound p10 phi=-0.06972971 | 2 | 75.0% | 71.3% | -3.7 pp |
| normal_chop | none; vol/drift/trend at p50 | 0 | 0.0% | 2.9% | +2.9 pp |
| trend_up | drift p90=0.01287576; trend p90 phi=0.00452192 | 2 | 75.0% | 72.4% | -2.6 pp |
| trend_down | drift p10=-0.01234400; trend p90 phi=0.00452192 | 2 | 75.0% | 72.7% | -2.3 pp |
| whipsaw | vol p90=0.00217564; trend VR-bound p10 phi=-0.06972971 | 2 | 75.0% | 71.6% | -3.4 pp |
| expansion_up | vol p90=0.00217564; drift p90=0.01287576; trend p90 phi=0.00452192 | 3 | 87.5% | 85.7% | -1.8 pp |
| expansion_down | vol p90=0.00217564; drift p10=-0.01234400; trend p90 phi=0.00452192 | 3 | 87.5% | 84.6% | -2.9 pp |

### Old per-regime dial settings, wobble, and EXTRAPOLATION rule

| Old regime | VolatilityLevel | Drift | Trendiness phi | GapSize | News intensity |
| --- | --- | --- | --- | --- | --- |
| quiet_range | 0.00079830 | 0.00071501 | -0.06972971 | 0.10949466 | 0.02433628 |
| normal_chop | 0.00123003 | 0.00071501 | -0.04303636 | 0.10949466 | 0.02433628 |
| trend_up | 0.00123003 | 0.01287576 | 0.00452192 | 0.10949466 | 0.02433628 |
| trend_down | 0.00123003 | -0.01234400 | 0.00452192 | 0.10949466 | 0.02433628 |
| whipsaw | 0.00217564 | 0.00071501 | -0.06972971 | 0.10949466 | 0.02433628 |
| expansion_up | 0.00217564 | 0.01287576 | 0.00452192 | 0.10949466 | 0.02433628 |
| expansion_down | 0.00217564 | -0.01234400 | 0.00452192 | 0.10949466 | 0.02433628 |

The old source p10/p50/p90 values were volatility 0.00079830/0.00123003/0.00217564; drift −0.01234400/0.00071501/0.01287576; raw trendiness −0.09405640/−0.04303636/0.00452192; gap 0.01658094/0.10949466/0.64902937; news 0.01665558/0.02433628/0.03358876. quiet_range and whipsaw used the VR-constrained trend p10 phi −0.06972971 instead of the raw p10. Gap/news used p50 except when their overlay selected p90.

Old additive daily-knot wobble was ±10% of each source p10–p90 width: volatility ±0.000137734; drift ±0.002521976; trendiness ±0.009857832; gap ±0.063244843; news ±0.001693318. The old per-bar EXTRAPOLATION label was raised when any active dial crossed its profile p10–p90 range, or when trendiness crossed the Stage 1b VR-constrained endpoint bounds.

The owner-diagnosis reference is not separately recorded in the available repository artifacts. Interpreting it as “p10/p90 edge placement plus ±10% wobble explains the high extrapolation shares,” the figures support it as a strong approximate explanation: k=2 regimes are 71.3–72.7% vs 75.0% ideal, and k=3 regimes are 84.6–85.7% vs 87.5% ideal. Finite paths, shared/interpolated wobble, boundary blending, and dependence mean the ideal independence formula is not exact. normal_chop has k=0 and an ideal 0%, but its 2.9% observed share is consistent with p90 overlay settings and their wobble. This is not proof that edge placement is the only cause.

### Old real/synthetic statistic windows

| Statistic / dial constraint | Old real p10/p50/p90 | Real window used | Synthetic window used | Assessment |
| --- | --- | --- | --- | --- |
| ATR% | p10 0.00115984; p50 0.00179888; p90 0.00308898 | per eligible weekday bar (79,257 values) | per non-blend bar within segments | Matched directly |
| Daily drift | p10 −0.01234400; p50 0.00071501; p90 0.01287576 | one weekday, log(last close / first open) (1,727 values) | one weekday, same definition | Matched directly |
| VR8 | p10 0.65569627; p50 0.91157757; p90 1.25070824 | rolling 5-weekday returns (1,723 windows) | rolling 5-weekday windows wholly within non-blend segments | Matched directly |
| VR16 | p10 0.55335409; p50 0.86070053; p90 1.29950088 | rolling 5-weekday returns (1,723 windows) | rolling 5-weekday windows wholly within non-blend segments | Matched directly |
| Trendiness dial constraint | VR8 0.919681–1.033335; VR16 0.899694–1.052419 | Stage 1b rolling 120-weekday VR p10–p90 bounds | Stage 2 compared 5-weekday VR windows | Separate horizon mismatch |

The direct old coverage comparisons matched their real and synthetic statistic horizons: ATR per eligible weekday bar, one-weekday drift, and five-weekday VR8/VR16. A separate horizon mismatch remained in the trendiness *setting*: its endpoint constraint inherited Stage 1b's 120-weekday VR bands while Stage 2's segment check used five-weekday VR windows. That is a calibration-horizon inconsistency, but it does not explain the observed EXTRAPOLATION label share as directly as the planted p10/p90 edges. No previous Stage 2 failure was patched or carried into Stage 2b.

## Stage 2b provenance and frozen inputs

- Required source: `XAUUSD_30min_2020-01-24_to_2026-10-01.csv`; SHA-256 `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3` (matched the required checksum).
- Timestamp interpretation: fixed EAT wall-clock (UTC+03:00), no timestamp shifts. The source's `(UTC)` marker remains a disclosed metadata conflict.
- Spec SHA-256: `18537cb7992b9e3b0d86e42beb7fcaaa92e4cedeb8106a5660e5c41db508c574` (`SPEC-2b.md` / `SPEC-2b.sha256`).
- Real W=20 calibration SHA-256: `696cbca363abb312b1411d45a573c0e49317aa40a572acbe9da2e7ae7ee20356` (`STAGE2B-REAL-BANDS.json`).
- Config SHA-256: `88bfcfeb364820bbb4cb6f6139b1f2b2643575ddecce74ff85b1412b68564911` (`STAGE2B-CONFIG.json`).
- Seed-list SHA-256: `a430038890afd1a1aa81e9cd684c1496548a31ee3ff6d203a8d9c1ab23449dd4` (`STAGE2B-SEEDS.json`).
- Stage 1b profile SHA-256: `6a5a387c00929697fda3ffdd3c32e866ca0c275a18e175a3969965ee60df2203`; Stage 1b source profile and code were consumed read-only.
- Runtime frozen: Node `v22.22.3`, ICU `78.2`, tzdata `2026a`, TZ environment `None`.
- Preregistration records `generatedSyntheticPaths: 0` and `recordedBeforeSyntheticGeneration: true`. The frozen execution-code and input hashes are listed below and indexed in the SHA inventory.

### Frozen code hashes

- `package.json`: `d9a2e925fac6a5e07a8d5b80281c802010f8d1736afeacf39ec5cf809e7757cc`
- `scripts/synth-v2-stage2b-calibrate.mjs`: `5c18ad8206efc32a5be2e1d166787974807b796b892338eb733a8d2e6d3579f0`
- `scripts/synth-v2-stage2b.mjs`: `2977c06df7945788b4d48bda3670a3ee0de241bb81d14d1dac66daa79ec90f50`
- `src/lib/analyzer/parse.ts`: `4fbe1424da4094c7e1aa0295a591fc3a9da0954639eb46ea2cdcf0d962c80dd8`
- `src/lib/analyzer/types.ts`: `2d2a808c5c8b362a40b5a94fbe74a7ec1d607c07f3520891e05a6cfc996aeebd`
- `src/lib/synth-v2/csv.ts`: `0ac4507a2438fa04391248e9ae66b91366b601d662a954f196392ee495bf5aa8`
- `src/lib/synth-v2/generate.ts`: `1a0941c56f5c1b618092100298748f463b3e7d96802ca6d70dd31c12fda52917`
- `src/lib/synth-v2/random.ts`: `d9b8415703b0a293841955e2bdbcf9de6c1260191794218e187055b65ab5534d`
- `src/lib/synth-v2/regimes.ts`: `fa6ec133fa6a50944df1f511e52a7e95c02597236dc430ff5293efe39fa477dd`
- `src/lib/synth-v2/stage2-artifacts.ts`: `f62e73a7cd4edc0bc935a79670fcab1528da641b91002abfa8f0a55af6d84586`
- `src/lib/synth-v2/stage2b-math.ts`: `e9eb398d1b2e749765339bae87b925a280192c5b9b0fe6a84412c0f6827f2d4b`
- `src/lib/synth-v2/stage2b-provenance.ts`: `76ce6c8fc3d8c6dc9f2516c7ff7dee736fa8343dc94516230cbf679f4cc563fd`
- `src/lib/synth-v2/stage2b-regimes.ts`: `bee5d16a9237a88587b96d0a7a4192c38be1ce6c1730e21ed6ad3713cb98f673`
- `src/lib/synth-v2/stage2b-types.ts`: `4b1a568280433add4094815b46f4f7e06c640d72789e4fe0a71ae7169c5219e4`
- `src/lib/synth-v2/stage2b-validation.ts`: `2848305b8201b0c6de7e9e7de341367def828a0281b36514e37f403a77d0af44`
- `src/lib/synth-v2/time.ts`: `b1131f1f3156d1c57457cd90897888f8158d625cc2fae5227be063e5a1980b05`
- `src/lib/synth-v2/types.ts`: `98239ee1b11be2535fd772c9584c21c701d79ba0b8f3b625882930b6aea52d41`
- `tests/hooks.mjs`: `fc9a5536bdab299a1f55e44e91101c153234ead8495d39a7ba82a32964518a2f`
- `tests/register.mjs`: `286b813c5cf21c66a921566a518b8e9ee5ab58edd84bd8e16faea3c2bfa80a17`

### Frozen input hashes

- `src/lib/synth-v2/SPEC-2b.md`: `18537cb7992b9e3b0d86e42beb7fcaaa92e4cedeb8106a5660e5c41db508c574`
- `src/lib/synth-v2/SPEC-2b.sha256`: `ec441491312a15a2eaedc6443f97bad0dd110c1cd85a95894fa7422f895c041e`
- `src/lib/synth-v2/stage2b-data/.gitignore`: `1ac283bda20bbd62be9918da0265293bc3723a654d112e47817a1558be115be8`
- `src/lib/synth-v2/STAGE2B-SEEDS.json`: `a430038890afd1a1aa81e9cd684c1496548a31ee3ff6d203a8d9c1ab23449dd4`
- `src/lib/synth-v2/profile.json`: `6a5a387c00929697fda3ffdd3c32e866ca0c275a18e175a3969965ee60df2203`
- `XAUUSD_30min_2020-01-24_to_2026-10-01.csv`: `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`

## Stage 2b real W=20 calibration

Eligible source weekdays are EAT Monday–Friday with at least 24 bars; statistic windows slide one weekday at a time. Calibration contains 1,708 W=20 windows from 1,668 rolling 60-weekday stretches. All quantiles use the frozen linear `(n−1)p` rule. Regime level cutoffs are p17/p50/p83; the classification quantiles are p33=0.33 and p67=0.67.

| Statistic | W=20 samples | p5 | p17 | p33 | p50 | p67 | p83 | p90 | p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ATR% | 1708 | 0.129143% | 0.151657% | 0.163623% | 0.181578% | 0.204365% | 0.259777% | 0.293129% | 0.348354% |
| Drift | 1708 | -0.332585% | -0.164817% | -0.060513% | 0.032894% | 0.135719% | 0.268439% | 0.335510% | 0.415037% |
| VR8 | 1708 | 0.771032 | 0.837409 | 0.903591 | 0.963370 | 1.023597 | 1.087556 | 1.122709 | 1.200191 |
| VR16 | 1708 | 0.701310 | 0.789371 | 0.878947 | 0.948696 | 1.022883 | 1.109177 | 1.177548 | 1.258209 |
| gapSize | 1708 | 0.051476 | 0.071337 | 0.090636 | 0.119129 | 0.154398 | 0.195393 | 0.362498 | 0.633121 |
| newsSpikeIntensity | 1708 | 0.015348 | 0.018478 | 0.021739 | 0.024336 | 0.027322 | 0.030905 | 0.033589 | 0.036688 |

The single trendiness dial is fit to each real p17/p50/p83 VR8/VR16 target pair by minimizing the two width-normalized theoretical AR(1) errors on the preregistered phi grid. Both empirical VR horizons use the same estimator for real and synthetic windows; its minimum is 2q returns.

### Trendiness calibration

| Level | Fitted phi | Target VR8 / VR16 | Theoretical achieved VR8 / VR16 | Normalized squared error |
| --- | --- | --- | --- | --- |
| LOW | -0.110800 | 0.837409 / 0.789371 | 0.822954 / 0.811729 | 0.008227 |
| NORMAL | -0.024100 | 0.963370 / 0.948696 | 0.958679 / 0.955807 | 0.000846 |
| HIGH | 0.051000 | 1.087556 / 1.109177 | 1.093324 / 1.100403 | 0.001284 |

### W=20 real persistence ceilings and THIN flags

Each 60-weekday stretch is classified by the median of its 41 contained overlapping W=20 windows. For each tercile, the ceiling is the mean share of contained windows in that tercile. THIN is n<15.

| Statistic | Tercile | 60-weekday stretches (n) | Real ceiling | Flag |
| --- | --- | --- | --- | --- |
| ATR% | LOW | 538 | 82.7% | OK |
| ATR% | NORMAL | 624 | 66.2% | OK |
| ATR% | HIGH | 506 | 83.4% | OK |
| Drift | LOW | 440 | 66.1% | OK |
| Drift | NORMAL | 732 | 46.0% | OK |
| Drift | HIGH | 496 | 68.4% | OK |
| VR8 | LOW | 401 | 66.5% | OK |
| VR8 | NORMAL | 903 | 42.1% | OK |
| VR8 | HIGH | 364 | 68.0% | OK |
| VR16 | LOW | 428 | 62.4% | OK |
| VR16 | NORMAL | 843 | 40.6% | OK |
| VR16 | HIGH | 397 | 66.2% | OK |

### Frozen seven-regime settings and wobble

The first three dial levels are empirical W=20 p17/p50/p83. Gap/news bases use p50, overlay highs use p90. Wobble is additive ±10% of each p83−p17 width at deterministic daily knots (phi width is the difference between fitted HIGH and LOW phi).

| Regime | Volatility level (ATR p17/p50/p83) | Drift (p17/p50/p83) | Trend control (phi; target VR8/VR16) | Gap p50 / overlay p90 | News p50 / overlay p90 | Additive wobble amplitudes (vol / drift / phi / gap / news) |
| --- | --- | --- | --- | --- | --- | --- |
| quiet_range | LOW (0.1517%) | NORMAL (0.0329%) | LOW (phi -0.110800; targets 0.8374/0.7894) | 0.119129 / 0.362498 | 0.024336 / 0.033589 | vol ±0.00010812; drift ±0.00043326; phi ±0.01618000; gap ±0.01240562; news ±0.00124268 |
| normal_chop | NORMAL (0.1816%) | NORMAL (0.0329%) | NORMAL (phi -0.024100; targets 0.9634/0.9487) | 0.119129 / 0.362498 | 0.024336 / 0.033589 | vol ±0.00010812; drift ±0.00043326; phi ±0.01618000; gap ±0.01240562; news ±0.00124268 |
| trend_up | NORMAL (0.1816%) | HIGH (0.2684%) | HIGH (phi 0.051000; targets 1.0876/1.1092) | 0.119129 / 0.362498 | 0.024336 / 0.033589 | vol ±0.00010812; drift ±0.00043326; phi ±0.01618000; gap ±0.01240562; news ±0.00124268 |
| trend_down | NORMAL (0.1816%) | LOW (-0.1648%) | HIGH (phi 0.051000; targets 1.0876/1.1092) | 0.119129 / 0.362498 | 0.024336 / 0.033589 | vol ±0.00010812; drift ±0.00043326; phi ±0.01618000; gap ±0.01240562; news ±0.00124268 |
| whipsaw | HIGH (0.2598%) | NORMAL (0.0329%) | LOW (phi -0.110800; targets 0.8374/0.7894) | 0.119129 / 0.362498 | 0.024336 / 0.033589 | vol ±0.00010812; drift ±0.00043326; phi ±0.01618000; gap ±0.01240562; news ±0.00124268 |
| expansion_up | HIGH (0.2598%) | HIGH (0.2684%) | HIGH (phi 0.051000; targets 1.0876/1.1092) | 0.119129 / 0.362498 | 0.024336 / 0.033589 | vol ±0.00010812; drift ±0.00043326; phi ±0.01618000; gap ±0.01240562; news ±0.00124268 |
| expansion_down | HIGH (0.2598%) | LOW (-0.1648%) | HIGH (phi 0.051000; targets 1.0876/1.1092) | 0.119129 / 0.362498 | 0.024336 / 0.033589 | vol ±0.00010812; drift ±0.00043326; phi ±0.01618000; gap ±0.01240562; news ±0.00124268 |

Overlays were independently selected with probability 0.25 per segment; each selected overlay is one contiguous 2–5 weekday episode wholly outside transition blends. These are coverage conventions, not market-frequency estimates. Each NULL path contains one regime, exactly 140 weekdays, and no overlays. DESIGN paths use 3–6 non-repeating 20–80-weekday segments with 48–200-bar blends.

## Cohort completion and fixed checks

- **DESIGN:** seeds 5001–5200, 200 / 200 paths replayed under the unchanged frozen inputs, 1,797,555 bars, 15,831,378 compressed bytes. The interrupted first bulk invocation had generated/analyzed these paths in memory but aborted before writing its report or inventory. They were deterministically replayed for this report; their first-run in-memory inventory rows were lost.
- **LOCKED TEST:** seeds 6001–6141, 141 / 200 paths. These paths were regenerated solely to compute canonical/compressed hashes and verify each compressed file's bytes against the already-written file. **No LOCKED TEST path was decompressed, parsed, statistically analyzed, or used in an AUC/cohort diagnostic.**
- **LOCKED TEST generation failure:** the next sequential path, seed 6142, failed inside unchanged `src/lib/synth-v2/generate.ts` during `generatePathWithSchedule`: `bar-shape construction produced invalid OHLC at 2026-08-24 15:00:00`. Seeds 6142–6200 were not generated; the failed path was not written. No repair, replacement seed, setting adjustment, or Stage 1b change was made.
- **NULL:** seeds 7001–7100 for each of the seven regimes, 700 / 700 paths, 4,495,624 bars, 40,073,330 compressed bytes. All completed under the frozen code/settings after the LOCKED TEST stop.
- The partial local inventory therefore has 1,041 path rows. Path data under `stage2b-data/` is ignored and not committed.

**Fixed check rules:** C1 compares synthetic intended-tercile share to the corresponding real 60-weekday ceiling share; absolute tolerance 0.15. C2 is normalized median error `(synthetic median − planted setting)/(real p83−p17)` with fixed tolerance ±0.25. C3 is strict pooled LOW < NORMAL < HIGH realized-median ordering by statistic. DEGRADED is reported without repair. DESIGN and NULL are separate.

### DESIGN regime/statistic checks

Fixed criteria: C1 is the absolute difference from the W=20 real-ceiling share, tolerance 0.15; `TOO CLEAN`/`TOO NOISY` are directional C1 failures. C2 is (realized median − planted value)/(real p83−p17), tolerance ±0.25. C3 is strict pooled LOW < NORMAL < HIGH median order. `THIN` would mark real ceiling n<15 and is not pass/fail; there are no THIN cells below. DEGRADED is reported without repair.

| Regime | Statistic | Intended | Planted | Realized median | Synthetic intended-tercile share | Real ceiling | C1 difference | C2 normalized error | C1 | C2 | C3 | W=20 windows | Regime status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| quiet_range | ATR% | LOW | 0.15166% | 0.37374% | 0.9% | 82.7% | -81.8 pp | +2.054 | TOO NOISY | FAIL | PASS | 3270 | DEGRADED |
| quiet_range | Drift | NORMAL | 0.03289% | 0.03109% | 28.7% | 46.0% | -17.3 pp | -0.004 | TOO NOISY | PASS | PASS | 3270 | DEGRADED |
| quiet_range | VR8 | LOW | 0.83741 | 0.84671 | 68.0% | 66.5% | +1.4 pp | +0.037 | PASS | PASS | PASS | 3270 | DEGRADED |
| quiet_range | VR16 | LOW | 0.78937 | 0.81913 | 66.0% | 62.4% | +3.6 pp | +0.093 | PASS | PASS | PASS | 3270 | DEGRADED |
| normal_chop | ATR% | NORMAL | 0.18158% | 0.46283% | 0.7% | 66.2% | -65.5 pp | +2.601 | TOO NOISY | FAIL | PASS | 2384 | DEGRADED |
| normal_chop | Drift | NORMAL | 0.03289% | 0.06295% | 22.4% | 46.0% | -23.6 pp | +0.069 | TOO NOISY | PASS | PASS | 2384 | DEGRADED |
| normal_chop | VR8 | NORMAL | 0.96337 | 0.95256 | 31.6% | 42.1% | -10.6 pp | -0.043 | PASS | PASS | PASS | 2384 | DEGRADED |
| normal_chop | VR16 | NORMAL | 0.94870 | 0.92654 | 29.4% | 40.6% | -11.2 pp | -0.069 | PASS | PASS | PASS | 2384 | DEGRADED |
| trend_up | ATR% | NORMAL | 0.18158% | 0.43180% | 0.5% | 66.2% | -65.7 pp | +2.314 | TOO NOISY | FAIL | PASS | 2615 | DEGRADED |
| trend_up | Drift | HIGH | 0.26844% | 0.26493% | 65.2% | 68.4% | -3.2 pp | -0.008 | PASS | PASS | PASS | 2615 | DEGRADED |
| trend_up | VR8 | HIGH | 1.08756 | 1.06842 | 61.1% | 68.0% | -6.8 pp | -0.076 | PASS | PASS | PASS | 2615 | DEGRADED |
| trend_up | VR16 | HIGH | 1.10918 | 1.06023 | 57.2% | 66.2% | -9.0 pp | -0.153 | PASS | PASS | PASS | 2615 | DEGRADED |
| trend_down | ATR% | NORMAL | 0.18158% | 0.44681% | 0.4% | 66.2% | -65.7 pp | +2.453 | TOO NOISY | FAIL | PASS | 2908 | DEGRADED |
| trend_down | Drift | LOW | -0.16482% | -0.17566% | 62.9% | 66.1% | -3.2 pp | -0.025 | PASS | PASS | PASS | 2908 | DEGRADED |
| trend_down | VR8 | HIGH | 1.08756 | 1.04404 | 55.9% | 68.0% | -12.0 pp | -0.174 | PASS | PASS | PASS | 2908 | DEGRADED |
| trend_down | VR16 | HIGH | 1.10918 | 1.02289 | 50.0% | 66.2% | -16.2 pp | -0.270 | TOO NOISY | FAIL | PASS | 2908 | DEGRADED |
| whipsaw | ATR% | HIGH | 0.25978% | 0.61853% | 100.0% | 83.4% | +16.6 pp | +3.318 | TOO CLEAN | FAIL | PASS | 2372 | DEGRADED |
| whipsaw | Drift | NORMAL | 0.03289% | 0.01935% | 18.4% | 46.0% | -27.6 pp | -0.031 | TOO NOISY | PASS | PASS | 2372 | DEGRADED |
| whipsaw | VR8 | LOW | 0.83741 | 0.83719 | 73.4% | 66.5% | +6.9 pp | -0.001 | PASS | PASS | PASS | 2372 | DEGRADED |
| whipsaw | VR16 | LOW | 0.78937 | 0.80609 | 68.3% | 62.4% | +5.9 pp | +0.052 | PASS | PASS | PASS | 2372 | DEGRADED |
| expansion_up | ATR% | HIGH | 0.25978% | 0.60586% | 100.0% | 83.4% | +16.6 pp | +3.201 | TOO CLEAN | FAIL | PASS | 2814 | DEGRADED |
| expansion_up | Drift | HIGH | 0.26844% | 0.22834% | 58.1% | 68.4% | -10.3 pp | -0.093 | PASS | PASS | PASS | 2814 | DEGRADED |
| expansion_up | VR8 | HIGH | 1.08756 | 1.06803 | 62.1% | 68.0% | -5.8 pp | -0.078 | PASS | PASS | PASS | 2814 | DEGRADED |
| expansion_up | VR16 | HIGH | 1.10918 | 1.05978 | 57.3% | 66.2% | -8.9 pp | -0.154 | PASS | PASS | PASS | 2814 | DEGRADED |
| expansion_down | ATR% | HIGH | 0.25978% | 0.61089% | 99.8% | 83.4% | +16.4 pp | +3.247 | TOO CLEAN | FAIL | PASS | 3089 | DEGRADED |
| expansion_down | Drift | LOW | -0.16482% | -0.18018% | 61.0% | 66.1% | -5.1 pp | -0.035 | PASS | PASS | PASS | 3089 | DEGRADED |
| expansion_down | VR8 | HIGH | 1.08756 | 1.07095 | 61.4% | 68.0% | -6.6 pp | -0.066 | PASS | PASS | PASS | 3089 | DEGRADED |
| expansion_down | VR16 | HIGH | 1.10918 | 1.04805 | 55.1% | 66.2% | -11.1 pp | -0.191 | PASS | PASS | PASS | 3089 | DEGRADED |

**DESIGN pooled C3 ordering**

| Statistic | LOW pooled median | NORMAL pooled median | HIGH pooled median | Ordering |
| --- | --- | --- | --- | --- |
| ATR% | 0.37374% | 0.44446% | 0.61015% | PASS |
| Drift | -0.17896% | 0.03664% | 0.24835% | PASS |
| VR8 | 0.84271 | 0.95256 | 1.06244 | PASS |
| VR16 | 0.81336 | 0.92654 | 1.04714 | PASS |

### NULL regime/statistic checks

Fixed criteria: C1 is the absolute difference from the W=20 real-ceiling share, tolerance 0.15; `TOO CLEAN`/`TOO NOISY` are directional C1 failures. C2 is (realized median − planted value)/(real p83−p17), tolerance ±0.25. C3 is strict pooled LOW < NORMAL < HIGH median order. `THIN` would mark real ceiling n<15 and is not pass/fail; there are no THIN cells below. DEGRADED is reported without repair.

| Regime | Statistic | Intended | Planted | Realized median | Synthetic intended-tercile share | Real ceiling | C1 difference | C2 normalized error | C1 | C2 | C3 | W=20 windows | Regime status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| quiet_range | ATR% | LOW | 0.15166% | 0.38214% | 0.6% | 82.7% | -82.0 pp | +2.132 | TOO NOISY | FAIL | PASS | 12100 | DEGRADED |
| quiet_range | Drift | NORMAL | 0.03289% | 0.00525% | 30.8% | 46.0% | -15.2 pp | -0.064 | TOO NOISY | PASS | PASS | 12100 | DEGRADED |
| quiet_range | VR8 | LOW | 0.83741 | 0.82627 | 72.3% | 66.5% | +5.7 pp | -0.045 | PASS | PASS | PASS | 12100 | DEGRADED |
| quiet_range | VR16 | LOW | 0.78937 | 0.80181 | 68.1% | 62.4% | +5.7 pp | +0.039 | PASS | PASS | PASS | 12100 | DEGRADED |
| normal_chop | ATR% | NORMAL | 0.18158% | 0.45659% | 1.0% | 66.2% | -65.2 pp | +2.544 | TOO NOISY | FAIL | PASS | 12100 | DEGRADED |
| normal_chop | Drift | NORMAL | 0.03289% | -0.00252% | 24.4% | 46.0% | -21.6 pp | -0.082 | TOO NOISY | PASS | PASS | 12100 | DEGRADED |
| normal_chop | VR8 | NORMAL | 0.96337 | 0.94082 | 33.7% | 42.1% | -8.5 pp | -0.090 | PASS | PASS | PASS | 12100 | DEGRADED |
| normal_chop | VR16 | NORMAL | 0.94870 | 0.92399 | 31.2% | 40.6% | -9.4 pp | -0.077 | PASS | PASS | PASS | 12100 | DEGRADED |
| trend_up | ATR% | NORMAL | 0.18158% | 0.45740% | 1.0% | 66.2% | -65.2 pp | +2.551 | TOO NOISY | FAIL | PASS | 12100 | DEGRADED |
| trend_up | Drift | HIGH | 0.26844% | 0.23095% | 61.1% | 68.4% | -7.3 pp | -0.087 | PASS | PASS | PASS | 12100 | DEGRADED |
| trend_up | VR8 | HIGH | 1.08756 | 1.05559 | 59.0% | 68.0% | -8.9 pp | -0.128 | PASS | PASS | PASS | 12100 | DEGRADED |
| trend_up | VR16 | HIGH | 1.10918 | 1.04346 | 54.5% | 66.2% | -11.7 pp | -0.205 | PASS | PASS | PASS | 12100 | DEGRADED |
| trend_down | ATR% | NORMAL | 0.18158% | 0.45691% | 0.9% | 66.2% | -65.3 pp | +2.547 | TOO NOISY | FAIL | PASS | 12100 | DEGRADED |
| trend_down | Drift | LOW | -0.16482% | -0.20274% | 66.0% | 66.1% | -0.0 pp | -0.088 | PASS | PASS | PASS | 12100 | DEGRADED |
| trend_down | VR8 | HIGH | 1.08756 | 1.05533 | 59.0% | 68.0% | -8.9 pp | -0.129 | PASS | PASS | PASS | 12100 | DEGRADED |
| trend_down | VR16 | HIGH | 1.10918 | 1.04347 | 54.3% | 66.2% | -11.8 pp | -0.205 | PASS | PASS | PASS | 12100 | DEGRADED |
| whipsaw | ATR% | HIGH | 0.25978% | 0.65439% | 100.0% | 83.4% | +16.6 pp | +3.650 | TOO CLEAN | FAIL | PASS | 12100 | DEGRADED |
| whipsaw | Drift | NORMAL | 0.03289% | -0.01369% | 18.7% | 46.0% | -27.4 pp | -0.108 | TOO NOISY | PASS | PASS | 12100 | DEGRADED |
| whipsaw | VR8 | LOW | 0.83741 | 0.82628 | 72.3% | 66.5% | +5.8 pp | -0.045 | PASS | PASS | PASS | 12100 | DEGRADED |
| whipsaw | VR16 | LOW | 0.78937 | 0.80148 | 68.0% | 62.4% | +5.6 pp | +0.038 | PASS | PASS | PASS | 12100 | DEGRADED |
| expansion_up | ATR% | HIGH | 0.25978% | 0.65385% | 100.0% | 83.4% | +16.6 pp | +3.645 | TOO CLEAN | FAIL | PASS | 12100 | DEGRADED |
| expansion_up | Drift | HIGH | 0.26844% | 0.21437% | 56.8% | 68.4% | -11.5 pp | -0.125 | PASS | PASS | PASS | 12100 | DEGRADED |
| expansion_up | VR8 | HIGH | 1.08756 | 1.05554 | 59.1% | 68.0% | -8.9 pp | -0.128 | PASS | PASS | PASS | 12100 | DEGRADED |
| expansion_up | VR16 | HIGH | 1.10918 | 1.04320 | 54.4% | 66.2% | -11.7 pp | -0.206 | PASS | PASS | PASS | 12100 | DEGRADED |
| expansion_down | ATR% | HIGH | 0.25978% | 0.65383% | 100.0% | 83.4% | +16.6 pp | +3.645 | TOO CLEAN | FAIL | PASS | 12100 | DEGRADED |
| expansion_down | Drift | LOW | -0.16482% | -0.21956% | 62.8% | 66.1% | -3.3 pp | -0.126 | PASS | PASS | PASS | 12100 | DEGRADED |
| expansion_down | VR8 | HIGH | 1.08756 | 1.05547 | 59.1% | 68.0% | -8.9 pp | -0.128 | PASS | PASS | PASS | 12100 | DEGRADED |
| expansion_down | VR16 | HIGH | 1.10918 | 1.04285 | 54.4% | 66.2% | -11.8 pp | -0.207 | PASS | PASS | PASS | 12100 | DEGRADED |

**NULL pooled C3 ordering**

| Statistic | LOW pooled median | NORMAL pooled median | HIGH pooled median | Ordering |
| --- | --- | --- | --- | --- |
| ATR% | 0.38214% | 0.45696% | 0.65390% | PASS |
| Drift | -0.20957% | -0.00222% | 0.22408% | PASS |
| VR8 | 0.82628 | 0.94082 | 1.05548 | PASS |
| VR16 | 0.80169 | 0.92399 | 1.04318 | PASS |

### Overlay coverage (DESIGN replay only)

| Overlay | Episodes | Overlay weekdays | Weekday coverage by base regime |
| --- | --- | --- | --- |
| news_storm | 217 | 761 | quiet_range: 114; normal_chop: 106; trend_up: 153; trend_down: 128; whipsaw: 92; expansion_up: 103; expansion_down: 65 |
| gap_shocks | 236 | 850 | quiet_range: 130; normal_chop: 118; trend_up: 117; trend_down: 109; whipsaw: 126; expansion_up: 92; expansion_down: 158 |

### DESIGN EXTRAPOLATION coverage

EXTRAPOLATION is flagged when any relevant dial-derived statistic lies outside its real W=20 p5–p95 band.

| Regime | Bars | Bars flagged | Flagged share |
| --- | --- | --- | --- |
| quiet_range | 297734 | 0 | 0.0% |
| normal_chop | 231123 | 0 | 0.0% |
| trend_up | 251081 | 0 | 0.0% |
| trend_down | 265711 | 0 | 0.0% |
| whipsaw | 225070 | 0 | 0.0% |
| expansion_up | 259563 | 0 | 0.0% |
| expansion_down | 267273 | 0 | 0.0% |

### NULL EXTRAPOLATION coverage

EXTRAPOLATION is flagged when any relevant dial-derived statistic lies outside its real W=20 p5–p95 band.

| Regime | Bars | Bars flagged | Flagged share |
| --- | --- | --- | --- |
| quiet_range | 642232 | 0 | 0.0% |
| normal_chop | 642232 | 0 | 0.0% |
| trend_up | 642232 | 0 | 0.0% |
| trend_down | 642232 | 0 | 0.0% |
| whipsaw | 642232 | 0 | 0.0% |
| expansion_up | 642232 | 0 | 0.0% |
| expansion_down | 642232 | 0 | 0.0% |

## DESIGN-only separability (single-feature AUC)

Features are causal: sampled every fourth non-blend observation beginning at bar index 61, each feature uses only the preceding 48 completed bars/returns. ATR's 14-bar Wilder warm-up is complete; VR8 and VR16 receive the same 48 completed returns, meeting the VR estimator's `2q` minimum. Drift z-score uses the previous 48 close-to-close returns divided by their sample SD. The best oriented single-feature AUC is the maximum across the four frozen features. Pairs below 0.60 are INSEPARABLE. LOCKED TEST was not consulted.

| Regime pair | ATR% 48 bars | Drift z 48 returns | VR8 48 returns | VR16 48 returns | Best single feature | Best oriented AUC | Samples A / B | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| quiet_range vs normal_chop | 0.5869 | 0.5053 | 0.5641 | 0.5444 | ATR% 48 bars | 0.5869 | 70383 / 54415 | INSEPARABLE |
| quiet_range vs trend_up | 0.5613 | 0.5708 | 0.6208 | 0.5853 | VR8 48 returns | 0.6208 | 70383 / 59158 | SEPARABLE |
| quiet_range vs trend_down | 0.5737 | 0.5561 | 0.6260 | 0.5925 | VR8 48 returns | 0.6260 | 70383 / 63000 | SEPARABLE |
| quiet_range vs whipsaw | 0.7144 | 0.5056 | 0.5126 | 0.5120 | ATR% 48 bars | 0.7144 | 70383 / 53087 | SEPARABLE |
| quiet_range vs expansion_up | 0.7156 | 0.5376 | 0.6280 | 0.5912 | ATR% 48 bars | 0.7156 | 70383 / 61408 | SEPARABLE |
| quiet_range vs expansion_down | 0.7106 | 0.5467 | 0.6220 | 0.5885 | ATR% 48 bars | 0.7106 | 70383 / 63352 | SEPARABLE |
| normal_chop vs trend_up | 0.5257 | 0.5637 | 0.5581 | 0.5414 | Drift z 48 returns | 0.5637 | 54415 / 59158 | INSEPARABLE |
| normal_chop vs trend_down | 0.5121 | 0.5591 | 0.5630 | 0.5485 | VR8 48 returns | 0.5630 | 54415 / 63000 | INSEPARABLE |
| normal_chop vs whipsaw | 0.6386 | 0.5107 | 0.5764 | 0.5562 | ATR% 48 bars | 0.6386 | 54415 / 53087 | SEPARABLE |
| normal_chop vs expansion_up | 0.6385 | 0.5315 | 0.5656 | 0.5475 | ATR% 48 bars | 0.6385 | 54415 / 61408 | SEPARABLE |
| normal_chop vs expansion_down | 0.6354 | 0.5499 | 0.5593 | 0.5446 | ATR% 48 bars | 0.6354 | 54415 / 63352 | SEPARABLE |
| trend_up vs trend_down | 0.5131 | 0.6174 | 0.5045 | 0.5068 | Drift z 48 returns | 0.6174 | 59158 / 63000 | SEPARABLE |
| trend_up vs whipsaw | 0.6611 | 0.5761 | 0.6325 | 0.5969 | ATR% 48 bars | 0.6611 | 59158 / 53087 | SEPARABLE |
| trend_up vs expansion_up | 0.6613 | 0.5315 | 0.5075 | 0.5061 | ATR% 48 bars | 0.6613 | 59158 / 61408 | SEPARABLE |
| trend_up vs expansion_down | 0.6576 | 0.6088 | 0.5011 | 0.5031 | ATR% 48 bars | 0.6576 | 59158 / 63352 | SEPARABLE |
| trend_down vs whipsaw | 0.6466 | 0.5510 | 0.6377 | 0.6041 | ATR% 48 bars | 0.6466 | 63000 / 53087 | SEPARABLE |
| trend_down vs expansion_up | 0.6466 | 0.5873 | 0.5031 | 0.5007 | ATR% 48 bars | 0.6466 | 63000 / 61408 | SEPARABLE |
| trend_down vs expansion_down | 0.6431 | 0.5090 | 0.5034 | 0.5037 | ATR% 48 bars | 0.6431 | 63000 / 63352 | SEPARABLE |
| whipsaw vs expansion_up | 0.5025 | 0.5429 | 0.6396 | 0.6027 | VR8 48 returns | 0.6396 | 53087 / 61408 | SEPARABLE |
| whipsaw vs expansion_down | 0.5028 | 0.5415 | 0.6337 | 0.6001 | VR8 48 returns | 0.6337 | 53087 / 63352 | SEPARABLE |
| expansion_up vs expansion_down | 0.5003 | 0.5785 | 0.5064 | 0.5030 | Drift z 48 returns | 0.5785 | 61408 / 63352 | INSEPARABLE |

**Requested hard pairs**

| Pair | Best feature | Best oriented AUC | Status |
| --- | --- | --- | --- |
| quiet_range vs normal_chop | ATR% 48 bars | 0.5869 | INSEPARABLE |
| normal_chop vs trend_up | Drift z 48 returns | 0.5637 | INSEPARABLE |
| normal_chop vs trend_down | VR8 48 returns | 0.5630 | INSEPARABLE |
| trend_up vs expansion_up | ATR% 48 bars | 0.6613 | SEPARABLE |

**INSEPARABLE pairs (best oriented single-feature AUC <0.60):** quiet_range vs normal_chop, normal_chop vs trend_up, normal_chop vs trend_down, expansion_up vs expansion_down.

## Determinism, parser, and integrity

- Canonical JSON uses gzip level 9 with mtime 0. The partial inventory contains canonical JSON and compressed-file SHA-256 for all 200 DESIGN, 141 successfully generated LOCKED TEST, and 700 NULL artifacts.
- Twenty unique pre-listed non-LOCKED DESIGN/NULL paths were rebuilt. **20/20 canonical and compressed hashes match the deterministic replay inventory.** Limitation: the interrupted first bulk process never flushed its original in-memory DESIGN inventory; therefore these are replay-inventory matches, not independent comparisons against the lost first-run rows. The previously recorded preflight hashes for DESIGN seed 5001 (canonical `0e7e21212c18ee95eed541c8c9dc191fc19f785218357427c9b108b091055148`; compressed `81de96d25afa5ade14e1c4ff4ae272b2fddfa967e5af05f51af4cbc230d1ff2d`) and NULL/quiet_range seed 7001 (canonical `07124aa95611591c856d7d47598ae1e2ce7121a2fe636d03f0e331a492079083`; compressed `caf257a5cbe43e93490350500864eaddee6dd4ca8aaac708c60bf45cf0385290`) also match the regenerated partial inventory.

| Rebuild set/regime | Seed | Canonical hash match | Compressed hash match |
| --- | --- | --- | --- |
| NULL/whipsaw | 7001 | PASS | PASS |
| NULL/expansion_up | 7072 | PASS | PASS |
| NULL/quiet_range | 7090 | PASS | PASS |
| NULL/trend_down | 7075 | PASS | PASS |
| NULL/normal_chop | 7056 | PASS | PASS |
| NULL/trend_up | 7059 | PASS | PASS |
| NULL/normal_chop | 7018 | PASS | PASS |
| NULL/expansion_up | 7029 | PASS | PASS |
| DESIGN | 5102 | PASS | PASS |
| DESIGN | 5126 | PASS | PASS |
| NULL/trend_down | 7002 | PASS | PASS |
| NULL/expansion_down | 7019 | PASS | PASS |
| NULL/expansion_down | 7022 | PASS | PASS |
| NULL/trend_up | 7012 | PASS | PASS |
| NULL/expansion_down | 7085 | PASS | PASS |
| NULL/quiet_range | 7004 | PASS | PASS |
| NULL/trend_down | 7038 | PASS | PASS |
| NULL/trend_down | 7084 | PASS | PASS |
| DESIGN | 5050 | PASS | PASS |
| NULL/normal_chop | 7088 | PASS | PASS |

- Rebuild determinism against the replay inventory: **PASS (20/20)**; the stricter first-run baseline comparison is unavailable.
- Engine CSV parser round-trip on DESIGN seed 5001: **PASS**, 10,604 candles, exact timestamp/OHLC match; CSV SHA-256 `8248b2e7d0e4ad1c67c2d3551df4dfecc260bdf5ab4458c741d8dd30ade9c575`.
- LOCKED TEST boundary: no path was decompressed or analyzed. Hash-only rebuilds of seeds 6001–6141 did not inspect candle/label/statistic contents.
- Previous Stage 2 post-outcome repairs: **0**. Stage 2b results are not repaired post hoc.

### Per-seed inventory

`STAGE2B-SHA256SUMS.txt` is explicitly marked **PARTIAL** and records one row per successfully generated path (canonical JSON SHA-256, compressed-file SHA-256, byte count, relative path), as well as frozen committed-artifact hashes. It does not represent a complete LOCKED TEST inventory. The path files remain local ignored data and are not committed.

## Validation

- Before generation: `npx tsc --noEmit` passed; both Stage 2b runner scripts passed `node --check`; focused Stage 2b tests passed **5/5**; full `npm test` passed **242/242**.
- After the partial generation and report build: `npx tsc --noEmit` passed and full `npm test` passed **242/242**.
- These checks do not change the cohort status: the frozen LOCKED TEST generation remains incomplete at seed 6142.

### Fixed-seed replay verification (2026-10-04)

- Dependencies were installed with `npm ci`. Before replay, `npx tsc --noEmit` passed and full `npm test` passed **242/242**. The required source SHA-256, `SPEC-2b.md` SHA-256, preregistered execution-code/input/config/seed hashes, and runtime matched the frozen record: Node `v22.22.3`, ICU `78.2`, tzdata `2026a`, with `TZ` unset.
- After the 2026-10-04 replay and report updates, `npx tsc --noEmit` passed and full `npm test` passed **242/242** (0 failures).
- Re-generated DESIGN seeds 5001–5200 (**200/200**), LOCKED TEST seeds 6001–6141 (**141/200**, hash-only), and all seven NULL cohorts (**700/700**). Every one of the **1,041** regenerated paths matched its committed partial-inventory canonical JSON SHA-256, compressed SHA-256, and byte count. The 59 LOCKED TEST paths 6142–6200 remain absent.
- LOCKED TEST generation again stopped at seed **6142** with `bar-shape construction produced invalid OHLC at 2026-08-24 15:00:00` in unchanged `generate.ts`. No artifact was written for 6142; no locked artifact was decompressed, parsed, analyzed, or statistically inspected.
- All **20** frozen DESIGN/NULL rebuild selections again matched both inventory hashes. DESIGN seed 5001 again round-tripped through the engine CSV parser: 10,604 candles, exact timestamp/OHLC equality, CSV SHA-256 `8248b2e7d0e4ad1c67c2d3551df4dfecc260bdf5ab4458c741d8dd30ade9c575`.
- Recomputed DESIGN and NULL fixed checks reproduced the report: every regime remains `DEGRADED` because of preregistered C1/C2 failures; all four C3 orderings pass; no real-ceiling cell is `THIN`; DESIGN and NULL extrapolation shares are 0.0% in all regimes. The 21 DESIGN pairwise AUCs also reproduced, including the four `INSEPARABLE` pairs. No result was repaired or reinterpreted.

## Assumptions, limitations, and out-of-scope working-tree edits

- EAT is fixed +03:00 per the owner; source timestamps were not shifted. The conflicting source `(UTC)` marker remains unresolved.
- The source-profile auxiliary gap/news values are used only for base/overlay/wobble/extrapolation; they are not C1–C3 targets. News is a source-normalized tail proxy, not an economic-news calendar or event attribution.
- Wobble amplitude and overlay probability/duration are coverage conventions, not future-market-frequency estimates.
- Runtime Intl/IANA seasonality uses the recorded Node/ICU/tzdata environment; Stage 1b tzdata was not independently pinned.
- Stage 1b generator/profile, engine, strategies, UI, and `src/lib/synth/` were not changed by this task. Old Stage 2 artifacts remain superseded; the old LOCKED TEST remains abandoned and unopened.
- Pre-existing out-of-scope paths recorded at task entry (not edited or staged here):

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

### Current replay-entry snapshot (2026-10-04)

After syncing the fixed session branch and before this replay's scoped documentation edits, the following out-of-scope paths were present; they were left untouched and unstaged:

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
?? .coding-latest.patch
?? AUDIT-ARENA-2026-10-01.md
?? src/components/ServerAccessPanel.tsx
?? src/lib/app-access-client.ts
?? src/lib/mt5/validation.ts
?? src/lib/server-access.ts
?? tests/mt5-routes.test.mjs
?? tests/mt5-safety.test.mjs
```

The earlier task-entry snapshot above is retained verbatim in `STAGE2B-OUT-OF-SCOPE.txt`; the current snapshot is recorded there as well.

## Output artifacts

- `SPEC-2b.md` / `SPEC-2b.sha256`: frozen protocol, SHA-256 `18537cb7992b9e3b0d86e42beb7fcaaa92e4cedeb8106a5660e5c41db508c574`.
- `STAGE2B-REAL-BANDS.json`: W=20 calibration, SHA-256 `696cbca363abb312b1411d45a573c0e49317aa40a572acbe9da2e7ae7ee20356`.
- `STAGE2B-CONFIG.json`: frozen settings/checks, SHA-256 `88bfcfeb364820bbb4cb6f6139b1f2b2643575ddecce74ff85b1412b68564911`.
- `STAGE2B-PRE-REGISTRATION.json`: code/input/config hashes recorded before generation.
- `STAGE2B-SEEDS.json`: fixed seeds and 20 rebuild paths.
- `STAGE2B-SHA256SUMS.txt`: **partial** per-seed canonical/compressed inventory plus committed-file hashes.
- Compressed generated path files are local ignored data only and are not committed.
