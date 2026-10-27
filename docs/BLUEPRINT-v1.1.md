# BLUEPRINT — Map / Compass / Strategy Verification

**Version 1.1 — consolidated 2026-10-26; G0 review amendments applied**
**Status: G0 FROZEN (amended before any claim result). M1–M5 machinery COMPLETE. Claim cards DRAFT — awaiting human review/freeze.**

> **v1.1 — G0 amendments, all made BEFORE any real claim result.** A review found
> six problems. Each is fixed here and in code, and each decision was made now
> rather than after seeing outcomes: (1) strength alone ships, (2) sweep flips
> grade but never nullify, (3) a matched random-entry control replaces the zero
> null, (4) claims are ordered by evidence quality with candlesticks last,
> (5) holdout feature bleed is measured and declared, (6) VAL contamination is
> declared. See §7.6–§7.9 and §15.
> **Branch:** `arena/072665f9-system`

This is the single pre-registration for the replacement of the old Signal
Finder Pro research line. It is frozen **before any strategy result exists**.
Everything downstream must reference this version. All other documents are
detail views of sections here; where they disagree, this file wins.

The old project produced R 527.6 on 2025-11 → 2026-08 and failed on earlier
data. Its nine "survivor" strategies were selected on that same window, so the
data was spent before any rule was frozen. This project exists to make that
impossible.

---

## 0. Mission

Audit **textbook claims** about known strategies against real data, then wire a
switchboard that enables a strategy only in the states where its strength was
CONFIRMED and blocks it where its weakness was CONFIRMED. The product is a live
analyzer, not a backtest score.

**One-sentence test of success:** the combination works on data nobody looked
at while building it. Everything below exists to make that sentence checkable.

## 1. What we are NOT doing

- No strategy discovery in v1. Strategies come from literature with pre-written claims.
- No novel pattern mining. We test known strengths/weaknesses, we do not hunt for new ones.
- No threshold tuning after seeing results. Sweeps are a **veto**, never a selector.
- No filter stacking. One condition at a time.
- No re-evaluating a window that has been seen.
- No promoting a rule because it raises historical R.
- No hindsight columns as features. Ever.
- No stitching two price feeds, and no re-fitting the cost model after results.

## 2. Locked decisions

### 2.1 Design decisions from the concept phase

| Decision         | Value                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------- |
| System shape     | Three stages: **Map** (regime detection) → **Compass** (routing) → **Strategy verification** |
| Discovery target | Known strategies with known claims — not invented patterns                                   |
| Order of work    | Map first, Compass second, strategies last; heavy testing before combining                   |
| Map              | **Hand-defined** (not clustered/learned)                                                     |
| Compass          | **Allow-list** (several strategies may fire), not a hard single switch                       |
| Engine           | **Reuse the old chassis** as reference/regression fixture                                    |

### 2.2 The user's numbered decision table (locked verbatim)

| #   | Decision        | Final position                                                        |
| --- | --------------- | --------------------------------------------------------------------- |
| 6   | Data split      | Preserve roles and sealed datasets; reconsider chronological ordering |
| 7   | M15             | Keep as an intrabar audit layer                                       |
| 8   | Engine changes  | Fix all four defects before strategy evaluation                       |
| 9   | Thresholds      | Pre-register proposed values; sweeps can veto, not optimise           |
| 10  | Conflicts       | One position per slot; frozen numerical priorities                    |
| 11  | Trade direction | Both long and short                                                   |
| 12  | Map thresholds  | Fixed ER cutoff + trailing ATR percentile                             |
| 13  | Claim cards     | Draft, review, freeze before testing                                  |

### 2.3 Where the frozen values live

`scripts/map-compass/frozen.mjs` — side-effect-free so tests can import it.
Editing it is a product decision that starts a **new cycle and a new
evaluation window**. Exact values:

| Constant                                    | Value                                                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `MAP.erCutoff` / `erLookback`               | 0.35 / 20 bars                                                                                                 |
| `MAP.atrPeriod`                             | 14 (simple mean of true range)                                                                                 |
| `MAP.atrPctileCutoff` / `atrPctileLookback` | 70 / 500 bars                                                                                                  |
| `MAP.rangeLookback` / `warmupBars`          | 50 / 1000 bars                                                                                                 |
| `MAP.hysteresisBars` / `abstainBandPct`     | 3 bars / ±10%                                                                                                  |
| `EXIT_HARNESS`                              | stop 1.5×ATR(14), target 2R, no trailing/breakeven/partials                                                    |
| `COST.slippage`                             | 0.02 ATR per side, stress multiplier 2                                                                         |
| `COST.volRegime`                            | low < 0.0006, high ≥ 0.0016 (range/close)                                                                      |
| `CLAIM_CRITERIA`                            | n ≥ 100, **excess over matched random** > +0.10R, t > 2, absolute net R > 0, concentration ≤ 0.50, LOYO ≥ 0.75 |
| `SENSITIVITY_RULE`                          | frozen cutoffs authoritative; sweep GRADES (ROBUST/FRAGILE/DEFINITION_SENSITIVE), never nullifies              |
| `RANDOM_BASELINE`                           | 4000 random entries per state×side, seed 20261026, 96-bar max hold, matched on session/vol                     |
| `EVIDENCE`                                  | prior false fraction 0.80; fixed-sequence test order by evidence tier                                          |
| `ROLES`                                     | DEV 12y, HOLDOUT 4y, VAL 5y, STRESS 2y (see §4)                                                                |

A G0 clarification (made before any strategy result) added `warmupBars`,
`atrPeriod` and `rangeLookback` to `frozen.mjs`. These encoded values already
stated in the original blueprint and the generator's ATR metadata; **none of
the six locked thresholds changed**.

## 3. Architecture

```
CSV (plain causal OHLCV, EAT fixed)
   |
   +-- Feature layer (rich; all trailing + clock)
   |      er_20, atrpct_14, atr_pctile_500, session,
   |      rangePos, bodyPct, dayOfWeek, gapPct, barsSinceStateChange
   |
   +-- MAP --> 4 STATES (+ UNKNOWN abstain) --> frozen source hash (G2)
   |
   +-- COMPASS (allow-list) <-- CLAIM CARDS (verified, G3)
   |      |
   |      +--> active strategy IDs for this bar
   |
   +-- ENGINE (new resolver, four defects fixed; old engine kept as fixture)
   |      one position per slot, frozen numeric priority,
   |      net R after real spread + slippage
   |      +--> BOOK --> verdict / append-only claim ledger
```

**Features ≠ states.** Richness lives in the feature layer; the Compass only
sees 4 states. That collapses the search space from 216 cells to **12
pre-registered cells** (4 states × 3 sessions).

### 3.1 The three stages

**Stage 1 — Map.** Answers "where are we?" with a hand-defined, causal 4-state
regime label. No PnL is used to build it.

**Stage 2 — Compass.** Answers "which strategies are allowed here?" with a
binary allow-list built only from verified claim cards. No learned weights.

**Stage 3 — Strategy verification.** Answers "is the textbook claim true?"
using known strategies, heavy exploratory testing on DEV only, and one-shot
confirmatory validation on unseen data.

Custom strategies ("make ups") enter only as a **new cycle**: new claim cards →
new DEV window → new freeze → new validation. They are never measured on the
data that inspired them. Iteration is fine; each iteration burns a window.

---

## 4. Data contract (G1 — COMPLETE)

Full detail: `docs/MAP-COMPASS-DATA-CONTRACT.md`.

### 4.1 Sources

All external bytes are pinned by git blob oid in
`scripts/map-compass/pins.json` and verified by `fetch-data.mjs` using git's
own blob-hash formula. A URL is never trusted on its own.

| Source                                                                                    | What                                               | Status                                                                              |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `archive.zip` (Kaggle `novandraanugrah/xauusd-gold-price-historical-data-2004-2024`, CC0) | XAUUSD M30 + M15, 2004-06-11 → 2026-01-30, **bid** | fetched, hash-pinned, normalised                                                    |
| `kevingtlin/Market-Data-Lab`                                                              | XAUUSD **M1 bid+ask**, UTC, 2010 → 2026            | 44 sampled months, hash-pinned                                                      |
| `ejtraderLabs/historical-data`                                                            | EURUSD M30, 2012-11 → 2022-03                      | fetched, hash-pinned                                                                |
| XAGUSD                                                                                    | —                                                  | **UNAVAILABLE.** Single-pair cross-instrument; declared at G0, not silently dropped |

Price side was **measured, not assumed**: Kaggle M30 close vs Dukascopy M1 for
June 2015 gave median difference −0.035 vs **bid** and −0.352 vs ask.

### 4.2 Three measured findings that changed the plan

1. **The Kaggle file is broker-local EU DST, not fixed EAT.** Winter UTC+2 /
   summer UTC+3 in the modern era. Feeding it raw shifts every session by an
   hour for ~5 months of every year.
2. **It has TWO timezone epochs.** Before `2011-05-09 01:00` the broker was
   UTC+1/+2; after, UTC+2/+3. Both follow EU DST. The seam is price-continuous
   (2011-05-06 close 1495.00 → 2011-05-09 open 1494.25) but the day boundary
   changes (44 → 46 bars/day). A single-epoch rule corrupts the entire
   2004–2011 DEV period.
3. **Real spreads are far wider than $0.20.** Median 0.34–0.63 price units,
   p95 up to 2.04, crisis max 14.53. The **low-volatility bucket is widest**
   (quiet hours are illiquid) — the opposite of a naive volatility-scaled guess.

**Verification:** `verify-dst.mjs` scores the shipped two-epoch rule against
independent Dukascopy UTC M1 data across **44 months (20 winter, 16 pre-seam):
PASS**. It beats both the no-DST and single-epoch alternatives. The 2020–2024
EU DST boundary was additionally cross-checked against the repo's main CSV:
1,275 days, 0 mismatches.

### 4.3 Data roles (frozen)

| Role        | Years                                                                  | Notes                                                      |
| ----------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| DEV         | 2004, 2005, 2006, 2007, 2009, 2010, 2011, 2013, 2014, 2015, 2017, 2018 | 131,922 bars — all Map building, claim verification, LOYO  |
| **HOLDOUT** | **2008, 2012, 2016, 2019**                                             | **sealed, interleaved across eras** — never read until M10 |
| VAL         | 2020, 2021, 2022, 2023, 2024                                           | one-shot OOS on the frozen routing table                   |
| STRESS      | 2025, 2026                                                             | diagnostic only; partially seen by the old project         |

**Tradeoff, stated plainly:** an interleaved holdout weakens the "purely unseen
future" claim but strengthens the "works across regimes" claim. The old system
died because it worked in one regime, so this is the right trade. LOYO must
exclude holdout years from both training and held-out windows or the seal
leaks — a bug of exactly this kind was found and fixed in §7.2.

### 4.4 Canonical output and denylist

`normalize.mjs` writes LF-only CSV with a `# metadata:` JSON header and plain
`datetime,open,high,low,close,volume`. `datetime` is EAT wall clock with no
offset. **No enriched columns are carried** — the Map computes all causal
features from OHLCV. `DENYLIST` names the hindsight columns that must never
appear (`similar_swing_*`, `swing_invalidated`, `swing_context_source`).

Outputs: `xauusd-m30-eat.csv` (248,912 bars), `xauusd-m15-eat.csv` (494,235),
`eurusd-m30-eat.csv` (115,200), `xauusd-m30-map.csv` (per-bar states). Vendor
1h/4h/d1/1Month files are **not kept** — the engine derives its own with EAT
bucketing; mixing day-rollover conventions would break PDH/PDL and pivots.

---

## 5. Stage 1 — Map v0 (M2 — BUILT, PASS)

### 5.1 Definition

States: 2×2 from `er_20` (Kaufman efficiency ratio, 20 bars) and trailing
`atr_pctile_500`:

|               | ATR pctile ≥ 70 | ATR pctile < 70 |
| ------------- | --------------- | --------------- |
| **ER ≥ 0.35** | EXPANSION       | GRIND           |
| **ER < 0.35** | WHIPSAW         | QUIET           |

Mechanics frozen with it: 3-bar hysteresis; ±10% abstain band → UNKNOWN →
flat; 1000-bar warm-up; session is a Compass gate, not a Map axis. All features
are causal and scale-free — **ATR must be normalised** (gold went $381 → $5,597).

### 5.2 Instrument validation result

`artifacts/map-compass/map-validation.json` — **PASS**:

- Causality: **0 mismatches** under both future mutation and truncation.
- Deterministic: identical state hash on repeat build.
- Coverage: every state present in every DEV year; 0 coverage problems.
- Holdout years sealed out of all statistics.
- Scale-free: multiplying all prices by 17 leaves states unchanged.

Two findings recorded rather than hidden:

- **23.27% of DEV bars are UNKNOWN/flat** (abstain band) plus **14.97% pending
  transitions**. Conservative by design, but it reduces effective sample size —
  all power calculations use post-flat counts.
- **Routing dwell median is 2–3 bars** (UNKNOWN breaks runs) while
  **regime-episode dwell ignoring UNKNOWN is 6–20 bars**. Quoting one as the
  other would fake either a pass or a failure. Both are in the report.

### 5.3 The hysteresis-lag problem

Three-bar confirmation means a breakout claim enters ~3 bars after expansion
began — often after the move. Claim cards are therefore worded as _"works in
**confirmed** EXPANSION"_, not the textbook's "works in high volatility". M9
stratifies expectancy by `barsSinceStateChange` bucket (0–1 / 2–3 / 4–6 / 7+);
if the effect lives entirely at lag ≤ 1, the claim is NOT tradeable under this
Map and is downgraded. This risk is explicit, not a VAL surprise.

### 5.4 Definition-sensitivity and the sweep

The **threshold sweep is a DIAGNOSTIC at M2, not a veto**. State labels are
_expected_ to move when cutoffs move — that is what a threshold is. Only 5/25
sweep cells reach ≥80% label agreement with the frozen cutoffs. The blueprint's
veto applies to **claim verdicts at M6**: a claim whose verdict is not stable
across ≥80% of the grid is `INCONCLUSIVE (definition-sensitive)`. Thresholds
stay frozen at G0 regardless — the sweep never selects one.

A REFUTED verdict might mean "the textbook is wrong" **or** "our definition of
expansion is wrong"; the sweep separates those two interpretations.

---

## 6. Stage 2 — Compass v0 (M4 — BUILT, inert as required)

- Input: state + session → binary allow-list of strategy IDs.
- Enable S in state B **iff its STRENGTH claim is CONFIRMED for B**. Strength
  alone is sufficient (**G0 amendment**): everything not CONFIRMED is blocked by
  default, so requiring the weakness CONFIRMED too was a redundant second gate
  that multiplied an already-low pass probability for no safety gain. A
  CONFIRMED weakness still adds an explicit hard block in its state.
- No learned weights, no scoring, no optimizer in v1. A fixed table is
  falsifiable; a learned policy is not.
- Conflict: one position per slot, frozen numeric priority (decision #10).
- Fallback: UNKNOWN / no confirmed strategy → **flat**.
- Session restrictions gate on top of the state allow-list.

**M4 result (`routing-table.json`): inert.** With zero CONFIRMED claims the
table enables nothing and `routeSignals` keeps **0/288** probe signals.
Priority order and table hash are deterministic. REFUTED/INCONCLUSIVE never
enable. A missing cost/routing cell is a hard error, never a cheap fallback.

### 6.1 Claim cards — DRAFT, needs your review

`scripts/map-compass/claim-cards.draft.mjs` holds **24 known strategies in 8
families**, each with a literature-derived strength and weakness, a rationale,
a source, and a frozen numeric priority (1–24). These are claims to be
falsified, written **before looking at any result on our data**.

`verify-claims.mjs` **refuses to run real verification** while status is DRAFT.
Decision #13 requires a human review → set `status=FROZEN`, `approvedBy`,
`approvedAt`. Until then only `--dry-run` (synthetic calibration) is permitted.

Review checklist and the full 24-card table: `docs/CLAIM-CARDS-REVIEW.md`.

---

## 7. Stage 3 — Claim verification (M5 harness BUILT; M6 strategies pending)

### 7.1 Standardised exit harness

Identical for every strategy, so claims measure **entry-signal quality** rather
than exit tuning: stop = 1.5×ATR(14), target = 2R, no trailing/breakeven/
partials, net R after round-trip cost. The old engine's `RR_THRESHOLD = 2`
rejects `rr <= 2`; the new resolver has **no RR gate** (see §9).

### 7.2 Pre-registered criteria

Verification is at **FAMILY level (8)**, not strategy level (24): with
σ ≈ 1.43R per trade, `+0.10R/trade` needs ~1,600 trades for 80% power. Pooling
three variants triples the sample. Strategy-level results are a drill-down
that defaults to INCONCLUSIVE.

Per claim:

- `t > 2` on the **excess over a matched random-entry baseline**
- excess `> +0.10R/trade` (practical floor — now relative, not absolute)
- absolute net R `> 0` (beating a losing baseline but still losing money is not tradeable)
- no single year contributes > 50% of cell R (concentration veto)
- ≥ 75% of leave-one-year-out windows positive (LOYO consistency)
- ≥ 100 trades per cell, else INCONCLUSIVE
- sweep produces a **stability grade**, not a veto (see §5.4 and §7.7)

Year-bucketing is a **veto, not 24 independent significance tests**.
Multiplicity is controlled by a **within-year block-circular-shift placebo**
that preserves state persistence and per-year state counts (an i.i.d. shuffle
would produce a null that is too easy to beat). A real CONFIRMED count must
exceed the placebo p95 to be credible.

**Assume ≥ 60% of claims are false.** If only 3–5 families survive, that is a
successful audit, not a failure.

### 7.3 Harness calibration — PASS

`verify-claims.mjs --dry-run` → `harness-calibration.json`:

| Check                                               | Result                             |
| --------------------------------------------------- | ---------------------------------- |
| False-positive rate (8 seeds × 48 claims)           | **0.0026** (1 false CONFIRM total) |
| Known +0.15R edge detection (600 trades/cell)       | **100%**                           |
| Placebo null (40 within-year block circular shifts) | median 0, **p95 5** fake confirms  |
| Power at +0.10R                                     | n=1000 → 0.60, n=1600 → 0.80       |

Kill criterion "harness fails synthetic power calibration" is cleared.

### 7.4 Seal leak found and fixed

An early `verifyClaim` filtered holdout years only inside the per-year
breakdown, leaving holdout P&L inside `mean`/`t`/`totalR`. A test injecting
+99R into holdout years caught it. Aggregates now exclude non-DEV trades
**before any statistic is computed**. Test: "holdout years are NEVER read by
verification".

### 7.5 HARD WARNING — power projection (pre-M6 go/no-go)

`artifacts/map-compass/power-projection.json` uses the **real** DEV state
counts, the **observed** old-project signal density (2,286 trades / 9,738 bars
/ 9 strategies = 0.0261 per strategy per bar), 3 variants per family and a
conservative 0.6 slot-survival factor.

| State     | Tradeable DEV bars | Projected trades (family cell) | Power at +0.10R |
| --------- | ------------------ | ------------------------------ | --------------- |
| EXPANSION | 7,988              | 375                            | **0.272**       |
| GRIND     | 11,310             | 531                            | **0.364**       |
| WHIPSAW   | 18,961             | 890                            | 0.550           |
| QUIET     | 62,961             | 2,956                          | 0.967           |

Baseline cost is **0.119R**, so a claim needs **+0.219R gross** to clear the
+0.10R net floor. **Verdict: UNDERPOWERED** for EXPANSION/GRIND.

**Consequence:** those claims will mostly land INCONCLUSIVE, not CONFIRMED.
That is honest — but the Compass may end up with fewer than 3 surviving
families, which is a kill criterion. This must be decided at G0 **before M6
starts**, by one of: (a) accept fewer survivors, (b) a NEW cycle with a
different DEV/HOLDOUT allocation, (c) a pre-registered change to pool more
variants. **Lowering the practical floor, softening the t-stat, or re-fitting
costs is NOT an option** — that is exactly the laundering this project exists
to prevent.

---

### 7.6 Random-entry control — the missing baseline (ADDED)

The reviewer identified a real hole: the placebo shuffles state labels, but
there was **no baseline of random entries with the same stop, target and costs
in the same state**. DEV 2004–2011 is a gold bull run (mean close 414 → 1,579),
so "go long with a 2R target" can look like an edge in any state.

`random-baseline.mjs` enters randomly in DEV bars, matched on
**(state, side, session, volRegime)**, with the identical 1.5×ATR stop, 2R
target, gap/intrabar rules and frozen cost model. Deterministic seed, 4,000
entries per state×side. Long and short are reported separately.

Measured result (`random-baseline.json`):

| State     | Long mean R (win) | Short mean R (win) | Long − short |
| --------- | ----------------- | ------------------ | ------------ |
| EXPANSION | −0.197 (0.291)    | −0.095 (0.328)     | −0.101       |
| GRIND     | −0.108 (0.343)    | −0.180 (0.318)     | +0.071       |
| WHIPSAW   | −0.043 (0.347)    | −0.165 (0.310)     | **+0.122**   |
| QUIET     | −0.097 (0.345)    | −0.133 (0.339)     | +0.036       |

Win rates cluster near 1/3, confirming the reviewer's arithmetic: with cost
0.119R, break-even needs p=0.373 and clearing +0.10R needs **p=0.406**. The
null is **not zero** — it varies by up to 0.122R across state×side, larger than
the practical floor. Claims are now tested against their matched cell, and
`verifyClaim` reports `excessVsRandomR` + 95% CI + long/short split for every
claim regardless of verdict.

### 7.7 Definition-sensitivity — DECIDED NOW, before results

**Decision:** the frozen cutoffs (ER 0.35 / ATR pctile 70) are the **sole
authoritative test**. A claim CONFIRMED there does **not** lose its verdict
because it flips elsewhere in the sweep. Letting the sweep nullify the
pre-registered test would hand threshold selection to the sweep — the exact
laundering this document forbids.

Instead the sweep produces a **stability grade**: ROBUST (CONFIRMED in ≥80% of
grid cells), FRAGILE (50–80%), DEFINITION_SENSITIVE (<50%). A CONFIRMED +
DEFINITION_SENSITIVE claim is tagged **CONDITIONAL**: it ships, but M9 must
report its grid surface and M10 must report CONDITIONAL and ROBUST claims
separately. REFUTED/INCONCLUSIVE verdicts are never rescued. No threshold may
be changed after results. Encoded in `SENSITIVITY_RULE` and pinned by tests.

### 7.8 Readability — an empty CONFIRMED set must be interpretable

`readability.mjs` separates continuous evidence from the binary shipping
decision. Every claim reports its excess estimate, CI, n, t, per-year and
long/short splits, stability and the specific gate that blocked it. The whole
battery is then classified as NEGATIVE_RESULT / UNDERPOWERED / MIXED / POSITIVE.

Current outcome: **UNDERPOWERED** (avg power 0.538, worst 0.272). If M6 returns
zero CONFIRMED claims, the correct readout is _"too little data to conclude"_,
not _"the textbook is false"_. Escalate to the G0 power decision; do not lower
criteria.

Nine gates exist, but two redundant ones were removed at G0: the weakness
requirement (§6) and the sweep veto (§7.7). Neither change lowers the
statistical bar — both removed multiplicative stacking.

### 7.9 Evidence prior and fixed-sequence test order

The original "assume 60% are false" was too gentle. `EVIDENCE.priorFalseFraction
= 0.80`. Each card carries an `evidenceTier` (1 = best-supported momentum/vol
phenomena, 4 = anecdotal). `TEST_ORDER` sorts tier ascending then frozen
priority, so **candlestick patterns are tested LAST**. The ledger records each
claim's `testOrder`, preserving the pre-registered sequence.

## 8. Cost model (M3 — COMPLETE)

`artifacts/map-compass/cost-model.json` holds **R-denominated** cost per
(session, volRegime) cell, built by joining **851,640 real M1 bid/ask minutes**
to the causal ATR(14) of their M30 bar. Expressing cost as `spreadOverAtr` is
essential: a $0.50 spread is 0.01% of gold at $5,000 but 0.13% at $381.

```
costR = (spreadOverAtr + 2 * 0.02) / 1.5
```

- **Baseline cost ≈ 0.11897R** per round trip (median spread + 1× slippage).
- **Stress cost ≈ 0.28431R** (p95 spread + 2× slippage) — M9 diagnostic only.
- Slippage frozen at `0.02 × ATR` per side, justified from 247,910 measured
  `|next-bar-open − signal-close| / ATR` samples (median 0.0112, p75 0.0402,
  p90 0.1400, p95 0.2745). It is a model, not measured fills, and is labelled
  as such. A 2× stress variant is registered.
- **Quiet/low-vol hours cost MORE than high-vol hours** (illiquidity), and the
  NY midnight tail is the single widest hour. The old static $0.20 model was
  blind to both.
- Raw evidence: `spread-table.json` — 1,318,470 matched M1 minutes, 9 cells.

**D1 correction (an error in my own earlier register):** the first draft of
`ENGINE-BIAS-REGISTER.md` claimed the old engine's "spread on entry only"
understated cost ~2×. That was **wrong** — on a bid series, buying at ask
(bid+spread) and selling at bid **is** one full round-trip spread, and the
short case is algebraically identical. The real defects are the static
magnitude, regime-blindness and no slippage. Splitting the spread half/half
(as first proposed) would have double-counted. The register is corrected.

**Power consequence:** with σ ≈ 1.43R, a +0.10R **net** edge needs ~+0.22R
**gross**. At family level MDE is ~0.11R, so the practical floor is barely
detectable. M5 must report the gross→net conversion for every claim.

---

## 9. Engine bias register (G1.5 — CLOSED for the new pipeline)

`docs/ENGINE-BIAS-REGISTER.md`. Four confirmed defects in the reused chassis,
all resolved in **new modules** rather than by mutating the frozen old rule
sources (which would break the rule-source freeze and the golden baseline).

| Defect | Reality                                                      | Fix                                                    |
| ------ | ------------------------------------------------------------ | ------------------------------------------------------ |
| D1     | Static, regime-blind, understated spread (NOT one-sidedness) | `build-cost-model.mjs` + `lib/cost.mjs`                |
| D2     | No slippage model                                            | frozen 0.02 ATR/side in `lib/cost.mjs`                 |
| D3     | `RR_THRESHOLD = 2` rejects every standardised 2R trade       | `lib/trade.mjs` has no RR gate                         |
| D4     | Intrabar ambiguity kept positions alive                      | M15 ordering + conservative stop-first fallback + flag |

Additional items reviewed and reimplemented: gap-through fills at the open,
one-slot drop-on-occupied book (never queue), `sessionOf` midnight fallthrough,
1000-bar warm-up floor, cross-feed seam. The old engine remains a **read-only
regression fixture**; no Map/Compass claim is ever evaluated with it.

Evidence the concern was real: `logs/v1.8.2-gap-fill-resolution.md` — a
gap-blind exit resolution moved 52 exit prices and total R by −13.73 (2.5%)
and flipped one loser into a recorded +2.41R winner.

---

## 10. Freeze gates

| Gate     | What freezes                                              | Consequence of change             |
| -------- | --------------------------------------------------------- | --------------------------------- |
| **G0**   | This blueprint, frozen constants, cost model, claim cards | New cycle, new version            |
| **G1**   | Dataset hashes, timezone contract, denylist, roles        | All windows invalidated           |
| **G1.5** | Engine-bias register + chassis sign-off                   | Claim verdicts invalidated        |
| **G2**   | Map source hash                                           | Claim verdicts invalidated        |
| **G3**   | Claim ledger verdicts                                     | Routing table invalidated         |
| **G4**   | Routing table hash                                        | VAL window spent; needs a new one |

G1.5 is closed. G3 is open (ledger empty). G4 is open (routing table inert).
**A change after first contact with results is only allowed as a NEW version
with a NEW validation window.**

---

## 11. Validation protocol (M8)

Pre-registered, engine-level, **one shot** on VAL:

- ΔR (combination on − off) ≥ 0
- losing months ≤ half the months in the window
- at most one of long/short negative
- positive in each VAL calendar year
- beats the 95th percentile of the placebo distribution

On FAILS: product decision — turn off, narrow scope, or accept knowingly with
a written reason. **Never re-tune on the window that failed.** Ledger is
append-only; re-runs are flagged `rerun: true`.

### 11.1 Robustness suite (M9 — diagnostics only)

Can falsify, never promote: label-noise stress (20–30% state-label flips),
placebo, threshold sweep, lag-stratified expectancy, cross-instrument (EURUSD),
cross-feed (Kaggle vs main CSV on the 2020–2026 overlap), per-session/side/month
breakdowns, and the 2× slippage / p95-spread cost stress variant.

---

## 12. Kill criteria

- < 3 families with CONFIRMED claims on DEV → the textbook is folklore here; stop
- Combination fails VAL → remove routing, don't tune
- Label-noise stress at 20% flips collapses the edge → Map too fragile; new cycle
- Fails cross-instrument on EURUSD → likely gold-specific artifact
- Real-spread cost model makes every confirmed family net-negative → no tradeable edge
- Any hindsight column reaches a feature → hard stop, invalidate all windows
- Harness fails synthetic power calibration → the test battery is not measuring anything

---

## 13. Build sequence and status

| #   | Milestone                                                     | Status                                      |
| --- | ------------------------------------------------------------- | ------------------------------------------- |
| M0  | Blueprint + pre-registration                                  | **DONE**                                    |
| M1  | Data layer: fetch, normalise, verify DST, spread table, audit | **DONE**                                    |
| M2  | Map v0 + instrument tests                                     | **DONE — PASS**                             |
| M3  | Cost model + standardised trade resolver                      | **DONE**                                    |
| M4  | Compass v0 + allow-list registry                              | **DONE — inert**                            |
| M5  | Claim verification harness + placebo + calibration            | **DONE — PASS**                             |
| M6  | Strategy library + claim cards (draft, review, freeze)        | **BLOCKED on card review + power decision** |
| M7  | Routing table freeze (G4)                                     | —                                           |
| M8  | Validation (one shot)                                         | —                                           |
| M9  | Robustness suite                                              | —                                           |
| M10 | Final holdout (one run on sealed years)                       | —                                           |
| M11 | Decision: paper / live / kill / new cycle                     | —                                           |

### 13.1 What YOU need to decide before M6

1. **Review and freeze the 24 claim cards** (decision #13). Change any state
   assignment or strategy NOW — after results exist, changing a claim is the
   laundering this project forbids. See `docs/CLAIM-CARDS-REVIEW.md`.
2. **Resolve the power warning** in §7.5: accept fewer survivors, start a new
   cycle with a different DEV/HOLDOUT split, or pre-register more pooling.
   Lowering criteria is not on the table.

---

## 14. Reproducing everything

```bash
npm install                         # if node_modules is absent
npm run mc:m1          # fetch (pinned oids) -> normalise -> verify DST -> spread -> audit
npm run mc:map         # M2 -> map-validation.json + per-bar states
npm run mc:cost        # M3 -> cost-model.json (R units)
npm run mc:compass     # M4 -> routing-table.json
npm run mc:calibrate   # M5 dry-run -> harness-calibration.json
npm run mc:power       # M5 -> power-projection.json
npm test               # full suite
```

Raw and normalised data are gitignored (264MB, fully regenerable from the
pinned oids). Only the small JSON reports are committed. Tests live in
`tests/map-compass/*.test.mjs` (74 tests covering DST, contract, Map, cost,
trade resolution, Compass and verification).

**Known pre-existing failure:** one test in `tests/synth.test.mjs` expects
`MapGenerator.tsx` to say "28/32 ... EAT 05:00..." while the committed file
says "26/32 ... EAT 04:00...". Unrelated to this project; `MapGenerator.tsx`
is untouched.

### 14.1 Artifact index

| Artifact                   | Contents                                    |
| -------------------------- | ------------------------------------------- |
| `data-manifest.json`       | hashes, coverage, roles, denylist, warnings |
| `dst-verification.json`    | 44-month two-epoch DST verification, PASS   |
| `gap-report.json`          | every intra-week gap > 2h                   |
| `spread-table.json`        | raw dollar spreads by session × vol regime  |
| `cost-model.json`          | R-denominated cost model, baseline + stress |
| `map-validation.json`      | M2 instrument validation, PASS              |
| `routing-table.json`       | M4 Compass table (inert until G3)           |
| `harness-calibration.json` | M5 synthetic calibration + placebo null     |
| `power-projection.json`    | pre-M6 go/no-go power projection            |
| `claim-ledger.jsonl`       | append-only verdicts (currently empty)      |

---

## 15. Known limitations (declared at G0, not discovered later)

1. **XAGUSD unavailable.** Cross-instrument falsification rests on EURUSD alone.
2. **EURUSD provenance unverified.** Fixed DST-free clock assumed UTC, single
   OHLC, prices scaled /1e5. M9 diagnostic only, never a VAL gate.
3. **Pre-2010 timezone extrapolated.** Dukascopy UTC reference starts 2010-01;
   epoch A is verified 2010-01 → 2011-05 only. 2004-06 → 2009-12 is
   LOW-CONFIDENCE. Report any dependent result both with and without those years.
4. **Two data holes** (2025-09-12 → 2025-10-15 ≈ 32 days; 2026-01-13 →
   2026-01-22 ≈ 9 days) are enumerated in `gap-report.json` (1,154 gaps > 24h,
   largest 109.5h) and must be trimmed from evaluation windows.
5. **Kaggle and main CSV are different feeds**, diverging in 2025–2026 (median
   8.38, worst −355). Never stitch them. The overlap is a free cross-feed test.
6. **M15 covers 98.56%** of M30 bars. The remaining 1.44% fall back to the
   conservative M30 intrabar rule.
7. **Spread table is sampled months**, not continuous coverage. Frozen; M3
   derives the R-denominated `cost-model.json` from it.
8. **`archive2` was never found** in any git ref or Drive. The EURUSD source
   used here is the hash-pinned GitHub one. If archive2 appears,
   `fetch-data.mjs --eurusd=<path>` swaps it in and flags it as unverified
   pending G1 re-approval.
9. **EXPANSION/GRIND are statistically underpowered** at realistic signal
   density (power 0.27/0.36). See §7.5 — a G0 decision, not a tuning opportunity.
10. **23.27% of DEV bars are flat**, reducing effective sample size. Power
    calculations must use post-flat counts, as `power-check.mjs` does.
11. **Routing dwell is 2–3 bars** while regime-episode dwell is 6–20 bars.
    Both are reported; quoting one as the other would misrepresent the Map.
12. **One pre-existing test failure** in `tests/synth.test.mjs`, unrelated to
    this project (see §14).
13. **Holdout feature bleed (measured, `seal-audit.json`).** A 500-bar lookback
    touches holdout prices for **1.14%** of DEV bars; a 1000-bar lookback for
    **2.27%**, confined to the first bars of DEV years 2009, 2013 and 2017. No
    holdout _outcome_ enters any statistic, the Map has zero fitted parameters,
    and features are causal — but the features are not pristine. M10 must report
    results both including and excluding those boundary prefixes.
14. **VAL (2020–2024) is not pristine to the researcher.** Those bars were
    examined in earlier project work (golden baseline, filter research, regime
    statistics). These specific claims were never fitted on them, but priors
    about how gold behaved then are informed. VAL is one-shot OOS but is **not**
    the sole confirmatory evidence — the interleaved sealed years (2008, 2012,
    2016, 2019) carry the final confirmatory weight at M10. Any VAL-driven rule
    change starts a NEW cycle. STRESS (2025–2026) includes the old discovery
    window and can never promote a claim.

---

## 16. Document map

| Document                                      | Role                                                   |
| --------------------------------------------- | ------------------------------------------------------ |
| **`BLUEPRINT.md`** (this file)                | Canonical pre-registration — wins on conflict          |
| `docs/MAP-COMPASS-DATA-CONTRACT.md`           | G1 detail: provenance, timezone epochs, schema, holes  |
| `docs/ENGINE-BIAS-REGISTER.md`                | G1.5 detail: D1–D4, resolution strategy, sign-off      |
| `docs/CLAIM-CARDS-REVIEW.md`                  | The 24 draft cards + review checklist + power decision |
| `scripts/map-compass/frozen.mjs`              | Machine-readable frozen constants                      |
| `FORWARD-VALIDATION.md`, `PROJECT-CHARTER.md` | Old-project protocols reused for ledger/parity         |
