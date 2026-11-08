import pandas as pd
import numpy as np

# Load Daily Data
df = pd.read_csv('data_archive/XAU_1d_data.csv', sep=';', header=0)
df.columns = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
df['Date'] = pd.to_datetime(df['Date'], format='%Y.%m.%d %H:%M')
df = df.set_index('Date').sort_index()

# SEALED DATA evaluation
sealed_years = [2008, 2012, 2016, 2019]

def get_spread(): return 1.00 # 100 ticks since it's the daily open (rollover hour)
def get_swap(days, is_long): return days * (-0.05 if is_long else -0.02)

print("--- SEALED DATA EVALUATION (2008, 2012, 2016, 2019) ---")

# STRATEGY 1: XAU-DONCHIAN-20D
df['High20'] = df['High'].shift(1).rolling(20).max()
df['Low20'] = df['Low'].shift(1).rolling(20).min()
df['High10'] = df['High'].shift(1).rolling(10).max()
df['Low10'] = df['Low'].shift(1).rolling(10).min()
df['ATR14'] = (df['High'] - df['Low']).rolling(14).mean()

def eval_donchian(df_data, is_long):
    trades = []
    in_trade = False
    entry_price = 0
    entry_time = None
    risk = 0
    stop_price = 0
    
    for i in range(50, len(df_data)-1):
        bar = df_data.iloc[i]
        
        if not in_trade:
            if is_long and bar['Close'] > bar['High20']:
                in_trade = True
                entry_bar = df_data.iloc[i+1]
                entry_price = entry_bar['Open'] + get_spread()
                stop_price = entry_price - (2 * bar['ATR14'])
                risk = entry_price - stop_price
                entry_time = entry_bar.name
            elif not is_long and bar['Close'] < bar['Low20']:
                in_trade = True
                entry_bar = df_data.iloc[i+1]
                entry_price = entry_bar['Open']
                stop_price = entry_price + (2 * bar['ATR14'])
                risk = stop_price - entry_price
                entry_time = entry_bar.name
        else:
            if is_long:
                new_stop = bar['Close'] - (2 * bar['ATR14'])
                if new_stop > stop_price: stop_price = new_stop
                
                if bar['Low'] <= stop_price or bar['Close'] < bar['Low10']:
                    exit_bar = df_data.iloc[i+1] if bar['Close'] < bar['Low10'] else bar
                    exit_price = exit_bar['Open'] if bar['Close'] < bar['Low10'] else max(bar['Open'], stop_price)
                    days = (bar.name - entry_time).days
                    gross_pnl = exit_price - entry_price
                    net_pnl = gross_pnl - get_spread() + get_swap(days, True)
                    
                    if entry_time.year in sealed_years:
                        trades.append({'net_r': net_pnl / risk, 'days': days})
                    in_trade = False
            else:
                new_stop = bar['Close'] + (2 * bar['ATR14'])
                if new_stop < stop_price: stop_price = new_stop
                
                if bar['High'] >= stop_price or bar['Close'] > bar['High10']:
                    exit_bar = df_data.iloc[i+1] if bar['Close'] > bar['High10'] else bar
                    exit_price = exit_bar['Open'] if bar['Close'] > bar['High10'] else min(bar['Open'], stop_price)
                    days = (bar.name - entry_time).days
                    gross_pnl = entry_price - exit_price
                    net_pnl = gross_pnl - get_spread() + get_swap(days, False)
                    
                    if entry_time.year in sealed_years:
                        trades.append({'net_r': net_pnl / risk, 'days': days})
                    in_trade = False
                    
    return pd.DataFrame(trades)

don_longs = eval_donchian(df, True)
don_shorts = eval_donchian(df, False)
don_all = pd.concat([don_longs, don_shorts])

print("\n--- XAU-DONCHIAN-20D (Sealed Data) ---")
print(f"Trades: {len(don_all)}")
if len(don_all) > 0:
    print(f"Mean Net R: {don_all['net_r'].mean():.4f}")
    print(f"Win Rate: {(don_all['net_r']>0).mean():.2%}")


# STRATEGY 2: XAU-TAIL-REVERSION-15D
df['Ret'] = df['Close'].pct_change()

def eval_tail_rev(df_data):
    trades = []
    in_trade = False
    entry_time = None
    
    for i in range(20, len(df_data)-16):
        bar = df_data.iloc[i]
        
        if not in_trade and bar['Ret'] < -0.015:
            in_trade = True
            entry_bar = df_data.iloc[i+1]
            entry_price = entry_bar['Open'] + get_spread()
            stop_price = entry_price - (2 * bar['ATR14'])
            risk = entry_price - stop_price
            entry_time = entry_bar.name
            
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
            net_pnl = gross_pnl - get_spread() + get_swap(days, True)
            
            if entry_time.year in sealed_years:
                trades.append({'net_r': net_pnl / risk, 'days': days})
            in_trade = False
            
    return pd.DataFrame(trades)

tail_all = eval_tail_rev(df)

print("\n--- XAU-TAIL-REVERSION-15D (Sealed Data) ---")
print(f"Trades: {len(tail_all)}")
if len(tail_all) > 0:
    print(f"Mean Net R: {tail_all['net_r'].mean():.4f}")
    print(f"Win Rate: {(tail_all['net_r']>0).mean():.2%}")

