import pandas as pd
import numpy as np

# Load 4H
df_4h = pd.read_csv('data_archive/XAU_4h_data.csv', sep=';', header=0)
df_4h.columns = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
df_4h['Date'] = pd.to_datetime(df_4h['Date'], format='%Y.%m.%d %H:%M')
df_4h = df_4h.set_index('Date').sort_index()

# Load 1D
df_1d = pd.read_csv('data_archive/XAU_1d_data.csv', sep=';', header=0)
df_1d.columns = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
df_1d['Date'] = pd.to_datetime(df_1d['Date'], format='%Y.%m.%d %H:%M')
df_1d = df_1d.set_index('Date').sort_index()

dev_years = [2004, 2005, 2006, 2007, 2009, 2010, 2011, 2013, 2014, 2015, 2017, 2018]
df_4h_dev = df_4h[df_4h.index.year.isin(dev_years)].copy()
df_1d_dev = df_1d[df_1d.index.year.isin(dev_years)].copy()

# Daily Trend
df_1d_dev['SMA50'] = df_1d_dev['Close'].rolling(50).mean()
df_1d_dev['SMA200'] = df_1d_dev['Close'].rolling(200).mean()
df_1d_dev['Uptrend'] = df_1d_dev['SMA50'] > df_1d_dev['SMA200']
df_1d_dev['Downtrend'] = df_1d_dev['SMA50'] < df_1d_dev['SMA200']

# Map to 4H
df_4h_dev['Date_only'] = df_4h_dev.index.date
df_1d_dev['Date_only'] = df_1d_dev.index.date
daily_trend = df_1d_dev[['Date_only', 'Uptrend', 'Downtrend']].copy()
daily_trend['Date_only'] = daily_trend['Date_only'] + pd.Timedelta(days=1)

df_4h_dev = df_4h_dev.merge(daily_trend, on='Date_only', how='left')
df_4h_dev.index = df_4h[df_4h.index.year.isin(dev_years)].index

# 4H Indicators
delta = df_4h_dev['Close'].diff()
gain = (delta.where(delta > 0, 0)).rolling(14).mean()
loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
rs = gain / loss
df_4h_dev['RSI'] = 100 - (100 / (1 + rs))

df_4h_dev['ATR'] = df_4h_dev['High'] - df_4h_dev['Low']
df_4h_dev['ATR14'] = df_4h_dev['ATR'].rolling(14).mean()

def get_spread(hour):
    if 0 <= hour < 8: return 0.40
    if 8 <= hour < 23: return 0.20
    return 1.00

def get_swap(days, is_long):
    return days * (-0.05 if is_long else -0.02)

def test_pullback_4h_with_stops(df_data, is_long):
    trades = []
    in_trade = False
    entry_price = 0
    stop_price = 0
    entry_time = None
    risk = 0
    
    for i in range(200, len(df_data)):
        bar = df_data.iloc[i]
        
        if not in_trade:
            if is_long and bar['Uptrend'] == True and bar['RSI'] < 30:
                in_trade = True
                if i+1 < len(df_data):
                    entry_bar = df_data.iloc[i+1]
                    entry_spread = get_spread(entry_bar.name.hour)
                    entry_price = entry_bar['Open'] + entry_spread
                    stop_price = entry_price - (2 * bar['ATR14'])
                    risk = entry_price - stop_price
                    entry_time = entry_bar.name
            elif not is_long and bar['Downtrend'] == True and bar['RSI'] > 70:
                in_trade = True
                if i+1 < len(df_data):
                    entry_bar = df_data.iloc[i+1]
                    entry_price = entry_bar['Open']
                    stop_price = entry_price + (2 * bar['ATR14'])
                    risk = stop_price - entry_price
                    entry_time = entry_bar.name
        else:
            # Check stop loss
            if is_long and bar['Low'] <= stop_price:
                # gap through logic
                if bar['Open'] < stop_price:
                    exit_price = bar['Open']
                else:
                    exit_price = stop_price
                
                days = (bar.name - entry_time).days
                gross_pnl = exit_price - entry_price
                net_pnl = gross_pnl - get_spread(bar.name.hour) + get_swap(days, True)
                trades.append({'net_r': net_pnl / risk})
                in_trade = False
                
            elif not is_long and bar['High'] >= stop_price:
                if bar['Open'] > stop_price:
                    exit_price = bar['Open']
                else:
                    exit_price = stop_price
                    
                exit_spread = get_spread(bar.name.hour)
                days = (bar.name - entry_time).days
                gross_pnl = entry_price - exit_price
                net_pnl = gross_pnl - exit_spread + get_swap(days, False)
                trades.append({'net_r': net_pnl / risk})
                in_trade = False
                
            # Exit condition
            elif is_long and bar['RSI'] > 50:
                if i+1 < len(df_data):
                    exit_bar = df_data.iloc[i+1]
                    exit_price = exit_bar['Open']
                    days = (exit_bar.name - entry_time).days
                    gross_pnl = exit_price - entry_price
                    net_pnl = gross_pnl - get_spread(exit_bar.name.hour) + get_swap(days, True)
                    trades.append({'net_r': net_pnl / risk})
                    in_trade = False
            elif not is_long and bar['RSI'] < 50:
                if i+1 < len(df_data):
                    exit_bar = df_data.iloc[i+1]
                    exit_price = exit_bar['Open']
                    days = (exit_bar.name - entry_time).days
                    gross_pnl = entry_price - exit_price
                    net_pnl = gross_pnl - get_spread(exit_bar.name.hour) + get_swap(days, False)
                    trades.append({'net_r': net_pnl / risk})
                    in_trade = False
                    
    return pd.DataFrame(trades)

longs = test_pullback_4h_with_stops(df_4h_dev, True)
shorts = test_pullback_4h_with_stops(df_4h_dev, False)

all_trades = pd.concat([longs, shorts])

print("4H Trend Pullback with Stops (Net R)")
print(f"Total Trades: {len(all_trades)}")
if len(all_trades) > 0:
    print(f"Mean Net R: {all_trades['net_r'].mean():.4f}")
    print(f"Win Rate: {(all_trades['net_r'] > 0).mean():.2%}")
    wins = all_trades[all_trades['net_r'] > 0]['net_r']
    losses = all_trades[all_trades['net_r'] <= 0]['net_r']
    print(f"Avg Win: {wins.mean():.4f}R, Avg Loss: {losses.mean():.4f}R")

