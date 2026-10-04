# Synth V2 Stage 2c — preregistered W=20 regime study

Generated **2026-10-04**. Full Stage 2c validation and cohort generation report.

## Part A — Diagnosis of Stage 2b Gaps

- **A1. 757f91b Diagnosis Verification:**
  - Real gold $W=20$ ATR% bands: $p_{17}=0.15166\%$, $p_{50}=0.18158\%$, $p_{83}=0.25978\%$. (Median 0.18158%, p10 0.14007%, p90 0.29313% sliding; non-overlapping median 0.17587%, p10 0.13707%, p90 0.30414%).
  - Stage 2b DESIGN realized ATR% medians were ~2.5x planted across all 7 regimes (quiet_range 0.37374% vs 0.15166%; normal_chop 0.46283% vs 0.18158%; whipsaw 0.61853% vs 0.25978%).
  - When the base model was evaluated at its default Stage 1b "normal" dial (0.00123003), realized median window ATR% was 0.28745% (non-overlapping) / 0.29205% (sliding) vs real gold 0.17587% / 0.18158%. Because the default setting does NOT reproduce real ATR%, **the base model has a level fault**, compound with a units mismatch in the Stage 2b dial mapping (which assigned realized ATR% quantiles to an innovation daily standard deviation dial).
  - Drift and VR8/VR16 passed C1-C3 in Stage 2b across almost all regimes (drift C2 passed in 7/7 regimes; VR8 passed C1-C3 in 7/7 regimes; VR16 passed C1-C3 in 6/7 regimes). They did not suffer a units mismatch.
- **A2. INSEPARABLE Pairs:**
  - Four pairs were INSEPARABLE in Stage 2b: `quiet_range vs normal_chop` (0.5869), `normal_chop vs trend_up` (0.5637), `normal_chop vs trend_down` (0.5630), `expansion_up vs expansion_down` (0.5785).
  - Only ONE pair (`quiet_range vs normal_chop`) differed in volatility. The other three pairs have identical planted volatility levels and differ solely in drift and trend.
- **A3. Generator Crash on Seed 6142:**
  - Error message: `bar-shape construction produced invalid OHLC at 2026-08-24 15:00:00`.
  - Schedule: 4 segments (normal_chop 30d, expansion_down 69d, trend_up 29d, whipsaw 39d), total 167 weekdays.
  - Crash bar: Day 87, slot 28 (15:00:00), barIndex 4042, inside segment 1 (expansion_down), overlays empty.
  - Dial values: vol 0.002549, drift -0.001352, trendiness 0.057827, gap 0.125048, news 0.024305.
  - Reproduced on debug seed 90135 at 2026-08-28 17:00:00.
  - Root cause: unconstrained lower wick subtraction `min(open, close) - wickTotal * (1 - upperFraction)` drove `low` negative (-163.94) on an extreme downward bar with small body share and large lower wick share.
- **A4. Stage 1 Gates Audit:**
  - Stage 1 gates measured return kurtosis / ATR (G1), raw return ACF (G2), candle shape shares (G3), gap stats / ATR (G4), intraday seasonality shares (G5), variance ratios over 120 days (G6), daily range / ATR (G7), invariants/determinism (G8), and single-dial moves (D1).
  - NONE of the Stage 1 gates tested the absolute level of ATR%, its dispersion across 20-weekday windows, or its persistence across weeks.

## Stage 2c Provenance and Frozen Inputs

- Source: `XAUUSD_30min_2020-01-24_to_2026-10-01.csv`; SHA-256 `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`.
- SPEC-2b incorporated unchanged: `18537cb7992b9e3b0d86e42beb7fcaaa92e4cedeb8106a5660e5c41db508c574`.
- SPEC-2c SHA-256: `9eea82c1c902043fb64f4caa52a32524255b165f67f0cacf092ae52aa21c380b`.
- Real W=20 calibration SHA-256: `6306b825b98d726d8a0f96f8f8f6e4d34c02603fb40cc71dd6ce055f80ac4bb1`.
- Config SHA-256: `61bc907de2dbb0a678e2ef1bb1245de6829da29b554601815cf2d546d4e90dc7`.
- Seed-list SHA-256: `24d5f86a25cdf61391800c327e427da7efcd1b980385b3640f1a2110a1a93043`.
- Profile SHA-256: `6a5a387c00929697fda3ffdd3c32e866ca0c275a18e175a3969965ee60df2203`.
- Runtime: Node `v22.22.3`, ICU `78.2`, tzdata `2026a`.

### Frozen code hashes
- `package.json`: `d9a2e925fac6a5e07a8d5b80281c802010f8d1736afeacf39ec5cf809e7757cc`
- `scripts/synth-v2-stage2c.mjs`: `b9cdbf1dd177bee9255647dae285fb7126a05a8f80d6714942e527f905e13bfd`
- `src/lib/analyzer/parse.ts`: `4fbe1424da4094c7e1aa0295a591fc3a9da0954639eb46ea2cdcf0d962c80dd8`
- `src/lib/analyzer/types.ts`: `2d2a808c5c8b362a40b5a94fbe74a7ec1d607c07f3520891e05a6cfc996aeebd`
- `src/lib/synth-v2/csv.ts`: `0ac4507a2438fa04391248e9ae66b91366b601d662a954f196392ee495bf5aa8`
- `src/lib/synth-v2/generate.ts`: `94f6c2e2ec4d45098d8ad902f463f7280bfb818eba675fc1959283e698d3fea1`
- `src/lib/synth-v2/random.ts`: `d9b8415703b0a293841955e2bdbcf9de6c1260191794218e187055b65ab5534d`
- `src/lib/synth-v2/regimes.ts`: `fa6ec133fa6a50944df1f511e52a7e95c02597236dc430ff5293efe39fa477dd`
- `src/lib/synth-v2/stage2-artifacts.ts`: `f62e73a7cd4edc0bc935a79670fcab1528da641b91002abfa8f0a55af6d84586`
- `src/lib/synth-v2/stage2b-math.ts`: `e9eb398d1b2e749765339bae87b925a280192c5b9b0fe6a84412c0f6827f2d4b`
- `src/lib/synth-v2/stage2b-provenance.ts`: `76ce6c8fc3d8c6dc9f2516c7ff7dee736fa8343dc94516230cbf679f4cc563fd`
- `src/lib/synth-v2/stage2b-regimes.ts`: `dd1e2230b4b3ff4ac42c8c53990873c2041e33f972f62824c6e37cebaf660f17`
- `src/lib/synth-v2/stage2b-types.ts`: `d570c51844811d8650bc44df78e3831e80349f2b7c31d20d90697cf189b9b7be`
- `src/lib/synth-v2/stage2b-validation.ts`: `9f7474fe9b0e60f1d6f10861c9a0ac2d67ad263fbc846c65499a54dd9db5753a`
- `src/lib/synth-v2/time.ts`: `b1131f1f3156d1c57457cd90897888f8158d625cc2fae5227be063e5a1980b05`
- `src/lib/synth-v2/types.ts`: `98239ee1b11be2535fd772c9584c21c701d79ba0b8f3b625882930b6aea52d41`
- `tests/hooks.mjs`: `fc9a5536bdab299a1f55e44e91101c153234ead8495d39a7ba82a32964518a2f`
- `tests/register.mjs`: `286b813c5cf21c66a921566a518b8e9ee5ab58edd84bd8e16faea3c2bfa80a17`

### Frozen input hashes
- `src/lib/synth-v2/SPEC-2b.md`: `18537cb7992b9e3b0d86e42beb7fcaaa92e4cedeb8106a5660e5c41db508c574`
- `src/lib/synth-v2/SPEC-2c.md`: `9eea82c1c902043fb64f4caa52a32524255b165f67f0cacf092ae52aa21c380b`
- `src/lib/synth-v2/SPEC-2c.sha256`: `7712610f5465a82bb159ea40b6286f8cf639f16a16c4eb470c00682ff9372f93`
- `src/lib/synth-v2/stage2c-data/.gitignore`: `1ac283bda20bbd62be9918da0265293bc3723a654d112e47817a1558be115be8`
- `src/lib/synth-v2/STAGE2C-SEEDS.json`: `24d5f86a25cdf61391800c327e427da7efcd1b980385b3640f1a2110a1a93043`
- `src/lib/synth-v2/STAGE2C-REAL-BANDS.json`: `6306b825b98d726d8a0f96f8f8f6e4d34c02603fb40cc71dd6ce055f80ac4bb1`
- `src/lib/synth-v2/STAGE2C-VOL-MAP.json`: `99894882e7668afc84b4bac0d6fed6446d1cbf4dbd1f5a1d20e746cffee713a5`
- `src/lib/synth-v2/profile.json`: `6a5a387c00929697fda3ffdd3c32e866ca0c275a18e175a3969965ee60df2203`
- `XAUUSD_30min_2020-01-24_to_2026-10-01.csv`: `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`

## Stage 2c Real W=20 Calibration and Dial-Response Mapping

| Regime | Volatility level (target ATR%; dial) | Drift (p17/p50/p83) | Trend control (phi; target VR8/VR16) | Gap p50 / overlay p90 | News p50 / overlay p90 | Additive wobble amplitudes (vol / drift / phi / gap / news) |
| --- | --- | --- | --- | ---: | ---: | --- |
| quiet_range | LOW (target 0.1517%; dial 0.000632) | NORMAL (0.0329%) | LOW (phi -0.110800; targets 0.8374/0.7894) | 0.119129 / 0.362498 | 0.024336 / 0.033589 | vol ±—; drift ±0.00043326; phi ±0.01618000; gap ±0.01240562; news ±0.00124268 |
| normal_chop | NORMAL (target 0.1816%; dial 0.000757) | NORMAL (0.0329%) | NORMAL (phi -0.024100; targets 0.9634/0.9487) | 0.119129 / 0.362498 | 0.024336 / 0.033589 | vol ±—; drift ±0.00043326; phi ±0.01618000; gap ±0.01240562; news ±0.00124268 |
| trend_up | NORMAL (target 0.1816%; dial 0.000757) | HIGH (0.2684%) | HIGH (phi 0.051000; targets 1.0876/1.1092) | 0.119129 / 0.362498 | 0.024336 / 0.033589 | vol ±—; drift ±0.00043326; phi ±0.01618000; gap ±0.01240562; news ±0.00124268 |
| trend_down | NORMAL (target 0.1816%; dial 0.000757) | LOW (-0.1648%) | HIGH (phi 0.051000; targets 1.0876/1.1092) | 0.119129 / 0.362498 | 0.024336 / 0.033589 | vol ±—; drift ±0.00043326; phi ±0.01618000; gap ±0.01240562; news ±0.00124268 |
| whipsaw | HIGH (target 0.2598%; dial 0.001084) | NORMAL (0.0329%) | LOW (phi -0.110800; targets 0.8374/0.7894) | 0.119129 / 0.362498 | 0.024336 / 0.033589 | vol ±—; drift ±0.00043326; phi ±0.01618000; gap ±0.01240562; news ±0.00124268 |
| expansion_up | HIGH (target 0.2598%; dial 0.001084) | HIGH (0.2684%) | HIGH (phi 0.051000; targets 1.0876/1.1092) | 0.119129 / 0.362498 | 0.024336 / 0.033589 | vol ±—; drift ±0.00043326; phi ±0.01618000; gap ±0.01240562; news ±0.00124268 |
| expansion_down | HIGH (target 0.2598%; dial 0.001084) | LOW (-0.1648%) | HIGH (phi 0.051000; targets 1.0876/1.1092) | 0.119129 / 0.362498 | 0.024336 / 0.033589 | vol ±—; drift ±0.00043326; phi ±0.01618000; gap ±0.01240562; news ±0.00124268 |

### Real W=20 distribution bands
| Statistic | W=20 samples | p5 | p17 | p33 | p50 | p67 | p83 | p90 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ATR% | 1708 | 0.129143% | 0.151657% | 0.163623% | 0.181578% | 0.204365% | 0.259777% | 0.293129% | 0.348354% |
| Drift | 1708 | -0.332585% | -0.164817% | -0.060513% | 0.032894% | 0.135719% | 0.268439% | 0.335510% | 0.415037% |
| VR8 | 1708 | 0.771032 | 0.837409 | 0.903591 | 0.963370 | 1.023597 | 1.087556 | 1.122709 | 1.200191 |
| VR16 | 1708 | 0.701310 | 0.789371 | 0.878947 | 0.948696 | 1.022883 | 1.109177 | 1.177548 | 1.258209 |
| gapSize | 1708 | 0.051476 | 0.071337 | 0.090636 | 0.119129 | 0.154398 | 0.195393 | 0.362498 | 0.633121 |
| newsSpikeIntensity | 1708 | 0.015348 | 0.018478 | 0.021739 | 0.024336 | 0.027322 | 0.030905 | 0.033589 | 0.036688 |

### Real 60-weekday stretch ceilings
| Statistic | Tercile | 60-weekday stretches (n) | Real ceiling | Flag |
| --- | --- | ---: | ---: | --- |
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

## Cohort Completion

- **DESIGN:** seeds 8001–8200, 200 / 200 paths, 1792256 bars, 13626809 compressed bytes.
- **LOCKED TEST:** seeds 6001–6200, 200 / 200 paths (**COMPLETE** at 200, generated and hashed only; price data unopened).
- **NULL:** seeds 20001–20700, 700 / 700 paths, 4497460 bars, 34348952 compressed bytes.

## Fixed Checks and Results

### DESIGN regime/statistic checks

| Regime | Statistic | Intended | Planted setting | Realized median | Synthetic intended-tercile share | Real ceiling | C1 difference | C2 normalized median error | C1 | C2 | C3 | W=20 windows | Regime status |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | ---: | --- |
| quiet_range | ATR% | LOW | 0.15166% | 0.15574% | 54.6% | 82.7% | -28.1 pp | +0.038 | TOO NOISY | PASS | PASS | 2524 | DEGRADED |
| quiet_range | Drift | NORMAL | 0.03289% | 0.02891% | 64.2% | 46.0% | +18.2 pp | -0.009 | TOO CLEAN | PASS | PASS | 2524 | DEGRADED |
| quiet_range | VR8 | LOW | 0.83741 | 0.82526 | 73.1% | 66.5% | +6.5 pp | -0.049 | PASS | PASS | PASS | 2524 | DEGRADED |
| quiet_range | VR16 | LOW | 0.78937 | 0.79308 | 69.7% | 62.4% | +7.3 pp | +0.012 | PASS | PASS | PASS | 2524 | DEGRADED |
| normal_chop | ATR% | NORMAL | 0.18158% | 0.18582% | 20.2% | 66.2% | -46.0 pp | +0.039 | TOO NOISY | PASS | PASS | 2942 | DEGRADED |
| normal_chop | Drift | NORMAL | 0.03289% | 0.03022% | 53.6% | 46.0% | +7.6 pp | -0.006 | PASS | PASS | PASS | 2942 | DEGRADED |
| normal_chop | VR8 | NORMAL | 0.96337 | 0.94988 | 35.9% | 42.1% | -6.2 pp | -0.054 | PASS | PASS | PASS | 2942 | DEGRADED |
| normal_chop | VR16 | NORMAL | 0.94870 | 0.93782 | 29.7% | 40.6% | -10.9 pp | -0.034 | PASS | PASS | PASS | 2942 | DEGRADED |
| trend_up | ATR% | NORMAL | 0.18158% | 0.19109% | 26.2% | 66.2% | -40.0 pp | +0.088 | TOO NOISY | PASS | PASS | 2735 | DEGRADED |
| trend_up | Drift | HIGH | 0.26844% | 0.25700% | 79.9% | 68.4% | +11.6 pp | -0.026 | PASS | PASS | PASS | 2735 | DEGRADED |
| trend_up | VR8 | HIGH | 1.08756 | 1.08019 | 64.0% | 68.0% | -3.9 pp | -0.029 | PASS | PASS | PASS | 2735 | DEGRADED |
| trend_up | VR16 | HIGH | 1.10918 | 1.07356 | 60.8% | 66.2% | -5.4 pp | -0.111 | PASS | PASS | PASS | 2735 | DEGRADED |
| trend_down | ATR% | NORMAL | 0.18158% | 0.18170% | 28.4% | 66.2% | -37.8 pp | +0.001 | TOO NOISY | PASS | PASS | 2519 | DEGRADED |
| trend_down | Drift | LOW | -0.16482% | -0.18690% | 81.5% | 66.1% | +15.4 pp | -0.051 | TOO CLEAN | PASS | PASS | 2519 | DEGRADED |
| trend_down | VR8 | HIGH | 1.08756 | 1.03955 | 54.5% | 68.0% | -13.5 pp | -0.192 | PASS | PASS | PASS | 2519 | DEGRADED |
| trend_down | VR16 | HIGH | 1.10918 | 1.00489 | 46.4% | 66.2% | -19.8 pp | -0.326 | TOO NOISY | FAIL | PASS | 2519 | DEGRADED |
| whipsaw | ATR% | HIGH | 0.25978% | 0.27214% | 75.3% | 83.4% | -8.1 pp | +0.114 | PASS | PASS | PASS | 3265 | PASS |
| whipsaw | Drift | NORMAL | 0.03289% | 0.00016% | 39.5% | 46.0% | -6.5 pp | -0.076 | PASS | PASS | PASS | 3265 | PASS |
| whipsaw | VR8 | LOW | 0.83741 | 0.83720 | 71.1% | 66.5% | +4.6 pp | -0.001 | PASS | PASS | PASS | 3265 | PASS |
| whipsaw | VR16 | LOW | 0.78937 | 0.80369 | 67.4% | 62.4% | +5.0 pp | +0.045 | PASS | PASS | PASS | 3265 | PASS |
| expansion_up | ATR% | HIGH | 0.25978% | 0.26328% | 78.8% | 83.4% | -4.5 pp | +0.032 | PASS | PASS | PASS | 2548 | PASS |
| expansion_up | Drift | HIGH | 0.26844% | 0.24472% | 69.8% | 68.4% | +1.4 pp | -0.055 | PASS | PASS | PASS | 2548 | PASS |
| expansion_up | VR8 | HIGH | 1.08756 | 1.06155 | 61.4% | 68.0% | -6.6 pp | -0.104 | PASS | PASS | PASS | 2548 | PASS |
| expansion_up | VR16 | HIGH | 1.10918 | 1.05563 | 57.4% | 66.2% | -8.8 pp | -0.167 | PASS | PASS | PASS | 2548 | PASS |
| expansion_down | ATR% | HIGH | 0.25978% | 0.25635% | 77.3% | 83.4% | -6.1 pp | -0.032 | PASS | PASS | PASS | 2500 | PASS |
| expansion_down | Drift | LOW | -0.16482% | -0.19997% | 75.8% | 66.1% | +9.7 pp | -0.081 | PASS | PASS | PASS | 2500 | PASS |
| expansion_down | VR8 | HIGH | 1.08756 | 1.08368 | 65.2% | 68.0% | -2.7 pp | -0.015 | PASS | PASS | PASS | 2500 | PASS |
| expansion_down | VR16 | HIGH | 1.10918 | 1.07460 | 57.6% | 66.2% | -8.6 pp | -0.108 | PASS | PASS | PASS | 2500 | PASS |

**DESIGN pooled C3 ordering**

| Statistic | LOW pooled median | NORMAL pooled median | HIGH pooled median | Ordering |
| --- | ---: | ---: | ---: | --- |
| ATR% | 0.155737% | 0.186046% | 0.264906% | PASS |
| Drift | -0.191773% | 0.022245% | 0.251679% | PASS |
| VR8 | 0.831636 | 0.949881 | 1.065262 | PASS |
| VR16 | 0.798593 | 0.937816 | 1.052261 | PASS |

### DESIGN per-regime pass table and vol-free pass column

| Regime | ATR% C1-C3 | Drift C1-C3 | VR8 C1-C3 | VR16 C1-C3 | Full Regime Status | Vol-Free Pass (Drift+VRs only) |
| --- | --- | --- | --- | --- | --- | --- |
| quiet_range | FAIL (TOO NOISY/PASS) | FAIL (TOO CLEAN/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | DEGRADED | FAIL |
| normal_chop | FAIL (TOO NOISY/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | DEGRADED | PASS |
| trend_up | FAIL (TOO NOISY/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | DEGRADED | PASS |
| trend_down | FAIL (TOO NOISY/PASS) | FAIL (TOO CLEAN/PASS) | PASS (PASS/PASS) | FAIL (TOO NOISY/FAIL) | DEGRADED | FAIL |
| whipsaw | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS | PASS |
| expansion_up | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS | PASS |
| expansion_down | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS | PASS |

### NULL regime/statistic checks

| Regime | Statistic | Intended | Planted setting | Realized median | Synthetic intended-tercile share | Real ceiling | C1 difference | C2 normalized median error | C1 | C2 | C3 | W=20 windows | Regime status |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | ---: | --- |
| quiet_range | ATR% | LOW | 0.15166% | 0.15873% | 53.4% | 82.7% | -29.3 pp | +0.065 | TOO NOISY | PASS | PASS | 12100 | DEGRADED |
| quiet_range | Drift | NORMAL | 0.03289% | 0.03595% | 62.8% | 46.0% | +16.8 pp | +0.007 | TOO CLEAN | PASS | PASS | 12100 | DEGRADED |
| quiet_range | VR8 | LOW | 0.83741 | 0.83541 | 72.1% | 66.5% | +5.5 pp | -0.008 | PASS | PASS | PASS | 12100 | DEGRADED |
| quiet_range | VR16 | LOW | 0.78937 | 0.81269 | 65.4% | 62.4% | +3.0 pp | +0.073 | PASS | PASS | PASS | 12100 | DEGRADED |
| normal_chop | ATR% | NORMAL | 0.18158% | 0.18663% | 24.9% | 66.2% | -41.2 pp | +0.047 | TOO NOISY | PASS | PASS | 12100 | DEGRADED |
| normal_chop | Drift | NORMAL | 0.03289% | 0.02568% | 52.3% | 46.0% | +6.2 pp | -0.017 | PASS | PASS | PASS | 12100 | DEGRADED |
| normal_chop | VR8 | NORMAL | 0.96337 | 0.95216 | 30.6% | 42.1% | -11.5 pp | -0.045 | PASS | PASS | PASS | 12100 | DEGRADED |
| normal_chop | VR16 | NORMAL | 0.94870 | 0.93131 | 28.3% | 40.6% | -12.3 pp | -0.054 | PASS | PASS | PASS | 12100 | DEGRADED |
| trend_up | ATR% | NORMAL | 0.18158% | 0.18808% | 25.9% | 66.2% | -40.3 pp | +0.060 | TOO NOISY | PASS | PASS | 12100 | DEGRADED |
| trend_up | Drift | HIGH | 0.26844% | 0.25520% | 79.6% | 68.4% | +11.2 pp | -0.031 | PASS | PASS | PASS | 12100 | DEGRADED |
| trend_up | VR8 | HIGH | 1.08756 | 1.05625 | 58.4% | 68.0% | -9.6 pp | -0.125 | PASS | PASS | PASS | 12100 | DEGRADED |
| trend_up | VR16 | HIGH | 1.10918 | 1.03604 | 52.3% | 66.2% | -13.9 pp | -0.229 | PASS | PASS | PASS | 12100 | DEGRADED |
| trend_down | ATR% | NORMAL | 0.18158% | 0.18654% | 28.3% | 66.2% | -37.9 pp | +0.046 | TOO NOISY | PASS | PASS | 12100 | DEGRADED |
| trend_down | Drift | LOW | -0.16482% | -0.16961% | 76.4% | 66.1% | +10.3 pp | -0.011 | PASS | PASS | PASS | 12100 | DEGRADED |
| trend_down | VR8 | HIGH | 1.08756 | 1.05080 | 57.7% | 68.0% | -10.3 pp | -0.147 | PASS | PASS | PASS | 12100 | DEGRADED |
| trend_down | VR16 | HIGH | 1.10918 | 1.03110 | 51.7% | 66.2% | -14.5 pp | -0.244 | PASS | PASS | PASS | 12100 | DEGRADED |
| whipsaw | ATR% | HIGH | 0.25978% | 0.26705% | 77.2% | 83.4% | -6.2 pp | +0.067 | PASS | PASS | PASS | 12100 | PASS |
| whipsaw | Drift | NORMAL | 0.03289% | 0.03228% | 43.6% | 46.0% | -2.4 pp | -0.001 | PASS | PASS | PASS | 12100 | PASS |
| whipsaw | VR8 | LOW | 0.83741 | 0.84084 | 68.6% | 66.5% | +2.1 pp | +0.014 | PASS | PASS | PASS | 12100 | PASS |
| whipsaw | VR16 | LOW | 0.78937 | 0.81574 | 63.8% | 62.4% | +1.4 pp | +0.082 | PASS | PASS | PASS | 12100 | PASS |
| expansion_up | ATR% | HIGH | 0.25978% | 0.26491% | 76.5% | 83.4% | -6.9 pp | +0.048 | PASS | PASS | PASS | 12100 | PASS |
| expansion_up | Drift | HIGH | 0.26844% | 0.26633% | 73.8% | 68.4% | +5.4 pp | -0.005 | PASS | PASS | PASS | 12100 | PASS |
| expansion_up | VR8 | HIGH | 1.08756 | 1.06601 | 61.6% | 68.0% | -6.3 pp | -0.086 | PASS | PASS | PASS | 12100 | PASS |
| expansion_up | VR16 | HIGH | 1.10918 | 1.05517 | 56.5% | 66.2% | -9.7 pp | -0.169 | PASS | PASS | PASS | 12100 | PASS |
| expansion_down | ATR% | HIGH | 0.25978% | 0.26565% | 78.4% | 83.4% | -5.0 pp | +0.054 | PASS | PASS | PASS | 12100 | PASS |
| expansion_down | Drift | LOW | -0.16482% | -0.17660% | 70.9% | 66.1% | +4.8 pp | -0.027 | PASS | PASS | PASS | 12100 | PASS |
| expansion_down | VR8 | HIGH | 1.08756 | 1.06141 | 60.0% | 68.0% | -7.9 pp | -0.105 | PASS | PASS | PASS | 12100 | PASS |
| expansion_down | VR16 | HIGH | 1.10918 | 1.04366 | 54.2% | 66.2% | -12.0 pp | -0.205 | PASS | PASS | PASS | 12100 | PASS |

**NULL pooled C3 ordering**

| Statistic | LOW pooled median | NORMAL pooled median | HIGH pooled median | Ordering |
| --- | ---: | ---: | ---: | --- |
| ATR% | 0.158732% | 0.186923% | 0.265812% | PASS |
| Drift | -0.172364% | 0.031547% | 0.259950% | PASS |
| VR8 | 0.838561 | 0.952165 | 1.058744 | PASS |
| VR16 | 0.814546 | 0.931313 | 1.041932 | PASS |

### NULL per-regime pass table and vol-free pass column

| Regime | ATR% C1-C3 | Drift C1-C3 | VR8 C1-C3 | VR16 C1-C3 | Full Regime Status | Vol-Free Pass (Drift+VRs only) |
| --- | --- | --- | --- | --- | --- | --- |
| quiet_range | FAIL (TOO NOISY/PASS) | FAIL (TOO CLEAN/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | DEGRADED | FAIL |
| normal_chop | FAIL (TOO NOISY/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | DEGRADED | PASS |
| trend_up | FAIL (TOO NOISY/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | DEGRADED | PASS |
| trend_down | FAIL (TOO NOISY/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | DEGRADED | PASS |
| whipsaw | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS | PASS |
| expansion_up | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS | PASS |
| expansion_down | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS (PASS/PASS) | PASS | PASS |

## Separability Matrix and AUC (DESIGN only)

| Regime pair | ATR% 48 bars | Drift z 48 returns | VR8 48 returns | VR16 48 returns | Best single feature | Best oriented AUC | Samples A / B | Status |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |
| quiet_range vs normal_chop | 0.5791 | 0.5059 | 0.5682 | 0.5513 | ATR% 48 bars | 0.5791 | 57719 / 59963 | INSEPARABLE |
| quiet_range vs trend_up | 0.6055 | 0.6345 | 0.6292 | 0.5898 | Drift z 48 returns | 0.6345 | 57719 / 60563 | SEPARABLE |
| quiet_range vs trend_down | 0.5791 | 0.6346 | 0.6287 | 0.5868 | Drift z 48 returns | 0.6346 | 57719 / 57705 | SEPARABLE |
| quiet_range vs whipsaw | 0.7397 | 0.5141 | 0.5052 | 0.5044 | ATR% 48 bars | 0.7397 | 57719 / 71730 | SEPARABLE |
| quiet_range vs expansion_up | 0.7374 | 0.5945 | 0.6308 | 0.5931 | ATR% 48 bars | 0.7374 | 57719 / 58010 | SEPARABLE |
| quiet_range vs expansion_down | 0.7301 | 0.6049 | 0.6326 | 0.5946 | ATR% 48 bars | 0.7301 | 57719 / 56792 | SEPARABLE |
| normal_chop vs trend_up | 0.5245 | 0.6361 | 0.5625 | 0.5391 | Drift z 48 returns | 0.6361 | 59963 / 60563 | SEPARABLE |
| normal_chop vs trend_down | 0.5030 | 0.6259 | 0.5616 | 0.5361 | Drift z 48 returns | 0.6259 | 59963 / 57705 | SEPARABLE |
| normal_chop vs whipsaw | 0.6679 | 0.5077 | 0.5732 | 0.5556 | ATR% 48 bars | 0.6679 | 59963 / 71730 | SEPARABLE |
| normal_chop vs expansion_up | 0.6637 | 0.5972 | 0.5639 | 0.5423 | ATR% 48 bars | 0.6637 | 59963 / 58010 | SEPARABLE |
| normal_chop vs expansion_down | 0.6557 | 0.5969 | 0.5653 | 0.5436 | ATR% 48 bars | 0.6557 | 59963 / 56792 | SEPARABLE |
| trend_up vs trend_down | 0.5281 | 0.7385 | 0.5012 | 0.5031 | Drift z 48 returns | 0.7385 | 60563 / 57705 | SEPARABLE |
| trend_up vs whipsaw | 0.6479 | 0.6467 | 0.6340 | 0.5939 | ATR% 48 bars | 0.6479 | 60563 / 71730 | SEPARABLE |
| trend_up vs expansion_up | 0.6434 | 0.5398 | 0.5013 | 0.5030 | ATR% 48 bars | 0.6434 | 60563 / 58010 | SEPARABLE |
| trend_up vs expansion_down | 0.6350 | 0.7142 | 0.5023 | 0.5041 | Drift z 48 returns | 0.7142 | 60563 / 56792 | SEPARABLE |
| trend_down vs whipsaw | 0.6751 | 0.6226 | 0.6334 | 0.5910 | ATR% 48 bars | 0.6751 | 57705 / 71730 | SEPARABLE |
| trend_down vs expansion_up | 0.6711 | 0.7065 | 0.5024 | 0.5062 | Drift z 48 returns | 0.7065 | 57705 / 58010 | SEPARABLE |
| trend_down vs expansion_down | 0.6629 | 0.5282 | 0.5035 | 0.5072 | ATR% 48 bars | 0.6629 | 57705 / 56792 | SEPARABLE |
| whipsaw vs expansion_up | 0.5079 | 0.6071 | 0.6355 | 0.5972 | VR8 48 returns | 0.6355 | 71730 / 58010 | SEPARABLE |
| whipsaw vs expansion_down | 0.5168 | 0.5927 | 0.6374 | 0.5987 | VR8 48 returns | 0.6374 | 71730 / 56792 | SEPARABLE |
| expansion_up vs expansion_down | 0.5090 | 0.6808 | 0.5010 | 0.5010 | Drift z 48 returns | 0.6808 | 58010 / 56792 | SEPARABLE |

**Requested hard pairs**

| Pair | Best feature | Best oriented AUC | Status |
| --- | --- | ---: | --- |
| quiet_range vs normal_chop | ATR% 48 bars | 0.5791 | INSEPARABLE |
| normal_chop vs trend_up | Drift z 48 returns | 0.6361 | SEPARABLE |
| normal_chop vs trend_down | Drift z 48 returns | 0.6259 | SEPARABLE |
| trend_up vs expansion_up | ATR% 48 bars | 0.6434 | SEPARABLE |

**INSEPARABLE pairs (best single-feature oriented AUC <0.60):** quiet_range vs normal_chop.

## Extrapolation Coverage

### DESIGN EXTRAPOLATION coverage

| Regime | Bars | Bars flagged | Flagged share |
| --- | ---: | ---: | ---: |
| quiet_range | 245665 | 0 | 0.0% |
| normal_chop | 252532 | 0 | 0.0% |
| trend_up | 257056 | 0 | 0.0% |
| trend_down | 245439 | 0 | 0.0% |
| whipsaw | 303590 | 0 | 0.0% |
| expansion_up | 247165 | 0 | 0.0% |
| expansion_down | 240809 | 0 | 0.0% |

### NULL EXTRAPOLATION coverage

| Regime | Bars | Bars flagged | Flagged share |
| --- | ---: | ---: | ---: |
| quiet_range | 642818 | 0 | 0.0% |
| normal_chop | 642094 | 0 | 0.0% |
| trend_up | 642375 | 0 | 0.0% |
| trend_down | 642446 | 0 | 0.0% |
| whipsaw | 643002 | 0 | 0.0% |
| expansion_up | 642781 | 0 | 0.0% |
| expansion_down | 641944 | 0 | 0.0% |

## Overlay Coverage

| Overlay | DESIGN episodes | Overlay weekdays | Weekday coverage by base regime |
| --- | ---: | ---: | --- |
| news_storm | 211 | 720 | quiet_range: 83; normal_chop: 96; trend_up: 110; trend_down: 95; whipsaw: 106; expansion_up: 108; expansion_down: 122 |
| gap_shocks | 238 | 793 | quiet_range: 126; normal_chop: 115; trend_up: 85; trend_down: 128; whipsaw: 151; expansion_up: 101; expansion_down: 87 |

## Determinism Rebuild Audit (20 paths)

| Cohort | Seed | Canonical Match | Compressed Match |
| --- | ---: | --- | --- |
| NULL/expansion_down | 20622 | PASS | PASS |
| DESIGN | 8008 | PASS | PASS |
| NULL/expansion_up | 20569 | PASS | PASS |
| NULL/trend_down | 20323 | PASS | PASS |
| NULL/quiet_range | 20060 | PASS | PASS |
| NULL/normal_chop | 20123 | PASS | PASS |
| NULL/trend_down | 20346 | PASS | PASS |
| NULL/expansion_down | 20636 | PASS | PASS |
| DESIGN | 8190 | PASS | PASS |
| NULL/trend_up | 20225 | PASS | PASS |
| NULL/expansion_up | 20588 | PASS | PASS |
| NULL/expansion_down | 20665 | PASS | PASS |
| NULL/quiet_range | 20002 | PASS | PASS |
| DESIGN | 8137 | PASS | PASS |
| DESIGN | 8054 | PASS | PASS |
| NULL/normal_chop | 20177 | PASS | PASS |
| NULL/expansion_down | 20662 | PASS | PASS |
| NULL/trend_down | 20310 | PASS | PASS |
| DESIGN | 8109 | PASS | PASS |
| NULL/trend_up | 20291 | PASS | PASS |

## Engine CSV Parser Round-Trip (Seed 8001)

Rows parsed: 11535; CSV SHA-256: `f7f0cc0a76fb08e1b65199ff3aef778b3c79bda77885ef9d5520dca63a060cb8`. Round-trip match: PASS.
