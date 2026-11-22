import type { MT5TradingEngine } from "./engine";
import type { MT5TradeLogEntry } from "./types";
import { newsManager } from "./news-filter";

export interface TelegramOptions {
  token: string;
  allowedChatId: string;
  engine: MT5TradingEngine;
  daemonHealth: () => string;
  fetcher?: typeof fetch;
  now?: () => number;
}

/** Optional, server-only polling. No secrets are logged or included in errors. */
export function createTelegramController(options: TelegramOptions) {
  const { token, allowedChatId, engine, daemonHealth, fetcher = fetch, now = Date.now } = options;
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token) || !/^-?\d+$/.test(allowedChatId))
    throw new Error("Invalid Telegram configuration");
  let running = false;
  let nextPollAt = 0;
  const api = `https://api.telegram.org/bot${token}`;
  async function send(message: string) {
    try {
      const response = await fetcher(`${api}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: allowedChatId, text: message.slice(0, 3900) }),
        signal: AbortSignal.timeout(4000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  function statusText() {
    const a = engine.getAccountInfo(),
      risk = engine.getRiskStatus(),
      crash = engine.getCrashGuardStatus();
    const upcoming = newsManager
      .getUpcomingHighImpactEvents(48)
      .filter((e) => e.currency.toUpperCase() === "USD")[0];
    const daily = risk ? a.equity - risk.dayBaseline : null;
    return `MT5 status\nEquity: ${a.equity.toFixed(2)} ${a.currency}\nPositions: ${engine.getPositions().length}\nDaily equity change vs high-water: ${daily === null ? "unknown" : daily.toFixed(2)}\nDrawdown brake: ${crash.multiplier ?? "unknown"}x\nNext USD news: ${upcoming ? `${upcoming.title} ${upcoming.datetime}` : `unknown (${newsManager.getStatus()})`}\nDaemon: ${daemonHealth()}`;
  }
  async function handle(text: string) {
    const command = text.trim().split(/\s+/)[0]?.split("@")[0]?.toLowerCase();
    if (command === "/status") await send(statusText());
    else if (command === "/pause") {
      engine.setConfig({ enabled: false });
      await send("MT5 paused. Existing stops remain active.");
    } else if (command === "/resume") {
      await send(
        engine.resumeTrading()
          ? "MT5 automation resumed."
          : "Resume refused: risk lock, stale telemetry/history, persistence failure, or outstanding emergency positions.",
      );
    } else if (command === "/kill") {
      engine.emergencyStop();
      await send(
        "EMERGENCY STOP: entries disabled; close requests queued. Broker confirmation is required.",
      );
    }
  }
  async function pollOnce() {
    if (running || now() < nextPollAt) return;
    running = true;
    try {
      const offset = engine.getTelegramOffset();
      const response = await fetcher(`${api}/getUpdates?timeout=0&offset=${offset}`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) {
        nextPollAt = now() + 60000;
        return;
      }
      const body = (await response.json()) as {
        ok?: boolean;
        result?: Array<{
          update_id?: number;
          message?: { chat?: { id?: number | string }; text?: string; date?: number };
        }>;
      };
      if (!body.ok || !Array.isArray(body.result)) {
        nextPollAt = now() + 60000;
        return;
      }
      for (const update of body.result) {
        if (
          !Number.isSafeInteger(update.update_id) ||
          update.update_id! < engine.getTelegramOffset()
        )
          continue;
        const m = update.message;
        if (
          m &&
          String(m.chat?.id) === allowedChatId &&
          typeof m.text === "string" &&
          typeof m.date === "number" &&
          Math.abs(now() - m.date * 1000) <= 120000
        )
          await handle(m.text);
        engine.setTelegramOffset(update.update_id! + 1);
      }
    } catch {
      nextPollAt = now() + 60000;
    } finally {
      running = false;
    }
  }
  function notify(entry: MT5TradeLogEntry) {
    const m = entry.message;
    if (
      entry.type !== "ORDER_FILLED" &&
      entry.type !== "POSITION_CLOSED" &&
      !/NEWS|news|spread|CIRCUIT BREAKER|drawdown lock|TELEGRAM KILL/i.test(m)
    )
      return;
    const crash = engine.getCrashGuardStatus();
    const req = entry.details?.["req"] as { volume?: number; sl?: number; tp?: number } | undefined;
    const detail = req
      ? ` Lots ${req.volume ?? "?"} SL ${req.sl ?? "?"} TP ${req.tp ?? "?"} Spread ${entry.details?.["spread"] ?? "unknown"}`
      : "";
    void send(
      `${entry.type}: ${entry.symbol} ${m}${detail}\nEquity ${engine.getAccountInfo().equity.toFixed(2)}; brake ${crash.multiplier ?? "unknown"}x`,
    );
  }
  return { pollOnce, notify, statusText };
}
