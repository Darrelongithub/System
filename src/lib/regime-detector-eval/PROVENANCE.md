# Regime detector evaluation — Part 0 provenance

This is a provenance record only; no detector outputs or forward outcomes were computed to prepare it. Part 1 is pre-registered separately in `SPEC-RD.md` and its SHA-256 is recorded in `SPEC-RD.sha256`.

## Source and freeze

- Evaluation input: `XAUUSD_30min_2020-01-24_to_2026-10-01.csv`.
- Expected SHA-256: `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`.
- Observed SHA-256 before analysis: **the same** (`cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`).
- Detector source tree SHA-256: **`05134d0d8201dfb368579bcf373fc52a406c1c4d49b3576ad1bc8cbc5e0993f1`**.
- Default resolved-options SHA-256: **`7504bf25fb8875ee6e5c2eb211ad50581b00f2edd7052a943ae8fc7fefa452fe`**.
- The detector snapshot is stored unchanged at `src/lib/regime-detector-eval/frozen-detector/`; a byte-for-byte comparison to `src/lib/regime-detector/` passed before analysis. The compact runtime-resolved defaults are stored in `frozen-default-config.json`.
- Hash convention for the detector tree: SHA-256 of UTF-8 compact, key-sorted JSON mapping every sorted relative `.ts` path to that file's SHA-256. This avoids tar metadata and is reproducible. The options hash is SHA-256 of the exact compact UTF-8 JSON bytes written by `JSON.stringify(resolveRegimeDetectorConfig({}))`, with no trailing newline.

### Version-control provenance and threshold-tuning evidence

At the start of this evaluation, `src/lib/regime-detector/` and `docs/MARKET-REGIME-DETECTOR.md` were untracked files in the worktree and absent from `HEAD` (`afe389984a7fe04043d88998e1c37a2bf6f60b62`). `git log --all -- <path>` returned no commits for either path. Therefore there is no available detector/guide commit history to inspect. The guide calls the settings “conservative, configurable thresholds” but provides no source dataset, calibration procedure, or tuning period. The detector defaults contain no gold-data citation. No detector-specific gold-tuning script or result was found in the inspected detector/guide materials.

**Conclusion:** documentary evidence of tuning against gold was not found, but it is **not possible to establish that the thresholds were never chosen or adjusted after viewing gold data**, nor to identify a period if that occurred. Treat threshold-tuning provenance as unknown, not as proof of independence. The only input hash verified for this evaluation is the full 2020-01-24 through 2026-10-01 archive above.

## Timeframe assumption

The detector has no fixed calendar-timeframe assumption: its windows and hysteresis are counts of bars. The guide explicitly says volatility estimates are per bar and not annualized, allowing daily and intraday bars (guide lines 70–75); `RegimeBar` accepts timestamps but no interval/frequency field (`types.ts` lines 14–23). This evaluation supplies the provided 30-minute bars. Thus “240 bars” is a bar-count window, not a fixed number of calendar hours; on this source it nominally corresponds to five 48-bar weekdays.

## Configured lookback windows

All are bar counts. Defaults and source lines are in `src/lib/regime-detector/config.ts`:

| Setting | Default | Source |
|---|---:|---|
| ADX / DI periods | 14, 20 | lines 9–10 |
| ATR periods | 14, 20 | line 11 |
| SMA / EMA periods | 20, 50, 100, 200 | line 12 |
| Efficiency-ratio periods | 10, 14, 20, 30 | line 13 |
| Close-regression periods | 20, 50 | line 14 |
| ADX-slope window | 5 | line 15 |
| ATR reference baseline | 50 | line 16 |
| Realized-volatility periods | 10, 20, 50 | line 17 |
| Parkinson / Garman–Klass estimator | 20 | line 18 |
| Bollinger width | 20 | line 19 |
| Keltner width | 20 | line 20 |
| True-range percentile / reference window | 100 | line 21 |
| Volatility-of-volatility | 20 | line 22 |
| Hurst estimate | 50 | line 23 |
| Return autocorrelation | 50 | line 24 |
| Variance-ratio window | 50 | line 25 |
| Variance-ratio horizon | 5 | line 26 |
| Candle overlap | 20 | line 27 |
| Volume statistics | 20 | line 28 |
| Return-distribution moments / quantiles | 50 | line 29 |
| Candle-range percentile | 50 | line 30 |
| Swing pivot strength (bars on each side) | 3 | line 31 |
| Swing-structure count window | 50 | line 32 |

## Configurable classifier thresholds

Values are the frozen defaults in `src/lib/regime-detector/config.ts` lines 35–51:

| Threshold | Default | Source |
|---|---:|---|
| `trendAdxMin` | 20 | line 36 |
| `trendAdxStrong` | 35 | line 37 |
| `trendEfficiencyMin` | 0.28 | line 38 |
| `trendEfficiencyStrong` | 0.60 | line 39 |
| `trendDirectionalMin` | 0.58 | line 40 |
| `trendSlopeAtrPerBar` | 0.04 | line 41 |
| `rangeAdxMax` | 18 | line 42 |
| `rangeEfficiencyMax` | 0.25 | line 43 |
| `highVolatilityPercentile` | 0.85 | line 44 |
| `highVolatilityAtrRatio` | 1.35 | line 45 |
| `highVolatilityRangeRatio` | 1.20 | line 46 |
| `compressionPercentile` | 0.20 | line 47 |
| `compressionRangeRatio` | 0.80 | line 48 |
| `compressionAtrRatio` | 0.80 | line 49 |
| `minimumConfidence` | 0.50 | line 50 |

Other resolved defaults: every feature group enabled (`config.ts` lines 53–61); hysteresis 3 bars, evaluation frequency 1 bar, top 3 drivers (`config.ts` lines 212–214); ATR baseline method `sma` (`config.ts` line 220).

### Additional fixed classifier cutoffs and gates

These are literals in the frozen classifier, not separately configurable defaults:

- Preferred periods are ADX 14, efficiency 20, regression 20 (`classifier.ts` lines 154–156; with frozen defaults these periods exist).
- Trend confirmations use absolute MA alignment ≥0.30 and normalized slope ≥0.35 × `trendSlopeAtrPerBar`; a trend needs at least two available trend observations, two directional signals, two confirmations, and directional confidence ≥ `trendDirectionalMin` (`classifier.ts` lines 214–239).
- Trend score weights: ADX 0.35, ER 0.30, MA alignment 0.20, slope 0.15; direction weights: DI 0.35, MA alignment 0.30, slope sign 0.25, swing structure 0.10; trend/direction blend 0.55/0.45 (`classifier.ts` lines 181–212).
- Range score weights are low ADX 0.35, low ER 0.35, flat MA alignment 0.15, candle overlap 0.15; it needs at least two available observations, at least one of ADX/ER, both available core measures below their range cutoffs, and score ≥ `minimumConfidence` (`classifier.ts` lines 261–274).
- High volatility is signaled by (TR percentile ≥ its configured threshold **and** TR/baseline ≥ its configured ratio) **or** ATR/baseline ≥ its configured ratio (`classifier.ts` lines 281–307); the score is then checked against `minimumConfidence` at lines 556–562.
- Compression requires at least two of three signals: low TR percentile plus low TR/baseline, low candle-range percentile plus low range/baseline, or low ATR/baseline (`classifier.ts` lines 309–353).
- The guide says high-volatility/compression are checked before ordinary directional trend (`MARKET-REGIME-DETECTOR.md` lines 87–94); classifier priority is in `classifier.ts` lines 548–586.

## Required pre-analysis checks

Before any evaluation computation, `npm ci` completed, `npx tsc --noEmit` passed, and the full `npm test` suite passed (**246 passed, 0 failed**). These are software checks only; no gold-data labels or forward statistics had been computed when this provenance record was prepared.
