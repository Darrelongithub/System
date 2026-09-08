# System v1.1 — Fixes, Cleanup & Findings

## 1. The bug you reported: stale 120-day Turtle window

**Root cause confirmed exactly as you described.** `Backtest.tsx` fetched OHLC
data starting 120 calendar days before your report range, via
`turtleWindowStart(rangeStart)`. That padding existed solely to give the
Turtle strategy's System 2 (55-trading-day breakout) enough history — but
Turtle was already removed from the production strategy set
(`STRATEGIES` in `strategies/index.ts` explicitly excludes it, and
`analyseContinuous` runs with no `strategyIds` override, so Turtle never
executes in the backtest). Every run was silently fetching **~90 extra days
of candles that were never used for anything.**

The codebase already had the fix half-written: `STANDARD_LOOKBACK_CALENDAR_DAYS
= 30` sat unused in `policy.ts`, right next to the Turtle constant — clearly
the intended replacement that never got wired in after Turtle was retired.

**Fix:** `Backtest.tsx` now fetches a 30-day warm-up window instead of 120.
30 days comfortably covers the largest warm-up any *active* strategy needs
(Donchian's 20-completed-day requirement), with margin for weekends/holidays.

Files: `src/pages/Backtest.tsx`, `src/lib/backtest/engine.ts`,
`src/lib/pipeline/policy.ts`

---

## 2. Why backtests were hanging

Two compounding causes, both fixed:

- **The bloated fetch window (above).** A wider date range means more
  90-day fetch chunks, each one a separate call to the Twelve Data proxy.
  More calls = more chances to hit a rate limit, and each rate limit
  triggers a 60-second cooldown retried up to 5 times. On a modest date
  range this alone could add several unexplained minutes with no visible
  progress — which reads exactly like "hanging."

- **Real bug: no timeout on the upstream fetch.** `src/routes/api/market-data.ts`
  called `fetch()` against Twelve Data with no timeout at all. If that
  connection ever stalled (not a clean error, not a 429 — just silence),
  the request would hang **indefinitely**, with no log line, no error, and
  no way for the UI's Stop button to help. This is the most likely explanit
  for a true "hangs and never comes back" backtest.

  **Fix:** added a 20-second `AbortSignal.timeout` to the upstream fetch,
  with proper error handling that moves on to the next configured API key
  (or returns a clear error) instead of hanging. Also fixed the fallback
  response so a genuine timeout/network error is no longer misreported as a
  rate limit (HTTP 429) — that misreporting would have made the client's
  60-second-cooldown retry logic kick in for a problem that identical
  retries can't fix, extending the apparent "hang" further.

Files: `src/routes/api/market-data.ts`

---

## 3. Dead / stale code removed

### Turtle-only dead code (matches your exact example)
Once the 120-day fetch was gone, an entire secondary code path built to
support it also had zero remaining callers:
- `analyseDay()` — the old per-day analysis function that took a separate
  `turtleCsv` argument. Nothing called it anymore (the app moved to
  `analyseContinuous` a while back and this was never cleaned up).
- `turtleWindowStart()`, the internal `TURTLE_LOOKBACK_DAYS` constant, and
  the exported `TURTLE_LOOKBACK_CALENDAR_DAYS` in `policy.ts`.
- `NON_TURTLE_STRATEGY_IDS` and `outcomeOf()` — only used inside the
  now-deleted `analyseDay`.
- `monthWindowStart()` — also only used inside `analyseDay`.
- `loadState()`, `saveState()`, `clearState()` and the `STORAGE_KEY`
  constant in `engine.ts` — a `localStorage`-based state persistence layer
  with zero callers anywhere in the app (confirmed via full-repo search).
- `src/lib/backtest-state-validation.ts` — deleted entirely. It existed only
  to validate the JSON that `loadState()` read back from `localStorage`;
  with `loadState()` gone, this whole file became orphaned.

### 13 orphaned strategy implementation files
This was the big one, matching what you described as a broader pattern.
The app went through a strategy-set redesign at some point: the current,
live strategy set (9 production strategies + 7 context/diagnostic tools +
Turtle/ORB kept as opt-in legacy) lives entirely in `final-survivors.ts` and
`spec-strategies.ts`. But an **entire earlier generation** of strategy files
was left behind in `src/lib/analyzer/strategies/`, using old underscored
naming conventions (`opening_range`, `order_block`, etc. — visible in a
leftover comment in `engine.ts`). I confirmed via exhaustive grep that
**none of these 13 files were imported by any other file in the project**
(not the strategy registry, not the analyzer, not a single test):

```
asian-london.ts   bos-retest.ts    ema-pullback.ts   engulfing.ts
fib-pattern.ts    fvg-fill.ts      liquidity-sweep.ts opening-range.ts
order-block.ts    pin-bar.ts       pivot-rejection.ts range-rejection.ts
swing-failure.ts
```
All 13 deleted. Your own `AUDIT-2026-08-30.md` had already flagged this
exact same set as "13 orphan strategy files" — I independently re-verified
it rather than trusting the doc, and it checked out.

### Other confirmed-dead code
- `generateMockCandles()` in `DataGenerator.tsx` — a fake/random OHLC
  generator that was defined but never called anywhere. Risky to leave
  around since if it *were* ever wired in by accident it would silently
  inject fabricated candles into a real data pipeline.
- `downloadReport()`, `downloadReports()`, and the local `inIframe()`
  helper in `src/lib/analyzer/export.ts` — zero external callers. (The
  singular `buildReport()`/`buildLiveReport()`/`buildHistoryReport()`
  functions they wrapped are still used elsewhere and were **not** touched.)

**What I deliberately did *not* touch:** `turtle.ts` itself, its wiring in
`spec-strategies.ts`/`strategy-kind.ts`/`types.ts`, and the `/analysis/v1`
route. These are all explicitly commented as intentional — Turtle/ORB are
kept reachable for research via explicit `strategyIds`, and `/analysis/v1`
is clearly labeled `[DEPRECATED]` in its own route metadata rather than
silently orphaned. Those are product decisions, not leftover bugs, so I
left them for you to decide on rather than deleting unilaterally.

---

## 4. Gemini console added to Backtest & Analyser

You already had a fully-built Gemini console at `/gemini-console`
(`src/pages/GeminiConsole.tsx` + `src/routes/api/gemini-console.ts`) — it
just wasn't linked from anywhere except the main menu. I added a "Gemini
console" button to the header of:
- `src/pages/Backtest.tsx`
- `src/pages/AnalysisV2.tsx` (the live/canonical analyser)
- `src/pages/Analysis.tsx` (the deprecated v1 analyser, for completeness)

Each links straight to `/gemini-console` using the same nav pattern already
used for "Main menu" on each page, so it's a one-click jump from either
workflow without duplicating that whole page's logic inline (which is a
sizeable, stateful page — safer to link to it than to fork it).

---

## 5. Verification caveat — please read

I do **not** have network access in this environment, so I could not run
`npm install`, `npm test`, or `npx tsc --noEmit` here. Every change above
was verified by:
- reading the full surrounding code before and after each edit,
- exhaustively grepping the entire `src/` tree (and `tests/`) for every
  symbol/file I removed, to confirm zero remaining references, and
- re-viewing each edited file afterward to confirm it's structurally sound.

That's solid but it is **not a substitute for actually compiling and running
your test suite.** Before you trust this build, please run, locally:

```bash
npm install
npx tsc --noEmit
npm test
npm run dev   # then run a real backtest end-to-end
```

If `tsc` or the tests turn up anything, it's almost certainly in one of the
files listed above — happy to fix immediately.

---

## 6. Found but not fixed (flagging for you)

- **`AnalysisV2.tsx` runs `compareHtfDirectionFilter()` on every analysis**
  in addition to the main `runAnalysis()` — your own `AUDIT-2026-08-30.md`
  already documented this as a no-op comparison that costs real time
  (freezes the main thread for a couple of seconds) without changing what's
  shown. I didn't touch it this round since it's unrelated to the Backtest
  hang you reported and touching it risks a UI behavior change I can't
  verify without running the app. Worth a follow-up if you want it.
- The project's own docs (`FIXES_APPLIED.md`, `AUDIT-2026-08-30.md`,
  `ARCHITECTURE-NOTES.md`, `README-FINAL.md`) describe the *old* state
  (120-day Turtle window, `analyseDay`, etc.) in places and will now be
  slightly out of date. I left them alone since you didn't ask me to
  rewrite documentation, but flagging it so they don't cause confusion
  later.
