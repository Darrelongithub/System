# Assumptions and items not verified

Calibration uses timestamps and OHLC only. It never reads strategy trades, R, P&L, win rate, exits, or analyzer-derived strategy outputs. No source bars are sorted, deduplicated, filled, time-shifted, or repaired.

## Source and calendar findings

1. **Source archive.** The profile uses `XAUUSD_30min_2020-01-24_to_2026-10-01.csv` from `main` at commit `689fcfc5310c30a04d1261eedb00b4b58af0ca30`. It contains 79,586 valid OHLC rows from 2020-01-24 05:00 through 2026-10-01 15:00; the raw file SHA-256 is `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`. The source file is not copied to this branch.
2. **Input integrity.** The inspector found zero invalid rows, duplicate timestamps, non-increasing timestamp pairs, or inter-file seams (one input file). There are 575 calendar dates without rows in the observed span. Missing dates and bars remain missing; they are not synthesized during calibration.
3. **Timezone evidence and rule.** Row timestamp strings have no offset. Source section markers say `(UTC)`, while the metadata `data_age` says `EAT`. The task convention takes precedence: unzoned values are treated as EAT wall-clock (+03:00). No `+3h` rewrite or DST conversion is applied to the row strings. The disagreement is unresolved and makes hour/session interpretations provisional.
4. **Reliability column.** The CSV contains 11,054 `is_reliable=false` rows and 68,532 `true` rows. All 79,586 rows have valid OHLC geometry. Calibration intentionally reads only timestamps and OHLC and includes both reliability classes; it does not use the source's reliability classification to discard bars.
5. **ATR methodology.** Source metadata describes `atr_30m` as a simple rolling mean of true range over 14 reliable candles, with unreliable rows carrying forward the last reliable ATR. Calibration ignores that field and recomputes Wilder ATR(14) from every OHLC row: first value is the SMA of the first 14 true ranges, followed by Wilder smoothing. Synthetic CSV omits `atr_30m`; if a separate consumer later analyzes it, the engine uses its Wilder fallback.
6. **Observed long gaps.** There are 1,472 intervals longer than 30 minutes: 1,016 recurring session-break patterns, 339 weekend closures, and 117 unclassified closures. The recurring patterns are exact 90-minute gaps at two daily time windows, with weekday/time variants. A non-weekend gap from 60 through 240 minutes is classified as a scheduled session break only when that exact EAT weekday/from-time/to-time/duration signature appears at least 40 times. This is a recurring-pattern interpretation, not an exchange-calendar assertion.
7. **Raw gap handling.** `calendarGapKind` records weekend, scheduled-session-break, or unclassified-closure. The timestamp sequence and OHLC values remain unchanged. The 117 unclassified gaps are not labeled holidays or feed outages without external evidence; gaps that do not match the recurring signature remain unclassified.
8. **Observed schedule shifts.** The most frequent exact complete-week template has 230 bars (46 per weekday, Monday–Friday 01:00–23:30 EAT; no Saturday). A 242-bar template (48 per weekday plus two Saturday bars) occurs in 47 weeks from 2025-04-28 through 2026-09-21. Another 230-bar template occurs in 43 weeks from 2020-11-02 through 2025-03-03 with different early-day slots. The profile records up to five exact weekly slot variants. The generator uses only the primary 230-bar template; the other patterns are disclosed, not silently merged into it.
9. **Donor selection.** 104 complete, exact primary-template weeks are retained as the runtime donor library (23,920 standardized bars). Descriptive statistics and quantiles use all valid source candles; the donor library excludes weeks whose slot layout differs from the primary template or that contain an unclassified closure. The runtime profile has no dependency on the raw CSV.
10. **Price-data provenance.** The archive is XAUUSD-labelled, but provider, venue, quote construction, and exchange-session authority were not independently verified. Price minimum/maximum are 1,451.43 / 5,597.23. The source metadata's `data_age` matches its last bar.

## Statistical and generator definitions

11. **Wilder ATR(14).** True range is `max(high-low, abs(high-priorClose), abs(low-priorClose))`; first ATR is the SMA of 14 true ranges, followed by Wilder smoothing. ATR% is ATR / close.
12. **60-day drift.** Drift is a rolling 60-calendar-day log return. The comparison close is the latest observed close at or before the exact cutoff; no bar is filled.
13. **Trend windows.** Variance ratios and lag-1 autocorrelation use rolling 240-bar windows advanced by 48 bars. Variance ratios use overlapping q-bar returns and sample variance. These are fixed statistical definitions, not values chosen from strategy outcomes.
14. **Standardized return and tails.** Return/ATR is the close-to-close log return divided by prior Wilder ATR / prior close. An unscheduled tail bar is an absolute close-to-close move greater than 4 prior Wilder ATR; its frequency is per valid return.
15. **Scheduled windows.** A slot is a candidate when its mean absolute return/ATR exceeds the median slot mean by a fixed 25%. This is a time-of-day statistic, not an independently sourced economic-news calendar.
16. **Heavy gap frequency.** Heavy mode samples added gap size from the top quartile of observed intraday open/prior-close gap magnitudes. Its event frequency is the p90 weekly count of source intraday gaps above the source p90 magnitude. The current profile stores `heavyGapFrequencyPerWeek = 32.1`; it is a descriptive market-statistic input, not a strategy-tuned parameter.
17. **News rates.** Normal scheduled frequency uses the observed rate; light/heavy use p10/p90 complete-primary-week rates. Normal unscheduled-shock frequency uses the full-source empirical rate; light/heavy use p10/p90 complete-week rates. Heavy shock sizes use the top quartile of observed >4-ATR tails.
18. **Follow-through.** Mixed mode uses the empirical share of tail bars whose signed next-12-bar cumulative return is positive. Reversion offsets at least the original shock magnitude over a horizon drawn from the observed 1–12-bar distribution. This is a controllable synthetic behavior, not a causal or forecast claim.
19. **Block trend control.** A trendiness target chooses among the nearest 20% of retained complete primary-template weeks in joint variance-ratio/autocorrelation metric distance. This preserves empirical shapes without an AR overlay. D1 failed; this does not certify the method as sufficiently realistic.
20. **Volatility shape.** Stable holds the selected volatility target. Expanding/contracting linearly blend between the midpoint of the selected target and the observed p10/p90 endpoints.
21. **Wobble and transitions.** Default wobble is bounded to ±10%; volatility is relative to its target, while drift and trend-statistic wobble use 10% of their observed p10–p90 span. Transition widths are seeded uniformly over 48–200 bars. These are fixed implementation assumptions, not fitted to strategy results.
22. **Regime lengths.** The archive has no independent ground-truth regime labels. Sequence windows of 20–60 trading days and the 20–30-day short middle segment in `top_and_reversal` are fixed scenario assumptions, not empirically estimated durations.
23. **Price level.** The default starting price is the full-profile median close. Other positive inputs are accepted; values outside the observed min/max are flagged `EXTRAPOLATION`.
24. **Spread.** No historical spread observations are available. `spreadMult` defaults to 1 and is metadata only; it does not alter OHLC. The CSV metadata uses a static $0.20 spread convention only to satisfy the analyzer's parsing contract, not as a calibrated spread claim.
25. **Determinism.** The module uses a local 32-bit seeded PRNG and no ambient randomness, current time, network calls, or source-file reads. OHLC is not rounded before serialization.

## Fixed D1 result and stop status

The fixed normal-cell D1 check used 120 Monday–Friday trading days, seed `20261001`, 200 bootstrap replicates, 24 complete 230-bar donor weeks, and bootstrap seed `209`. The allowed interval remained the wider of the 95% moving-week bootstrap CI and real value ±20%; thresholds were not changed. Coverage and source/profile hash matched. **26/32 checks passed; six hourly cells failed:** EAT 04:00, 08:00, 09:00, 10:00, 15:00, and 19:00. D1 overall is **FAIL**.

D2–D4 and D7 were not run. No synthetic strategy results, engine comparisons, or scenario-seed grids were computed. The existing D1 report is [`validation-report.json`](./validation-report.json); full allowed intervals and values are in [`REPORT.md`](./REPORT.md).

The earlier partial profile had a separate historical D1 failure (26/32: 7/8 scalar and 19/24 hourly checks, plus missing archive coverage). Its failing metrics were absolute-return autocorrelation lag 1 and EAT hours 02, 03, 04, 11, and 15. That result is **not** the result for the current archive; see the historical note in `REPORT.md`.

## Still unverified

- D2 target isolation, D3 engine structure, and D4 planted-window checks.
- D7 multi-seed scenario checks. They remain intentionally unrun and must not compute strategy results.
- Whether the primary-template generator will meet a broader target distribution despite the failed D1 hourly checks; no threshold adjustment or post-failure retuning is authorized.
- The cause of the source's `UTC` section markers versus EAT metadata, calendar schedule changes, and every unclassified closure.
- Generalization to other XAUUSD venues, feeds, timezone conventions, spread/cost models, or calendar schedules.
- Whether time-of-day return peaks correspond to scheduled economic news rather than coincidental volatility.
