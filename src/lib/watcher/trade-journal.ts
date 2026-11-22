import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FredSnapshot, JournalLine, TradeJournalEntry } from "./types";

const LOG_DIR = join(process.cwd(), "logs");
const monthOf = (iso: string) => iso.slice(0, 7);
const journalPath = (month: string) => join(LOG_DIR, `live-trade-journal-${month}.jsonl`);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const safe = (v: unknown, max = 400): string =>
  typeof v === "string" ? v.replace(/[\r\n\u0000]/g, " ").slice(0, max) : "";

export interface JournalTradeInput {
  timestamp?: string;
  eventId?: string;
  symbol: string;
  strategyId: string;
  strategyName?: string;
  side: string;
  entry?: number;
  exit?: number;
  sl?: number;
  tp?: number;
  signalPrice?: number;
  fillPrice?: number;
  spread?: number;
  realizedR?: number;
  regime?: string;
  volatility?: string;
  upcomingNews?: string[];
  profit?: number;
  commission?: number;
  swap?: number;
}

export async function appendTradeJournal(
  input: JournalTradeInput,
  macro: FredSnapshot,
): Promise<{ entry: TradeJournalEntry; created: boolean }> {
  const timestamp =
    input.timestamp && !Number.isNaN(Date.parse(input.timestamp))
      ? new Date(input.timestamp).toISOString()
      : new Date().toISOString();
  const identity = [
    timestamp,
    input.symbol,
    input.strategyId,
    input.side,
    input.entry,
    input.exit,
  ].join("|");
  const eventId = input.eventId
    ? safe(input.eventId, 120)
    : createHash("sha256").update(identity).digest("hex").slice(0, 24);
  const signal = num(input.signalPrice),
    fill = num(input.fillPrice);
  const entry: TradeJournalEntry = {
    schemaVersion: 1,
    eventId,
    timestamp,
    symbol: safe(input.symbol, 32),
    strategyId: safe(input.strategyId, 100),
    strategyName: safe(input.strategyName ?? input.strategyId, 120),
    side: safe(input.side, 16),
    entry: num(input.entry),
    exit: num(input.exit),
    sl: num(input.sl),
    tp: num(input.tp),
    signalPrice: signal,
    fillPrice: fill,
    signalVsFillSlippage: signal !== null && fill !== null ? fill - signal : null,
    spread: num(input.spread),
    realizedR: num(input.realizedR),
    regime: safe(input.regime, 80) || null,
    volatility: safe(input.volatility, 80) || null,
    upcomingNews: (input.upcomingNews ?? []).slice(0, 12).map((news) => safe(news, 180)),
    macro,
    profit: num(input.profit),
    commission: num(input.commission),
    swap: num(input.swap),
  };
  const path = journalPath(monthOf(timestamp));
  await mkdir(LOG_DIR, { recursive: true });
  let exists = false;
  try {
    const lines = (await readFile(path, "utf8")).split(/\r?\n/);
    exists = lines.some((line) => {
      try {
        return JSON.parse(line).eventId === eventId;
      } catch {
        return false;
      }
    });
  } catch {
    /* first journal for this month */
  }
  if (!exists)
    await appendFile(
      path,
      `${JSON.stringify({ kind: "trade", eventId, entry } satisfies JournalLine)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  return { entry, created: !exists };
}

export async function appendGeminiReview(
  eventId: string,
  review: JournalLine["review"],
  tradeTimestamp?: string,
): Promise<void> {
  if (!review) return;
  const month =
    tradeTimestamp && !Number.isNaN(Date.parse(tradeTimestamp))
      ? new Date(tradeTimestamp).toISOString().slice(0, 7)
      : new Date(review.reviewedAt).toISOString().slice(0, 7);
  await mkdir(LOG_DIR, { recursive: true });
  await appendFile(
    journalPath(month),
    `${JSON.stringify({ kind: "review", eventId, review } satisfies JournalLine)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

export async function readTradeJournal(month: string): Promise<JournalLine[]> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("month must be YYYY-MM");
  try {
    const text = await readFile(journalPath(month), "utf8");
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed = JSON.parse(line) as JournalLine;
          return parsed && typeof parsed.eventId === "string" ? [parsed] : [];
        } catch {
          return [];
        }
      });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
