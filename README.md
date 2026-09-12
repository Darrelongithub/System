# Signal Finder Pro — Final Validation Package

## Active production strategies (9)

| ID              | Origin           |
| --------------- | ---------------- |
| dual-thrust     | Locked survivor  |
| macd-cross      | Locked survivor  |
| pdh-retest      | Locked survivor  |
| williams-r-fade | Batch-2 survivor |
| three-soldiers  | Batch-2 survivor |
| morning-star    | Batch-2 survivor |
| classic-pivot   | Batch-2 survivor |
| ichimoku-tk     | Batch-2 survivor |
| donchian-55     | Batch-2 survivor |

Implementation: `src/lib/analyzer/strategies/final-survivors.ts`

Context/diagnostic tools (FVG, Bollinger, Keltner, PDH context, Donchian context, etc.) remain registered as **context** and do not count as trades.

Turtle and Opening-Range-Breakout remain in the codebase as legacy/reference trade strategies but are **not** part of the final 9-candidate research set.

## Dataset used for validation

- File: artifacts reference `baseline-xauusd-ohlc.csv`
- Symbol: XAU/USD
- TF: 30m
- Range: 2025-11-01 → 2026-08-20
- Bars: 9738

## Golden baseline (v1.4)

Production default options: `{ seriesEndsComplete: true, enableHtfDirectionFilter: true, enableFilterC: true }`

- Resolved trades: 2323 (TP 756 / SL 1563 / OPEN 4 / NO_FILL 0)
- Total R: 523.6813503963194

The prior golden (2384 trades / R 507.83) predated the v1.2 A2 consume-after-RR
fix (+3 trades) and the v1.3 Filter C default (−64 trades). See `logs/v1.4-changes.md`.

## Pipeline invariants

- Continuous analysis (`analyseContinuous` / `runAnalysis`)
- Closed candles only (`seriesEndsComplete`)
- Market orders fill at signal-bar close; TP/SL not resolved on fill bar
- Trade vs context separation via `strategy-kind.ts`
- No strategy rule/parameter optimization in this package
- Filter C enabled by default (v1.3) — counter-trend + extreme ATR percentile (≥95%)

## Run

```bash
npm install
npx tsc --noEmit
npm test
npm run dev   # or project-standard start
```

## Artifacts

- `artifacts/baseline-xauusd-ohlc.csv` — locked golden input (9738 rows)
- `artifacts/golden-trades.json` — locked trade table (row-level, 14 fields)
- `artifacts/golden-summary.json` — locked aggregates (per-strategy + totals)
- `artifacts/golden-regression-report.json` — self-consistency report
- `artifacts/strategy-research/` — historical Gemini strategy-research outputs

Regenerate the golden only on a deliberate, documented product change:
`node --experimental-strip-types --import ./tests/register.mjs scripts/generate-golden.mjs`
