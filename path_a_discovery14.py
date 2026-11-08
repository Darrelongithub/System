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
df_dev['ATR'] = df_dev['High'] - df_dev['Low']
df_dev['ATR14'] = df_dev['ATR'].rolling(14).mean()

def get_spread(): return 0.20
def get_swap(days): return days * -0.05

def test_tail(df_data, thresh, hold_days, is_long=True):
    trades = []
    
    for i in range(20, len(df_data)-hold_days-1):
        bar = df_data.iloc[i]
        
        if (is_long and bar['Ret'] > thresh) or (not is_long and bar['Ret'] < -thresh):
            entry_bar = df_data.iloc[i+1]
            entry_price = entry_bar['Open'] + get_spread()
            stop_price = entry_price - (1.5 * bar['ATR14'])
            risk = entry_price - stop_price
            
            exit_price = None
            days = 0
            
            # Check holding period
            for j in range(1, hold_days+1):
                fwd_bar = df_data.iloc[i+1+j]
                if fwd_bar['Low'] <= stop_price:
                    if fwd_bar['Open'] < stop_price: exit_price = fwd_bar['Open']
                    else: exit_price = stop_price
                    days = j
                    break
                    
            if exit_price is None:
                exit_bar = df_data.iloc[i+1+hold_days]
                exit_price = exit_bar['Open']
                days = hold_days
                
            gross_pnl = exit_price - entry_price
            net_pnl = gross_pnl - get_spread() + get_swap(days)
            trades.append({'net_r': net_pnl / risk, 'days': days})
            
    return pd.DataFrame(trades)

print("Tail Continuation (Surge > 2.0%)")
trades = test_tail(df_dev, 0.02, 10, True)
print(f"Trades: {len(trades)}, Mean R: {trades['net_r'].mean():.4f}, WR: {(trades['net_r']>0).mean():.2%}")

print("Tail Reversion (Drop < -2.0%)")
trades2 = test_tail(df_dev, 0.02, 10, False)
print(f"Trades: {len(trades2)}, Mean R: {trades2['net_r'].mean():.4f}, WR: {(trades2['net_r']>0).mean():.2%}")

