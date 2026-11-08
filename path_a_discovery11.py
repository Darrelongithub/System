import pandas as pd
import numpy as np

df = pd.read_csv('data_archive/XAU_1d_data.csv', sep=';', header=0)
df.columns = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
df['Date'] = pd.to_datetime(df['Date'], format='%Y.%m.%d %H:%M')
df = df.set_index('Date').sort_index()

dev_years = [2004, 2005, 2006, 2007, 2009, 2010, 2011, 2013, 2014, 2015, 2017, 2018]
df_dev = df[df.index.year.isin(dev_years)].copy()

df_dev['SMA50'] = df_dev['Close'].rolling(50).mean()
df_dev['SMA200'] = df_dev['Close'].rolling(200).mean()
df_dev['Uptrend'] = df_dev['SMA50'] > df_dev['SMA200']
df_dev['Downtrend'] = df_dev['SMA50'] < df_dev['SMA200']

delta = df_dev['Close'].diff()
gain = (delta.where(delta > 0, 0)).rolling(14).mean()
loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
rs = gain / loss
df_dev['RSI'] = 100 - (100 / (1 + rs))

# To avoid overlapping positions, we track open trades
def test_pullback(df_data, is_long):
    trades = []
    in_trade = False
    entry_price = 0
    entry_time = None
    
    for i in range(200, len(df_data)):
        bar = df_data.iloc[i]
        
        if not in_trade:
            if is_long and bar['Uptrend'] and bar['RSI'] < 35:
                in_trade = True
                # Enter at next open
                if i+1 < len(df_data):
                    entry_price = df_data.iloc[i+1]['Open']
                    entry_time = df_data.index[i+1]
            elif not is_long and bar['Downtrend'] and bar['RSI'] > 65:
                in_trade = True
                if i+1 < len(df_data):
                    entry_price = df_data.iloc[i+1]['Open']
                    entry_time = df_data.index[i+1]
        else:
            # Exit condition
            if is_long and bar['RSI'] > 50:
                if i+1 < len(df_data):
                    exit_price = df_data.iloc[i+1]['Open']
                    exit_time = df_data.index[i+1]
                    ret = (exit_price / entry_price) - 1
                    trades.append({'ret': ret, 'days': (exit_time - entry_time).days})
                    in_trade = False
            elif not is_long and bar['RSI'] < 50:
                if i+1 < len(df_data):
                    exit_price = df_data.iloc[i+1]['Open']
                    exit_time = df_data.index[i+1]
                    ret = (entry_price / exit_price) - 1
                    trades.append({'ret': ret, 'days': (exit_time - entry_time).days})
                    in_trade = False
                    
    return pd.DataFrame(trades)

longs = test_pullback(df_dev, True)
shorts = test_pullback(df_dev, False)

print("Longs:")
print(f"Trades: {len(longs)}, Mean Ret: {longs['ret'].mean():.4%}, WinRate: {(longs['ret']>0).mean():.2%}, Avg Days: {longs['days'].mean():.1f}")
print("Shorts:")
print(f"Trades: {len(shorts)}, Mean Ret: {shorts['ret'].mean():.4%}, WinRate: {(shorts['ret']>0).mean():.2%}, Avg Days: {shorts['days'].mean():.1f}")

