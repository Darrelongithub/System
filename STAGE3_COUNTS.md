# STAGE 3: SIGNAL AND TRADE COUNTS

## Allowed Data Window
Years: 2004-2007, 2009-2011, 2013-2015, 2017-2018 (12 years total).

## 1. XAU-MOM-1H
- **Total Signals:** 6,616
- **Expected Trades (Max 3 Rule):** ~5,997
- **Status:** **TESTABLE**

## 2. XAU-MACRO-1D
- **Total Signals (Crosses):** 13
- **Status:** **UNTESTABLE (Structurally Thin)**. Less than 100 trades over the allowed data.

## 3. XAU-SWEEP-ASIA
- **Total Signals:** 351 (Short: 200, Long: 151)
- **Expected Trades (1 per day max):** 307
- **Status:** **TESTABLE**

## 4. ATR-EXPANSION-20D-BREAKOUT
- **Total Signals:** 12 (Long: 7, Short: 5)
- **Status:** **UNTESTABLE (Structurally Thin)**. Less than 100 trades over the allowed data.

## 5. XAU-FIX-FADE
- **Status:** **UNTESTABLE**. No M1 or M5 data available in the archive.

## Overlap & Integrity Checks
- **Overlap:** Negligible. The two testable strategies operate on different timeframes (H1 vs M15) and different structural triggers (FVG vs Session Sweep).
- **No-Lookahead Test:** Passed. Signal generation relies strictly on `.shift()` operations and historical rolling windows. Mutating future bars does not alter historical signals.
- **Hand-Computed Trade Test:** Passed. Manual verification of a sample FVG and Sweep setup confirms gap-through logic and stop-loss placement align with the frozen specifications.
