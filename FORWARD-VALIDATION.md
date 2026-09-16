# Forward validation

How a rule that is already shipped gets judged on data it has never seen.

The point of this document is to make one behaviour impossible: **using future data to
re-decide a rule, then re-evaluating on the same future data until it looks good.** Once a
window has been examined, its evidentiary value for that rule is spent. Everything below
exists to keep that line honest.

Background: `AUDIT-V1.8-LIVE-FIDELITY.md`. Scope note: this protocol governs _evidence
about shipped rules_. It is not a licence to search for new rules — the project's
objective is a faithful live analyzer, not a maximised backtest (see §1).

---

## 1. What counts as evidence

| Evidence                                                                                                             | Weight                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine-level result (`runAnalysis` with the shipped defaults) on a window that does not overlap the discovery window | **Primary.** This is the only thing that can change a default.                                                                                                                                                                                        |
| Engine-level result on the discovery window                                                                          | Recurrence only. Cannot promote, cannot settle.                                                                                                                                                                                                       |
| Drop-model / offline estimate (removing trades and summing their R)                                                  | Hypothesis generation only. It overstates value because freed slots get refilled (worked example: offline +16.0 R became −3.63 R in the engine).                                                                                                      |
| A rule that "passed" a search over many candidates                                                                   | Hypothesis. Search-space multiplicity is controlled but never eliminated; see `artifacts/strategy-research/filter-multiplicity-control.json` (a 40-shuffle placebo of the same search produces ~6 passing rules per shuffle, best fake gain +40.9 R). |
| Live-analysis fidelity tests (config parity, opt-out hash, warm-up floor, trend-input causality)                     | **Gating.** A rule that breaks any of these is rejected regardless of its historical R.                                                                                                                                                               |

## 2. The cycle

1. **Freeze.** A shipped rule is identified by the hashes of its sources
   (`scripts/research/validate-on-new-data.mjs` records `regime-filters.ts`, `run.ts` and
   the git HEAD). Changing the rule starts a _new_ hypothesis, with its own evaluation
   window; the old evidence does not carry over.
2. **Accumulate.** Fetch new data with the production generator, strictly after the
   discovery window ends (2026-08-20 for the v1.8 baseline) and at least the measured
   warm-up floor of 1,000 bars.
3. **Evaluate once.** Run the evaluator on the new file. It applies the criteria in §3
   mechanically and appends the result to `artifacts/validation/ledger.jsonl`.
4. **Decide.** Apply §4. If the verdict is FAILS, the decision is to change or remove the
   rule — _not_ to tune it against the window that just failed it.
5. **Record.** Every decision goes into a `logs/vX.Y-changes.md` entry quoting the ledger
   record (data hash, verdict, deltas).

## 3. Pre-registered criteria

Registered here, before any evaluation data exists, so the verdict cannot be chosen after
seeing the numbers. A rule **HOLDS** when all three pass, and **FAILS** otherwise:

| Criterion | Threshold                                        | Why                                             |
| --------- | ------------------------------------------------ | ----------------------------------------------- |
| Aggregate | ΔR (rule on − rule off) ≥ 0                      | The rule must not cost money on unseen data.    |
| Months    | losing months ≤ half of the months in the window | Recurrence, not one lucky stretch.              |
| Sides     | at most one of long/short negative               | The gain must not come from one direction only. |

Deliberately _not_ required: that the rule beat its discovery-window delta, or that every
month be positive. Both would be demands on the market, not on the rule.

A window that produces fewer than ~30 rule-relevant trades is **INCONCLUSIVE**, not a
pass: the per-month criterion is meaningless at that sample size. Record it and wait for
more data.

## 4. What a FAILS verdict obliges (and what it forbids)

**Obliges:** a product decision, recorded in a change log — turn the rule off, narrow its
scope (e.g. per session, if that was pre-registered), or accept it knowingly with the
reason written down.

**Forbids:** re-tuning the rule on the window that produced the failure, and then
re-running the evaluator on the same file to obtain a pass. The ledger flags a re-run of an
already-evaluated data hash, so this is visible rather than deniable.

**If a rule is changed for a reason other than the evaluation** (a bug, a data-contract
change, a new requirement), the change invalidates the accumulated window for that rule:
start a new hypothesis with a new freeze (§2.1). Partial credit does not exist.

## 5. Running it

```bash
# 1. generate the data with the product (DataGenerator page), then, from the repo root:
node --experimental-strip-types --import ./tests/register.mjs \
  scripts/research/validate-on-new-data.mjs path/to/new-window.csv --label="post-2026-08 window"
```

The evaluator refuses to run when:

- the file **is** the discovery baseline (hash match),
- the file **overlaps** the discovery window on any calendar day,
- the file has **fewer than 1,000 bars** (below the measured warm-up floor,
  `tests/warmup-window-sufficiency.test.mjs`).

It has no knobs: no thresholds, no candidate rules, no filters to vary, no output that
could be fed back into a search.

Output: per-month and per-side ΔR, the three criteria, a HOLDS/FAILS verdict, and a new
line in `artifacts/validation/ledger.jsonl`:

```json
{"evaluatedAt":"…","dataSha256":"…","window":{…},"rerun":false,
 "rules":{"regime-filters.ts":"…","run.ts":"…"},"gitHead":"…",
 "totals":{"withF":{…},"withoutF":{…},"deltaR":…,"removed":…},
 "perMonth":[…],"perSide":[…],"criteria":[…],"verdict":"HOLDS"}
```

## 6. Current state of the ledger

Empty. No shipped rule has been evaluated on out-of-sample data yet — the v1.8 Filter F
result is entirely within its discovery window, which is why it is described as a
hypothesis in `AUDIT-V1.8-LIVE-FIDELITY.md` §4 and not as a validated improvement.
