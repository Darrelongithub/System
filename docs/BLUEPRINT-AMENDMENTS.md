# BLUEPRINT — dated amendment log since v1.0

**Rule:** `BLUEPRINT.md` is the canonical pre-registration. Every change to it
is recorded here with a date, a reason, and an explicit statement of whether a
threshold changed. Older versions are preserved byte-for-byte in this folder
and are never edited. A superseded decision is struck by a **later dated
entry**, not by deleting the old text.

**One invariant dominates this log:** *no amendment has been made after a real
strategy result, because there has never been one.* Amendment 8 and the card
freeze were recorded before any strategy outcome. At v1.7 cards were DRAFT;
under v1.8 they are frozen by Darrel (2026-11-05), while implementation and
synthetic dress rehearsal remain prerequisites to the one-time DEV run.

---

## Version / snapshot register

| Version | Date | File | SHA-256 | Status |
| --- | --- | --- | --- | --- |
| **v1.0** | 2026-10-26 | `docs/BLUEPRINT-v1.0.md` | `420a420851f5a666da3db70aaf46b1206c43e9b46159ee8d7c40c86df2daefbe` | superseded by v1.1; **preserved** |
| **v1.1** | 2026-10-26 | `docs/BLUEPRINT-v1.1.md` | `72c078f335fb77b1a1260a49e39cbc856afda6ce9ac5635fd5ad345dcb7dd480` | superseded by v1.2; **preserved** |
| **v1.2** | 2026-10-27 | `docs/BLUEPRINT-v1.2.md` | `cf3c94b1f505dc31828ce740dceb0e7989a606f62cf28c8d48cf91713917d543` | superseded by v1.3; **preserved** |
| **v1.3** | 2026-10-27 | `docs/BLUEPRINT-v1.3.md` | `acf0fa73c6a567fdf4ba9723f35737cd83077b25661bb9bb6fb29394783962cd` | superseded by v1.4; **preserved** |
| **v1.4** | 2026-10-27 | `docs/BLUEPRINT-v1.4.md` | `4cc12d78266f120ddb9c80c7035ac3b134094309700d01d4adac3c9d3f0c435a` | superseded by v1.5; **preserved** |
| **v1.5** | 2026-10-28 | `docs/BLUEPRINT-v1.5.md` | `f1d29351548bb0297cff4ee2fbe1df720f7070efa575e9524f8e68ebaf228fce` | superseded by v1.6; **preserved** |
| **v1.6** | 2026-11-02 | `docs/BLUEPRINT-v1.6.md` | `4ba3e529dfc0a60c1881f9c9331790de9e3680dec0b8bbe69145b631d2b7b16d` | superseded by v1.7; **preserved** |
| **v1.7** | 2026-11-02 | `docs/BLUEPRINT-v1.7.md` | `045b345320fc0a691e9af1cea8fcc0fd140bb7c04204647172f8ac5b0df13281` | superseded by v1.8; **preserved** |
| **v1.8** | 2026-11-05 | `docs/BLUEPRINT-v1.8.md` | `b878aa2747677a8e3324ba32ea74142edfbca86df892bad83dd3fec037292ff4` | superseded by v1.9; **preserved** |
| **v1.9** | 2026-11-06 | `docs/BLUEPRINT-v1.9.md` | `c91ee38c6c56355360fe3def3723b6de81cf9675814c76be4176a2be9375f74a` | superseded by v1.10; **preserved** |
| **v1.10** | 2026-11-06 | `docs/BLUEPRINT-v1.10.md` | `3f1613e12b2e53b69aa360c0cc81490b59a6c2dc59b21273bd4cba7f3e87c5e2` | superseded by v1.11; preserved |
| **v1.11** | 2026-11-07 | `docs/BLUEPRINT-v1.11.md` | `decd0ae949288750c78a7939c67fb8c61003bcde356d270d93a1a17cca59d63c` | current; `BLUEPRINT.md` byte-identical; 141,013 bytes; 2,097 lines; v1.10 pin preserved |

**v1.11 provenance (2026-11-07):** The Stage 3b status text was edited after the v1.10 pin was recorded. The committed pre-edit `docs/BLUEPRINT-v1.10.md` was restored and remains pinned without changing its hash; the updated current `BLUEPRINT.md` is versioned as v1.11 instead of rewriting the v1.10 pin. `BLUEPRINT.md` content is unchanged by this commit.

- v1.1's snapshot is the **original committed file** (hash verified by a test).
- v1.0's original git blob was lost when the workspace was re-cloned from
  `main`. The preserved copy was reconstructed from the exact v1.0 text as
  authored (596 lines / 28,232 bytes). Byte-for-byte identity with the lost
  blob cannot be certified; this is declared as a limitation in v1.2 §15.19.
  Every v1.1→v1.2 edit is enumerated below, so the chain is auditable from
  v1.1 onward.
- v1.2's, v1.3's and v1.4's hashes are recorded at the bottom of this file
  (section D) and in `artifacts/map-compass/blueprint-hashes.json`. All five
  are printed in full below, each exactly 64 hexadecimal characters. A test
  re-hashes each snapshot and compares.
- `BLUEPRINT.md` at v1.3 is a byte copy of `docs/BLUEPRINT-v1.3.md`.
  `sha256sum` of both is `acf0fa73…`.

---

## A0 — 2026-10-26 · v1.0 baseline (no amendment)

Initial consolidated blueprint. Froze the four gates' worth of constants, the
two-epoch DST contract, the 12/4/5/2-year role split, the 24 DRAFT claim cards,
the family-level verification criteria, the placebo/null machinery, and the
M0–M11 build sequence. **This is the reference point for "no criterion may
change because of the result".**

Frozen criteria as of v1.0: `n ≥ 100`, mean `> +0.10R` **net**, `t > 2`,
concentration `≤ 0.50`, LOYO `≥ 0.75`, verdict stable across `≥ 80%` of the
threshold sweep grid.

---

## A1 — 2026-10-26 · G0 clarification (folded into v1.0 text)

**What:** added `MAP.warmupBars = 1000`, `MAP.atrPeriod = 14` and
`MAP.rangeLookback = 50` to `frozen.mjs`.
**Why:** they were stated in prose in v1.0 and in the generator's ATR metadata
but were not machine-readable constants.
**Threshold changed?** No. All three values were already in force; only their
encoding changed. The six locked thresholds (ER 0.35, ATR pctile 70, stop
1.5×ATR, target 2R, cost slippage 0.02 ATR, criteria) were untouched.
**Decision made before results?** Yes.

---

## A2 — 2026-10-26 · v1.1 — six G0 review amendments

A pre-results review found six problems. All six were decided on 2026-10-26
and consolidated into v1.1. **No real claim result existed.**

| # | Amendment | What changed | Threshold changed? |
| --- | --- | --- | --- |
| A2.1 | **Strength alone ships** | Compass enables a state iff the STRENGTH claim is CONFIRMED. The weakness-CONFIRMED requirement was removed as a redundant second gate; a CONFIRMED weakness still adds a hard block. (`lib/compass.mjs`, §6) | No — removed a redundant gate, did not lower any numeric bar. |
| A2.2 | **Sweep grades, never nullifies** | `SENSITIVITY_RULE.sweepsCanNullifyVerdict = false`. Frozen cutoffs are authoritative. The sweep produces ROBUST / FRAGILE / DEFINITION_SENSITIVE and a CONDITIONAL tag. (§7.7) | This **removed** the v1.0 "verdict stable across ≥80% of grid" veto. It did not change a numeric criterion. Later qualified by A3.2. |
| A2.3 | **Matched random-entry control** | `random-baseline.mjs` + `RANDOM_BASELINE`: 4,000 entries per state×side, seed 20261026, matched on state/side/session/vol, identical stop/target/cost, **96-bar max hold**. `verifyClaim` now tests EXCESS over the matched cell, not absolute mean vs zero. `absoluteNetRMin = 0` added. All claims report excess + CI + long/short split regardless of verdict. (§7.2, §7.6) | **The meaning of the +0.10R floor changed** from absolute mean to excess over random — a stricter, drift-corrected test. The numeric 0.10, t > 2, n ≥ 100, 0.50, 0.75 were unchanged. |
| A2.4 | **Evidence prior + fixed test order** | `EVIDENCE.priorFalseFraction = 0.80` (was 0.60); `evidenceTier` 1–4; `TEST_ORDER` = tier ascending then frozen priority; candlestick family tested LAST; ledger records `testOrder`. (§7.9) | No numeric verification criterion changed; the prior and the sequence changed. |
| A2.5 | **Holdout feature bleed measured** | `seal-audit.mjs` / `seal-audit.json`: 500-bar lookback touches holdout prices for 1.14% of DEV bars (2.27% at 1000), confined to DEV years 2009/2013/2017 boundaries. M10 must report with and without those prefixes. (§15.13) | No. Disclosure only. |
| A2.6 | **VAL contamination declared** | VAL 2020–2024 was examined in earlier work and is not pristine to the researcher; STRESS 2025–2026 contains the old discovery window and can never promote a claim. Sealed interleaved years 2008/2012/2016/2019 carry final confirmatory weight at M10. (§15.14) | No. Disclosure only. |

**Companion artefacts added at v1.1** (all decided pre-results):
`readability.mjs` (an empty CONFIRMED set must be interpretable —
NEGATIVE_RESULT / UNDERPOWERED / MIXED / POSITIVE), TIME_EXIT close-at-market
in `lib/trade.mjs` (fixing trades that were previously booked 0R / left OPEN),
and the corrected D1 note in `ENGINE-BIAS-REGISTER.md` (the old "entry-only
spread understates 2×" claim was **wrong** on bid data; the real defects are
static magnitude, regime-blindness and no slippage).

**v1.1 calibration:** FP rate 0.0026, known +0.15R edge detection 100%,
placebo median 0 / p95 5, power n=1000 → 0.60.

---

## A3 — 2026-10-27 · v1.2 — G0 AMENDMENT 2

Requested by the user as a single pre-results amendment. **Frozen thresholds
stay unchanged. Do not run real strategy verification. Do not freeze claim
cards. Questions to the user last.**

| # | Amendment | What changed | Threshold changed? |
| --- | --- | --- | --- |
| A3.1 | **Version history preserved** | `docs/BLUEPRINT-v1.0.md` reconstructed and preserved; `docs/BLUEPRINT-v1.1.md` preserved with verified hash `72c078f3…`; `docs/BLUEPRINT-v1.2.md` snapshot; this dated log. | No. |
| A3.2 | **CONDITIONAL default "no"** | Supersedes A2.2's "it ships". `SENSITIVITY_RULE.compassCanEnableConditional = false`, `conditionalRequiresValSupport = true`, `conditionalReportAt = ["M9","M10"]`, `valSupportCriterion` frozen now. `buildRoutingTable` emits `CONDITIONAL_NOT_ENABLED`; `conditionalValPromotions()` is the only promotion path and requires VAL to independently meet the SAME frozen criteria. `routing-table.json` emits `conditionalPolicy`. (§7.7, §7.10.2) | **No threshold changed — this is STRICTER.** It removes a shipping path. |
| A3.3 | **Clustered inference** | `lib/cluster.mjs`: CR1 SEs clustered by calendar day for the aggregate t, `excessCi95`, `meanCi95`, all by-side CIs and all per-year CIs. Every row reports `inference` (method, clusters, plainSe, clusteredSe, seInflation, effectiveN, Kish method). `t > 2` is now a cluster-robust t. (§7.2.1, §7.10.1) | The numeric cutoff `t > 2` is **unchanged**; the estimator became stricter. Detection fell 100% → 93.75%, placebo p95 5 → 3. |
| A3.4 | **Effective-sample correction** | Kish effective N over entry-bar clusters per family cell (`nEffective`, `variantOverlapFraction`, `designEffect`, `multiTradeBars`). Feeds the **power report only** — no double inflation of the SE. Calibration harness now emits day + overlapping entry-bar keys. (§7.10.1) | No. Report-only. |
| A3.5 | **`power-projection.json` recomputed REPORT-ONLY** | `lib/amend2-report.mjs` + `recompute-power-report.mjs`. Adds `reportOnly` with the criteria hash `788e01df…`, measured dependence (overlap 0.2071, design effect 1.2316, 4,032 day clusters, SE inflation 1.009), a 0 → 0.75 overlap sensitivity sweep, adjusted powers (EXPANSION 0.272 → 0.226, GRIND 0.364 → 0.301, WHIPSAW 0.550 → 0.461, QUIET 0.967 → 0.924), and explicit permitted/forbidden responses. The recompute script **asserts** `verdict`, `criteria`, `centralCase`, `scenarios`, `grossEdgeNeededR` are unchanged and refuses to write otherwise. Verdict stays **UNDERPOWERED**. (§7.5, §7.10.1) | **No criterion may change because of the result.** None did. |
| A3.6 | **TIME_EXIT frozen constant** | `EXIT_HARNESS.maxHoldBars = 96`, `timeExitLabel = "TIME_EXIT"`, dated `amendment` record (`decidedBeforeResults: true`, `criteriaChanged: false`). `lib/trade.mjs` now defaults `maxBars` to it, so real claim evaluation shares the cap with the random control. `random-baseline.json` reports `timeExitShare`: **398 / 32,000 = 1.24375%** (TP 10,479, SL 21,123, INVALID_ATR 0, 76 ambiguous flags). (§7.1, §7.10.3) | No — the cap was already in `RANDOM_BASELINE`; only its scope and encoding changed. |
| A3.7 | **Full CONFIRMED rule printed** | §7.2.1 reproduces the exact 10-step `verifyClaim` procedure and clarifies: the +0.10R floor is on **excess over matched random**, in net R, not on absolute net mean (which has only a `> 0` gate); `t > 2` is the cluster-robust t **of the excess**; the statistic/SE formula is CR1 with `G/(G-1)`; REFUTED is not gated by vetoes. | No. Disclosure only. |
| A3.8 | **All 24 claim cards printed in full** | `print-claim-cards.mjs` → `docs/CLAIM-CARDS-FULL-TEXT.md`: id, family, variant, tier, priority, strength claim/state, weakness claim/state, rationale, session restriction, sources, review fields — all in `TEST_ORDER`. **Status stays `DRAFT`.** No card was edited, reordered or frozen. (§7.10.4) | No. |
| A3.9 | **Readouts synced** | `readability.json` placebo p95 updated 5 → 3 (dynamic from calibration), `conditionalPolicy` and `reportOnlyClusteredPower` added; `harness-calibration.json` regenerated; `routing-table.json` regenerated with `conditionalPolicy`; §7.3/§7.5/§15 tables updated. | No. |
| A3.10 | **Pinned by tests** | `tests/map-compass/amendment2.test.mjs`: 13 tests covering unchanged criteria, the 96-bar constant, `TIME_EXIT` default, cluster SE, Kish effective N, CR1 CIs, CONDITIONAL blocking and VAL promotion, report-only power, version snapshots, and the DRAFT/no-real-result invariant. | No. |

**Explicitly NOT done in Amendment 2** (user instruction): no real strategy
verification was run; no claim card was frozen; `FREEZE.status` remains
`DRAFT`; `claim-verification.json` does not exist; `enabledCount` remains 0.

**Changes to §15 limitations:** added items 15–19 (real variant overlap
unknown; clustered SEs reduce calibration detection; TIME_EXIT is a model not a
measured fill; CONDITIONAL promotion spends VAL; v1.0 is a reconstruction).

---

## A4 — 2026-10-27 · v1.3 — G0 AMENDMENT 3

Requested by the user as a single pre-results amendment. Header instruction:
**"before any strategy result exists; frozen thresholds unchanged"**. No real
strategy verification was run; the claim cards were NOT frozen. `FREEZE.status`
remains `DRAFT`, `claim-verification.json` does not exist, `enabledCount` is 0.
The dated diff against v1.2 is printed in `BLUEPRINT.md` §7.2.1 and summarised
here.

| # | Amendment | What changed | Threshold changed? |
| --- | --- | --- | --- |
| A4.1 | **CONFIRMED rule RESTORED** | v1.2's `excess > 0.10 AND net > 0` replaced by a CONJUNCTION: **net mean > +0.10R with day-clustered `tNet > 2`** AND **excess over matched random > 0 with day-clustered `t > 2`**, plus n/concentration/LOYO/NO_BASELINE vetoes. `absoluteNetRMin` and the `ABSOLUTE_NET_R_*` veto REMOVED; `excessFloorR = 0` added. Full pseudo-code + dated diff in BLUEPRINT §7.2.1. | **The verification RULE changed — this was explicitly requested.** Every numeric constant (0.10, 2, 100, 0.50, 0.75) is the original frozen value. No MAP/COST/EXIT value changed. |
| A4.2 | **Sign-safe excess + NO_BASELINE unit tests** | `excessFor(netR, baselineMean, direction)` applies claim direction to the DIFFERENCE; `netR` is already side-signed. Short +1.0R vs random-short −0.10R → **+1.10**, not −1.10; same for long. `matchedBaseline()` now resolves fine → coarse → **MISSING** (`mean = null`, `NO_BASELINE`), never 0. Any unmatched trade forces INCONCLUSIVE. `baseline: null` is the only zero-null mode, flagged `UNCONTROLLED_DRY_RUN`, and `verifyReal()` refuses it. | No threshold changed; the zero fallback was **deleted** (stricter). |
| A4.3 | **NO_BASELINE coverage audit** | `baseline-coverage.mjs` → `baseline-coverage.json`: 48 claim halves, 136 claim×verdictState×session cells, 272 claim×fourState×session cells, 1,632 trade-level lookups. **0 hit NO_BASELINE** with the shipped rule (all 8 coarse `state|side` cells have n=4000≥200). 984 resolve FINE, 648 use COARSE fallback; forbidding coarse fallback would create 648 NO_BASELINE cells. | No. Audit only. |
| A4.4 | **Two VERDICT STATES** | EFFICIENT = EXPANSION+GRIND (ER≥0.35), CHOPPY = WHIPSAW+QUIET. Verdicts decided on 2 states; four Map states reported for every claim as `diagnosticOnly` (§7.11.3). Family strength mapping frozen; weakness = the other state. `vol-compression` strength = CHOPPY because the signal is observed BEFORE expansion. Compass table re-keyed to 2 states with `verdictStateOf()` lookup. | No numeric threshold changed. This is the "pre-register more pooling" response to the G0 power decision. |
| A4.5 | **2×3 report-only power table** | `power-projection.json → reportOnlyV13`: 2 verdict states × 3 sessions with real DEV bar and DEV calendar-day counts, day-clustered SE inflation 1.009, and the recomputed within-family design effect 2.2948. Pooled joint power 0.280 EFFICIENT / 0.810 CHOPPY. v1.2's `reportOnly` kept as a SUPERSEDED historical snapshot with its ORIGINAL criteria hash `788e01df…`. Verdict stays **UNDERPOWERED**. | **No criterion may change because of the result.** None did. Report-only. |
| A4.6 | **Overlap recomputed + provenance stated** | `lib/overlap.mjs`: 11 NEAR_DUPLICATE, 1 MIRROR_IMAGE, 12 RELATED pairs from `CARD_RELATIONS`. Relation-aware shares (0.75/0.55/0.30/0.10) → pooled overlap 0.8302, design effect 2.2948 (v1.2: 0.2071 / 1.2316). **0.2071 provenance:** v1.2 `measureDependence()` used `syntheticTradesV12({seed:7,perCell:900,trueEdgeR:0,sd:1.43})` — pure Gaussian synthetic noise with ZERO edge, one shared 900-bar pool per family/state/year, Kish effective N over `entryBar`. Only `entryBar`/`day` fields used; `netR` was zero-edge noise used only for the 1.009 SE ratio. **No outcomes.** Exact v1.2 generator preserved so the number is reproducible. | No. Report-only + documentation. |
| A4.7 | **Reversion standard-exit caveat** | Every verdict row for band-reversion, osc-fade, candlestick-reversal carries **"under the standard exit (1.5 ATR stop, 2R target) only"**. On cards, `runBattery` rows, `reportOnlyV13`, `readability.json`, `baseline-coverage.json`. **No new exit added.** | No. Label only. |
| A4.8 | **Tiers REPLACED by opened empirical studies** | 7 families have one study located and OPENED with a full URL; `vol-compression` marked PRACTITIONER_ONLY (no peer-reviewed NR7/inside-bar test found). Registry in `frozen.mjs → EMPIRICAL_STUDIES`, `docs/EMPIRICAL-EVIDENCE.md`, full-text card dump. `EVIDENCE.tiers` removed. `TEST_ORDER` now an EXPLICIT frozen list **byte-identical to v1.2**; `evidenceTier` is a diagnostic rank only. | No verification criterion changed. |
| A4.9 | **Plainly-wrong items corrected / flagged** | `vol-compression` was tier 1 with no study → grade corrected to PRACTITIONER_ONLY, sequence position KEPT (TEST_ORDER stability) and the discrepancy flagged for the user. Two textbook weakness labels in the SAME CHOPPY state as their strength (`bb-squeeze-fade`, `three-soldiers-crows`) corrected to EXPANSION (EFFICIENT). | No. Diagnostics only (verdict states were already EFFICIENT/CHOPPY). |
| A4.10 | **Pinned by tests** | `tests/map-compass/amendment3.test.mjs`: restored-rule conjunction (3 tests), short/long sign (3), NO_BASELINE fail-closed + coverage (4), verdict states + diagnostics + battery (4), overlap provenance + 2×3 power (3), exit caveat (1), evidence registry + TEST_ORDER (2), hashes (1), DRAFT guard (1). Also updated v1.2 tests for the new state keys and rule. | No. |
| A4.11 | **v1.3 snapshot + hashes** | `docs/BLUEPRINT-v1.3.md` byte-copy of `BLUEPRINT.md`; `artifacts/map-compass/blueprint-hashes.json` holds all four full 64-char SHA-256 values. Section D below prints them. | No. |

**Calibration after A4.1/A4.2:** FP rate 0, known +0.15R detection 100%,
placebo p95 0, power@+0.10R 0.599/0.799 — an **UNCONTROLLED synthetic**
dry-run (disclosed in `harness-calibration.json`); real verification is
hard-gated to `MATCHED_CONTROL`. The exact v1.2 generator survives as
`syntheticTradesV12()` so the 0.2071 estimate is reproducible. The harness
kill criterion remains cleared.

**Explicitly NOT done:** no real strategy verification; no claim card frozen;
no criterion relaxed; no card reordered; no new exit.

---

## A5 — 2026-10-27 · v1.4 — G0 AMENDMENT 4

Header instruction: **"before any strategy result exists; frozen thresholds, Map,
costs, exit and the CONFIRMED rule unchanged"**. `verify-claims` stays BLOCKED and
the cards stay `DRAFT`. No real strategy verification was run; `claim-verification.json`
does not exist; `enabledCount` is 0.

| # | Amendment | What changed | Frozen value changed? |
| --- | --- | --- | --- |
| A5.1 | **Signal-only library** | `scripts/map-compass/lib/signals.mjs` implements the 24 entry-signal functions as pure causal functions with the exact card parameters (`signal-params.mjs`, attached to each card as `parameters`). They emit entry bars and sides ONLY — no stops, targets, trades or R. Two tests pin the properties: no-lookahead (deleting the future never changes earlier signals — on synthetic bars for all 24 cards × 2 seeds × 4 cuts, and on the REAL bars for the prior-day and session-range cards) and no-outcome-import (`signals.mjs` imports exactly frozen.mjs, signal-params.mjs and dst.mjs; no emitted row contains netR/grossR/costR/totalR/verdict/outcome/exit/stop/target/R/pnl). The build caught and fixed two genuine lookahead bugs. | No. Adding `parameters` changes no claim, state, priority, session restriction or TEST_ORDER position. |
| A5.2 | **Signal counts on DEV** | `signal-counts.mjs` → `signal-counts.json`. Per card and per family: signals by side, by verdict state, by four Map state, by session, and by the verdict state 20 bars BEFORE the signal (diagnostic only). Plus each family's share landing in its strength state. **291,501 raw DEV signals; all 48 card claim cells and all 16 family claim cells have expected n ≥ 100; STRUCTURALLY THIN = 0; families lacking any testable cell = 0.** | No. Measurement only; no card, state or Map changed. |
| A5.3 | **Overlap measured from data** | `measure-overlap.mjs` → `measured-overlap.json`. The v1.3 label-driven overlap (design effect 2.2948) is replaced by the MEASURED entry-bar overlap between the three variants of each family: Jaccard and Kish effective N. Per-family design effects 1.02–2.13, pooled 4.047. Measured findings: `osc-fade`'s williams-r/stochastic pair has Jaccard **1.000** (identical bars); `level-retest`'s mirror pair has Jaccard 0.000. The v1.3 synthetic SE inflation (1.009) is replaced by a day-clustered CR1/plain-SE ratio computed on the random-entry baseline trades per verdict state: EFFICIENT **1.1115**, CHOPPY **1.0356**. | No. Report-only. Measured inputs named; assumptions named (shared bar = shared trade is an UPPER bound; per-trade SD is the baseline's measured SD). |
| A5.4 | **Slot model** | `slot-model.mjs` → `slot-model.json`. Emulates the one-position-per-slot book using the baseline's bars-to-exit distribution. **EXPLICITLY AN ASSUMPTION**: hold durations come from the RANDOM baseline, a single global slot is modelled, priority is not re-applied, no strategy outcome is used. Result: pooled 291,501 raw → 7,401 kept (survival 2.54%); per-family survival 7–31%; every family still clears n ≥ 100 in both verdict states. | No. Assumption only. |
| A5.5 | **Power curve, report-only** | `power-curve.mjs` → `power-curve.json`. Per 2-state × 3-session cell and pooled, the probability of satisfying the FULL CONFIRMED conjunction for true net edges 0.05R, 0.10R, 0.20R, 0.30R. Monte Carlo over deterministic runs (400/cell-edge) through the REAL `verifyClaim()`, using measured trade counts after the slot model, measured DEV day counts, measured DEV per-year bar counts, the baseline's measured SD and day correlation, and the measured verdict-state baseline mean. | **No criterion may change because of the result — none did.** `criteriaChanged`/`thresholdChanged`/`verdictChanged` are all false; `power-projection.json` verdict stays UNDERPOWERED. |
| A5.6 | **Baseline top-up** | `random-baseline.mjs` pre-registers a top-up so every fine cell (verdict state × session × vol regime × side) has ≥200 random entries, using the same stop, target, costs and 96-bar cap with a fixed derived seed (20268945). Before: 30/36 fine cells sufficient, 28/72 lookups (38.89%) on the coarse fallback. After: **36/36 sufficient, 0/72 (0%) on the coarse fallback, 0 NO_BASELINE**, 538 entries added. The v1.3 four-state fine key is kept; the verdict-state key is preferred by `matchedBaseline()`. | Coverage only. No criterion. The pre-top-up share is preserved in `coverage.before`. TIME_EXIT stays 398 entries; the resolved total rises 32,000 → 32,538, so the share moves 1.24375% → 1.22319% (the v1.2 value stays frozen in `EXIT_HARNESS.amendment`). |
| A5.7 | **Criticism registry** | `frozen.mjs → CRITICISMS` (machine-readable), printed in `docs/EMPIRICAL-EVIDENCE.md` and in every card of the full-text dump. For each of the 8 families the strongest published criticism or failed replication was located and **OPENED on 2026-10-27**, so every entry is **VERIFIED**. Nothing is cited from memory and no URL, author or year is invented. All 8 are NEGATIVE; six are peer-reviewed or pre-registered, two are pre-registered replications. | No. Literature registry only. |
| A5.8 | **v1.4 snapshot + hashes** | `docs/BLUEPRINT-v1.4.md` byte-copy of `BLUEPRINT.md`; `blueprint-hashes.json` now holds all five full 64-char SHA-256 values. | No. |
| A5.9 | **Pinned by tests** | `tests/map-compass/amendment4.test.mjs`: signal library (6), signal counts (3), overlap (2), slot model (1), power curve (2), top-up (2), criticisms (1), guards (2). Also a real-data no-lookahead test. v1.2/v1.3 tests updated for the new baseline keying and coverage state. | No. |

**Explicitly NOT done:** no real strategy verification; no claim card frozen; no
criterion, threshold, Map value, cost, exit, stop, target, floor or t cutoff
changed; no card reordered; no new exit.

---

## B — Cumulative answer to "did a threshold change?"

| Constant | v1.0 | v1.4 | Changed? |
| --- | --- | --- | --- |
| `MAP.erCutoff` | 0.35 | 0.35 | no |
| `MAP.atrPctileCutoff` | 70 | 70 | no |
| `MAP.hysteresisBars` | 3 | 3 | no |
| `MAP.warmupBars` | 1000 | 1000 | no |
| `EXIT_HARNESS.stopAtrMultiple` | 1.5 | 1.5 | no |
| `EXIT_HARNESS.targetR` | 2 | 2 | no |
| `EXIT_HARNESS.maxHoldBars` | — (96 only in `RANDOM_BASELINE`) | **96, global** | added (A3.6); no existing value changed |
| `COST.slippage.atrFractionPerSide` | 0.02 | 0.02 | no |
| `CLAIM_CRITERIA.practicalFloorR` | 0.10 | 0.10 | numeric value no; meaning changed to "excess" at A2.3 then **RESTORED to net mean** at A4.1 (explicitly requested) |
| `CLAIM_CRITERIA.tStatMin` | 2 | 2 | numeric value no; **estimator** cluster-robust at A3.3; now required for BOTH tNet and t at A4.1 |
| `CLAIM_CRITERIA.absoluteNetRMin` | — | **removed** | added at A2.3 (=0), REMOVED at A4.1 |
| `CLAIM_CRITERIA.excessFloorR` | — | **0** | added at A4.1 (control gate: excess > 0) |
| `CLAIM_CRITERIA.requireMatchedBaseline` | — | **true** | added at A4.2 (NO_BASELINE fail-closed) |
| Verdict states | 4 Map states | **2 (EFFICIENT/CHOPPY)** | A4.4 — pooling, not a threshold change |
| Evidence tiers | 1–4 subjective | **study registry / PRACTITIONER_ONLY** | A4.8 — metadata, not a criterion |
| `CLAIM_CRITERIA.minTradesPerCell` | 100 | 100 | no |
| `CLAIM_CRITERIA.concentrationMax` | 0.50 | 0.50 | no |
| `CLAIM_CRITERIA.loyoPositiveMin` | 0.75 | 0.75 | no |
| `ROLES` | 12/4/5/2 | 12/4/5/2 | no |
| Claim card count / priorities / TEST_ORDER | 24 / 1–24 | 24 / 1–24 | no (Amendment 4 added a `parameters` field and a `criticism` field to each card; no claim, state, priority or order position moved) |
| Verdict states | 4 Map states | **2 (EFFICIENT/CHOPPY)** | A4.4 — pooling, not a threshold change |
| Evidence tiers | 1–4 subjective | **study registry + VERIFIED criticisms** | A4.8 / A5.7 — metadata, not a criterion |
| Baseline coverage | — | **≥200 per verdict-state fine cell** | A5.6 — coverage, not a criterion |

Every non-"no" row is either a **stricter** test, a **pre-results rule
rearrangement explicitly requested by the user**, or a **measurement added
before any result existed** — never a relaxation chosen after seeing an
outcome. A4.1 changed the verification RULE (the user's task 1) but kept every
numeric constant; A5 added measurement and coverage only. That distinction is
the whole point of this log.

---

## C — Still open after Amendment 4

1. **Review and freeze the 24 claim cards** (decision #13) — STILL OPEN. `docs/CLAIM-CARDS-FULL-TEXT.md` is the review dump, now with opened study URLs, verdict states and card relations. Change any state assignment NOW — after results exist, changing a claim is laundering.
2. **Power decision — resolved in measurement, open as a judgement.** A5.2 measured the DEV signal counts directly: all 48 card cells and all 16 family cells clear n ≥ 100, far better than the v1.3 projection which assumed a 0.6 slot-survival factor. But A5.4's measured one-slot book cuts the pooled sample by ~39x (survival 2.54%), and A5.5's report-only power curve puts P(CONFIRMED) at ~0.5 for a true +0.10R edge and ~0.8–1.0 for +0.20R. Open sub-decision: accept that EFFICIENT stays thin, or start a NEW cycle with a different DEV/HOLDOUT allocation. Forbidden: lower the +0.10R floor, soften `t > 2`, re-fit costs, edit thresholds after results.
3. **Vol-compression sequence position** (A4.9): its evidence grade is corrected to PRACTITIONER_ONLY but it still sits at TEST_ORDER positions 7–9. A5.7 opened a measured criticism for it. Confirm whether to move it or leave it flagged.
4. **Adopt the measured overlap and slot model as standing inputs?** A5.3 replaced the label-driven overlap (DE 2.2948) with measured values (per-family 1.02–2.13, pooled 4.047); A5.4 added the one-slot model. Confirm both should replace the v1.3 assumptions in the standing power readout.

---

## D — Full SHA-256 of every snapshot (updated through Amendment 7)

All eight values are the complete **64-character** SHA-256 of the raw file
bytes (`sha256sum` equivalent). Machine-readable copy:
`artifacts/map-compass/blueprint-hashes.json`.

| Version | File | Bytes | Lines | SHA-256 (full 64 hex chars) |
| --- | --- | ---: | ---: | --- |
| v1.0 | `docs/BLUEPRINT-v1.0.md` | 28,232 | 596 | `420a420851f5a666da3db70aaf46b1206c43e9b46159ee8d7c40c86df2daefbe` |
| v1.1 | `docs/BLUEPRINT-v1.1.md` | 40,483 | 692 | `72c078f335fb77b1a1260a49e39cbc856afda6ce9ac5635fd5ad345dcb7dd480` |
| v1.2 | `docs/BLUEPRINT-v1.2.md` | 58,249 | 978 | `cf3c94b1f505dc31828ce740dceb0e7989a606f62cf28c8d48cf91713917d543` |
| v1.3 | `docs/BLUEPRINT-v1.3.md` | 82,493 | 1,342 | `acf0fa73c6a567fdf4ba9723f35737cd83077b25661bb9bb6fb29394783962cd` |
| v1.4 | `docs/BLUEPRINT-v1.4.md` | 103,632 | 1,678 | `4cc12d78266f120ddb9c80c7035ac3b134094309700d01d4adac3c9d3f0c435a` |
| v1.5 | `docs/BLUEPRINT-v1.5.md` | 111,438 | 1,792 | `f1d29351548bb0297cff4ee2fbe1df720f7070efa575e9524f8e68ebaf228fce` |
| v1.6 | `docs/BLUEPRINT-v1.6.md` | 119,281 | 1,915 | `4ba3e529dfc0a60c1881f9c9331790de9e3680dec0b8bbe69145b631d2b7b16d` |
| v1.7 | `docs/BLUEPRINT-v1.7.md` | 126,276 | 1,955 | `045b345320fc0a691e9af1cea8fcc0fd140bb7c04204647172f8ac5b0df13281` |

`BLUEPRINT.md` at v1.7 is byte-identical to `docs/BLUEPRINT-v1.7.md`
(hash shown above). Earlier snapshots were never edited.

### Exactly how v1.0 was reconstructed

1. v1.0 was authored on **2026-10-26** as the file `BLUEPRINT.md` and committed
   locally (596 lines / 28,232 bytes of markdown).
2. The workspace was subsequently **re-cloned from GitHub `main` more than
   once**. Those re-clones reset local git history (so the local `git log`
   again showed only `b57ccd7 Add files via upload`) while leaving the
   working-tree files present but **untracked**. The original v1.0 git blob
   was therefore lost: `git rev-list --all --objects | grep -i blueprint`
   returns nothing, and no copy existed elsewhere on disk.
3. On **2026-10-27**, `docs/BLUEPRINT-v1.0.md` was recreated by re-emitting
   the **exact v1.0 text as authored**, taken verbatim from the earlier
   `write_file` call in the session transcript (the full 596-line document,
   including its original `**Version 1.0 — consolidated 2026-10-26**` header
   and the 12-item limitations list). It was written with a single
   `write_file` and then hashed.
4. The reconstruction is **596 lines / 28,232 bytes**; its SHA-256 is the
   `420a4208…` above. A later formatting pass on v1.1 (table padding,
   `*italic*` → `_italic_`) accounts for the v1.0→v1.1 diff, and that diff
   is reproducible from the two preserved snapshots.
5. **Honest limitation:** byte-for-byte identity between the reconstructed
   v1.0 snapshot and the lost original blob **cannot be certified**, because
   the blob no longer exists to compare against. v1.1's snapshot IS the
   original committed file (hash `72c078f3…`, pinned by a test), and every
   v1.1 → v1.2 → v1.3 edit is enumerated above with a date, so the auditable
   chain is intact from v1.1 onward. This uncertainty is declared in
   `BLUEPRINT.md` §15.19 and §7.11.7.


---

## E — G0 Amendment 5 (2026-10-28, before any strategy result)

**Scope/guard:** report-only. No state assignment, card parameter, priority,
Map rule, cost, exit, frozen threshold, or CONFIRMED criterion changed. All 24
cards remain DRAFT (`approvedBy=null`, `approvedAt=null`); `verify-claims`
remains blocked. No real strategy result was generated and no claim-result file
was created.

### E.1 Slot reconciliation

A single one-slot book cannot have both 7,401 kept trades and 37.9 mean held
bars over 131,922 DEV bars: 7,401×37.9=280,297 bars. Amendment 5 separates
claim validation (one independent slot per card) from the combined Compass
execution book (one position total; same-bar winner is smallest frozen numeric
priority). Family survivors are sums of the three card-specific slots. This is
a recommended architecture, explicitly **not owner-approved**.

The rebuilt model sees 291,501 raw DEV signal emissions; 215,099 have one of
the two recognized verdict states and enter claim-slot counting, while 76,402
out-of-state emissions are excluded. Per-card and family kept/raw counts are in
`docs/G0-AMENDMENT-5-REPORT.md` and `artifacts/map-compass/slot-model.json`.
The combined priority book retains 6,903 of 74,886 eligible same-bar
candidates, using a baseline-resampled mean hold of 17.897 bars. This is only a
capacity emulation. Current `runBattery` consumes supplied trades and pools
variants family×verdict-state; it does not apply priority or enforce card slots.
No M6 producer exists, so cross-card blocking is neither enforced nor measured;
separate claim and Compass trade streams are required before real verification.

### E.2 Power correction and calendar day keys

Random-entry samples now store their actual EAT calendar day and CR1 uses that
date rather than the invalid year-plus-bar-index-suffix proxy. EFFICIENT baseline
CR1/plain-SE inflation is 1.3222 over 2,026 day clusters (n=16,268); CHOPPY is
1.1202 over 2,913 clusters (n=16,270). The random seed, sampling, coverage,
costs and exits are unchanged.

The corrected report uses measured per-session post-slot n and exact pooled
n=sum(session n), curves are monotone at true edges 0/.05/.10/.15/.20/.30R,
and each cell reports full CONFIRMED probability, failure shares by veto, and
analytic P(mean net > .10R AND tNet > 2). The v1.4 pooled .33 probability at
.05R is withdrawn: with n≈6,170, SD≈1.42, SE≈.02, a true .05R mean is 2.5 SE
below the frozen +.10R floor; the old simulation independently generated net
and excess and misattributed pooled counts.

The user's pooled-power ≥ every-session constraint is mathematically
incompatible for true edges below the +.10R floor: as pooled SE shrinks, the
chance of a false crossing of +.10R tends to zero, while finite session cells
retain a positive noise-crossing probability. This failure is openly recorded
in the report/artifact; no threshold was loosened. At/above .10R, pooled
probability is ≥ each component for the computed cells.

### E.3 Signal spec, overlap, DRAFT-only cleanup

`docs/CLAIM-SIGNAL-SPECIFICATIONS-v1.5.md` preserves the 24-card A5 dump,
including the then-current Dual Thrust k=0 evaluator and its unused
`priorDayBars=48` field. The six M30 bars in `london-orb-30` equal three hours,
not 30 minutes. Amendment 6 removes Dual Thrust; current specifications are in
`docs/CLAIM-SIGNAL-SPECIFICATIONS.md`.

The historical A5 276-pair audit found `dual-thrust` / `pdh-pdl-break`
Jaccard **1.000** (49,228 shared DEV bars) and `williams-r-fade` /
`stochastic-14-fade` **1.000**. The owner later approved only those two
deletions in A6; see section F for remapped priorities and recomputed artifacts.

Dual Thrust sources opened on 2026-10-28 and marked VERIFIED:
- FMZ Quant implementation tutorial: https://www.fmz.com/digest-topic/9872
  (formula and adjustable K1/K2; demonstration K1=K2=.5; not universal params).
- ProRealCode indicator description:
  https://www.prorealcode.com/prorealtime-indicators/dual-thrust-strategy-indicator/
  (formula, no one fixed N/K pair).
Both full URLs and source limitations are recorded in `docs/EMPIRICAL-EVIDENCE.md`.

The eight family criticism sources remain VERIFIED, with full citations and
URLs in `docs/EMPIRICAL-EVIDENCE.md` and the A5 report.

### E.4 Snapshot/push status

This log entry is complete. v1.0–v1.4 snapshots remain unchanged. v1.5 is
`BLUEPRINT.md` copied byte-for-byte to `docs/BLUEPRINT-v1.5.md`; its full SHA-256
is in the snapshot register and `artifacts/map-compass/blueprint-hashes.json`.
The A5 commit is pushed only to `arena/072665f9-system`; `git ls-remote` equals
local HEAD. The exact commit ID is recorded in the final handoff (kept out of
this self-contained snapshot log to avoid making the snapshot depend on its own
commit hash).


---

## F — G0 Amendment 6 (2026-11-02, before any strategy result)

**Scope and guard.** The owner approved deletion of exactly `dual-thrust`
(former priority 3) and `stochastic-14-fade` (former priority 15). No other
card, parameter, family, strength/weakness state, Map, cost, exit, frozen
threshold, verdict state, or CONFIRMED rule changed. No card was added. The 22
remaining cards retain their relative TEST_ORDER; priority numbers were
renumbered by deletion only. All cards remain DRAFT with null approver/date.
`verify-claims` remains blocked. No strategy verification, outcome calculation,
or verification/trade-result artifact was created.

**Reason/source scope.** `dual-thrust` was a k=0 prior-day high/low duplicate
of `pdh-pdl-break` (Jaccard 1.000); the opened sources did not provide
universal canonical numeric defaults. `stochastic-14-fade` duplicated
`williams-r-fade` exactly (Jaccard 1.000). No Dual-Thrust-like card remains.
The retained `pdh-pdl-break` rails use the previous EAT trading day's observed
high and low, not that day's open.

**Overlap.** The 22-card universe has 231 total pairs, 45 fewer than A5; four
within-family pairs involving the deleted cards leave the family calculations.
Channel-breakout retains Donchian20/55 Jaccard 0.506796; osc-fade retains
RSI/Williams Jaccard 0.115649. Per-family before/after Jaccards and Kish nEff
are in `docs/G0-AMENDMENT-6-REPORT.md` and
`artifacts/map-compass/measured-overlap.json`.

**Slots/capacity.** The pre-registered claim model has exactly one slot per
card (22 total), one position at a time, either side; opposite sides cannot
coexist in a card. The combined Compass/validation book has one global slot,
also either side, with same-bar ties resolved by the lowest renumbered
priority. “Eligible same-bar candidates 74,886” means unique candidate bars
after same-bar priority resolution and before dropping arrivals during an
occupied slot. The book holds 6,903 modeled entries; at mean baseline-sampled
hold 17.89671157 bars this is approximately 123,541 bar-equivalents, 8,381
under 131,922 DEV bars. This is capacity arithmetic only, not strategy
evidence.

**Signals/power.** Per-card DEV-calendar-day counts, five busiest/quietest days,
all 22 exact pseudocodes and the final study/practitioner-only registry are in
`docs/G0-AMENDMENT-6-REPORT.md` and
`docs/CLAIM-SIGNAL-SPECIFICATIONS.md`. Report-only power is recalculated for
all 16 family × verdict-state cells at net edges 0, .05, .10, .15, .20, and
.30R using measured Kish overlap and calendar-day CR1. All cells exceed .5 at
+.20R; none is THIN-POWER, and the minimum is 0.7571 (level-retest ×
EFFICIENT). Veto failure shares and analytic net-gate cross-checks are recorded
for every cell. The pooled-power comparison is constrained to edges ≥ +.10R;
below +.10R pooled power may be less than a component cell. This is a report
interpretation only; no threshold changed.

**Preservation.** `docs/BLUEPRINT-v1.0.md` through `docs/BLUEPRINT-v1.5.md`
remain byte-preserved. The v1.6 snapshot
`docs/BLUEPRINT-v1.6.md` has SHA-256
`4ba3e529dfc0a60c1881f9c9331790de9e3680dec0b8bbe69145b631d2b7b16d`; the
register is `artifacts/map-compass/blueprint-hashes.json`. This v1.6 update was
logged before any strategy result.

---

## G — G0 Amendment 7 (2026-11-02, before any strategy result)

**Scope/guard.** The owner-authorized changes are DRAFT signal-definition corrections only: clock-based session ranges for `asian-range-break` and `london-orb-30`, prior-close PP for `classic-pivot`, and textbook soldiers/crows direction. The 22-card registry stays DRAFT; `verify-claims` remains blocked and was not run. Map, costs, exits, frozen numerical thresholds, claim states, and CONFIRMED rule are unchanged. No strategy outcome or trade-result artifact was created.

**Session-range corrections.** `asian-range-break` now uses all observed bars in the EAT Asian clock window 01:00–10:59, rather than requiring 20. `london-orb-30` now uses [11:00,11:30) EAT as its range, with entry eligible from 11:30. The old Asian zero-signal cause was a fixed 20-bar guard against a session averaging only about 16–18 observed bars/day; the pre-2011 DEV maximum was 18. New signals and valid-range coverage are in `artifacts/map-compass/amendment7/signal-yearly.json`.

**Pivot and candlestick direction.** The exact pre-fix pivot expression `const pp = (prev.hi + prev.lo + prev.open) / 3;` is replaced by `const pp = (prev.hi + prev.lo + prev.close) / 3;`, supported by the opened TradeAlgo floor-pivot guide (full URL in the report). `three-soldiers-crows` now maps soldiers LONG and crows SHORT; its CHOPPY strength / EFFICIENT weakness states remain unchanged. The ThinkMarkets pattern-definition URL was opened this run and marked VERIFIED in the report. Pivot signals: 6,532→6,443 (−89); soldiers/crows total 2,168→2,168 with long 1,039→1,129 and short 1,129→1,039.

**Yearly signals and sources.** The report prints all 22 cards' per-DEV-year signal counts, per-year first/last dates, zero-signal flags, card-level unique signal-day shares and valid-range-day shares for the two range cards. It includes each source timeframe and VERIFIED/UNVERIFIED-this-run status plus full URLs, with explicit source mismatch caveats. Each DRAFT strength/weakness label includes “tested on M30 gold; the source used <timeframe>.” These are design/source disclosures, not strategy findings.

**Matched control.** The legacy fine-cell baseline mean table contains all 36 verdict-state×side×session×volatility cells; 3/36 legacy means and 1/36 year-matched equal-year means are positive. Thus the unchanged control gate can affect a claim that clears the absolute +0.10R net floor, although no claim verdict was run. A fixed-seed report-only year-matched baseline has 100 random entries in every one of 432 cell-years; exact fine cell is used when its year pool has at least 100 eligible bars, otherwise the lookup falls back to side×verdict-state×year. Baseline sampling SEs and random-control calibration deltas with both-control SEs are printed. No strategy excess/t can be calculated without strategy outcomes, so none was generated.

The verification diagnostic now tags `DRIFT_DEPENDENT` when year-matched excess t≤2, including baseline sampling error. This does not alter CONFIRMED. Compass refuses to enable such a claim absent an independent VAL record that passes frozen gates and has year-matched excess t>2.

**Hold duration and slot capacity.** A4 v1.4 prose (mean 37.9, median 33, p90 77, max 96) conflicts with the A4 committed baseline artifact, which already reports mean 17.532, median 10, p90 40, max 96. A5's only related code change replaces the pseudo-day cluster key with the actual EAT day; it does not change hold duration or the exit harness. A6's combined-book sampled hold mean is 17.89671157. A7 reruns the report-only one-slot model with the corrected signals: 6,925 kept positions × 17.89660650 = 123,934 occupied bar-equivalents vs 131,922 DEV bars, leaving 7,988; not over capacity. Full hold histogram bins and method are in the A7 report.

**Data and tests.** M1 and Map completed. Raw source pins: 76/76 Git blob SHA-1 matches; normalized outputs: 3/3 SHA-256 matches their data manifest. Map-validation remains deterministic/PASS, zero coverage problems. Focused A7 tests: 6/6 pass; the A6 regression group: 8/8 pass. Full suite: **399 passed, 1 failed**; its sole failure is the unchanged `synth UI` test expecting 28/32 D1 checks while the unchanged `src/pages/MapGenerator.tsx` correctly displays its recorded 26/32 result and the six failed hours. The test and UI files are unchanged from the base commit; this mismatch is unrelated to A7. No strategy verification was run.

**Thresholds changed?** No. **Map/cost/exit changed?** No. **Cards frozen?** No. A7 report and pseudocode: `docs/G0-AMENDMENT-7-REPORT.md`; `docs/CLAIM-SIGNAL-SPECIFICATIONS.md`.


## H — G0 Amendment 8 (2026-11-05, before any strategy result)

**Owner approval.** Darrel approved all 22 extant cards unchanged on
2026-11-05: `approvedBy="Darrel"`, `approvedAt="2026-11-05"`,
`status="FROZEN"`. No card was removed or edited; card text, states, parameters,
priorities and order remain unchanged. No real strategy result existed.

**v1.8 preservation.** `docs/BLUEPRINT-v1.8.md` is byte-identical to
`BLUEPRINT.md`; its full SHA-256 is `b878aa2747677a8e3324ba32ea74142edfbca86df892bad83dd3fec037292ff4` (recorded in the version
register and `artifacts/map-compass/blueprint-hashes.json`). v1.0–v1.7 remain
preserved. The prior v1.7 hash entry in earlier reports is corrected here to
the hash of the preserved snapshot: `045b345320fc0a691e9af1cea8fcc0fd140bb7c04204647172f8ac5b0df13281`.

**Method 1 — DEV-only segments.** Non-DEV gaps split the data into four
inclusive segments: 2004–2007, 2009–2011, 2013–2015, and 2017–2018. Recompute
the unchanged Map rules per segment using only that segment's bars; signal
indicators and warm-up also use that segment only. A claim or random-baseline
entry is eligible only at local index ≥1,000 and with at least 96 bars after
the entry inside the same segment. The entry year determines trade year. Each
card has an independent unconditional one-slot book: all otherwise eligible
signals may enter regardless of state; outcomes are reported by the verdict
state at entry. Rebuild the matched random-entry control with the same
segment boundaries, entry eligibility, frozen costs and exits. No Map feature,
signal warm-up, baseline entry, or exit may read across a segment boundary. Old
baseline, power and signal-count artifacts are retained as history and marked
superseded for the A8 verification.

**Method 2 — matched sweep.** ER grid `{0.25,0.30,0.35,0.40,0.45}` × ATR
percentile grid `{60,65,70,75,80}` (25 cells). Re-bin card trades and the same
common random-entry candidates, using deterministic seeds, under each pair;
apply the unchanged CONFIRMED rule against the pair-matched baseline. Missing
baseline means not CONFIRMED and never zero. The center (0.35,70) remains the
authoritative verdict. Only a claim CONFIRMED at the center receives a
sensitivity grade: share of 25 grid cells CONFIRMED; ROBUST ≥80%, FRAGILE ≥50%,
otherwise DEFINITION_SENSITIVE. Other claims' sweep cells are informational.
Verdict cells use the efficiency axis only; the volatility cutoff acts through
the abstain band and 3-bar confirmation/hysteresis, not as another verdict
axis. No threshold or CONFIRMED criterion changed.

**Staged gates.** Stage 2 builds the producer, segmented Map/signals/control,
sweep and unit tests (gap-free Map equivalence after warm-up; hole sentinel
never read; hand-computed long/short, stop, target, time exit, gap-through, and
slot-blocking cases; causality). Stage 2 prints segment/year bar counts,
warm-up/tail losses, old-vs-segment Map agreement (report only), and identifies
spread months in sealed years (cost-only). Stage 3 is a 60-world synthetic
rehearsal with the exact preregistered three conditions and pass criteria; any
failure blocks Stage 4. Stage 4 is one real DEV-only run, with no VAL, HOLDOUT,
or STRESS outcomes; no rerun or post-result changes to cards, rules, states, or
thresholds.

**Threshold changed?** No. **Map/cost/exit changed?** No. **Any result existed?**
No.

---

## I — G0 Amendment 8B (2026-11-06, before any real DEV result)

A new v1.9 snapshot, `docs/BLUEPRINT-v1.9.md`, preserves all v1.0–v1.8
versions. Its full SHA-256 is
`c91ee38c6c56355360fe3def3723b6de81cf9675814c76be4176a2be9375f74a`.
Before this stage, `BLUEPRINT.md` was SHA-256
`b878aa2747677a8e3324ba32ea74142edfbca86df892bad83dd3fec037292ff4`; it is
now byte-identical to v1.9. `scripts/map-compass/frozen.mjs` was
`41403386254a20d1261e5adc77fc674067a70823c642a06b373c9d95e7b67389` before
the additive segment/grid definitions and is now
`67f1c1eda386769fc262853856156bfdd74b3f05f50700a9aedb148e33840a22`.
The frozen-file diff has 38 added lines and zero removed lines; its only new
values are the four DEV spans, 1,000-bar segment warm-up, 96-bar tail, and the
25-cell sweep grid. A module-load assertion checks equality with existing
MAP/exit/DEV-role values and presence of the frozen center.

The Stage 3a synthetic-only rehearsal failed the original no-edge criteria
(mean strategy-level confirmed cards/world 0.700 in A and B, maximum 4) and
showed that Donchian-20 was not an isolated planting choice: signal-only review
reports 7.9% exclusive signals and overlapping cards can inherit a planted
edge. The cause of the no-edge failures remains unknown pending diagnosis.
This correction does not alter Map rules, costs, exits, frozen thresholds, the
22 cards/signals/states/order, or the CONFIRMED rule. It pre-registers the
owner-authorized replacement criterion only for A/B (mean ≤
`max(0.5,1.5×λ)`; maximum bounded by the Poisson(λ) upper-tail <0.001 integer,
not below 2) and the signal-exclusive C design, with original Donchian-20
retained as report-only C-D. All details and the requirement for Part 1
calculation before Part 4 are in v1.9 and `docs/G0-AMENDMENT-8-REPORT.md`.
No real DEV result exists; Stage 4 remains separately unauthorized.


---

## J — G0 Amendment 8C (2026-11-06) · Part 1b no-edge diagnosis; proposal pending owner approval

**What:** a report-only reanalysis of the synthetic no-edge anomaly. It finds
that the weakness half’s null signed net is `+cost`, which exceeds the +0.10R
net floor in all 220 A weakness cell-world observations (cost range
0.119951R–0.194167R), while strength null signed net is `−cost`. Mean net-gate
probabilities are 0.578189 for weakness and 0.001129 for strength; the
one-sided excess-gate probability is 0.0227501. Pooled CR1/plain SE inflation
is 1.001752, with no evidence of material clustering understatement. The A
condition has 44 strategy-level card-half tests/world (22×2), distinct from
the 16 official family×verdict-state rows/world. Its mean 0.700 and max 4 are
a rare Poisson multiple-cell tail under `λ=0.281701` (P(total≥7)=0.025110;
P(max≥4)=0.002095; joint tail≈0.001004), not an identified generator or
verifier defect. The previous causal classification (ii) is withdrawn: the B
calibration observation cannot explain the seven A confirmations because A has
no drift parameter. Full tables and the explicit candidate-set, warm-up,
state-label, sign, and CR1 checks are in
`docs/G0-AMENDMENT-8B-PART1B.md`.

**Exact criterion proposed (not effective):** on ten no-edge worlds, count
unique strategy-level confirmed card IDs. Compare mean with
`max(0.5,1.5×λ)=0.500`; cap maximum at the smallest `k≥2` for which
`P(Poisson(λ)>k)<0.001`. At `λ=0.2817011047`, `P(X>2)=0.003021` and
`P(X>3)=0.000210`, so proposed `k=3`. This proposal is **pending owner
approval**; the existing `mean≤0.5, max≤2` criterion is unchanged and has not
been replaced or applied. No bar, generator, threshold, or production code was
changed. No Stage 3 rerun, Part 4, or Stage 4 is authorized by this entry.

**Data scope:** this Part 1b used only synthetic A/B diagnostics; no market bar
or sealed-year outcome entered the computation. The frozen DEV-year inclusion
filter is the exact twelve years in `ROLES.DEV`: 2004–2007, 2009–2011,
2013–2015, 2017–2018, with four separate segments and no cross-gap state or
trade computation. The non-reading preflight `npm run mc:a8-audit` failed
exactly because `artifacts/map-compass/normalized/xauusd-m30-eat.csv` is absent.
Per the task-specific instruction, `mc:m1` and `mc:map` were not run.
**Threshold changed?** No; proposal only. **Map/cost/exit changed?** No.
**Owner approved?** Pending.

---

## K — 2026-11-07 · Pre-Stage-4 conditional routing correction

**Scope and reason (a), replacing the prior risk-acceptance wording:** Weakness claims cannot ADD an enabled (card, state) pair. The single path by which a weakness confirmation could REMOVE one — unconditional promotion of any DEFINITION_SENSITIVE ledger record, including weakness and VAL-window records, into conditionalIds — was found by the verifier by code inspection and reproduction, and was fixed and regression-tested before any real result. Cause: build-compass.mjs built conditionalIds without a kind or window filter.

The builder now derives `conditionalIds` only from strength records in the same DEV-selection window as verdicts. A missing/absent `windowKind` follows the existing verdict loop's convention and is treated as DEV. The verdict map selection and ignored-record behavior are unchanged. The helper used by the tests is importable without running the builder CLI; direct script invocation remains guarded. No other routing logic, threshold, criterion, card, cost, or exit changed. Other risk-acceptance reasons (b)–(e) were not edited.

**Regression evidence.** The new routing tests exercise the builder's real selector and routing table for: a DEFINITION_SENSITIVE weakness alongside a CONFIRMED strength; a VAL-window conditional record alongside a DEV strength; a strength's own DEFINITION_SENSITIVE grade and `conditional === true`; weakness-only confirmation; and the state/key invariant over all 22 cards. Result: all 22 cards have complementary states and the 44 `${claimId}|${state}` verdict keys are unique. `validateClaimCards()` already asserts complementarity and existing tests call it; the direct test is retained because it proves the map-key collision property explicitly.

**Known open, intentionally deferred.** The weakness hard-block branch in `lib/compass.mjs` remains unchanged and is dead code under the current strength-only insertion path. A CONFIRMED strength plus CONFIRMED weakness enables the strength state with decision `ENABLED`; the blueprint claim that a CONFIRMED weakness blocks the card in the other state is not implemented. Record this as a design question for the routing stage. Do not remove or modify the branch in this cycle.

**Integrity and limits.** `frozen.mjs` SHA-256 remains `67f1c1eda386769fc262853856156bfdd74b3f05f50700a9aedb148e33840a22`; `criteriaHash` remains `788e01dff4bba7455058fdcdf7fecb31dfb8f4c5215702a0e8bf50e0ef98b5e6`. The 8C Stage 3 failure remains final; there was no Stage 3 rerun, new rehearsal, retuning, or Stage 4 run. This correction is recorded before Stage 4 and does not authorize it.

**Verification result (2026-11-07):** `npm ci` succeeded. The one full `npm test` run completed with **416 passed, 5 failed** (94.9 seconds). All five failures were anticipated: the synth D1 UI string assertion at `tests/synth.test.mjs:694`; three data-contract tests blocked by missing `artifacts/map-compass/raw/fetch-manifest.json` and `artifacts/map-compass/normalized/xauusd-m30-eat.csv`; and the pre-existing A6 v1.10 snapshot hash mismatch (expected `3f1613e12b2e53b69aa360c0cc81490b59a6c2dc59b21273bd4cba7f3e87c5e2`, actual `decd0ae949288750c78a7939c67fb8c61003bcde356d270d93a1a17cca59d63c`). The five new routing tests passed. None of the failures was changed in this cycle.

---

## L — 2026-11-08 · Stage 4 orchestrator authorization, before code

**Owner authorization (dated 2026-11-08, recorded before any orchestrator code exists):** The Stage 4 orchestrator is authorized as a deliberate pre-registered component and is the **only new machinery permitted**. It consists of exactly one new driver script plus its tests. It may only wire the existing DEV segment builder, card signals, one-slot trade producer with the frozen exit harness, segmented random control, 25-cell sweep, `verifyReal` with `a8DevOnly=true`, and report generation. It must not change `scripts/map-compass/frozen.mjs`, `verifyReal`, `lib/verification.mjs`, `lib/signals.mjs`, `lib/compass.mjs`, or any threshold, card, cost, or exit rule. The authorization is prospective: this record and `docs/STAGE-4-ORCHESTRATOR-SPEC.md` precede all orchestrator code. This Step 1 record does not run Stage 4 or authorize any additional machinery.

**Implementation boundary:** Document-only in this amendment. No JavaScript, script, npm command, or test has been added or modified. The exact call contract, input and report definitions, fail-closed checks, and unresolved questions are specified in `docs/STAGE-4-ORCHESTRATOR-SPEC.md`.
