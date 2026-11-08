import pandas as pd
import numpy as np

df = pd.read_csv('data_archive/XAU_1d_data.csv', sep=';', header=0)
df.columns = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
df['Date'] = pd.to_datetime(df['Date'], format='%Y.%m.%d %H:%M')
df = df.set_index('Date').sort_index()

dev_years = [2004, 2005, 2006, 2007, 2009, 2010, 2011, 2013, 2014, 2015, 2017, 2018]
df_dev = df[df.index.year.isin(dev_years)].copy()

df_dev['Ret'] = df_dev['Close'].pct_change()
df_dev['ATR14'] = (df_dev['High'] - df_dev['Low']).rolling(14).mean()

def test_tail_reversion(df_data):
    trades = []
    
    for i in range(20, len(df_data)-16):
        bar = df_data.iloc[i]
        
        if bar['Ret'] < -0.015:
            entry_bar = df_data.iloc[i+1]
            entry_price = entry_bar['Open'] + 0.20
            stop_price = entry_price - (2 * bar['ATR14'])
            risk = entry_price - stop_price
            
            exit_price = None
            days = 0
            
            for j in range(1, 16):
                fwd_bar = df_data.iloc[i+1+j]
                if fwd_bar['Low'] <= stop_price:
                    if fwd_bar['Open'] < stop_price: exit_price = fwd_bar['Open']
                    else: exit_price = stop_price
                    days = j
                    break
                    
            if exit_price is None:
                exit_bar = df_data.iloc[i+16]
                exit_price = exit_bar['Open']
                days = 15
                
            gross_pnl = exit_price - entry_price
            net_pnl = gross_pnl - 0.20 + (days * -0.05)
            trades.append({'net_r': net_pnl / risk, 'days': days})
            
    return pd.DataFrame(trades)

trades = test_tail_reversion(df_dev)
print("Fat Tail Reversion (< -1.5%)")
print(f"Total Trades: {len(trades)}")
if len(trades) > 0:
    print(f"Mean Net R: {trades['net_r'].mean():.4f}")
    print(f"Win Rate: {(trades['net_r']>0).mean():.2%}")

