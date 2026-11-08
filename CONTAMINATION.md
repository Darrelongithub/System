# STAGE 1: DATA AND CONTAMINATION MAP

## A. Data Inventory & Timezone Analysis
- **Source/Instrument:** XAUUSD (Gold vs US Dollar). Typical broker data format (OHLCV). Source unspecified but matches standard retail MT4/MT5 historical exports.
- **Timeframes Found:** M15, M30, H1, H4, D1, Monthly. (No M5 or M1 data exists in the archive).
- **Format:** `YYYY.MM.DD HH:MM;Open;High;Low;Close;Volume`. Mid or Bid/Ask is not explicitly marked, but typically this format represents Bid prices.
- **First Timestamp:** 2004-06-11 00:00:00 (Daily file).
- **Last Timestamp:** 2026-01-30 23:45:00 (M15 file).
- **Rows:** M15 (494,235), M30 (248,912), H1 (125,206), H4 (32,960), D1 (5,531).
- **Gaps > 5 Business Days:** 2 gaps detected in the Daily data.
- **Timezone Determination:** 
  - *Empirical Evidence:* The peak intraday volatility hours in H1 data are 15:00 and 16:00 across both Winter (Nov-Feb) and Summer (May-Aug). The first trading hour of the week consistently prints at 01:00 on Mondays. 
  - *Deduction:* US macroeconomic data releases (08:30 NY time) and US market open (09:30 NY time) occur at 15:30 and 16:30 server time, respectively, *year-round*. The Monday open at 01:00 corresponds perfectly to 18:00 NY time (Sunday).
  - *Conclusion:* The data uses the **New York Close timezone (EET: UTC+2 in winter / EEST: UTC+3 in summer)**. All strategy logic relying on specific times (e.g., London Fix) must be mapped against this dynamic timezone.

## B. Contamination Map
- **2004 to 2026-01-30:** **USED-FOR-DISCOVERY**
- *Honest Assessment:* Because the entire `archive.zip` dataset spanning 2004 through January 2026 was present in the workspace and examined during the Master Research stages to extract findings, test hypotheses, and audit performance, *no part of this data is clean*. Every single year has been contaminated by lookahead bias and selection bias. 
- *Conclusion:* Therefore, all historical results generated in these tests are strictly **EXPLORATORY**. They cannot support any confirmation claim or establish a definitive edge. Any positive outcome merely makes a strategy a candidate for future forward-testing on truly unseen data.
