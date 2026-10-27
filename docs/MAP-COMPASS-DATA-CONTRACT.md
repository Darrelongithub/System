# G1 Data Contract — Map / Compass

**Signed off 2026-10-26. Verdict: PASS** (`artifacts/map-compass/dst-verification.json`).

This is the provenance and timezone contract for every dataset in the new
pipeline. It exists because the naive assumption — "the Kaggle CSV timestamps
are in the same convention as the existing analyzer" — was **false**, and would
have silently shifted every session by an hour across most of the DEV period.

---

## 1. Sources

All external bytes are pinned by git blob oid in
`scripts/map-compass/pins.json` and verified by `fetch-data.mjs` using git's
own blob-hash formula. A URL is never trusted on its own.

| Source                                                                                                                                                                                       | Instrument / TF                   | Coverage                         | Price side                | License          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------- | ------------------------- | ---------------- |
| [Kaggle: novandraanugrah/xauusd-gold-price-historical-data-2004-2024](https://www.kaggle.com/datasets/novandraanugrah/xauusd-gold-price-historical-data-2004-2024) (`archive.zip` on `main`) | XAUUSD M30, M15, M1h, M4h, D1, M1 | 2004-06-11 → 2026-01-30          | **bid** (verified)        | CC0              |
| [kevingtlin/Market-Data-Lab](https://github.com/kevingtlin/Market-Data-Lab)                                                                                                                  | XAUUSD **M1 bid + ask**           | 2010-01 → 2026-10, monthly files | both                      | research dataset |
| [ejtraderLabs/historical-data](https://github.com/ejtraderLabs/historical-data)                                                                                                              | EURUSD M30                        | 2012-11 → 2022-03                | single OHLC (unspecified) | repo dataset     |

**Price side was measured, not assumed.** Comparing the Kaggle M30 close
against genuine Dukascopy M1 for June 2015: median difference vs **bid = −0.035**,
vs ask = −0.352. The Kaggle series is bid.

The Kaggle dataset's own data card states OHLC + tick volume, CC0, monthly
updates. It does **not** state timezone, price side, or day-rollover convention.
Those three were resolved empirically below.

## 2. Timezone — the two-epoch finding

`src/lib/analyzer/time.ts` interprets every naive timestamp as **fixed EAT
(UTC+3)**, with sessions asian 01:00–10:59, london 11:00–15:59, ny 16:00–00:59.
EAT has no DST.

The Kaggle file is **broker-local wall clock following EU DST**, and it is
stitched from **two exports with different base offsets**:

```
EPOCH A   2004-06-11 .. 2011-05-06    broker = UTC+1 winter / UTC+2 summer
EPOCH B   2011-05-09 .. 2026-01-30    broker = UTC+2 winter / UTC+3 summer

EU DST for both: last Sunday of March 01:00 UTC -> last Sunday of October 01:00 UTC.
```

Conversion to fixed EAT is therefore:

```
epoch A:  EAT = broker_local + (EU summer ? 1h : 2h)
epoch B:  EAT = broker_local + (EU summer ? 0h : 1h)
```

### 2.1 How it was verified

`verify-dst.mjs` aggregates independent Dukascopy **UTC** M1 bid into 30-minute
buckets and scores three candidate rules over 44 sampled months (2010–2026):

| Rule      | Meaning                                                                 |
| --------- | ----------------------------------------------------------------------- |
| TWO_EPOCH | shipped rule above                                                      |
| ONE_EPOCH | EU DST, UTC+2/+3 throughout (what 2020-only data suggests)              |
| NO_DST    | treat broker-local as fixed EAT (what the old pipeline effectively did) |

PASS required: TWO_EPOCH median error < 0.75 in every month; strictly better
than NO_DST in every winter month; strictly better than ONE_EPOCH in every
pre-seam month; identical to ONE_EPOCH in every post-seam month. Months
straddling the seam are excluded from the equality test but still require low
error.

Result: **PASS**, 44 months, 20 winter, 16 pre-seam. Representative numbers:

| Month   | Season | Epoch | TWO_EPOCH | ONE_EPOCH | NO_DST |
| ------- | ------ | ----- | --------- | --------- | ------ |
| 2010-01 | winter | A     | **0.321** | 1.333     | 1.960  |
| 2011-04 | summer | A     | **0.130** | 1.181     | 1.181  |
| 2011-06 | summer | B     | **0.141** | 0.141     | 0.141  |
| 2020-03 | winter | B     | **0.062** | 0.062     | 3.052  |
| 2026-01 | winter | B     | **0.205** | 0.205     | 8.365  |

Residual errors are nonzero because the two providers' bid feeds differ
slightly; they are not misalignment.

The 2020–2024 EU DST boundary was additionally cross-checked against the repo's
main CSV: **1,275 days, 0 mismatches**, with transitions on the last Sunday of
March/October as expected.

### 2.2 The seam

The boundary is `2011-05-09 01:00:00` broker-local. It is **price-continuous**:
2011-05-06 22:30 close 1495.00 → 2011-05-09 01:00 open 1494.25 (a normal
weekend gap). But the **day boundary changes**: epoch A days run 01:00–22:30
(44 bars), epoch B 01:00–23:30 (46 bars). Epoch A is missing the first hour of
the trading day. Yearly mean 30m volatility shows no discontinuity at the seam,
so this is a timezone/session relabel, not a different price feed.

An earlier implementation used string comparison against the boundary and
misclassified the exact boundary bar, producing non-monotonic output. This is
now a numeric comparison with a regression test.

### 2.3 No weekend bars → no ambiguous hour

The series contains **zero Saturday/Sunday rows** (weekday histogram is Mon–Fri
only). EU DST transitions happen on Sundays at 01:00 UTC, so the local times
that are ambiguous (autumn) or nonexistent (spring) never contain a candle.
A pure date-based rule is therefore exact, with no need to resolve the
repeated hour.

### 2.4 Coverage limitation

Dukascopy XAUUSD history in the reference repo starts **2010-01-01**. So epoch
A is independently verified only for 2010-01 → 2011-05. The conversion for
**2004-06 → 2009-12 is extrapolated** and flagged LOW-CONFIDENCE in the
manifest. M2 must check per-year bucket coverage there, and any result that
depends on those years must be reported both with and without them.

## 3. EURUSD

`EURUSDm30.csv` has a fixed 00:00–23:30 clock with **no DST** (first-bar clock
is 00:00 in every month), no weekend bars, and prices scaled ×1e5
(`127319.0` → `1.27319`). It is assumed UTC and converted to EAT by +3h, then
prices divided by 1e5.

Its provider and timezone are **unverified**. It is a **M9 diagnostic only** —
never a VAL gate. If a claim fails on EURUSD, that is a warning about
generality, not a kill.

## 4. Canonical output schema

`normalize.mjs` writes LF-only CSV with a `# metadata:` JSON header line:

```
datetime,open,high,low,close,volume
```

- `datetime`: EAT wall clock, no offset suffix, `YYYY-MM-DD HH:MM:SS`
- prices: plain decimals; volume: tick volume
- **plain OHLCV only.** No enriched columns, no swing context, no HTF trend.

The Map computes all causal features from these bars. `DENYLIST` in
`frozen.mjs` names the hindsight columns from the old generator that must never
appear. A test pins the header exactly.

Outputs:

| File                            | Bars    | Coverage                |
| ------------------------------- | ------- | ----------------------- |
| `normalized/xauusd-m30-eat.csv` | 248,912 | 2004-06-11 → 2026-01-30 |
| `normalized/xauusd-m15-eat.csv` | 494,235 | intrabar audit layer    |
| `normalized/eurusd-m30-eat.csv` | 115,200 | 2012-11 → 2022-03       |

The vendor 1h/4h/d1/1Month files are **not normalised**. The engine derives
H1/H4/D1 from M30 via `aggregate30m` in `structure.ts`, with its own EAT
bucketing. Using the vendor daily bars would introduce a second, incompatible
day-rollover convention and silently break PDH/PDL and pivots.

## 5. Known holes

`gap-report.json` enumerates all intra-week gaps > 2h. The material ones:

| Gap                                 | Length          | Missing            |
| ----------------------------------- | --------------- | ------------------ |
| 2025-09-12 23:30 → 2025-10-15 07:30 | ~776h / 32 days | ~900 bars          |
| 2026-01-13 14:00 → 2026-01-22 18:30 | ~220h / 9 days  | ~300 bars          |
| 2005-11-23 → 2005-11-28             | ~110h           | holiday-period gap |
| 2006-11-22 → 2006-11-27             | ~102h           | holiday-period gap |

2025 has 10,759 bars vs ~11,800 typical; 2026 has 636 (data ends Jan 30).
These windows must be trimmed from evaluation, not silently included.

M15 intrabar coverage is **98.56%** of M30 bars. The remaining 1.44% lack one
or both sub-bars and fall back to the conservative M30 intrabar rule.

## 6. Two feeds, do not stitch

The Kaggle file and the repo's `XAUUSD_30min_2020-01-24_to_2026-10-01.csv`
are **different feeds**. Median close difference on shared timestamps:

| Year      | Median \|diff\| | p95     |
| --------- | --------------- | ------- |
| 2020–2024 | 0.11–0.28       | 4.6–5.7 |
| 2025      | 2.27            | 15.7    |
| 2026      | 8.38            | 59.6    |

Worst single disagreement −355 at 2026-01-29 17:00. Never concatenate them.
The 2020–2026 overlap is instead used as a **cross-feed sensitivity test** in
M9: a claim that holds on both feeds is stronger than one that holds on either.

## 6.1 Holdout feature bleed (measured — `seal-audit.json`)

The sealed years are **not perfectly sealed**. Trailing lookbacks cross role
boundaries: a 500-bar ATR-percentile window reaches into a holdout year for
**1.14%** of DEV bars, and a 1000-bar warm-up for **2.27%**. The bleed is
confined to the first bars of DEV years **2009, 2013 and 2017** (each follows a
holdout year).

What does and does not leak:

- Holdout **prices** contribute to causal trailing features of adjacent DEV bars.
- No holdout **outcome** enters any statistic: `verifyClaim` filters to DEV
  years before computing mean / t / totalR (a test injects +99R into holdout
  years to pin this).
- The Map has **zero fitted parameters** — thresholds are frozen constants — so
  holdout prices cannot tune anything.
- Features are causal: holdout bars are in the _past_ of affected DEV bars. No
  lookahead.

Residual risk: the researcher's regime intuition for 2008/2012/2016/2019 is
slightly informed by adjacent DEV bars. Small and declared, not eliminated.

**Mitigation (pre-registered):** M10 must report results both including and
excluding the first 1000 bars of each boundary DEV year. That is a fixed
sensitivity, not a post-hoc choice.

## 6.2 VAL and STRESS contamination (declared)

- **VAL 2020–2024 was examined in earlier project work** (golden baseline,
  filter research, regime statistics). These specific claims were never fitted
  on it, but the researcher's priors about how gold behaved then are informed.
  VAL is one-shot OOS but is **not** the sole confirmatory evidence; the
  interleaved sealed years (2008, 2012, 2016, 2019) carry the final
  confirmatory weight at M10. Any VAL-driven rule change starts a NEW cycle.
- **STRESS 2025–2026 includes the old discovery window** (2025-11 → 2026-08).
  Diagnostic only; it can never promote a claim.

## 7. Roles (frozen)

See `BLUEPRINT.md` §4 and `frozen.mjs`. HOLDOUT years (2008, 2012, 2016, 2019)
are sealed and interleaved across eras. No DEV process may read them.

## 8. Manifest

`artifacts/map-compass/data-manifest.json` records dataset SHA-256 hashes,
coverage by year, session counts, roles, denylist, gaps, cost-model hash, and
warnings. `tests/map-compass/data-contract.test.mjs` re-verifies blob oids,
LF-only output, header, monotonicity, roles, cost table and manifest integrity.
