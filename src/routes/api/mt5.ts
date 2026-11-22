import { createFileRoute } from "@tanstack/react-router";
import { mt5Engine } from "@/lib/mt5/engine";
import { serverDaemon } from "@/lib/mt5/server-daemon";
import { verifyAdminRequest, adminUnauthorized } from "@/lib/mt5/admin-auth";
import { newsManager } from "@/lib/mt5/news-filter";

export const Route = createFileRoute("/api/mt5")({
  server: {
    handlers: {
      GET: async () => {
        void newsManager.refresh();
        const account = mt5Engine.getAccountInfo();
        const positions = mt5Engine.getPositions();
        const closed = mt5Engine.getClosedPositions();
        const config = mt5Engine.getConfig();
        const logs = mt5Engine.getLogs().slice(0, 100);
        const daemon = serverDaemon.getStatus();
        const upcomingNews = newsManager.getUpcomingHighImpactEvents(48);

        return new Response(
          JSON.stringify({
            status: "ok",
            account,
            positions,
            closed,
            config,
            logs,
            daemon,
            upcomingNews,
            calendarStatus: newsManager.getStatus(),
            calendarLastFetched: newsManager.getLastFetched(),
            risk: mt5Engine.getRiskStatus(),
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      },
      POST: async ({ request }) => {
        if (!verifyAdminRequest(request)) return adminUnauthorized();
        try {
          const body = await request.json();
          const action = body.action;

          if (action === "manual_news") {
            newsManager.setManualEvents(body.events);
            return new Response(JSON.stringify({ status: "ok" }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          if (action === "update_config") {
            mt5Engine.setConfig(body.config || {});
            if (mt5Engine.getConfig().enabled && !process.env["MT5_ADMIN_TOKEN"])
              console.warn("[MT5] WARNING: auto-trading enabled without MT5_ADMIN_TOKEN");
            return new Response(
              JSON.stringify({
                status: "ok",
                config: mt5Engine.getConfig(),
                daemon: serverDaemon.getStatus(),
              }),
              { headers: { "Content-Type": "application/json" } },
            );
          }

          if (action === "update_credentials") {
            const incoming =
              body.credentials && typeof body.credentials === "object"
                ? { ...body.credentials }
                : {};
            // Never accept or echo a broker password. The terminal owns the login.
            delete incoming.password;
            mt5Engine.setCredentials(incoming);
            const { password: _neverReturned, ...credentials } = mt5Engine.getCredentials();
            return new Response(JSON.stringify({ status: "ok", credentials }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          if (action === "start_daemon") {
            serverDaemon.start();
            return new Response(
              JSON.stringify({ status: "ok", daemon: serverDaemon.getStatus() }),
              { headers: { "Content-Type": "application/json" } },
            );
          }

          if (action === "stop_daemon") {
            serverDaemon.stop();
            return new Response(
              JSON.stringify({ status: "ok", daemon: serverDaemon.getStatus() }),
              { headers: { "Content-Type": "application/json" } },
            );
          }

          if (action === "order") {
            const result = mt5Engine.placeOrder(body.order);
            return new Response(JSON.stringify(result), {
              headers: { "Content-Type": "application/json" },
            });
          }

          if (action === "close") {
            const ok = mt5Engine.closePosition(Number(body.ticket));
            return new Response(JSON.stringify({ ok }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          return new Response(
            JSON.stringify({ status: "error", message: `Unknown action: ${action}` }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        } catch (error) {
          return new Response(JSON.stringify({ status: "error", message: String(error) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
