import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * AI debate endpoint — Gemini integration removed from production.
 * Manual signal / analyzer paths are unchanged. Non-Gemini providers
 * remain available via the verifier panel where configured.
 */
const RequestSchema = z.object({
  symbol: z.string().min(1),
  range: z.string().default(""),
  ohlcCsv: z.string().nullable().default(null),
  charts: z
    .array(
      z.object({
        name: z.string(),
        timeframe: z.string(),
        pngDataUrl: z.string(),
      }),
    )
    .default([]),
  summaryFields: z.string().min(1),
});

async function handle(request: Request): Promise<Response> {
  try {
    RequestSchema.parse(await request.json());
  } catch (error) {
    return Response.json(
      { status: "error", message: `Invalid request: ${String(error)}` },
      { status: 400 },
    );
  }
  return Response.json(
    {
      status: "disabled",
      message:
        "Gemini AI debate integration is removed from this production package. Use manual signal review and the non-Gemini verifier providers (OpenRouter / NVIDIA / Lovable) if configured.",
    },
    { status: 503 },
  );
}

export const Route = createFileRoute("/api/analysis")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});
