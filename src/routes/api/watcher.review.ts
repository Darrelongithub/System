import { createFileRoute } from "@tanstack/react-router";
import { readTradeJournal } from "@/lib/watcher/trade-journal";
import { ensureServerEnv } from "@/lib/server-env";
import { reviewTrade } from "@/lib/watcher/gemini-watcher";

export const Route = createFileRoute("/api/watcher/review")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await ensureServerEnv();
          const body = (await request.json()) as { eventId?: unknown; month?: unknown };
          if (typeof body.eventId !== "string" || typeof body.month !== "string")
            return Response.json(
              { aiStatus: "error", error: "eventId and month required" },
              { status: 400 },
            );
          const lines = await readTradeJournal(body.month);
          const line = lines.find(
            (item) => item.kind === "trade" && item.eventId === body.eventId && item.entry,
          );
          if (!line?.entry)
            return Response.json({ aiStatus: "error", error: "trade not found" }, { status: 404 });
          const result = await reviewTrade(line.entry);
          return Response.json(result, { status: result.aiStatus === "error" ? 502 : 200 });
        } catch (error) {
          return Response.json(
            { aiStatus: "error", error: error instanceof Error ? error.message : "review failed" },
            { status: 400 },
          );
        }
      },
    },
  },
});
