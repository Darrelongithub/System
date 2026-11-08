# HIGHER-TIMEFRAME STRATEGY SPECIFICATIONS (FROZEN)

## Freeze Timestamp
2026-11-08 17:35:00 UTC

## General Definitions
- **Instrument:** XAUUSD.
- **Pip and Tick:** 1 pip = $0.10. 1 tick = $0.01.
- **Execution Rule:** Signals are generated at bar CLOSE. Orders execute at the next bar's OPEN with spread applied. Stop and target orders assume gap-through fills at the open if breached.
- **Costs (Conservative Model for Daily Timeframe):** 
  - Spread applied at execution (assumed 20 ticks / $0.20 for standard US/London overlap open, but dynamically pulled if modeling exact hour). For Daily bars opening at rollover (00:00 EET), spread is assumed 100 ticks ($1.00).
  - Swap/Financing: -$0.05 per day for Longs, -$0.02 per day for Shorts.
- **Position Limits:** 
  - Donchian: 1 position. Reverses on opposite signal.
  - Tail Reversion: 1 position at a time (block new signals while in a trade).
- **Pass Bars:** 
  - Net mean > +0.10R.
  - Positive expectancy on sealed data.

## Strategy 1: XAU-DONCHIAN-20D (Trend Persistence)
- **Timeframe:** D1
- **R (Risk):** 2 * ATR(14) at entry.
- **Entry Long:** If D1 Close > 20-day High. Execute Market Buy at next D1 Open.
- **Entry Short:** If D1 Close < 20-day Low. Execute Market Sell at next D1 Open.
- **Exit Long:** 
  - Stop Loss: 2 * ATR(14) trailing stop (calculated from the highest close since entry).
  - Structural Exit: Close position if D1 Close < 10-day Low.
- **Exit Short:**
  - Stop Loss: 2 * ATR(14) trailing stop (calculated from the lowest close since entry).
  - Structural Exit: Close position if D1 Close > 10-day High.

## Strategy 2: XAU-TAIL-REVERSION-15D (Post-Crash Drift)
- **Timeframe:** D1
- **R (Risk):** 2 * ATR(14) at entry.
- **Entry:** If D1 Return (Close to Close) < -1.5% (-0.015). Execute Market Buy at next D1 Open.
- **Exit:**
  - Stop Loss: 2 * ATR(14) static stop loss from entry price.
  - Time Exit: Exactly 15 days (bars) after entry bar. Exit at market open of the 16th day.
