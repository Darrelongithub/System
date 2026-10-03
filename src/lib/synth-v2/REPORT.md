# Synth V2 — Stage 0 and Stage 1b report

Updated **2026-10-03**. Stage 1b result: **PASSED**. This is an OHLC-only market-statistics generator; no planted regime paths, detector, or strategy evaluation are included.

## Data and protocol

- Input: `XAUUSD_30min_2020-01-24_to_2026-10-01.csv`; SHA-256 verified before calibration: `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`.
- All syntactically valid source OHLC rows are used, including both values of the source `is_reliable` flag; market returns are not filtered by a strategy or outcome column. Weekday schedule/metric paths use source EAT weekdays with at least 24 rows.
- Source timestamps are unzoned wall-clock strings. Stage 0 empirically supports fixed EAT (+03:00); bars were not shifted and the source profile was not rebuilt. The source also contains a contradictory section marker labelled UTC; see the evidence below and `QUESTIONS.md`.
- Normal realism run: 20 seeds × 120 weekdays, fixed start date 2026-01-05. Each path samples a real weekday schedule template for the same weekday; weekend/session time gaps remain on the output calendar and their price gaps are bootstrapped from the real gap pools.
- Real-data bootstrap: 300 moving windows, each 120 observed weekdays. For G1–G5 and G7, tolerance is the wider of ±20% around the full real estimate or the moving-window bootstrap 95% CI. G6 keeps its specified absolute ±0.05 tolerance.
- No strategy trades, R, P&L, or strategy configuration were read or used.

## Stage 0 — timestamp clock audit

The verified source has 79,586 parseable OHLC rows from 2020-01-24 05:00:00 to 2026-10-01 15:00:00. Among 203 Friday-to-Sunday/Monday gaps of at least 12 hours, the principal reopen was Monday 01:00 during US daylight time (151/167 reopens) and Monday 02:00 during US standard time (36/36). This is the fixed EAT pattern for the 18:00 New York weekly reopen. A broker clock tracking New York DST would keep its local reopen time constant.

For the requested weekday 12:00–16:00 stamp-clock test, mean `|log(close_t/close_(t-1))| / (prior source ATR_30m / close_(t-1))` peaked at 15:30 in US daylight time (1.068507, n=1,159). In standard time the 16:30 08:30-New-York release slot lies outside that strict window; the highest in-window slot was 12:00 (0.585957, n=567). The explicit boundary check found 16:30 means 0.934628 (DST) and 1.103242 (standard), showing the activity peak shift from 15:30 to 16:30 as New York changes clocks. This is an activity-timing proxy, not event attribution.

**Conclusion:** the rows are consistent with fixed EAT (UTC+3), not UTC or a New-York-following broker clock. The CSV `data_age` says 2026-10-01 15:00 EAT and `generated_at` is 12:14Z, consistent with the final 15:00 row. A section marker says `(UTC)`, so the source metadata conflict remains disclosed in `QUESTIONS.md`. No row was shifted; no profile recalibration was needed.

## Stage 1b — G2 lag-1 repair and full gates

The previous Stage 1 (`f455643`) had G1–G7 at 20/21, with only raw absolute-return G2 lag-1 failing at 0.163927 vs [0.179604, 0.359461]. Its trend p10 endpoint also fell below the real VR range. Stage 1b used exactly one structural change: a two-timescale volatility process, with a slow daily log-volatility AR(1) and a fast per-bar AR(1) log-volatility component. The fast persistence starts from real standardized-residual absolute-return ACF; slow persistence/scale and fast variance were jointly fit to raw G2 ACF(1/6/48) using 64 deterministic candidates and 20 separate market-statistic calibration seeds. The previous 0.88 slow-innovation shrink was not retained as a patch; the final slow parameters were refit within the same composite model.

| Fit item | Value |
| --- | --- |
| Grid candidates | 64 |
| Slow daily persistence | 0.8000 |
| Slow log-vol stationary-scale multiplier | 1.3000 |
| Fast per-bar persistence | 0.6125 |
| Fast log-vol stationary variance | 0.0800 |
| Fit-seed G2 ACF(1/6/48) | 0.270015 / 0.183468 / 0.177597 |

The real residual absolute-return ACF used to initialize the fast component was 1/6/48 = 0.095157 / 0.007794 / 0.000000. The grid's fitted raw G2 vector is compared with the real target in `gate-results.json`. No gate tolerance changed. The trend dial p10/p90 endpoints were separately constrained to the real 120-weekday VR p10–p90 bands; raw observed trend percentiles remain in `profile.json`, and inputs outside the constraint are labelled `EXTRAPOLATION`.

## Realism gate table

| Statistic | Real | Real bootstrap 95% CI | Synthetic | Tolerance | Result |
| --- | --- | --- | --- | --- | --- |
| G1 return kurtosis ATR | 141.787424 | 8.607719–463.937721 | 33.618512 | wider of ±20% (28.36) or real-data 120-weekday moving-window bootstrap 95% CI | PASS |
| G2 abs return ACF lag1 | 0.299551 | 0.179604–0.336934 | 0.238883 | wider of ±20% (0.05991) or real-data 120-weekday moving-window bootstrap 95% CI | PASS |
| G2 abs return ACF lag6 | 0.162201 | 0.043622–0.205498 | 0.168649 | wider of ±20% (0.03244) or real-data 120-weekday moving-window bootstrap 95% CI | PASS |
| G2 abs return ACF lag48 | 0.187953 | 0.046138–0.232282 | 0.155055 | wider of ±20% (0.03759) or real-data 120-weekday moving-window bootstrap 95% CI | PASS |
| G3 mean range ATR | 0.982434 | 0.977652–0.988232 | 0.937558 | wider of ±20% (0.1965) or real-data 120-weekday moving-window bootstrap 95% CI | PASS |
| G3 body share | 0.460199 | 0.445057–0.483687 | 0.457804 | wider of ±20% (0.09204) or real-data 120-weekday moving-window bootstrap 95% CI | PASS |
| G3 upper wick share | 0.265030 | 0.255424–0.276290 | 0.271441 | wider of ±20% (0.05301) or real-data 120-weekday moving-window bootstrap 95% CI | PASS |
| G3 lower wick share | 0.274771 | 0.257541–0.288027 | 0.270755 | wider of ±20% (0.05495) or real-data 120-weekday moving-window bootstrap 95% CI | PASS |
| G4 gap frequency | 0.018280 | 0.004082–0.024174 | 0.018328 | wider of ±20% (0.003656) or real-data 120-weekday moving-window bootstrap 95% CI | PASS |
| G4 gap median ATR | 0.111124 | 0.071705–0.629315 | 0.109964 | wider of ±20% (0.02222) or real-data 120-weekday moving-window bootstrap 95% CI | PASS |
| G4 gap p95 ATR | 1.215481 | 0.429190–2.965542 | 1.163868 | wider of ±20% (0.2431) or real-data 120-weekday moving-window bootstrap 95% CI | PASS |
| G5 EAT 0-4 share | 0.094561 | 0.068897–0.140636 | 0.112566 | wider of ±20% (0.01891) or real-data 120-weekday moving-window bootstrap 95% CI | PASS |
| G5 EAT 4-8 share | 0.144346 | 0.124725–0.169034 | 0.152823 | wider of ±20% (0.02887) or real-data 120-weekday moving-window bootstrap 95% CI | PASS |
| G5 EAT 8-12 share | 0.169854 | 0.153645–0.186956 | 0.167884 | wider of ±20% (0.03397) or real-data 120-weekday moving-window bootstrap 95% CI | PASS |
| G5 EAT 12-16 share | 0.185057 | 0.146537–0.221882 | 0.175781 | wider of ±20% (0.03701) or real-data 120-weekday moving-window bootstrap 95% CI | PASS |
| G5 EAT 16-20 share | 0.266406 | 0.221865–0.302912 | 0.235616 | wider of ±20% (0.05328) or real-data 120-weekday moving-window bootstrap 95% CI | PASS |
| G5 EAT 20-24 share | 0.139777 | 0.111069–0.159367 | 0.155330 | wider of ±20% (0.02796) or real-data 120-weekday moving-window bootstrap 95% CI | PASS |
| G6 variance ratio 8 | 0.965965 | 0.906777–1.058741 | 0.955888 | fixed ±0.05 absolute | PASS |
| G6 variance ratio 16 | 0.963961 | 0.875945–1.099129 | 0.964265 | fixed ±0.05 absolute | PASS |
| G7 daily range ATR median | 7.569537 | 7.017905–8.087323 | 8.479383 | wider of ±20% (1.514) or real-data 120-weekday moving-window bootstrap 95% CI | PASS |
| G7 daily range ATR p90 | 12.599122 | 10.813547–13.724963 | 14.323898 | wider of ±20% (2.520) or real-data 120-weekday moving-window bootstrap 95% CI | PASS |

G6 uses the fixed absolute tolerance in the prompt. All other numeric tolerances use the wider of their ±20% band and the real-data moving-window bootstrap 95% interval shown above.

**Metric definitions:** G1 is Pearson kurtosis (normal = 3) of close-to-close log returns divided by prior Wilder ATR(14)/prior close. G2 is the ACF of absolute raw close-to-close log returns at the indicated bar lags. G3 uses bar high-low divided by Wilder ATR(14), absolute body/range, and the two wick/range shares. G4 defines a time gap as a timestamp interval greater than 30 minutes; size is absolute log(open/prior close) divided by prior ATR/close. G5 sums each bar's high-low range inside each EAT block, divides by the day's sum of bar ranges, then averages shares across weekdays. G6 uses overlapping q-bar close-to-close log-return sums divided by q times one-bar variance. G7 is daily high-low divided by the median in-day Wilder ATR(14), summarized by median and p90.

### Structural repair log and stop point

- **Historical Stage 1:** two earlier repairs addressed candle-shape coupling and a uniform daily-volatility innovation shrink; the f455 report preserves those details and the raw-G2 metric audit.
- **Stage 1b, attempt 1/1:** installed the single two-timescale slow-plus-fast log-volatility structure and fit its shared parameters jointly to real raw absolute-return ACF lags 1, 6, and 48. No per-lag multipliers, per-bin patches, or tolerance changes were used.
- **Stage 1b result:** **PASSED**. All 21 G1–G7 statistics, G8, the five primary D1 checks, and the constrained trend endpoints pass.
- **Diagnosis:** the two-timescale volatility fit brings raw G2 into the unchanged allowed ranges; no remaining numeric gate failure.
- D1 news-spike intensity remains measured as the fraction of bars whose labels route them to the empirical tail pool; no strategy or outcome statistic is used.

### G8 invariant, determinism, and parser checks

| G8 check | Real | Synthetic | Tolerance | Result |
| --- | --- | --- | --- | --- |
| OHLC, price, timestamp and weekday invariants | 79270 reference bars valid | 110180 / 110180 generated bars valid | all generated rows valid; 120 weekdays per path | PASS |
| Determinism | not applicable | 20 / 20 same-seed SHA-256 matches | byte-identical candles + labels + CSV per seed | PASS |
| Engine CSV parser round-trip | not applicable | 110180 / 110180 rows parsed unchanged | zero parser errors; exact OHLC/timestamp round-trip | PASS |

## Calibration profile summary

The profile is based on 79,270 weekday OHLC rows across 1,727 source weekdays; 1,727 days with at least 24 bars can donate a schedule. Within-day return residuals are sampled from the centered, volatility- and session-standardized real return pool; tail observations above the real |z| 97.5th percentile are separated so the news-spike-intensity dial controls their frequency. Volatility is the sum of a slow daily log-volatility AR(1) and a fast per-bar AR(1) log-volatility component. The slow component's baseline is fitted to real daily volatility; the final slow persistence/scale and fast variance are jointly fit against raw absolute-return ACF at lags 1, 6, and 48. The fast component's initial persistence is fitted to within-day standardized-residual absolute-return ACF. Bar range and upper/lower wick proportions are bootstrapped together from real candles conditional on estimated range/ATR thirds. Continuous, session, and multi-day gaps use separate empirical pools.

London and New York each have a 48-slot local half-hour seasonality profile. Their exchange-local factors are combined and normalized, so the same EAT timestamp can map to different local session slots across the independent DST transitions.

| Dial | p10 | p50 default | p90 | Unit |
| --- | --- | --- | --- | --- |
| volatilityLevel | 0.00079830 | 0.00123003 | 0.00217564 | daily standard deviation of 30-minute close/open log returns |
| drift | -0.01234400 | 0.00071501 | 0.01287576 | within-session daily log return, log(last close / first open) |
| trendiness | -0.09405640 | -0.04303636 | 0.00452192 | rolling 20-weekday lag-1 ACF of standardized returns |
| gapSize | 0.01658094 | 0.10949466 | 0.64902937 | absolute session/weekend gap divided by prior Wilder ATR(14) |
| newsSpikeIntensity | 0.01665558 | 0.02433628 | 0.03358876 | fraction of bars above the empirical \|z\| 97.5th-percentile tail threshold |

The source has negative within-session daily log returns on 46.3% of eligible weekdays and near-flat returns on 8.3% using the declared threshold 0.00083247. **Caveat:** 2020–2026 is mostly a bull-market sample; down and flat drift ranges are therefore thin and should not be mistaken for a balanced long-history drift prior.

**G5 resolution:** six 4-hour EAT blocks are used instead of 24 separate hours. This is deliberate and was specified before the v2 run because the planned uses depend on session shape, not each hour's exact level.

## D1 dial checks

Each dial was varied alone while the other dials and the 20 matched seeds were held fixed. The four non-trend dials use the source p10/p90 settings. Trendiness uses the constrained endpoints; its required D1 movement remains at least half the original observed real trend p10–p90 target span.

| Dial | Target statistic | p10 setting | p90 setting | Observed low | Observed high | High−low | Required move | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| volatilityLevel | median daily log-return volatility | 0.00079830 | 0.00217564 | 0.00077204 | 0.00210366 | 0.00133162 | ≥ 0.00068867 | PASS |
| drift | mean within-session daily log return | -0.01234400 | 0.01287576 | -0.01268405 | 0.01253626 | 0.02522031 | ≥ 0.01260988 | PASS |
| trendiness | lag-1 ACF of standardized returns | -0.06972971 | 0.00452192 | -0.08677013 | -0.02069352 | 0.06607661 | ≥ 0.04928916 | PASS |
| gapSize | median absolute event gap / ATR | 0.01658094 | 0.64902937 | 0.01479762 | 0.58115546 | 0.56635784 | ≥ 0.31622422 | PASS |
| newsSpikeIntensity | fraction of bars routed to the real standardized-return tail pool (per-bar labels) | 0.01665558 | 0.03358876 | 0.01653921 | 0.03362337 | 0.01708416 | ≥ 0.00846659 | PASS |

### Suggested trend-dial variance-ratio bound

Both trendiness endpoints are constrained so their 20-seed VR8/VR16 readings remain within the empirical real 120-weekday moving-window p10–p90 bands. Raw observed trend percentiles are preserved in the profile; out-of-bound user settings are allowed only with explicit `EXTRAPOLATION` labels. This is separate from the fixed normal-setting G6 gate.

| Variance ratio | Real 120-weekday p10–p90 | Raw p10 setting → value | Raw p90 setting → value | Constrained p10 setting → value | Constrained p90 setting → value | Constrained endpoints |
| --- | --- | --- | --- | --- | --- | --- |
| G6_variance_ratio_8 | 0.919681–1.033335 | -0.094056 → 0.886235 | 0.004522 → 1.030955 | -0.069730 → 0.919694 | 0.004522 → 1.030955 | PASS |
| G6_variance_ratio_16 | 0.899694–1.052419 | -0.094056 → 0.873369 | 0.004522 → 1.027456 | -0.069730 → 0.908872 | 0.004522 → 1.027456 | PASS |

**Endpoint bound:** PASS. the raw mean-reverting endpoint was constrained from -0.094056 to -0.069730; both bounded endpoints keep VR8 and VR16 within the real moving-window p10–p90 bands.

Non-target changes (high setting minus low setting) across every reported G1–G7 statistic:

- **volatilityLevel:** G1_return_kurtosis_ATR: -0.04618; G2_abs_return_ACF_lag1: +0.00028; G2_abs_return_ACF_lag6: +0.00022; G2_abs_return_ACF_lag48: +0.00003; G3_mean_range_ATR: -0.00006; G3_body_share: +0.00087; G3_upper_wick_share: -0.00082; G3_lower_wick_share: -0.00005; G4_gap_frequency: +0.00000; G4_gap_median_ATR: -0.00058; G4_gap_p95_ATR: -0.00097; G5_EAT_0-4_share: -0.00016; G5_EAT_4-8_share: -0.00013; G5_EAT_8-12_share: +0.00010; G5_EAT_12-16_share: -0.00020; G5_EAT_16-20_share: +0.00024; G5_EAT_20-24_share: +0.00015; G6_variance_ratio_8: +0.00002; G6_variance_ratio_16: -0.00010; G7_daily_range_ATR_median: -0.00791; G7_daily_range_ATR_p90: +0.07182
- **drift:** G1_return_kurtosis_ATR: +1.75957; G2_abs_return_ACF_lag1: -0.00076; G2_abs_return_ACF_lag6: -0.00358; G2_abs_return_ACF_lag48: -0.00087; G3_mean_range_ATR: +0.00579; G3_body_share: +0.00140; G3_upper_wick_share: +0.00405; G3_lower_wick_share: -0.00545; G4_gap_frequency: +0.00000; G4_gap_median_ATR: +0.00026; G4_gap_p95_ATR: +0.00153; G5_EAT_0-4_share: -0.00191; G5_EAT_4-8_share: -0.00144; G5_EAT_8-12_share: -0.00161; G5_EAT_12-16_share: +0.00032; G5_EAT_16-20_share: +0.00302; G5_EAT_20-24_share: +0.00161; G6_variance_ratio_8: +0.00011; G6_variance_ratio_16: +0.00213; G7_daily_range_ATR_median: +0.27613; G7_daily_range_ATR_p90: +0.15066
- **trendiness:** G1_return_kurtosis_ATR: -0.04774; G2_abs_return_ACF_lag1: -0.00140; G2_abs_return_ACF_lag6: +0.00061; G2_abs_return_ACF_lag48: +0.00066; G3_mean_range_ATR: -0.00004; G3_body_share: -0.00013; G3_upper_wick_share: +0.00013; G3_lower_wick_share: +0.00001; G4_gap_frequency: +0.00000; G4_gap_median_ATR: +0.00005; G4_gap_p95_ATR: +0.00045; G5_EAT_0-4_share: +0.00004; G5_EAT_4-8_share: +0.00013; G5_EAT_8-12_share: -0.00064; G5_EAT_12-16_share: -0.00022; G5_EAT_16-20_share: +0.00103; G5_EAT_20-24_share: -0.00033; G6_variance_ratio_8: +0.11126; G6_variance_ratio_16: +0.11858; G7_daily_range_ATR_median: +0.11718; G7_daily_range_ATR_p90: +0.19630
- **gapSize:** G1_return_kurtosis_ATR: +600.01019; G2_abs_return_ACF_lag1: -0.21072; G2_abs_return_ACF_lag6: -0.13672; G2_abs_return_ACF_lag48: -0.13503; G3_mean_range_ATR: -0.01792; G3_body_share: -0.00083; G3_upper_wick_share: +0.00047; G3_lower_wick_share: +0.00036; G4_gap_frequency: +0.00000; G4_gap_median_ATR: +0.56636; G4_gap_p95_ATR: +6.88702; G5_EAT_0-4_share: +0.00014; G5_EAT_4-8_share: +0.00089; G5_EAT_8-12_share: -0.00031; G5_EAT_12-16_share: -0.00001; G5_EAT_16-20_share: -0.00009; G5_EAT_20-24_share: -0.00062; G6_variance_ratio_8: +0.02663; G6_variance_ratio_16: +0.02425; G7_daily_range_ATR_median: -0.13439; G7_daily_range_ATR_p90: -0.15978
- **newsSpikeIntensity:** G1_return_kurtosis_ATR: -0.25769; G2_abs_return_ACF_lag1: -0.01615; G2_abs_return_ACF_lag6: -0.01079; G2_abs_return_ACF_lag48: -0.01371; G3_mean_range_ATR: -0.00211; G3_body_share: -0.00050; G3_upper_wick_share: +0.00011; G3_lower_wick_share: +0.00039; G4_gap_frequency: +0.00000; G4_gap_median_ATR: +0.00040; G4_gap_p95_ATR: -0.00099; G5_EAT_0-4_share: -0.00047; G5_EAT_4-8_share: +0.00015; G5_EAT_8-12_share: -0.00026; G5_EAT_12-16_share: -0.00015; G5_EAT_16-20_share: -0.00061; G5_EAT_20-24_share: +0.00135; G6_variance_ratio_8: +0.00720; G6_variance_ratio_16: +0.01519; G7_daily_range_ATR_median: +0.16834; G7_daily_range_ATR_p90: +0.32873

## Assumptions and unverified items

- Stage 0 evidence supports fixed EAT timestamps; the `(UTC)` section-marker conflict remains a source-provenance uncertainty. The generated file follows the engine's unzoned EAT parser contract.
- Only weekday dates with at least 24 source rows provide schedule templates and daily-volatility/daily-drift observations. Incomplete/shorter weekdays and weekends are not emitted as target weekdays. Multi-day price gaps are labeled as weekend gaps; the empirical pool can include other multi-day closures.
- “News spike” is a statistical tail proxy (absolute standardized return above the real 97.5th percentile), not an economic-news calendar or event attribution.
- The trendiness band is derived from rolling 20-weekday lag-1 autocorrelation of standardized returns. This is a bounded AR(1) dial, not a statement about a strategy edge.
- Volatility and drift dial units are daily within-session market statistics; the drift dial adds a constant daily log-return shift apportioned evenly across that day's bars. The start price defaults to the real weekday median close and is separate from the five calibrated dials.
- Synthetic prices are rounded to $0.01. CSV metadata carries the parser-compatible static $0.20 spread string but no spread is applied to prices.
- Time-zone behavior uses the runtime's IANA/Intl database; the tzdata version is not pinned.
- The round-trip gate calls the engine CSV parser only. No analyzer strategy evaluation or strategy result is part of this stage.

## Out-of-scope working-tree edits

These paths were already present in `git status --short` at task entry; they were not edited or staged for Stage 0, Stage 1b, or Stage 2. The initial local checkout was at 5b5 while the session branch's already-pushed Stage 1 commit was f455. To continue from the requested base without overwriting worktree content, local `HEAD`/index was aligned to the existing remote f455 history. The legacy `src/lib/synth/**` and `tests/synth.test.mjs` changes listed at entry match the pre-existing 9748 parent of f455; no new commit in this task stages them. Remaining out-of-scope edits after aligning to f455 were:

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
?? AUDIT-ARENA-2026-10-01.md
?? src/components/ServerAccessPanel.tsx
?? src/lib/app-access-client.ts
?? src/lib/mt5/validation.ts
?? src/lib/server-access.ts
?? tests/mt5-routes.test.mjs
?? tests/mt5-safety.test.mjs
```

The complete pre-alignment `git status --short` snapshot, including the legacy paths that now match existing f455 history, was:

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

## Output hashes

The separate `SHA256SUMS.txt` lists SHA-256 for the report, source modules, tests, script, profile, gate results, and sample outputs. The report's own digest is in that manifest (a file cannot contain its own final digest).

| Output | SHA-256 |
| --- | --- |
| profile.json | 6a5a387c00929697fda3ffdd3c32e866ca0c275a18e175a3969965ee60df2203 |
| normal-seed-1.csv | 1f27ef38a563a82f57d0ccf39148c3b9070603c6da766e79e7e12a4fe9ee8a72 |
| normal-seed-1.candles.json | 129bb15bd710c1bc8de0d322dd9ddcc18a8dbf7157b8cca6af9cb00fd35fee6c |
| normal-seed-1.labels.json | f8d331c61207b932becb3609bc5d0db22e1b15a6fc657839658dbed2035dde4d |
| gate-results.json | af6084881afba94bc1f916ddc2c87e1fb7d9d51c3b789457ac4ffe8a6ed0470a |

## Stage result

- G1–G7 numeric gates: **21/21 PASS**.
- G8 checks: **PASS**.
- D1 primary dial-movement checks: **5/5 PASS**; suggested trend-endpoint variance-ratio bound: **PASS**.
- Stage 1b structural changes: **1/1**.
- No regime plant, detector, or strategy result is reported in this Stage 1b artifact. Stage 2 is documented separately in `STAGE2-REPORT.md`.
