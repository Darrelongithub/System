# Signal Finder Pro — Final Validation Package

## Active production strategies (9)

| ID | Origin |
|----|--------|
| dual-thrust | Locked survivor |
| macd-cross | Locked survivor |
| pdh-retest | Locked survivor |
| williams-r-fade | Batch-2 survivor |
| three-soldiers | Batch-2 survivor |
| morning-star | Batch-2 survivor |
| classic-pivot | Batch-2 survivor |
| ichimoku-tk | Batch-2 survivor |
| donchian-55 | Batch-2 survivor |

Implementation: `src/lib/analyzer/strategies/final-survivors.ts`

Context/diagnostic tools (FVG, Bollinger, Keltner, PDH context, Donchian context, etc.) remain registered as **context** and do not count as trades.

Turtle and Opening-Range-Breakout remain in the codebase as legacy/reference trade strategies but are **not** part of the final 9-candidate research set.

## Dataset used for validation

- File: artifacts reference `baseline-xauusd-ohlc.csv`
- Symbol: XAU/USD
- TF: 30m
- Range: 2025-11-01 → 2026-08-20
- Bars: 9738

## Pipeline invariants

- Continuous analysis (`analyseContinuous` / `runAnalysis`)
- Closed candles only (`seriesEndsComplete`)
- Market orders fill at signal-bar close; TP/SL not resolved on fill bar
- Trade vs context separation via `strategy-kind.ts`
- No strategy rule/parameter optimization in this package

## Run

```bash
npm install
npx tsc --noEmit
npm run dev   # or project-standard start
```

## Artifacts

- `artifacts/baseline-xauusd-ohlc.csv` (if copied)
- `artifacts/final-validation-report.json`
- `artifacts/robustness-batch2-report.json`
- `artifacts/discovery-batch2-report.json`

