import pandas as pd
import numpy as np

# Load Daily Data
df = pd.read_csv('data_archive/XAU_1d_data.csv', sep=';', header=0)
df.columns = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
df['Date'] = pd.to_datetime(df['Date'], format='%Y.%m.%d %H:%M')
df = df.set_index('Date').sort_index()

dev_years = [2004, 2005, 2006, 2007, 2009, 2010, 2011, 2013, 2014, 2015, 2017, 2018]
df_dev = df[df.index.year.isin(dev_years)].copy()

df_dev['Ret'] = df_dev['Close'].pct_change()
df_dev['Down'] = (df_dev['Ret'] < 0).astype(int)
df_dev['Down3'] = df_dev['Down'].rolling(3).sum() == 3

# Strategy: Buy at close of 3rd down day, hold for 5 days
df_dev['Fwd5'] = df_dev['Close'].shift(-5) / df_dev['Close'] - 1

trades = df_dev[df_dev['Down3']]['Fwd5'].dropna()
print(f"3 Days Down -> Fwd 5d Return: Mean={trades.mean():.4%} (N={len(trades)})")

df_dev['Down4'] = df_dev['Down'].rolling(4).sum() == 4
trades4 = df_dev[df_dev['Down4']]['Fwd5'].dropna()
print(f"4 Days Down -> Fwd 5d Return: Mean={trades4.mean():.4%} (N={len(trades4)})")

# Let's check deviation from 200 SMA
df_dev['SMA200'] = df_dev['Close'].rolling(200).mean()
df_dev['Dev200'] = (df_dev['Close'] - df_dev['SMA200']) / df_dev['SMA200']

# Dev < -10% AND Down3
trades_dev = df_dev[(df_dev['Dev200'] < -0.10) & df_dev['Down3']]['Fwd5'].dropna()
print(f"Dev < -10% & 3 Days Down -> Fwd 5d Return: Mean={trades_dev.mean():.4%} (N={len(trades_dev)})")
