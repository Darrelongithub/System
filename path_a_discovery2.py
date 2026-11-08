import pandas as pd
import numpy as np

# Load Daily Data
df = pd.read_csv('data_archive/XAU_1d_data.csv', sep=';', header=0)
df.columns = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
df['Date'] = pd.to_datetime(df['Date'], format='%Y.%m.%d %H:%M')
df = df.set_index('Date').sort_index()

# Permitted Development Data
dev_years = [2004, 2005, 2006, 2007, 2009, 2010, 2011, 2013, 2014, 2015, 2017, 2018]
df_dev = df[df.index.year.isin(dev_years)].copy()

df_dev['High20'] = df_dev['High'].shift(1).rolling(20).max()
df_dev['Low20'] = df_dev['Low'].shift(1).rolling(20).min()

df_dev['ATR'] = df_dev['High'] - df_dev['Low']
df_dev['ATR14'] = df_dev['ATR'].rolling(14).mean()
df_dev['ATR100'] = df_dev['ATR14'].rolling(100).mean()
df_dev['VolRatio'] = df_dev['ATR14'] / df_dev['ATR100']

# Breakout signals
bo_up = df_dev['Close'] > df_dev['High20']
bo_down = df_dev['Close'] < df_dev['Low20']

# Look at forward 10-day and 20-day returns
df_dev['Fwd10'] = df_dev['Close'].shift(-10) / df_dev['Close'] - 1

print("--- BREAKOUTS filtered by VolRatio ---")
for v in [0.8, 1.0, 1.2]:
    up_trades = df_dev[bo_up & (df_dev['VolRatio'] > v)]['Fwd10'].dropna()
    dn_trades = df_dev[bo_down & (df_dev['VolRatio'] > v)]['Fwd10'].dropna()
    print(f"Vol > {v}: BO Up Fwd10 Mean={up_trades.mean():.4%} (N={len(up_trades)}), BO Down Fwd10 Mean={dn_trades.mean():.4%} (N={len(dn_trades)})")
    
for v in [0.8, 1.0, 1.2]:
    up_trades = df_dev[bo_up & (df_dev['VolRatio'] < v)]['Fwd10'].dropna()
    dn_trades = df_dev[bo_down & (df_dev['VolRatio'] < v)]['Fwd10'].dropna()
    print(f"Vol < {v}: BO Up Fwd10 Mean={up_trades.mean():.4%} (N={len(up_trades)}), BO Down Fwd10 Mean={dn_trades.mean():.4%} (N={len(dn_trades)})")

