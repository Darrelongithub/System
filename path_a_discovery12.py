import pandas as pd
import numpy as np

# Load 4H
df_4h = pd.read_csv('data_archive/XAU_4h_data.csv', sep=';', header=0)
df_4h.columns = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
df_4h['Date'] = pd.to_datetime(df_4h['Date'], format='%Y.%m.%d %H:%M')
df_4h = df_4h.set_index('Date').sort_index()

# Load 1D
df_1d = pd.read_csv('data_archive/XAU_1d_data.csv', sep=';', header=0)
df_1d.columns = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
df_1d['Date'] = pd.to_datetime(df_1d['Date'], format='%Y.%m.%d %H:%M')
df_1d = df_1d.set_index('Date').sort_index()

dev_years = [2004, 2005, 2006, 2007, 2009, 2010, 2011, 2013, 2014, 2015, 2017, 2018]
df_4h_dev = df_4h[df_4h.index.year.isin(dev_years)].copy()
df_1d_dev = df_1d[df_1d.index.year.isin(dev_years)].copy()

# Daily Trend
df_1d_dev['SMA50'] = df_1d_dev['Close'].rolling(50).mean()
df_1d_dev['SMA200'] = df_1d_dev['Close'].rolling(200).mean()
df_1d_dev['Uptrend'] = df_1d_dev['SMA50'] > df_1d_dev['SMA200']
df_1d_dev['Downtrend'] = df_1d_dev['SMA50'] < df_1d_dev['SMA200']

# Map to 4H
df_4h_dev['Date_only'] = df_4h_dev.index.date
df_1d_dev['Date_only'] = df_1d_dev.index.date
# shift D1 by 1 day so we use yesterday's close for trend (no lookahead)
daily_trend = df_1d_dev[['Date_only', 'Uptrend', 'Downtrend']].copy()
daily_trend['Date_only'] = daily_trend['Date_only'] + pd.Timedelta(days=1)

df_4h_dev = df_4h_dev.merge(daily_trend, on='Date_only', how='left')
df_4h_dev.index = df_4h[df_4h.index.year.isin(dev_years)].index

# 4H RSI
delta = df_4h_dev['Close'].diff()
gain = (delta.where(delta > 0, 0)).rolling(14).mean()
loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
rs = gain / loss
df_4h_dev['RSI'] = 100 - (100 / (1 + rs))

def test_pullback_4h(df_data, is_long):
    trades = []
    in_trade = False
    entry_price = 0
    entry_time = None
    
    for i in range(200, len(df_data)):
        bar = df_data.iloc[i]
        
        if not in_trade:
            if is_long and bar['Uptrend'] == True and bar['RSI'] < 30:
                in_trade = True
                if i+1 < len(df_data):
                    entry_price = df_data.iloc[i+1]['Open']
                    entry_time = df_data.index[i+1]
            elif not is_long and bar['Downtrend'] == True and bar['RSI'] > 70:
                in_trade = True
                if i+1 < len(df_data):
                    entry_price = df_data.iloc[i+1]['Open']
                    entry_time = df_data.index[i+1]
        else:
            if is_long and bar['RSI'] > 50:
                if i+1 < len(df_data):
                    exit_price = df_data.iloc[i+1]['Open']
                    exit_time = df_data.index[i+1]
                    ret = (exit_price / entry_price) - 1
                    trades.append({'ret': ret, 'bars': i+1 - df_data.index.get_loc(entry_time)})
                    in_trade = False
            elif not is_long and bar['RSI'] < 50:
                if i+1 < len(df_data):
                    exit_price = df_data.iloc[i+1]['Open']
                    exit_time = df_data.index[i+1]
                    ret = (entry_price / exit_price) - 1
                    trades.append({'ret': ret, 'bars': i+1 - df_data.index.get_loc(entry_time)})
                    in_trade = False
                    
    return pd.DataFrame(trades)

longs = test_pullback_4h(df_4h_dev, True)
shorts = test_pullback_4h(df_4h_dev, False)

print("4H Trend Pullback")
print("Longs:")
print(f"Trades: {len(longs)}, Mean Ret: {longs['ret'].mean():.4%}, WinRate: {(longs['ret']>0).mean():.2%}, Avg Bars: {longs['bars'].mean():.1f}")
print("Shorts:")
print(f"Trades: {len(shorts)}, Mean Ret: {shorts['ret'].mean():.4%}, WinRate: {(shorts['ret']>0).mean():.2%}, Avg Bars: {shorts['bars'].mean():.1f}")

