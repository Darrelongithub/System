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

## Golden baseline (v1.8.2)

Production default options: `{ seriesEndsComplete: true, enableHtfDirectionFilter: true, enableFilterC: true, enableFilterF: true }`

- Resolved trades: 2286 (TP 750 / SL 1532 / OPEN 4 / NO_FILL 0)
- Total R: 527.6272857378555

v1.8.2 is the **gap-fill fix** (`logs/v1.8.2-gap-fill-resolution.md`): a bar that
opens beyond a tracked stop/target and never trades it had left the position
alive until a later in-bar touch. 52 of the 2,286 trades were priced that way —
including one loser recorded as a +2.41R winner — and they now fill at the
resolving bar's open, the price the market actually offered. Trade count, entry,
stop and target of every row are unchanged; only the exit price and its R move.

Earlier locks: v1.8 = 2286 trades / R 541.3570458970024 (Filter C + Filter F);
v1.4/v1.7 = 2323 trades / R 523.6813503963194 (Filter-C-only, before the
gap-fill fix: 756 TP / 1563 SL). The 2323-book itself followed the v1.2 A2
consume-after-RR fix (+3 trades) and the v1.3 Filter C default (−64 trades).
See `logs/v1.4-changes.md`, `logs/v1.8-changes.md` and
`logs/v1.8.2-gap-fill-resolution.md`.

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
