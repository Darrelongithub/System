# Synthetic XAUUSD 30m market generator

This module produces deterministic OHLC-only XAUUSD paths for market-structure and regime-detector validation. It does **not** change analyzer behavior, strategies, parameters, exits, or research artifacts. Calibration reads timestamps and OHLC only; it never reads strategy trades, R, P&L, or win rate.

## Current calibration and validation status

The bundled profile now uses the archive `XAUUSD_30min_2020-01-24_to_2026-10-01.csv` from `main` at commit `689fcfc5310c30a04d1261eedb00b4b58af0ca30` (raw SHA-256 `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`). The 24 MB source archive is not copied into this branch; the profile embeds a price-free donor library and full-sample market-statistics summaries.

The archive contains 79,586 valid OHLC bars from **2020-01-24 05:00:00 to 2026-10-01 15:00:00**. Parsing found no invalid OHLC, duplicate timestamps, non-increasing pairs, or file seams. It does contain missing calendar dates and long timestamp intervals; these are reported, not filled. See [`REPORT.md`](./REPORT.md) for the gap, timezone, ATR, and schedule findings.

**D1 failed.** The registered archive-coverage and profile-source-hash checks passed, but only **26 of 32** market-statistic checks were within their fixed intervals. EAT hourly cells 04:00, 08:00, 09:00, 10:00, 15:00, and 19:00 failed. No threshold was loosened. D2–D4 and D7 were not run; no strategy results, engine comparisons, or scenario-seed grids were computed. The generator is not realism-certified by this D1 result.

## Product mode

The app exposes **Map generator** at `/map-generator`, linked from the primary Home navigation. It provides seeded scenario and dial controls, a price/regime-map preview, and separate downloads for engine-ready OHLC CSV and the aligned ground-truth label JSON. It does not run a strategy or the analyzer.

## Public API

```ts
import {
  calibrate,
  generateSynthetic,
  runThroughEngine,
  toCsv,
  type Candle,
  type CalibrationProfile,
  type SynthConfig,
} from "./src/lib/synth/index.ts";

const path = generateSynthetic({ scenario: "whipsaw" }, 20261001);
const csv = toCsv(path.candles);
// runThroughEngine() is separate and intentionally not part of D1/D7 checks.
```

`generateSynthetic(config, seed)` uses the static `DEFAULT_PROFILE`; an optional third `CalibrationProfile` argument supplies another profile without file I/O. Results contain `{ candles, labels, meta }`. Labels include regime IDs, active numeric dial values, event/gap flags, and `EXTRAPOLATION` flags. Identical config, seed, and profile produce byte-identical output.

`calibrate(realCandles)` validates caller order and OHLC geometry without sorting, deduplicating, filling, or repairing. It recomputes Wilder ATR(14) from OHLC and ignores any supplied `atr_30m` column. Descriptive statistics use all 79,586 valid source candles. The compact embedded donor library contains 104 complete weeks matching the primary observed week template (23,920 standardized bars); weeks with unclassified closures or incompatible slot patterns are not donor blocks.

## Calendar and gap interpretation

- The primary exact weekly template has **230 bars**: 46 bars on each Monday–Friday, 01:00–23:30 EAT, with no Saturday tail. This is the most frequent exact weekly slot signature; generation follows it.
- The profile records up to five recurring exact weekly slot templates. A distinct 242-bar template (48 bars Monday–Friday plus two Saturday bars) occurs in 47 observed weeks from 2025-04-28 through 2026-09-21. Other repeated templates include a seasonal shifted schedule. The generator does not blend these variants; the D1 comparison uses the primary template against all source bars.
- A non-weekend gap of 60–240 minutes is tagged `scheduled-session-break` only when the exact EAT weekday/time pair and duration recur at least 40 times. The archive contains 1,016 such repeated 90-minute gaps. The remaining 117 long intervals remain `unclassified-closure`; 339 are classified as weekend gaps. These labels are interpretations of timestamp recurrence, not verified exchange notices.
- No bar was inserted or shifted. The source row strings have no timezone offset; section headers say `(UTC)`, while metadata `data_age` says `EAT`. Per the task convention, calibration interprets unzoned row values as EAT+03:00 and applies no automatic timestamp shift. This source-label conflict remains a caveat.

## Generation method

1. **Calendar-preserving weekly bootstrap.** Compatible empirical blocks preserve the primary profile's EAT weekday/half-hour slots, return clustering, wick shares, candle range, and ordinary open gaps. Sunday remains closed. The current primary template is Monday–Friday only.
2. **Volatility.** `low / normal / high` use observed Wilder ATR(14)/close p10 / p50 / p90. A calibrated mean true-range/Wilder-ATR normalizer scales selected donor bars. `stable`, `expanding`, and `contracting` control the path shape; price level remains a separate USD/oz anchor.
3. **Trendiness.** `mean-reverting`, `random`, and `trending` target observed p10/p50/p90 summaries of rolling 240-bar variance-ratio-8, variance-ratio-16, and lag-1 return-autocorrelation. The generator selects among nearby empirical weeks in joint metric space; it does not add an AR overlay or tune against strategies.
4. **Drift.** `down / flat / up` map to observed p10/p50/p90 of rolling 60-calendar-day log return. `flat` means the observed median, not necessarily zero. Numeric values use that same 60-day log-return unit. Values outside the observed min/max are marked `EXTRAPOLATION`.
5. **Gaps and news.** Normal gaps use donor bars and the observed calendar. Heavy gaps add top-quartile real intraday open-gap samples at the profile's p90 weekly rate. Scheduled-news candidate slots exceed the median slot mean absolute return/ATR by a fixed 25%. Unscheduled shocks come from observed moves above 4 prior Wilder ATR.
6. **Follow-through and regimes.** Mixed shock follow-through uses the empirical tail-bar continuation share. Sequence presets use seeded 20–60 trading-day windows (the short reversal segment is capped at 30 days) and 48–200-bar transitions. These are scenario definitions, not inferred real-regime labels.
7. **Determinism and exports.** A local 32-bit seeded PRNG is used; wall-clock time, network calls, and ambient randomness are not used. CSV values retain round-trip-safe JavaScript precision. Synthetic CSV timestamps are unzoned EAT wall-clock text and omit `atr_30m`, allowing the analyzer's Wilder fallback if a separate caller later chooses to analyze them.

## Dial mapping

| Dial                 | Mapping                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Volatility           | Wilder ATR(14)/close p10 / p50 / p90; `p5` is the observed p5. Numeric values use ATR/price.                           |
| Volatility shape     | Stable at target; expanding/contracting blend toward observed p10/p90 endpoints.                                       |
| Drift                | Rolling 60-calendar-day log-return p10 / p50 / p90; `flat` is p50. Numeric values use the same units.                  |
| Trendiness           | Nearest empirical weekly block to joint VR(8), VR(16), and lag-1 autocorrelation targets.                              |
| Gaps                 | Normal uses empirical block/calendar gaps; heavy adds top-quartile intraday gaps at the data-derived weekly frequency. |
| News                 | Observed scheduled-slot and >4-ATR tail rates; light/normal/heavy use empirical p10 / observed / p90 rates.            |
| Shock follow-through | `continue`, `revert`, or `mixed`; mixed uses observed post-tail direction proportions.                                 |
| Price level          | Positive USD/oz anchor; defaults to the profile median close.                                                          |
| Spread multiplier    | Defaults to 1; metadata-only **ASSUMPTION** because no historical spread series is present. It does not alter OHLC.    |

Any active numeric dial or starting price outside the profile's observed range is explicitly marked `EXTRAPOLATION` in labels and counted in `meta.extrapolationBars`. The p5 volatility preset is itself an observed quantile and is not automatically an extrapolation.

## Fixed scenario library

Single conditions: `quiet_range`, `normal_chop`, `slow_grind_up`, `strong_uptrend`, `slow_grind_down`, `strong_downtrend`, `whipsaw`, `melt_up`, `crash`, `news_storm`, `gap_shocks`, `fake_outs`, `dead_zone`.

Sequences: `calm_storm_calm`, `top_and_reversal`, `range_breakout`, `bull_with_crash`.

## Files and reproducibility

- `profile.json` and `profile-default.ts` — full-sample summaries plus a compact self-contained donor library and its runtime embedding.
- `validation-report.json` and `REPORT.md` — the D1-only result, fixed intervals, source hashes, input-quality findings, and stop reason.
- `ASSUMPTIONS.md` — data and methodological assumptions; `INTEGRATION.md` — the analyzer boundary and app wiring.
- `scripts/synth-inspect.ts` — read-only CSV quality/seam report; `scripts/synth-calibrate.ts` — local-only calibration; `scripts/synth-validate.ts` — one D1 check only.
- `src/pages/MapGenerator.tsx`, `src/routes/map-generator.tsx`, `src/pages/Home.tsx`, and `src/routeTree.gen.ts` — user-facing mode and primary navigation.

The archive is available on `main`; to materialize it without switching branches:

```bash
git show main:XAUUSD_30min_2020-01-24_to_2026-10-01.csv > /tmp/XAUUSD_30min_2020-01-24_to_2026-10-01.csv
node --experimental-strip-types --import ./tests/register.mjs scripts/synth-inspect.ts /tmp/XAUUSD_30min_2020-01-24_to_2026-10-01.csv
node --experimental-strip-types --import ./tests/register.mjs scripts/synth-calibrate.ts /tmp/XAUUSD_30min_2020-01-24_to_2026-10-01.csv
node --experimental-strip-types --import ./tests/register.mjs scripts/synth-validate.ts /tmp/XAUUSD_30min_2020-01-24_to_2026-10-01.csv
```

Calibration does not fetch data. `synth-validate.ts` stops at D1; if a gate fails, do not start D2–D4, D7, an engine comparison, or a scenario-seed grid. The raw archive is not included in this branch.
