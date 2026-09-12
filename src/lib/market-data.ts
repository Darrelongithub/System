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

/**
 * Provider-offered symbols the analyzer is NOT calibrated for
 * (AUDIT-ARENA-2026-09-08 §9).
 *
 * Everything else in `AVAILABLE_SYMBOLS` is forex (24/5, session-bucketed) or a
 * London/NY metal, which is what the pipeline is built for: the asian/london/ny
 * session buckets, the weekend-skip policy, the spread parser, the ATR
 * reliability thresholds and every strategy calibration are forex/metals-tuned,
 * and XAU/USD is the only golden baseline (README).
 *
 * These symbols still fetch and analyse end to end — the point is that the
 * result is unvalidated, so the UI says so out loud instead of returning
 * confident-looking numbers for an asset whose volatility and session structure
 * are completely different:
 *
 * - Crypto trades 24/7, so weekend skips never fire and the session buckets
 *   describe a market that does not close.
 * - USO is a US-listed ETF (equity hours) and BCO a futures contract — neither
 *   follows the forex 24/5 calendar the day/continuity logic assumes.
 */
export const UNVALIDATED_SYMBOLS: readonly string[] = [
  "BTC/USD",
  "ETH/USD",
  "SOL/USD",
  "XRP/USD",
  "ADA/USD",
  "DOGE/USD",
  "DOT/USD",
  "LTC/USD",
  "USO/USD",
  "BCO/USD",
];

/**
 * True when `symbol` is offered by the provider AND inside the calibrated set
 * (forex + metals). Unknown symbols are uncalibrated by definition.
 */
export function isCalibratedSymbol(symbol: string): boolean {
  const normalized = symbol.trim().toUpperCase();
  return AVAILABLE_SYMBOLS.includes(normalized) && !UNVALIDATED_SYMBOLS.includes(normalized);
}

export interface MarketDataRequest {
  symbol: string;
  interval: string;
  start_date: string;
  end_date?: string;
  timezone: string;
  outputsize: string;
}

/**
 * One candle exactly as Twelve Data returns it inside `values[]`.
 *
 * Every price arrives as a **string** (the provider's JSON is stringly typed),
 * which is why callers run `parseFloat` instead of trusting the value as a
 * number. `volume` is absent, `null` or `""` for symbols without tick volume,
 * so it stays optional and is validated before use (`hasRealTickVolume`).
 */
export interface ProviderCandle {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string | null;
}

/**
 * JSON body of a market-data response — either the provider's payload passed
 * through by `/api/market-data`, or that route's own error envelope. This is
 * untrusted network data: every field is optional and must be read
 * defensively (`data.status === "error"`, `Array.isArray(data.values)`, …).
 */
export interface MarketDataJson {
  /** `"error"` on a rejected request; absent on a successful candle payload. */
  status?: string;
  /** Provider error code — `429` rate limit, `400` bad request, … */
  code?: number;
  message?: string;
  /** Candle rows on success. */
  values?: ProviderCandle[];
}

/** Proxy market-data requests through the server so provider credentials never enter the client bundle. */
export async function requestMarketData(
  request: MarketDataRequest,
): Promise<{ response: Response; data: MarketDataJson }> {
  const response = await fetch("/api/market-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const text = await response.text();
  let data: MarketDataJson = {};
  try {
    data = JSON.parse(text);
  } catch {
    // Not JSON at all (proxy HTML error page, empty body, …) — surface it in
    // the same envelope the rest of the code already handles.
    data = { status: "error", message: text || `HTTP ${response.status}` };
  }
  return { response, data };
}
