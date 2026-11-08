import pandas as pd
import numpy as np

# Load Daily Data
df = pd.read_csv('data_archive/XAU_1d_data.csv', sep=';', header=0)
df.columns = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
df['Date'] = pd.to_datetime(df['Date'], format='%Y.%m.%d %H:%M')
df = df.set_index('Date').sort_index()

dev_years = [2004, 2005, 2006, 2007, 2009, 2010, 2011, 2013, 2014, 2015, 2017, 2018]
df_dev = df[df.index.year.isin(dev_years)].copy()

df_dev['Range'] = df_dev['High'] - df_dev['Low']
df_dev['MinRange7'] = df_dev['Range'].rolling(7).min()
df_dev['NR7'] = df_dev['Range'] == df_dev['MinRange7']

df_dev['Fwd1Abs'] = (df_dev['Close'].shift(-1) / df_dev['Close'] - 1).abs()
df_dev['Fwd3Abs'] = (df_dev['Close'].shift(-3) / df_dev['Close'] - 1).abs()
df_dev['Fwd5Abs'] = (df_dev['Close'].shift(-5) / df_dev['Close'] - 1).abs()

print("BASELINE ABS RETURNS")
print(f"1d: {df_dev['Fwd1Abs'].mean():.4%}")
print(f"3d: {df_dev['Fwd3Abs'].mean():.4%}")
print(f"5d: {df_dev['Fwd5Abs'].mean():.4%}")

print("\nNR7 ABS RETURNS")
trades1 = df_dev[df_dev['NR7']]['Fwd1Abs'].dropna()
trades3 = df_dev[df_dev['NR7']]['Fwd3Abs'].dropna()
trades5 = df_dev[df_dev['NR7']]['Fwd5Abs'].dropna()

print(f"1d: {trades1.mean():.4%} (Excess: {trades1.mean() - df_dev['Fwd1Abs'].mean():.4%})")
print(f"3d: {trades3.mean():.4%} (Excess: {trades3.mean() - df_dev['Fwd3Abs'].mean():.4%})")
print(f"5d: {trades5.mean():.4%} (Excess: {trades5.mean() - df_dev['Fwd5Abs'].mean():.4%})")

# We don't have direction yet, this is just volatility expansion.
# Breakout after NR7?
# Next day close > Today High => Buy. 
df_dev['NextClose'] = df_dev['Close'].shift(-1)
df_dev['NextOpen'] = df_dev['Open'].shift(-1)
df_dev['NR7_BO_Up'] = df_dev['NR7'].shift(1) & (df_dev['Close'] > df_dev['High'].shift(1))
df_dev['NR7_BO_Down'] = df_dev['NR7'].shift(1) & (df_dev['Close'] < df_dev['Low'].shift(1))

df_dev['Fwd5'] = df_dev['Close'].shift(-5) / df_dev['Close'] - 1

up_trades = df_dev[df_dev['NR7_BO_Up']]['Fwd5'].dropna()
dn_trades = df_dev[df_dev['NR7_BO_Down']]['Fwd5'].dropna()

print("\nNR7 BREAKOUT DIRECTIONAL")
print(f"BO Up Fwd5 Mean={up_trades.mean():.4%}, N={len(up_trades)}")
print(f"BO Down Fwd5 Mean={dn_trades.mean():.4%}, N={len(dn_trades)}")

