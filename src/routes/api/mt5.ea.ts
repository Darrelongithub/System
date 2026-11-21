import { createFileRoute } from "@tanstack/react-router";
import { generateMql5EaSource } from "@/lib/mt5/mql5-ea";
import { mt5Engine } from "@/lib/mt5/engine";

export const Route = createFileRoute("/api/mt5/ea")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const type = url.searchParams.get("type") || "bridge";
        const creds = mt5Engine.getCredentials();
        const config = mt5Engine.getConfig();

        const origin = url.origin;
        const bridgeUrl = `${origin}/api/mt5/bridge`;

        if (type === "bridge") {
          const source = generateMql5EaSource({
            serverUrl: bridgeUrl,
            authToken: creds.apiToken || "sfp-default-token",
            magicNumber: config.magicNumber || 992200,
          });

          return new Response(source, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Content-Disposition": 'attachment; filename="SignalFinderBridge.mq5"',
            },
          });
        }

        // The standalone 24/7 EA was retired (v2.0): it carried hardcoded v1.8
        // strategies and never parity-executed the bridge engine. Live trading
        // now exclusively uses the parity-exact Bridge EA + Server Daemon.
        return new Response(
          JSON.stringify({
            error:
              "Standalone EA retired in v2.0. Live trading exclusively uses the parity-exact Bridge EA (SignalFinderBridge.mq5) + Server Daemon — switch to ?type=bridge.",
          }),
          { status: 410, headers: { "Content-Type": "application/json; charset=utf-8" } },
        );
      },
    },
  },
});
