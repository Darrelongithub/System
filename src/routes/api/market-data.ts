import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  AVAILABLE_SYMBOLS,
  collectTwelveDataKeys,
  fetchTwelveDataCandles,
  redactSecrets,
} from "@/lib/market-data";
import { ensureServerEnv } from "@/lib/server-env";

// The health route and tests/server-env.test.mjs import the key collector
// from this route module; the implementation itself lives in the shared
// library so the MT5 daemon and this proxy use one code path.
export { collectTwelveDataKeys };

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
 * Thin validated proxy: validation happens here, the actual provider call
 * (key rotation, rate-limit classification, redaction, timeouts) lives in
 * `fetchTwelveDataCandles` (src/lib/market-data.ts) — the same function the
 * MT5 server daemon injects into the OHLC pipeline, so browser fetches and
 * the daemon share one exact provider code path.
 */
async function proxy(request: Request): Promise<Response> {
  await ensureServerEnv(); // .env defaults; platform env wins; edge-safe no-op without fs
  try {
    return await proxyInner(request);
  } catch (error) {
    // Provider transports can throw (DNS/TLS/offline hosts); a route's
    // failure surface stays structured JSON — never an HTML stack page — so
    // callers can show the real reason instead of a generic "no data".
    const rawMessage = error instanceof Error ? error.message : String(error);
    // Defense in depth: the keys only live in the upstream query string, but
    // never let a stringified URL/request detail echo one back to the client.
    const message = redactSecrets(rawMessage, collectTwelveDataKeys());
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
    // String(new ZodError) serializes the ENTIRE issue tree, including the
    // untrusted received values; report concise path/message pairs instead and
    // cap the length so a malformed body cannot blow up the response.
    const detail =
      error instanceof z.ZodError
        ? error.issues
            .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
            .join("; ")
        : String(error);
    return new Response(
      JSON.stringify({ status: "error", message: `Invalid request: ${detail.slice(0, 300)}` }),
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

  const { response, data } = await fetchTwelveDataCandles(body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (response.status === 429) {
    headers["Retry-After"] = response.headers.get("Retry-After") ?? "60";
  }
  return new Response(JSON.stringify(data), { status: response.status, headers });
}

export const Route = createFileRoute("/api/market-data")({
  server: { handlers: { POST: ({ request }) => proxy(request) } },
});
