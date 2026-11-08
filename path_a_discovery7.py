import pandas as pd
import numpy as np

# Load Daily Data
df = pd.read_csv('data_archive/XAU_1d_data.csv', sep=';', header=0)
df.columns = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
df['Date'] = pd.to_datetime(df['Date'], format='%Y.%m.%d %H:%M')
df = df.set_index('Date').sort_index()

dev_years = [2004, 2005, 2006, 2007, 2009, 2010, 2011, 2013, 2014, 2015, 2017, 2018]
df_dev = df[df.index.year.isin(dev_years)].copy()

pairs = [(10, 50), (20, 50), (10, 100), (20, 100)]

for fast, slow in pairs:
    df_dev[f'SMA{fast}'] = df_dev['Close'].rolling(fast).mean()
    df_dev[f'SMA{slow}'] = df_dev['Close'].rolling(slow).mean()
    
    df_dev['Signal'] = np.where(df_dev[f'SMA{fast}'] > df_dev[f'SMA{slow}'], 1, -1)
    df_dev['Cross'] = df_dev['Signal'].diff().abs() > 0
    
    crosses = df_dev['Cross'].sum()
    
    # daily ret
    df_dev['Ret'] = df_dev['Close'].pct_change()
    strat = df_dev['Signal'].shift(1) * df_dev['Ret']
    
    mean_ret = strat.mean()
    
    print(f"SMA {fast}/{slow}: Crosses={crosses}, Mean Daily Ret={mean_ret:.4%}")

