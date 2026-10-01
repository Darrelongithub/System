# Synthetic XAUUSD 30m generator — calibration and D1 report

**Report date:** 2026-10-01 (Africa/Nairobi)  
**Validation scope:** D1 normal-cell market-statistics check only.  
**Outcome:** **D1 FAIL — stop here.** The archive/profile coverage checks passed, but 6 of 32 fixed market-statistic checks failed. D2–D4 and D7 were not run. No strategy results, engine comparisons, or scenario-seed grids were computed.

## Source archive and integrity

The archive was read from `main` without switching branches:

- Path: `XAUUSD_30min_2020-01-24_to_2026-10-01.csv`
- Source ref: `main` at `689fcfc5310c30a04d1261eedb00b4b58af0ca30`
- Blob: `ec4b1b5a23f2204802de6d51cf5a0425798bbbe1`
- Size: 24,045,090 bytes
- Raw SHA-256: `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`
- Rows: 79,586 valid OHLC bars, spanning **2020-01-24 05:00:00 through 2026-10-01 15:00:00**
- Parsed quality: 0 invalid bars, 0 duplicate timestamps, 0 non-increasing pairs; one source file, therefore no multi-file seam
- Observed dates: 1,868; missing calendar dates: 575
- Observed price range: 1,451.43–5,597.23; median close 1,957.24; final close 4,177.46
- `is_reliable`: 68,532 true / 11,054 false. Both groups have valid OHLC and are included because calibration uses only timestamp and OHLC.

The archive's `data_age` says `2026-10-01 15:00:00 EAT`, matching the final row. Source metadata says `atr_30m` is a simple rolling mean of true range over 14 reliable candles. Calibration ignores that field and recomputes Wilder ATR(14) from OHLC (first value: SMA of the first 14 true ranges, then Wilder smoothing). The supplied `atr_30m` is not silently substituted for the requested Wilder method.

### Timestamp and gap interpretation

The row timestamps have no printed timezone offset. The section headers contain `(UTC)`, but the metadata `data_age` says EAT. Per the task rule, unzoned row values are interpreted as EAT wall-clock (+03:00). No timestamp strings were shifted or normalized. The UTC/EAT source-label conflict is unresolved; hourly/session labels and the schedule interpretation should be treated as provisional.

The inspector found **1,472 intervals longer than 30 minutes**. Calibration classifies them as follows:

| Observed interval class           | Count | Interpretation                                                                                                                                        |
| --------------------------------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recurring session-break signature | 1,016 | Exact 90-minute weekday/time-pair gaps repeated at least 40 times; observed windows include 23:30→01:00 and 00:30→02:00 under the EAT interpretation. |
| Weekend closure                   |   339 | Calendar gaps classified by weekday transition; no claim that each is a verified exchange holiday.                                                    |
| Unclassified closure              |   117 | Does not meet the recurring-pair rule or the weekend rule; cause is unknown.                                                                          |

The recurrence rule is fixed in code: only non-weekend gaps from 60–240 minutes whose exact EAT weekday, prior/next time, and duration recur at least 40 times receive the `scheduled-session-break` label. The rule changes classification only. It inserts no bars, changes no OHLC values, and does not convert remaining gaps into holidays or outages.

There is also a clear source-calendar pattern change. The most frequent exact weekly slot template is the primary generated template; other repeated templates are retained in profile metadata but are not mixed into generated weeks:

| Profile schedule     | Occurrence weeks | Span of matching weeks | Bars/week | Observed slots                                                                                       |
| -------------------- | ---------------: | ---------------------- | --------: | ---------------------------------------------------------------------------------------------------- |
| Primary `schedule-1` |              107 | 2020-03-09–2025-04-07  |       230 | 46 bars Monday–Friday, 01:00–23:30; no Saturday bars                                                 |
| `schedule-2`         |               47 | 2025-04-28–2026-09-21  |       242 | 48 bars Monday–Friday, 00:00–23:30, plus 00:00 and 00:30 Saturday                                    |
| `schedule-3`         |               43 | 2020-11-02–2025-03-03  |       230 | 44 bars Monday from 02:00; 46 bars Tuesday–Friday with 00:00/00:30 then 02:00–23:30; 2 Saturday bars |

These patterns may reflect a feed/calendar regime change or timezone labeling issue; the CSV alone cannot decide the cause. The runtime profile uses 104 complete donor weeks matching the 230-bar primary template (23,920 standardized bars). Summary statistics and the canonical candle hash still cover all 79,586 input bars. No claim is made that the primary template represents all observed schedule variants.

## Calibration profile

- Raw source SHA-256: `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`
- Canonical parsed OHLC/time SHA-256: `a3b9f2d0bdfa3e578f94189256d191e1b0c45445c25ce206891bb24a471f3229`
- `profile.json` SHA-256 at D1: `0d5cc8402b34b986c7602380116a54c84d804364534f8d855e8f32393993b2de`
- `profile-default.ts` embeds that profile for runtime generation; no CSV file is needed in the app.
- Wilder ATR/close quantiles: p10 **0.1158%**, p50 **0.1797%**, p90 **0.3085%** (p5 0.1033%).
- Rolling 60-calendar-day log-return quantiles: p10 **−5.52%**, p50 **+2.01%**, p90 **+10.95%** (min −21.84%, max +29.49%). `flat` therefore means observed p50, not zero.
- Primary calendar week: 230 bars; 104 exact, complete donor blocks after excluding unclassified closures and incompatible templates.

All descriptive percentile estimates use market statistics only. No strategy trade, R, P&L, win-rate, or analyzer output entered calibration. Numeric active dials and a starting price outside the observed profile range continue to be labeled `EXTRAPOLATION`.

## D1 normal-cell check

D1 compared one `normal_chop` synthetic path (120 Monday–Friday trading days, seed `20261001`) with the full archive. The raw source hash matched the profile source file, and the profile covered the registered 2020-01-24–2026-10-01 window. The fixed allowed interval remained the wider of the **200-replicate, 24-block moving-week 95% bootstrap CI** and real value ±20%; bootstrap seed `209`. No tolerance was changed.

The generated normal cell contained **5,520 candles and 5,520 labels** (24 × 230 bars). All 8 scalar checks passed. 18 of 24 hourly checks passed; these six failed:

| Statistic                            |     Real | Synthetic | Fixed allowed interval | Result |
| ------------------------------------ | -------: | --------: | ---------------------- | ------ |
| EAT 04:00 mean absolute return / ATR | 0.647890 |  0.777766 | [0.518312, 0.777467]   | FAIL   |
| EAT 08:00 mean absolute return / ATR | 0.500373 |  0.611240 | [0.400299, 0.600448]   | FAIL   |
| EAT 09:00 mean absolute return / ATR | 0.561553 |  0.818205 | [0.449243, 0.686389]   | FAIL   |
| EAT 10:00 mean absolute return / ATR | 0.593841 |  0.871639 | [0.475072, 0.712609]   | FAIL   |
| EAT 15:00 mean absolute return / ATR | 0.798673 |  1.146962 | [0.638939, 1.100708]   | FAIL   |
| EAT 19:00 mean absolute return / ATR | 0.440085 |  0.335458 | [0.352068, 0.528102]   | FAIL   |

Overall: **26/32 checks passed; 6/32 failed.** Coverage: PASS. Source/profile hash match: PASS. Available-sample metrics: FAIL. D1 overall: **FAIL**. The output SHA-256 is `6969634591b795b5098f2e944ecf5686c00d6f54a53739353de204b402ed23c3`. The complete comparison table, bootstrap intervals, configuration, and stop status are in [`validation-report.json`](./validation-report.json) (file SHA-256 `9178072a9cf9678a4d96a251578fb6098b06d430f85fe09f1e4420bb31fef7ee`).

**The gate failed, so the run stopped.** D2–D4 were not run. D7's scenario checks were not run and did not compute strategy results. No strategy engine comparison or scenario-seed grid was run. Do not loosen thresholds or tune the generator based on this failed D1 result.

## Historical result from the superseded partial profile

The earlier partial profile covered only 2025-11-01–2026-08-20 and had raw SHA-256 `87d2ac67585afe4b373be6107fcc66183a43d5e67f14aa56bc77b968ea3473bf`. Its D1 result was also **FAIL**: coverage was incomplete and 26/32 available-sample checks passed (7/8 scalar, 19/24 hourly). Its failures were absolute-return autocorrelation lag 1 and EAT hours 02, 03, 04, 11, and 15. That historical result is not an assessment of the current full-window archive. Its prior profile hash was `01a541a3950408817546d09b296c4484c7a8e92de5b0687351eb47cde8629318`; its old validation-output SHA was `81dfeb0c908c18478e53d000ca400bc32f2f78ededb6520b8cefc40215d79a41`.

## Gate status

| Gate | Result   | Notes                                                                                                            |
| ---- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| D1   | **FAIL** | Coverage and source/profile identity passed; 6 hourly market-statistic checks are outside their fixed intervals. |
| D2   | NOT RUN  | Stopped at D1.                                                                                                   |
| D3   | NOT RUN  | Stopped at D1; no engine-behavior results were computed.                                                         |
| D4   | NOT RUN  | Stopped at D1.                                                                                                   |
| D7   | NOT RUN  | Stopped at D1; no 200-seed scenario checks were started.                                                         |

`strategyResultsComputed` is `false`. D1 is a market-statistics realism check only and does not certify strategy performance or profitability.
