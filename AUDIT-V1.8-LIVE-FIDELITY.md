# AUDIT — v1.8 reviewed against live-analysis fidelity

Date: 2026-09-16
Scope: review of the v1.8 changes (Filter F shipped as a production default) against
the project's actual objective. **No filter was added, removed, tuned or re-searched in
this pass.** The only code changes are fidelity guards, provenance and process tooling
(listed in §7).

## 0. The objective this was reviewed against

> The backtest is the laboratory; the live analyzer is the product. The backtester exists
> to reproduce, as faithfully as possible, what the live analyzer would have known and
> done at each point in history. Historical performance is evidence, not the objective.

Hierarchy used for every judgement below: (1) live-analysis correctness, (2) causality /
no lookahead, (3) deterministic decisions, (4) backtest ↔ live parity, (5) robustness on
unseen data, (6) historical performance as evidence.

**Verdict on v1.8: the engine-level work holds up; the way I described it last turn did
not.** Two claims in `logs/v1.8-changes.md` and the filter research report were too
generous and are corrected here (§3). Filter F is a _hypothesis with in-sample support_,
not a proven improvement, and it now has a pre-registered way to be judged on data it has
never seen.

---

## 1. Does the live analyzer apply Filter F using only information available at decision time?

**Yes, at the analyzer level and at the data level for the fields F reads.**

| Question                                                                        | Evidence                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What does the predicate read?                                                   | `ctx.candles[i]` only — the signal bar's OHLC and its `invalid` flag — plus `isCounterTrend(candle.trend, side)`. No ATR, no clock, no later bar. (`src/lib/analyzer/regime-filters.ts`.)                                                                                                                                                                                                       |
| Is the local trend itself causal?                                               | `candle.trend` is not computed from OHLC by the analyzer: it comes from the generator's `similar_swing_refs` column, resolved by `resolveSwings`, which accepts a ref only when `match.index < candle.index`. `tests/regime-filter-f.test.mjs` proves the decision is unchanged when every later bar is truncated away.                                                                         |
| Could a _reference_ to an earlier pivot have been confirmed only by later bars? | Audited: 44,652 refs in the locked baseline, **0 forward-pointing, 0 self-referencing, minimum separation 4 bars** — exactly `SWING_LOOKBACK + 1`, i.e. the earliest bar at which a 3-each-side pivot can be confirmed _and_ used. Every resolved ref was knowable at its decision bar. 3,039 refs point before the file starts and are dropped (fail-closed: no trend, never a guessed trend). |
| Does the trend survive missing data honestly?                                   | Unresolvable refs collapse the row to `trend = "ranging"`; `tests/trend-input-causality.test.mjs` pins that (and pins the fail-closed dropping of hostile future/self refs).                                                                                                                                                                                                                    |
| Could the counter-trend classification have differed live?                      | On the locked baseline, re-deriving each row's trend with only refs that were confirmable _strictly before_ that row changes **0 of 9,738 rows**, and 0 of the 92 Filter F rejections. The backtest's counter-trend verdict for a bar is what live would have had.                                                                                                                              |

Caveat that is _not_ about Filter F but about the surrounding product: the AI verifier's
input still contains genuinely forward-derived columns (§5, L-3).

## 2. Does the backtester reproduce that exact live behavior?

**Yes at the engine level, and it is now enforced structurally rather than by convention.**

- Both paths call the same `runAnalysis`; the only policy difference is what may be
  assumed about the final row. `tests/backtest-analyzer-parity.test.mjs` already proves
  zero signal/row/field differences before the final row, exact day-supplied accounting,
  and no lookahead under truncation.
- New `src/lib/analyzer/config.ts` is the single source of truth for the two
  configurations (`ANALYZER_LIVE_OPTIONS`, `ANALYZER_CERTIFIED_OPTIONS`) — used by the
  live page, the continuous backtest, the golden generator and the shared test fixture.
- New `tests/analyzer-config-parity.test.mjs` pins: the two configs differ in exactly one
  field; **neither pins a filter flag** (so "what ships" is decided in one place); no file
  under `src/` outside `run.ts` may toggle a filter; the product entry points use the
  shared objects and do not hand-roll option literals; and over the locked baseline the
  two configs differ only on the final row.
- The golden summary now records the hashes of the baseline CSV and of the rule sources
  it was generated from, and a test verifies the data hash — so a lock always names the
  exact (data, rules, options) triple it describes.

## 3. Does disabling F reproduce the previous engine exactly?

**Yes — byte-for-byte, and it is pinned.**

`tests/filter-optout-legacy.test.mjs` rebuilds the Filter-C-only book
(`ANALYZER_CERTIFIED_OPTIONS` + `enableFilterF: false`) and compares a canonical hash of
the full row stream (order included, all 14 trade fields) against the pre-v1.8 golden
artifact as it stood at commit `4cba607`:

- hash `42b3d546621a1b273d6e8d254de9bd942aa4948c00fae063aece9fcd78114697` — identical;
- totals: 2,323 trades / TP 756 / SL 1,563 / OPEN 4 / NO_FILL 0 / R 523.6813503963194 — identical;
- structurally: the 85 trades the opt-out book takes and the shipped book does not are
  **all** Filter F rejections in the shipped run; the 48 the shipped book takes and the
  opt-out does not are slot refills. Nothing else differs.

### 3.1 Correction to last turn's narrative

The claimed mechanism story ("the same failure across nine strategies") describes the
_rejection set_ — rejections do span all nine strategies — but it implies a uniformity of
_benefit_ that the numbers do not support. Engine-level ΔR = R(F on) − R(F off):

| Slice           | ΔR         | Slice          | ΔR                     |
| --------------- | ---------- | -------------- | ---------------------- |
| **macd-cross**  | **+15.46** | three-soldiers | −7.45                  |
| **dual-thrust** | **+10.09** | pdh-retest     | −2.48                  |
| williams-r-fade | +2.02      | morning-star   | −1.02                  |
| classic-pivot   | +1.00      | donchian-55    | −0.94                  |
| ichimoku-tk     | +1.00      |                |                        |
| short           | +7.17      | **asian**      | **+28.07**             |
| long            | +10.50     | london         | −5.40                  |
|                 |            | ny             | −5.00                  |
| months up       | 6 of 10    | months down    | 4 of 10 (worst −3.9 R) |

So: two strategies and one session carry the aggregate gain; the filter costs money in
London and New York. That is a reasoning-unstable picture for a **default-on** decision,
and it is exactly the kind of concentration that the next window either confirms or kills.

## 4. Does F remain sensible on data that was not used to discover it?

**Unknown — no such data exists yet, and this audit will not manufacture the appearance
of it.** There is one OHLC artifact in the repository (`artifacts/baseline-xauusd-ohlc.csv`,
2025-11-01 → 2026-08-20), and the batch research table is a projection of the _same_ run.
Both halves, all four folds and every threshold neighbour live inside that window, so they
measure recurrence, not validation, and I am no longer going to describe them otherwise.

What can honestly be said today: the _rejections_ recur across strategies, sides, sessions
and months (§3.1), the threshold sits on a plateau, and the engine-level net is positive
in both halves. Nothing here is out-of-sample.

## 5. Where can live and backtest still diverge?

Ordered by severity of the consequence for a live decision.

**L-1 — Fetch-window length is a product input, and short windows silently change the
newest decisions. (High; measured, not theoretical.)**
Live analysis runs on whatever CSV the user generates; the backtest runs on 9,738 bars.
Comparing the live policy on truncated tails of the baseline against the same bar in a
full-history run:

| window       | rows differing on the actionable bar | deepest contamination    |
| ------------ | ------------------------------------ | ------------------------ |
| 150–300 bars | 4                                    | reaches the newest bar   |
| 400–800 bars | 2                                    | reaches the newest bar   |
| 900 bars     | 0                                    | last 96 bars identical   |
| ≥1,000 bars  | 0                                    | last ~180 bars identical |

There is no minimum-range guard in the product today. `tests/warmup-window-sufficiency.test.mjs`
now pins 1,000 bars as the supported floor (with margin over the measured ~900-bar
break-even) so the requirement is re-measured rather than rediscovered. **Recommendation:**
surface the floor in the data-generation UI (e.g. refuse or warn below ~1,000 bars of
30m data) — a product decision, not taken here.

**L-2 — Nothing validates that the trend input resolved. (Medium-high; silent failure.)**
`candle.trend` depends on `similar_swing_refs` resolving to _earlier_ rows. If a CSV is
re-timestamped, spliced or partly synthetic, refs stop resolving, every row becomes
`ranging`, and both filters plus every trend-aware strategy quietly stop firing — no
error, just a different (usually emptier) book. Found by smoke-testing the new validator
with a deliberately shifted copy of the baseline: 2,337 trades, **ΔR = 0.00, zero
removals** — Filter F did not reject a single trade because no row was counter-trend.
**Recommendation:** add an unresolved-ref (or trend-distribution) sanity check to the
generator's validation battery, which today checks schema, empty columns, reliability,
thresholds, continuity and ATR, but not this.

**L-3 — The AI verifier reads forward-derived columns. (High for verifier reproducibility;
no effect on trade rows.)**
`similar_swing_retrace_pct` is computed from up to 40 _future_ bars and
`swing_invalidated` from "any later row"; the verifier prompt explicitly instructs the
model to use `similar_swing_retrace_pct`/`similar_swing_refs` directly. Over a historical
window those values are hindsight; live, the same rows are empty or carry an
`inherited_from:` source. So a verifier verdict reached on historical data is not
reproducible live, and vice versa. The trade engine is unaffected (it never reads those
columns). **Recommendation:** either strip the future-derived columns before the CSV
reaches the verifier, or relabel them as hindsight and forbid their use — a product
decision, not taken here.

**L-4 — The HTF "before/after" table shows a filter that does nothing. (Low, honesty.)**
`enableHtfDirectionFilter` is inert for trade generation (`tests/analyzer-htf-inert.test.mjs`
pins it), yet the live page still renders a before/after comparison that is equal by
construction. It invites "add more filters" thinking while proving nothing. **Recommendation:**
relabel it as a diagnostic, or remove it.

**L-5 — Two full engine passes on the live page. (Low, cost.)** The HTF diagnostic runs a
second full `runAnalysis` (deferred, so it no longer blocks the first paint). Not a
correctness issue; noted because it is the kind of thing that makes live behavior look
different from the backtest when someone later compares timings.

**L-6 — The final-bar policy is a _documented_ difference, not a divergence. (By design.)**
Live treats the last row as possibly-in-progress (excluded from signals and from
resolution, `tests/live-final-bar.test.mjs`); the certified path treats it as closed. This
is now expressed in one shared object per path (§2).

## 6. Architecture that encourages optimising the backtest

These are the structural reasons the project _could_ drift into a curve-fitting
competition, flagged rather than fixed by adding more rules.

**A-1 — The golden lock is the visible scoreboard.** `artifacts/golden-summary.json`
publishes trades and R, and every research log quotes R deltas; nothing equally visible
measures live fidelity. A rule that raises R while damaging parity would look like
progress. Mitigation landed: fidelity is now measurable in the suite (config parity,
opt-out hash, warm-up floor, trend-input causality, provenance hashes) — those tests, not
the R total, are what a change has to keep green.

**A-2 — Filters are toggles on the same call the product uses.** `enableFilterC` /
`enableFilterF` are ordinary `RunOptions`, so a "research" run and the shipped product
differ by one boolean, and any call site could have set it. Mitigation landed: the config
parity test forbids filter flags in either shipped configuration and forbids any `src/`
call site outside `run.ts` from mentioning them.

**A-3 — The research tooling is re-runnable on the same series.** Discovery scripts that
can be re-run at will, over the data the rules were chosen on, make "let me try one more
idea" frictionless and its output look like evidence. Mitigation landed: those scripts now
refuse to run without an explicit `ALLOW_DISCOVERY_SEARCH=yes` acknowledgement, and the
new evaluator refuses the discovery series outright (§5/L-7 below and §7).

**A-4 — Re-baselining the golden is a comment, not a gate.** The generator warns "do not
run this to make a failing test pass", but nothing records _which_ code and data produced a
lock. Mitigation landed: the golden summary now records the baseline-CSV hash and the rule
source hashes, verified by a test, so a lock always names its inputs.

**A-5 — Acceptance has been metric-shaped.** Last turn's acceptance criterion ("net R must
go up by ≥X") is a backtest metric; under the stated hierarchy it is the _last_ rung, not
the first. Recommendation adopted in `FORWARD-VALIDATION.md`: a future filter proposal must
state (a) the live-decision mechanism, (b) the decision-time information it uses, (c) the
opt-out reproduction, (d) slice robustness, and (e) pre-registered forward criteria —
**before** touching the default.

**A-6 — One window, one instrument.** Every result in the repository comes from a single
9,738-bar XAU/USD window; a rule can look robust and be an artifact of that one regime.
Mitigation: the validator (§7) refuses to evaluate on it, and the protocol requires new
windows to be evaluated once, as-is.

## 7. Can future data become evaluation data instead of another playground?

**Yes — `FORWARD-VALIDATION.md` (the protocol) and `scripts/research/validate-on-new-data.mjs`
(the mechanism), both new.**

The evaluator: evaluates the **shipped** rules only (no knobs, no candidates, no search);
**refuses** the discovery baseline and any file that overlaps its calendar window; refuses
windows below the measured 1,000-bar warm-up floor; applies **pre-registered** criteria
mechanically (ΔR ≥ 0, losing months ≤ half, at most one losing side) and prints HOLDS /
FAILS; and appends every evaluation — data hash, rule-source hashes, git head, and whether
that exact data hash was already evaluated — to `artifacts/validation/ledger.jsonl`, so
"evaluate, peek, re-tune, evaluate again" is visible in the record.

Smoke-tested against a deliberately shifted copy of the baseline (which the tool correctly
accepted as non-overlapping, and which also exposed L-2). No synthetic record is kept in
the ledger: an evaluation only counts if the data is real.

## 8. What changed in this pass

| File                                                                                                           | Change                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/analyzer/config.ts`                                                                                   | **New.** The two shipped run configurations, single source of truth; documents that filter flags are deliberately _not_ pinned here.                                                                                                       |
| `src/pages/AnalysisV2.tsx`, `src/lib/pipeline/continuous.ts`, `src/lib/analyzer/run.ts`                        | Use the shared configuration objects instead of hand-rolled option literals. No behavior change.                                                                                                                                           |
| `tests/analyzer-config-parity.test.mjs`                                                                        | **New.** 4 tests: one-field difference, no filter flags in either config, no `src/` call site may toggle a filter, entry points use the shared objects, and the two configs differ only on the final row over the locked baseline.         |
| `tests/filter-optout-legacy.test.mjs`                                                                          | **New.** 2 tests: the opt-out book reproduces the pre-Filter-F golden byte-for-byte (canonical hash + totals), and the two books differ only through F's own rejections (85/48 decomposition).                                             |
| `tests/warmup-window-sufficiency.test.mjs`                                                                     | **New.** 2 tests pinning the 1,000-bar live-window floor.                                                                                                                                                                                  |
| `tests/trend-input-causality.test.mjs`                                                                         | **New.** 3 tests: every swing ref in the baseline predates its decision bar by a confirmable swing (0 forward, 0 self, min separation 4), hostile refs are dropped fail-closed, unresolved refs collapse to `ranging` rather than a guess. |
| `tests/golden.test.mjs`                                                                                        | **New** provenance test: the lock's recorded baseline hash must match the file.                                                                                                                                                            |
| `scripts/generate-golden.mjs`                                                                                  | Records `inputs` (baseline hash + rule-source hashes) in the golden summary.                                                                                                                                                               |
| `scripts/research/validate-on-new-data.mjs`                                                                    | **New.** The forward-validation evaluator + ledger.                                                                                                                                                                                        |
| `scripts/research/search-filter-candidates.mjs`, `control-filter-candidates.mjs`, `report-filter-families.mjs` | Discovery guardrail: refuse to run without `ALLOW_DISCOVERY_SEARCH=yes`.                                                                                                                                                                   |
| `scripts/research/audit-filter-f-robustness.mjs`                                                               | **New.** The per-month / per-strategy / per-side / per-session breakdown in §3.1 (frozen rule, engine-level, no search).                                                                                                                   |
| `FORWARD-VALIDATION.md`                                                                                        | **New.** The protocol.                                                                                                                                                                                                                     |
| `logs/v1.8-changes.md`, `artifacts/strategy-research/filter-research-report.md`                                | Errata: the §3.1 concentration numbers and the corrected wording.                                                                                                                                                                          |

No strategy, indicator, filter predicate, threshold or golden trade row changed in this
pass. The golden lock still reads 2,286 trades / R 541.3570458970024.

## 9. Open decisions for the product owner

1. **Filter F's default while it is unvalidated.** Keep it default-on as a provisional
   hypothesis, or ship it default-off until the first forward window reports? Either is
   defensible; the code supports both, and the opt-out is proven exact. My
   recommendation: keep it on _only_ if it is understood as provisional, since the
   concentration in §3.1 means the next window is a genuine test rather than a formality.
2. **L-1**: enforce or warn about the 1,000-bar floor in the data-generation UI.
3. **L-3**: strip the future-derived columns from the verifier's input, or relabel them.
4. **L-2**: add an unresolved-ref / trend-distribution check to the generator's validation
   battery.
