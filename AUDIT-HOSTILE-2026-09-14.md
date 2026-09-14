# Hostile Code Review — 2026-09-14

Stance: every file evaluated for necessity, correctness, robustness, config/wiring,
UI wiring, dead ends, architecture, redundancy, performance, security. Every issue
below was **fixed**, not just described, unless explicitly marked *kept*. Gates:
`tsc --noEmit` (now with `noUnusedLocals/Parameters`), `eslint`, 71 unit tests,
5 golden tests, production build, live SSR smoke — all green; golden trades
unchanged at 2323.

## Page / entry points

### `src/pages/DataGenerator.tsx` — **Needs fixes (applied); remains a God component**
1. **Write-only chart snapshots (perf/robustness).** `saveAnalysisSnapshot`
   rasterized three 1920×1080 PNGs (`svgToPng` + FileReader→dataURL) and stored
   them in `sessionStorage`, but no page/server fn ever read `snapshot.charts`.
   It burned seconds per run and routinely exceeded the sessionStorage quota,
   where the catch silently dropped the *entire* snapshot (CSV included).
   Fix: snapshot is now CSV-only; removed the `charts`/`AnalysisChart` pipeline,
   the `AnalysisChart` type, and validation. `svgToPng` kept (still used by the
   real ZIP download).
2. **Inverted OHLC range silently produced an empty CSV.** The only date guard
   covered the *chart* pickers; the independent OHLC start/end had none.
   Fix: explicit end≥start guard for OHLC when included.
3. **Rate-limit classification duplicated and inconsistent.** The chart path
   matched only `"run out of API credits"` while the server/OHLC matched
   `"credit"`; the two paths could disagree on the same response.
   Fix: single `isProviderRateLimit()` / `isProviderNoData()` in `market-data.ts`,
   used by all three call sites.
4. **Redundant/dead code.** Removed: unused `Label` import, the entire unused
   `Select` import block (the symbol field is a Popover/Command), `html2canvas`
   import (zero uses — dep removed), `addDays/subDays`, the
   `removeRepeatedFlatlineArtifactsShared` alias, unused `fileName` param,
   unused `basePrice`, unused `isEndTime` field, `endDateStrParam` passthrough,
   unused `endDateObj` param, an unused `(e)` handler arg, the unreachable
   "resume" scaffolding and a local countdown interval that raced the shared
   `cooldown()` (double-speed timer), and a second `stopRequestedRef` that
   duplicated the AbortController's own state.
5. **Redundancy.** CSV filename was string-built identically in 3 places →
   one `ohlcCsvFileName()`.
Wiring check: Generate→`handleGenerate` (connected), Stop→`handleStop`
(connected, real abort), Download ZIP→`handleDownload` (connected), every
Input/Checkbox/Popover wired to state that is consumed; OHLC/chart toggles
control real branches. No dead handlers remain.

### `src/pages/Backtest.tsx` — **Needs fixes (applied)**
1. **CRITICAL weekend bug.** Hard `isWeekend(day)` skip dropped 37 real
   Saturday-tail triggers (2286 vs 2323). Fix: route through the tested
   `dayReportSkipReason`; range gate uses `isSunday` only.
2. **Stop didn't stop data fetching.** Now aborts the continuous pull and
   cooldown waits; aborted pull returns quietly; Stop with zero days shows no
   error toast; partial bundle says "stopped".
3. Removed dead imports `STRATEGIES`, `dayFileName`.
Wiring: Run/Stop, symbol/date/forward/AI-stage inputs, stats table, ZIP link —
all connected. Remaining (kept, documented): an in-flight verifier RPC is
45s-bounded but not signal-abortable (cross server-fn boundary).

### `src/pages/AnalysisV2.tsx` — **Keep as-is**
Filters, HTF table, auto verifier, bundle download all wired; cancellation
tokens (`bundledFor`, effect `cancelled`) correct. The deferred second engine
pass renders an explicitly-labeled inert comparison; it is test-locked and
non-blocking (`setTimeout 0`) — left as a deliberate non-change (removing a
displayed research table is a product call).

### `src/pages/Home.tsx`, `src/routes/*.tsx` — **Keep as-is.** Thin, all reachable.

## Server / data plane

### `src/routes/api/market-data.ts` — **Needs fixes (applied)**
1. `String(new ZodError)` echoed the full issue tree incl. untrusted values,
   unbounded → capped `path: message` pairs (≤300 chars).
2. Transport error strings could contain the upstream URL (with `?apikey=`) and
   were returned to the client → `redactSecrets()` on both error surfaces.
3. Dead `keys0` alias removed; local rate-limit predicate replaced by the shared
   one.
Wiring: `TWELVE_DATA_API_KEY[S|_1..N]` — read here, loaded by `server-env`,
documented in `.env.example`; missing keys fail loudly with a 500 + the exact
   var names. POST-only; health is GET and never prints key material.

### `src/lib/market-data.ts` — **Needs fixes (applied).** Added `signal`
(forwarded to `fetch`, stripped from the JSON body — AbortSignal is not
serializable), `redactSecrets`, and the two shared classifiers. No key is ever
shipped to the client.

### `src/lib/verifier.server.ts` — **Needs fixes (applied).** `callChat` now has
a 45s `AbortSignal.timeout` with a clean timeout message and is exported;
previously one dead host across up to 7 sequential attempts hung the panel
indefinitely. Env (`LOVABLE_/OPENROUTER_/NVIDIA_API_KEY`) each fail over to the
next and the final error lists all warnings loudly.

### `src/lib/verifier.functions.ts`, `src/lib/server-env.ts`, `src/server.ts`,
### `src/start.ts`, `src/lib/error-page.ts`, `src/lib/error-capture.ts`,
### `src/lib/lovable-error-reporting.ts` — **Keep as-is.** Edge-safe lazy node
imports, non-clobbering env load, CSRF middleware, h3 stack recovery, and the
server-only console patch (never enters the browser bundle) are all correct and
tested.

## Analysis engine

### `src/lib/ohlc-generator.ts` — **Needs fixes (applied).** Stop/interruptible
`cooldown`; `signal` through single + chunked fetches and all cooldowns; neutral
abort return; reliability canary limited to ≥500 rows; centralized rate-limit/
no-data predicates; removed two unused `validateOhlcExport` params.

### `src/lib/analyzer/parse.ts` / `run.ts` — **Needs fixes (applied).**
Missing required columns → `metadataError` (was all-invalid candles);
all-invalid body → `{ok:false}` (was empty success). Covered by new F7 tests.

### `src/lib/analyzer/math.ts`, `strategy-kind.ts`, `time.ts`,
### `backtest/engine.ts`, `pipeline/policy.ts` — **Needs surface fixes (applied).**
Un-exported internal-only helpers; deleted dead `eatMinutes`,
`closedSignalCandleCount`, `SAME_CANDLE_TP_SL_RULE` (the live-bar rule is
inlined + tested in `run.ts`; the same-candle convention is documented at its
one enforcement site in `status.ts`).

### `src/lib/journal/path-walker.ts` — **DELETED.** The MAE/MFE post-hoc journal
was never wired to a report/UI/API; `buildTradeJournal` had zero callers and
`walkTradePath`/its types were referenced only by the module's own test — a
self-justifying dead feature. Deleted module, engine re-export, and
`journal-excursion.test.mjs` (3 tests). The shared causal logic it wrapped
(`evaluateSetupStatus`) stays in production and is covered by
`live-final-bar`/`status-parse-time-tz`/`causality`.

### `src/lib/pipeline/continuous.ts`, `daily.ts`, `pivots.ts`, `indicators.ts`,
### `structure.ts`, `regime-filters.ts`, `status.ts`, strategies/* — **Keep as-is.**
Locked/golden behavior; every export is consumed internally or by tests/pages.

## State / components / config

### `src/lib/analysis-store*.ts` — **Needs fixes (applied).** Dropped the
write-only `charts`/`AnalysisChart` field and the large unused
`DEFAULT_SUMMARY_FIELDS` template; validation still rejects malformed JSON.
Storage key `forexlens.analysis.snapshot` is internal (not an env var).

### `src/components/ui/command.tsx` — **Needs fixes (applied).** Removed
`CommandDialog` (depended on a dialog never mounted), `CommandShortcut`,
`CommandSeparator` (zero uses), the `"use client"` directive (meaningless in
this non-Next stack), and the now-orphaned `@radix-ui/react-dialog` import.

### `src/components/ui/badge.tsx`, `card.tsx`, `dialog.tsx`,
### `src/hooks/use-mobile.tsx` — **DELETED.** Zero importers.

### Other `components/ui/*` (button/input/label/popover/scroll-area/select/sonner)
— **Keep as-is**, each mounted and backed by a used Radix package.

### `package.json` — **Needs fixes (applied).** Removed 28 zero-import runtime
packages, `html2canvas`, and `@radix-ui/react-dialog`. Kept (verified required):
the six used Radix libs, toolchain peers of `@lovable.dev/vite-tanstack-config`
(`@tailwindcss/vite`, `vite-tsconfig-paths`, `@vitejs/plugin-react`,
`react-dom`, router plugins), react-query, zod, jszip, etc.

### `tsconfig.json` — **Needs fix (applied).** Enabled
`noUnusedLocals`/`noUnusedParameters`; repo is clean, so dead code now fails the
build instead of rotting.

### Deleted repo artifacts — `System-v1.3.zip` (2.3 MB redundant snapshot, in git
history), `bun.lock` + `bunfig.toml` (npm is canonical; README/scripts use npm).

## Env / config wiring — final status
| Variable | Declared `.env.example` | Loaded | Read | Failure mode |
|---|---|---|---|---|
| `TWELVE_DATA_API_KEY[S\|_1..20]` | yes | `server-env` | market-data route | loud 500 + hint; health shows count |
| `LOVABLE_API_KEY` / `OPENROUTER_API_KEY` / `NVIDIA_API_KEY` | yes | `server-env` | verifier.server | per-key warn, failover, aggregate error |
| `VITE_DEV_HOST` | inline in `vite.config.ts` | vite | dev bind only | optional; loopback default |
No variable is read-but-never-set silently in a hot path, none is hardcoded in
client code, and no secret reaches the client bundle or error strings.

## Deliberately NOT changed
- Any strategy rule/param/reason string and all golden artifacts (frozen).
- The inert HTF comparison pass/table (test-locked, deferred, labeled).
- ISO-week ZIP math (verified exact ISO-8601 over 2000–2040, pinned).
- DataGenerator's size — still a God component, but splitting it risks the
  locked CSV/SVG output formats; tracked as the largest architectural debt.
- Mixed download-name roots (`forexlens-*` generator ZIP vs `structure-scout_*`
  analysis bundle): renaming user-visible artifacts is a product decision.
