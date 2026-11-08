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

for n in [3, 5, 10, 15, 20]:
    df_dev[f'Fwd{n}'] = df_dev['Close'].shift(-n) / df_dev['Close'] - 1

print(f"BASELINE MEAN RETURNS:")
for n in [3, 5, 10, 15, 20]:
    baseline = df_dev[f'Fwd{n}'].mean()
    print(f"{n}d: {baseline:.4%}")

print("\n--- TAIL REVERSION EXCESS (Drop < -2%) ---")
for n in [3, 5, 10, 15, 20]:
    trades = df_dev[df_dev['Ret'] < -0.02][f'Fwd{n}'].dropna()
    baseline = df_dev[f'Fwd{n}'].mean()
    excess = trades.mean() - baseline
    print(f"Hold {n} days: Excess={excess:.4%}, N={len(trades)}")

print("\n--- TAIL CONTINUATION EXCESS (Surge > +2%) ---")
for n in [3, 5, 10, 15, 20]:
    trades = df_dev[df_dev['Ret'] > 0.02][f'Fwd{n}'].dropna()
    baseline = df_dev[f'Fwd{n}'].mean()
    excess = trades.mean() - baseline
    print(f"Hold {n} days: Excess={excess:.4%}, N={len(trades)}")

