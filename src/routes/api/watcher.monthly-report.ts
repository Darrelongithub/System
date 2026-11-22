import { createFileRoute } from "@tanstack/react-router";
import { buildMonthlyMaintenanceReport } from "@/lib/watcher/monthly-report";

export const Route = createFileRoute("/api/watcher/monthly-report")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const month = url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
        try {
          const markdown = await buildMonthlyMaintenanceReport(month);
          return new Response(markdown, {
            headers: {
              "Content-Type": "text/markdown; charset=utf-8",
              "Content-Disposition": `attachment; filename="watcher-maintenance-${month}.md"`,
            },
          });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Report generation failed" },
            { status: 400 },
          );
        }
      },
    },
  },
});
