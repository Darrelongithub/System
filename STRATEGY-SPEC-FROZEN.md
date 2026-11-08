# STRATEGY SPECIFICATIONS (FROZEN)

## Freeze Timestamp
2026-11-08 17:15:00 UTC

## General Definitions & Fixes
- **Pip and Tick (XAUUSD):** A "pip" is defined as $0.10 (e.g., 2000.00 to 2000.10). A "tick" or point is defined as $0.01 (e.g., 2000.00 to 2000.01).
- **Execution Rule:** All signals are generated at a bar CLOSE. Orders are executed no earlier than the next bar. Market orders are executed at the next bar's OPEN with spread applied. Stop and target orders assume a gap-through fill at the open if the open price gaps past the order level.
- **Costs (Conservative Model):** Spread is session-dependent based on EET/EEST broker time:
  - 00:00 - 08:00 (Asia): 40 ticks ($0.40)
  - 08:00 - 23:00 (London/NY): 20 ticks ($0.20)
  - 23:00 - 00:00 (Rollover): 100 ticks ($1.00)
- **Swap/Financing:** -$0.05 per day for Longs, -$0.02 per day for Shorts. Applied at 00:00 broker time. (Source: Conservative retail broker averages, e.g., IC Markets, as of late 2025/2026).
- **Cost Stress:** A 2x cost stress variant is pre-registered (doubling spreads and swaps).
- **Position Limits:** One position per strategy at a time, unless explicitly defined otherwise.
- **Pass Bars (CANDIDATE FOR FORWARD TESTING):**
  - ALL must hold: >= 100 trades.
  - Net mean > +0.10R (or daily-return equivalent) with a day-clustered t > 2.
  - Excess over a matched random-entry control (same session, side, exit rule, cost) > 0 with day-clustered t > 2.
  - No single year contributes > 50% of the profit.
  - >= 75% of leave-one-year-out windows are positive.
  - Positive net return after the 2x cost stress.
  - *Note: Because data is contaminated, passing only makes it a candidate, never confirmed.*

## Strategy 1: XAU-MOM-1H (FVG Momentum)
- **Timeframe:** H1
- **R (Risk):** Distance from Entry to Stop-Loss.
- **Cost per round trip in R:** Approx. 0.05R to 0.20R depending on gap size.
- **Entry:** Bullish FVG (Candle 1 High < Candle 3 Low, Candle 2 is bullish). Limit Buy at Candle 3 Low. 
- **Fill Rule:** Entry occurs ONLY if price trades *through* the limit price by at least 1 tick ($0.01) plus half the spread of the active session. Never assume a fill at the exact touch. First re-entry only.
- **Exit:** 
  - Stop-Loss: 10 ticks ($0.10) below Candle 2 Low. (Triggered if Low <= Stop).
  - Time Exit: Exactly 12 bars after the entry bar. Market close at the open of the 13th bar.
- **Portfolio Book:** Max 3 simultaneous positions. Sizing: 1% risk per position. Priority: First in time. If simultaneous signals, prioritize the one with the highest limit entry price.

## Strategy 2: XAU-MACRO-1D (SMA 50/200)
- **Timeframe:** D1
- **R Definition:** No fixed stop. Performance defined as a daily percentage return net of costs, compared against Buy-and-Hold and a random-timing placebo.
- **Entry:** Long if D1 50 SMA > 200 SMA; Short if 50 SMA < 200 SMA. Signal at D1 Close, execute at next D1 Open.
- **Exit:** Reverse position on SMA cross. Continuous exposure.

## Strategy 3: XAU-SWEEP-ASIA (Asia Session Liquidity Sweep)
- **Timeframe:** M15
- **R (Risk):** Distance from Entry to Stop-Loss.
- **Cost per round trip in R:** Approx. 0.05R to 0.15R depending on wick size.
- **Setup:** Record Highest High and Lowest Low between 00:00 and 06:00 EET/EEST.
- **Entry:** Between 07:00 and 10:00 EET/EEST, if price pierces the Asia High by >= 10 pips ($1.00) and the M15 candle CLOSES back inside the Asia range (< Asia High), enter Short at the next open. (Inverse for Long).
- **Exit:**
  - Stop-Loss: 10 ticks ($0.10) beyond the newly formed rejection wick extreme.
  - Take-Profit: The opposite side of the Asia session range (e.g., Asia Low for a Short).

## Strategy 4: XAU-FIX-FADE (London Fix Reversion)
- **Timeframe:** M5 or M1.
- **Rule Fix:** The LBMA Gold Price PM auction is at 15:00 London time (14:00 UTC in British Summer Time, 15:00 UTC in winter). Verified via ICE Benchmark Administration (https://www.theice.com/iba/lbma-gold-price).
- **Status:** **UNTESTABLE**. The data archive contains no M5 or M1 data. Testing this on M15 or H1 is structurally impossible.

## Strategy 5: ATR-EXPANSION-20D-BREAKOUT (Formerly XAU-GARCH-BO)
- **Name Change:** Renamed because it contains no GARCH. Signal overlap with a standard 20-day-high breakout will be explicitly reported.
- **Timeframe:** D1
- **R (Risk):** 3 * 14-day ATR at entry.
- **Cost per round trip in R:** Approx. 0.01R (very wide stops make transaction costs negligible in R terms).
- **Entry:** 14-day ATR expands by > 50% relative to its 50-day MA. AND Price closes at a 20-day high (Long) or 20-day low (Short). Execute at next D1 Open.
- **Exit:** Trailing Stop-Loss at 3 * 14-day ATR from the highest high (for Longs) or lowest low (for Shorts) since entry.

## Trial Count
Total registered strategy variants to be tested: 4 (MOM-1H, MACRO-1D, SWEEP-ASIA, ATR-EXPANSION-20D). FIX-FADE is untestable. No extra variants will be added.
