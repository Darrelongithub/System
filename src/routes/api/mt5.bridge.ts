import { createFileRoute } from "@tanstack/react-router";
import { mt5Engine } from "@/lib/mt5/engine";
import { unauthorizedBridgeResponse, verifyBridgeToken } from "@/lib/mt5/bridge-auth";

/**
 * Endpoint for MetaTrader 5 Expert Advisor (SignalFinderBridge.mq5) WebRequest communication.
 * EA sends account balance, equity, and open positions, and receives queued trade orders.
 *
 * SECURITY: this is the only endpoint whose responses can trigger real broker
 * orders (the EA executes whatever commands it receives here). Both verbs
 * therefore start with the Bearer-token check — a missing, malformed, or
 * stale token gets a 401 telling the user to re-download the EA (the token
 * rotates on server restart; a fresh download always embeds the current one).
 */
export const Route = createFileRoute("/api/mt5/bridge")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!verifyBridgeToken(request.headers.get("authorization"))) {
          return unauthorizedBridgeResponse();
        }
        const commands = mt5Engine.getPendingCommands();
        return new Response(JSON.stringify({ status: "ok", commands }), {
          headers: { "Content-Type": "application/json" },
        });
      },
      POST: async ({ request }) => {
        if (!verifyBridgeToken(request.headers.get("authorization"))) {
          return unauthorizedBridgeResponse();
        }
        try {
          const body = await request.json();

          if (body.action === "sync") {
            mt5Engine.syncFromEa(body);
          }

          // Return pending commands to the EA and flush them
          const commands = [...mt5Engine.getPendingCommands()];
          mt5Engine.clearPendingCommands();

          return new Response(
            JSON.stringify({
              status: "ok",
              commands,
              serverTime: new Date().toISOString(),
            }),
            {
              headers: { "Content-Type": "application/json" },
            },
          );
        } catch (error) {
          return new Response(JSON.stringify({ status: "error", message: String(error) }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
