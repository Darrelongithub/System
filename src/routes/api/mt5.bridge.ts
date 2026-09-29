import { createFileRoute } from "@tanstack/react-router";
import { mt5Engine } from "@/lib/mt5/engine";

/**
 * Endpoint for MetaTrader 5 Expert Advisor (SignalFinderBridge.mq5) WebRequest communication.
 * EA sends account balance, equity, and open positions, and receives queued trade orders.
 */
export const Route = createFileRoute("/api/mt5/bridge")({
  server: {
    handlers: {
      GET: async () => {
        const commands = mt5Engine.getPendingCommands();
        return new Response(JSON.stringify({ status: "ok", commands }), {
          headers: { "Content-Type": "application/json" },
        });
      },
      POST: async ({ request }) => {
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
