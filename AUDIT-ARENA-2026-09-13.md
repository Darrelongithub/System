# Engineering Audit & Hardening — 2026-09-13

Scope: the full Signal Finder Pro repository (XAU/USD 30m OHLC fetch → enriched
CSV → strategy analysis/backtest → AI verifier → ZIP bundle). Followed the
five-phase workflow: reconnaissance → prioritised audit → hardening →
verification → review. No public API was renamed; locked/golden behaviour was
preserved (every golden test still passes byte-for-byte).

## 1. Project summary

- Stack: Vite 8 + TanStack Start/Router + React 19 + TypeScript (nitro SSR),
  Tailwind 4 + shadcn/Radix, Zod, JSZip, date-fns, html2canvas.
- Routes: `/` menu (Home), `/generator` chart+CSV generator
  (`src/pages/DataGenerator.tsx`, ~1.6k lines), `/analysis` live analyser
  (AnalysisV2, `seriesEndsComplete:false`), `/backtest` continuous portfolio
  replay, `POST /api/market-data` server proxy for Twelve Data (keys never
  reach the client), `GET /api/market-data/health`, AI verifier server
  functions.
- The analysis engine is heavily locked by a golden baseline
  (9,738 bars → 2,323 trades, Total R 523.6813503963194) and by 74 unit + 5
  golden tests. These locks are treated as product requirements.
- A previous audit (`AUDIT-ARENA-2026-09-08.md`, items §1–§4) was verified
  resolved. This audit re-checked §5–§10 and found most already fixed/tested
  (see §7).

## 2. Biggest weaknesses found (priority order)

| # | Severity | Area | Problem |
|---|----------|------|---------|
| C1 | CRITICAL | Backtest day loop | Saturday EAT session tails (Friday NY close, 00:00–01:00 EAT) were hard-skipped as "weekend", silently dropping **37 real triggers (2,286 vs 2,323)** from rolling stats and packaged reports. |
| H1 | HIGH | Rate-limit handling | The chart fetch retried `while (true)` on 429; OHLC retried recursively. A persistently rate-limited account locked the UI forever with no way out. |
| H2 | HIGH | Cancellation | The Generator had no Stop at all; the Backtester's Stop did not abort in-flight HTTP calls or 60s cooldown waits (could take minutes to take effect). |
| H3 | HIGH | AI verifier | Provider calls had no timeout; up to 7 sequential model/provider attempts — one dead host hung the panel/backtest indefinitely. |
| H4 | HIGH | Secret hygiene | Transport errors can stringify the upstream URL (incl. `?apikey=`); those strings were returned to the browser verbatim in two places. |
| M1 | MEDIUM | Upload validation | A header missing core columns, or a body whose rows are all invalid, produced an `ok:true` **empty** analysis instead of rejecting the file (fail-open). |
| M2 | MEDIUM | OHLC validation | The "≥1 is_reliable=false row" canary blocked genuinely clean short windows (<500 rows) as if the column were dead. |
| M3 | MEDIUM | API errors | `String(new ZodError)` echoed the whole issue tree, including attacker-supplied values, unbounded. |
| M4 | MEDIUM | Cooldown UI | A second `setInterval` in the page raced the shared countdown, ticking the displayed rate-limit timer at double speed. |
| L1–L6 | LOW | Repo hygiene | 28 unused runtime dependencies; a 2.3 MB tracked v1.3 ZIP; stray Bun lockfile/tooling; an unused shadcn hook; a dead `keys0` alias; unreachable "resume" code in the Generator. |

## 3. Fixes applied

All fixes are minimal and deliberate; public function signatures gained only
optional parameters.

### C1 — Saturday session tails dropped from the Backtester (CRITICAL)
- File: `src/pages/Backtest.tsx`. The engine already shipped the correct,
  test-pinned predicates (`dayReportSkipReason`, `isSunday` in
  `src/lib/backtest/engine.ts`, covered by G1 tests) but the page still used
  its own hard-coded `isWeekend(day)` short-circuit.
- The page now classifies each calendar day with that **tested predicate**:
  Sundays and empty Saturdays are SKIPPED with an honest reason; a Saturday
  carrying tail candles with triggers is processed. The Sunday-only range
  guard replaces the old all-weekend guard.
- Pinned by `tests/weekend-tail-accounting.test.mjs` (predicate matrix +
  full-baseline day-supplied accounting == continuous engine == golden).
- Golden stays **2,323 trades** (756 TP / 1563 SL / 4 OPEN).

### H1 — Bounded rate-limit retries (F5)
- `src/pages/DataGenerator.tsx` chart path now mirrors the OHLC path
  (`MAX_RATE_LIMIT_RETRIES = 5` in `src/lib/ohlc-generator.ts`): after five
  60s windows the fetch returns `[]`/null with an explicit log instead of
  looping forever.
- Pinned by `tests/rate-limit-retry-cap.test.mjs` (terminates, single upstream
  attempt when the budget is exhausted).

### H2 — Stop actually stops (F6)
- New shared `cooldown(seconds, setter, signal?)` in `src/lib/ohlc-generator.ts`:
  ticks the countdown once per second, rejects immediately on abort and
  clears the display on the way out (the mid-wait abort previously skipped
  the documented clear).
- `requestMarketData` forwards the caller's `AbortSignal` to `fetch` and
  strips it before serialising the POST body (`src/lib/market-data.ts`).
- `buildOhlcCsv` accepts `signal`, forwards it to every upstream call (single
  + chunked paths) and to every cooldown; on abort it returns null with a
  neutral log line.
- Generator: a Stop button (Square icon) now exists; an `AbortController` is
  created per run, loops check the signal, cancelled runs never toast
  success or auto-download, and the racing countdown interval was deleted.
- Backtester: Stop now also aborts the continuous OHLC pull; an aborted pull
  exits quietly; a zero-day stop shows no error toast; a stopped partial run
  says "stopped — partial bundle".
- New tests: `tests/cooldown-abort.test.mjs` (3 cases: normal tick/clear,
  pre-aborted, mid-wait abort).

### H3 — Bounded AI calls (F4)
- `src/lib/verifier.server.ts`: exported `callChat` with
  `AI_UPSTREAM_TIMEOUT_MS = 45_000` via `AbortSignal.timeout`; a timeout
  becomes a normal "model did not respond within 45s" error so the verifier
  can fall through to the next provider instead of hanging.

### H4 — Secret redaction
- `redactSecrets()` in `src/lib/market-data.ts` (split/join, no regex
  metacharacter issues; fragments <4 chars untouched).
- Applied to both client-facing error surfaces in
  `src/routes/api/market-data.ts` (outer transport catch and per-key
  fetch failure envelope).

### M1 — Fail-closed upload validation (F7)
- `src/lib/analyzer/parse.ts`: missing any of
  `datetime, open, high, low, close, is_reliable` in the header now returns a
  `metadataError` with the column list instead of a full set of invalid
  candles.
- `src/lib/analyzer/run.ts`: if every parsed row is invalid, analysis returns
  `{ok:false}` with the first rejection reason instead of an empty success.
- New tests: `tests/parse-fail-closed.test.mjs` (4 cases: minimal valid CSV
  still analyses; empty file; missing column; all-invalid body).

### M2 — Reliability canary only at scale
- `src/lib/ohlc-generator.ts`: the "must contain a false is_reliable row"
  canary is a dead-column detector, not a data property; it now activates only
  at ≥500 rows (`RELIABILITY_CANARY_MIN_ROWS`) and the PASS/FAIL log says when
  it was skipped. Golden-scale windows are unaffected; short same-day fetches
  can no longer be blocked.

### M3 — Tight Zod errors
- `src/routes/api/market-data.ts`: 400 responses list `path: message` pairs
  from `error.issues`, capped at 300 characters; untrusted received values no
  longer echo back wholesale.

### M4 — Single countdown driver
- Removed the Generator's local 1s `setInterval` on `resumeTimer`; the shared
  `cooldown()` owns the only per-second tick (also makes it Stop-interruptible).

### L — Hygiene
- `src/routes/api/market-data.ts`: removed a dead `keys0` alias.
- Generator: removed unreachable "resume generation" scaffolding (the button
  is disabled for the whole run, so every `else` branch was dead) and the
  duplicate date computations.
- `vite.config.ts`: dev host now binds `VITE_DEV_HOST` when set (needed behind
  a container/reverse-proxy preview) and otherwise keeps the 127.0.0.1
  default + loopback HMR; `allowedHosts` enabled for proxied previews.

### Files deleted
- `System-v1.3.zip` — 2.3 MB tracked snapshot of an old release; every file
  in it is in the tree and git history retains the archive.
- `bun.lock`, `bunfig.toml` — two-lockfile drift; README, scripts and CI
  convention are npm (`package-lock.json` is the tracked lockfile).
- `src/hooks/use-mobile.tsx` — unused shadcn leftover (zero importers).

### Dependencies pruned (28, all zero-import runtime UI packages)
20 unused Radix primitives (accordion, alert-dialog, aspect-ratio, avatar,
checkbox, collapsible, context-menu, dropdown-menu, hover-card, menubar,
navigation-menu, progress, radio-group, separator, slider, switch, tabs,
toggle, toggle-group, tooltip) plus `@hookform/resolvers`, `react-hook-form`,
`react-day-picker`, `input-otp`, `embla-carousel-react`,
`react-resizable-panels`, `vaul`, `recharts`. The 11 `components/ui/*`
primitives that actually exist keep their Radix deps. Toolchain peers of
`@lovable.dev/vite-tanstack-config` (`@tailwindcss/vite`,
`vite-tsconfig-paths`, `@vitejs/plugin-react`, `react-dom`,
`@tanstack/router-plugin`) were verified as required peer/transitive plugins
and deliberately kept; the production build proves it.

## 3a. Local setup notes (the "app doesn't work" report)

- `npm install` succeeds with 0 vulnerabilities; `.env` is created from
  `.env.example` and is gitignored by design (it can never be "pulled").
- Without provider keys the UI loads and every route renders; the health
  endpoint reports `keysConfigured: 0` with the exact env-var hint. Add
  `TWELVE_DATA_API_KEYS` (and/or `OPENROUTER_API_KEY` / `LOVABLE_API_KEY` /
  `NVIDIA_API_KEY`) to `.env` to fetch/verify.
- Local run: `npm run dev` (loopback default, unchanged). Behind a
  container/reverse-proxy preview: `VITE_DEV_HOST=0.0.0.0 npm run dev`
  (binds 0.0.0.0, allows preview hosts, and drops the loopback-only HMR
  override).

## 4. Checks run and results

| Gate | Command | Result |
|------|---------|--------|
| Type check | `npx tsc --noEmit` | ✅ 0 errors |
| Lint/format | `npm run lint` | ✅ 0 errors |
| Unit tests | `npm test` | ✅ **74 passed, 0 failed** (was 67; +3 F6, +4 F7) |
| Golden lock | `npm run test:golden` | ✅ 5 passed — 2,323 trades row-for-row identical |
| Build | `npm run build` | ✅ client + server + worker bundles built |
| Runtime smoke | dev server on 0.0.0.0:5173 | ✅ `/`, `/generator`, `/backtest` 200; `/analysis/` canonical 307 → `/analysis`; health JSON; invalid/missing-key POSTs return the structured envelopes |

## 5. Remaining risks (not fixed by design or by scope)

1. **Stop during a verifier RPC (Backtester).** The data pull and cooldowns
   are abortable; an in-flight AI call is bounded by the 45s timeout but is
   not cancelled by Stop (TanStack server-function signal plumbing would be a
   larger cross-boundary change). Worst case Stop waits one model timeout.
2. **Live page double engine pass.** `/analysis` computes the main pass and a
   deferred single-pass `compareHtfDirectionFilter` table. The HTF filter is
   provably inert (pinned: before == after on the baseline), so the table is
   always "aligned"; the extra ~1s pass is deliberately deferred to a
   macrotask. Removing the table is a product decision, not a bug fix.
3. **DataGenerator monolith** (~1.6k lines, UI + fetch + SVG + zip). It is
   internally consistent and now cancellation-safe; splitting it is a
   refactor that risks the golden-locked output formats and was not attempted.
4. **Provider calibration for non-forex symbols** remains best-effort by
   design (the UI warns loudly that crypto/oil output is unvalidated).
5. **AI key absent locally:** without `TWELVE_DATA_API_KEY*` /
   `OPENROUTER_API_KEY` the app runs but cannot fetch or verify; the health
   endpoint reports the count.

## 6. Deliberately NOT changed

- **Any locked strategy behaviour / parameters / one-letter reason strings**
  and the golden artifacts — frozen by tests and README policy; regenerating
  golden files to make tests pass is prohibited.
- **§5 HTF "double pass"** — reduced to one deferred, source-pinned pass
  (`analyzer-htf-inert.test.mjs`); the UI feature stays.
- **§10 ISO-week ZIP names** — the Thursday-anchor arithmetic is the exact
  ISO-8601 algorithm, verified against an independent reference for every day
  2000–2040 (0 mismatches) and pinned at year boundaries in
  `backtest-week-bucketing.test.mjs`. Nothing to fix.
- **§6 diagnostics module / §8 deprecated v1 page / gemini probe scripts** —
  already absent from the tree (verified against `git ls-files`); comments in
  `backtest/ai.ts` and the retained `artifacts/strategy-research/` outputs are
  historical record documented by README.
- **`error-capture.ts` console patch** — module-global side effect, but the
  sole importer is the server entry (`src/server.ts`); it never reaches the
  browser and exists to recover stacks h3 swallows. Left as-is; an
  idempotency guard would be speculative without a reproduced double-install.
- **Single ESLint globals block (browser globals on server files)** —
  `typescript-eslint` disables `no-undef` for TS; the compiler and the
  edge-safe tests provide the real guarantees, so there is no observed
  defect to fix.
- **Turtle / Crabel ORB** stay in the registry as documented legacy/reference
  systems (README), excluded from the production nine.
- No dependency was upgraded and no file outside the findings above was
  reformatted or rewritten.
