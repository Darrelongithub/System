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

for drop in [-0.015, -0.02, -0.025, -0.03]:
    df_dev['Fwd10'] = df_dev['Close'].shift(-10) / df_dev['Close'] - 1
    trades = df_dev[df_dev['Ret'] < drop]['Fwd10'].dropna()
    print(f"Drop < {drop*100}% -> Fwd 10d Mean={trades.mean():.4%}, WinRate={(trades>0).mean():.2%} (N={len(trades)})")

for surge in [0.015, 0.02, 0.025, 0.03]:
    df_dev['Fwd10'] = df_dev['Close'].shift(-10) / df_dev['Close'] - 1
    trades = df_dev[df_dev['Ret'] > surge]['Fwd10'].dropna()
    print(f"Surge > {surge*100}% -> Fwd 10d Mean={trades.mean():.4%}, WinRate={(trades>0).mean():.2%} (N={len(trades)})")

