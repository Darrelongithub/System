# SPEC-RD — pre-registered market-statistical evaluation

**Status:** Frozen before any real-gold detector output, descriptive statistics, or forward outcome has been computed. The SHA-256 of this exact file is stored separately in `SPEC-RD.sha256`; this file is not to be edited after hashing. If an implementation defect or ambiguity is discovered, record it in `QUESTIONS.md` and report it; do not silently change this protocol.

## Frozen inputs and implementation

- Data: `XAUUSD_30min_2020-01-24_to_2026-10-01.csv`, expected and observed SHA-256 `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`.
- Detector: frozen source-tree SHA-256 `05134d0d8201dfb368579bcf373fc52a406c1c4d49b3576ad1bc8cbc5e0993f1`, copied byte-for-byte to `frozen-detector/` for a durable executable snapshot. Default resolved config SHA-256 `7504bf25fb8875ee6e5c2eb211ad50581b00f2edd7052a943ae8fc7fefa452fe`, captured as `frozen-default-config.json`.
- Use the resolved default options only; no thresholds, lookbacks, feature groups, evaluation frequency, or hysteresis are tuned. The options are `resolveRegimeDetectorConfig({})` from the frozen source.
- Only timestamps and raw OHLC from source data enter the detector. The file has no volume column; pass `volume: null`. Ignore direction, reliability, swing, ATR, strategy, and all other derived/source annotation columns. Do not filter rows on `is_reliable`; include every data row with finite, valid OHLC and strictly increasing timestamp. Remove only the metadata/header and documented section-divider lines. Do not repair or sort OHLC. If any data row fails parsing, ordering, or detector validation, stop and document it rather than silently dropping it.
- Timestamps are EAT wall-clock strings. Use their stated EAT dates without a timezone shift for split/year/week grouping. Calculations are indexed in source-bar order.
- Do not read or use any strategy/backtest/trade/R/P&L output. Do not change the detector, app, generator, or any pre-existing file.

## (a) Claims: guide-derived, not inferred from label names

The guide (`docs/MARKET-REGIME-DETECTOR.md`, especially lines 85–109) describes how current bars are classified, but makes no explicit statement that any label predicts what happens after the label bar. In particular, it does not claim trend continuation, range mean-reversion, high-volatility persistence, compression breakout/expansion, or transition behavior. The guide explicitly says that labels should be separately validated before strategy decisions depend on them (lines 127–129).

| Label | Forward claim explicitly made by the guide | Classification for this evaluation |
|---|---|---|
| `bullish-trend` | None; describes present trend/direction features, not future continuation. | DESCRIPTIVE-ONLY |
| `bearish-trend` | None; describes present trend/direction features, not future continuation. | DESCRIPTIVE-ONLY |
| `range` | None; describes present low-trend/overlap conditions, not future mean reversion. | DESCRIPTIVE-ONLY |
| `high-volatility` | None; describes present range/ATR conditions, not future volatility persistence. | DESCRIPTIVE-ONLY |
| `compression` | None; describes present low-range/low-ATR conditions, not a future expansion/breakout. | DESCRIPTIVE-ONLY |
| `transition` | None; means present evidence is ambiguous/insufficient. | DESCRIPTIVE-ONLY |

No forward hypothesis will be invented from a label's name. Part 3 reports the requested label-conditional forward statistics for transparency, but they are descriptive diagnostics, not tests of predictive claims; no PASS/FAIL claim verdict is inferred from them. Therefore the Part 1(g) claim pass bars do not apply to these labels. The report will still state the requested thresholds and apply `THIN` as a sample-size flag.

## (b) Forward horizons and eligible starts

- Horizons: `H ∈ {48, 240}` bars.
- A committed label is observed at the close of bar `t`. Forward outcomes use bars `t+1` through `t+H` only.
- Define `r_i = ln(close_i / close_(i-1))`. The 2,400-bar normalization at `t` is `base2400(t) = mean(|r_i|)` over exactly `i=t-2400,...,t-1`; it excludes `r_t` and is available before the label's close-time outcome begins.
- Use one global, deterministic, non-overlapping start grid for each H, anchored at the first bar index with 2,400 valid prior returns and a valid detector ATR(14); subsequent starts are exactly H bar indices apart. Thus forward return windows do not overlap. A start must have a complete H-bar future window and the whole forward window must end inside its assigned split/year scope. Assign a start to a split/year by the EAT date of `t`.
- Require strictly positive closes and valid finite ATR(14) at `t`; null outcomes are excluded only for the affected statistic and counted in its `n`. No other outcome-dependent filtering is allowed. `n` counts non-overlapping starts with that label and a valid outcome.

## (c) Outcomes

All returns use close-to-close raw OHLC only; no spread, costs, volume, or strategy outcomes.

1. **Forward realized-volatility ratio**
   `FVRR(t,H) = [mean(|r_i|, i=t+1,...,t+H)] / base2400(t)`.
   The reported label effect is the ratio of the label-conditional mean FVRR to the unconditional mean FVRR in the same H/scope cell (unconditional effect baseline = 1).
2. **Forward trend efficiency**
   `TE(t,H) = |sum(r_i, i=t+1,...,t+H)| / sum(|r_i|, i=t+1,...,t+H)`; undefined if the denominator is zero. Report the conditional mean and its difference from the unconditional mean (unconditional effect baseline = 0).
3. **Signed forward return in ATR(14) units**
   `SATR(t,H) = (close_(t+H) - close_t) / detector_Wilder_ATR14(t)`.
   Report each label's conditional mean and its difference from the unconditional mean (unconditional effect baseline = 0), plus the bullish-minus-bearish contrast. This uses the detector's frozen default ATR(14) at the signal close.

## (d) Stability scopes

- H1: EAT dates 2020-01-24 through 2023-06-30 inclusive.
- H2: EAT dates 2023-07-01 through 2026-10-01 inclusive.
- Also report each calendar year, 2020 through 2026, with partial first/last years as present in the archive.
- A cell's `t` and all `t+1..t+H` outcome bars must be inside that cell's date scope; this avoids crossing a half/year boundary. The preceding feature/normalization history may predate the scope and is retained as walk-forward warm-up.

## (e) Baselines and placebo

- **B1 unconditional:** same non-overlapping eligible starts and same scope/H as the label cell, with no label condition. It is the denominator for the FVRR ratio and the mean subtracted for TE/SATR effects.
- **B2 naive volatility comparator:** at each `t`, calculate trailing 240-bar mean absolute log return through `t`. Classify it into low/middle/high tercile using empirical 1/3 and 2/3 quantiles of the trailing 2,400 prior observations of that same 240-bar statistic, ending at `t-1` (no future quantile fitting). Report low- and high-tercile FVRR outcomes/effects versus B1 for each cell.
- **B2 naive direction comparator:** sign of the trailing 240-bar cumulative log return through `t`; report mean SATR for positive and negative signs and their positive-minus-negative contrast. Zero-sign starts are not in either directional group. No B2 is defined for trend efficiency.
- **B3 circular-shift placebo:** for each of 1,000 shifts, circularly shift the entire committed label sequence, leaving timestamps and outcome values fixed, then recompute the same label-conditioned effect for every H/scope/statistic. Shifts are unique and sampled uniformly without replacement using fixed PRNG seed `0xB3C0FFEE`. Define `D5` from the timestamp sequence as follows: for every source row `i`, find the smallest positive row offset `d_i` whose destination EAT date is at least five Monday–Friday calendar-date transitions after date `i`; continue the date sequence cyclically at the end by adding the archive's full weekday-date span. Set `D5 = max_i(d_i)`. Allowed circular offsets are integer `k ∈ [D5, N-D5]`, so both directions of every circular shift span at least five EAT weekdays. Sample 1,000 distinct offsets uniformly without replacement from that set. Report the B3 95th percentile and the empirical percentile rank of the observed effect (also report the 5th percentile for completeness on lower-tail diagnostics). This is a null diagnostic; with all labels DESCRIPTIVE-ONLY it does not confer a predictive verdict.

## (f) Uncertainty

Use a one-week block bootstrap with 2,000 resamples and 95% percentile confidence intervals. Blocks are ISO weeks (Monday–Sunday) assigned from EAT wall-clock dates. For each cell, sample its represented week blocks with replacement, retaining all eligible non-overlapping starts within a selected block and their outcomes/labels. Recompute each conditional effect and its B1 value within the same resample. Report the 2.5th and 97.5th percentiles of valid bootstrap effects. Fixed PRNG seed: `0xB00757A9`. Use the same seeded resamples for every statistic in a given scope/H cell.

## (g) Verdict rules

The guide-derived label table in (a) contains no claim-bearing label, so verdicts are `DESCRIPTIVE-ONLY`; no predictive PASS/FAIL is assigned. The requested benchmark bars are retained for interpretation should explicit claims later be supplied: a claim-bearing volatility cell would need the claimed sign, a 95% CI excluding its unconditional value, an effect beyond the appropriate B3 null tail, at least B2's effect, and a ratio ≥1.15 for high-volatility or ≤0.90 for calm; a directional claim would additionally require bullish-minus-bearish SATR ≥0.10 ATR at H=240. These conditions would have to hold in both H1 and H2 and at both horizons as specified by the task. Any cell with fewer than 200 non-overlapping label windows is marked `THIN` regardless of its descriptive point estimate/interval; THIN is a sample-size flag, not evidence for or against a claim.

## Part 2 — causality and descriptions

- Compute one full-series detection with frozen defaults. Pick 200 unique cut indices uniformly without replacement from the valid-history range through the penultimate bar using fixed PRNG seed `0xCA05A1`; compare each full-series point through `t` with a fresh `detectRegimes(bars[0..t])` run. Compare regime, candidate, changed flag, pending regime/count, confidence, and candidate confidence at every prefix bar.
- For the same 200 `t` values, replace every OHLC value after `t` with deterministic seeded, valid random OHLC while preserving timestamps and volume-null status; rerun detection and compare those same public label/hysteresis fields at all indices `≤t` to the unmodified full run. Report mismatches and require 0 for a clean result.
- Descriptions use the committed `point.regime` and `point.confidence`: per-scope/year label counts and shares, transition share, confidence mean/P10/P50/P90, flips per 1,000 bars, and per-label run-length median/P10/P90. Run lengths are reported in bars and nominal 30-minute weekday equivalents (`bars / 48`). Annual run lengths are clipped at calendar-year boundaries; the first/last partial run is retained as a clipped fragment.

## Part 3 — output format

- Report every label × horizon × H1/H2/year cell with `n`, conditional outcome/effect, 95% block-bootstrap CI, B1 value, B2 comparator(s) where defined, B3 p95/p05 and observed percentile rank, and the `DESCRIPTIVE-ONLY` / `THIN` status.
- Include the bullish-minus-bearish SATR contrast and its B1/B2/B3/bootstrap statistics in each scope/H cell.
- These are conditional market-statistical summaries only. Do not calculate or discuss trade counts, strategy returns, R, P&L, or backtester outputs.

## Part 4 — synthetic secondary analysis

Run only if the local Git object `f640c4d` is available and the generator source-file SHA-256 inventory matches that commit. Do not edit generator files. Otherwise mark Part 4 **NOT RUN / UNVERIFIED** and record why; do not substitute another generator snapshot. If verifiable, use the unchanged DESIGN cohort config, new path seeds 30001–30200 and existing NULL seeds 20001–20700, with the fixed planted-label mapping from the task. Report per-regime hit rate, three-consecutive-evaluation delay, NULL flips per weekday, all paths and the no-bar-above-10%-of-price subset/share. This is secondary and has no pass bar.
