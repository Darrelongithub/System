# FINAL REPORT

Zero strategies passed the rigorous backtesting phase; both XAU-MOM-1H and XAU-SWEEP-ASIA decisively failed with severe negative expectancies and sub-26% win rates. XAU-MACRO-1D, ATR-EXPANSION-20D-BREAKOUT, and XAU-FIX-FADE were marked UNTESTABLE due to structurally thin trade frequencies (<100 trades over 12 years) or missing high-resolution data. Every result generated in this report is strictly EXPLORATORY because the entire 22-year dataset was previously contaminated during hypothesis discovery. A total of 4 strategy trials were run (with 2x cost variants). From these results, you should NOT conclude that the underlying market mechanics (like volatility clustering or stop-loss sweeps) do not exist, only that these specific mechanical translations are completely unviable after accounting for realistic limit fills and spread costs.

## Strategy Summary Tables

### 1. XAU-MOM-1H (FVG Momentum)
| Metric | Result |
|--------|--------|
| **Trades** | 4,768 |
| **Win Rate** | 25.15% |
| **Net Mean R** | -0.3181 R |
| **Average Win / Loss** | +2.87 R / -1.39 R |
| **Day-clustered t** | -6.67 |
| **Excess over Control** | -0.3121 R (t=-2.46) |
| **STATUS** | FAILS (EXPLORATORY) |

### 2. XAU-SWEEP-ASIA (Liquidity Sweep)
| Metric | Result |
|--------|--------|
| **Trades** | 301 |
| **Win Rate** | 25.58% |
| **Net Mean R** | -0.3055 R |
| **Average Win / Loss** | +2.05 R / -1.11 R |
| **Day-clustered t** | -3.37 |
| **Excess over Control** | -0.4968 R (t=-3.86) |
| **STATUS** | FAILS (EXPLORATORY) |

### 3. Untestable Candidates (Structurally Thin or Missing Data)
| Strategy | Reason |
|----------|--------|
| **XAU-MACRO-1D** | UNTESTABLE (Only 13 signals in 12 years) |
| **ATR-EXPANSION-20D** | UNTESTABLE (Only 12 signals in 12 years) |
| **XAU-FIX-FADE** | UNTESTABLE (No M5 or M1 data in archive) |
