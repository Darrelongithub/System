# SPEC-RD2 — Regime detector evaluation on a clean holdout

**Status: FROZEN before reading the holdout archive, generating detector labels for evaluation, or computing any forward outcome.** The SHA-256 of this exact file is in `SPEC-RD2.sha256`. No claim, threshold, split, metric, or verdict rule below may be changed after that hash is recorded. Any implementation clarification must be documented in `QUESTIONS.md` and must not change the frozen protocol.

## 0. Frozen source and provenance

- Detector source tree: SHA-256 `05134d0d8201dfb368579bcf373fc52a406c1c4d49b3576ad1bc8cbc5e0993f1` (canonical sorted relative `.ts` path-to-file-SHA-256 manifest).
- Default resolved options: SHA-256 `7504bf25fb8875ee6e5c2eb211ad50581b00f2edd7052a943ae8fc7fefa452fe`.
- The detector is frozen at these hashes and runs with its default options. No detector, UI, app, generator, or existing test file is to be edited for this evaluation.
- Version history is checked with `git branch -r` and `git log --all -- src/lib/regime-detector docs/MARKET-REGIME-DETECTOR.md`. The fetched refs contain the new frozen-snapshot commit on the session branch, but no earlier source history on `origin/main` or another branch. Prior threshold tuning cannot be established from this history. The guide describes configurable thresholds but gives no calibration data or period. Whether any threshold was selected or adjusted after viewing gold, and on what period, remains **UNKNOWN**.
- The detector has no fixed calendar-timeframe assumption: lookbacks and hysteresis count bars, and volatility estimates are per bar rather than annualized. The primary holdout is required to be 30-minute OHLC bars as declared in the task; the Part 2 inventory must verify that. If it is not 30-minute data, stop the holdout evaluation. The holdout README is expected to specify UTC timestamps; inventory must verify/report this.

## 1. Cohorts and scope

- **Primary verdict cohort:** Dukascopy XAUUSD 30-minute bars from `data/holdout/`, with outcomes wholly within H-A (2004-01-01 through 2011-12-31 UTC) or H-B (2012-01-01 through 2019-12-31 UTC). A start is eligible only when the detector/outcome warm-up is available and its entire forward horizon remains inside that half. No window crosses a half boundary.
- **Secondary contradiction-only cohorts:** EURUSD and XAGUSD from the holdout, if present and verified as 30-minute UTC bars. They cannot upgrade a gold verdict; a significant opposite-sign effect on either secondary instrument downgrades a gold PASS to FAIL.
- **Exploratory cohort:** XAUUSD 30-minute data from 2020-01-24 through 2026-10-01, file SHA-256 `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`. Report it separately as EXPLORATORY; it cannot support or alter the primary verdict.
- If the primary gold holdout is missing, incomplete, fails the timestamp/timeframe or integrity gate, mark **HOLDOUT MISSING / UNVERIFIED** and produce no 2004-2019 verdict. Continue only with the separately labelled 2020-2026 exploratory cohort. Missing optional instruments are reported as unavailable and do not prevent the gold analysis.
- Only raw timestamp and OHLC are evaluation inputs. Ignore volume and all derived/annotation columns. Do not filter on reliability flags, repair bars, sort, silently deduplicate, or use trades, R, P&L, strategy results, or backtester outputs.

## 2. Declared claims and tested labels

Only the owner-declared claims below are tested. No other claim is inferred from a label name.

- **C1 — high-volatility:** for H in `{48, 240}`, the conditional mean forward realized-volatility ratio is at least **1.15 times** the unconditional mean.
- **C2 — range:** at H=240, the conditional mean forward trend efficiency is at most **0.90 times** the unconditional mean.
- **C3 — bullish versus bearish trend:** at H=240, mean forward signed return in ATR(14) units for bullish-trend minus bearish-trend is at least **+0.10 ATR**.
- **compression** and **transition** are **DESCRIPTIVE-ONLY**. They receive descriptive statistics but no claim test or predictive verdict.

## 3. Bar timing and outcomes

The committed label is known at the close of bar `t`; all forward outcomes use only bars `t+1` through `t+H`. Let `r_j = close[j] / close[j-1] - 1`.

- **Forward realized-volatility ratio (FVRR):** `mean(|r[t+1]| ... |r[t+H]|) / mean(|r[t-2400]| ... |r[t-1]|)`. The 2,400-return reference ends before bar `t`; starts without all 2,400 prior returns are ineligible.
- **Forward trend efficiency (FTE):** `abs(close[t+H] / close[t] - 1) / sum(|r[t+1]| ... |r[t+H]|)`. A zero denominator is undefined and the start is excluded for that outcome.
- **Signed ATR return (SATR):** `(close[t+H] / close[t] - 1) / ATR14[t]`. ATR(14) is the causal Wilder true-range average through the close of bar `t`; undefined or nonpositive ATR makes the start ineligible.
- Detector labels are produced once, chronologically, with the unchanged default options. Existing warm-up nulls are preserved. Inputs are never augmented with future values.

## 4. Independent unit, samples, and splits

- Independent unit and bootstrap block: UTC ISO calendar week (Monday-Sunday).
- Each cell's effective `n` is the number of distinct UTC ISO weeks containing at least one eligible window start assigned the target label. For C3, report bullish and bearish week counts separately and define effective `n` as the smaller count, so both sides must be supported.
- A cell with effective `n < 40` is **THIN**. Estimates may be shown, but it cannot pass.
- Verdict halves are H-A and H-B as specified above. Within each half, only starts whose full H-bar outcome ends within that same half are eligible. The B1 sample uses exactly the same eligible starts as the corresponding cell.
- For descriptive output, report committed-label frequencies, run lengths (median, p10, p90 in bars and UTC weekdays), flips per 1,000 bars, and transition share separately for H-A and H-B; report the exploratory cohort separately.

## 5. Baselines and effect orientation

All comparisons use the same eligible start population for instrument, half, and horizon. B1 is the unconditional mean outcome on that population.

- **C1 effect:** `mean(FVRR | high-volatility) / mean(FVRR | all eligible starts)`. Claimed-direction improvement is `effect - 1`; minimum improvement is `+0.15`.
- **C2 effect:** `mean(FTE | range) / mean(FTE | all eligible starts)`. Claimed-direction improvement is `1 - effect`; minimum improvement is `+0.10`.
- **C3 effect:** `mean(SATR | bullish-trend) - mean(SATR | bearish-trend)`. B1 is zero difference; claimed-direction improvement is the effect itself; minimum is `+0.10`.
- **B2, C1:** trailing 240-return realized volatility is the mean absolute close-to-close return for returns ending at `t-239` through `t` (information available at the close of `t`). The top tercile is selected using the 66.7th percentile of that predictor among eligible starts in that instrument-half. B2 effect is its conditional mean FVRR divided by B1 FVRR.
- **B2, C2:** trailing 240-return trend efficiency is `abs(close[t]/close[t-240]-1) / sum(|r[t-239]| ... |r[t]|)`. The lowest tercile is selected using the 33.3rd percentile of that predictor among eligible starts in that instrument-half. B2 effect is its conditional mean FTE divided by B1 FTE.
- **B2, C3:** classify a start bullish when the trailing 240-return close-to-close return is positive, bearish when negative; zero is unassigned. B2 effect is mean SATR in the positive group minus mean SATR in the negative group.
- Tercile cut points use predictor values only, separately per instrument and half; no forward outcome is used to set a cutoff. Use the type-7 linear-interpolation empirical quantile (`h=(n-1)p`) at p=1/3 and 2/3. Compare B2 and detector effects in claimed-direction improvement units: C1 higher is better, C2 lower is better, C3 higher is better.

## 6. Placebo and uncertainty

- Randomness uses xorshift32: update unsigned 32-bit state by `x ^= x << 13; x ^= x >>> 17; x ^= x << 5` (after each step coerce to uint32), and return `(x >>> 0) / 2^32`. To sample k distinct indexes from a sorted candidate list, run descending Fisher-Yates from the last index to the first using `j=floor(U*(i+1))`, then take the first k entries.
- **B3:** for each instrument, circularly shift the chronological committed-label sequence by a uniformly selected row offset, without replacement, from admissible offsets that move labels by at least five UTC Monday-Friday trading dates, including cyclic wraparound. Use 1,000 unique offsets. Apply each shifted sequence to the unchanged eligible outcomes and compute the same claimed-direction improvement statistic for every claim, horizon, and half. Report the B3 95th percentile and finite-shift count. Use seed `0x2e2d2001 XOR instrumentCode` (`XAUUSD=0`, `EURUSD=1`, `XAGUSD=2`); for the exploratory gold cohort use `XAUUSD=0`. If fewer than 1,000 admissible offsets exist, report the shortfall and do not silently reuse offsets.
- **95% CI:** week-block bootstrap with 2,000 resamples. Resample UTC ISO weeks with replacement within the instrument-half; include every eligible start from each sampled week with its multiplicity. Recompute the conditional effect and B1 within each resample. For C3 recompute the bullish-minus-bearish difference. Report type-7 2.5th and 97.5th percentiles and valid-resample count. Initialize the cell PRNG from `0x2e2d2002 XOR (instrumentCode << 24) XOR (halfCode << 16) XOR (claimCode << 8) XOR H`, where half codes are H-A=1/H-B=2/EXPLORATORY=3, claim codes are C1=1/C2=2/C3=3; use type-7 quantiles for B3 percentiles too.
- Directional B3 comparison is made on the claimed-improvement scale above: the observed improvement must exceed the B3 95th percentile for each claim cell. Thus for C2 (lower FTE is the claim), lower raw ratios correspond to larger improvement; its null comparison is not reversed by treating a lower value as an upper-tail failure.

## 7. Cell and claim verdict rules

A non-THIN cell meets the statistical conditions only when all apply:

1. The effect has the claimed sign and its 95% CI excludes B1 in the claimed direction (C1 lower CI bound above ratio 1; C2 upper CI bound below ratio 1; C3 lower CI bound above difference 0).
2. The claimed-direction improvement exceeds the B3 95th percentile.
3. The effect meets the minimum in Section 5.
4. The claimed-direction improvement is at least B2's.

Cell labels: **PASS** when all conditions hold; **NO ADDED VALUE** when only the B2 comparison fails; **FAIL** when any other statistical condition fails; **THIN** when effective `n < 40`.

For each claim, report the primary gold cell for every required horizon and both halves. Claim-level precedence: **FAIL** if any non-THIN cell fails a condition other than B2; otherwise **THIN** if any required cell is THIN; otherwise **NO ADDED VALUE** if at least one cell misses only B2; **PASS** only if every required cell passes. The C1 claim requires all four H-by-half cells; C2 and C3 each require both half cells.

Secondary EURUSD/XAGUSD results are contradiction-only. An opposite-sign cell means C1 ratio < 1 with CI upper bound < 1, C2 ratio > 1 with CI lower bound > 1, or C3 difference < 0 with CI upper bound < 0. If either secondary instrument has an opposite-sign effect in a corresponding claim/horizon/half cell, mark the contradiction and downgrade a primary gold **PASS** to **FAIL**. Secondary results never upgrade or replace a gold verdict. Exploratory 2020-2026 cells have no verdict.

## 8. Causality test

On the gold holdout, sample 100 unique cut indices uniformly without replacement from valid detector-output indices after the 2,400-bar warm-up, using the xorshift32/Fisher-Yates procedure in Section 6 and seed `0x2e2d2100`. At each cut `t`, run the unchanged default detector on the full sequence and on prefix `bars[0..t]`; compare every committed label, candidate label, changed flag, pending regime/count, confidence and candidate confidence at every bar through `t`, including final hysteresis state. Required mismatches: **zero**. Report all cut indices and mismatch counts. This is a truncation-invariance check, not external certification.

## 9. Holdout fallback and integrity gates

Part 2 inventories the archive and extracted files before analysis: names, columns, row counts, first/last timestamps, per-file SHA-256, duplicate timestamps, OHLC bar geometry, timestamp timezone and all timestamp gaps exceeding five business weekdays outside holidays. Use only holiday information explicitly supplied in the holdout README; if none is supplied, state that limitation and report the gaps without external holiday data. Do not repair or silently remove rows. Any duplicate timestamps, invalid OHLC geometry, or non-chronological sequence makes that file unusable for detector evaluation; report it and do not silently filter, sort or deduplicate it. The expected nominal interval is 30 minutes; if the primary gold holdout is not 30-minute UTC data, stop the holdout run. Copy the gold 2020-2026 input from `origin/main` and stop if its SHA-256 differs from the value in Section 1.

If the primary holdout is absent from `origin/main` or the archive lacks its gold file, report **HOLDOUT MISSING** and continue only with the 2020-2026 exploratory analysis. This SPEC is frozen before opening or parsing holdout file contents; Part 2 inventory is the first permitted inspection.
