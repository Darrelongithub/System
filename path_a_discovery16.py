import pandas as pd
import numpy as np

df = pd.read_csv('data_archive/XAU_1d_data.csv', sep=';', header=0)
df.columns = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
df['Date'] = pd.to_datetime(df['Date'], format='%Y.%m.%d %H:%M')
df = df.set_index('Date').sort_index()

dev_years = [2004, 2005, 2006, 2007, 2009, 2010, 2011, 2013, 2014, 2015, 2017, 2018]
df_dev = df[df.index.year.isin(dev_years)].copy()

df_dev['High50'] = df_dev['High'].shift(1).rolling(50).max()
df_dev['Low20'] = df_dev['Low'].shift(1).rolling(20).min()
df_dev['Low50'] = df_dev['Low'].shift(1).rolling(50).min()
df_dev['High20'] = df_dev['High'].shift(1).rolling(20).max()

df_dev['ATR14'] = (df_dev['High'] - df_dev['Low']).rolling(14).mean()

def test_turtle(df_data, is_long):
    trades = []
    in_trade = False
    entry_price = 0
    entry_time = None
    risk = 0
    stop_price = 0
    
    for i in range(100, len(df_data)-1):
        bar = df_data.iloc[i]
        
        if not in_trade:
            if is_long and bar['Close'] > bar['High50']:
                in_trade = True
                entry_bar = df_data.iloc[i+1]
                entry_price = entry_bar['Open'] + 0.20
                stop_price = entry_price - (2 * bar['ATR14'])
                risk = entry_price - stop_price
                entry_time = entry_bar.name
            elif not is_long and bar['Close'] < bar['Low50']:
                in_trade = True
                entry_bar = df_data.iloc[i+1]
                entry_price = entry_bar['Open']
                stop_price = entry_price + (2 * bar['ATR14'])
                risk = stop_price - entry_price
                entry_time = entry_bar.name
        else:
            if is_long:
                # trailing stop updates
                new_stop = bar['Close'] - (2 * bar['ATR14'])
                if new_stop > stop_price: stop_price = new_stop
                
                if bar['Low'] <= stop_price or bar['Close'] < bar['Low20']:
                    exit_bar = df_data.iloc[i+1] if bar['Close'] < bar['Low20'] else bar
                    exit_price = exit_bar['Open'] if bar['Close'] < bar['Low20'] else max(bar['Open'], stop_price)
                    
                    days = (bar.name - entry_time).days
                    gross_pnl = exit_price - entry_price
                    net_pnl = gross_pnl - 0.20 + (days * -0.05)
                    trades.append({'net_r': net_pnl / risk, 'days': days})
                    in_trade = False
            else:
                new_stop = bar['Close'] + (2 * bar['ATR14'])
                if new_stop < stop_price: stop_price = new_stop
                
                if bar['High'] >= stop_price or bar['Close'] > bar['High20']:
                    exit_bar = df_data.iloc[i+1] if bar['Close'] > bar['High20'] else bar
                    exit_price = exit_bar['Open'] if bar['Close'] > bar['High20'] else min(bar['Open'], stop_price)
                    
                    days = (bar.name - entry_time).days
                    gross_pnl = entry_price - exit_price
                    net_pnl = gross_pnl - 0.20 + (days * -0.02)
                    trades.append({'net_r': net_pnl / risk, 'days': days})
                    in_trade = False
                    
    return pd.DataFrame(trades)

longs = test_turtle(df_dev, True)
shorts = test_turtle(df_dev, False)

all_trades = pd.concat([longs, shorts])

print("Turtle Breakout (50d / 20d) with 2xATR Trailing Stop")
print(f"Total Trades: {len(all_trades)}")
if len(all_trades) > 0:
    print(f"Mean Net R: {all_trades['net_r'].mean():.4f}")
    print(f"Win Rate: {(all_trades['net_r']>0).mean():.2%}")
