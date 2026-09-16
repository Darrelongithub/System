# Project charter

## What this project is

**Loss-reduction / trade-quality research on an existing system.**

The strategies are the starting system and they are not the subject. The losses in
this system run roughly **2× the wins**, and the work is to identify recurring
classes of bad trades and reject those candidates — _without_ killing winners or
letting the slot/refill mechanism replace them with something worse.

The loop, and nothing else:

```
existing strategy signal
  → identify a genuine bad-trade condition
  → reject that candidate
  → measure the effect on the entire resulting trade book
```

We are not discovering strategies, not rebuilding the system, and not competing for
a bigger historical number.

## What the backtest is for

The live analyzer is the product. The backtest is a **historical replay of the live
decision process**: it exists to answer "would the live engine have known this, and
would it have done the same thing?" — never "how much R can this rule make?"

Order of precedence, applied to every change:

1. **Live-analysis correctness** — the decision on the newest bar is what the user acts on.
2. **Causality / no lookahead** — every input must have existed at decision time.
3. **Deterministic, reproducible decisions** — same input, same answer, every run.
4. **Backtest ↔ live parity** — the replay reproduces the live decision exactly.
5. **Robustness on unseen data** — the condition recurs outside the data it was found in.
6. **Historical performance** — evidence about the rule, never the objective.

## Terminology (use these words, exactly)

| Term                    | Means                                                                                                                  | Does **not** mean                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Live analyzer**       | The actual product: the newest bar, the actionable decision, run on a fresh CSV.                                       | A backtest with a different flag.            |
| **Backtest**            | Historical replay of the live decision process, used to check behaviour and gather evidence.                           | A profit target or a scoreboard.             |
| **Golden baseline**     | Development / regression laboratory: the locked fixture that proves a change did or did not alter decisions.           | A result to improve.                         |
| **Forward data**        | Validation: data that did not exist when the rule was chosen, evaluated once, against pre-registered criteria.         | More research material.                      |
| **Filter F**            | A **provisional loss-reduction hypothesis** (counter-trend bar closing on its high). Shipped, unvalidated.             | A proven improvement, or a finished feature. |
| **"Improves the book"** | Engine-level: the whole resulting book gets better once rejections, slot refills and the dedupe state are all applied. | A drop-model estimate or an offline gain.    |

## What we will not do

- **No strategy discovery.** The nine strategies are the system.
- **No threshold tuning on the golden baseline.** It is the development fixture; tuning against it converts evidence into self-confirmation.
- **No filter stacking.** One condition at a time, each with its own mechanism and its own forward validation. A rule that fails forward validation is removed, not adjusted.
- **No accepting a rule because it raises historical R.** A filter exists because there is a defensible reason it improves the _live decision_, on information available at decision time.
- **No re-evaluating on data that has already been seen.** Evidence about a shipped rule comes from data that did not exist when it was chosen (`FORWARD-VALIDATION.md`).

## Current state

- **Shipped:** Filter C (v1.3, counter-trend under extreme ATR percentile) + Filter F (v1.8, provisional loss filter).
- **Development fixture:** golden baseline = 2,286 trades / R 541.3570458970024 (the laboratory's regression lock, not a goal).
- **Validation:** none yet. Filter F has in-sample support only, with the gain concentrated in macd-cross/dual-thrust and the Asian session; it costs money in London and New York (`AUDIT-V1.8-LIVE-FIDELITY.md` §3.1).
- **Rules:** frozen as of v1.8.1 (`tests/ruleset-freeze.test.mjs`). Any change is a product decision with its own evaluation window.
- **Next:** collect post-2026-08-20 data and run `scripts/research/validate-on-new-data.mjs`.
