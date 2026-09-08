# Signal Finder Pro — Independent Audit (2026-09-08)

> **Resolution:** findings §1–§4 (golden lock, .gitignore, Gemini contract test, README)
> were fixed in v1.4 — see `logs/v1.4-changes.md`. The suite is now 94/94 green.

**Scope:** whole repo, post-extraction. **Method:** execution-first — every claim below was
reproduced by actually running the project (Node v22, `npm install` clean, `npx tsc`,
`npm run build`, `npm test`, and direct `runAnalysis(...)` probes against the locked baseline).

**Baseline verification summary:**

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run build` | PASS (vite + nitro) |
| `npm test` | **FAIL — 89 passed / 5 failed** |
| Golden lock ("CERTIFIED" per prior audits) | **BROKEN** — production no longer reproduces the frozen golden |

The headline: **the repo's own certification suite is red.** Prior audit documents
(`AUDIT-2026-08-30.md`) claim "30/30 PASS" and "CERTIFIED", but that is no longer true
against the current code. Details below.

---

## 1. CRITICAL — v1.3 enabled Filter C by default and never re-based the golden lock

**Symptom:** `npm test` fails 4 unrelated-looking tests with one shared root cause:

```
FAIL golden: baseline reproduces locked trades row-for-row            (trade row count)
FAIL parity: Backtester reference reproduces the locked golden exactly  (row count)
FAIL parity: Backtest day-supplied accounting equals golden             (bt triggers)
FAIL G1: day-supplied trigger accounting matches the continuous engine  (all 39 Saturday-tail triggers accounted)
```

**Root cause:** `logs/v1.3-changes.md` records a product decision: "Filter C enabled by
default in production analysis (`runAnalysis`)." That single change is
`src/lib/analyzer/run.ts`:

```ts
(options.enableFilterC ?? true)   // was `?? false`
```

`rejectFilterC` (`src/lib/analyzer/regime-filters.ts`) drops PASS candidates that are
counter-trend under extreme ATR percentile (≥95%). On the 9738-row baseline this removes
**64 trades**. Direct probe:

```
runAnalysis(baseline, {seriesEndsComplete:true, enableHtfDirectionFilter:true})            → 2323 trades
runAnalysis(baseline, {seriesEndsComplete:true, enableHtfDirectionFilter:true, enableFilterC:false}) → 2387 trades
```

But the frozen golden and the whole test harness still encode the **pre-C** world:

- `artifacts/golden-trades.json` → 2384 resolved trades
- `artifacts/golden-summary.json` → `totals.triggers: 2384`, `rSum: 507.83051734510207`, and its
  recorded `options` is `{"seriesEndsComplete":true,"enableHtfDirectionFilter":true}` — **no
  `enableFilterC`** (i.e. it was generated with C off).
- `tests/golden.test.mjs`, `tests/backtest-analyzer-parity.test.mjs`,
  `tests/weekend-tail-accounting.test.mjs` call `runAnalysis`/`analyseContinuous` **without**
  `enableFilterC:false`, so they exercise the new C-on default against C-off goldens.
- `README.md` still advertises "2384 trades / TP 768 / SL 1612 / OPEN 4 / R 507.83".

`logs/v1.3-changes.md` explicitly says the golden "remain[s] the frozen pre-C reference", so the
*v1.3 intent* was to keep the golden as the pre-C regression lock — but nobody updated the test
harness to pass `enableFilterC:false`, and no new post-C golden was added. The result is that the
single safety net the repo built (the row-for-row golden gate + the `test:golden` script) now fails
on every run, and the "CERTIFIED" claims in the audit docs are stale.

**Why it matters:** the golden lock exists precisely to catch *accidental* behavior changes. With
it red, a future accidental strategy change would be invisible behind the same pre-existing failure.
This is the most important stale-code issue in the repo.

**Fix options (deliberate — do not silently regenerate):**
1. (Recommended, matches the documented intent) Update the golden/parity/G1 test harness to pass
   `enableFilterC:false`, restoring the frozen pre-C lock; then add a *separate* post-C golden for
   the production default. `analyseContinuous` currently doesn't forward `enableFilterC`, so the
   G1 test's dependency would also need plumbing.
2. Or re-baseline the golden to the C-on default (2384→2323) as an explicit, documented
   re-certification — but this must be a conscious decision, not a drive-by "make it pass".

---

## 2. HIGH — No `.gitignore`; secrets and a 443-package `node_modules/` are one `git add .` away

The repository (the `System-v1.3.zip` that was committed as the only file) contains **no
`.gitignore`**. After extraction, the following are all untracked and would be committed on a
naive `git add -A`:

- `node_modules/` (443 packages from `npm install`)
- `.env` — real API keys (Twelve Data / Gemini / Finnhub); only `.env.example` is present today, but
  any `.env` created locally is unprotected.
- `.output/` and `.wrangler/` (build artifacts — I reproduced these running `npm run build`)
- `output/` (runtime audit files written by `src/lib/ai/console.ts`)

This is a real secret-leak and repo-bloat blindspot. I added a `.gitignore` in this extraction
(see change-set below).

---

## 3. MEDIUM — Gemini Console "removed" but its UI contract test and a large code surface remain

The v1.2 change removed the Gemini Console from production:
- `src/pages/GeminiConsole.tsx` → `return null` ("UI removed from production")
- `src/routes/gemini-console.tsx` and `src/routes/api/gemini-console.ts` → 410 "removed"
- `src/routes/api/analysis.ts` → 503 "Gemini AI debate integration is removed"

But:

1. **`tests/gemini-console.test.mjs` still pins the removed UI contract** and now FAILS:

   ```
   FAIL economic-calendar route ↔ console contract cannot drift again
   Error: console consumes the route's events/byDay shape (not a phantom {upcoming,recent} field)
   ```
   It asserts `src/pages/GeminiConsole.tsx` contains `data["events"]` — impossible now that the
   page returns `null`. This is the 5th failing test and is a *different* root cause from §1.

2. **~30 files of AI plumbing still ship and are still tested**, even though the runtime is
   disabled: `src/lib/ai/**` (`console.ts` 341 lines, `evaluate.ts`, `research.ts`,
   `select/**`), `src/lib/ai-debate.server.ts`, `src/lib/economic-calendar.ts`,
   `src/lib/citation-verify.ts`, `prompts/trade-selector.system.md`, and the whole
   `gemini-research/gemini-phase2/gemini-select` test batteries (which pass). That's a lot of
   maintained-looking code whose only UI entry point is 410/503/`null`.

3. **`/api/economic-calendar` is still fully live** (real GET/POST handler returning data) but its
   documented consumer (the Gemini console) is gone — an orphaned, key-gated external endpoint.

Decision needed: either (a) delete the dead UI + contract test and clearly fence the AI layer as
research-only, or (b) reconcile the test with the new reality. As-is it's self-contradictory.

---

## 4. MEDIUM — Stale README references artifacts that do not exist

`README.md` §"Artifacts" lists:
- `artifacts/final-validation-report.json` ❌ not present
- `artifacts/robustness-batch2-report.json` ❌ not present
- `artifacts/discovery-batch2-report.json` ❌ not present

Actual artifacts are `baseline-xauusd-ohlc.csv`, `golden-regression-report.json`,
`golden-summary.json`, `golden-trades.json`, and `strategy-research/`. The README's pipeline
invariant text ("Closed candles only", etc.) is fine, but its dataset numbers (2384 / R 507.83) are
pre-v1.3 (see §1).

---

## 5. MEDIUM — `compareHtfDirectionFilter` runs 2 extra full engine passes per analysis (perf no-op)

`src/pages/AnalysisV2.tsx` line 79 runs `compareHtfDirectionFilter(csv)` on every analysis. That
function (`run.ts`) runs `runAnalysis` **twice more** — but `enableHtfDirectionFilter` is documented
as "CURRENTLY INERT for trade generation", so the before/after table is always identical. The prior
audit measured ~2–3 s of frozen main thread per CSV for a display-only, always-equal table. This was
explicitly left as an "improvement candidate" in round 1 and round 3 but is still here. Strong
candidate for lazy/deferred computation or removal, and for moving engine work into a Web Worker.

---

## 6. MEDIUM — Temporary diagnostic instrumentation still wired into production UI

`src/lib/analyzer/strategies/diagnostics.ts` self-describes: *"Remove this file and its call sites …
this is not meant to ship long-term."* It is still wired in:
- `track(...)` calls inside `spec-strategies.ts`
- `resetDiagnostics()` + `getDiagnosticsReportLines()` inside `src/pages/Backtest.tsx` (lines 159/391)

The module-level singleton registry is reset only by the Backtest page (never by AnalysisV2, which
has no reader), so counters accumulate across runs in a single tab — bounded, but it's exactly the
kind of stale instrument the comment says to delete.

---

## 7. MEDIUM — Stale/duplicated Gemini research scripts in `scripts/`

Two generations of the same tooling coexist:
- Superseded `.ts`: `gemini-report.ts`, `gemini-research.ts`, `gemini-select.ts`
- Newer `.mjs`: `gemini-prompt-sub-eval.mjs`, `gemini-prompt-substitute-eval.mjs`,
  `gemini-trade-select-experiment.mjs`, `run-gemini-prompt-sub.mjs`
- Plus `_gemini-auth-probe.mjs` (an auth probe — a sketch left in-tree)

These aren't part of `npm test` or the build, but they are dead-weight and confusing to future
readers; the `.ts` set appears fully superseded by the `.mjs` set.

---

## 8. LOW — duplicate page layer + hand-maintained `@ts-nocheck` route tree

There are two UI layers held together by a committed, auto-generated-but-hand-maintained
`src/routeTree.gen.ts` (marked `@ts-nocheck` / "do NOT change"):

- `src/pages/` — 4 large components (~130 KB): `Analysis.tsx` (21 KB), `AnalysisV2.tsx` (23 KB),
  `Backtest.tsx` (27 KB), `DataGenerator.tsx` (62 KB)
- `src/routes/` — the file-based routes that actually drive `routeTree.gen.ts`

`src/routes/analysis.v1.tsx` is `[DEPRECATED]` yet the full `Analysis.tsx` page still ships and is
reachable at `/analysis/v1`. `DataGenerator.tsx` at 62 KB is a single-component monolith. This is a
maintainability blindspot rather than a correctness bug (build currently in sync).

---

## 9. LOW — `AVAILABLE_SYMBOLS` advertises surface the pipeline isn't built for

`src/lib/market-data.ts` lists crypto (SOL/XRP/ADA/DOGE/DOT/LTC), an oil ETF (`USO/USD`), and Brent
(`BCO/USD`) alongside forex/gold. The analyzer's spread parser, session/EAT logic, and strategy
calibrations are all forex/metals-tuned (the only golden baseline is XAU/USD). Selecting, say,
`SOL/USD` would run a gold-calibrated engine over an asset with completely different
volatility/session structure, producing meaningless results with no warning. The symbol allow-list
is broader than the system is actually validated for.

---

## 10. LOW — `batchBacktestReports` ISO-week bucketing is approximate

`src/lib/backtest/engine.ts` computes ISO week as
`1 + Math.round((thursday - jan4) / 604800000)` — a day-resolution approximation that can mislabel
weeks around year boundaries. Impact is cosmetic (weekly ZIP file naming) but it's a correctness
nit in an otherwise meticulous codebase.

---

## Verified-robust (not bugs — confirmed by execution)

- `npx tsc --noEmit` clean; `npm run build` clean.
- The analyzer core held up to the prior audits' attacks (causality, determinism, accounting,
  fuzz) — those 89 passing tests are genuinely green and cover real invariants.
- `src/lib/analyzer/math.ts` (`applySpreadAndRR`) and `src/lib/analyzer/status.ts`
  (`evaluateSetupStatus`) are well-guarded (finiteness, same-candle ambiguity, expiry).
- `src/routes/api/market-data.ts` correctly separates Twelve Data (candles) from Finnhub (news),
  bounds the upstream fetch with `AbortSignal.timeout`, and rotates keys.
- `src/lib/server-env.ts` and `src/lib/ai/gemini.api.ts` are edge-safe and fail-closed; no key
  material is leaked into client bundles.

---

## Suggested next steps (in priority order)

1. **Restore the golden lock** (§1): pass `enableFilterC:false` in the golden/parity/G1 harness
   (and thread it through `analyseContinuous`), then add a post-C golden. Re-verify
   `npm test` → green and `test:golden` → green.
2. **Reconcile the Gemini Console removal** (§3): delete or update the stale contract test; decide
   whether the AI layer stays fenced as research or gets pruned.
3. **Add `.gitignore`** (§2) — done in this extraction.
4. **Fix the README** (§4) artifact list + numbers.
5. Schedule the perf/temporary-instrumentation/dead-script cleanup (§5–§7).
