import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AVAILABLE_SYMBOLS } from "@/lib/market-data";
import { ensureServerEnv } from "@/lib/server-env";

const RequestSchema = z.object({
  symbol: z.string().min(1),
  interval: z.enum(["30min", "1h", "4h"]),
  start_date: z.string().min(1),
  end_date: z.string().min(1).optional(),
  timezone: z.literal("Africa/Nairobi"),
  outputsize: z
    .string()
    .regex(/^\d+$/)
    .refine((value) => {
      const n = Number(value);
      return n >= 1 && n <= 5000;
    }, "outputsize must be between 1 and 5000"),
});

/**
 * Twelve Data keys are the ONLY candle providers. Supports all layouts:
 * TWELVE_DATA_API_KEYS (CSV list), TWELVE_DATA_API_KEY, and suffixed singles
 * TWELVE_DATA_API_KEY_1..N. Order is stable and deductions are deduped.
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

function configuredKeys(): string[] {
  return collectTwelveDataKeys();
}

/**
 * Twelve Data has no documented upstream timeout; a stalled TCP connection
 * (not a clean error, not a 429) would otherwise hang this request — and
 * every retry loop above it in ohlc-generator.ts — indefinitely, with no log
 * line and no way for the UI's Stop button to intervene. 20s is generous for
 * a JSON candle response but still bounded.
 */
const UPSTREAM_TIMEOUT_MS = 20_000;

function isRateLimited(response: Response, data: any): boolean {
  const message = String(data?.message ?? "").toLowerCase();
  return (
    response.status === 429 ||
    data?.code === 429 ||
    (data?.status === "error" && message.includes("credit"))
  );
}

async function proxy(request: Request): Promise<Response> {
  await ensureServerEnv(); // .env defaults; platform env wins; edge-safe no-op without fs
  try {
    return await proxyInner(request);
  } catch (error) {
    // Provider transports can throw (DNS/TLS/offline hosts); a route must's
    // failure surface stays structured JSON — never an HTML stack page — so
    // callers can show the real reason instead of a generic "no data".
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        status: "error",
        message: `market data providers unreachable: ${message.slice(0, 160)}`,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
}

async function proxyInner(request: Request): Promise<Response> {
  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await request.json());
  } catch (error) {
    return new Response(
      JSON.stringify({ status: "error", message: `Invalid request: ${String(error)}` }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (!AVAILABLE_SYMBOLS.includes(body.symbol)) {
    return new Response(JSON.stringify({ status: "error", message: "Unsupported symbol" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const keys = configuredKeys();
  const keys0 = keys;
  if (keys0.length === 0) {
    return new Response(
      JSON.stringify({
        status: "error",
        message:
          "No candle provider is configured on the server (set TWELVE_DATA_API_KEYS, TWELVE_DATA_API_KEY, or TWELVE_DATA_API_KEY_1..N).",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  let lastData: any = undefined;
  let lastWasRateLimit = false;
  for (const key of keys) {
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
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      lastData = {
        status: "error",
        message: timedOut
          ? `Twelve Data did not respond within ${UPSTREAM_TIMEOUT_MS / 1000}s`
          : `Twelve Data request failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      lastWasRateLimit = false;
      continue; // try the next configured key, same as a rate-limit fallthrough
    }
    const data = await response.json().catch(() => ({}));
    lastData = data;
    const rateLimited = isRateLimited(response, data);
    lastWasRateLimit = rateLimited;
    if (!rateLimited) {
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Only report 429/Retry-After when every key was genuinely rate-limited.
  // A network error or upstream timeout on the last key isn't a rate limit —
  // reporting it as one made the client's rate-limit cooldown retry (up to 5x,
  // 60s each) kick in for a problem that retrying identically won't fix,
  // which read to the user as the backtest "just hanging".
  return new Response(
    JSON.stringify(
      lastData ?? { status: "error", message: "Rate limited on all configured Twelve Data keys" },
    ),
    {
      status: lastWasRateLimit ? 429 : 502,
      headers: {
        "Content-Type": "application/json",
        ...(lastWasRateLimit ? { "Retry-After": "60" } : {}),
      },
    },
  );
}

export const Route = createFileRoute("/api/market-data")({
  server: { handlers: { POST: ({ request }) => proxy(request) } },
});
