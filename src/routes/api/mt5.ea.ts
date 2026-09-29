import { createFileRoute } from "@tanstack/react-router";
import { generateMql5EaSource } from "@/lib/mt5/mql5-ea";
import { generateStandalone247EaSource } from "@/lib/mt5/standalone-ea";
import { mt5Engine } from "@/lib/mt5/engine";

export const Route = createFileRoute("/api/mt5/ea")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const type = url.searchParams.get("type") || "standalone";
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

        // Default: Standalone 24/7 Autotrader EA
        const source = generateStandalone247EaSource({
          magicNumber: config.magicNumber || 992200,
          riskPct: config.riskPct || 1.0,
          fixedLot: config.fixedLot || 0.1,
          minRr: config.minRr || 2.0,
          syncServerUrl: bridgeUrl,
          authToken: creds.apiToken || "sfp-default-token",
        });

        return new Response(source, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": 'attachment; filename="SignalFinderPro_247_Autotrader.mq5"',
          },
        });
      },
    },
  },
});
