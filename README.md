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

## Golden baseline (v1.8)

Production default options: `{ seriesEndsComplete: true, enableHtfDirectionFilter: true, enableFilterC: true, enableFilterF: true }`

- Resolved trades: 2286 (TP 751 / SL 1531 / OPEN 4 / NO_FILL 0)
- Total R: 541.3570458970024

The prior golden (2323 trades / R 523.6813503963194) was the v1.4 Filter-C-only
default; Filter F removes 37 more counter-trend momentum bars and lifts the book
by +17.7 R after slot refills. The 2323-book itself followed the v1.2 A2
consume-after-RR fix (+3 trades) and the v1.3 Filter C default (−64 trades).
See `logs/v1.4-changes.md` and `logs/v1.8-changes.md`.

## What this project is

**Loss-reduction / trade-quality research on an existing system** — not strategy discovery.
The loop is: existing strategy signal → identify a genuine bad-trade condition → reject that
candidate → measure the effect on the entire resulting trade book. The live analyzer is the
product; the backtest is a historical replay of the live decision process; the golden baseline
is the development/regression laboratory. See `PROJECT-CHARTER.md` and `FORWARD-VALIDATION.md`.

## Pipeline invariants

- Continuous analysis (`analyseContinuous` / `runAnalysis`)
- Closed candles only (`seriesEndsComplete`)
- Market orders fill at signal-bar close; TP/SL not resolved on fill bar
- Trade vs context separation via `strategy-kind.ts`
- No strategy rule/parameter optimization in this package
- Filter C enabled by default (v1.3) — counter-trend + extreme ATR percentile (≥95%)
- Filter F enabled by default (v1.8) — counter-trend bar closing on its high (body ≥80%, upper wick ≤2%);
  a **provisional loss-reduction hypothesis**, still to be forward-validated
- Production analysis requires ≥1,000 bars (measured warm-up floor) and a series that passes the
  series contract (swing refs resolve, trend distribution not collapsed)
- Hindsight-derived columns (`similar_swing_retrace_pct`, `similar_swing_continued_pct`,
  `swing_invalidated`) are computed from later bars and are never used by the trade engine or the
  status engine; they exist only for offline analysis. The AI verifier that used to consume this
  CSV has been removed — analysis is fully local and deterministic.
- The rule set is frozen (`tests/ruleset-freeze.test.mjs`); changing it is a product decision
  that starts a new forward-validation window

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
