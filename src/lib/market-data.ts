// Client-safe market-data helpers. Twelve Data credentials stay server-side.
// Expanded list of Forex and Crypto symbols from Twelve Data
export const AVAILABLE_SYMBOLS = [
  // Major Forex
  "EUR/USD",
  "USD/JPY",
  "GBP/USD",
  "USD/CHF",
  "AUD/USD",
  "USD/CAD",
  "NZD/USD",
  // Minor/Cross Forex
  "EUR/GBP",
  "EUR/AUD",
  "EUR/CAD",
  "EUR/CHF",
  "EUR/JPY",
  "EUR/NZD",
  "GBP/AUD",
  "GBP/CAD",
  "GBP/CHF",
  "GBP/JPY",
  "GBP/NZD",
  "AUD/CAD",
  "AUD/CHF",
  "AUD/JPY",
  "AUD/NZD",
  "CAD/CHF",
  "CAD/JPY",
  "CHF/JPY",
  "NZD/CAD",
  "NZD/CHF",
  "NZD/JPY",
  // Exotics (Common ones)
  "USD/ZAR",
  "USD/MXN",
  "USD/TRY",
  "USD/SGD",
  "USD/HKD",
  "USD/NOK",
  "USD/SEK",
  "USD/DKK",
  "USD/PLN",
  // Crypto
  "BTC/USD",
  "ETH/USD",
  "SOL/USD",
  "XRP/USD",
  "ADA/USD",
  "DOGE/USD",
  "DOT/USD",
  "LTC/USD",
  // Metals/Commodities
  "XAU/USD",
  "XAG/USD",
  "USO/USD",
  "BCO/USD",
].sort();

export interface MarketDataRequest {
  symbol: string;
  interval: string;
  start_date: string;
  end_date?: string;
  timezone: string;
  outputsize: string;
}

/** Proxy market-data requests through the server so provider credentials never enter the client bundle. */
export async function requestMarketData(
  request: MarketDataRequest,
): Promise<{ response: Response; data: any }> {
  const response = await fetch("/api/market-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const text = await response.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { status: "error", message: text || `HTTP ${response.status}` };
  }
  return { response, data };
}
