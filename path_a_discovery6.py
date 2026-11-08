import pandas as pd
import numpy as np

# Load Daily Data
df = pd.read_csv('data_archive/XAU_1d_data.csv', sep=';', header=0)
df.columns = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
df['Date'] = pd.to_datetime(df['Date'], format='%Y.%m.%d %H:%M')
df = df.set_index('Date').sort_index()

dev_years = [2004, 2005, 2006, 2007, 2009, 2010, 2011, 2013, 2014, 2015, 2017, 2018]
df_dev = df[df.index.year.isin(dev_years)].copy()

# Bollinger Band Width
df_dev['MA20'] = df_dev['Close'].rolling(20).mean()
df_dev['STD20'] = df_dev['Close'].rolling(20).std()
df_dev['BBW'] = (df_dev['STD20'] * 4) / df_dev['MA20']

# 100-day rank of BBW (percentile)
df_dev['BBW_Rank'] = df_dev['BBW'].rolling(100).apply(lambda x: pd.Series(x).rank(pct=True).iloc[-1])

# Volatility Compression = BBW_Rank < 0.10 (lowest 10% of last 100 days)
df_dev['Compression'] = df_dev['BBW_Rank'] < 0.10

# Breakout from compression
df_dev['High20'] = df_dev['High'].shift(1).rolling(20).max()
df_dev['Low20'] = df_dev['Low'].shift(1).rolling(20).min()

bo_up = (df_dev['Close'] > df_dev['High20']) & df_dev['Compression']
bo_down = (df_dev['Close'] < df_dev['Low20']) & df_dev['Compression']

df_dev['Fwd20'] = df_dev['Close'].shift(-20) / df_dev['Close'] - 1

up_trades = df_dev[bo_up]['Fwd20'].dropna()
dn_trades = df_dev[bo_down]['Fwd20'].dropna()

print(f"Compression BO Up -> 20d Fwd Mean={up_trades.mean():.4%}, WinRate={(up_trades>0).mean():.2%} (N={len(up_trades)})")
print(f"Compression BO Down -> 20d Fwd Mean={dn_trades.mean():.4%}, WinRate={(dn_trades<0).mean():.2%} (N={len(dn_trades)})")

# What about ATR Expansion + Breakout (the one that didn't have enough trades)
df_dev['ATR'] = df_dev['High'] - df_dev['Low']
df_dev['ATR14'] = df_dev['ATR'].rolling(14).mean()
df_dev['ATR50'] = df_dev['ATR14'].rolling(50).mean()

atr_exp = df_dev['ATR14'] > (df_dev['ATR50'] * 1.5)
bo_up_atr = (df_dev['Close'] > df_dev['High20']) & atr_exp
bo_dn_atr = (df_dev['Close'] < df_dev['Low20']) & atr_exp

up_atr = df_dev[bo_up_atr]['Fwd20'].dropna()
dn_atr = df_dev[bo_dn_atr]['Fwd20'].dropna()
print(f"ATR Exp BO Up -> 20d Fwd Mean={up_atr.mean():.4%}, WinRate={(up_atr>0).mean():.2%} (N={len(up_atr)})")
print(f"ATR Exp BO Down -> 20d Fwd Mean={dn_atr.mean():.4%}, WinRate={(dn_atr<0).mean():.2%} (N={len(dn_atr)})")

