import { createFileRoute } from "@tanstack/react-router";
import { ensureServerEnv } from "@/lib/server-env";
import { collectTwelveDataKeys } from "./market-data";

/**
 * GET /api/market-data/health — reports how many Twelve Data keys are
 * configured on the server, without ever exposing key material. Lets anyone
 * answer "are my keys loaded?" from a browser tab instead of guessing from a
 * backtest's rate-limit message.
 */
export const Route = createFileRoute("/api/market-data/health")({
  server: {
    handlers: {
      GET: async () => {
        await ensureServerEnv();
        const keys = collectTwelveDataKeys();
        return new Response(
          JSON.stringify({
            ok: keys.length > 0,
            keysConfigured: keys.length,
            // Masked fingerprints let you tell WHICH keys loaded without leaking them.
            fingerprints: keys.map((key) => `${key.slice(0, 4)}…${key.slice(-2)}`),
            hint:
              keys.length === 0
                ? "Set TWELVE_DATA_API_KEYS=k1,k2,k3 (local: .env at repo root; deployed: platform env vars)."
                : undefined,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
