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
input bool     InpVerboseLogs    = true;          // Detailed Journal Logs

//--- Global Objects
CTrade         m_trade;
CPositionInfo  m_position;
CAccountInfo   m_account;
CSymbolInfo    m_symbol;

datetime       m_lastPollTime = 0;
ulong          m_timerId = 0;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
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
      Print("👉 The bridge token rotates when the server restarts. Re-download the EA (SignalFinderBridge.mq5) from the MT5 panel and attach it again to pick up the current token.");
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
   PollBridgeAndExecute();
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
      ProcessBridgeResponse(jsonResp);
   }
   else if(res == 401)
   {
      Print("⛔ [SignalFinderBridge] Server rejected the auth token (HTTP 401).");
      Print("👉 The bridge token rotates when the server restarts. Re-download the EA (SignalFinderBridge.mq5) from the MT5 panel and attach it again to pick up the current token.");
   }
   else if(InpVerboseLogs && res == -1)
   {
      // Log WebRequest error
      // Print("WebRequest error: ", GetLastError());
   }
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
   
   // Check for trade command
   // Expected format: {"commands":[{"id":"...","action":"OPEN","symbol":"XAUUSD","type":"BUY","volume":0.1,"sl":2640.0,"tp":2670.0,"comment":"SFP-macd-cross"}]}
   int cmdPos = StringFind(json, "\\"action\\":\\"OPEN\\"");
   if(cmdPos > 0)
   {
      string symbol = ExtractJsonString(json, "symbol");
      string typeStr = ExtractJsonString(json, "type");
      double volume = ExtractJsonDouble(json, "volume");
      double sl = ExtractJsonDouble(json, "sl");
      double tp = ExtractJsonDouble(json, "tp");
      string comment = ExtractJsonString(json, "comment");
      string cmdId = ExtractJsonString(json, "id");
      
      if(volume > InpMaxLotSize) volume = InpMaxLotSize;
      if(volume < 0.01) volume = 0.01;
      
      ExecuteTradeCommand(cmdId, symbol, typeStr, volume, sl, tp, comment);
   }
   
   // Check for close command
   int closePos = StringFind(json, "\\"action\\":\\"CLOSE\\"");
   if(closePos > 0)
   {
      ulong ticket = (ulong)ExtractJsonDouble(json, "ticket");
      if(ticket > 0)
      {
         m_trade.PositionClose(ticket);
         Print("✅ [SignalFinderBridge] Closed Position Ticket #", ticket);
      }
   }
}

//+------------------------------------------------------------------+
//| Execute Trade Order on MetaTrader 5                              |
//+------------------------------------------------------------------+
void ExecuteTradeCommand(string id, string sym, string typeStr, double volume, double sl, double tp, string comment)
{
   string tradeSymbol = NormalizeSymbol(sym);
   if(!m_symbol.Name(tradeSymbol))
   {
      Print("❌ [SignalFinderBridge] Symbol not found on broker: ", sym, " (tried ", tradeSymbol, ")");
      return;
   }
   
   m_symbol.RefreshRates();
   
   if(!InpAllowAutoSl) sl = 0;
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
   
   if(success)
   {
      ulong ticket = m_trade.ResultOrder();
      Print("🎉 [SignalFinderBridge] Order Placed! Ticket: #", ticket, " Price: ", m_trade.ResultPrice());
   }
   else
   {
      Print("❌ [SignalFinderBridge] Order Failed! Error: ", m_trade.ResultRetcode(), " (", m_trade.ResultRetcodeDescription(), ")");
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
