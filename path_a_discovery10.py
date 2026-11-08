import pandas as pd
import numpy as np

# Load Daily Data
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

# RSI 14
delta = df_dev['Close'].diff()
gain = (delta.where(delta > 0, 0)).rolling(14).mean()
loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
rs = gain / loss
df_dev['RSI'] = 100 - (100 / (1 + rs))

# Signal
buy_signal = df_dev['Uptrend'] & (df_dev['RSI'] < 35)
sell_signal = df_dev['Downtrend'] & (df_dev['RSI'] > 65)

for n in [5, 10, 20]:
    df_dev[f'Fwd{n}'] = df_dev['Close'].shift(-n) / df_dev['Close'] - 1

print("RSI Pullback in Trend")
for n in [5, 10, 20]:
    buys = df_dev[buy_signal][f'Fwd{n}'].dropna()
    baseline = df_dev[df_dev['Uptrend']][f'Fwd{n}'].mean()
    print(f"Buy Fwd{n} Mean={buys.mean():.4%} (Excess: {buys.mean()-baseline:.4%}), WR={(buys>0).mean():.2%}, N={len(buys)}")

for n in [5, 10, 20]:
    sells = df_dev[sell_signal][f'Fwd{n}'].dropna()
    baseline = df_dev[df_dev['Downtrend']][f'Fwd{n}'].mean()
    print(f"Sell Fwd{n} Mean={sells.mean():.4%} (Excess: {sells.mean()-baseline:.4%}), WR={(sells<0).mean():.2%}, N={len(sells)}")

