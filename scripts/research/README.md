# Research tooling

One-shot research scripts that produced the v1.8 filter decision. They are **not** part
of the certified test suite (`tests/` holds that) and they assert nothing about the
golden lock unless stated; they print numbers and (where noted) write JSON into
`artifacts/strategy-research/`. Read `artifacts/strategy-research/filter-research-report.md`
for what they found, and `logs/v1.8-changes.md` for what shipped.

Run everything from the repository root with the test loader, because the scripts import
the analyzer's TypeScript sources directly:

```bash
node --experimental-strip-types --import ./tests/register.mjs scripts/research/<script>.mjs
```

| Script                          | What it does                                                                                                                                                                                                                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify-filter-defaults.mjs`    | The locked baseline under every filter configuration (C+F, C only, F only, none) with filter-fail counts, the shipped-vs-C-only delta, the first Filter F rejection, the `enableFilterF: false` opt-out lock against the v1.4 totals, and the same comparison under the UI/live options (`seriesEndsComplete: false`). |
| `audit-filter-f.mjs`            | Filter F soundness (no FILTER_F row violates the rule, re-derived from raw OHLC) and completeness (every bare-book candidate that satisfies the rule is rejected — by F or earlier), plus removal composition by strategy/session/side and the opt-out lock.                                                           |
| `search-filter-candidates.mjs`  | Broad search: every pair/triple of context atoms (n ≥ 120) as a rejection rule, with significance, fold/half recurrence, stress and breadth gates. Writes `filter-candidate-search.json`.                                                                                                                              |
| `control-filter-candidates.mjs` | Multiplicity control: outcome-shuffle placebo over the same rule space (`SHUFFLES`, default 60) and chronological discovery → validation in both directions. Writes `filter-multiplicity-control.json`.                                                                                                                |
| `report-filter-families.mjs`    | Finalist families against the A2-only book: standalone strength, recurrence, breadth, incremental value over the shipped Filter C, and the resulting book when a family is added on top of C.                                                                                                                          |

| `audit-filter-f-robustness.mjs` | Frozen-rule robustness audit of the shipped Filter F: per month (with a warm-up prefix), per strategy, per side, per session — engine-level ΔR = R(F on) − R(F off). Not a search; no thresholds, no candidates. |
| `validate-on-new-data.mjs` | **The only sanctioned way to add evidence about a shipped rule.** Evaluates the shipped rules (no knobs) on data outside the discovery window; refuses the baseline, overlapping windows and windows below 1,000 bars; applies the pre-registered criteria from `FORWARD-VALIDATION.md`; appends to `artifacts/validation/ledger.jsonl`. |

## Discovery tools are gated

`search-filter-candidates.mjs`, `control-filter-candidates.mjs` and
`report-filter-families.mjs` mine the **same locked series** the shipped rules were
selected on, so anything they report is a hypothesis, never evidence. They refuse to run
without an explicit acknowledgement:

```bash
ALLOW_DISCOVERY_SEARCH=yes node --experimental-strip-types --import ./tests/register.mjs scripts/research/<script>.mjs
```

To evaluate a **shipped** rule on data it has not seen, use `validate-on-new-data.mjs` and
the protocol in `FORWARD-VALIDATION.md` instead.

## Conventions and traps

- **Pin the filter flags.** `enableFilterF` defaults to `true` since v1.8, so a
  "Filter C off" run written as `{ enableFilterC: false }` is silently the _C-off + F-on_
  book. Every baseline here passes `enableFilterC: false, enableFilterF: false`
  explicitly.
- **Batch features are not engine features.** The batch table stores
  `bodyPct`/`upperWickPct`/`lowerWickPct` as fractions (0–1) while the CSV columns are
  percent strings (`"36.3%"`), its `emaStackConflict` flag is stricter than a plain
  EMA20/50/200 ordering check, and its stored EMAs differ from locally recomputed EMAs on
  a minority of rows. Prefer engine values when implementing; prefer the batch columns
  when mining the batch.
- **Offline gains overstate shipped value.** A filter that removes trades frees slots
  that later bars then fill; only engine-level deltas (`runAnalysis` with the flag on and
  off) count for a default-on decision. See §2 of the research report for the worked
  example (offline +16.0 R, engine −3.63 R).
- Research family labels (`B_fadeStrongBar`, `D_conflict_nearPDL`, `E2_ny_weakRange_ct`,
  `F_london_weak`, …) are labels of searched candidates, **not** production filter names.
