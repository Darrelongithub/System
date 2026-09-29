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
  /** Caller-owned cancellation (Stop button). Never sent to the server. */
  signal?: AbortSignal;
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

/**
 * Remove any configured secret from a human-readable error string before it
 * crosses a trust boundary (logs, toasts, JSON error envelopes). Keys travel
 * only in the upstream query string, but a transport error (or future code
 * path) that stringifies a URL would otherwise leak them. Splitting/joining
 * avoids regex-meta issues and leaves short fragments (<4 chars) untouched so
 * normal text is never mangled.
 */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) out = out.split(secret).join("[redacted]");
  }
  return out;
}

/**
 * Twelve Data signals a rate limit in three different shapes (HTTP 429, a
 * numeric `code` inside a 200 body, or an error envelope mentioning credits),
 * so all three are checked. `data` is the parsed body — untrusted. Single
 * source of truth for every retry loop (generator charts, OHLC builder and
 * the server proxy must classify a response identically).
 */
export function isProviderRateLimit(response: Response, data: MarketDataJson): boolean {
  const message = String(data.message ?? "").toLowerCase();
  return (
    response.status === 429 ||
    data.code === 429 ||
    (data.status === "error" && message.includes("credit"))
  );
}

/** Twelve Data answers a valid-but-empty window with a 400 "No data is available" envelope. */
export function isProviderNoData(data: MarketDataJson): boolean {
  return (
    (data.code === 400 || data.status === "error") &&
    String(data.message ?? "")
      .toLowerCase()
      .includes("no data is available")
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVER-SIDE provider access.
//
// Everything below talks to Twelve Data directly and reads provider keys from
// the process environment. It is used by the API route (thin validated proxy)
// and by the MT5 server daemon (real-candle feed). Keys never enter the
// client bundle: the functions read `process.env` at call time and are only
// ever invoked from server code paths.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Twelve Data keys are the ONLY candle providers. Supports all layouts:
 * TWELVE_DATA_API_KEYS (CSV list), TWELVE_DATA_API_KEY, and suffixed singles
 * TWELVE_DATA_API_KEY_1..N. Order is stable and deduped.
 */
export function collectTwelveDataKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (v: string | undefined) => {
    for (const part of (v ?? "").split(",")) {
      const k = part.trim();
      if (k && !seen.has(k)) {
        seen.add(k);
        out.push(k);
      }
    }
  };
  push(env["TWELVE_DATA_API_KEYS"]);
  push(env["TWELVE_DATA_API_KEY"]);
  for (let i = 1; i <= 20; i++) push(env[`TWELVE_DATA_API_KEY_${i}`]);
  return out;
}

/**
 * Twelve Data has no documented upstream timeout; a stalled TCP connection
 * (not a clean error, not a 429) would otherwise hang this request — and
 * every retry loop above it in ohlc-generator.ts — indefinitely, with no log
 * line and no way for the UI's Stop button to intervene. 20s is generous for
 * a JSON candle response but still bounded.
 */
export const UPSTREAM_TIMEOUT_MS = 20_000;

/**
 * Direct server-side candle fetch against `https://api.twelvedata.com`,
 * shared by the `/api/market-data` proxy route and the MT5 daemon so both
 * run the exact same key rotation / rate-limit / redaction policy.
 *
 * Contract:
 *   - No keys configured        → synthetic 500 "No candle provider configured".
 *   - Key rotation on failure    → every configured key is tried in order.
 *   - Transport errors           → message is redacted of secrets, next key.
 *   - Every key rate-limited     → 429 + Retry-After (and ONLY then).
 *   - Otherwise                  → the provider response passed through.
 */
export async function fetchTwelveDataCandles(
  request: MarketDataRequest,
  keys?: string[],
): Promise<{ response: Response; data: MarketDataJson }> {
  const allKeys = keys ?? collectTwelveDataKeys();
  if (allKeys.length === 0) {
    return {
      response: new Response(null, { status: 500 }),
      data: {
        status: "error",
        message:
          "No candle provider is configured on the server (set TWELVE_DATA_API_KEYS, TWELVE_DATA_API_KEY, or TWELVE_DATA_API_KEY_1..N).",
      },
    };
  }

  const { signal: callerSignal, ...body } = request;
  const timeoutSignal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
  const fetchSignal = callerSignal ? AbortSignal.any([timeoutSignal, callerSignal]) : timeoutSignal;

  // Last upstream body (or our own error envelope) — used only when every key fails.
  let lastData: MarketDataJson | undefined = undefined;
  let lastWasRateLimit = false;

  for (const key of allKeys) {
    const params = new URLSearchParams({
      apikey: key,
      symbol: body.symbol,
      interval: body.interval,
      start_date: body.start_date,
      timezone: body.timezone,
      outputsize: body.outputsize,
    });
    if (body.end_date) params.set("end_date", body.end_date);

    let response: Response;
    try {
      response = await fetch(`https://api.twelvedata.com/time_series?${params.toString()}`, {
        signal: fetchSignal,
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      const detail = error instanceof Error ? error.message : String(error);
      lastData = {
        status: "error",
        // Redact before the envelope is returned: a URL-bearing transport
        // error must not echo the ?apikey= query parameter.
        message: timedOut
          ? `Twelve Data did not respond within ${UPSTREAM_TIMEOUT_MS / 1000}s`
          : `Twelve Data request failed: ${redactSecrets(detail, allKeys)}`,
      };
      lastWasRateLimit = false;
      continue; // try the next configured key, same as a rate-limit fallthrough
    }

    const data: MarketDataJson = await response.json().catch(() => ({}));
    lastData = data;
    const rateLimited = isProviderRateLimit(response, data);
    lastWasRateLimit = rateLimited;
    if (!rateLimited) {
      return { response, data };
    }
  }

  // Only report 429/Retry-After when every key was genuinely rate-limited.
  // A network error or upstream timeout on the last key isn't a rate limit —
  // reporting it as one made the client's rate-limit cooldown retry (up to 5x,
  // 60s each) kick in for a problem that retrying identically won't fix,
  // which read to the user as the backtest "just hanging".
  if (lastWasRateLimit) {
    return {
      response: new Response(JSON.stringify(lastData), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "60" },
      }),
      data: lastData ?? {
        status: "error",
        message: "Rate limited on all configured Twelve Data keys",
      },
    };
  }

  return {
    response: new Response(null, { status: 502 }),
    data: lastData ?? {
      status: "error",
      message: "Twelve Data unreachable on every configured key",
    },
  };
}

/** Proxy market-data requests through the server so provider credentials never enter the client bundle. */
export async function requestMarketData(
  request: MarketDataRequest,
): Promise<{ response: Response; data: MarketDataJson }> {
  const { signal, ...body } = request;
  const response = await fetch("/api/market-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // Forwarded to the same-origin proxy; lets the Stop button cancel an
    // in-flight provider call instead of waiting for its 20s timeout.
    signal,
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
