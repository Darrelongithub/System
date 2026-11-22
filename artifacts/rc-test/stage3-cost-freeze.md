# Stage 3 — Spreads & cost model (frozen, pre-trade)
**Status:** FROZEN (before any trade). All measurements come from the lab branch `origin/arena/072665f9-system` (READ-ONLY; never modified).
**Date:** 2026-11-21/22.

## Data sources (read-only)
- `scripts/map-compass/cost-model.json` — frozen G0: stopAtrMultiple=1.5; slippage 0.02 ATR/side baseline, 2x stress; lowMax 0.0006 / highMin 0.0016; baselineCostR 0.11897 (stress 0.28431); matchedMinutes 851,640.
- `scripts/map-compass/spread-table.json` — 44 sampled months 2010→2026 (NOT continuous); convention spread = ask.close − bid.close, round-trip (half entry / half exit).
- `scripts/map-compass/lib/cost.mjs` — volRegimeOf uses range/close; spread lookup throws on missing cell (no silent fallback).
- `scripts/map-compass/lib/trade.mjs` — random baseline + exit harness: 1.5 ATR stop, 2R target, maxBars=96 (TIME_EXIT), gap-through fill at bar open, same cost, conservatively SL on same-candle tie.

## Cost rule (frozen)
- `sessionOfDatetime` (EAT, mirrors src/lib/analyzer/time.ts exactly): asian 01:00–10:59 / london 11:00–15:59 / else ny.
- `volRegimeOf(bar)`: range/close < 0.0006 → low; < 0.0016 → mid; else high.
- `spreadOverAtr(session, vol)` = medianSpreadOverAtr (baseline) | p95SpreadOverAtr (stress).
- Measured years → lab cells (baseline = median + 1x slippage; the verdict uses baseline).
- **Unmeasured years → conservative session-dependent floor:** worst-regime p95 spread for the session (MAX of the three vol cells' p95SpreadOverAtr), 1× slippage. NEVER flat 1.85 bps.
- Measured years (per 44 spread-table months, 2010→2026): 2010, 2011, 2012, 2013, 2014, 2015, 2018, 2020, 2021, 2022, 2023, 2024, 2025, 2026.
- Unmeasured years: 2004, 2005, 2006, 2007, 2008, 2009, 2016, 2017, 2019.
  - (Note: the protocol wording listed "2004–2009, 2012–2017, 2019"; the honest classification from the lab measurement set is above. Divergence logged in QUESTIONS.md Q6.)
- `costR = (spreadOverAtr + 2 × 0.02 × slippageMultiplier) × ATR14 / riskPrice` where riskPrice = |entry_postSpread − SL| (actual trade risk in the engine's units).
- Baseline = slippageMultiplier 1 (used for the verdict); stress = 2 (diagnostic only, M9).

## What Stage 4 uses
- Primary verdict: engine rMultiple (gross of the measured cost, fixed $0.20 embedded) − measured costR (netR_measured). Engine's embedded $0.20 spread is ~0.01R; double-counting is negligible and documented. 2x-cost lens: engine rMultiple − 2 × measured costR.
- The engine is NOT modified or re-run; the overlay is subtractive.
- PASS bar: see Stage 4 doc.

## Files
- `scripts/rc-test-frozen-cost.mjs` — the overlay (session/vol/year → costR)
- Frozen by `artifacts/rc-test/stage4-verdict-freeze.md` (Stage 4).
