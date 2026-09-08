/**
 * Server-side support for the Gemini Console page.
 *
 * Everything here runs on the server only: API keys stay in the environment,
 * audit files are read from (and console decisions appended to) output/.
 * Nothing returned from this module contains key material.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  openSync,
  writeSync,
  closeSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, resolve, sep } from "node:path";
import { z } from "zod";
import { parseCsv } from "@/lib/analyzer/parse";
import { generateGemini, loadGeminiConfig, GeminiError, type GeminiConfig } from "./gemini.api";
import { EvidenceContext, type CandleLike } from "./select/evidence";
import { normalizeEventFile, visibleNews, type CalendarEvent } from "./select/news";
import {
  makeLiveCaller,
  selectAtDecision,
  loadSystemPrompt,
  type SelectionRecord,
} from "./select/selector";
import { decisionTimestamps } from "./select/windows";
import { actionableAt } from "./select/candidates";
import type { TruthTradeFull } from "./select/evaluate";

// Resolved lazily: on edge/worker runtimes `import.meta.url` is not a valid
// file URL, and evaluating this at module scope threw "Invalid URL string",
// which broke SSR for every route (routeTree imports all API routes).
function repoRoot(): string {
  try {
    return fileURLToPath(new URL("../../..", import.meta.url));
  } catch {
    return process.cwd();
  }
}

export function outputDir(): string {
  return resolve(repoRoot(), "output");
}
export const CONSOLE_AUDIT_FILE = "gemini-console.jsonl";

/* ------------------------------------------------------------------ *
 * Status                                                             *
 * ------------------------------------------------------------------ */

export interface AiConsoleStatus {
  geminiConfigured: boolean;
  geminiModel: string;
  finnhubConfigured: boolean;
  promptVersion: string;
  baseline: { candles: number; trades: number; from: string; to: string } | null;
  outputFiles: number;
}

export function aiConsoleStatus(): AiConsoleStatus {
  let geminiModel = "gemini";
  let geminiConfigured = false;
  try {
    const config = loadGeminiConfig();
    geminiConfigured = Boolean(config.apiKey);
    geminiModel = config.model;
  } catch {
    geminiConfigured = false;
  }
  let promptVersion = "unknown";
  try {
    promptVersion = loadSystemPrompt().version;
  } catch {
    promptVersion = "missing";
  }
  let baseline: AiConsoleStatus["baseline"] = null;
  try {
    const ctx = consoleContext();
    baseline = {
      candles: ctx.candles.length,
      trades: ctx.truth.length,
      from: ctx.candles[0]?.datetime ?? "?",
      to: ctx.candles[ctx.candles.length - 1]?.datetime ?? "?",
    };
  } catch {
    baseline = null;
  }
  return {
    geminiConfigured,
    geminiModel,
    finnhubConfigured: Boolean(process.env["FINNHUB_API_KEY"] ?? ""),
    promptVersion,
    baseline,
    outputFiles: listAuditFiles().length,
  };
}

/* ------------------------------------------------------------------ *
 * Cached console context (artifacts are read-only)                   *
 * ------------------------------------------------------------------ */

interface ConsoleContext {
  candles: CandleLike[];
  datetimes: string[];
  truth: TruthTradeFull[];
  ctx: EvidenceContext;
}

let cachedContext: ConsoleContext | undefined;

export function consoleContext(): ConsoleContext {
  if (cachedContext) return cachedContext;
  const csv = readFileSync(resolve(repoRoot(), "artifacts/baseline-xauusd-ohlc.csv"), "utf8");
  const parsed = parseCsv(csv);
  const candles: CandleLike[] = parsed.candles
    .filter(
      (c) =>
        c.open !== undefined &&
        c.high !== undefined &&
        c.low !== undefined &&
        c.close !== undefined,
    )
    .map((c) => ({
      datetime: c.datetime,
      open: c.open!,
      high: c.high!,
      low: c.low!,
      close: c.close!,
    }));
  if (candles.length === 0) throw new Error("baseline CSV parsed to zero usable candles");
  const truth = JSON.parse(
    readFileSync(resolve(repoRoot(), "artifacts/golden-trades.json"), "utf8"),
  ) as TruthTradeFull[];
  cachedContext = {
    candles,
    datetimes: candles.map((c) => c.datetime),
    truth,
    ctx: new EvidenceContext(candles),
  };
  return cachedContext;
}

/* ------------------------------------------------------------------ *
 * Audit activity                                                     *
 * ------------------------------------------------------------------ */

export interface AuditFileInfo {
  file: string;
  records: number;
  mtimeMs: number;
  bytes: number;
  latestTimestamp: string | undefined;
}

export function listAuditFiles(): AuditFileInfo[] {
  if (!existsSync(outputDir())) return [];
  const out: AuditFileInfo[] = [];
  for (const name of readdirSync(outputDir())) {
    if (!name.endsWith(".jsonl") || !name.startsWith("gemini-")) continue;
    const path = resolve(outputDir(), name);
    let records = 0;
    let latestTimestamp: string | undefined;
    try {
      const text = readFileSync(path, "utf8");
      for (const line of text.split("\n")) {
        const t = line.trim();
        if (!t) continue;
        records++;
        try {
          const rec = JSON.parse(t) as { decisionTimestamp?: string };
          if (rec.decisionTimestamp) latestTimestamp = rec.decisionTimestamp;
        } catch {
          /* tolerate a partially-written trailing line */
        }
      }
    } catch {
      continue;
    }
    const st = statSync(path);
    out.push({ file: name, records, mtimeMs: st.mtimeMs, bytes: st.size, latestTimestamp });
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

const auditFileGuard = z
  .string()
  .min(1)
  .max(120)
  .regex(
    /^gemini-(select|research|console)(-[0-9T:\-.a-zA-Z]+)?\.jsonl$/,
    "unknown audit file name",
  );

/** Read the tail records of an audit file. Path traversal is rejected by construction. */
export function tailAuditRecords(file: string, count: number): SelectionRecord[] {
  const parsed = auditFileGuard.safeParse(basename(file));
  if (!parsed.success) return []; // fail closed: unknown/traversal-shaped names read nothing
  const path = resolve(outputDir(), parsed.data);
  if (!path.startsWith(outputDir() + sep) || !existsSync(path)) return [];
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim());
  const tail = lines.slice(-Math.max(1, Math.min(count, 200)));
  const out: SelectionRecord[] = [];
  for (const line of tail) {
    try {
      out.push(JSON.parse(line) as SelectionRecord);
    } catch {
      /* skip a partially-written trailing line */
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Ping                                                               *
 * ------------------------------------------------------------------ */

export interface PingResult {
  ok: boolean;
  model?: string;
  latencyMs?: number;
  attempts?: number;
  text?: string;
  error?: string;
  errorKind?: string;
}

export async function pingGemini(config?: GeminiConfig): Promise<PingResult> {
  const cfg = config ?? loadGeminiConfig();
  if (!cfg.apiKey) return { ok: false, error: "GEMINI_API_KEY not configured", errorKind: "auth" };
  try {
    const res = await generateGemini(cfg, {
      systemPrompt: "You are a health probe. Reply with STRICT JSON only.",
      userPrompt: 'Return exactly: {"pong":true}',
      maxOutputTokens: 32,
      temperature: 0,
    });
    return {
      ok: true,
      model: res.model,
      latencyMs: res.latencyMs,
      attempts: res.attempts,
      text: res.text.slice(0, 400),
    };
  } catch (error) {
    if (error instanceof GeminiError)
      return { ok: false, error: error.message, errorKind: error.kind };
    return { ok: false, error: String(error), errorKind: "network" };
  }
}

/* ------------------------------------------------------------------ *
 * Console decision probe (1 model call for live; appends to audit)   *
 * ------------------------------------------------------------------ */

export interface ConsoleDecisionRequest {
  timestamp: string;
  live: boolean;
}

export interface ConsoleDecisionResponse {
  ok: boolean;
  record: SelectionRecord;
  news: "file" | "finnhub" | "none";
  auditFile: string;
}

/** Load console calendar events: FINNHUB_API_KEY local cache file if present (documented escape hatch for research). */
export function loadConsoleNewsEvents(): {
  events: CalendarEvent[] | undefined;
  source: "file" | "finnhub" | "none";
} {
  const cachePath = resolve(outputDir(), "news-events.json");
  if (existsSync(cachePath)) {
    try {
      return {
        events: normalizeEventFile(JSON.parse(readFileSync(cachePath, "utf8"))),
        source: "file",
      };
    } catch {
      return { events: undefined, source: "none" };
    }
  }
  if (process.env["FINNHUB_API_KEY"]) return { events: undefined, source: "finnhub" };
  return { events: undefined, source: "none" };
}

const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/;

/** Timestamps in the dataset with a non-empty actionable candidate set (for the console picker). */
export function decisionTimestampsWithCandidates(limit: number): string[] {
  const { datetimes, truth } = consoleContext();
  const stamps = decisionTimestamps(datetimes, { kind: "sessions" });
  const viable: string[] = [];
  for (const t of stamps) {
    if (actionableAt(truth, t).candidates.length > 0) viable.push(t);
  }
  return viable.slice(-Math.max(1, limit));
}

export async function runConsoleDecision(
  request: ConsoleDecisionRequest,
): Promise<ConsoleDecisionResponse> {
  if (!TIMESTAMP_RE.test(request.timestamp))
    throw new Error(`invalid timestamp "${request.timestamp}"`);
  const T = request.timestamp.length === 16 ? `${request.timestamp}:00` : request.timestamp;
  const { datetimes, truth, ctx } = consoleContext();
  if (T < datetimes[0]!.slice(0, 10)) throw new Error(`timestamp ${T} is before the dataset range`);
  const news = loadConsoleNewsEvents();
  const liveCfg = request.live ? loadGeminiConfig() : undefined;
  if (request.live && !liveCfg!.apiKey)
    throw new Error("live decision requested but GEMINI_API_KEY is not configured");
  const record = await selectAtDecision({
    T,
    windowLabel: "console",
    ctx,
    truth,
    newsEvents: news.events,
    tail: 60,
    datetimes,
    model: request.live ? liveCfg!.model : "stub",
    callModel: request.live ? makeLiveCaller({ config: liveCfg! }) : undefined,
  });
  mkdirSync(outputDir(), { recursive: true });
  const fd = openSync(resolve(outputDir(), CONSOLE_AUDIT_FILE), "a");
  try {
    writeSync(fd, JSON.stringify(record) + "\n");
  } finally {
    closeSync(fd);
  }
  return { ok: true, record, news: news.source, auditFile: CONSOLE_AUDIT_FILE };
}

export { visibleNews };
