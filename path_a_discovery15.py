import pandas as pd
import numpy as np

df = pd.read_csv('data_archive/XAU_1d_data.csv', sep=';', header=0)
df.columns = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
df['Date'] = pd.to_datetime(df['Date'], format='%Y.%m.%d %H:%M')
df = df.set_index('Date').sort_index()

dev_years = [2004, 2005, 2006, 2007, 2009, 2010, 2011, 2013, 2014, 2015, 2017, 2018]
df_dev = df[df.index.year.isin(dev_years)].copy()

df_dev['SMA200'] = df_dev['Close'].rolling(200).mean()

delta = df_dev['Close'].diff()
gain = (delta.where(delta > 0, 0)).rolling(2).mean()
loss = (-delta.where(delta < 0, 0)).rolling(2).mean()
rs = gain / loss
df_dev['RSI2'] = 100 - (100 / (1 + rs))
df_dev['ATR14'] = (df_dev['High'] - df_dev['Low']).rolling(14).mean()

def test_rsi2(df_data, rsi_buy, rsi_sell):
    trades = []
    in_trade = False
    entry_price = 0
    entry_time = None
    risk = 0
    stop_price = 0
    
    for i in range(200, len(df_data)-1):
        bar = df_data.iloc[i]
        
        if not in_trade:
            if bar['Close'] > bar['SMA200'] and bar['RSI2'] < rsi_buy:
                in_trade = True
                entry_bar = df_data.iloc[i+1]
                entry_price = entry_bar['Open'] + 0.20
                stop_price = entry_price - (2 * bar['ATR14'])
                risk = entry_price - stop_price
                entry_time = entry_bar.name
        else:
            if bar['Low'] <= stop_price:
                if bar['Open'] < stop_price: exit_price = bar['Open']
                else: exit_price = stop_price
                
                days = (bar.name - entry_time).days
                gross_pnl = exit_price - entry_price
                net_pnl = gross_pnl - 0.20 + (days * -0.05)
                trades.append({'net_r': net_pnl / risk, 'days': days})
                in_trade = False
            elif bar['RSI2'] > rsi_sell:
                exit_bar = df_data.iloc[i+1]
                exit_price = exit_bar['Open']
                days = (exit_bar.name - entry_time).days
                gross_pnl = exit_price - entry_price
                net_pnl = gross_pnl - 0.20 + (days * -0.05)
                trades.append({'net_r': net_pnl / risk, 'days': days})
                in_trade = False
                
    return pd.DataFrame(trades)

trades = test_rsi2(df_dev, 10, 80)
print("RSI(2) Mean Reversion in Trend")
print(f"Trades: {len(trades)}, Mean R: {trades['net_r'].mean():.4f}, WR: {(trades['net_r']>0).mean():.2%}, Avg Days: {trades['days'].mean():.1f}")
if len(trades) > 0:
    wins = trades[trades['net_r']>0]['net_r']
    losses = trades[trades['net_r']<=0]['net_r']
    print(f"Avg Win: {wins.mean():.4f}R, Avg Loss: {losses.mean():.4f}R")
