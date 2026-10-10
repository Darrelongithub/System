# Part 2 — holdout inventory

**Status: HOLDOUT MISSING / UNUSABLE.** `origin/main` at `b57ccd7e5c62b1290b65e87cfa6d271e307a06de` contains `holdout.zip` (SHA-256 `116ecabc201360ad47903d9b741d9e10b267a5c78a76d6c1ee9e0be3789f7e40`). Its 51 CSV members (48 annual shards plus three consolidated instrument files) all have zero uncompressed bytes. The three required consolidated holdout CSVs are present by name but empty; no README is present in the archive. The archive was extracted under `data/holdout/` without changing any data. No holdout rows, columns, dates, OHLC geometry, duplicates, time gaps or timezone can be determined from empty payloads.

The gold 2020–2026 CSV was copied from `origin/main` and its SHA-256 matches the required `cf393fc399ae63b921ce6d5ebc7de05e4cb7481d51079d2d18c164414cfea1d3`. Under the frozen fallback, no 2004–2019 verdict or holdout causality test is available; only the separately labelled 2020–2026 exploratory cohort may be analyzed.

| Relative path under `data/holdout/` | Bytes | Rows | Columns | First timestamp | Last timestamp | SHA-256 | Duplicate/gap/geometry/timezone checks |
|---|---:|---:|---|---|---|---|---|
| `duka/eurusd/eurusd-m30-bid-2004-01-01-2005-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/eurusd/eurusd-m30-bid-2005-01-01-2006-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/eurusd/eurusd-m30-bid-2006-01-01-2007-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/eurusd/eurusd-m30-bid-2007-01-01-2008-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/eurusd/eurusd-m30-bid-2008-01-01-2009-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/eurusd/eurusd-m30-bid-2009-01-01-2010-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/eurusd/eurusd-m30-bid-2010-01-01-2011-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/eurusd/eurusd-m30-bid-2011-01-01-2012-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/eurusd/eurusd-m30-bid-2012-01-01-2013-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/eurusd/eurusd-m30-bid-2013-01-01-2014-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/eurusd/eurusd-m30-bid-2014-01-01-2015-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/eurusd/eurusd-m30-bid-2015-01-01-2016-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/eurusd/eurusd-m30-bid-2016-01-01-2017-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/eurusd/eurusd-m30-bid-2017-01-01-2018-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/eurusd/eurusd-m30-bid-2018-01-01-2019-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/eurusd/eurusd-m30-bid-2019-01-01-2020-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xagusd/xagusd-m30-bid-2004-01-01-2005-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xagusd/xagusd-m30-bid-2005-01-01-2006-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xagusd/xagusd-m30-bid-2006-01-01-2007-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xagusd/xagusd-m30-bid-2007-01-01-2008-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xagusd/xagusd-m30-bid-2008-01-01-2009-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xagusd/xagusd-m30-bid-2009-01-01-2010-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xagusd/xagusd-m30-bid-2010-01-01-2011-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xagusd/xagusd-m30-bid-2011-01-01-2012-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xagusd/xagusd-m30-bid-2012-01-01-2013-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xagusd/xagusd-m30-bid-2013-01-01-2014-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xagusd/xagusd-m30-bid-2014-01-01-2015-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xagusd/xagusd-m30-bid-2015-01-01-2016-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xagusd/xagusd-m30-bid-2016-01-01-2017-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xagusd/xagusd-m30-bid-2017-01-01-2018-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xagusd/xagusd-m30-bid-2018-01-01-2019-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xagusd/xagusd-m30-bid-2019-01-01-2020-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xauusd/xauusd-m30-bid-2004-01-01-2005-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xauusd/xauusd-m30-bid-2005-01-01-2006-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xauusd/xauusd-m30-bid-2006-01-01-2007-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xauusd/xauusd-m30-bid-2007-01-01-2008-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xauusd/xauusd-m30-bid-2008-01-01-2009-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xauusd/xauusd-m30-bid-2009-01-01-2010-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xauusd/xauusd-m30-bid-2010-01-01-2011-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xauusd/xauusd-m30-bid-2011-01-01-2012-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xauusd/xauusd-m30-bid-2012-01-01-2013-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xauusd/xauusd-m30-bid-2013-01-01-2014-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xauusd/xauusd-m30-bid-2014-01-01-2015-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xauusd/xauusd-m30-bid-2015-01-01-2016-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xauusd/xauusd-m30-bid-2016-01-01-2017-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xauusd/xauusd-m30-bid-2017-01-01-2018-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xauusd/xauusd-m30-bid-2018-01-01-2019-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `duka/xauusd/xauusd-m30-bid-2019-01-01-2020-01-01.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `eurusd_m30_2004_2019.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `xagusd_m30_2004_2019.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
| `xauusd_m30_2004_2019.csv` | 0 | 0 | unavailable | unavailable | unavailable | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | not testable: empty payload |
