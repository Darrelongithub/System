# Filter research report (v1.8)

Date: 2026-09-16
Scope: how the v1.8 filter (Filter F) was found, verified and shipped — and which
better-looking candidates were **not** shipped, with the evidence that rejected them.

Data: `artifacts/strategy-research/all-trades.jsonl` (user-supplied batch research table,
2,387 trades / R 508.164319) mined for candidates, then every candidate re-verified in
the **engine** on `artifacts/baseline-xauusd-ohlc.csv` (9,738 bars) with
`runAnalysis`. Batch ↔ engine parity on the pre-filter book was verified field-exact
before mining (0 mismatches).

---

## 1. The rule that meets the bar: Filter F

```
counter-trend(local trend, trade side)
  ∧ body        = |close − open| / (high − low) ≥ 0.80
  ∧ upper wick  = (high − max(open, close)) / (high − low) ≤ 0.02
```

Plain reading: **the market is against the trade and the signal bar is a strong
momentum bar closing essentially on its high.** Fading that bar is the recurring dead
weight — it is the same failure across nine strategies, not one strategy's quirk.

| Evidence | Result |
| --- | --- |
| Engine, shipped default (C + F) | **2,286 trades / R 541.357046** |
| vs Filter C alone (2,323 / R 523.681350) | **+17.68 R** |
| vs no filters (2,387 / R 508.164319) | +33.19 R |
| First half / second half (vs C) | +7.1 R (307.4 vs 300.3) / +11.4 R (213.1 vs 201.7) |
| Shorts / longs (vs C) | 1,111 / 229.14 vs 1,140 / 221.96 → +7.2 R · 1,175 / 312.22 vs 1,183 / 301.72 → +10.5 R |
| Threshold neighbourhood (ΔR vs C, full/H1/H2) | 0.7/0.02 +7.0 · **0.8/0.02 +17.7** · 0.9/0.02 +12.2 · 0.8/0.05 +19.9 · 0.7/0.05 +12.3 · 0.9/0.05 +12.3 — a plateau, not a spike |
| Soundness (engine rows vs an independently re-derived predicate) | 92 FILTER_F rows, **0 violations** |
| Completeness (bare-book candidates satisfying the rule) | 92 eligible → 82 rejected by F, 10 already by C, **0 missed** |
| Composition of the 82 F-only rejections | dual-thrust 20, macd-cross 18, three-soldiers 15, williams-r-fade 15, morning-star 9, donchian-55 8, pdh-retest 4, classic-pivot 2, ichimoku-tk 1 |
| Removed trades by session | asian 54, ny 18, london 10 |
| Drop model of the 82 (their own P&L in the C-only book) | shorts n=59 ownR −14.4 (WR 20%), longs n=23 ownR −8.2 (WR 17%) |
| Opt-out (`enableFilterF: false`) | reproduces the v1.4 book exactly: 2,323 / R 523.6813503963194 |

Rejected variants of the same idea (engine, ΔR vs C on the full book): F2
(close-at-high *or* close-at-low) −1.7; F3 (body floor only) −0.5 and negative in both
halves; F4 (wick ceiling only) −44.8. Both conditions are load-bearing together.

## 2. Why the offline favourite (Filter D) was **not** shipped

The strongest batch-mined family was *NY-session + contraction bar + counter-trend*:

| Measurement | Result |
| --- | --- |
| Batch | 71 hits, +31.0 R removed (halves +16 / +15, long +15.7 ≈ short +15.3, 8/10 months) |
| Batch, incremental over Filter C | 56 trades / **+16.0 R** removed (15 hits were already rejected by Filter C) |
| **Engine, `C + D`** | **2,298 trades / R 520.051 — *minus* 3.63 R vs Filter C alone** |

The engine decomposition explains it, one line at a time:

| Move | Trades | R |
| --- | --- | --- |
| Dropped by D (genuine dead weight removed) | 57 | +13.5 |
| **Refills**: freed slots taken by later bars D does not reject | 32 | **−17.1** |
| Net | | **−3.6** |

Filter F's decomposition shows the opposite balance — dropped 85 (−25.6 R) against
48 refills (−7.9 R). **Removing bad trades is not the same as improving the book: a
filter that removes few trades but frees many slots is a filter that swaps dead weight
for whatever the engine takes next.** Only engine-level deltas were used for the
default-on decision.

## 3. What a later, broader search found (and why nothing else shipped)

A generic sweep was then run over every pair/triple of broad context atoms
(n ≥ 120 trades): 39 atoms, 741 pairs, 171 candidates recorded, **75 rules passing**
the in-sample gates (n ≥ 25, gain ≥ 12 R, t ≥ 2, both halves > 0, ≥ 3 of 4 folds > 0,
stress ≥ 0.6 × gain, kept-book expectancy above the base book, breadth ≥ 4 strategies,
top-share ≤ 0.6).

No *single* condition is a dead-weight block: the worst broad atom is hour 12–14
(191 trades, own R −1.7); every other block is net positive (e.g. `closeVsEma200Atr ≥ 5.4`
n=475 mean R 0.446, `session=asian` n=1,491 own R +395.6 mean R 0.265). Anything that
works had to be a triple interaction — the classic overfit shape.

Best-looking triples (removal gain = R removed; all in-sample):

| Family (research label) | n | gain | t | halves | folds | breadth | incremental over C |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `D_conflict_nearPDL` — EMA stack entangled ∧ entry in the bottom 26% of the prior day ∧ local trend not against the trade | 123 | +43.6 | 2.73 | +21 / +22 | +10 / +12 / +21 / +2 | 9/9 strategies | +43.6 R |
| `E3_ny_weakRange_dow` — NY session ∧ range ≤ 0.66×ATR ∧ day-of-week Mon/Wed/Thu | 78 | +42.0 | 3.78 | +25 / +17 | +18 / +7 / +4 / +13 | 7/9 | +31.0 R |
| `E2_ny_weakRange_ct` (= rejected Filter D, for reference) | 71 | +31.0 | 2.77 | +16 / +15 | +10 / +6 / +13 / +2 | 6/9 | +16.0 R |

Two controls killed them:

1. **Placebo / multiplicity** (`control-filter-candidates.mjs`): shuffling outcomes and
   re-running the entire 1,834-rule search produces **6.3 passing rules per shuffle**,
   and a single fake rule reaches **+40.9 R** — statistically indistinguishable from the
   best real candidate (+43.6 R). With 75 real passes over an 1,834-rule space, the
   in-sample gate list is not evidence of an edge.
2. **Chronological discovery → validation**: rules selected on the first half reproduce
   on the untouched second half **0 times** (and 0 times in the mirror direction).
   Quarter-scale splits fare better (22 and 23 survivors), but the honest reading is
   that the surviving signal is unstable across halves.

Filter F, by contrast, was not selected out of a large rule space: it was one of two
mechanism-level hypotheses carried from the strategy-failure report, it is
**positive in both halves at every neighbouring threshold**, both sides, and it removes
a class of bars that nine independent strategies all fail on the same way.

**Verdict: ship Filter F only.** The two strong triples are documented candidates for
forward validation (out-of-sample / live), not for production defaults.

## 4. Reproduce

```bash
# shipped book under every filter configuration + opt-out lock + UI config
node --experimental-strip-types --import ./tests/register.mjs scripts/research/verify-filter-defaults.mjs

# soundness / completeness of Filter F against an independently re-derived predicate
node --experimental-strip-types --import ./tests/register.mjs scripts/research/audit-filter-f.mjs

# broad search (writes artifacts/strategy-research/filter-candidate-search.json)
node --experimental-strip-types --import ./tests/register.mjs scripts/research/search-filter-candidates.mjs

# multiplicity controls (SHUFFLES default 60; writes .../filter-multiplicity-control.json)
SHUFFLES=40 node --experimental-strip-types --import ./tests/register.mjs scripts/research/control-filter-candidates.mjs

# finalist family report incl. incremental-over-C arithmetic
node --experimental-strip-types --import ./tests/register.mjs scripts/research/report-filter-families.mjs
```

The Filter F threshold neighbourhood in §1 was produced with temporary scaffolding
(`enableFilterVariants` + a parameterised predicate) that has been removed from the
production code by design. To re-derive it today: change `MOMENTUM_BODY_MIN` /
`MOMENTUM_UPPER_WICK_MAX` in `src/lib/analyzer/regime-filters.ts`, re-run
`verify-filter-defaults.mjs`, then revert — the golden test fails loudly if the revert
is forgotten.

> Naming note: research family labels (`B_fadeStrongBar`, `D_conflict_nearPDL`,
> `E2_ny_weakRange_ct`, `F_london_weak`, …) are labels of *searched candidates* and do
> not correspond to production filter names. In particular `F_london_weak` is not the
> shipped Filter F, and `D_conflict_nearPDL` is not the rejected Filter D.
