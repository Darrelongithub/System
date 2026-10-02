# Synthetic generator report — dayblock recovery attempt

**Report date:** 2026-10-02 (Africa/Nairobi)

## 1. Status table and gate results

| Phase / gate | Status | Result |
|---|---|---|
| Phase 0a — exact frozen `SPEC.md` | **SKIPPED** | Exact earlier task text is unavailable. Per instruction, no reconstructed spec was presented as verbatim. See `QUESTIONS.md`. |
| Phase 0b–d — repair count, funnel, pool coverage | **PARTIAL / BLOCKED** | Some prior-run values are preserved below, but the implementation/catalog required to recompute them is absent from this checkout. |
| Phase 1 — preregister structural lever | **NOT RUN** | No new rerun or repair was started without the original dayblock source/catalog and exact criteria. |
| D1 | **NOT RE-RUN** | Prior session reported a construction failure at `2021-04-05`; this checkout has no dayblock implementation to reproduce it. |
| D2–D7 | **NOT RUN** | D1 not revalidated; full exact gate definitions are unavailable. |
| Phase 3 sanity checks | **NOT RUN** | Conditional on all gates passing. |
| Phase 4 stress map | **NOT RUN** | Conditional on every gate and sanity check passing. |

The current working tree does not contain `dayblock.ts`, `dayblock-types.ts`, `dayblock-catalog.ts`, a dayblock catalog builder, or dayblock tests. `src/lib/synth/generate.ts` still contains the profile-based weekly generator. Consequently, no honest code-level fix to the stated dayblock construction failure, candidate-funnel replay, or stress map can be performed from this checkout without reconstructing the missing design.

The registered source archive was independently materialized from `main` to `/tmp` (without switching branches) and verified unchanged: SHA-256 `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`; size 24,045,090 bytes. No strategy trades, R, P&L, or engine outputs were used for this diagnosis.

### Repair-attempt count

**0 of the fresh two structural repair attempts** have been used against the `2021-04-05` construction failure. The prior session history records two implementation corrections—adding the omitted candle append and supporting a terminal path remainder shorter than three output dates—but neither changes condition/calendar candidate selection, and neither correction is present in this checkout. They are not counted as D1 construction repairs. The failure-driving implementation is absent, so this classification could not be independently confirmed from code here.

## 2. Funnel diagnosis and lever decision

The following prior-run measurements are preserved from the supplied state/history and are **not re-derived from the current checkout**. The target starts `2021-04-05` (Monday), DST state 3 (UK and US both on daylight time), after the Easter closure; the target first-bar gap class was recorded as `unclassified-closure`. Candidate target windows end as follows:

| Candidate length | Target dates | Structural calendar/DST matches before normal tags* | Frozen `normal_chop` matches after tag bands* |
|---:|---|---:|---:|
| 3 | Apr 5–7 | 3 | 0 |
| 4 | Apr 5–8 | 3 | 0 |
| 5 | Apr 5–9 | 3 | 0 |
| 6 | Apr 5–12 | 2 | 0 |
| 7 | Apr 5–13 | 2 | 0 |
| 8 | Apr 5–14 | 2 | 0 |
| 9 | Apr 5–15 | 1 | 0 |
| 10 | Apr 5–16 | 1 | 0 |

\*These counts came from the earlier catalog inspection. They do not include the unavailable counts for all raw blocks before the length/DST/calendar filters. The exact-match set was already empty after the frozen normal scenario-tag intersection; anti-reuse therefore did not reduce it further. The previous `normal_chop` pool summary was 1,738 eligible blocks overall; its DST-state-3 subset was 672 blocks / 385 source dates. Those pool totals are post-condition selection, not the earlier funnel stages.

**Binding filter in the prior diagnosis:** the frozen scenario-tag bands reduced the structurally matching target windows to zero. The allowed repair sequence would therefore have to test **L1 first** (shorter blocks, down to one day), and only if the exact candidate set remains below 20 then test **L2** (drop the calendar/holiday-shape match). No lever was selected, written into a frozen spec, or applied because the catalog, generator, and exact prior spec are missing. L3 retiming and L4 failure were not run.

The requested funnel distribution over all attempted windows from 20 `normal_chop` seeds (minimum, median, and candidate-count distribution) is **unavailable**: no seed-path trace or dayblock code/catalog exists in this checkout, and no 20-seed rerun was made. It is not inferred from the one reported D1 failure.

## 3. Pool coverage and widening

The only available pool-coverage figures are the prior `normal_chop` summary supplied with the task. Expected distinct source dates per 120-day path cannot be calculated without per-day selection weights/source IDs. A THIN flag means fewer than 60 distinct eligible source dates.

| Scenario / sequence segment type | Dials from registered scenario table | Eligible blocks | Distinct source dates | Expected distinct dates / 120 path days | THIN |
|---|---|---:|---:|---:|---|
| `quiet_range` | low / flat / mean-reverting / normal gaps / normal news / mixed shock | Not verifiable | Not verifiable | Not verifiable | Not verifiable |
| `normal_chop` | normal / flat / random / normal gaps / normal news / mixed shock | 1,738 (prior run) | 765 (prior run) | Not verifiable | No (prior run) |
| `slow_grind_up` | low / up / trending / normal gaps / normal news / mixed shock | Not verifiable | Not verifiable | Not verifiable | Not verifiable |
| `strong_uptrend` | normal / up / trending / normal gaps / normal news / mixed shock | Not verifiable | Not verifiable | Not verifiable | Not verifiable |
| `slow_grind_down` | low / down / trending / normal gaps / normal news / mixed shock | Not verifiable | Not verifiable | Not verifiable | Not verifiable |
| `strong_downtrend` | normal / down / trending / normal gaps / normal news / mixed shock | Not verifiable | Not verifiable | Not verifiable | Not verifiable |
| `whipsaw` | high / flat / mean-reverting / normal gaps / normal news / mixed shock | Not verifiable | Not verifiable | Not verifiable | Not verifiable |
| `melt_up` | high / up / trending / normal gaps / normal news / continue | Not verifiable | Not verifiable | Not verifiable | Not verifiable |
| `crash` | high / down / trending / heavy gaps / heavy news / continue | Not verifiable | Not verifiable | Not verifiable | Not verifiable |
| `news_storm` | normal / flat / random / normal gaps / heavy news / mixed shock | Not verifiable | Not verifiable | Not verifiable | Not verifiable |
| `gap_shocks` | normal / flat / random / heavy gaps / normal news / mixed shock | Not verifiable | Not verifiable | Not verifiable | Not verifiable |
| `fake_outs` | normal / flat / mean-reverting / normal gaps / normal news / revert | Not verifiable | Not verifiable | Not verifiable | Not verifiable |
| `dead_zone` | p5 / flat / random / normal gaps / light news / mixed shock | Not verifiable | Not verifiable | Not verifiable | Not verifiable |
| `calm_storm_calm` segments | quiet_range → whipsaw → quiet_range | Not verifiable | Not verifiable | Not verifiable | Not verifiable |
| `top_and_reversal` segments | strong_uptrend → whipsaw → strong_downtrend | Not verifiable | Not verifiable | Not verifiable | Not verifiable |
| `range_breakout` segments | normal_chop → strong_uptrend → normal_chop | Not verifiable | Not verifiable | Not verifiable | Not verifiable |
| `bull_with_crash` segments | strong_uptrend → crash → strong_uptrend | Not verifiable | Not verifiable | Not verifiable | Not verifiable |

Prior normal-pool DST diagnostic: state 0 = 1,055 blocks / 365 source dates (not THIN); state 2 = 11 / 15 (THIN); state 3 = 672 / 385 (not THIN). No path-level widening counts or reuse table could be reproduced. No L1/L2/L3 widening was made in this checkout.

## 4. Map results

**No map was run.** D1 was not revalidated, later gates and Phase 3 criteria are not available verbatim, and the map remains conditional on every gate and sanity check passing. There are no LOOK/CONFIRM, random-entry, 2020–24 catalog-control, cost-sensitivity, or oracle-bound results to report.

## 5. Assumptions, unverified items, and hashes

- The prior embedded catalog was reported as 3,923,726 bytes with SHA-256 `38adf67340d7208e3c2f15939cee307621240566ac93fc6299b011dc3bdc58c5`; its generated module is absent, so neither value is independently verified here.
- The exact original D1–D7 tolerances and full map/sanity definitions are not present. The old report contains historical parametric-v1 results, not the dayblock specification.
- `SPEC.md` was intentionally not created: Phase 0a required exact verbatim reconstruction and explicitly allowed skipping when the source text was unavailable.
- Phase backup is stored provisionally under the in-scope `src/lib/synth/backups/`; the required catalog could not be included because it is absent.
- `npx tsc --noEmit` passed before Phase 0 changes; `npm test` passed **242 tests, 0 failures** before Phase 0 changes. These are baseline checks, not gate passes.
- SHA-256 of the registered raw source: `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3` (verified).
- Hashes of `REPORT.md`, `QUESTIONS.md`, and the phase-0 tarball are recorded in `SHA256SUMS.txt` after creation.

## 6. QUESTIONS FOR ME

See [`QUESTIONS.md`](./QUESTIONS.md) for the missing exact spec, missing dayblock source/catalog, gate definitions, and provisional backup-path choice. The recommendation is to restore the exact prior dayblock patch and frozen spec; no speculative repair or stress map should be run until then.

---

## Archived 2026-10-01 `parametric-v1` report (historical; not the dayblock run)

**Report date:** 2026-10-01 (UTC)

**Outcome:** **D1 FAIL after the third and final authorized repair attempt. Stop here.** D2–D7 were not run as sequential gates, and Phase 4 was not started. No strategy-engine outputs or Phase 4 metrics were computed.

## Decision summary

- The registered archive and profile identity checks passed in each recorded D1 run. The fixed D1 tolerance was not changed.
- The original D1 run failed six hourly checks. Attempt 1 added IANA London/New York local-clock grouping; D1 then failed seven hourly checks (25/32 total), while EAT 15:00 improved to passing.
- Attempt 2 added full-source conditional event/background samples and a representative 120-weekday start. It failed 7/32 checks. After the user explicitly authorized one additional attempt, attempt 3 removed hard nearest-20% donor truncation and applied per-window empirical scheduled-event rates. D1 improved to **28/32**, but EAT hours 05, 16, 17, and 19 still failed. No fourth repair was made.
- The exact synthetic path, profile, and current D1 report hashes are listed at the end. Same configuration and seed remain byte-deterministic in the test suite.
- **Stop condition:** D1 failed after attempt 3, so later sequential gates and the stress map were not run. In particular, no 13-scenario/4-sequence, 200-seed LOOK/CONFIRM runs, engine comparisons, costs, bootstrap CIs, strategy R, or classifications exist. Nothing in this report is a strategy-performance or real-market claim.

## Source archive and integrity

The registered archive was read from `main` without switching branches:

- Path: `XAUUSD_30min_2020-01-24_to_2026-10-01.csv`
- Source ref: `main` at `689fcfc5310c30a04d1261eedb00b4b58af0ca30`
- Blob: `ec4b1b5a23f2204802de6d51cf5a0425798bbbe1`
- Size: 24,045,090 bytes
- Raw file SHA-256: `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`
- Rows: 79,586 valid OHLC bars, from **2020-01-24 05:00:00** through **2026-10-01 15:00:00**
- Canonical parsed-candle SHA-256: `a3b9f2d0bdfa3e578f94189256d191e1b0c45445c25ce206891bb24a471f3229`
- Parsed quality: 0 invalid OHLC rows, 0 duplicate timestamps, 0 non-increasing pairs; one input file, so no multi-file seam
- Observed dates: 1,868; missing calendar dates: 575
- Observed price range: 1,451.43–5,597.23; median close 1,957.24; final close 4,177.46
- `is_reliable`: 68,532 true / 11,054 false. Both groups have valid OHLC and are included because calibration uses timestamps and OHLC only.

Source metadata says `data_age` is `2026-10-01 15:00:00 EAT`, matching the last row, and describes `atr_30m` as a simple rolling mean of true range over 14 reliable candles. Calibration ignores that field and recomputes Wilder ATR(14) from all OHLC rows (SMA seed over the first 14 true ranges, then Wilder smoothing). No row is sorted, deduplicated, filled, time-shifted, or repaired.

### Timestamp and gap assumptions

Row timestamps have no explicit offset. The source section headers say `(UTC)`, while `data_age` says EAT. The task convention was followed: unzoned timestamp text is interpreted as EAT wall-clock, equivalent to UTC+03:00. No `+3h` rewrite was applied to the source strings. The UTC/EAT source-label conflict is unresolved, so hourly/session interpretation remains provisional.

There are **1,472 observed intervals longer than 30 minutes**:

| Interval class                    | Count | Interpretation                                                                                                                                    |
| --------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recurring session-break signature | 1,016 | Exact 90-minute weekday/time-pair gaps repeated at least 40 times; observed windows include 23:30→01:00 and 00:30→02:00 under the EAT convention. |
| Weekend closure                   |   339 | Calendar gaps classified by weekday transition; not independently verified exchange holidays.                                                     |
| Unclassified closure              |   117 | Does not match the recurring-pair or weekend rules; cause unknown.                                                                                |

Only non-weekend gaps from 60–240 minutes with an exact EAT weekday, prior/next time, and duration signature repeated at least 40 times receive `scheduled-session-break`. Classification does not alter timestamps or OHLC and does not prove an exchange notice, holiday, or outage.

The archive also contains different recurring week templates. The most frequent is 230 bars (46 Monday–Friday bars, 01:00–23:30 EAT, no Saturday); another is 242 bars with a Saturday tail. The runtime donor library uses 104 complete primary-template weeks (23,920 standardized bars); summaries still use all 79,586 source bars. Provider, venue, quote construction, and authoritative exchange schedule were not independently verified.

## Phase 1 — DST-state and local-clock diagnosis

### Classification method and coverage

Each observed calendar date was classified at **12:00 EAT** using IANA `Europe/London` and `America/New_York` rules. “Neither” means both standard time; “US-only” means New York daylight time and London standard time; “both” means both daylight time. There were no UK-only dates in the observed span. Using weekdays only, the archive contains 1,732 observed weekday dates: 569 neither (32.85%), 119 US-only (6.87%), and 1,044 both (60.28%). Counts across all 1,868 observed dates are 647 / 123 / 1,098 respectively; the rounded shares are the same. The first four source-state boundaries below are the first affected weekdays at noon EAT, not Sunday transition instants.

| Year | First weekday US-only (spring) | First weekday both DST | First weekday US-only (autumn) | First weekday neither |
| ---- | ------------------------------ | ---------------------- | ------------------------------ | --------------------- |
| 2020 | Mar 9                          | Mar 30                 | Oct 26                         | Nov 2                 |
| 2021 | Mar 15                         | Mar 29                 | Nov 1                          | Nov 8                 |
| 2022 | Mar 14                         | Mar 28                 | Oct 31                         | Nov 7                 |
| 2023 | Mar 13                         | Mar 27                 | Oct 30                         | Nov 6                 |
| 2024 | Mar 11                         | Apr 1                  | Oct 28                         | Nov 4                 |
| 2025 | Mar 10                         | Mar 31                 | Oct 27                         | Nov 3                 |
| 2026 | Mar 9                          | Mar 30                 | —                              | — (outside archive)   |

As expected from these rules, the US-only offset state occurs between the US and UK spring switches and again between the UK and US autumn switches. There is no UK-only state in this archive. A 120-weekday window starting **2021-01-18** has 40 neither, 10 US-only, and 70 both weekdays (33.3% / 8.3% / 58.3%), close to the archive weekday mix. The prior default start, 2020-03-09, began in the spring US-only interval and was not representative of the full archive mix.

### EAT-hour mean absolute return / prior Wilder ATR by DST state

Values below are means of `abs(close-to-close log return) / (prior Wilder ATR / prior close)`, grouped by the observed date’s noon-EAT DST state and the row’s EAT hour. They are descriptive; they are not strategy statistics. UK-only is empty in this sample.

| EAT hour | Neither | US-only |   Both | UK-only |
| -------: | ------: | ------: | -----: | ------: |
|       00 |  0.2518 |  0.1149 | 0.2588 |       — |
|       01 |  0.0908 |  0.4317 | 0.4181 |       — |
|       02 |  0.5395 |  0.3124 | 0.3234 |       — |
|       03 |  0.4300 |  0.4383 | 0.4603 |       — |
|       04 |  0.6100 |  0.5957 | 0.6745 |       — |
|       05 |  0.4522 |  0.4253 | 0.4588 |       — |
|       06 |  0.3889 |  0.3645 | 0.3892 |       — |
|       07 |  0.3037 |  0.3114 | 0.3548 |       — |
|       08 |  0.4594 |  0.4979 | 0.5230 |       — |
|       09 |  0.4854 |  0.5265 | 0.6070 |       — |
|       10 |  0.5582 |  0.5589 | 0.6172 |       — |
|       11 |  0.6444 |  0.6155 | 0.5477 |       — |
|       12 |  0.5180 |  0.5362 | 0.4677 |       — |
|       13 |  0.4837 |  0.5588 | 0.4815 |       — |
|       14 |  0.4944 |  0.5314 | 0.5392 |       — |
|       15 |  0.5275 |  0.7096 | 0.9567 |       — |
|       16 |  0.9658 |  0.8403 | 0.8862 |       — |
|       17 |  0.8488 |  0.7174 | 0.7704 |       — |
|       18 |  0.7712 |  0.5309 | 0.5296 |       — |
|       19 |  0.5143 |  0.4007 | 0.4038 |       — |
|       20 |  0.4054 |  0.3953 | 0.3789 |       — |
|       21 |  0.3995 |  0.5215 | 0.3827 |       — |
|       22 |  0.3773 |  0.3687 | 0.3671 |       — |
|       23 |  0.3777 |  0.3390 | 0.2643 |       — |

### Scheduled-spike profile by DST state

For this diagnosis only, each EAT half-hour slot was a candidate when its state-specific mean absolute return/ATR exceeded 1.25 times the median of that state’s 48 half-hour slot means. These candidates are statistical return peaks, **not verified economic-news events**. `n` is the number of eligible returns in that slot/state.

| State   | Median slot mean | Candidate EAT half-hour slots: mean (n)                                                                                                                                                                                                                                                              |
| ------- | ---------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Neither |           0.4601 | 02:00 0.718 (563); 04:00 0.680 (563); 10:00 0.585 (566); 11:00 0.717 (566); 16:00 0.788 (567); 16:30 1.144 (567); 17:00 0.753 (567); 17:30 0.945 (567); 18:00 0.908 (567); 18:30 0.634 (565)                                                                                                         |
| US-only |           0.4883 | 08:30 0.613 (118); 11:00 0.676 (118); 15:00 0.698 (119); 15:30 0.721 (119); 16:00 0.781 (119); 16:30 0.899 (119); 17:00 0.756 (119); 17:30 0.679 (119)                                                                                                                                               |
| Both    |           0.4694 | 04:00 0.733 (1,036); 04:30 0.616 (1,036); 08:30 0.613 (1,041); 09:00 0.675 (1,039); 10:00 0.613 (1,039); 10:30 0.622 (1,040); 11:00 0.604 (1,040); 15:00 0.761 (1,040); 15:30 1.153 (1,040); 16:00 0.787 (1,040); 16:30 0.985 (1,041); 17:00 0.878 (1,027); 17:30 0.663 (1,028); 18:00 0.592 (1,027) |
| UK-only |                — | No dates / no candidates                                                                                                                                                                                                                                                                             |

The strongest peak changes from EAT 16:30 in the neither state (1.144) to EAT 15:30 in the both-DST state (1.153), a one-hour EAT shift. Both correspond to 08:30 New York local time under the stated EAT interpretation. In the US-only state, the 16:30 peak is 0.899 with only 119 samples and maps to New York 09:30. This is evidence that a single pooled EAT profile mixes clock states; it does **not** identify a named release or establish that DST alone caused any D1 miss. The London/New York overlap and source timestamp ambiguity remain important caveats.

### Diagnosis table for the six original failing hours

This table preserves the six failures from the pre-repair, full-archive D1 run. Values are the synthetic path versus the real mean; the fixed interval was the wider of the 200-replicate, 24-week moving-block 95% bootstrap CI and real ±20%. “Relative miss” is `(synthetic / real) − 1`.

| EAT hour |     Real | Pre-repair synthetic | Allowed interval     | Relative miss | Diagnosis evidence and confidence                                                                                                                                                                               |
| -------: | -------: | -------------------: | -------------------- | ------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    04:00 | 0.647890 |             0.777766 | [0.518312, 0.777467] |       +20.05% | Barely above the fixed upper limit. The follow-up path had 04:00 mean 0.917 and scheduled-news bars averaged 1.278. News contribution is plausible; conditional event-pool mismatch alone was not established.  |
|    08:00 | 0.500373 |             0.611240 | [0.400299, 0.600448] |       +22.16% | Above the fixed limit. In the follow-up path, 08:00 averaged 0.792 and its scheduled-news bars 1.192. Local-clock mixing and event bars are plausible contributors, not a proven single cause.                  |
|    09:00 | 0.561553 |             0.818205 | [0.449243, 0.686389] |       +45.70% | The trend-matched 21-week donor subset averaged 0.7221 at 09:00 versus 0.6122 across all donor weeks; follow-up scheduled-news bars averaged 1.459. Both donor selection and scheduled bars can contribute.     |
|    10:00 | 0.593841 |             0.871639 | [0.475072, 0.712609] |       +46.78% | The trend-matched donor subset averaged 0.6874 versus 0.6190 across all donor weeks; follow-up scheduled-news bars averaged 1.175. Both are plausible contributors; neither is established as sufficient alone. |
|    15:00 | 0.798673 |             1.146962 | [0.638939, 1.100708] |       +43.61% | A pooled EAT profile can alias DST-shifted local activity. After attempt 1 added local-clock grouping, EAT 15:00 passed; this supports a clock-mapping contribution, not a universal fix.                       |
|    19:00 | 0.440085 |             0.335458 | [0.352068, 0.528102] |       −23.77% | Low. The follow-up 19:00 path averaged 0.327 and had no scheduled-news bars, so scheduled events do not explain this miss. Background donor/path composition or sampling remains unresolved.                    |

The original D1 normal path started 2020-03-09, a DST-transition period rather than a representative 120-weekday sample. This was another plausible comparison mismatch, not a demonstrated sole cause.

## Phase 2 — three structural repair attempts

### Attempt 1: DST-aware local clocks

Calibration now resolves each absolute timestamp into IANA London and New York clock fields. Intraday return/ATR, scheduled-window, and session summaries are grouped by a selected local activity clock; generator slots carry that identity to donor lookup and event-window selection. Output timestamp strings remain EAT. NY 08:00–16:00 has priority, then London 08:00–13:00, with EAT used outside those local windows. The IANA offset is compared with January standard time to identify DST state; `hourCycle: "h23"` avoids midnight-hour ambiguity.

This structural change is supported by the state-conditioned profiles above and contains no per-hour multipliers. It changed D1 to 25/32: the 15:00 miss passed, but EAT 04, 07, 08, 09, 10, 19, and 20 failed. Attempt-1 D1 synthetic JSON SHA-256: `0ecdfbc0f59a96ed8bdf40402dd9789f36836fdf2490938ccee16bb94f3d60fa`; profile SHA-256: `300e55f634503f50db6371cdf7753257fd34c4c2557ba1a409fb0dd16af99328`.

### Attempt 2: full-source conditional samples and representative start

The attempt-1 diagnostic showed elevated trend-selected donor means at 09:00/10:00 and high scheduled-event returns in several failed windows. The source-wide and donor-conditional event rates/magnitudes were broadly similar, so an event-pool mismatch was not treated as the sole explanation. Attempt 2 made two structural changes, with no hand-tuned hourly factors:

1. For each calibrated scheduled local-clock window, the profile stores signed full-source event returns and full-source non-event returns, split at the registered scheduled-spike threshold. Generation first samples the scheduled-event flag at the existing registered rate, then samples the corresponding conditional distribution instead of restricting both branches to the trend-selected donor subset.
2. The default path start is the Monday start whose next 120 Monday–Friday dates minimize squared error from the full archive’s weekday UK/US DST-state shares. The resulting default is **2021-01-18**. User-supplied starts and other calendar behavior were not tuned to D1.

The profile was regenerated from the unchanged 79,586-bar archive. No strategy, trade, R, P&L, win-rate, engine, or exit output was used for calibration or tuning. Attempt 2 still failed D1 at 25/32: absolute-return autocorrelation lag 1 and EAT hours 07, 09, 16, 17, 19, and 21. Its profile SHA-256 was `21648bb01d0602cc0be6baf3f4d636a04c326b5377a0ebab446868bf9c0786b1`, and its D1 output hash was `4d6ae0253da08b106b56b2a4d40ba4704207562495d2d85e7f04f6f372f5262b`.

### Attempt 3: broader trend-weighted donor sampling and local event rates

After the user explicitly authorized one additional attempt, diagnostics supported two related structural changes:

1. The hard nearest-20% donor cutoff concentrated the 21-week normal-trend pool and skewed its profile (for example, EAT 09:00 mean absolute return/ATR was 0.7221 in that subset versus 0.6122 across the full donor library). Selection now uses a soft Laplace weight `exp(-distance)` over all 104 complete donor weeks. Distance is the existing sum of absolute VR(8), VR(16), and lag-1-autocorrelation deviations, each normalized by its observed p90–p10 range. A weighted permutation samples without replacement for each trend target, reshuffling only after the queue is exhausted. This retains trend matching without hard-truncating the donor source or adding hour-specific factors.
2. Scheduled event frequency differed by local window while generation used one global rate. In this profile, the observed rate is 0.4196 at EAT 09:00, 0.5881 at New York 08:30, and 0.6022 at New York 09:30, versus the global normal rate 0.4739. Calibration now stores each window’s full-source event probability. Normal mode uses that rate; light/heavy scale it by the existing global light/normal/heavy rate ratios, preserving the aggregate dial definition in expectation.

No tolerance, D1 config, seed, output path length, or anchor was changed for this attempt. D1 improved to 28/32 but still failed at EAT 05, 16, 17, and 19. This was the third and final authorized attempt; no fourth repair was made.

## Phase 3 — fixed validation and stop-on-first-failure

### D1 configuration and tolerance

D1 used `normal_chop`, 120 Monday–Friday trading days, seed `20261001`, 5,520 candles/labels, 24 complete 230-bar donor-week blocks, 200 bootstrap replicates, and bootstrap seed `209`. For every statistic the registered allowed interval is the hull of the 95% moving-week bootstrap CI and the real value ±20% (equivalently, the wider interval). The metric set is fixed at 8 scalar plus 24 EAT-hour checks; no threshold was loosened or reinterpreted.

Coverage: **PASS**. Source/profile identity: **PASS**. Available-sample metrics: **FAIL, 28/32**. All eight scalar checks passed; 20 of 24 hourly checks passed. The four current D1 failures are:

| Statistic                            |     Real | Attempt-3 synthetic | Bootstrap 95% CI     | Fixed allowed interval | Relative miss |
| ------------------------------------ | -------: | ------------------: | -------------------- | ---------------------- | ------------: |
| EAT 05:00 mean absolute return / ATR | 0.454320 |            0.586984 | [0.376282, 0.482235] | [0.363456, 0.545184]   |       +29.20% |
| EAT 16:00 mean absolute return / ATR | 0.909161 |            0.721822 | [0.820583, 1.039718] | [0.727329, 1.090994]   |       −20.61% |
| EAT 17:00 mean absolute return / ATR | 0.792628 |            0.602164 | [0.692316, 0.893552] | [0.634102, 0.951153]   |       −24.03% |
| EAT 19:00 mean absolute return / ATR | 0.440085 |            0.348908 | [0.353446, 0.432911] | [0.352068, 0.528102]   |       −20.72% |

The generated JSON SHA-256 is `6c4a28fd8f609f92f4fe3b52e0aee7e0a80e770d172603aa3fbcd5f594662fef`; the attempt-3 profile SHA-256 is `380793aa96c784ae2e169af7138a90f0c63da170ff6ed5e3d79e947edb2130c5`. The complete metric arrays, per-metric CIs, configuration, and stop flags are in [`validation-report.json`](./validation-report.json).

### Full sequential gate table

| Gate | Fixed tolerance / requirement                                                                                                              | Result                                                               | Pass/fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | --------- |
| D1   | All 32 registered normal-cell statistics within their fixed allowed intervals; full archive coverage and source/profile identity required. | 28/32 available-sample metrics passed; coverage and identity passed. | **FAIL**  |
| D2   | Not reached; stop-on-first-failure rule stopped at D1.                                                                                     | Not run.                                                             | —         |
| D3   | Not reached; stop-on-first-failure rule stopped at D1.                                                                                     | Not run; no engine-behavior results were computed.                   | —         |
| D4   | Not reached; stop-on-first-failure rule stopped at D1.                                                                                     | Not run.                                                             | —         |
| D5   | Not reached as a sequential gate; the suite-level determinism test did run and passed, but is not counted as a D5 gate pass.               | Not run as a gate.                                                   | —         |
| D6   | Not reached as a sequential gate; generator unit tests did run, but are not counted as a D6 gate pass.                                     | Not run as a gate.                                                   | —         |
| D7   | Not reached; stop-on-first-failure rule stopped at D1.                                                                                     | Not run; no scenario-seed grid was started.                          | —         |

D1 failed after attempt 3, the final attempt explicitly authorized by the user, so **no fourth repair or later gate run was made**. `strategyResultsComputed` is `false` in the D1 report.

## Phase 4 — conditional stress map

**Not run.** D1 did not pass, so the registered map of 13 single-condition scenarios and 4 fixed sequences, 140 trading days/path, 20-day burn-in, seeds 1–100 LOOK and 101–200 CONFIRM, was not started. There are no per-segment gross/net R, win rate, trades/month, drawdown, side or strategy R, bootstrap CIs, BLEED/PROFIT/UNCLEAR labels, regressions, or sequence oracle upper bound to report. No results should be inferred from the D1 checks.

No transaction cost was applied: the task’s provisional $0.30 round-trip figure was not replaced with a broker-confirmed amount, and the broker’s real amount was not supplied. Since Phase 4 was blocked, no cost-to-R or x2 sensitivity exists. No EXTRAPOLATION scenario/dial inventory was generated for the stress map.

## Tests, scope, and unresolved assumptions

- The synth-group tests in the full suite passed, covering IANA clock/DST checks, profile/schema invariants, generator scenarios, OHLC/calendar behavior, and same-config/seed byte determinism.
- Final validation after attempt 3: `npm test` passed **223 tests, 0 failures** (71.6s); `npx tsc --noEmit` passed.
- Calibration and diagnosis used market statistics only. No analyzer, strategy, parameter, exit, UI, navigation, route, or engine code was changed. The synthetic validation/stress workflow did not call the engine; the required full repository test suite separately ran its existing engine tests.
- IANA zone rules come from the runtime `Intl`/tzdata and were not version-pinned. The noon-EAT daily state convention is explicit; transition dates have no bars on the Sunday boundary in this archive.
- NY 08:00–16:00 and London 08:00–13:00 local session windows, NY-first overlap precedence, and EAT fallback are modeling conventions, not independently verified exchange sessions.
- Statistical scheduled windows are return peaks, not an independently sourced news calendar. Provider/venue, timestamp timezone, exchange calendar, actual broker spread/commission/slippage, and live execution conditions are unknown.
- The data-derived representative start optimizes only the default 120-weekday path length; it is not a claim that one date is uniquely representative for all path lengths.
- `src/pages/MapGenerator.tsx` now mirrors the final attempt-3 D1 status (28/32, with EAT 05:00, 16:00, 17:00, and 19:00 outside tolerance) and notes that D2–D7 and Phase 4 were not run. This stale-copy correction was made during the whole-repository audit using the recorded report only; no calibration was rerun.
- No strategy, parameter, exit, integration, or research recommendation is made.

## SHA-256 hashes

| Artifact                                                                              | SHA-256                                                                                            |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Source archive `XAUUSD_30min_2020-01-24_to_2026-10-01.csv`                            | `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`                                 |
| Canonical source candles                                                              | `a3b9f2d0bdfa3e578f94189256d191e1b0c45445c25ce206891bb24a471f3229`                                 |
| Current D1 generated JSON (hash recorded in report; not persisted as a separate file) | `6c4a28fd8f609f92f4fe3b52e0aee7e0a80e770d172603aa3fbcd5f594662fef`                                 |
| `src/lib/synth/profile.json`                                                          | `380793aa96c784ae2e169af7138a90f0c63da170ff6ed5e3d79e947edb2130c5`                                 |
| `src/lib/synth/profile-default.ts`                                                    | `e285171af42959f13f9eb57ca75e159a9c9306912c281481450a2b2c42e4a542`                                 |
| `src/lib/synth/validation-report.json`                                                | `f74e4453b79526b5e4e008008d1b3dc96fdc1dd372ea328d4239c22fe96d653b`                                 |
| `src/lib/synth/REPORT.md`                                                             | See the final delivery message and `SHA256SUMS.txt`; self-hash is intentionally not embedded here. |
