# G0 Amendment 8 report — owner freeze and pre-registration

**Decision date:** 2026-11-05  
**Frozen at:** `9aae04e67b1102d1802c4dd0b92f47af19d81fe6`  
**Blueprint:** v1.8, SHA-256 `b878aa2747677a8e3324ba32ea74142edfbca86df892bad83dd3fec037292ff4`  
**Cards:** 22, approved unchanged by Darrel (`approvedBy="Darrel"`, `approvedAt="2026-11-05"`).

## What commit 9aae04e froze

The commit records owner approval of the existing 22 cards without deleting or editing card text, signals, states, parameters, priorities, or test order. It pins BLUEPRINT v1.8 and preserves all earlier blueprint snapshots. It describes the cards as frozen and real verification as still blocked pending the staged work.

The following existing values were explicitly left unchanged: Map definitions and thresholds; costs; the one standard exit harness; frozen claim thresholds; the two verdict states; all 22 card definitions and ordering; and the CONFIRMED conjunction.

## Preregistered Method 1: strict DEV segments

DEV years are split at each non-DEV gap into inclusive spans **2004–2007, 2009–2011, 2013–2015, and 2017–2018**. Map features/states, signal calculations, and warm-up are recomputed within each segment using only its bars. A claim or common-random entry is eligible at local index **≥1,000**, with **96 subsequent bars remaining inside that same segment**. Entry year is trade year. No feature, warm-up, signal, random entry, or trade outcome may read across a segment boundary.

Each card has its own unconditional one-position slot: all eligible signals can enter irrespective of Map state; a signal arriving while that card is occupied is dropped, not queued. Outcomes are binned by the entry verdict state. The random-entry control is rebuilt using the same DEV segments and eligibility, deterministic common candidates, and unchanged costs/exits. Old continuous-era baseline, power, and signal-count outputs are history only.

## Preregistered Method 2: matched 25-cell sweep

The sweep is ER `{0.25, 0.30, 0.35, 0.40, 0.45}` × ATR-percentile `{60, 65, 70, 75, 80}`. Card trades and common deterministic-random entries are rebinned for every cell, and the unchanged CONFIRMED rule is applied against the matched baseline for that cell. Missing baseline is fail-closed and is never replaced by zero.

Only claims CONFIRMED at the frozen center (ER `0.35`, ATR percentile `70`) receive a sensitivity grade: ROBUST at ≥80% of the 25 cells, FRAGILE at ≥50%, otherwise DEFINITION_SENSITIVE. The grade does not nullify the center verdict. Verdict cells use the efficiency axis only; volatility affects them through the abstain band and three-bar confirmation/hysteresis, not as a second verdict axis.

## Staged authorization

Stage 1 records the card freeze and these pre-registrations. Stage 2 implements the segment producer and sweep, tests boundaries/causality/trade accounting, and prints segment and cost-data audits without strategy outcomes. Stage 3 is synthetic only; it must satisfy each preregistered criterion before real verification can be attempted. Stage 4 is a one-time DEV-only run, with no VAL/HOLDOUT/STRESS outcomes and no post-result changes or reruns.

The Stage 1 commit itself contains the owner approval, frozen card text/specification, v1.8 blueprint and hash record, and dated amendment-log entry. The implementation and audit of the staged pipeline are separately recorded in Stage 2 commit `c7879aef39fce647e4dccfa34cf691e3f466ddb8`.

**At the time of the 2026-11-05 freeze, no strategy result existed.** The later synthetic-only rehearsal is documented separately in `docs/G0-AMENDMENT-8-DRESS-REHEARSAL.md`; it is not real DEV evidence.

## Stage 2 change audit (diff from 9aae04e through c7879ae)

The following is a source diff review, not a claim-outcome analysis:

| File | Stage 2 change | Finding about frozen semantics |
|---|---|---|
| `scripts/map-compass/lib/verification.mjs` | Extracted sensitivity grading to `applySensitivityGrade`; changed the default sweep input from an assumed 100% to `null`/NOT_RUN; added report-only by-year net and leave-one-year-out diagnostics. | No change to net/excess gate, `NO_BASELINE`, minimum n, concentration, LOYO veto, direction handling, or numeric thresholds. The only existing-rule-adjacent change is that unmeasured sensitivity is now correctly `NOT_RUN`, not falsely ROBUST. |
| `scripts/map-compass/lib/signals.mjs` | Replaced a global cache keyed by parameter and array length with a `WeakMap` scoped to the actual bars-array identity. | Diff touches only ATR cache ownership/keying and its comment; signal evaluators and parameters are unchanged. This prevents different segments/worlds of equal length reusing another array's ATR values. |
| `scripts/map-compass/lib/placebo.mjs` | Circularly shifted state labels now update the derived verdict-state label with the shifted four-state label. | Changes placebo label consistency only; no claim, signal, cost, exit, or verdict rule. |
| `scripts/map-compass/verify-claims.mjs` | `runBattery` accepts measured sensitivity by card; strategy-level diagnostics retain full report fields. `verifyReal` now requires the one-time A8 path, segmented baseline and measured sweep, and rejects non-DEV/boundary-invalid streams. | Verdict rule code remains delegated to unchanged `verifyClaim`; the added real-run checks are stricter scope/safety gates, not relaxed thresholds. The old general verifier path is deliberately closed. |
| `scripts/map-compass/print-claim-cards.mjs` | Generated full-text card documentation now prints Darrel's freeze metadata and no longer presents blank review fields. | Documentation reflects the unchanged owner-approved 22-card freeze; no card or signal definition was changed. |

**Independent checks.** I compared `git diff --unified=0 9aae04e c7879ae` for all five files. In `lib/verification.mjs`, added code is sensitivity labeling and diagnostic outputs; the only changed default is `sensitivityAgreementPct: 100` → `null`; the removed branch is the old inline sensitivity-grade calculation. No changed line modifies the CONFIRMED conjunction, `NO_BASELINE` fail-closed behavior, gate thresholds, or veto criteria. In `verify-claims.mjs`, the `verifyReal` entry path is narrowed to A8 and adds DEV/segment guards, while statistical gate semantics remain in `verifyClaim`.

For `lib/signals.mjs`, the zero-context diff shows only cache implementation/comment changes; evaluator bodies, signal parameters, card registry and signal specifications have no changed lines in this Stage 2 diff. Stage 2 tests also compare card parameters/state order against frozen specifications and assert causal entry-only emissions. This confirms the signal definitions did not change in these files; it is not a blanket claim about unrelated historical amendments.

The existing `artifacts/map-compass/power-projection.json` `reportOnly.criteriaHash` was independently read and equals the requested `788e01dff4bba7455058fdcdf7fecb31dfb8f4c5215702a0e8bf50e0ef98b5e6`.

## Freeze-test review and Stage 4 absence guard

The instruction describes ten tests that still assert DRAFT. In the actual `9aae04e` → `c7879ae` diff, the repository contains **seven test cases** with old current-card DRAFT assertions; all seven already read FROZEN on this branch. There are no ten remaining DRAFT-status assertions to edit. One remaining assertion, `amendment5.test.mjs` checking that the historical v1.5 text says “all 24 DRAFT cards,” is a historical-document assertion and intentionally remains. The old → current assertions are:

| Test case (file) | Old assertion in 9aae04e | Current assertion on this branch |
|---|---|---|
| Amendment 2 full-text card dump | document contains `DRAFT` | document contains `FROZEN` and `approvedAt: 2026-11-05` |
| Amendment 2 freeze guard | `FREEZE.status === DRAFT`, `approvedBy === null` | `FROZEN`, `Darrel`, `2026-11-05` |
| A3 historical guard | `DRAFT`, null owner, no verification file | `FROZEN`, Darrel/date, Stage 4 output guard |
| A4 signal-library contract | `FREEZE.status === DRAFT` | FROZEN with Darrel/date |
| A4 verifier guard | DRAFT/null owner/no result/no trades | FROZEN with Darrel/date and Stage 4 output guard |
| A5 calendar baseline test | DRAFT/null owner/null date/no result pair | FROZEN with Darrel/date and Stage 4 output guard |
| A6 sequence/history test | DRAFT/null owner/null date | FROZEN with Darrel/date |
| A6 report/history test | both real-output files absent | Stage 4 output guard; v1.8 historical hash check |
| Compass freeze test | DRAFT must throw; sample human approval passes | frozen Darrel approval passes |
| A8B guard added in this stage | no test existed for a failed Stage 3 rehearsal | now requires failed rehearsal recorded and both Stage 4 files absent |

The first nine rows group old assertion sites into their containing tests; there are seven actual current-card freeze test cases plus the A6 output-absence case within its separate test. The requested “ten” is not supported by repository grep/diff; no absent test was invented. `assertA8OutputState` now specifically fails if either `claim-verification.json` or `claimed-trades.jsonl` exists before separate Stage 4 authorization.
