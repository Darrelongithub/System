# Multi-Market Daily OHLC Dataset Manifest (Phase 2b)

**Date:** 2026-10-05  
**Branch:** `arena/01a107dc-system`  
**Phase:** DATA SOURCING, PHASE 2b (Build and Validate Multi-Market Daily Data; No Strategy Work)  
**Status:** **NO DATA** (No raw files in `data/multimarket/raw/`; external sources unreachable via sandbox network)

---

## 1. Instrument Specifications and Manifest

| ID | Instrument | Asset Class | Primary Symbol & Source | Secondary Symbol & Source | Raw File Name | Primary Timezone | Daily Cut-Off Convention | Return Type | Start Date | End Date | Total Rows | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **EQ-01** | **US500** | Equity Index | Yahoo: `^GSPC` | Dukascopy: `USA500.IDX/USD` | None | America/New_York | 16:00 EST / 21:00 UTC | Price Return (Cash Index) | NO DATA | NO DATA | 0 | **NO DATA** |
| **EQ-02** | **US Tech 100** | Equity Index | Yahoo: `^NDX` | Dukascopy: `USATECH.IDX/USD` | None | America/New_York | 16:00 EST / 21:00 UTC | Price Return (Cash Index) | NO DATA | NO DATA | 0 | **NO DATA** |
| **EQ-03** | **Germany 40** | Equity Index | Yahoo: `^GDAXI` | Dukascopy: `DEU.IDX/EUR` | None | Europe/Berlin | 17:30 CET / 16:30 UTC | Total Return (DAX Performance) | NO DATA | NO DATA | 0 | **NO DATA** |
| **EQ-04** | **UK 100** | Equity Index | Yahoo: `^FTSE` | Dukascopy: `GBR.IDX/GBP` | None | Europe/London | 16:30 GMT / 16:30 UTC | Price Return (Cash Index) | NO DATA | NO DATA | 0 | **NO DATA** |
| **EQ-05** | **Japan 225** | Equity Index | Yahoo: `^N225` | Dukascopy: `JPN.IDX/JPY` | None | Asia/Tokyo | 15:00 JST / 06:00 UTC | Price Return (Cash Index) | NO DATA | NO DATA | 0 | **NO DATA** |
| **RT-01** | **US 10Y Treasury** | Rates | Yahoo: `IEF` (ETF Adj) | Dukascopy: `IEF.US/USD` | None | America/New_York | 16:00 EST / 21:00 UTC | Total Return (Div-Adjusted ETF) | NO DATA | NO DATA | 0 | **NO DATA** |
| **RT-02** | **US 30Y Treasury** | Rates | Yahoo: `TLT` (ETF Adj) | Dukascopy: `TLT.US/USD` | None | America/New_York | 16:00 EST / 21:00 UTC | Total Return (Div-Adjusted ETF) | NO DATA | NO DATA | 0 | **NO DATA** |
| **RT-03** | **Euro Bund** | Rates | Dukascopy: `BUND.TR/EUR` | Eurex: `FGBL` (Req Creds) | None | Europe/Berlin | 17:15 CET / 16:15 UTC | Total Return (Sovereign CFD) | NO DATA | NO DATA | 0 | **NO DATA** |
| **FX-01** | **EURUSD** | FX | Yahoo: `EURUSD=X` | Dukascopy: `EURUSD` | None | UTC / America/New_York | 17:00 NY (DST-aware) | Price Return (Spot OTC) | NO DATA | NO DATA | 0 | **NO DATA** |
| **FX-02** | **GBPUSD** | FX | Yahoo: `GBPUSD=X` | Dukascopy: `GBPUSD` | None | UTC / America/New_York | 17:00 NY (DST-aware) | Price Return (Spot OTC) | NO DATA | NO DATA | 0 | **NO DATA** |
| **FX-03** | **USDJPY** | FX | Yahoo: `JPY=X` | Dukascopy: `USDJPY` | None | UTC / America/New_York | 17:00 NY (DST-aware) | Price Return (Spot OTC) | NO DATA | NO DATA | 0 | **NO DATA** |
| **FX-04** | **AUDUSD** | FX | Yahoo: `AUDUSD=X` | Dukascopy: `AUDUSD` | None | UTC / America/New_York | 17:00 NY (DST-aware) | Price Return (Spot OTC) | NO DATA | NO DATA | 0 | **NO DATA** |
| **FX-05** | **USDCAD** | FX | Yahoo: `CAD=X` | Dukascopy: `USDCAD` | None | UTC / America/New_York | 17:00 NY (DST-aware) | Price Return (Spot OTC) | NO DATA | NO DATA | 0 | **NO DATA** |
| **MT-01** | **Gold** | Metals | Dukascopy: `XAUUSD` | Yahoo: `GC=F` / `XAUUSD=X` | None | UTC / America/New_York | 17:00 NY (DST-aware) | Spot OTC (Duka) / Futures | NO DATA | NO DATA | 0 | **NO DATA** |
| **MT-02** | **Silver** | Metals | Dukascopy: `XAGUSD` | Yahoo: `SI=F` | None | UTC / America/New_York | 17:00 NY (DST-aware) | Spot OTC (Duka) / Futures | NO DATA | NO DATA | 0 | **NO DATA** |
| **MT-03** | **Copper** | Metals | Dukascopy: `COPPER.CMD/USD` | Yahoo: `HG=F` | None | UTC / America/New_York | 17:00 NY (DST-aware) | Commodity CFD (Duka) / Futures | NO DATA | NO DATA | 0 | **NO DATA** |
| **EN-01** | **Brent Crude** | Energy | Dukascopy: `BRENT.CMD/USD` | Yahoo: `BZ=F` | None | UTC / Europe/London | 17:00 NY (DST-aware) | Commodity CFD (Duka) / Futures | NO DATA | NO DATA | 0 | **NO DATA** |

---

## 2. Inventory and Network Reachability Status (Step 0)

1. **Local Raw Files:**  
   Directory `data/multimarket/raw/` does not exist in the working tree. File count: **0**.
2. **Remote Raw Files on `origin/main`:**  
   `git ls-tree -r --name-only origin/main data/multimarket/raw` returned **0** files.
3. **Public Data Feeds:**  
   All external financial data endpoints (`datafeed.dukascopy.com`, `query1.finance.yahoo.com`, `stooq.com`, `fred.stlouisfed.org`) are **UNREACHABLE** due to sandbox firewall restrictions (only npm registry and GitHub API permitted).
4. **Conclusion:**  
   Under Step 0 ("*Instruments with no file and no reachable source are NO DATA. If nothing at all is available, report that and stop*"), all 17 instruments are classified as **NO DATA** and the data pipeline stops without data fabrication.
