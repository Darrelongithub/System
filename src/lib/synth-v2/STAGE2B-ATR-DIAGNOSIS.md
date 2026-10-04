# Stage 2b ATR% calibration diagnosis

**Purpose:** exploratory, report-only follow-up to the incomplete preregistered W=20 study. This note uses the published DESIGN/NULL summary and frozen market-generation code semantics only. It does not use LOCKED TEST data, detector output, strategies, trades, R, or P&L. It does not change the spec, settings, seeds, code, or generated paths.

## Finding

The dominant ATR% failure is a scale/estimand mismatch between the Stage 2b target and the existing Stage 1b `volatilityLevel` control. Stage 2b assigns W=20 realized Wilder ATR% quantiles directly to `volatilityLevel`, but Stage 1b defines that control as the daily standard deviation of 30-minute close/open log returns. The generator uses the dial as an innovation scale; it is not a direct ATR% target. OHLC bar range is then reconstructed using sampled body-share/wick-shape values, which also affects realized ATR.

This is consistent with the observed results: the pure-regime NULL median ATR% is about **2.517 times** its planted setting in all seven regimes (range 2.515–2.520). The DESIGN ratio is also elevated, 2.332–2.549 (median 2.381), with additional variation expected from segment blends and multiregime paths. That near-constant NULL multiplier points to a systematic scale mapping issue rather than a single regime or seed anomaly.

## Market-statistic evidence

Values below are percentages; ratios use the underlying unrounded report values. The planted value is the Stage 2b W=20 ATR% p17/p50/p83 assigned as the volatility dial.

| Regime | Planted ATR% | DESIGN realized median ATR% | DESIGN / planted | NULL realized median ATR% | NULL / planted |
| --- | ---: | ---: | ---: | ---: | ---: |
| quiet_range | 0.15166% | 0.37374% | 2.464 | 0.38214% | 2.520 |
| normal_chop | 0.18158% | 0.46283% | 2.549 | 0.45659% | 2.515 |
| trend_up | 0.18158% | 0.43180% | 2.378 | 0.45740% | 2.519 |
| trend_down | 0.18158% | 0.44681% | 2.461 | 0.45691% | 2.516 |
| whipsaw | 0.25978% | 0.61853% | 2.381 | 0.65439% | 2.519 |
| expansion_up | 0.25978% | 0.60586% | 2.332 | 0.65385% | 2.517 |
| expansion_down | 0.25978% | 0.61089% | 2.352 | 0.65383% | 2.517 |

The W=20 real ATR% p17/p50/p83 targets are 0.15166% / 0.18158% / 0.25978%. For comparison, the frozen Stage 1b profile's daily-volatility p10/p50/p90 are 0.0007983 / 0.0012300 / 0.0021756 as decimal returns. These bands describe different quantities and use different window constructions; they should not be treated as interchangeable control values.

The registered checks reflect the same pattern: every DESIGN and NULL regime has ATR% C2 error well above +0.25, and ATR% C1 is TOO NOISY for LOW/NORMAL or TOO CLEAN for HIGH. Yet C3 ordering passes for ATR% in both cohorts. Thus the relative low-to-high ordering is retained while the absolute level and tercile occupancy are miscalibrated. The reported ATR% real ceilings are not THIN (LOW 82.7%, NORMAL 66.2%, HIGH 83.4%).

## Code-level explanation

1. `stage2b-regimes.ts:28–40` maps W=20 `distributions.atrPercent` p17/p50/p83 directly into `dials.volatilityLevel`.
2. `calibrate.ts:420–429` defines the Stage 1b `volatilityLevel` dial from daily standard deviations of 30-minute close/open log returns (`sourceMetrics.dailyVolatility`). `generate.ts:215–237, 279–280` uses the dial-derived `barDailyVolatility` to scale standardized return innovations with seasonality and the fast-volatility multiplier.
3. The candle-shape stage does not make `volatilityLevel` an ATR target. For nonzero bodies, `generate.ts:283–299` sets `barRange` from `body / shapeBodyShare` (bounded below by the body), then apportions the remaining range to upper/lower wicks. `calibrate.ts:240–275` derives those shapes from source candles; the frozen profile's median body share is about 0.482, so body-to-range conversion is material. Gaps and true-range terms further affect ATR.
4. Stage 2b uses the same Wilder ATR(14)/prior-close calculation for real and synthetic W=20 windows (`stage2b-validation.ts:83–96, 182–189, 316–347`). The primary issue is therefore the mapping from the dial to that measured statistic, not an obvious difference in the ATR formula.

The EXTRAPOLATION result of 0% does not contradict the ATR mismatch: the frozen flag tests whether the *dial values* cross the real p5–p95 bounds. It does not flag a path merely because its realized ATR% is high relative to the planted target.

## Recommendation and guardrails

Keep the current cohort results **DEGRADED and unrepaired**. Do not divide current settings by the observed ~2.517 NULL multiplier, retune the completed seeds, replace paths, or reinterpret these outputs as a successful ATR% calibration. The multiplier is descriptive, not a validated correction.

If the required estimand remains realized W=20 ATR%, a follow-up should preregister a market-statistics-only mapping from the Stage 1b volatility dial to achieved W=20 ATR% before its independent validation cohort. Fit and validate that mapping on disjoint source periods or otherwise disjoint, preregistered data; keep the present DESIGN/NULL outcomes as discovery evidence only. Freeze the mapping, code, thresholds, and seeds before generating that new cohort. This can remain a Stage 2b wrapper/calibration change; no Stage 1b modification is proposed here.

No new synthetic paths were generated for this diagnosis, and the incomplete LOCKED TEST set was not opened, decoded, or analyzed.
