# G0 Amendment 8 — DEV segment audit (Stage 2)

Generated 2026-11-05T07:55:35.241Z. **No strategy signals, trades, or outcomes were generated.**

## Frozen segment rule

Split at every non-DEV gap; recompute Map independently per contiguous DEV segment. Entry bars require local index ≥1,000 and 96 subsequent bars within that segment.

| Segment | First bar | Last bar | Bars | Years / bars | Warm-up excluded | Tail excluded | Eligible bars |
|---|---|---|---:|---|---:|---:|---:|
| 2004-2007 | 2004-06-11 08:00:00 | 2007-12-31 19:30:00 | 39448 | 2004: 5966 (4966 eligible); 2005: 10946 (10946 eligible); 2006: 10982 (10982 eligible); 2007: 11554 (11458 eligible) | 1000 | 96 | 38352 |
| 2009-2011 | 2009-01-02 12:00:00 | 2011-12-31 00:30:00 | 33862 | 2009: 11622 (10622 eligible); 2010: 11015 (11015 eligible); 2011: 11225 (11129 eligible) | 1000 | 96 | 32766 |
| 2013-2015 | 2013-01-02 02:00:00 | 2015-12-31 19:30:00 | 35147 | 2013: 11727 (10727 eligible); 2014: 11735 (11735 eligible); 2015: 11685 (11589 eligible) | 1000 | 96 | 34051 |
| 2017-2018 | 2017-01-03 02:00:00 | 2018-12-31 21:30:00 | 23465 | 2017: 11721 (10721 eligible); 2018: 11744 (11648 eligible) | 1000 | 96 | 22369 |

**Totals:** 131922 DEV bars; 4000 lost to segment warm-up; 384 lost to segment tails; 127538 eligible entry bars.

## Historical continuous-Map comparison (report-only)

After each segment's 1,000-bar warm-up and 96-bar tail, 127530/127538 bars agree (99.9937%). This diagnostic does not feed the A8 Map, signals, trades, baselines, or verdicts.

## Spread-sample months in sealed years (cost data only)

Of the 44 pinned spread-sample months, 30 have matched M1 bid/ask observations and 14 lack a paired sample in the current cost input. 10 of the 44 selected months are in sealed (non-DEV) years: 2012_01, 2012_06, 2012_12, 2020_03, 2021_06, 2022_09, 2023_10, 2024_04, 2025_04, 2026_01; 10 of these have paired observations. These are cost-model observations only, not strategy outcomes or entry/exit prices.

## Superseded historical inputs

The prior random baseline, year-matched baseline, power and signal-count files remain byte-preserved. They are superseded for A8 verification because they were not built with the A8 segment-boundary rules.

```text
artifacts/map-compass/random-baseline.json
artifacts/map-compass/random-baseline-daily-sums.json
artifacts/map-compass/amendment7/year-matched-baseline.json
artifacts/map-compass/signal-counts.json
artifacts/map-compass/power-projection.json
artifacts/map-compass/power-curve.json
artifacts/map-compass/amendment6/random-baseline.json
artifacts/map-compass/amendment6/signal-counts.json
artifacts/map-compass/amendment6/slot-model.json
```
