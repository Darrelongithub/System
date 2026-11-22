import { createFileRoute } from "@tanstack/react-router";
import { ensureServerEnv } from "@/lib/server-env";
import { mt5Engine } from "@/lib/mt5/engine";
import { newsManager } from "@/lib/mt5/news-filter";
import { getFredMacroSnapshot } from "@/lib/watcher/fred-macro";
import { appendTradeJournal, readTradeJournal } from "@/lib/watcher/trade-journal";
import { reviewTrade } from "@/lib/watcher/gemini-watcher";

async function syncClosedTrades() {
  const macro = await getFredMacroSnapshot();
  const news = newsManager
    .getUpcomingHighImpactEvents(48)
    .map((event) => `${event.currency} ${event.title} ${event.datetime}`);
  const mt5Logs = mt5Engine.getLogs();
  for (const position of mt5Engine.getClosedPositions()) {
    const fillIndex = mt5Logs.findIndex(
      (log) => log.type === "ORDER_FILLED" && log.details?.["ticket"] === position.ticket,
    );
    const nearbyOrder =
      fillIndex >= 0
        ? mt5Logs
            .slice(fillIndex)
            .find(
              (log) =>
                log.type === "ORDER_SENT" &&
                log.strategy === position.strategyName &&
                log.symbol === position.symbol,
            )
        : undefined;
    const request = nearbyOrder?.details?.["req"] as Record<string, unknown> | undefined;
    const signalPrice = typeof request?.["price"] === "number" ? request["price"] : undefined;
    const isBuy = position.type === "BUY";
    const priceRisk = Math.abs(position.openPrice - position.sl);
    const realizedR =
      priceRisk > 0
        ? (isBuy
            ? position.currentPrice - position.openPrice
            : position.openPrice - position.currentPrice) / priceRisk
        : null;
    const timestamp = new Date().toISOString();
    const appended = await appendTradeJournal(
      {
        timestamp,
        eventId: `mt5-${position.ticket}-${position.strategyId}-${position.openTime}`,
        symbol: position.symbol,
        strategyId: position.strategyId,
        strategyName: position.strategyName,
        side: position.type,
        entry: position.openPrice,
        signalPrice,
        fillPrice: position.openPrice,
        exit: position.currentPrice,
        sl: position.sl,
        tp: position.tp,
        ...(realizedR === null ? {} : { realizedR }),
        regime: "Unavailable in public MT5 position telemetry",
        volatility: "Unavailable in public MT5 position telemetry",
        upcomingNews: news,
        profit: position.profit,
        commission: position.commission,
        swap: position.swap,
      },
      macro,
    );
    if (appended.created) void reviewTrade(appended.entry).catch(() => undefined);
  }
}

export const Route = createFileRoute("/api/watcher/journal")({
  server: {
    handlers: {
      GET: async () => {
        await ensureServerEnv();
        try {
          await syncClosedTrades();
          const month = new Date().toISOString().slice(0, 7);
          const lines = await readTradeJournal(month);
          const hasReview = lines.some((line) => line.kind === "review");
          const aiStatus = !process.env["GEMINI_API_KEY"]
            ? "disabled_no_key"
            : hasReview
              ? "ok"
              : "error";
          return Response.json({ aiStatus, lines: lines.slice(-150).reverse() });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "journal unavailable", lines: [] },
            { status: 500 },
          );
        }
      },
    },
  },
});
