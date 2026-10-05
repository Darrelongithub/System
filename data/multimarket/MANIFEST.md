# Multi-Market Daily OHLC Dataset Manifest

This manifest documents the target universe of 17 instruments across 5 asset classes for Phase 2 data sourcing, specifying symbols, data providers, endpoints, timezones, close conventions, documented start dates, and instrument types.

---

## 1. Instrument Universe Specification

| ID | Instrument | Asset Class | Primary Source & Symbol | Second Source & Symbol | Primary Timezone | Close Convention | Documented Start Date | Instrument Type | Sourcing Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **EQ-01** | **US500** | Equity Index | Yahoo: `^GSPC` | Dukascopy: `USA500.IDX/USD` | America/New_York | 16:00 EST / 21:00 UTC | Yahoo: 1927-12-30; Duka: 2011-09-19 | Cash Index (Primary) / CFD (Sec) | CAVEAT (Network Unreachable) |
| **EQ-02** | **US Tech 100** | Equity Index | Yahoo: `^NDX` | Dukascopy: `USATECH.IDX/USD` | America/New_York | 16:00 EST / 21:00 UTC | Yahoo: 1985-10-01; Duka: 2011-09-19 | Cash Index (Primary) / CFD (Sec) | CAVEAT (Network Unreachable) |
| **EQ-03** | **Germany 40** | Equity Index | Yahoo: `^GDAXI` | Dukascopy: `DEU.IDX/EUR` | Europe/Berlin | 17:30 CET / 16:30 UTC | Yahoo: 1987-12-30; Duka: 2012-01-19 | Performance Cash Index / CFD | CAVEAT (Network Unreachable) |
| **EQ-04** | **UK 100** | Equity Index | Yahoo: `^FTSE` | Dukascopy: `GBR.IDX/GBP` | Europe/London | 16:30 GMT / 16:30 UTC | Yahoo: 1984-01-03; Duka: 2011-09-19 | Price Return Cash Index / CFD | CAVEAT (Network Unreachable) |
| **EQ-05** | **Japan 225** | Equity Index | Yahoo: `^N225` | Dukascopy: `JPN.IDX/JPY` | Asia/Tokyo | 15:00 JST / 06:00 UTC | Yahoo: 1950-04-04; Duka: 2011-09-19 | Price Return Cash Index / CFD | CAVEAT (Network Unreachable) |
| **RT-01** | **US 10Y Treasury** | Rates | Yahoo: `IEF` (ETF Adj) / `ZN=F` | Dukascopy: `IEF.US/USD` | America/New_York | 16:00 EST / 21:00 UTC | Yahoo: 2002-07-30; Duka: 2018-02-01 | Total Return ETF / Futures | CAVEAT (Rolls on ZN; Network Unreachable) |
| **RT-02** | **US 30Y Treasury** | Rates | Yahoo: `TLT` (ETF Adj) / `ZB=F` | Dukascopy: `TLT.US/USD` | America/New_York | 16:00 EST / 21:00 UTC | Yahoo: 2002-07-30; Duka: 2017-01-23 | Total Return ETF / Futures | CAVEAT (Rolls on ZB; Network Unreachable) |
| **RT-03** | **Euro Bund** | Rates | Dukascopy: `BUND.TR/EUR` | Eurex: `FGBL` (Req Creds) | Europe/Berlin | 17:15 CET / 16:15 UTC | Duka: 2016-02-05; Yahoo: None | Total Return CFD / Futures | NO SOURCE (Yahoo none; Duka Unreachable) |
| **FX-01** | **EURUSD** | Foreign Exchange | Yahoo: `EURUSD=X` | Dukascopy: `EURUSD` | UTC / America/New_York | 17:00 EST / 22:00 UTC | Yahoo: 2003-12-01; Duka: 2003-05-04 | Spot FX (OTC) | CAVEAT (Network Unreachable) |
| **FX-02** | **GBPUSD** | Foreign Exchange | Yahoo: `GBPUSD=X` | Dukascopy: `GBPUSD` | UTC / America/New_York | 17:00 EST / 22:00 UTC | Yahoo: 2003-12-01; Duka: 2003-05-05 | Spot FX (OTC) | CAVEAT (Network Unreachable) |
| **FX-03** | **USDJPY** | Foreign Exchange | Yahoo: `JPY=X` | Dukascopy: `USDJPY` | UTC / America/New_York | 17:00 EST / 22:00 UTC | Yahoo: 1996-10-30; Duka: 2003-05-05 | Spot FX (OTC) | CAVEAT (Network Unreachable) |
| **FX-04** | **AUDUSD** | Foreign Exchange | Yahoo: `AUDUSD=X` | Dukascopy: `AUDUSD` | UTC / America/New_York | 17:00 EST / 22:00 UTC | Yahoo: 2003-12-01; Duka: 2003-08-03 | Spot FX (OTC) | CAVEAT (Network Unreachable) |
| **FX-05** | **USDCAD** | Foreign Exchange | Yahoo: `CAD=X` | Dukascopy: `USDCAD` | UTC / America/New_York | 17:00 EST / 22:00 UTC | Yahoo: 2003-09-17; Duka: 2003-08-04 | Spot FX (OTC) | CAVEAT (Network Unreachable) |
| **MT-01** | **Gold** | Commodities (Metals) | Dukascopy: `XAUUSD` | Yahoo: `GC=F` / `XAUUSD=X` | UTC / America/New_York | 17:00 EST / 22:00 UTC | Duka: 2003-05-04; Yahoo: 2000-08-30 | Spot OTC (Duka) / Continuous Futures | CAVEAT (Rolls on GC; Network Unreachable) |
| **MT-02** | **Silver** | Commodities (Metals) | Dukascopy: `XAGUSD` | Yahoo: `SI=F` | UTC / America/New_York | 17:00 EST / 22:00 UTC | Duka: 2003-05-05; Yahoo: 2000-08-30 | Spot OTC (Duka) / Continuous Futures | CAVEAT (Rolls on SI; Network Unreachable) |
| **MT-03** | **Copper** | Commodities (Metals) | Dukascopy: `COPPER.CMD/USD` | Yahoo: `HG=F` | UTC / America/New_York | 17:00 EST / 22:00 UTC | Duka: 2012-03-01; Yahoo: 2000-08-30 | CFD Commodity (Duka) / Continuous Futures | CAVEAT (Rolls on HG; Network Unreachable) |
| **EN-01** | **Brent Crude** | Commodities (Energy) | Dukascopy: `BRENT.CMD/USD` | Yahoo: `BZ=F` | UTC / Europe/London | 19:30 GMT / 14:30 EST | Duka: 2011-09-20; Yahoo: 2007-07-30 | CFD Commodity (Duka) / Continuous Futures | CAVEAT (Rolls on BZ; Network Unreachable) |

---

## 2. Source Endpoints & Network Access Policy

1. **Yahoo Finance Public Endpoints:**
   - Chart API URL: `https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?interval=1d&range=max`
   - Download CSV URL: `https://query1.finance.yahoo.com/v7/finance/download/{SYMBOL}?period1=0&period2=9999999999&interval=1d&events=history`
   - Access: Requires no API key.
   - Status in Execution Sandbox: **UNREACHABLE** (TCP connection reset / TLS syscall error: firewall restricted).

2. **Dukascopy Public Datafeed:**
   - Feed Base URL: `https://datafeed.dukascopy.com/datafeed/{INSTRUMENT}/{YEAR}/{MONTH}/{DAY}/...`
   - Catalog Reference: `https://tickstory.com/dukascopy-historical-data-available-date-ranges/`
   - Access: Requires no API key or credentials.
   - Status in Execution Sandbox: **UNREACHABLE** (TCP connection reset / TLS syscall error: firewall restricted).

3. **Stooq Free Daily Data:**
   - URL: `https://stooq.com/q/d/l/?s={symbol}&i=d`
   - Access: Requires no API key.
   - Status in Execution Sandbox: **UNREACHABLE** (TCP connection reset / TLS syscall error: firewall restricted).

4. **FRED (Federal Reserve Bank of St. Louis):**
   - URL: `https://fred.stlouisfed.org/graph/fredgraph.csv?id={SERIES_ID}`
   - Access: Requires no API key for direct CSV download.
   - Status in Execution Sandbox: **UNREACHABLE** (TCP connection reset / TLS syscall error: firewall restricted).

---

## 3. Daily Cut-Off and Timestamp Alignment Protocol

To prevent lookahead and synchronization skew across global timezones:
- **Global Cut-off Convention:** 17:00 New York Wall Clock (ET).
- In UTC terms, this corresponds to:
  - 21:00 UTC during US Daylight Saving Time (EDT, UTC-4).
  - 22:00 UTC during US Standard Time (EST, UTC-5).
- All FX pairs and 24-hour commodities naturally close their daily session at 17:00 NY ET.
- Equity indices close at their respective local market close:
  - US500, US Tech 100: 16:00 ET (fully contained within the 17:00 NY daily bar).
  - Germany 40: 17:30 CET (11:30 ET / 16:30 UTC, fully contained).
  - UK 100: 16:30 GMT (11:30 ET / 16:30 UTC, fully contained).
  - Japan 225: 15:00 JST (02:00 ET / 06:00 UTC, trading precedes the NY day).
- Weekly alignment: Friday close to Friday close across all instruments.
