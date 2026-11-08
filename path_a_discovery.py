import pandas as pd
import numpy as np
from scipy import stats

# Load Daily Data
df = pd.read_csv('data_archive/XAU_1d_data.csv', sep=';', header=0)
df.columns = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
df['Date'] = pd.to_datetime(df['Date'], format='%Y.%m.%d %H:%M')
df = df.set_index('Date').sort_index()

# Permitted Development Data
dev_years = [2004, 2005, 2006, 2007, 2009, 2010, 2011, 2013, 2014, 2015, 2017, 2018]
df_dev = df[df.index.year.isin(dev_years)].copy()

print("--- PATH A: HIGHER-TIMEFRAME DISCOVERY (DEVELOPMENT DATA ONLY) ---")
print(f"Development Data: {len(df_dev)} days")

# 1. Multi-day momentum
df_dev['Ret'] = df_dev['Close'].pct_change()
df_dev['Up'] = (df_dev['Ret'] > 0).astype(int)
df_dev['Down'] = (df_dev['Ret'] < 0).astype(int)

for n in [2, 3, 4, 5]:
    df_dev[f'Up_{n}'] = df_dev['Up'].rolling(n).sum() == n
    df_dev[f'Down_{n}'] = df_dev['Down'].rolling(n).sum() == n
    
    fwd_ret_up = df_dev['Ret'].shift(-1)[df_dev[f'Up_{n}']]
    fwd_ret_down = df_dev['Ret'].shift(-1)[df_dev[f'Down_{n}']]
    
    print(f"\nConsecutive {n} Days Up -> Next Day Ret: Mean={fwd_ret_up.mean():.4%}, WinRate={(fwd_ret_up>0).mean():.2%}, N={len(fwd_ret_up)}")
    print(f"Consecutive {n} Days Down -> Next Day Ret: Mean={fwd_ret_down.mean():.4%}, WinRate={(fwd_ret_down<0).mean():.2%}, N={len(fwd_ret_down)}")

# 2. Mean Reversion to 200 SMA
df_dev['SMA200'] = df_dev['Close'].rolling(200).mean()
df_dev['Dev200'] = (df_dev['Close'] - df_dev['SMA200']) / df_dev['SMA200']

# Let's check future 20-day returns when deviation is extreme
df_dev['Fwd20Ret'] = df_dev['Close'].shift(-20) / df_dev['Close'] - 1

print("\nLong-Term Mean Reversion (200 SMA Deviation -> 20 Day Fwd Ret)")
for thresh in [0.05, 0.10, 0.15]:
    extreme_up = df_dev[df_dev['Dev200'] > thresh]['Fwd20Ret'].dropna()
    extreme_down = df_dev[df_dev['Dev200'] < -thresh]['Fwd20Ret'].dropna()
    
    print(f"Dev > {thresh*100}% -> 20d Fwd Ret: Mean={extreme_up.mean():.4%}, N={len(extreme_up)}")
    print(f"Dev < -{thresh*100}% -> 20d Fwd Ret: Mean={extreme_down.mean():.4%}, N={len(extreme_down)}")

# 3. Volatility Regime Transitions
df_dev['ATR'] = df_dev['High'] - df_dev['Low']
df_dev['ATR14'] = df_dev['ATR'].rolling(14).mean()
df_dev['ATR100'] = df_dev['ATR14'].rolling(100).mean()
df_dev['VolRatio'] = df_dev['ATR14'] / df_dev['ATR100']

df_dev['Fwd5Ret'] = df_dev['Close'].shift(-5) / df_dev['Close'] - 1
df_dev['Fwd5Abs'] = df_dev['Fwd5Ret'].abs()

print("\nVolatility Regimes (ATR14 / ATR100 -> Fwd 5d Absolute Return)")
for thresh in [0.8, 1.0, 1.2, 1.5]:
    low_vol = df_dev[df_dev['VolRatio'] < thresh]['Fwd5Abs'].dropna()
    high_vol = df_dev[df_dev['VolRatio'] >= thresh]['Fwd5Abs'].dropna()
    print(f"VolRatio < {thresh}: Fwd5d Abs Ret = {low_vol.mean():.4%} (N={len(low_vol)})")
    print(f"VolRatio >= {thresh}: Fwd5d Abs Ret = {high_vol.mean():.4%} (N={len(high_vol)})")

