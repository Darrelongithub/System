/**
 * Generates ready-to-compile MetaTrader 5 Expert Advisor (.mq5) source code
 * for the Signal Finder Pro MT5 Web Bridge.
 */

export function generateMql5EaSource(options: {
  serverUrl?: string;
  authToken?: string;
  magicNumber?: number;
}): string {
  const serverUrl = options.serverUrl || "http://127.0.0.1:5173/api/mt5/bridge";
  const authToken = options.authToken || "sfp-default-token";
  const magic = options.magicNumber || 992200;

  return `//+------------------------------------------------------------------+
//|                                     SignalFinderBridge.mq5       |
//|                        Signal Finder Pro - Live MT5 Bridge EA    |
//|                                  https://github.com/arena-system |
//+------------------------------------------------------------------+
#property copyright "Signal Finder Pro"
#property link      "https://github.com/arena-system"
#property version   "1.00"
#property description "Automated Trade Execution Bridge for Signal Finder Pro"
#property description "Auto Entry, Auto SL, Auto TP from Web Strategy Analyzer"
#property strict

#include <Trade\\Trade.mqh>
#include <Trade\\PositionInfo.mqh>
#include <Trade\\AccountInfo.mqh>
#include <Trade\\SymbolInfo.mqh>

//--- Input Parameters
input group "=== Bridge Configuration ==="
input string   InpServerUrl     = "${serverUrl}"; // Web Bridge API URL
input string   InpAuthToken     = "${authToken}"; // Authorization Token
input ulong    InpMagicNumber   = ${magic};       // Magic Number for Orders
input int      InpPollIntervalMs = 2000;          // Poll Interval (milliseconds)
input int      InpSlippagePoints = 30;            // Max Slippage (Points)

input group "=== Safety & Execution ==="
input bool     InpAllowAutoEntry = true;          // Allow Automated Entry
input bool     InpAllowAutoSl    = true;          // Allow Automated Stop Loss
input bool     InpAllowAutoTp    = true;          // Allow Automated Take Profit
input double   InpMaxLotSize     = 10.0;          // Max Allowed Lot Size
input int      InpMaxOpenPositions = 3;           // Max Total Magic Positions (terminal-level)
input bool     InpUseTerminalNewsFilter = true;
input int      InpNewsMinsBefore = 30;
input int      InpNewsMinsAfter = 15;
input int      InpMaxSpreadPoints = 50;
input double   InpMaxSpreadUsd = 0.50; // XAUUSD/GOLD quote price per ounce
input double   InpMaxDailyDrawdownPct = 2.0;
input bool     InpFlattenOnDailyLimit = true;
input double   InpMaxTotalDrawdownPct = 6.0;
input bool     InpRolloverEnabled = true;
input int      InpRolloverStartMinuteEat = 0;
input int      InpRolloverEndMinuteEat = 65;
input bool     InpFridayCloseEnabled = true;
input int      InpFridayCloseHourEat = 23;
input int      InpFridayCloseMinuteEat = 30;
input bool     InpFridayFlatten = false;
input int      InpPreNewsAction = 0; // 0 none, 1 profitable to breakeven, 2 close
input bool     InpVerboseLogs    = true;          // Detailed Journal Logs

//--- Global Objects
CTrade         m_trade;
CPositionInfo  m_position;
CAccountInfo   m_account;
CSymbolInfo    m_symbol;

datetime       m_lastPollTime = 0;
ulong          m_timerId = 0;
string         m_ackIds = "";
string         m_commandResults = "";

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   if(InpMagicNumber == 0 || InpMaxDailyDrawdownPct <= 0 || InpMaxTotalDrawdownPct <= 0 || InpMaxSpreadPoints <= 0 || InpMaxSpreadUsd <= 0)
   {
      Print("[RISK GUARD] Invalid safety inputs or zero magic number");
      return INIT_PARAMETERS_INCORRECT;
   }
   Print("🚀 [SignalFinderBridge] Initializing Live Bridge EA...");
   Print("🔗 Bridge Endpoint: ", InpServerUrl);
   Print("🔮 Magic Number: ", InpMagicNumber);

   m_trade.SetExpertMagicNumber(InpMagicNumber);
   m_trade.SetDeviationInPoints(InpSlippagePoints);
   m_trade.SetTypeFillingBySymbol(_Symbol);

   // Check if WebRequest is enabled in MT5
   char postData[];
   char resultData[];
   string resultHeaders;
   string testPayload = "{\\"action\\":\\"ping\\",\\"login\\":\\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "\\"}";
   StringToCharArray(testPayload, postData, 0, WHOLE_ARRAY, CP_UTF8);

   string headers = "Content-Type: application/json\\r\\nAuthorization: Bearer " + InpAuthToken + "\\r\\n";
   int res = WebRequest("POST", InpServerUrl, headers, 3000, postData, resultData, resultHeaders);
   if(res == -1)
   {
      int err = GetLastError();
      Print("⚠️ [SignalFinderBridge] WebRequest failed (error: ", err, ")");
      Print("👉 Please enable WebRequest in MT5: Tools -> Options -> Expert Advisors -> check 'Allow WebRequest for listed URL' and add '", InpServerUrl, "'");
   }
   else if(res == 401)
   {
      Print("⛔ [SignalFinderBridge] Server rejected the auth token (HTTP 401).");
      Print("👉 The bridge token may have changed. Re-download the EA (SignalFinderBridge.mq5) from the MT5 panel and attach it again to pick up the current token.");
   }
   else
   {
      Print("✅ [SignalFinderBridge] Successfully connected to Web Bridge!");
   }

   EventSetMillisecondTimer(InpPollIntervalMs);
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("🛑 [SignalFinderBridge] Bridge EA Stopped (Reason: ", reason, ")");
}

//+------------------------------------------------------------------+
//| Timer event function (Periodic polling for signals & telemetry)  |
//+------------------------------------------------------------------+
void OnTimer()
{
   if(CheckTotalDrawdown()) FlattenMagic(false);
   if(CheckDailyDrawdown() && InpFlattenOnDailyLimit) FlattenMagic(false);
   ManageTerminalProtection();
   PollBridgeAndExecute();
}

// Broker-day equity baseline persists in terminal global variables across EA restarts.
// A late first installation cannot reconstruct the true start-of-day equity.
bool CheckDailyDrawdown()
{
   MqlDateTime day;
   TimeToStruct(TimeTradeServer(), day);
   string key = "SFP.day." + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   double dayId = day.year * 10000 + day.mon * 100 + day.day;
   if(!GlobalVariableCheck(key) || GlobalVariableGet(key) != dayId)
   {
      GlobalVariableSet(key, dayId);
      GlobalVariableSet(key + ".base", AccountInfoDouble(ACCOUNT_EQUITY));
      GlobalVariableSet(key + ".locked", 0);
   }
   double base = GlobalVariableGet(key + ".base");
   double high = MathMax(AccountInfoDouble(ACCOUNT_EQUITY), AccountInfoDouble(ACCOUNT_BALANCE));
   if(high > base) { base = high; GlobalVariableSet(key + ".base", base); }
   if(InpMaxDailyDrawdownPct > 0 && base > 0 && AccountInfoDouble(ACCOUNT_EQUITY) <= base * (1.0 - InpMaxDailyDrawdownPct / 100.0))
      GlobalVariableSet(key + ".locked", 1);
   return GlobalVariableGet(key + ".locked") > 0;
}

bool CheckTotalDrawdown()
{
   string key = "SFP.total." + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   double high = MathMax(AccountInfoDouble(ACCOUNT_EQUITY), AccountInfoDouble(ACCOUNT_BALANCE));
   if(!GlobalVariableCheck(key) || GlobalVariableGet(key) < high) GlobalVariableSet(key, high);
   if(!GlobalVariableCheck(key + ".locked")) GlobalVariableSet(key + ".locked", 0);
   if(InpMaxTotalDrawdownPct > 0 && high > 0 && AccountInfoDouble(ACCOUNT_EQUITY) <= GlobalVariableGet(key) * (1 - InpMaxTotalDrawdownPct / 100.0)) GlobalVariableSet(key + ".locked", 1);
   return GlobalVariableGet(key + ".locked") > 0;
}

void FlattenMagic(bool goldOnly)
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
      if(m_position.SelectByIndex(i) && m_position.Magic() == InpMagicNumber && (!goldOnly || StringFind(m_position.Symbol(), "XAU") >= 0 || StringFind(m_position.Symbol(), "GOLD") >= 0))
         if(!m_trade.PositionClose(m_position.Ticket())) Print("[RISK GUARD] Close request failed: ", m_trade.ResultRetcode());
}

bool EatEntryBlackout()
{
   MqlDateTime t;
   TimeToStruct(TimeGMT() + 3 * 3600, t);
   int minute = t.hour * 60 + t.min;
   bool roll = InpRolloverStartMinuteEat <= InpRolloverEndMinuteEat ? (minute >= InpRolloverStartMinuteEat && minute < InpRolloverEndMinuteEat) : (minute >= InpRolloverStartMinuteEat || minute < InpRolloverEndMinuteEat);
   if(InpRolloverEnabled && roll) return true;
   int closeMinute = InpFridayCloseHourEat * 60 + InpFridayCloseMinuteEat;
   return InpFridayCloseEnabled && ((t.day_of_week == 5 && minute >= closeMinute - 120) || t.day_of_week == 6);
}

void ManageTerminalProtection()
{
   MqlDateTime t;
   TimeToStruct(TimeGMT() + 3 * 3600, t);
   if(InpFridayCloseEnabled && InpFridayFlatten && t.day_of_week == 5 && t.hour * 60 + t.min >= InpFridayCloseHourEat * 60 + InpFridayCloseMinuteEat) FlattenMagic(true);
   if(!InpUseTerminalNewsFilter || InpPreNewsAction == 0) return;
   MqlCalendarValue values[];
   datetime now = TimeTradeServer();
   int count = CalendarValueHistory(values, now, now + InpNewsMinsBefore * 60, NULL, "USD");
   if(count <= 0) return;
   bool imminent = false;
   for(int j = 0; j < count; j++) { MqlCalendarEvent event; if(CalendarEventById(values[j].event_id, event) && event.importance == CALENDAR_IMPORTANCE_HIGH) { imminent = true; break; } }
   if(!imminent) return;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(!m_position.SelectByIndex(i) || m_position.Magic() != InpMagicNumber) continue;
      ulong ticket = m_position.Ticket();
      if(InpPreNewsAction == 2) m_trade.PositionClose(ticket);
      else if(InpPreNewsAction == 1 && m_position.Profit() > 0 && ((m_position.PositionType() == POSITION_TYPE_BUY && m_position.StopLoss() < m_position.PriceOpen()) || (m_position.PositionType() == POSITION_TYPE_SELL && (m_position.StopLoss() == 0 || m_position.StopLoss() > m_position.PriceOpen()))))
         m_trade.PositionModify(ticket, m_position.PriceOpen(), m_position.TakeProfit());
   }
}

// Mark before executing: at-most-once OPENs across terminal crashes. A crash
// after marking but before order submission may lose the order; reconcile manually.
bool ClaimCommand(string id)
{
   if(id == "") return false;
   if(StringLen(m_ackIds) > 0) m_ackIds += ",";
   m_ackIds += id;
   string key = "SFP.cmd." + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "." + id;
   if(GlobalVariableCheck(key)) return false;
   GlobalVariableSet(key, TimeCurrent());
   GlobalVariablesFlush();
   return true;
}

string OpenResultKey(string id) { return "SFP.open." + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "." + id; }

void AppendOpenResult(string id)
{
   string key = OpenResultKey(id);
   int state = (int)GlobalVariableGet(key);
   string status = state == 2 ? "FILLED" : (state == 3 ? "REJECTED" : "UNKNOWN");
   int reason = (int)GlobalVariableGet(key + ".reason");
   string error = state == 2 ? "" : (state != 3 ? "execution outcome unknown; reconcile broker" : (reason == 1 ? "risk or news guard" : reason == 2 ? "invalid account or SL" : reason == 3 ? "symbol unavailable" : reason == 4 ? "invalid volume" : reason == 5 ? "position guard" : reason == 6 ? "spread guard" : reason == 7 ? "invalid SL" : reason == 8 ? "SL disabled" : reason == 9 ? "command expired or clock skew" : "broker rejected order"));
   if(StringLen(m_commandResults) > 0) m_commandResults += ",";
   m_commandResults += "{\\"id\\":\\"" + id + "\\",\\"status\\":\\"" + status + "\\",\\"ticket\\":" + IntegerToString((long)GlobalVariableGet(key + ".ticket")) + ",\\"price\\":" + DoubleToString(GlobalVariableGet(key + ".price"), 8) + ",\\"retcode\\":" + IntegerToString((long)GlobalVariableGet(key + ".ret")) + ",\\"error\\":\\"" + error + "\\"}";
}

bool ClaimOpen(string id)
{
   if(id == "" || StringLen(id) > 35) return false;
   for(int i = 0; i < StringLen(id); i++) { ushort c = StringGetCharacter(id, i); if(!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_')) return false; }
   string key = OpenResultKey(id);
   if(GlobalVariableCheck(key)) { AppendOpenResult(id); return false; }
   GlobalVariableSet(key, 1); // claimed; a crash in this state is UNKNOWN, not a rejection
   GlobalVariablesFlush();
   return true;
}

void CompleteOpen(string id, int state, ulong ticket, double price, uint retcode, int reason = 0)
{
   string key = OpenResultKey(id);
   GlobalVariableSet(key + ".ticket", (double)ticket);
   GlobalVariableSet(key + ".price", price);
   GlobalVariableSet(key + ".ret", (double)retcode);
   GlobalVariableSet(key + ".reason", reason);
   GlobalVariableSet(key, state);
   GlobalVariablesFlush();
   AppendOpenResult(id);
}

bool TerminalNewsBlocked()
{
   if(!InpUseTerminalNewsFilter) return false;
   MqlCalendarValue values[];
   datetime now = TimeTradeServer();
   // MT5 economic-calendar timestamps use trade-server time.
   int count = CalendarValueHistory(values, now - InpNewsMinsAfter * 60, now + InpNewsMinsBefore * 60, NULL, "USD");
   if(count < 0) { Print("[NEWS GUARD] Calendar unavailable; entry blocked"); return true; }
   for(int i = 0; i < count; i++)
   {
      MqlCalendarEvent event;
      if(!CalendarEventById(values[i].event_id, event)) return true;
      if(event.importance == CALENDAR_IMPORTANCE_HIGH) return true;
   }
   return false;
}

//+------------------------------------------------------------------+
//| Helper: Normalize symbol name (e.g. XAU/USD -> XAUUSD)           |
//+------------------------------------------------------------------+
string NormalizeSymbol(string sym)
{
   string cleaned = sym;
   StringReplace(cleaned, "/", "");
   StringReplace(cleaned, "\\\\", "");
   StringReplace(cleaned, "-", "");
   StringReplace(cleaned, "_", "");
   
   // Check if direct symbol exists
   if(SymbolSelect(cleaned, true)) return cleaned;
   
   if(cleaned == "XAUUSD" && SymbolSelect("GOLD", true)) return "GOLD";
   // Check with common suffixes (.m, .pro, .raw, etc.)
   string suffixes[] = {"", "m", ".m", ".pro", "_i", ".raw", ".a", "c"};
   for(int i = 0; i < ArraySize(suffixes); i++)
   {
      string test = cleaned + suffixes[i];
      if(SymbolSelect(test, true)) return test;
   }
   
   return cleaned;
}

//+------------------------------------------------------------------+
//| Main Poll & Execution Routine                                    |
//+------------------------------------------------------------------+
void PollBridgeAndExecute()
{
   // Build telemetry JSON
   string telemetry = BuildTelemetryJson();
   
   char postData[];
   char resultData[];
   string resultHeaders;
   StringToCharArray(telemetry, postData, 0, StringLen(telemetry), CP_UTF8);
   
   string headers = "Content-Type: application/json\\r\\nAuthorization: Bearer " + InpAuthToken + "\\r\\n";
   int res = WebRequest("POST", InpServerUrl, headers, 4000, postData, resultData, resultHeaders);
   
   if(res == 200)
   {
      string jsonResp = CharArrayToString(resultData, 0, WHOLE_ARRAY, CP_UTF8);
      m_ackIds = ""; // server has received the acknowledgements
      m_commandResults = "";
      ProcessBridgeResponse(jsonResp);
   }
   else if(res == 401)
   {
      Print("⛔ [SignalFinderBridge] Server rejected the auth token (HTTP 401).");
      Print("👉 The bridge token may have changed. Re-download the EA (SignalFinderBridge.mq5) from the MT5 panel and attach it again to pick up the current token.");
   }
   else if(InpVerboseLogs && res == -1)
   {
      // Log WebRequest error
      // Print("WebRequest error: ", GetLastError());
   }
}

string PositionRiskKey(long positionId)
{
   return "SFP.risk." + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "." + IntegerToString(positionId);
}

void RecordInitialRisk(string symbol, string typeStr, double volume, double entry, double sl)
{
   ulong deal = m_trade.ResultDeal();
   if(deal == 0 || sl <= 0 || !HistoryDealSelect(deal)) return;
   long positionId = HistoryDealGetInteger(deal, DEAL_POSITION_ID);
   double pnl = 0;
   ENUM_ORDER_TYPE side = typeStr == "BUY" ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   if(positionId > 0 && OrderCalcProfit(side, symbol, volume, entry, sl, pnl) && pnl < 0)
   {
      GlobalVariableSet(PositionRiskKey(positionId), -pnl);
      GlobalVariableSet(PositionRiskKey(positionId) + ".open", TimeTradeServer());
      GlobalVariablesFlush();
   }
}

// Daily realised R is valid only when every closed deal has a recorded initial
// risk. Older/untracked deals deliberately omit dailyRealizedR from telemetry.
bool GetRealizedRiskStats(double &dailyR, int &streak, long &lastLossMs)
{
   dailyR = 0; streak = 0; lastLossMs = 0;
   datetime now = TimeTradeServer();
   datetime gmt = TimeGMT();
   datetime dayStart = now - (long)((gmt + 10800) % 86400);
   if(!HistorySelect(dayStart - 30 * 86400, now)) return false;
   bool known = true, counting = true;
   long countedIds[];
   for(int i = HistoryDealsTotal() - 1; i >= 0; i--)
   {
      ulong deal = HistoryDealGetTicket(i);
      if(HistoryDealGetInteger(deal, DEAL_MAGIC) != (long)InpMagicNumber) continue;
      long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
      datetime when = (datetime)HistoryDealGetInteger(deal, DEAL_TIME);
      if(entry == DEAL_ENTRY_IN && when >= dayStart)
      {
         string entryKey = PositionRiskKey(HistoryDealGetInteger(deal, DEAL_POSITION_ID));
         if(!GlobalVariableCheck(entryKey) || GlobalVariableGet(entryKey) <= 0) known = false;
         else dailyR += (HistoryDealGetDouble(deal, DEAL_COMMISSION) + HistoryDealGetDouble(deal, DEAL_FEE)) / GlobalVariableGet(entryKey);
      }
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY) continue;
      double pnl = HistoryDealGetDouble(deal, DEAL_PROFIT) + HistoryDealGetDouble(deal, DEAL_SWAP) + HistoryDealGetDouble(deal, DEAL_COMMISSION) + HistoryDealGetDouble(deal, DEAL_FEE);
      if(counting)
      {
         long positionId = HistoryDealGetInteger(deal, DEAL_POSITION_ID);
         bool seen = false, stillOpen = false;
         for(int j = 0; j < ArraySize(countedIds); j++) if(countedIds[j] == positionId) seen = true;
         for(int j = PositionsTotal() - 1; j >= 0; j--) if(m_position.SelectByIndex(j) && PositionGetInteger(POSITION_IDENTIFIER) == positionId) stillOpen = true;
         if(!seen && !stillOpen)
         {
            int n = ArraySize(countedIds); ArrayResize(countedIds, n + 1); countedIds[n] = positionId;
            if(HistoryDealGetInteger(deal, DEAL_REASON) == DEAL_REASON_SL && pnl < 0)
            {
               streak++;
               if(lastLossMs == 0) lastLossMs = ((long)when - (long)now + (long)gmt) * 1000;
            }
            else counting = false;
         }
      }
      if(when < dayStart) continue;
      string key = PositionRiskKey(HistoryDealGetInteger(deal, DEAL_POSITION_ID));
      if(!GlobalVariableCheck(key) || GlobalVariableGet(key) <= 0 || !GlobalVariableCheck(key + ".open") || GlobalVariableGet(key + ".open") < dayStart) known = false;
      else dailyR += pnl / GlobalVariableGet(key);
   }
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(!m_position.SelectByIndex(i) || m_position.Magic() != InpMagicNumber) continue;
      string key = PositionRiskKey(PositionGetInteger(POSITION_IDENTIFIER));
      if(!GlobalVariableCheck(key) || GlobalVariableGet(key) <= 0 || m_position.Time() < dayStart) known = false;
      else dailyR += (m_position.Profit() + m_position.Swap()) / GlobalVariableGet(key);
   }
   return known;
}

//+------------------------------------------------------------------+
//| Build Account & Open Positions Telemetry JSON                     |
//+------------------------------------------------------------------+
string BuildTelemetryJson()
{
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   string server = AccountInfoString(ACCOUNT_SERVER);
   string currency = AccountInfoString(ACCOUNT_CURRENCY);
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin = AccountInfoDouble(ACCOUNT_MARGIN);
   double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   long leverage = AccountInfoInteger(ACCOUNT_LEVERAGE);

   string quoteSymbol = NormalizeSymbol("XAUUSD");
   MqlTick quote;
   bool haveQuote = SymbolInfoTick(quoteSymbol, quote);
   string json = "{";
   json += "\\"action\\":\\"sync\\",";
   json += "\\"login\\":\\"" + IntegerToString(login) + "\\",";
   json += "\\"server\\":\\"" + server + "\\",";
   json += "\\"currency\\":\\"" + currency + "\\",";
   json += "\\"balance\\":" + DoubleToString(balance, 2) + ",";
   json += "\\"equity\\":" + DoubleToString(equity, 2) + ",";
   json += "\\"margin\\":" + DoubleToString(margin, 2) + ",";
   json += "\\"freeMargin\\":" + DoubleToString(freeMargin, 2) + ",";
   json += "\\"leverage\\":" + IntegerToString(leverage) + ",";
   json += "\\"quoteSymbol\\":\\"" + quoteSymbol + "\\",";
   json += "\\"bid\\":" + DoubleToString(haveQuote ? quote.bid : 0, 5) + ",";
   json += "\\"ask\\":" + DoubleToString(haveQuote ? quote.ask : 0, 5) + ",";
   json += "\\"spread\\":" + DoubleToString(haveQuote ? quote.ask - quote.bid : 0, 5) + ",";
   json += "\\"ackIds\\":\\"" + m_ackIds + "\\",";
   json += "\\"commandResults\\":[" + m_commandResults + "],";
   double realizedR; int lossStreak; long lastLossMs;
   if(GetRealizedRiskStats(realizedR, lossStreak, lastLossMs)) json += "\\"dailyRealizedR\\":" + DoubleToString(realizedR, 6) + ",";
   string dayKey = "SFP.day." + IntegerToString(login);
   string totalKey = "SFP.total." + IntegerToString(login);
   json += "\\"dailyBaseline\\":" + DoubleToString(GlobalVariableGet(dayKey + ".base"), 2) + ",";
   json += "\\"dailyLocked\\":" + (CheckDailyDrawdown() ? "true" : "false") + ",";
   json += "\\"totalBaseline\\":" + DoubleToString(GlobalVariableGet(totalKey), 2) + ",";
   json += "\\"totalLocked\\":" + (CheckTotalDrawdown() ? "true" : "false") + ",";
   json += "\\"consecutiveLosses\\":" + IntegerToString(lossStreak) + ",";
   json += "\\"lastLossTimeMs\\":" + IntegerToString(lastLossMs) + ",";
   json += "\\"positions\\":[";

   int posCount = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(m_position.SelectByIndex(i))
      {
         if(m_position.Magic() == InpMagicNumber || InpMagicNumber == 0)
         {
            if(posCount > 0) json += ",";
            json += "{";
            json += "\\"ticket\\":" + IntegerToString(m_position.Ticket()) + ",";
            json += "\\"magic\\":" + IntegerToString(m_position.Magic()) + ",";
            json += "\\"symbol\\":\\"" + m_position.Symbol() + "\\",";
            json += "\\"type\\":\\"" + (m_position.PositionType() == POSITION_TYPE_BUY ? "BUY" : "SELL") + "\\",";
            json += "\\"volume\\":" + DoubleToString(m_position.Volume(), 2) + ",";
            json += "\\"openPrice\\":" + DoubleToString(m_position.PriceOpen(), 5) + ",";
            json += "\\"currentPrice\\":" + DoubleToString(m_position.PriceCurrent(), 5) + ",";
            json += "\\"sl\\":" + DoubleToString(m_position.StopLoss(), 5) + ",";
            json += "\\"tp\\":" + DoubleToString(m_position.TakeProfit(), 5) + ",";
            json += "\\"profit\\":" + DoubleToString(m_position.Profit(), 2) + ",";
            json += "\\"comment\\":\\"" + m_position.Comment() + "\\"";
            json += "}";
            posCount++;
         }
      }
   }
   json += "]}";
   return json;
}

//+------------------------------------------------------------------+
//| Simple JSON parser to process commands from the web engine       |
//+------------------------------------------------------------------+
void ProcessBridgeResponse(string json)
{
   if(StringFind(json, "\\"commands\\":") < 0) return;

   // OPEN commands — iterate every { ... } member of "commands", not just
   // the first one. Each marker is isolated (objStart..objEnd) and dispatched.
   int cursor = 0;
   while(true)
   {
      int openPos = StringFind(json, "\\"action\\":\\"OPEN\\"", cursor);
      if(openPos < 0) break;

      int objStart = -1;
      int objEnd = -1;
      for(int p = openPos; p >= 0; p--)
      {
         if(StringGetCharacter(json, p) == '{') { objStart = p; break; }
      }
      for(int p = openPos; p < StringLen(json); p++)
      {
         if(StringGetCharacter(json, p) == '}') { objEnd = p; break; }
      }
      if(objStart >= 0 && objEnd >= 0)
      {
         string obj = StringSubstr(json, objStart, objEnd - objStart + 1);

         string symbol = ExtractJsonString(obj, "symbol");
         string typeStr = ExtractJsonString(obj, "type");
         double volume = ExtractJsonDouble(obj, "volume");
         double sl = ExtractJsonDouble(obj, "sl");
         double tp = ExtractJsonDouble(obj, "tp");
         string comment = ExtractJsonString(obj, "comment");
         string cmdId = ExtractJsonString(obj, "id");

         if(ClaimOpen(cmdId))
         {
            double createdAtMs = ExtractJsonDouble(obj, "createdAtMs");
            if(createdAtMs <= 0 || ((double)TimeGMT() * 1000.0 - createdAtMs >= 90000.0 || (double)TimeGMT() * 1000.0 < createdAtMs - 30000.0))
               CompleteOpen(cmdId, 3, 0, 0, 0, 9);
            else ExecuteTradeCommand(cmdId, symbol, typeStr, volume, sl, tp, comment);
         }
      }
      cursor = openPos + 1;
   }

   // CLOSE commands — same cursor loop
   cursor = 0;
   while(true)
   {
      int closePos = StringFind(json, "\\"action\\":\\"CLOSE\\"", cursor);
      if(closePos < 0) break;

      int objStart = -1;
      int objEnd = -1;
      for(int p = closePos; p >= 0; p--)
      {
         if(StringGetCharacter(json, p) == '{') { objStart = p; break; }
      }
      for(int p = closePos; p < StringLen(json); p++)
      {
         if(StringGetCharacter(json, p) == '}') { objEnd = p; break; }
      }
      if(objStart >= 0 && objEnd >= 0)
      {
         string obj = StringSubstr(json, objStart, objEnd - objStart + 1);
         ulong ticket = (ulong)ExtractJsonDouble(obj, "ticket");
         string cmdId = ExtractJsonString(obj, "id");
         if(ticket > 0 && ClaimCommand(cmdId))
         {
            if(!PositionSelectByTicket(ticket) || PositionGetInteger(POSITION_MAGIC) != (long)InpMagicNumber)
            {
               Print("[RISK GUARD] CLOSE rejected: ticket not owned by EA");
               cursor = closePos + 1;
               continue;
            }
            bool closed = m_trade.PositionClose(ticket);
            Print("Close requested result=", closed, " retcode=", m_trade.ResultRetcode());
            if(!closed) Print("[RISK GUARD] Close request failed for ticket #", ticket);
         }
      }
      cursor = closePos + 1;
   }
   // MODIFY commands are restricted to this EA's magic number.
   cursor = 0;
   while(true)
   {
      int pos = StringFind(json, "\\"action\\":\\"MODIFY\\"", cursor);
      if(pos < 0) break;
      int start = -1, end = -1;
      for(int p = pos; p >= 0; p--) if(StringGetCharacter(json, p) == '{') { start = p; break; }
      for(int p = pos; p < StringLen(json); p++) if(StringGetCharacter(json, p) == '}') { end = p; break; }
      if(start >= 0 && end >= 0)
      {
         string obj = StringSubstr(json, start, end - start + 1);
         ulong ticket = (ulong)ExtractJsonDouble(obj, "ticket");
         string id = ExtractJsonString(obj, "id");
         if(ticket > 0 && ClaimCommand(id) && PositionSelectByTicket(ticket) && PositionGetInteger(POSITION_MAGIC) == (long)InpMagicNumber)
            if(!m_trade.PositionModify(ticket, ExtractJsonDouble(obj, "sl"), ExtractJsonDouble(obj, "tp"))) Print("[RISK GUARD] MODIFY failed ", m_trade.ResultRetcode());
      }
      cursor = pos + 1;
   }
}

//+------------------------------------------------------------------+
//| Opposite-side anti-hedge guard (terminal level)                 |
//| Block fills that would open the signal's opposite side while an |
//| opposite-side position exists on the same symbol.               |
//+------------------------------------------------------------------+
bool HasOppositePositionOpen(string sym, string typeStr)
{
   string tradeSymbol = NormalizeSymbol(sym);
   for(int i = 0; i < PositionsTotal(); i++)
   {
      if(m_position.SelectByIndex(i))
      {
         if(m_position.Magic() == InpMagicNumber || InpMagicNumber == 0)
         {
            if(m_position.Symbol() == tradeSymbol)
            {
               if(typeStr == "BUY" && m_position.PositionType() == POSITION_TYPE_SELL) return true;
               if(typeStr == "SELL" && m_position.PositionType() == POSITION_TYPE_BUY) return true;
            }
         }
      }
   }
   return false;
}

//+------------------------------------------------------------------+
//| Count same-side magic positions on the normalized symbol         |
//+------------------------------------------------------------------+
int CountSameSidePositions(string sym, string typeStr)
{
   string tradeSymbol = NormalizeSymbol(sym);
   int count = 0;
   for(int i = 0; i < PositionsTotal(); i++)
   {
      if(m_position.SelectByIndex(i))
      {
         if(m_position.Magic() == InpMagicNumber || InpMagicNumber == 0)
         {
            if(m_position.Symbol() == tradeSymbol)
            {
               if(typeStr == "BUY" && m_position.PositionType() == POSITION_TYPE_BUY) count++;
               if(typeStr == "SELL" && m_position.PositionType() == POSITION_TYPE_SELL) count++;
            }
         }
      }
   }
   return count;
}

//+------------------------------------------------------------------+
//| Count all magic-numbered positions across all symbols            |
//+------------------------------------------------------------------+
int CountTotalMagicPositions()
{
   int count = 0;
   for(int i = 0; i < PositionsTotal(); i++)
   {
      if(m_position.SelectByIndex(i))
      {
         if(m_position.Magic() == InpMagicNumber || InpMagicNumber == 0)
         {
            count++;
         }
      }
   }
   return count;
}

//+------------------------------------------------------------------+
//| Execute Trade Order on MetaTrader 5                              |
//+------------------------------------------------------------------+
void ExecuteTradeCommand(string id, string sym, string typeStr, double volume, double sl, double tp, string comment)
{
   if(!InpAllowAutoEntry || CheckDailyDrawdown() || CheckTotalDrawdown() || EatEntryBlackout() || TerminalNewsBlocked())
   {
      Print("[RISK GUARD] Entry blocked by terminal safety controls");
      CompleteOpen(id, 3, 0, 0, 0, 1);
      return;
   }
   if(AccountInfoInteger(ACCOUNT_MARGIN_MODE) != ACCOUNT_MARGIN_MODE_RETAIL_HEDGING || sl <= 0)
   {
      Print("[RISK GUARD] Hedging account and protective SL are required for risk accounting");
      CompleteOpen(id, 3, 0, 0, 0, 2);
      return;
   }
   string tradeSymbol = NormalizeSymbol(sym);
   if(!m_symbol.Name(tradeSymbol))
   {
      Print("❌ [SignalFinderBridge] Symbol not found on broker: ", sym, " (tried ", tradeSymbol, ")");
      CompleteOpen(id, 3, 0, 0, 0, 3);
      return;
   }

   double minLot = SymbolInfoDouble(tradeSymbol, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(tradeSymbol, SYMBOL_VOLUME_MAX);
   double stepLot = SymbolInfoDouble(tradeSymbol, SYMBOL_VOLUME_STEP);
   if(volume <= 0 || volume > InpMaxLotSize || volume < minLot || volume > maxLot || stepLot <= 0 || MathAbs(volume / stepLot - MathRound(volume / stepLot)) > 0.000001)
   {
      Print("[RISK GUARD] Invalid broker volume; rejected without rounding up");
      CompleteOpen(id, 3, 0, 0, 0, 4);
      return;
   }
   if(HasOppositePositionOpen(tradeSymbol, typeStr))
   {
      Print("⛔ [SignalFinderBridge] Blocked fill on ", tradeSymbol, " (", typeStr, "): opposite-side position already open (anti-hedge).");
      CompleteOpen(id, 3, 0, 0, 0, 5);
      return;
   }

   if(CountSameSidePositions(tradeSymbol, typeStr) >= 3)
   {
      Print("⛔ [SignalFinderBridge] Blocked fill on ", tradeSymbol, " (", typeStr, "): max 3 same-side positions already open.");
      CompleteOpen(id, 3, 0, 0, 0, 5);
      return;
   }

   if(CountTotalMagicPositions() >= InpMaxOpenPositions)
   {
      Print("⛔ [SignalFinderBridge] Blocked fill on ", tradeSymbol, " (", typeStr, "): total magic positions (", CountTotalMagicPositions(), "/", InpMaxOpenPositions, ") at the terminal-level cap.");
      CompleteOpen(id, 3, 0, 0, 0, 5);
      return;
   }

   if(!m_symbol.RefreshRates() || m_symbol.Bid() <= 0 || m_symbol.Ask() <= 0 || m_symbol.Ask() < m_symbol.Bid() || InpMaxSpreadPoints <= 0 || (m_symbol.Ask() - m_symbol.Bid()) > InpMaxSpreadPoints * SymbolInfoDouble(tradeSymbol, SYMBOL_POINT) || ((StringFind(tradeSymbol, "XAU") >= 0 || StringFind(tradeSymbol, "GOLD") >= 0) && (m_symbol.Ask() - m_symbol.Bid()) > InpMaxSpreadUsd))
   {
      Print("[SPREAD GUARD] Invalid quote or spread too wide on ", tradeSymbol);
      CompleteOpen(id, 3, 0, 0, 0, 6);
      return;
   }
   
   if((typeStr == "BUY" && sl >= m_symbol.Ask()) || (typeStr == "SELL" && sl <= m_symbol.Bid()))
   {
      Print("[RISK GUARD] SL is on the wrong side of the current market");
      CompleteOpen(id, 3, 0, 0, 0, 7);
      return;
   }
   if(!InpAllowAutoSl) { Print("[RISK GUARD] SL disabled; entry rejected"); CompleteOpen(id, 3, 0, 0, 0, 8); return; }
   if(!InpAllowAutoTp) tp = 0;
   
   bool success = false;
   if(typeStr == "BUY")
   {
      double ask = m_symbol.Ask();
      Print("🎯 [SignalFinderBridge] Executing AUTO BUY on ", tradeSymbol, " Vol: ", volume, " Ask: ", ask, " SL: ", sl, " TP: ", tp);
      success = m_trade.Buy(volume, tradeSymbol, ask, sl, tp, comment);
   }
   else if(typeStr == "SELL")
   {
      double bid = m_symbol.Bid();
      Print("🎯 [SignalFinderBridge] Executing AUTO SELL on ", tradeSymbol, " Vol: ", volume, " Bid: ", bid, " SL: ", sl, " TP: ", tp);
      success = m_trade.Sell(volume, tradeSymbol, bid, sl, tp, comment);
   }
   
   uint retcode = m_trade.ResultRetcode();
   if(success && (retcode == TRADE_RETCODE_DONE || retcode == TRADE_RETCODE_DONE_PARTIAL))
   {
      ulong deal = m_trade.ResultDeal();
      ulong ticket = 0;
      if(deal > 0 && HistoryDealSelect(deal))
      {
         long positionId = HistoryDealGetInteger(deal, DEAL_POSITION_ID);
         for(int i = PositionsTotal() - 1; i >= 0; i--)
            if(m_position.SelectByIndex(i) && PositionGetInteger(POSITION_IDENTIFIER) == positionId) { ticket = m_position.Ticket(); break; }
      }
      RecordInitialRisk(tradeSymbol, typeStr, volume, m_trade.ResultPrice(), sl);
      CompleteOpen(id, ticket > 0 ? 2 : 4, ticket, m_trade.ResultPrice(), retcode);
      Print("[SignalFinderBridge] Trade result ", retcode, " position ", ticket);
   }
   else if(success && retcode == TRADE_RETCODE_PLACED)
   {
      CompleteOpen(id, 4, 0, 0, retcode); // accepted but not yet confirmed
   }
   else
   {
      CompleteOpen(id, 3, 0, 0, retcode);
      Print("[SignalFinderBridge] Order rejected, retcode ", retcode);
   }
}

//+------------------------------------------------------------------+
//| Lightweight JSON extractors                                      |
//+------------------------------------------------------------------+
string ExtractJsonString(string json, string key)
{
   string needle = "\\"" + key + "\\":\\"";
   int start = StringFind(json, needle);
   if(start < 0) return "";
   start += StringLen(needle);
   int end = StringFind(json, "\\"", start);
   if(end < 0) return "";
   return StringSubstr(json, start, end - start);
}

double ExtractJsonDouble(string json, string key)
{
   string needle = "\\"" + key + "\\":";
   int start = StringFind(json, needle);
   if(start < 0) return 0;
   start += StringLen(needle);
   while(StringGetCharacter(json, start) == ' ' || StringGetCharacter(json, start) == '\\"') start++;
   int end = start;
   while(end < StringLen(json))
   {
      ushort ch = StringGetCharacter(json, end);
      if((ch >= '0' && ch <= '9') || ch == '.' || ch == '-') end++;
      else break;
   }
   return StringToDouble(StringSubstr(json, start, end - start));
}
//+------------------------------------------------------------------+
`;
}
