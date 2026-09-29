/**
 * Generates a full Standalone 24/7 MetaTrader 5 Expert Advisor (.mq5)
 * that executes the 9 Signal Finder Pro strategies directly inside MT5
 * with Auto Entry, Auto Stop Loss (SL), and Auto Take Profit (TP),
 * PLUS automated "Red Folder" High-Impact Economic News Filter Protection.
 *
 * Runs 24/7 on MT5 (Desktop or VPS) even when the web browser/computer is closed.
 */

export function generateStandalone247EaSource(options: {
  magicNumber?: number;
  riskPct?: number;
  fixedLot?: number;
  minRr?: number;
  syncServerUrl?: string;
  authToken?: string;
  newsFilterEnabled?: boolean;
  newsMinsBefore?: number;
  newsMinsAfter?: number;
}): string {
  const magic = options.magicNumber || 992200;
  const riskPct = options.riskPct || 1.0;
  const fixedLot = options.fixedLot || 0.1;
  const minRr = options.minRr || 2.0;
  const serverUrl = options.syncServerUrl || "http://127.0.0.1:5173/api/mt5/bridge";
  const token = options.authToken || "sfp-default-token";
  const newsEnabled = options.newsFilterEnabled ?? true;
  const newsMinsBefore = options.newsMinsBefore ?? 30;
  const newsMinsAfter = options.newsMinsAfter ?? 30;

  return `//+------------------------------------------------------------------+
//|                               SignalFinderPro_247_Autotrader.mq5 |
//|                        Signal Finder Pro - 24/7 Standalone EA    |
//|                                  https://github.com/arena-system |
//+------------------------------------------------------------------+
#property copyright "Signal Finder Pro"
#property link      "https://github.com/arena-system"
#property version   "2.10"
#property description "24/7 Autonomous Strategy Trader for MetaTrader 5"
#property description "Auto Entry, Auto SL & Auto TP + Red Folder News Filter"
#property strict

#include <Trade\\Trade.mqh>
#include <Trade\\PositionInfo.mqh>
#include <Trade\\AccountInfo.mqh>
#include <Trade\\SymbolInfo.mqh>

//--- Input Parameters
input group "=== 24/7 Risk & Sizing Configuration ==="
enum ENUM_SIZING_MODE {
   SIZING_RISK_PCT,   // Dynamic Risk % of Account Equity
   SIZING_FIXED_LOT   // Fixed Lot Size
};
input ENUM_SIZING_MODE InpSizingMode    = SIZING_RISK_PCT; // Position Sizing Model
input double           InpRiskPct       = ${riskPct.toFixed(1)};            // Risk % per Trade (if Dynamic)
input double           InpFixedLot      = ${fixedLot.toFixed(2)};            // Fixed Lot Size (if Fixed)
input double           InpMaxLot        = 10.0;            // Maximum Allowed Lot Size
input double           InpMinRr         = ${minRr.toFixed(1)};            // Minimum Risk:Reward Ratio Threshold
input int              InpMaxPositions  = 5;               // Max Concurrent Open Positions
input ulong            InpMagicNumber   = ${magic};           // Magic Number
input int              InpSlippage      = 30;              // Max Slippage in Points

input group "=== Red Folder News Filter Protection ==="
input bool             InpEnableNewsFilter = ${newsEnabled ? "true" : "false"};  // Enable Red Folder News Filter
input int              InpNewsMinsBefore   = ${newsMinsBefore};     // Minutes BEFORE High-Impact News to Pause
input int              InpNewsMinsAfter    = ${newsMinsAfter};     // Minutes AFTER High-Impact News to Pause
input bool             InpFilterHighOnly   = true;   // Filter Red Folders (High Impact) Only

input group "=== Active Strategies (Production Set) ==="
input bool InpStratMacdCross   = true;  // MACD Cross Strategy
input bool InpStratDualThrust  = true;  // Dual Thrust Breakout
input bool InpStratPdhRetest   = true;  // PDH/PDL Retest
input bool InpStratClassicPivot= true;  // Classic Pivot Reversal
input bool InpStratWilliams    = true;  // Williams %R Fade
input bool InpStratThreeSoldiers= true; // Three White Soldiers / Black Crows
input bool InpStratMorningStar = true;  // Morning Star / Evening Star
input bool InpStratIchimoku    = true;  // Ichimoku TK Cross
input bool InpStratDonchian    = true;  // Donchian 55 Breakout

input group "=== Optional Web Dashboard Sync ==="
input bool   InpEnableWebSync   = true;                                 // Sync Telemetry with Web Control Panel
input string InpSyncServerUrl   = "${serverUrl}"; // Bridge Webhook URL
input string InpAuthToken       = "${token}";                 // Web Bridge Token

//--- Global Objects & Handles
CTrade         m_trade;
CPositionInfo  m_position;
CAccountInfo   m_account;
CSymbolInfo    m_symbol;

int            h_atr14;
int            h_macd;
int            h_ema20;
int            h_williams;
int            h_ichimoku;

datetime       m_lastBarTime = 0;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("🚀 [SignalFinderPro 24/7] Initializing Standalone Autonomous EA...");
   Print("📊 Sizing: ", InpSizingMode == SIZING_RISK_PCT ? DoubleToString(InpRiskPct, 1) + "% Risk" : DoubleToString(InpFixedLot, 2) + " Fixed Lot");
   Print("🛡️ News Filter: ", InpEnableNewsFilter ? "ACTIVE (Red Folders: " + IntegerToString(InpNewsMinsBefore) + "m before / " + IntegerToString(InpNewsMinsAfter) + "m after)" : "DISABLED");
   Print("🔮 Magic Number: ", InpMagicNumber);

   m_trade.SetExpertMagicNumber(InpMagicNumber);
   m_trade.SetDeviationInPoints(InpSlippage);
   m_trade.SetTypeFillingBySymbol(_Symbol);

   // Create Indicators
   h_atr14   = iATR(_Symbol, PERIOD_M30, 14);
   h_macd    = iMACD(_Symbol, PERIOD_M30, 12, 26, 9, PRICE_CLOSE);
   h_ema20   = iMA(_Symbol, PERIOD_M30, 20, 0, MODE_EMA, PRICE_CLOSE);
   h_williams= iWPR(_Symbol, PERIOD_M30, 14);
   h_ichimoku= iIchimoku(_Symbol, PERIOD_M30, 9, 26, 52);

   if(h_atr14 == INVALID_HANDLE || h_macd == INVALID_HANDLE || h_ema20 == INVALID_HANDLE)
   {
      Print("❌ Failed to create indicator handles!");
      return(INIT_FAILED);
   }

   // 5-second timer for web telemetry sync
   EventSetTimer(5);

   Print("✅ [SignalFinderPro 24/7] System is ACTIVE and running 24/7 on ", _Symbol, " M30!");
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   IndicatorRelease(h_atr14);
   IndicatorRelease(h_macd);
   IndicatorRelease(h_ema20);
   IndicatorRelease(h_williams);
   IndicatorRelease(h_ichimoku);
   Print("🛑 [SignalFinderPro 24/7] EA Stopped (Reason: ", reason, ")");
}

//+------------------------------------------------------------------+
//| Check if Current Time falls inside a Red Folder News Blackout    |
//+------------------------------------------------------------------+
bool IsNewsBlackout()
{
   if(!InpEnableNewsFilter) return false;

   MqlCalendarValue values[];
   datetime fromTime = TimeCurrent() - (InpNewsMinsAfter * 60);
   datetime toTime   = TimeCurrent() + (InpNewsMinsBefore * 60);

   string sym = _Symbol;
   string baseCurr = SymbolInfoString(sym, SYMBOL_CURRENCY_BASE);
   string quoteCurr = SymbolInfoString(sym, SYMBOL_CURRENCY_PROFIT);
   if(StringFind(sym, "XAU") >= 0 || StringFind(sym, "GOLD") >= 0) quoteCurr = "USD";

   int count = CalendarValueHistory(values, fromTime, toTime, NULL, NULL);
   if(count > 0)
   {
      for(int i = 0; i < count; i++)
      {
         MqlCalendarEvent event;
         if(CalendarEventById(values[i].event_id, event))
         {
            if(event.importance == CALENDAR_IMPORTANCE_HIGH || (!InpFilterHighOnly && event.importance >= CALENDAR_IMPORTANCE_MODERATE))
            {
               MqlCalendarCountry country;
               CalendarCountryById(event.country_id, country);
               if(country.currency == baseCurr || country.currency == quoteCurr || country.currency == "USD")
               {
                  Print("🔴 [RED FOLDER NEWS FILTER] Trading locked on ", _Symbol, " due to news event: ", event.name, " [", country.currency, "]");
                  return true;
               }
            }
         }
      }
   }
   return false;
}

//+------------------------------------------------------------------+
//| OnTick - Evaluates strategy rules on each new M30 bar            |
//+------------------------------------------------------------------+
void OnTick()
{
   // Check if a new M30 candle has opened
   datetime currentBarTime = iTime(_Symbol, PERIOD_M30, 0);
   if(currentBarTime == m_lastBarTime) return; // Wait for new candle
   m_lastBarTime = currentBarTime;

   // 1. Check Red Folder Economic News Blackout
   if(IsNewsBlackout())
   {
      return; // Skip trade evaluation during high-impact news windows
   }

   // 2. Check Max Open Positions cap
   if(CountOpenPositions() >= InpMaxPositions) return;

   // 3. Evaluate 9 Production Strategies
   CheckMacdCross();
   CheckDualThrust();
   CheckPdhRetest();
   CheckClassicPivot();
   CheckWilliamsFade();
   CheckThreeSoldiers();
   CheckMorningStar();
   CheckIchimokuTk();
   CheckDonchian55();
}

//+------------------------------------------------------------------+
//| Timer Event - Syncs telemetry & processes web commands           |
//+------------------------------------------------------------------+
void OnTimer()
{
   if(!InpEnableWebSync) return;
   SyncTelemetry();
}

//+------------------------------------------------------------------+
//| Sizing Calculator: Calculates lot size from SL distance & Equity |
//+------------------------------------------------------------------+
double CalculateLots(double entry, double sl)
{
   if(InpSizingMode == SIZING_FIXED_LOT) return InpFixedLot;

   double slDistance = MathAbs(entry - sl);
   if(slDistance <= 0) return 0.01;

   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double riskMoney = equity * (InpRiskPct / 100.0);

   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   if(tickSize <= 0 || tickValue <= 0) return 0.01;

   double points = slDistance / _Point;
   double riskPerLot = points * (tickValue / (tickSize / _Point));

   if(riskPerLot <= 0) return 0.01;
   double lots = riskMoney / riskPerLot;

   double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double step   = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

   lots = MathFloor(lots / step) * step;
   lots = MathMax(minLot, MathMin(MathMin(maxLot, InpMaxLot), lots));
   return NormalizeDouble(lots, 2);
}

//+------------------------------------------------------------------+
//| Auto Order Execution Helper                                      |
//+------------------------------------------------------------------+
bool OpenTrade(string strategy, string side, double entry, double sl, double tp)
{
   double rr = MathAbs(tp - entry) / MathAbs(entry - sl);
   if(rr < InpMinRr) return false;

   double lots = CalculateLots(entry, sl);
   m_symbol.Name(_Symbol);
   m_symbol.RefreshRates();

   bool ok = false;
   if(side == "BUY")
   {
      double ask = m_symbol.Ask();
      Print("🎯 [AUTO-ENTRY] BUY ", _Symbol, " | Strat: ", strategy, " | Lots: ", lots, " | SL: ", sl, " | TP: ", tp, " | RR: ", DoubleToString(rr, 2));
      ok = m_trade.Buy(lots, _Symbol, ask, sl, tp, "SFP-" + strategy);
   }
   else if(side == "SELL")
   {
      double bid = m_symbol.Bid();
      Print("🎯 [AUTO-ENTRY] SELL ", _Symbol, " | Strat: ", strategy, " | Lots: ", lots, " | SL: ", sl, " | TP: ", tp, " | RR: ", DoubleToString(rr, 2));
      ok = m_trade.Sell(lots, _Symbol, bid, sl, tp, "SFP-" + strategy);
   }

   if(ok)
   {
      Print("🎉 Trade Executed! Ticket #", m_trade.ResultOrder());
   }
   return ok;
}

//+------------------------------------------------------------------+
//| STRATEGY 1: MACD Cross                                           |
//+------------------------------------------------------------------+
void CheckMacdCross()
{
   if(!InpStratMacdCross) return;
   double main[], sig[], atr[];
   ArraySetAsSeries(main, true);
   ArraySetAsSeries(sig, true);
   ArraySetAsSeries(atr, true);
   CopyBuffer(h_macd, 0, 1, 3, main);
   CopyBuffer(h_macd, 1, 1, 3, sig);
   CopyBuffer(h_atr14, 0, 1, 1, atr);

   double barAtr = atr[0];
   double close1 = iClose(_Symbol, PERIOD_M30, 1);

   // Bullish crossover
   if(main[1] <= sig[1] && main[0] > sig[0])
   {
      double sl = close1 - (1.5 * barAtr);
      double tp = close1 + (2.5 * 1.5 * barAtr);
      OpenTrade("macd-cross", "BUY", close1, sl, tp);
   }
   // Bearish crossover
   else if(main[1] >= sig[1] && main[0] < sig[0])
   {
      double sl = close1 + (1.5 * barAtr);
      double tp = close1 - (2.5 * 1.5 * barAtr);
      OpenTrade("macd-cross", "SELL", close1, sl, tp);
   }
}

//+------------------------------------------------------------------+
//| STRATEGY 2: Dual Thrust Breakout                                 |
//+------------------------------------------------------------------+
void CheckDualThrust()
{
   if(!InpStratDualThrust) return;
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, PERIOD_M30, 1, 21, rates) < 21) return;

   double hh = -1e9, lc = 1e9, hc = -1e9, ll = 1e9;
   for(int j = 1; j <= 20; j++)
   {
      if(rates[j].high > hh)  hh = rates[j].high;
      if(rates[j].close < lc) lc = rates[j].close;
      if(rates[j].close > hc) hc = rates[j].close;
      if(rates[j].low < ll)   ll = rates[j].low;
   }
   double range = MathMax(hh - lc, hc - ll);
   if(range <= 0) return;

   double atr[];
   ArraySetAsSeries(atr, true);
   CopyBuffer(h_atr14, 0, 1, 1, atr);
   double barAtr = atr[0];

   double open1 = rates[0].open;
   double close1 = rates[0].close;

   if(close1 > open1 + (0.5 * range))
   {
      double sl = close1 - (1.5 * barAtr);
      double tp = close1 + (2.5 * 1.5 * barAtr);
      OpenTrade("dual-thrust", "BUY", close1, sl, tp);
   }
   else if(close1 < open1 - (0.5 * range))
   {
      double sl = close1 + (1.5 * barAtr);
      double tp = close1 - (2.5 * 1.5 * barAtr);
      OpenTrade("dual-thrust", "SELL", close1, sl, tp);
   }
}

//+------------------------------------------------------------------+
//| STRATEGY 3: PDH/PDL Retest                                       |
//+------------------------------------------------------------------+
void CheckPdhRetest()
{
   if(!InpStratPdhRetest) return;
   double pdh = iHigh(_Symbol, PERIOD_D1, 1);
   double pdl = iLow(_Symbol, PERIOD_D1, 1);

   double close1 = iClose(_Symbol, PERIOD_M30, 1);
   double low1 = iLow(_Symbol, PERIOD_M30, 1);
   double high1 = iHigh(_Symbol, PERIOD_M30, 1);

   double atr[];
   ArraySetAsSeries(atr, true);
   CopyBuffer(h_atr14, 0, 1, 1, atr);
   double barAtr = atr[0];

   // PDH bounce
   if(low1 <= pdh && close1 > pdh)
   {
      double sl = pdh - (0.5 * barAtr);
      double tp = close1 + (2.5 * (close1 - sl));
      OpenTrade("pdh-retest", "BUY", close1, sl, tp);
   }
   // PDL bounce
   else if(high1 >= pdl && close1 < pdl)
   {
      double sl = pdl + (0.5 * barAtr);
      double tp = close1 - (2.5 * (sl - close1));
      OpenTrade("pdh-retest", "SELL", close1, sl, tp);
   }
}

//+------------------------------------------------------------------+
//| STRATEGY 4: Classic Pivot S1/R1                                  |
//+------------------------------------------------------------------+
void CheckClassicPivot()
{
   if(!InpStratClassicPivot) return;
   double hD = iHigh(_Symbol, PERIOD_D1, 1);
   double lD = iLow(_Symbol, PERIOD_D1, 1);
   double cD = iClose(_Symbol, PERIOD_D1, 1);
   double pp = (hD + lD + cD) / 3.0;
   double s1 = (2.0 * pp) - hD;
   double r1 = (2.0 * pp) - lD;

   double close1 = iClose(_Symbol, PERIOD_M30, 1);
   double low1 = iLow(_Symbol, PERIOD_M30, 1);
   double high1 = iHigh(_Symbol, PERIOD_M30, 1);

   double atr[];
   ArraySetAsSeries(atr, true);
   CopyBuffer(h_atr14, 0, 1, 1, atr);
   double barAtr = atr[0];

   if(low1 <= s1 && close1 > s1)
   {
      double sl = low1 - (0.5 * barAtr);
      double tp = close1 + (3.0 * (close1 - sl));
      OpenTrade("classic-pivot", "BUY", close1, sl, tp);
   }
   else if(high1 >= r1 && close1 < r1)
   {
      double sl = high1 + (0.5 * barAtr);
      double tp = close1 - (3.0 * (sl - close1));
      OpenTrade("classic-pivot", "SELL", close1, sl, tp);
   }
}

//+------------------------------------------------------------------+
//| STRATEGY 5: Williams %R Fade                                     |
//+------------------------------------------------------------------+
void CheckWilliamsFade()
{
   if(!InpStratWilliams) return;
   double wpr[];
   ArraySetAsSeries(wpr, true);
   CopyBuffer(h_williams, 0, 1, 2, wpr);
   double close1 = iClose(_Symbol, PERIOD_M30, 1);

   double atr[];
   ArraySetAsSeries(atr, true);
   CopyBuffer(h_atr14, 0, 1, 1, atr);
   double barAtr = atr[0];

   if(wpr[1] <= -80.0 && wpr[0] > -80.0)
   {
      double sl = close1 - (1.5 * barAtr);
      double tp = close1 + (3.0 * 1.5 * barAtr);
      OpenTrade("williams-r-fade", "BUY", close1, sl, tp);
   }
   else if(wpr[1] >= -20.0 && wpr[0] < -20.0)
   {
      double sl = close1 + (1.5 * barAtr);
      double tp = close1 - (3.0 * 1.5 * barAtr);
      OpenTrade("williams-r-fade", "SELL", close1, sl, tp);
   }
}

//+------------------------------------------------------------------+
//| STRATEGY 6: Three White Soldiers / Three Black Crows             |
//+------------------------------------------------------------------+
void CheckThreeSoldiers()
{
   if(!InpStratThreeSoldiers) return;
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, PERIOD_M30, 1, 3, rates) < 3) return;

   bool threeBull = rates[2].close > rates[2].open && rates[1].close > rates[1].open && rates[0].close > rates[0].open &&
                    rates[0].close > rates[1].close && rates[1].close > rates[2].close;
   bool threeBear = rates[2].close < rates[2].open && rates[1].close < rates[1].open && rates[0].close < rates[0].open &&
                    rates[0].close < rates[1].close && rates[1].close < rates[2].close;

   double close1 = rates[0].close;
   if(threeBull)
   {
      double sl = rates[2].low;
      double tp = close1 + (2.5 * (close1 - sl));
      OpenTrade("three-soldiers", "BUY", close1, sl, tp);
   }
   else if(threeBear)
   {
      double sl = rates[2].high;
      double tp = close1 - (2.5 * (sl - close1));
      OpenTrade("three-soldiers", "SELL", close1, sl, tp);
   }
}

//+------------------------------------------------------------------+
//| STRATEGY 7: Morning Star / Evening Star                          |
//+------------------------------------------------------------------+
void CheckMorningStar()
{
   if(!InpStratMorningStar) return;
   MqlRates r[];
   ArraySetAsSeries(r, true);
   if(CopyRates(_Symbol, PERIOD_M30, 1, 3, r) < 3) return;

   bool isMorningStar = (r[2].close < r[2].open) &&
                        (MathAbs(r[1].close - r[1].open) < 0.3 * (r[2].open - r[2].close)) &&
                        (r[0].close > r[0].open) &&
                        (r[0].close > (r[2].open + r[2].close) / 2.0);

   bool isEveningStar = (r[2].close > r[2].open) &&
                        (MathAbs(r[1].close - r[1].open) < 0.3 * (r[2].close - r[2].open)) &&
                        (r[0].close < r[0].open) &&
                        (r[0].close < (r[2].open + r[2].close) / 2.0);

   double close1 = r[0].close;
   if(isMorningStar)
   {
      double sl = MathMin(r[1].low, r[0].low);
      double tp = close1 + (3.0 * (close1 - sl));
      OpenTrade("morning-star", "BUY", close1, sl, tp);
   }
   else if(isEveningStar)
   {
      double sl = MathMax(r[1].high, r[0].high);
      double tp = close1 - (3.0 * (sl - close1));
      OpenTrade("morning-star", "SELL", close1, sl, tp);
   }
}

//+------------------------------------------------------------------+
//| STRATEGY 8: Ichimoku TK Cross                                    |
//+------------------------------------------------------------------+
void CheckIchimokuTk()
{
   if(!InpStratIchimoku) return;
   double tenkan[], kijun[];
   ArraySetAsSeries(tenkan, true);
   ArraySetAsSeries(kijun, true);
   CopyBuffer(h_ichimoku, 0, 1, 2, tenkan);
   CopyBuffer(h_ichimoku, 1, 1, 2, kijun);
   double close1 = iClose(_Symbol, PERIOD_M30, 1);

   // Bullish TK Cross
   if(tenkan[1] <= kijun[1] && tenkan[0] > kijun[0])
   {
      double sl = kijun[0];
      double tp = close1 + (3.0 * (close1 - sl));
      OpenTrade("ichimoku-tk", "BUY", close1, sl, tp);
   }
   // Bearish TK Cross
   else if(tenkan[1] >= kijun[1] && tenkan[0] < kijun[0])
   {
      double sl = kijun[0];
      double tp = close1 - (3.0 * (sl - close1));
      OpenTrade("ichimoku-tk", "SELL", close1, sl, tp);
   }
}

//+------------------------------------------------------------------+
//| STRATEGY 9: Donchian 55 Breakout                                 |
//+------------------------------------------------------------------+
void CheckDonchian55()
{
   if(!InpStratDonchian) return;
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, PERIOD_M30, 1, 56, rates) < 56) return;

   double hh55 = -1e9, ll55 = 1e9, ll20 = 1e9, hh20 = -1e9;
   for(int i = 1; i <= 55; i++)
   {
      if(rates[i].high > hh55) hh55 = rates[i].high;
      if(rates[i].low < ll55)  ll55 = rates[i].low;
      if(i <= 20)
      {
         if(rates[i].low < ll20) ll20 = rates[i].low;
         if(rates[i].high > hh20) hh20 = rates[i].high;
      }
   }
   double close1 = rates[0].close;

   if(close1 > hh55)
   {
      double sl = ll20;
      double tp = close1 + (4.0 * (close1 - sl));
      OpenTrade("donchian-55", "BUY", close1, sl, tp);
   }
   else if(close1 < ll55)
   {
      double sl = hh20;
      double tp = close1 - (4.0 * (sl - close1));
      OpenTrade("donchian-55", "SELL", close1, sl, tp);
   }
}

//+------------------------------------------------------------------+
//| Count Open Positions for this Magic Number                       |
//+------------------------------------------------------------------+
int CountOpenPositions()
{
   int count = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(m_position.SelectByIndex(i))
      {
         if(m_position.Magic() == InpMagicNumber && m_position.Symbol() == _Symbol)
            count++;
      }
   }
   return count;
}

//+------------------------------------------------------------------+
//| Webhook Telemetry Sync                                           |
//+------------------------------------------------------------------+
void SyncTelemetry()
{
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   string server = AccountInfoString(ACCOUNT_SERVER);
   string currency = AccountInfoString(ACCOUNT_CURRENCY);
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin = AccountInfoDouble(ACCOUNT_MARGIN);
   double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   long leverage = AccountInfoInteger(ACCOUNT_LEVERAGE);

   string json = "{\\"action\\":\\"sync\\",";
   json += "\\"login\\":\\"" + IntegerToString(login) + "\\",";
   json += "\\"server\\":\\"" + server + "\\",";
   json += "\\"currency\\":\\"" + currency + "\\",";
   json += "\\"balance\\":" + DoubleToString(balance, 2) + ",";
   json += "\\"equity\\":" + DoubleToString(equity, 2) + ",";
   json += "\\"margin\\":" + DoubleToString(margin, 2) + ",";
   json += "\\"freeMargin\\":" + DoubleToString(freeMargin, 2) + ",";
   json += "\\"leverage\\":" + IntegerToString(leverage) + ",";
   json += "\\"positions\\":[";

   int posCount = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(m_position.SelectByIndex(i))
      {
         if(m_position.Magic() == InpMagicNumber)
         {
            if(posCount > 0) json += ",";
            json += "{\\"ticket\\":" + IntegerToString(m_position.Ticket()) + ",";
            json += "\\"symbol\\":\\"" + m_position.Symbol() + "\\",";
            json += "\\"type\\":\\"" + (m_position.PositionType() == POSITION_TYPE_BUY ? "BUY" : "SELL") + "\\",";
            json += "\\"volume\\":" + DoubleToString(m_position.Volume(), 2) + ",";
            json += "\\"openPrice\\":" + DoubleToString(m_position.PriceOpen(), 5) + ",";
            json += "\\"currentPrice\\":" + DoubleToString(m_position.PriceCurrent(), 5) + ",";
            json += "\\"sl\\":" + DoubleToString(m_position.StopLoss(), 5) + ",";
            json += "\\"tp\\":" + DoubleToString(m_position.TakeProfit(), 5) + ",";
            json += "\\"profit\\":" + DoubleToString(m_position.Profit(), 2) + ",";
            json += "\\"comment\\":\\"" + m_position.Comment() + "\\"}";
            posCount++;
         }
      }
   }
   json += "]}";

   char postData[];
   char resultData[];
   string resultHeaders;
   StringToCharArray(json, postData, 0, StringLen(json), CP_UTF8);

   string headers = "Content-Type: application/json\\r\\nAuthorization: Bearer " + InpAuthToken + "\\r\\n";
   WebRequest("POST", InpSyncServerUrl, headers, 3000, postData, resultData, resultHeaders);
}
//+------------------------------------------------------------------+
`;
}
