# BLUEPRINT — dated amendment log since v1.0

**Rule:** `BLUEPRINT.md` is the canonical pre-registration. Every change to it
is recorded here with a date, a reason, and an explicit statement of whether a
threshold changed. Older versions are preserved byte-for-byte in this folder
and are never edited. A superseded decision is struck by a **later dated
entry**, not by deleting the old text.

**One invariant dominates this log:** *no amendment has been made after a real
strategy result, because there has never been one.* All dates below precede M6.
Claim cards are still `DRAFT`; `verify-claims.mjs` refuses real verification.

---

## Version / snapshot register

| Version | Date | File | SHA-256 | Status |
| --- | --- | --- | --- | --- |
| **v1.0** | 2026-10-26 | `docs/BLUEPRINT-v1.0.md` | `420a420851f5a666da3db70aaf46b1206c43e9b46159ee8d7c40c86df2da` | superseded by v1.1; **preserved** |
| **v1.1** | 2026-10-26 | `docs/BLUEPRINT-v1.1.md` | `72c078f335fb77b1a1260a49e39cbc856afda6ce9ac5635fd5ad345dcb7dd480` | superseded by v1.2; **preserved** |
| **v1.2** | 2026-10-27 | `docs/BLUEPRINT-v1.2.md` | `cf3c94b1f505dc31828ce740dceb0e7989a606f62cf28c8d48cf91713917d543` | current; `BLUEPRINT.md` |

- v1.1's snapshot is the **original committed file** (hash verified by a test).
- v1.0's original git blob was lost when the workspace was re-cloned from
  `main`. The preserved copy was reconstructed from the exact v1.0 text as
  authored (596 lines / 28,232 bytes). Byte-for-byte identity with the lost
  blob cannot be certified; this is declared as a limitation in v1.2 §15.19.
  Every v1.1→v1.2 edit is enumerated below, so the chain is auditable from
  v1.1 onward.
- v1.2's hash is recorded at the bottom of this file and in the commit that
  introduces it.

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

## B — Cumulative answer to "did a threshold change?"

| Constant | v1.0 | v1.2 | Changed? |
| --- | --- | --- | --- |
| `MAP.erCutoff` | 0.35 | 0.35 | no |
| `MAP.atrPctileCutoff` | 70 | 70 | no |
| `MAP.hysteresisBars` | 3 | 3 | no |
| `MAP.warmupBars` | 1000 | 1000 | no |
| `EXIT_HARNESS.stopAtrMultiple` | 1.5 | 1.5 | no |
| `EXIT_HARNESS.targetR` | 2 | 2 | no |
| `EXIT_HARNESS.maxHoldBars` | — (96 only in `RANDOM_BASELINE`) | **96, global** | added (A3.6); no existing value changed |
| `COST.slippage.atrFractionPerSide` | 0.02 | 0.02 | no |
| `CLAIM_CRITERIA.practicalFloorR` | 0.10 | 0.10 | numeric value no; **meaning** changed to "excess" at A2.3 |
| `CLAIM_CRITERIA.tStatMin` | 2 | 2 | numeric value no; **estimator** changed to cluster-robust at A3.3 |
| `CLAIM_CRITERIA.minTradesPerCell` | 100 | 100 | no |
| `CLAIM_CRITERIA.concentrationMax` | 0.50 | 0.50 | no |
| `CLAIM_CRITERIA.loyoPositiveMin` | 0.75 | 0.75 | no |
| `ROLES` | 12/4/5/2 | 12/4/5/2 | no |
| Claim card count / priorities / TEST_ORDER | 24 / 1–24 | 24 / 1–24 | no |

The two rows that are not a plain "no" are both **stricter** tests chosen
before results, not relaxations. That distinction is the whole point of this
log.

---

## C — Still open (unchanged by Amendment 2)

1. **Review and freeze the 24 claim cards** (decision #13). `docs/CLAIM-CARDS-FULL-TEXT.md` is the review dump. Change any state assignment or strategy NOW — after results exist, changing a claim is laundering.
2. **Resolve the underpowered EXPANSION/GRIND issue** (§7.5). Permitted: accept fewer survivors, start a NEW cycle with a different DEV/HOLDOUT allocation, or pre-register more pooling. Forbidden: lower the +0.10R floor, soften `t > 2`, re-fit costs, edit thresholds after results.

---

## D — v1.2 snapshot hash

`cf3c94b1f505dc31828ce740dceb0e7989a606f62cf28c8d48cf91713917d543`

`docs/BLUEPRINT-v1.2.md` is a byte copy of `BLUEPRINT.md` at v1.2;
`sha256sum` of both files is identical.
