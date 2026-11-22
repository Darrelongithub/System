# Pre-Dec 1 App, Pipeline and Bug Audit

## Completed changes

- Fixed MapGenerator `TS2322`: `startDate` is explicitly typed as `string`, not inferred from its literal initializer.
- Added `src/lib/pipeline/friction.ts` profiles: Raw $0.00/oz, Tight $0.20/oz, Realistic Live $0.50/oz, Hostile $0.80/oz. Cost-to-R is round-turn cost / `abs(entry - stop)`; zero/missing risk is not priceable.
- Added `src/components/ExecutionFriction.tsx` selector.
- `Backtest.tsx`: separate Gross avg R and Net avg R; includes exposure-aware friction adjustment for resolved TP/SL only. OPEN/NO_FILL are excluded; if not every resolved item has an entry/stop denominator, net is `n/a` rather than fabricated. Profile changes can recalculate because inverse-risk denominators are kept per strategy.
- `AnalysisV2.tsx`: computes resolved net R and net average R from its own `analysis.results` rows (`RESOLVED`, finite `rMultiple`, valid entry/SL); OPEN and NO_FILL are excluded. The UI shows gross and net sum/average and reports the count priced. The selector now affects actual summary calculations.
- `MapGenerator.tsx`: profile selection is expressly informational: generated synthetic bars are not trades and no R is claimed.
- `continuous.ts` now accepts an `omitFailResults` option and forwards it to the already-supported analyzer memory option.
- `Backtest.tsx` enables fail-row omission at 50,000+ CSV physical lines. PASS rows and exact cumulative fail aggregates remain, while per-day failure-reason lists are suppressed in that mode and a log warns the operator. This avoids retaining millions of repetitive FAIL `ResultRow` objects; smaller backtests keep the normal detailed reports.
- Added `tests/adversarial-v3-integrity.test.mjs` and `tests/adversarial-pipeline-feed.test.mjs` to the main test runner.

## Pipeline/feed audit observations and regression coverage

- Twelve Data `30min` values are not filtered by the fetch function as forming/closed; the generator normalizes, date-window filters and sorts them. The live analyzer configuration excludes the final candle when `seriesEndsComplete:false` (`signalLimit = candles.length - 1`), while certified historical runs can include it. Existing `live-final-bar.test.mjs` verifies the final-bar contract; the new transport test verifies key rotation preserves the provider's newest returned candle.
- Multi-chunk OHLC assembly deduplicates by timestamp (last fetched chunk wins) and sorts ascending before conversion. Existing chunk tests verify duplicate boundary resolution and deterministic chronology. Parser tests preserve supplied gaps (no interpolation), skip declared `===` markers, reject duplicate siblings, and `runAnalysis` rejects out-of-order timestamps. New adversarial coverage exercises weekend markers, a long missing interval, duplicates, out-of-order input, key rotation after provider-level 429 and all-key rate-limit response.
- Key fallback is stable-order rotation across configured Twelve Data keys. Network and rate-limit failures fall through; the generator has bounded 60s retries and cancellation. Existing retry-cap and chunk tests cover terminal rate-limit behavior.
- EAT bucketing and UTC/EAT boundaries remain covered by the existing EAT/day/week/session tests.

## Large-series benchmark

`tests/adversarial-pipeline-feed.test.mjs` constructs a valid chronological 50,000-bar, 30-minute CSV and calls the production `analyseContinuous` with fail-row omission. Latest observed run: **8.45 seconds**, ~**166 MiB heap delta** (heap delta is not a reliable peak-RSS metric), **1,548 retained result rows**, and all 50,000 bars processed without OOM. Exact fail counts remain present in per-strategy aggregate output. This establishes a practical 50k-bar result, not a formal peak-RSS/80k-bar device benchmark. Backtest takes the memory-saving path at 50k+ lines; its per-day failure-reason breakdown is deliberately suppressed in that path.

## Frozen analyzer findings

No frozen analyzer files were edited. The live-tail, SL-first intrabar ambiguity, adverse gap-stop fill, and OPEN/NO_FILL accounting are covered by existing tests and the new contract suite. No additional analyzer defect was independently reproduced.

## Verification

- `npm ci`: passed under Node v22.22.3; npm audit reported 19 dependency findings (7 moderate, 6 high, 6 critical).
- `npm test`: **215 passed, 0 failed** (latest run includes both adversarial suites and the 50k benchmark).
- `npm run test:golden`: **7 passed, 0 failed** (latest run).
- Freeze command: **2 passed, 0 failed** (latest run).
- `./node_modules/.bin/tsc --noEmit`: sole remaining error is excluded MT5-owned `src/lib/mt5/mt5-store.ts(101,34): TS7006 Parameter 'id' implicitly has an 'any' type.` No other diagnostics remain; the MapGenerator TS2322 is resolved.
