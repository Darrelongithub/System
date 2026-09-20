# AUDIT — full-repo bug scan and merge gate (2026-09-20)

Scope: every tracked source, test, tooling, config and documentation file in this
repository, read under five lenses, plus the data-driven probes recorded below.
Branch `arena/01a0aa9b-system` → PR #10 → `main`.

**Merge verdict: MERGE.** Every bug this audit confirmed is fixed and pinned
(`e45676a`, `0fd7f8b`, plus the tooling fixes in this commit); `npm test` is
150/0, `npm run test:golden` 7/7, `tsc --noEmit` / `eslint` / `npm run build`
clean, baseline CSV sha256 unchanged
(`87d2ac67585afe4b373be6107fcc66183a43d5e67f14aa56bc77b968ea3473bf`).

## 1. How "read every file five times" was executed

Five lenses, applied per file rather than five sequential passes over the whole
tree, because each lens is what actually finds a different class of defect:

| #   | Lens                 | Question asked                                                                                                    |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Correctness / state  | Does it compute what it claims, on all branches, and is state mutated once?                                       |
| 2   | Causality            | Can anything after the decision bar change the decision or its resolution?                                        |
| 3   | Accounting           | Do outcomes, R multiples and totals partition and reconcile?                                                      |
| 4   | I/O + failure modes  | Missing/empty inputs, NaN, malformed CSV, provider errors, aborts, timeouts — fail open or closed?                |
| 5   | Provenance + hygiene | Does the lock/provenance record which code and data produced it? Case-exact imports, LF, no platform assumptions? |

Executed with: full reads of every logic-bearing module; the v1.8.2 gap-fill
probe suite; an independent exit-walk re-implementation (agreement 2286/2286);
the baseline session-label probe; a CSV round-trip suite; `npm ci` + a
case-sensitivity import checker (109 files / 345 specifiers); a `TZ` matrix; a
mutation battery; and the research scripts run against the shipped lock.

**Honest limits.** There is no DOM/browser harness in this repository, so
`src/pages/*.tsx` and `src/components/ui/*.tsx` were verified by full source
reading, static checks and source-contract tests (e.g. the new
`tests/eat-clock.test.mjs` asserts the page's _source_ uses the shared EAT
helper), not by driving a browser. Painting, layout and event-wiring beyond that
are unverified by execution. `scripts/research/{search,control,report}-*.mjs`
are discovery tools gated behind `ALLOW_DISCOVERY_SEARCH=yes`; they were read
and statically checked, not re-run (they re-mine the discovery series and write
JSON into `artifacts/`).

## 2. Bugs confirmed and fixed

| #   | Bug                                                                                                                                                                                                                                                                                                          | Evidence                                                                                                                                       | Fix                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Gap-blind exit resolution: a bar that opened beyond a tracked stop/target but did not re-trade the level left the position alive to a later touch, so a gapped-through stop could be booked as a winner.                                                                                                     | Probe `/tmp/scratch/gap-verify.mjs`: 52 of 2,286 rows repriced, 1 outcome flip (`three-soldiers` 2025-12-20 booked +2.414R, actually −2.016R). | `e45676a` — `status.ts` + `turtle.ts` fill at the bar's open; documented re-baseline `logs/v1.8.2-gap-fill-resolution.md`; 10 new tests.                                                                                                                                                       |
| 2   | The pages' date defaults and the analysis snapshot's timestamp came from the **browser-local** clock (`DataGenerator.tsx`) and from a second, independently maintained EAT clock (`Backtest.tsx`), so west of UTC+3 a default "latest data" run requested a window ending one EAT day before the newest bar. | Source reading + `Intl`/`new Date()` usage vs the page's own EAT clock, EAT stamps and `Africa/Nairobi` provider query.                        | `0fd7f8b` — new `todayEat()` in `analyzer/time.ts`; all four data-field defaults, the snapshot `createdAt`, the Backtest defaults and its "today" clamp route through it; `tests/eat-clock.test.mjs`.                                                                                          |
| 3   | Two research scripts crashed on current code: a hard-coded Filter-C-only lock (523.6813503963194) had not followed the re-baselines, so `verify-filter-defaults.mjs` and `audit-filter-f.mjs` threw and their remaining report never printed.                                                                | Ran both: `opt-out lock drifted … expected 523.6813503963194`.                                                                                 | Lock re-pinned to the current book (2323 / 507.93925691611344, the value `tests/filter-optout-legacy.test.mjs` pins) with the re-baseline history in a comment; both scripts now complete.                                                                                                     |
| 4   | The forward-validation ledger recorded only `regime-filters.ts` and `run.ts` as the rule-set identity, while exit resolution (`status.ts`) prices every `rMultiple` the verdict is computed from — a rule change there would have looked like the same hypothesis.                                           | Read the script + `FORWARD-VALIDATION.md` §2 against the golden generator's own reasoning for adding `status.ts` in v1.8.2.                    | Ledger now records the same four rule sources as `scripts/generate-golden.mjs`; `FORWARD-VALIDATION.md` §2 and §5 updated to match. Verified by running the evaluator end-to-end (refuses a contract-failing series, then writes a ledger line with all four hashes; synthetic entry deleted). |

Audited and deliberately **not** changed (false positive, kept as a guard rail):
a session label contradicted by its own timestamp (a "ny" row at midday) cannot
widen an opening range — `minutesIntoSession` wraps past midnight, so such a row
reports 8+ hours elapsed and falls outside the 30-minute window. A guard was
written, probed, found unreachable, reverted; `tests/eat-clock.test.mjs` pins the
real behaviour so a future change to the wrap cannot start widening ORB levels.

## 3. Verdicts — `src/`

| File                                                                      | Verdict                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/analyzer/time.ts`                                                    | FIXED (#2). Session windows, EAT parsing, wrap semantics and `parseTime` verified against a TZ matrix.                                                                  |
| `lib/analyzer/daily.ts`                                                   | CLEAN. Opening ranges keyed by session-opening day; contradictory labels carry ≥480 elapsed minutes, so merge/create is already impossible.                             |
| `lib/analyzer/structure.ts`                                               | CLEAN (frozen). Refs must point strictly earlier (causality guard); trend from the last swing pair.                                                                     |
| `lib/analyzer/status.ts`                                                  | FIXED (#1) — gap-first resolution; every other branch (PENDING/FILLED/EXPIRED, wait budget, protective/breakeven stop) re-verified against an independent exit walk.    |
| `lib/analyzer/run.ts`                                                     | CLEAN. Orchestration, final-bar exclusion, PASS/FAIL gating, per-strategy aggregation and `attachOutcome` reconcile with the locked book.                               |
| `lib/analyzer/regime-filters.ts`                                          | CLEAN (frozen). Filter C full-window requirement, Filter F fail-open on missing/degenerate OHLC; filter order and non-consumption of rejected slots correct.            |
| `lib/analyzer/parse.ts`                                                   | CLEAN. Fail-closed on missing metadata / all-invalid body, duplicate-timestamp policy (first wins, later ones invalidated), value-follows-column-name, numeric formats. |
| `lib/analyzer/math.ts`                                                    | CLEAN. Non-finite and non-positive-risk rejection, spread application, RR threshold.                                                                                    |
| `lib/analyzer/indicators.ts`                                              | CLEAN. EMA seed on an invalid first candle cannot contaminate later values (pinned).                                                                                    |
| `lib/analyzer/pivots.ts`                                                  | CLEAN. ATR rolling-mean definition, fractal pivots, invalid-row handling.                                                                                               |
| `lib/analyzer/series-contract.ts`                                         | CLEAN. Reported share/label split is diagnostic only; gate uses the total. (`key < first` relies on sortable timestamps — report-only note R1.)                         |
| `lib/analyzer/strategies/final-survivors.ts`                              | CLEAN (frozen). Entry rules, dedupe keys, consume-after-validation ordering.                                                                                            |
| `lib/analyzer/strategies/spec-strategies.ts`                              | CLEAN. Legacy Turtle/ORB implementations still reachable only via explicit `strategyIds`.                                                                               |
| `lib/analyzer/strategies/turtle.ts`                                       | FIXED (#1) — gap-aware stop/trailing/hypothetical fills. Event map and unit accounting verified.                                                                        |
| `lib/analyzer/strategies/{index,util}.ts`                                 | CLEAN. Registry composition, consume helper.                                                                                                                            |
| `lib/analyzer/strategy-kind.ts`                                           | CLEAN. Trade vs context classification matches the golden's book composition.                                                                                           |
| `lib/analyzer/types.ts`, `config.ts`                                      | CLEAN. Options split (live vs certified) differs only in the final-bar policy; pinned by config-parity tests.                                                           |
| `lib/analyzer/export.ts`, `bundle.ts`                                     | CLEAN. Report/metadata formatting and ZIP bundling read only what the analysis produced.                                                                                |
| `lib/backtest/engine.ts`                                                  | CLEAN. Day bucketing, ISO-week packaging, trigger→outcome classification, realized-R and state isolation all pinned against the analyzer.                               |
| `lib/pipeline/continuous.ts`, `policy.ts`                                 | CLEAN. Continuous replay equals the analyzer on the same series; warm-up window is the 30-day standard.                                                                 |
| `lib/market-data.ts`                                                      | CLEAN. Symbol normalisation/calibration, provider error classification, secret redaction.                                                                               |
| `lib/ohlc-generator.ts`                                                   | CLEAN. Chunking, dedupe, ordering, weekly-closure row selection, chart/CSV agreement, ref pruning, rate-limit cap and abort handling.                                   |
| `lib/analysis-store.ts`, `analysis-store-validation.ts`                   | CLEAN. Five fields round-trip; unknown fields dropped; 13 malformed shapes refused.                                                                                     |
| `lib/server-env.ts`                                                       | CLEAN. `.env` parsing/quoting, never clobbering platform env, no edge-unsafe imports, no key material surfaced.                                                         |
| `lib/error-capture.ts`, `error-page.ts`, `lovable-error-reporting.ts`     | CLEAN. Cause-chain expansion bounded and TTL'd; error page has no user input; `Response` errors described as status+URL.                                                |
| `lib/strategies/crabel-orb.ts`                                            | CLEAN. One shared breakeven contract, matching `status.ts`.                                                                                                             |
| `lib/utils.ts`, `router.tsx`, `start.ts`, `server.ts`, `routeTree.gen.ts` | CLEAN (generated where noted). CSRF middleware re-declared explicitly; SSR error normalisation; routes match the generator's tree.                                      |
| `routes/*.tsx`, `routes/api/*.ts`                                         | CLEAN. Route wiring, meta tags, provider proxy (key rotation, timeout, redaction, 400/429/502 surfaces) and health endpoint.                                            |
| `pages/AnalysisV2.tsx`, `pages/Home.tsx`                                  | CLEAN. Snapshot consumption validates before use; no verifier call sites remain.                                                                                        |
| `pages/Backtest.tsx`                                                      | FIXED (#2). Run lock, generation counter, abort propagation, contract gate before replay, no stale-state writes.                                                        |
| `pages/DataGenerator.tsx`                                                 | FIXED (#2). Date defaults/snapshot EAT-correct; cancellation, cooldown, download packaging and snapshot-safety paths unchanged and verified.                            |
| `components/ui/*.tsx`, `styles.css`                                       | CLEAN. Stock primitives; no logic.                                                                                                                                      |

## 4. Verdicts — `tests/`, `scripts/`, config, docs

- `tests/**` (48 files): CLEAN. Suite green 150/0; every test inspected for
  vacuous assertions (`assert(true)`, skipped/`.only` tests, swallowing catches,
  assertion-free bodies) — none; the low-assertion-looking files assert inside
  helpers or loops. New/changed this round: `eat-clock`, `gap-fill-resolution`,
  `csv-round-trip`, `trade-accounting-boundaries`, `analysis-store`.
- `tests/ruleset-freeze.test.mjs`: CLEAN, and the gate that proves the rule files
  are unchanged — `status.ts` re-frozen in `e45676a` as part of the documented
  change.
- `scripts/generate-golden.mjs`: CLEAN. Refuses to be a convenience: policy
  comment, provenance hashes, documented re-baseline only.
- `scripts/research/*`: FIXED (#3 stale locks), FIXED (#4 ledger rule sources) —
  see §2; all seven scripts import only live modules (no verifier remnants).
- `package.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`,
  `.prettierrc`, `.prettierignore`, `.gitattributes`, `components.json`,
  `.env.example`, `.lovable/project.json`: CLEAN. `npm ci` succeeds on Linux;
  `allowedHosts`/host handling suits a remote preview proxy; LF pinned
  repo-wide; env example documents every accepted key layout.
- `README.md`, `PROJECT-CHARTER.md`, `AGENTS.md`, `src/routes/README.md`,
  `artifacts/validation/README.md`, `scripts/research/README.md`: CLEAN. Numbers
  match the shipped locks (`logs/v1.8.2-gap-fill-resolution.md`).
- `FORWARD-VALIDATION.md`: FIXED (#4, §2 + §5 rule-source list).
- `AUDIT-*.md`, `logs/v1.*-changes.md`: retained as the dated audit trail
  (including the verifier-era entries) by explicit decision; not rewritten.
- `artifacts/baseline-xauusd-ohlc.csv`: untouched, sha256 as above.
  Goldens regenerated only in `e45676a`, under the repository's own re-baseline
  policy and with `logs/v1.8.2-gap-fill-resolution.md` as the record.

## 5. Report-only residuals (not bugs, not blocking; no threshold was tuned)

| #   | Item                                                                                                                                                                                             | Why it is not fixed here                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `series-contract.ts` classifies a ref as "outside the window" vs "dangling" with a lexicographic timestamp compare; a non-`YYYY-MM-DD …` ref format would land in the other bucket.              | Diagnostic split only — the gate uses the total unresolved share, and the production generator always writes the sortable format.                                             |
| R2  | The Analysis page's before/after table labels every unresolved row "open" (it counts wins/losses from `statusNote` text, not `row.outcome`).                                                     | Cosmetic column semantics on a display-only table; `EXPIRED` rows are excluded from the win-rate ratio either way.                                                            |
| R3  | `PENDING_EXPIRY_CANDLES` (20) is exercised but not pinned by a test asserting the constant itself.                                                                                               | Behaviour is pinned at the boundary (`barsWaiting > budget` in `tests/trade-accounting-boundaries.test.mjs`); pinning the literal would freeze a documented product knob.     |
| R4  | Consecutive-signal streak state is not reset when a strategy's slot frees; chunk-merge sorting repeats work; a dead term remains in the next-row helper; `range` is formatted with `toFixed(2)`. | Each is cosmetic or provably output-neutral on the locked series; changing them without a failing case would be an untested rewrite, which the standing rules forbid.         |
| R5  | `AUDIT-ARENA-2026-09-13.md` and `AUDIT-HOSTILE-2026-09-14.md` are the only files `prettier --check` flags (markdown only; not covered by `npm run lint`, which lints `**/*.{ts,tsx}`).           | Dated audit records; reformatting them would churn historical evidence for zero benefit.                                                                                      |
| R6  | `routes/api/market-data.health.ts` exposes 6 characters of each configured key as a "fingerprint".                                                                                               | Deliberate and documented in that file (lets an operator confirm _which_ key loaded); not key material in usable form, and the endpoint is part of the local tooling surface. |

## 6. Merge gate

- All confirmed bugs fixed: #1–#4 above.
- Certified artifacts consistent: `npm test` 150/0, `npm run test:golden` 7/7,
  `tsc`/`eslint`/`build` clean, baseline CSV sha unchanged.
- Locks unchanged by this commit: golden 2,286 trades / TP 750 / SL 1,532 /
  OPEN 4 / R 527.6272857378555; C-only/opt-out book 2,323 trades / 755 TP / 1,564 SL /
  R 507.93925691611344; `FROZEN_RULES["status.ts"] = d96e7accbb5a0c76`.
- Standing rules honoured: no historical R/WR/PF optimisation, no Filter F
  threshold search, no speculative refactor, re-baseline only as the documented
  product-change path.
