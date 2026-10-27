# BLUEPRINT — Map / Compass / Strategy Verification

**Version 1.3 — 2026-10-27; G0 AMENDMENT 3 applied**
**Status: G0 FROZEN (amended before any claim result). M1–M5 machinery COMPLETE. Claim cards DRAFT — awaiting human review/freeze.**
**Branch:** `arena/072665f9-system`

> **Version history is immutable.** Four byte-preserving snapshots exist:
> `docs/BLUEPRINT-v1.0.md`, `docs/BLUEPRINT-v1.1.md`,
> `docs/BLUEPRINT-v1.2.md` and `docs/BLUEPRINT-v1.3.md`. The full 64-character
> SHA-256 of each is in `artifacts/map-compass/blueprint-hashes.json` and is
> printed in `docs/BLUEPRINT-AMENDMENTS.md`. That same file is the dated log of
> every amendment since v1.0. No earlier version may be edited; superseded
> text is struck by a new dated amendment.
>
> **Version chain**
> - **v1.0 (2026-10-26)** — initial consolidated pre-registration.
> - **v1.1 (2026-10-26)** — six G0 review amendments: strength alone ships;
>   sweep grades but never nullifies; matched random-entry control; claims
>   ordered by evidence; holdout bleed measured; VAL contamination declared.
> - **v1.2 / G0 Amendment 2 (2026-10-27)** — CONDITIONAL default NO; CR1
>   day-clustered SEs + Kish effective N (report-only power); TIME_EXIT at 96
>   bars frozen; full CONFIRMED rule printed; all 24 cards printed in full.
> - **v1.3 / G0 Amendment 3 (2026-10-27)** — **restored CONFIRMED rule**
>   (the original +0.10R NET floor PLUS the matched-baseline control); **two
>   VERDICT STATES** (EFFICIENT / CHOPPY) with four Map states as diagnostics;
>   NO_BASELINE fail-closed; standard-exit caveat on reversion families;
>   empirical-study evidence replacing subjective tiers; recomputed
>   within-family overlap and a 2×3 report-only power table.
>
> **Amendment 3 was applied before any real strategy result exists.** Claim
> cards are still `DRAFT`; `verify-claims.mjs` still refuses real verification.
> **No MAP, cost, exit, stop, target, floor or t numeric threshold changed.**
> The verification RULE was explicitly rewritten (task 1) but every numeric
> constant inside it is an original frozen value. See §7.11 for the full dated
> diff against v1.2.

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
| `EXIT_HARNESS`                              | stop 1.5×ATR(14), target 2R, **maxHoldBars 96 → TIME_EXIT at market**, no trailing/breakeven/partials          |
| `COST.slippage`                             | 0.02 ATR per side, stress multiplier 2                                                                         |
| `COST.volRegime`                            | low < 0.0006, high ≥ 0.0016 (range/close)                                                                      |
| `CLAIM_CRITERIA`                            | n ≥ 100, **net mean > +0.10R with tNet > 2**, AND **excess over matched random > 0 with t > 2**, concentration ≤ 0.50, LOYO ≥ 0.75, NO_BASELINE veto |
| `SENSITIVITY_RULE`                          | frozen cutoffs authoritative; sweep GRADES (ROBUST/FRAGILE/DEFINITION_SENSITIVE), never nullifies; **CONDITIONAL cannot enable Compass (default NO)** |
| `VERDICT_STATES`                            | EFFICIENT = EXPANSION+GRIND, CHOPPY = WHIPSAW+QUIET; four Map states are diagnostics only (§7.11.3) |
| `EMPIRICAL_STUDIES`                         | one opened empirical study per family (full URL) or PRACTITIONER_ONLY; subjective tiers removed (§7.11.6) |
| `RANDOM_BASELINE`                           | 4000 random entries per state×side, seed 20261026, 96-bar max hold, matched on session/vol                     |
| `EVIDENCE`                                  | prior false fraction 0.80; **explicit frozen TEST_ORDER** (v1.2 sequence); evidence = study registry      |
| `ROLES`                                     | DEV 12y, HOLDOUT 4y, VAL 5y, STRESS 2y (see §4)                                                                |

G0 Amendment 2 (2026-10-27) added `EXIT_HARNESS.maxHoldBars = 96` and the
CONDITIONAL policy fields. **No numerical threshold changed** — the cap was
already in use by the random-entry control and is now applied identically to
real claim evaluation. G0 Amendment 3 (2026-10-27) added the two verdict
states, restored the CONFIRMED rule (same 0.10 / 2 / 100 / 0.50 / 0.75
numbers, different arrangement), and replaced the subjective tiers with a
study registry. **No MAP/COST/EXIT numeric value changed at any amendment.**
The three G0 clarification fields were already stated in v1.0 and the
generator's ATR metadata.

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
- **Amendment 3:** the allow-list is keyed by the TWO verdict states
  (EFFICIENT / CHOPPY). A bar's four-state Map label is mapped through
  `verdictStateOf()` at lookup; the four Map states are diagnostics. See
  §7.11.3.
- Enable S in state B **iff its STRENGTH claim is CONFIRMED for B**. Strength
  alone is sufficient (**G0 amendment**): everything not CONFIRMED is blocked by
  default, so requiring the weakness CONFIRMED too was a redundant second gate
  that multiplied an already-low pass probability for no safety gain. A
  CONFIRMED weakness still adds an explicit hard block in its state.
- **Amendment 2 exception:** a CONFIRMED strength that is tagged
  **CONDITIONAL** (DEFINITION_SENSITIVE) does **not** enable — the user's
  default is "no". It is reported at M9/M10 and enabled only if VAL meets the
  frozen support criterion. See §7.7 and §7.10.2.
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

**TIME_EXIT (G0 Amendment 2, 2026-10-27).** `EXIT_HARNESS.maxHoldBars = 96`
(48h of M30 bars) is now frozen. A trade that has neither stopped nor targeted
by bar 96 is **closed at the market** and labelled `TIME_EXIT`. Previously such
trades were effectively left OPEN / booked 0R, which biased expectancy. The cap
was already used by the matched random-entry control, so this makes the claim
and its null use an identical harness. `resolveTrade` in `lib/trade.mjs` now
defaults `maxBars` to the frozen constant, so **real claim evaluation cannot
silently opt out**. Pre-results evidence the cap is not vacuous, from
`random-baseline.json`: **TIME_EXIT 398 / 32,000 resolved = 1.24375%** (TP
10,479; SL 21,123; INVALID_ATR 0; 76 separately flagged ambiguous). No stop,
target, cost, floor or t cutoff changed.

### 7.2 Pre-registered criteria

Verification is at **FAMILY level (8)**, not strategy level (24): with
σ ≈ 1.43R per trade, `+0.10R/trade` needs ~1,600 trades for 80% power. Pooling
three variants triples the sample. Strategy-level results are a drill-down
that defaults to INCONCLUSIVE.

Per claim:

- **net mean `> +0.10R/trade` with day-clustered `tNet > 2`** (ORIGINAL v1.0 floor, RESTORED at Amendment 3)
- **excess over a matched random-entry baseline `> 0` with day-clustered `t > 2`** (the control)
- both gates are a **CONJUNCTION** — the v1.2 rule "excess > 0.10 and net > 0" is REMOVED (§7.2.1)
- veto if any trade lacks a fine AND coarse baseline cell (`NO_BASELINE`; never a zero fallback)
- no single year contributes > 50% of cell R (concentration veto)
- ≥ 75% of leave-one-year-out windows positive (LOYO consistency)
- ≥ 100 trades per cell, else INCONCLUSIVE
- sweep produces a **stability grade**, not a verdict veto (§5.4, §7.7) — but
  its CONDITIONAL tag **does** block shipping (Amendment 2, §7.10.2)

Year-bucketing is a **veto, not 24 independent significance tests**.
Multiplicity is controlled by a **within-year block-circular-shift placebo**
that preserves state persistence and per-year state counts (an i.i.d. shuffle
would produce a null that is too easy to beat). A real CONFIRMED count must
exceed the placebo p95 to be credible.

**Assume 80% of claims are false** (`EVIDENCE.priorFalseFraction = 0.80`, see
§7.9). If only 3–5 families survive, that is a successful audit, not a failure.

### 7.2.1 The current CONFIRMED rule, printed in full (Amendment 3)

This is the **exact** decision procedure in
`scripts/map-compass/lib/verification.mjs` after Amendment 3. It is reproduced
here so no one can claim the rule was written after seeing results.

```
INPUT  trades[] (each with netR, year, state (four-state Map label), side,
                 session, vol, day, entryBar, strategyId)
       direction  = +1 for a STRENGTH claim, -1 for a WEAKNESS claim
       sensitivityAgreementPct (from the M6 threshold sweep; GRADE only)
       baseline   = random-baseline.json (matched random-entry control)
CFG    minTradesPerCell      = 100
       practicalFloorR       = 0.10   # NET MEAN floor (ORIGINAL v1.0 floor)
       tStatMin              = 2      # required for BOTH tNet and t(excess)
       excessFloorR          = 0      # excess over matched random must be > 0
       concentrationMax      = 0.50
       loyoPositiveMin       = 0.75
       requireMatchedBaseline = true
       baselineMinCellN      = 200

 1  devTrades = trades.filter(t => ROLES.DEV.includes(t.year))   # SEAL
    n = devTrades.length
 2  for each trade i:
      signed_i  = netR_i * direction
      b_i       = matchedBaseline(t_i, baseline)
                  # fine  cell state|side|session|vol if sufficient && n>=200
                  # else coarse state|side if n>=200
                  # else MISSING: mean = NULL, level = NO_BASELINE, never 0
                  # baseline === null is UNCONTROLLED_DRY_RUN (calibration only)
 3  for each MATCHED trade i:
      excess_i  = (netR_i - b_i.mean) * direction      # excessFor()
                  # netR is ALREADY side-signed; direction is the CLAIM
                  # direction, applied to the DIFFERENCE. A short winning
                  # +1.0R vs a -0.10R random-short cell gives +1.10.
    unmatched trades get excess_i = NULL and are excluded from excess stats
 4  meanNetR        = mean(signed)          # ABSOLUTE, signed, NET of costs
    excessVsRandomR = mean(matched excesses)  # control statistic
 5  dayKeys_i = calendar day of trade i    # fallback: year
    seExc = CR1(excesses, dayKeys) =
         sqrt( (G/(G-1)) * SUM_g (SUM_{i in g} (excess_i - mean))^2 / m^2 )
    seNet = CR1(signed, dayKeys)
    t     = excessVsRandomR / seExc       # control gate t
    tNet  = meanNetR / seNet             # NET FLOOR gate t
    excessCi95 = excessVsRandomR +/- 1.96*seExc
    meanCi95   = meanNetR +/- 1.96*seNet
    by-side and per-year CIs use the SAME CR1 estimator on their subsets
 6  nEffective = n^2 / SUM_bars (n_bar^2)   # Kish, over entry-bar clusters
    (REPORTED and used for POWER only; the CR1 SE already absorbs within-day
     correlation, so the SE is NOT inflated twice)
 7  byFourState: for each of EXPANSION/GRIND/WHIPSAW/QUIET/UNKNOWN report
    n, meanNetR, ci95, t, excessR, verdictState — ALL diagnosticOnly: true
 8  concentration / LOYO computed from MATCHED excesses only (skip if <2)
    concentration = max(0, max_year totalExcessR_y) / SUM_y max(0,...)
    if concentration > 0.50 -> veto CONCENTRATION_<value>
    yearMeans = per-year meanExcessR for years with n >= 5
    if yearMeans.length < 2 -> veto TOO_FEW_YEARS
    else loyoPositivePct = share > 0; if < 0.75 -> veto LOYO_<value>
 9  stability = ROBUST              if sensitivityAgreementPct >= 80
             = FRAGILE             if sensitivityAgreementPct >= 50
             = DEFINITION_SENSITIVE otherwise
    conditional = (stability == DEFINITION_SENSITIVE)
    # GRADE/TAG only. sweepsCanNullifyVerdict = false.
10  if n == 0            -> INCONCLUSIVE, veto NO_TRADES
    if nMissingBaseline>0 -> veto NO_BASELINE_<k>_OF_<n> and FORCE INCONCLUSIVE
    if n < 100           -> veto MIN_TRADES_n
11  netGatePass     = (meanNetR > 0.10)        AND (tNet > 2)
    controlGatePass = (excessVsRandomR > 0)   AND (t > 2)
    netRefuted     = (meanNetR < -0.10)       AND (tNet < -2)
    controlRefuted = (excessVsRandomR < 0)    AND (t < -2)

    if netGatePass AND controlGatePass AND vetoes.length == 0
                     -> CONFIRMED
    else if netRefuted OR controlRefuted
                     -> REFUTED
    else             -> INCONCLUSIVE
                         (push NET_FLOOR_OR_T / EXCESS_CONTROL_OR_T)
```

**Clarifications (Amendment 3):**

- **The +0.10R floor is back on the ABSOLUTE NET MEAN** — the original v1.0
  floor. Both quantities are in **net R** (after real spread and frozen
  slippage). A claim with net mean +0.05R and a huge +0.25R excess is **NOT**
  CONFIRMED. A claim with net mean +0.20R and a *negative* excess is **NOT**
  CONFIRMED. Both gates are required; this is a conjunction, not a choice.
- **There are TWO `t > 2` statistics, both CR1 day-clustered**: `tNet` on the
  net mean and `t` on the excess. `tStatMin = 2` is unchanged from G0. The
  excess statistic is `mean(excess_i)`; its SE is the CR1 estimator in step 5
  with the `G/(G-1)` small-sample factor. `seInflation = clusteredSe/plainSe`
  is reported on every row. The 95% CIs are normal `±1.96·se`.
- **Sign convention is explicit** (`excessFor(netR, baselineMean, direction)`):
  `netR` is already signed by trade side; `baselineMean` is in the same R
  units; `direction` is the CLAIM direction and is applied to the DIFFERENCE.
  A short winning +1.0R against a random-short baseline of −0.10R gives
  **+1.10**, never −1.10. Same for a long. Pinned by unit tests.
- **NO_BASELINE is fail-closed.** If a supplied baseline has no fine AND no
  coarse cell for ANY trade, the claim is INCONCLUSIVE with a `NO_BASELINE`
  veto; the baseline mean is `null`, never 0. `baseline === null` is the only
  zero-null mode and is flagged `UNCONTROLLED_DRY_RUN`; `verifyReal()` refuses
  it and hard-fails if `random-baseline.json` is missing. §7.11.4 / 2b.
- **REFUTED is not gated by vetoes** (but NO_BASELINE overrides it: a claim
  with no control cannot be "refuted" either — it is simply unmeasurable).
- **Verdicts are decided on TWO verdict states** (§7.11.3); the four Map
  states are reported for every claim as `diagnosticOnly: true` and never
  decide a verdict.
- **A CONFIRMED strength alone enables a strategy** (§6); a CONFIRMED
  CONDITIONAL strength does **not** (§7.7, §7.10.2).

#### Dated diff against v1.2 (G0 Amendment 3, 2026-10-27)

| Step | v1.2 rule | v1.3 rule | Changed? |
| ---- | --------- | --------- | -------- |
| CFG | `practicalFloorR = 0.10` applied to **EXCESS**; `absoluteNetRMin = 0` | `practicalFloorR = 0.10` applied to **NET MEAN**; `absoluteNetRMin` REMOVED; `excessFloorR = 0` added | **YES — the requested rule change.** Numeric 0.10 and 2 unchanged. |
| 2 | missing fine+coarse -> `mean = 0`, level `NONE_ASSUMED_ZERO` | missing -> `mean = NULL`, level `NO_BASELINE`, fail-closed | YES |
| 3 | `excess_i = netR_i*direction - b.mean*direction` | `excess_i = (netR_i - b.mean) * direction` via named `excessFor()` with an explicit sign contract | Algebra identical; **sign convention now explicit and unit-tested** (short and long). |
| 4-5 | one primary t on excess; `tNet` reported but not a criterion | **two** criteria t's: `tNet > 2` (net floor) and `t > 2` (excess control) | YES — conjunction |
| 5 | CI of excess + CI of mean (day-clustered) | unchanged (both CR1 day-clustered) | no |
| 7 | — | `byFourState` diagnostics for all four Map states | added (diagnostic only) |
| 10 | `clearsFloor = excess > 0.10 && t > 2`; `absoluteOk = meanNetR > 0` | `netGatePass` AND `controlGatePass` | **YES** |
| 10 | REFUTED if `excess < -0.10` or (`t < -2` and `excess < 0`) | REFUTED if `netRefuted` or `controlRefuted` | YES (symmetric to new gates) |
| vetoes | `ABSOLUTE_NET_R_<v>` pushed on failure | `NET_FLOOR_OR_T` / `EXCESS_CONTROL_OR_T` / `NO_BASELINE_<k>_OF_<n>` | YES (labels) |
| cells | four Map states (EXPANSION/GRIND/WHIPSAW/QUIET) | **two verdict states** EFFICIENT / CHOPPY; four states diagnostic | YES (§7.11.3) |
| evidence | subjective tiers 1-4 | one opened empirical study per family or PRACTITIONER_ONLY | YES (§7.11.6) |
| power | 4-state report-only table | **2 states × 3 sessions** report-only table + pooled 2-state rows | YES (§7.11.3) |
| exits | standard 1.5 ATR / 2R only | **unchanged**, but reversion-family verdicts are explicitly labelled with the standard-exit caveat | label only |
| cards | 24 DRAFT, TEST_ORDER by tier | 24 DRAFT, TEST_ORDER **explicit frozen list, byte-identical to v1.2** | no reorder |
| `MAP.*`, `COST.*`, `EXIT_HARNESS.*`, `ROLES`, thresholds | frozen | **identical** | **no** |

Nothing in this diff was chosen in response to a strategy outcome: there is
none. The change was requested and applied at G0 on 2026-10-27.

### 7.3 Harness calibration — PASS

`verify-claims.mjs --dry-run` → `harness-calibration.json`:

| Check                                               | v1.0 | v1.1 | v1.2 (clustered SE) | v1.3 (restored rule) |
| --------------------------------------------------- | ---- | ---- | ------------------- | -------------------- |
| False-positive rate (8 seeds × 48 claims)           | 0.0026 | 0.0026 | 0.0026 | **0** |
| Known +0.15R edge detection (600 trades/cell)       | 100% | 100% | 93.75% | **100%** |
| Placebo null (40 within-year block circular shifts) | p95 5 | p95 5 | p95 3 | **p95 0** |
| Power at +0.10R                                     | 0.60/0.80 | 0.60/0.80 | 0.599/0.799 | 0.599/0.799 |

v1.3's calibration is **UNCONTROLLED synthetic** (`baseline: null`, flagged
`UNCONTROLLED_DRY_RUN` on every row and in `harness-calibration.json`). The
restored rule requires a significant NET mean, so zero-edge noise produces no
false confirms and the injected +0.15R net edge is detected in every claim;
the placebo floor is therefore 0. This is a **stricter** test, not a relaxed
one. Kill criterion "harness fails synthetic power calibration" remains
cleared. Real verification (`verifyReal`) REFUSES this mode and requires
`random-baseline.json`. The exact v1.2 generator is preserved as
`syntheticTradesV12()` so the 0.2071 overlap estimate stays reproducible.

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

**Amendment 3 (§7.11.3):** the report-only power table is now recomputed
for **2 verdict states × 3 sessions** with real day counts and the
relation-aware effective-N correction. Pooled joint power is 0.280 for
EFFICIENT and 0.810 for CHOPPY; the v1.2 four-state block is kept as a
superseded historical snapshot. Verdict remains **UNDERPOWERED**.

**Amendment 2 REPORT-ONLY correction (2026-10-27).** `power-projection.json`
now carries a `reportOnly` block. It does **not** change `verdict`, `criteria`,
`centralCase`, `scenarios` or the kill criterion — a hash of `CLAIM_CRITERIA`
(`788e01df…`) is embedded so any later tampering is detectable. It shows what
happens when (a) SEs are clustered by calendar day and (b) the three variants
of a family overlap on the same entry bar:

| State     | i.i.d. power | After clustering + effective N | n → n_effective |
| --------- | ------------ | ------------------------------ | --------------- |
| EXPANSION | 0.272        | **0.226**                      | 375 → 304.5     |
| GRIND     | 0.364        | **0.301**                      | 531 → 431.1     |
| WHIPSAW   | 0.550        | **0.461**                      | 890 → 722.6     |
| QUIET     | 0.967        | **0.924**                      | 2,956 → 2,400.1 |

Measured on the calibration harness: overlap fraction **0.2071**, Kish design
effect **1.2316**, **4,032** day clusters, clustered/plain SE inflation
**1.009**. A 0 → 0.75 overlap sensitivity sweep is included because **real
overlap cannot be measured until claim cards are frozen — and no strategy has
been run**. Clustering makes the underpowered states **worse, not better**; if
M6 returns zero CONFIRMED claims the correct readout is "too little independent
data", not "the textbook is false". The only permitted responses remain the
three above; lowering the floor, softening `t > 2`, re-fitting costs or editing
thresholds after results are explicitly forbidden in the JSON itself.

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
grid cells), FRAGILE (50–80%), DEFINITION_SENSITIVE (<50%).

> **AMENDMENT 2 overwrites the CONDITIONAL decision below. The user took the
> DEFAULT "no" on 2026-10-27, still before any result: a CONFIRMED +
> DEFINITION_SENSITIVE claim is tagged CONDITIONAL and DOES NOT SHIP.** The
> v1.1 sentence "it ships" is superseded. See §7.10.2.

A CONDITIONAL claim is **reported** at M9 and M10, always separately from
ROBUST claims, and is enabled **only if VAL supports it** under the criterion
frozen below. REFUTED/INCONCLUSIVE verdicts are never rescued. No threshold may
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

**Amendment 3 replaced the tiers** with one opened empirical study per family
(full URL) or a PRACTITIONER_ONLY mark — see §7.11.6. `TEST_ORDER` is now an
explicit frozen list byte-identical to v1.2; `evidenceTier` is a diagnostic
order rank only, not an evidence claim and not an ordering key.

### 7.10 G0 AMENDMENT 2 (2026-10-27) — in full

**Provenance.** Applied before any real strategy result exists. Claim cards are
still `DRAFT`; `verify-claims.mjs` still refuses real verification. Nothing in
this amendment was chosen in response to a strategy outcome, because there is
none. `docs/BLUEPRINT-AMENDMENTS.md` records the dated chain v1.0 → v1.1 → v1.2.

**What did NOT change:** `MAP.*`, `EXIT_HARNESS.stopAtrMultiple/targetR`,
`COST.*`, `CLAIM_CRITERIA.*` (n≥100, +0.10R, t>2, concentration 0.50, LOYO
0.75, absolute net R>0), `ROLES`, `DENYLIST`, `RANDOM_BASELINE.*`, `EVIDENCE.*`,
`CONFLICT_RULE`, the 24 cards, their priorities, and `TEST_ORDER`. The
`power-projection.json` verdict stays **UNDERPOWERED**.

#### 7.10.1 Clustered inference and effective sample (report-only for power)

`lib/cluster.mjs` implements CR1 cluster-robust SEs clustered by **calendar
day** and a Kish **effective-N** over entry-bar clusters. `verifyClaim` now
uses the clustered SE for the aggregate `t`, `excessCi95`, `meanCi95`, all
by-side CIs and all per-year CIs. Every row reports
`inference.method = "CR1_cluster_by_calendar_day"`, `clusters`, `plainSe`,
`clusteredSe`, `seInflation`, `nEffective`, `variantOverlapFraction` and
`designEffect`. The effective-N correction feeds the **power report only** —
applying it to the t as well would double-count the same dependence.

`power-projection.json` gains `reportOnly` (recomputed by
`recompute-power-report.mjs` or `mc:power`). The recompute script asserts that
`verdict`, `criteria`, `centralCase`, `scenarios` and `grossEdgeNeededR` are
byte-identical before and after, and refuses to write otherwise. **No criterion
may change because of the result** — the block lists permitted responses
(accept fewer survivors / new cycle / pre-register more pooling) and forbidden
ones (lower floor, soften t, re-fit costs, edit thresholds after results).

#### 7.10.2 CONDITIONAL behaviour — user default "no"

Question put to the user: _"Should a CONFIRMED but DEFINITION_SENSITIVE claim
ship?"_ **Answer: no.** Therefore:

- `SENSITIVITY_RULE.compassCanEnableConditional = false`,
  `conditionalRequiresValSupport = true`, `conditionalReportAt = ["M9","M10"]`.
- `buildRoutingTable` receives the set of CONDITIONAL claim IDs from the
  ledger and **refuses to enable any of them** — the reason is recorded as
  `CONDITIONAL_NOT_ENABLED` with `valSupport: false`.
- The claim is still **reported** at M9 (full grid surface) and M10 (separately
  from ROBUST claims). Reporting is not shipping.
- The **only** promotion path is VAL support under a criterion frozen **now**,
  not invented later: _the claim's VAL-window cell must independently reach
  CONFIRMED under the SAME frozen `CLAIM_CRITERIA` (excess > 0.10R, clustered
  t > 2, absolute net R > 0, n ≥ 100, no vetoes), evaluated once, with the VAL
  role spent on the promotion._ `conditionalValPromotions()` is a pure
  predicate over ledger records; it never loosens a threshold. A promotion is
  a **new G4b gate** and must be recorded in the ledger before the routing
  table hash is re-frozen.
- STRESS can never promote a claim (§4.3). A CONDITIONAL claim that does not
  clear VAL stays **not shipped** permanently in this cycle.
- `conditionalPolicy` is emitted in `routing-table.json` so the block is
  auditable even pre-verification.

#### 7.10.3 TIME_EXIT frozen constant

`EXIT_HARNESS.maxHoldBars = 96`, `timeExitLabel = "TIME_EXIT"`, with a dated
`amendment` record in `frozen.mjs` (`decidedBeforeResults: true`,
`criteriaChanged: false`). `lib/trade.mjs` defaults `maxBars` to it, so every
claim resolution and the random control share the identical harness. Baseline
share **398/32,000 = 1.24375%** is reported in `random-baseline.json` under
`timeExitShare` and in §7.1.

#### 7.10.4 Full-text claim card dump

`docs/CLAIM-CARDS-FULL-TEXT.md` prints **all 24 cards in full text** in
`TEST_ORDER` (id, family, variant, tier, priority, strength claim/state,
weakness claim/state, rationale, session restriction, sources). It is generated
mechanically from `claim-cards.draft.mjs` by `print-claim-cards.mjs`.
**Status stays DRAFT — this dump is for review, not a freeze.** No card was
edited, reordered or frozen by Amendment 2.

### 7.11 G0 AMENDMENT 3 (2026-10-27) — in full

**Provenance.** Applied before any real strategy result exists. Claim cards are
still `DRAFT`; `verify-claims.mjs` still refuses real verification; the ledger
is empty; `routing-table.json` enables nothing. Nothing here was chosen in
response to a strategy outcome. `docs/BLUEPRINT-AMENDMENTS.md` records the
dated chain v1.0 → v1.1 → v1.2 → v1.3 including this amendment's diff.

**What did NOT change:** `MAP.*`, `EXIT_HARNESS.*` (stop 1.5×ATR, target 2R,
`maxHoldBars = 96`), `COST.*`, `ROLES`, `DENYLIST`, `RANDOM_BASELINE.*`,
`CONFLICT_RULE`, the 24 cards' priorities, and `TEST_ORDER` (explicit frozen
list, byte-identical to v1.2). The numeric values `0.10`, `2`, `100`, `0.50`,
`0.75` are unchanged; only the verification RULE arrangement changed, as
explicitly instructed.

#### 7.11.1 Restored CONFIRMED rule (task 1)

v1.1/v1.2 had replaced the original floor with an EXCESS floor
(`excess > 0.10` and `net > 0`). That let a claim ship on a strong *relative*
edge while being unprofitable in absolute terms, and spent the whole +0.10R
budget on the control. The rule is restored to **the original floor PLUS the
control**, a conjunction of two independent day-clustered tests:

- **(A) NET MEAN `> +0.10R` with `tNet > 2`** — the original v1.0 floor.
- **(B) EXCESS over matched random `> 0` with `t > 2`** — the control survives
  as a second significance gate, merely positive.
- **Plus the existing vetoes**: `n >= 100`, concentration `<= 0.50`, LOYO
  `>= 0.75`, and the new `NO_BASELINE`.

`absoluteNetRMin` is **removed**; the `ABSOLUTE_NET_R_*` veto is gone. The full
pseudo-code, clarifications and a dated step-by-step diff against v1.2 are in
§7.2.1. Encoded in `CLAIM_CRITERIA` and `verifyClaim`, pinned by 4 tests.

#### 7.11.2 Unit tests and NO_BASELINE (task 2)

**(a) Sign convention.** `excessFor(netR, baselineMean, direction)` applies the
claim direction to the DIFFERENCE, never to one term. `netR` is already signed
by trade side and `baselineMean` is in the same R units. Pinned by tests: a
**short** winning +1.0R against a random-short baseline of −0.10R gives
excess **+1.10**, not −1.10; the **long** case gives +1.10 too; both are
checked at the `verifyClaim` row level (`excessVsRandomR` and
`bySide.<side>.excessR`). A weakness claim (`direction = -1`) correctly gives
−1.10 for the same winner.

**(b) Fail-closed baseline.** `matchedBaseline()` now resolves
fine → coarse → **MISSING** (`mean = null`, `level = NO_BASELINE`). The
`NONE_ASSUMED_ZERO` fallback is **deleted**. If ANY trade in a claim cell has
no fine and no coarse cell, `verifyClaim` returns **INCONCLUSIVE** with a
`NO_BASELINE_<k>_OF_<n>` veto, and never computes a fabricated excess (the
row reports `excessVsRandomR = 0` from an empty matched set and
`controlGatePass = false`). `baseline === null` remains the only zero-null
mode, is flagged `UNCONTROLLED_DRY_RUN` on every row, is disclosed in
`harness-calibration.json`, and is **refused by `verifyReal()`** (which hard
fails if `random-baseline.json` is absent).

**Coverage audit — how many cells would hit NO_BASELINE.** From
`artifacts/map-compass/baseline-coverage.json`, computed from the DRAFT card
metadata and the frozen random baseline only (no outcomes):

| Level | Cells | Would hit NO_BASELINE (shipped rule) |
| ----- | ----: | -----------------------------------: |
| claim halves (24 cards × strength/weakness) | 48 | 0 |
| claim × verdictState × session | 136 | 0 |
| claim × fourState × session | 272 | 0 |
| trade-level lookups (× 2 sides × 3 vol) | 1,632 | 0 |

All **8** coarse `state|side` cells exist with n = 4,000 ≥ 200, so with the
coarse fallback the shipped rule produces **zero** NO_BASELINE cells. Of the
1,632 trade-level lookups, **984 resolve FINE** and **648 (39.7%) use the
COARSE fallback** because their fine cell has < 200 random entries. If the
coarse fallback were forbidden (NOT the shipped rule), **648** lookups would
become NO_BASELINE — this is reported so the reader can see exactly how much
coverage depends on the legitimate coarse fallback. The audit also lists every
insufficient fine cell individually with its n.

#### 7.11.3 Verdict states and the 2×3 power table (task 3)

**Two verdict states**, frozen in `VERDICT_STATES` / `VERDICT_STATE_OF`:

- **EFFICIENT = EXPANSION + GRIND** (ER ≥ 0.35 — directional)
- **CHOPPY = WHIPSAW + QUIET** (ER < 0.35 — non-directional)

This is the answer to the G0 power decision: pooling along the ER axis
increases the thin cells instead of lowering criteria. Verdicts are decided on
these TWO states. **The four Map states stay as diagnostics** — every claim
row carries `fourStateDiagnostics` / `stats.byFourState` with n, meanNetR,
clustered CI, t and excessR for EXPANSION, GRIND, WHIPSAW and QUIET, each
marked `diagnosticOnly: true`. No verdict may be read from a four-state row.
The Map source hash and all Map thresholds are unchanged; the Compass table
is re-keyed to the two verdict states and maps a bar's four-state label
through `verdictStateOf()` at lookup time.

**Strength state by family** (`FAMILY_STRENGTH_STATE`), weakness = the other
verdict state for every family:

| Family | Strength verdict state | Weakness |
| ------ | ---------------------- | -------- |
| channel-breakout | EFFICIENT | CHOPPY |
| ma-cross | EFFICIENT | CHOPPY |
| opening-range | EFFICIENT | CHOPPY |
| level-retest | EFFICIENT | CHOPPY |
| band-reversion | CHOPPY | EFFICIENT |
| osc-fade | CHOPPY | EFFICIENT |
| candlestick-reversal | CHOPPY | EFFICIENT |
| vol-compression | **CHOPPY** | EFFICIENT |

`vol-compression` is CHOPPY because **the signal is observed BEFORE the
expansion** (the entry bar is still a compression bar), so the claim belongs
to the pre-breakout regime, not the realised EXPANSION. Two v1.2 textbook
weakness labels that sat in the same CHOPPY state as their strength
(`bb-squeeze-fade`, `three-soldiers-crows`) were corrected to EXPANSION —
these were the plainly-wrong state items.

**Report-only power table, 2 verdict states × 3 sessions.** Recomputed in
`power-projection.json → reportOnlyV13.powerTable2x3` from real DEV bar counts
and **real DEV calendar-day counts** per cell, using the day-clustered SE
inflation (1.009) and the recomputed within-family effective-N correction
(design effect 2.2948). Session is now a CELL dimension, so there is no
separate 1/3 session factor. `jointPowerConservative = min(net-floor power,
control power)` — the two tests are strongly correlated on the same trades, so
a product would understate power; the min is conservative.

| Cell | DEV bars | DEV days | n | n_eff | i.i.d. power | joint power |
| ---- | -------: | -------: | --: | ----: | -----------: | ----------: |
| EFFICIENT\|asian | 7,363 | 1,306 | 346 | 150.8 | 0.255 | 0.134 |
| EFFICIENT\|london | 4,189 | 932 | 197 | 85.8 | 0.164 | 0.094 |
| EFFICIENT\|ny | 7,746 | 1,416 | 364 | 158.6 | 0.266 | 0.138 |
| CHOPPY\|asian | 37,003 | 2,862 | 1,737 | 756.9 | 0.830 | 0.479 |
| CHOPPY\|london | 19,264 | 2,692 | 904 | 393.9 | 0.557 | 0.279 |
| CHOPPY\|ny | 25,655 | 2,886 | 1,204 | 524.7 | 0.680 | 0.355 |

Pooled across sessions: **EFFICIENT n = 907 → n_eff 395.2, joint power 0.280**;
**CHOPPY n = 3,845 → n_eff 1,675.5, joint power 0.810**. Compared with the
v1.2 four-state adjusted powers (EXPANSION 0.226, GRIND 0.301, WHIPSAW
0.461, QUIET 0.924), the 2-state pooling doubles the raw EFFICIENT sample but
the larger relation-aware overlap removes most of the gain: near-duplicate
variants do not add independent information. The control gate is **not** the
binding constraint, because matched random baselines are negative in DEV, so a
true +0.10R net edge implies a larger excess. `reportOnlyV13` also carries a
sensitivity sweep over the share assumption (0 → 1 scale) and the pooled rows.

**This is REPORT-ONLY.** `verdict` stays `UNDERPOWERED`; no criterion,
threshold, kill criterion or card changes because of it. If zero claims are
CONFIRMED the readout remains "too little independent data", not "textbook
false".

#### 7.11.4 Standard-exit caveat for reversion families (task 4)

Every verdict row for **band-reversion, osc-fade and candlestick-reversal**
carries the literal label:

> **"under the standard exit (1.5 ATR stop, 2R target) only"**

`REVERSION_FAMILIES` and `EXIT_CAVEAT` are frozen in `frozen.mjs`; the label is
on each card (`exitCaveat`), on each `runBattery` row, in
`power-projection.json → reportOnlyV13.reversionCaveat`, in
`readability.json` and in `baseline-coverage.json`, which enumerates all 48
pre-registered verdict slots and labels the **18** reversion ones (3 families ×
3 cards × 2 halves). **No new exit is added in this cycle.** The caveat exists because a mean-reversion rule's verdict is
especially sensitive to the exit: a 2R target may be reached less often than a
smaller one, so a REFUTED reversion claim is a refutation of the rule *under
this harness*, not of mean reversion in general. A new exit would be a NEW
cycle with a NEW evaluation window.

#### 7.11.5 Overlap provenance (NO outcomes used)

**How the v1.2 `0.2071` was estimated.** `lib/amend2-report.mjs →
measureDependence()` used `syntheticTradesV12({seed: 7, perCell: 900,
trueEdgeR: 0, sd: 1.43})` from `verify-claims.mjs` — pure Gaussian **synthetic
noise with ZERO injected edge**. The three variants of a family drew entry bars
from ONE shared pool of 900 bars keyed
`${family}|${fourState}|${year}|${bar}`. `effectiveCounts()` (Kish effective N
over entry-bar clusters) on that set gave overlap fraction **0.2071**, design
effect **1.2316**, 4,032 day clusters and SE inflation **1.009**. **Only the
`entryBar` and `day` fields were used** — `netR` was zero-edge noise used only
for the SE ratio and never entered the overlap computation. No strategy
outcomes, no real trades, no verdicts. The exact v1.2 generator is preserved
as `syntheticTradesV12()` so the number is reproducible byte-for-byte.

**Amendment-3 recomputation.** `lib/overlap.mjs →
recomputeWithinFamilyOverlap()` keeps the same Kish estimator but replaces the
single uniform pool with **relation-aware shares** derived from
`CARD_RELATIONS`: `NEAR_DUPLICATE 0.75`, `MIRROR_IMAGE 0.55`,
`RELATED 0.30`, `INDEPENDENT 0.10`. It uses ONLY card metadata and a seeded
RNG generating **entry-bar multiplicities** — no `netR`, no verdict, no
strategy result, no realised trade. Result: pooled overlap **0.8302**, design
effect **2.2948** (per-family 2.13–2.58). A sensitivity sweep scales all
shares from 0 (independent) to 1 (frozen assumptions) so the reader can see
how much the ASSUMPTION, not any outcome, drives the power number.

#### 7.11.6 Evidence registry — tiers REPLACED (task 5)

The four subjective tiers ("tier 1 = peer-reviewed phenomena exist") are
**gone**. Each family now has **one empirical study that was located and
OPENED on 2026-10-27**, with its full URL, or is marked **PRACTITIONER ONLY**.
Full registry: `frozen.mjs → EMPIRICAL_STUDIES`, printed in
`docs/CLAIM-CARDS-FULL-TEXT.md` and `docs/EMPIRICAL-EVIDENCE.md`.

| Family | Study (opened 2026-10-27) | Full URL | Finding |
| ------ | ------------------------- | -------- | ------- |
| channel-breakout | Brock, Lakonishok & LeBaron (1992), J. Finance 47(5) | `http://technicalanalysis.org.uk/support-and-resistance/BrockLakonishokLeBaron1992.pdf` | in-sample support; data-snooping caveat |
| ma-cross | Chong & Ng (2008), Applied Econ. Letters 15(14) | `https://ideas.repec.org/a/taf/apeclt/v15y2008i14p1111-1114.html` | MACD/RSI beat buy-and-hold (single market) |
| opening-range | Holmberg, Lönnbark & Lundström (2013), Finance Res. Letters 10(1) | `http://www.econ.umu.se/ueslpnr/ues845.pdf` | full-sample success NOT robust across sub-periods |
| level-retest | Osler (2000), FRBNY Econ. Policy Review 6(2) | `https://www.newyorkfed.org/medialibrary/media/research/epr/00v06n2/0007osle.pdf` | levels predict interruptions; strength mis-ranked |
| osc-fade | Chong, Ng & Liew (2014), JRFM 7(1) / MPRA 54149 | `https://mpra.ub.uni-muenchen.de/54149/1/MPRA_paper_54149.pdf` | RSI(14,30/70) profitable on DJIA, not consistent |
| band-reversion | Lento, Gradojevic & Wright (2007), Applied Fin. Econ. Letters 3(4) | `https://www.researchgate.net/publication/46527151_Investment_information_content_in_Bollinger_Bands` | BB underperform buy-and-hold; contrarian better |
| candlestick-reversal | Marshall, Young & Rose (2006), J. Banking & Finance 30(8) | `https://scispace.com/pdf/candlestick-technical-trading-strategies-can-they-create-2whgphf6vm.pdf` | no value; neither signal beats buy-and-hold |
| vol-compression | **PRACTITIONER ONLY** — Crabel (1990) book; no academic test of NR7/inside-bar found | `https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7` | Holmberg (2013) discusses the C–E principle but tests ORB, not NR7 |

**TEST_ORDER stays stable.** It is now an **explicit frozen list**
(`FROZEN_TEST_SEQUENCE`) byte-identical to the v1.2 tier-sorted order;
`evidenceTier` survives only as a diagnostic order rank and is **not** an
ordering key or an evidence claim. One item is **plainly wrong**:
`vol-compression` was ranked tier 1 in v1.2 with no empirical study. Its
evidence grade is corrected to PRACTITIONER_ONLY, but its SEQUENCE position
is deliberately kept per the instruction to keep TEST_ORDER stable; the
discrepancy is recorded here and in the amendment log rather than silently
reshuffling a frozen sequence. Two diagnostic four-state labels were also
fixed (§7.11.3).

**Near-duplicate and mirror-image cards** — all 24 within-family pairs are
listed in `CARD_RELATIONS` and printed in the full-text dump: **11
NEAR_DUPLICATE** (e.g. `donchian-20`/`donchian-55`, `sma-20-50`/`macd-cross`,
`rsi-14-30-70`/`williams-r-fade`, `bollinger-20-2`/`keltner-20-atr`,
`atr-squeeze-break`/`nr7-break`), **1 MIRROR_IMAGE**
(`pdh-retest`/`pdl-retest`), **12 RELATED**, plus 4 cross-family mirrors noted
for review. These drive the recomputed within-family overlap (§7.11.5).

#### 7.11.7 Version hashes and v1.0 reconstruction (task 6)

The **full 64-character SHA-256** of the three earlier immutable snapshots
(raw file bytes, `sha256sum` equivalent) is:

| Version | File | Full SHA-256 |
| ------- | ---- | ------------ |
| v1.0 | `docs/BLUEPRINT-v1.0.md` | `420a420851f5a666da3db70aaf46b1206c43e9b46159ee8d7c40c86df2daefbe` |
| v1.1 | `docs/BLUEPRINT-v1.1.md` | `72c078f335fb77b1a1260a49e39cbc856afda6ce9ac5635fd5ad345dcb7dd480` |
| v1.2 | `docs/BLUEPRINT-v1.2.md` | `cf3c94b1f505dc31828ce740dceb0e7989a606f62cf28c8d48cf91713917d543` |

v1.3's own hash (and all four again) is in
`artifacts/map-compass/blueprint-hashes.json` and section D of
`docs/BLUEPRINT-AMENDMENTS.md`; it is not printed here because embedding a
file's hash inside that same file is self-referential.

**How v1.0 was reconstructed — exactly.** v1.0 was authored on 2026-10-26 as
`BLUEPRINT.md` and committed locally, but the workspace was subsequently
re-cloned from GitHub `main` more than once; those re-clones wiped the local
git history (including the original v1.0 blob) while leaving working-tree
files untracked. The original v1.0 blob is therefore **not recoverable from
this repository's git objects** (`git rev-list --all --objects` finds no
BLUEPRINT blob). On 2026-10-27 the v1.0 snapshot
`docs/BLUEPRINT-v1.0.md` was reconstructed by re-emitting the **exact v1.0
text as authored** from the session transcript (596 lines / 28,232 bytes),
then hashing it. v1.1's snapshot is the ORIGINAL committed file
(`72c078f3…`), verified by a test. **Byte-for-byte identity of the v1.0
snapshot with the lost v1.0 blob cannot be certified**; the v1.0 → v1.1 diff
is nonetheless reproducible from the two preserved snapshots, and every
v1.1 → v1.2 → v1.3 edit is listed with a date in the amendment log. This
uncertainty is declared as a limitation (§15.19).

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

1. **Review and freeze the 24 claim cards** (decision #13) — STILL OPEN. Use
   `docs/CLAIM-CARDS-FULL-TEXT.md` (all 24 in full, with opened study URLs,
   verdict states and relations). Change any state assignment NOW — after
   results exist, changing a claim is the laundering this project forbids.
2. **Power decision — PARTIALLY RESOLVED at Amendment 3.** The 2 verdict states
   (EFFICIENT / CHOPPY) implement the "pre-register more pooling" option from
   §7.5 without touching criteria. The report-only table (§7.11.3) shows the
   pooled joint power is 0.280 for EFFICIENT and 0.810 for CHOPPY after day
   clustering and the relation-aware effective-N correction. Open sub-decision:
   accept that EFFICIENT remains underpowered, or start a NEW cycle with a
   different DEV/HOLDOUT allocation. Lowering criteria is not on the table.
3. **Vol-compression evidence grade (Amendment 3) — needs your call.** It is
   PRACTITIONER_ONLY but still sits at positions 7–9 of the frozen TEST_ORDER
   because v1.2 ranked it tier 1. Its grade was corrected; the sequence was
   kept stable as instructed. Confirm whether to move it (which would change a
   frozen sequence) or leave it flagged.

---

## 14. Reproducing everything

```bash
npm install                         # if node_modules is absent
npm run mc:m1          # fetch (pinned oids) -> normalise -> verify DST -> spread -> audit
npm run mc:map         # M2 -> map-validation.json + per-bar states
npm run mc:cost        # M3 -> cost-model.json (R units)
npm run mc:compass     # M4 -> routing-table.json
npm run mc:calibrate   # M5 dry-run -> harness-calibration.json (NO real claims)
npm run mc:power       # M5 -> power-projection.json (needs normalised data)
npm run mc:amend2      # Amendments 2+3: recompute reportOnly + reportOnlyV13 (no raw data needed)
npm run mc:cards       # print all 24 DRAFT cards in full text, in TEST_ORDER
npm run mc:coverage   # NO_BASELINE coverage audit + 48 verdict labels
npm run mc:compass     # regenerate routing-table.json with conditionalPolicy
npm test               # full suite
```

`mc:amend2` exists because the normalised data are gitignored and may be
absent; it re-derives only the `reportOnly` block from the committed projection
and asserts that no criterion changed. `mc:power` (with data present) produces
the same block via the shared `lib/amend2-report.mjs` helper.

Raw and normalised data are gitignored (264MB, fully regenerable from the
pinned oids). Only the small JSON reports are committed. Tests live in
`tests/map-compass/*.test.mjs`, including 13 Amendment-2 tests in
`amendment2.test.mjs`.

**Known failures (unrelated to this project):** one test in
`tests/synth.test.mjs` expects `MapGenerator.tsx` to say "28/32 ... EAT
05:00..." while the committed file says "26/32 ... EAT 04:00...".
`MapGenerator.tsx` is untouched. Additionally, three
`tests/map-compass/data-contract.test.mjs` tests fail when the gitignored
`raw/` and `normalized/` data have not been regenerated with `mc:m1` (they
check pin hashes and normalised-schema properties on disk). These are
data-availability failures, not logic failures; the full suite passes once
`mc:m1` has run.

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
| `harness-calibration.json` | M5 synthetic calibration + placebo null (clustered SE) |
| `power-projection.json`    | pre-M6 go/no-go projection + Amendment-2 `reportOnly` block |
| `random-baseline.json`     | matched random-entry null + `timeExitShare`  |
| `readability.json`         | empty-set interpretation + CONDITIONAL policy |
| `routing-table.json`       | M4 Compass table + `conditionalPolicy`      |
| `seal-audit.json`          | measured holdout feature bleed              |
| `baseline-coverage.json`   | NO_BASELINE cell audit (Amendment 3)        |
| `blueprint-hashes.json`    | full SHA-256 of v1.0/v1.1/v1.2/v1.3         |
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
15. **Real family-variant overlap is UNKNOWN (Amendment 2).** The 24 strategies
    are still DRAFT and must not be run, so the Kish effective-N in
    `power-projection.json` is estimated from the calibration harness
    (overlap 0.2071, design effect 1.2316) and bracketed by a 0 → 0.75
    sensitivity sweep. It is **report-only**. Once M6 runs, the real overlap
    must be reported; it must not be used to relax any criterion.
16. **Day-clustered SEs reduce calibration detection (Amendment 2).** Known
    +0.15R edge detection fell from 100% to 93.75% and placebo p95 from 5 to 3.
    This is the honest cost of not pretending same-day trades are independent.
17. **TIME_EXIT is a model, not a measured fill (Amendment 2).** The 96-bar cap
    closes at the bar's close at market; real fills would differ. The cap
    affects 1.24375% of the random baseline, so the exposure is bounded and
    disclosed.
18. **CONDITIONAL claims cannot ship in this cycle by default (Amendment 2).**
    The only promotion path spends VAL, so any CONDITIONAL promotion reduces the
    confirmatory weight available at M8. This is a deliberate conservatism, not
    an overlooked gap.
19. **v1.0 is a reconstruction.** The original v1.0 git blob was lost when the
    workspace was re-cloned from `main`; `docs/BLUEPRINT-v1.0.md` was
    reconstructed from the exact text as authored (596 lines / 28,232 bytes).
    Its SHA-256 is recorded in the amendment log. Byte-for-byte identity with
    the original v1.0 blob cannot be certified, but v1.1's snapshot is the
    original committed file (`72c078f3…`) and every v1.1→v1.2 edit is listed.

20. **Real family-variant overlap is an ASSUMPTION (Amendment 3).** The
    relation-aware design effect 2.2948 comes from `CARD_RELATIONS` metadata
    plus a seeded RNG, not from measured signals — the 24 strategies are still
    DRAFT and MUST NOT be run. A 0 → 1 share-scale sensitivity sweep is in
    `reportOnlyV13`. It is report-only; no criterion depends on it.
21. **The 2×3 power table is a FINER partition than the verdict cell.** Verdicts
    are decided on the POOLED verdict state, so the pooled rows (0.280 / 0.810)
    are the operative numbers; the six per-session rows are a conservative
    diagnostic. Splitting by session reduces n in each row.
22. **The UNCONTROLLED calibration mode is not a real result.** It exists so
    the harness can be calibrated on pure noise before any strategy exists.
    Every real verification row must have `baseline.mode = MATCHED_CONTROL`;
    `verifyReal()` hard-fails otherwise.
23. **NO_BASELINE coverage depends on the coarse fallback.** All 8 coarse
    `state|side` cells exist (n=4000), so the shipped rule yields 0
    NO_BASELINE cells. 648 of 1,632 trade-level lookups rely on the coarse
    fallback; forbidding it would create 648 NO_BASELINE holes.
24. **Empirical studies are literature, not evidence about our data.** They
    motivate the claims and set the test order; they do not pre-confirm
    anything. `vol-compression` has no peer-reviewed test and is marked
    PRACTITIONER_ONLY; its tier-1 v1.2 rank was plainly wrong.

---

## 16. Document map

| Document                                      | Role                                                   |
| --------------------------------------------- | ------------------------------------------------------ |
| **`BLUEPRINT.md`** (this file, v1.3)          | Canonical pre-registration — wins on conflict          |
| `docs/BLUEPRINT-v1.0.md`                      | Immutable v1.0 snapshot (reconstructed)                |
| `docs/BLUEPRINT-v1.1.md`                      | Immutable v1.1 snapshot, SHA-256 `72c078f3…`           |
| `docs/BLUEPRINT-v1.2.md`                      | Immutable v1.2 snapshot                                  |
| `docs/BLUEPRINT-v1.3.md`                      | Immutable v1.3 snapshot (this version)                   |
| `docs/EMPIRICAL-EVIDENCE.md`                  | Eight opened studies / PRACTITIONER_ONLY registry       |
| `docs/BLUEPRINT-AMENDMENTS.md`                | Dated log of every amendment since v1.0 (through v1.3) |
| `docs/CLAIM-CARDS-FULL-TEXT.md`               | All 24 cards in full text, in TEST_ORDER (DRAFT)       |
| `docs/MAP-COMPASS-DATA-CONTRACT.md`           | G1 detail: provenance, timezone epochs, schema, holes  |
| `docs/ENGINE-BIAS-REGISTER.md`                | G1.5 detail: D1–D4, resolution strategy, sign-off      |
| `docs/CLAIM-CARDS-REVIEW.md`                  | The 24 draft cards + review checklist + power decision |
| `scripts/map-compass/frozen.mjs`              | Machine-readable frozen constants                      |
| `FORWARD-VALIDATION.md`, `PROJECT-CHARTER.md` | Old-project protocols reused for ledger/parity         |
