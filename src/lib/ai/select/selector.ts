/**
 * Gemini trade-selection orchestration: payload assembly, the leak gate,
 * response schema/validation, and per-decision record production.
 *
 * The deterministic engine supplies candidates and eventual truth. This layer
 * may ONLY forward information legitimately knowable at the decision
 * timestamp T. Enforcement is architectural (physically absent data) plus a
 * hard gate (`assertPayloadSafety`) run immediately before the model call.
 */

import { z } from "zod";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { actionableAt, type ActionableCandidate, type TruthTradeLike } from "./candidates";
import {
  EvidenceContext,
  candidateRiskQuality,
  candleTail,
  momentumContext,
  priceActionContext,
  structureContext,
  trendContext,
  volatilityContext,
  type ToolOutput,
} from "./evidence";
import { visibleNews, type CalendarEvent, type VisibleNews } from "./news";
import {
  generateGemini,
  type GeminiConfig,
  type FetchLike as GeminiFetchLike,
  GeminiError,
} from "../gemini.api";

/* ------------------------------------------------------------------ *
 * System prompt (external, versioned asset)                          *
 * ------------------------------------------------------------------ */

// Lazy: `import.meta.url` is not a resolvable file URL on edge/worker runtimes,
// so resolving at module scope threw "Invalid URL string" and broke SSR.
function promptPath(): string {
  try {
    return fileURLToPath(new URL("../../../../prompts/trade-selector.system.md", import.meta.url));
  } catch {
    return resolve(process.cwd(), "prompts/trade-selector.system.md");
  }
}

export interface SystemPrompt {
  version: string;
  body: string;
}

let cachedPrompt: SystemPrompt | undefined;

/** Load the trade-selection system prompt; fail closed if missing/empty/unversioned. */
export function loadSystemPrompt(): SystemPrompt {
  if (cachedPrompt) return cachedPrompt;
  let text: string;
  try {
    text = readFileSync(promptPath(), "utf8");
  } catch (error) {
    throw new Error(`trade-selector system prompt missing at ${promptPath()}: ${String(error)}`);
  }
  const m = /PROMPT_VERSION:\s*([^\s>]+)/.exec(text);
  if (!m) throw new Error("trade-selector system prompt lacks a PROMPT_VERSION marker");
  // Strip the leading HTML-comment header block. Handles MULTI-LINE comments:
  // consume lines from the top while inside a <!-- ... --> block so wrapped
  // comment content never leaks onto the wire.
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i]!.trim();
    if (trimmed.startsWith("<!--")) {
      if (!trimmed.endsWith("-->")) {
        i++;
        while (i < lines.length && !lines[i]!.trim().endsWith("-->")) i++;
      }
      i++; // consume the closing line (or the single-line comment)
      continue;
    }
    if (trimmed === "") {
      i++;
      continue;
    }
    break; // first real prompt line
  }
  const body = lines.slice(i).join("\n").trim();
  if (body.length < 100) throw new Error("trade-selector system prompt body is unexpectedly short");
  cachedPrompt = { version: m[1]!, body };
  return cachedPrompt;
}

/* ------------------------------------------------------------------ *
 * Tool whitelist                                                    *
 * ------------------------------------------------------------------ */

export const TOOL_WHITELIST = [
  "trendContext",
  "momentumContext",
  "volatilityContext",
  "structureContext",
  "priceActionContext",
  "candidateRiskContext",
  "newsContext",
] as const;

/* ------------------------------------------------------------------ *
 * Decision payload                                                  *
 * ------------------------------------------------------------------ */

export interface DecisionPayload {
  decision_timestamp: string;
  window: string;
  symbol: string;
  candle_interval_minutes: number | undefined;
  last_price: number | undefined;
  candidates: Array<{
    candidate_id: string;
    strategy: string;
    side: string;
    entry: number;
    sl: number;
    tp: number;
    rr: number | undefined;
    signal_datetime: string;
    htf_trend: string;
    risk_quality: Record<string, unknown>;
  }>;
  market: {
    trendContext: ToolOutput<unknown>;
    momentumContext: ToolOutput<unknown>;
    volatilityContext: ToolOutput<unknown>;
    structureContext: ToolOutput<unknown>;
    priceActionContext: ToolOutput<unknown>;
    recent_candles: Array<Record<string, unknown>>;
  };
  news: VisibleNews | { status: "not_configured" };
  notes: string;
}

export function medianIntervalMinutes(datetimes: string[]): number | undefined {
  if (datetimes.length < 3) return undefined;
  const diffs: number[] = [];
  const toMs = (s: string) => Date.parse(`${s.replace(" ", "T")}+03:00`);
  for (let i = 1; i < datetimes.length; i++) {
    const d = (toMs(datetimes[i]!) - toMs(datetimes[i - 1]!)) / 60000;
    if (d > 0 && d < 240) diffs.push(d);
  }
  if (diffs.length === 0) return undefined;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

/** Assemble the exact payload the model will receive for decision timestamp T. */
export function buildPayload(options: {
  T: string;
  window: string;
  ctx: EvidenceContext;
  candidates: ActionableCandidate[];
  newsEvents: CalendarEvent[] | undefined;
  newsOptions?: { horizonHours?: number; lookbackHours?: number };
  tail?: number;
  datetimes: string[]; // full candle datetime sequence (for interval detection)
}): DecisionPayload {
  const { T, ctx } = options;
  const asOf = ctx.asOfIndex(T);
  // Interval detection is bounded to candles at/before T — deriving payload
  // fields from post-T datetimes would violate the timestamp boundary.
  const boundedDatetimes = options.datetimes.slice(0, asOf + 1);
  const structure = structureContext(ctx, asOf).value;
  const candidates = options.candidates.map((c) => ({
    candidate_id: c.candidateId,
    strategy: c.strategyId,
    side: c.side,
    entry: c.entry,
    sl: c.sl,
    tp: c.tp,
    rr: c.rr,
    signal_datetime: c.signalDatetime,
    htf_trend: c.htfTrend,
    risk_quality: candidateRiskQuality(ctx, asOf, c, structure) as unknown as Record<
      string,
      unknown
    >,
  }));
  return {
    decision_timestamp: T,
    window: options.window,
    symbol: "XAUUSD",
    candle_interval_minutes: medianIntervalMinutes(boundedDatetimes),
    last_price: asOf >= 0 ? ctx.candles[asOf]!.close : undefined,
    candidates,
    market: {
      trendContext: trendContext(ctx, asOf) as ToolOutput<unknown>,
      momentumContext: momentumContext(ctx, asOf) as ToolOutput<unknown>,
      volatilityContext: volatilityContext(ctx, asOf) as ToolOutput<unknown>,
      structureContext: structureContext(ctx, asOf) as ToolOutput<unknown>,
      priceActionContext: priceActionContext(ctx, asOf) as ToolOutput<unknown>,
      recent_candles: candleTail(ctx.candles, asOf, options.tail ?? 60) as unknown as Array<
        Record<string, unknown>
      >,
    },
    news: options.newsEvents
      ? visibleNews(options.newsEvents, T, options.newsOptions)
      : { status: "not_configured" },
    notes:
      "Select EXACTLY ONE candidate. Overlapping candidates may express one move; opposing candidates must be compared head-to-head. INVALID_SET is only for genuine data/system failures.",
  };
}

/* ------------------------------------------------------------------ *
 * Leak gate — architectural backstop, runs before every model call   *
 * ------------------------------------------------------------------ */

const FORBIDDEN_KEYS = new Set([
  "outcome",
  "exitDatetime",
  "exitPrice",
  "rMultiple",
  "realizedR",
  "result",
  "winner",
  "loser",
  "tp_hit",
  "sl_hit",
  "pnl",
]);

const DATETIME_ANYWHERE = /\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/g;
const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * Walk the serialized payload and prove that nothing the model receives
 * leaks from beyond the decision timestamp T:
 *  - forbidden outcome-bearing keys appear nowhere;
 *  - every EAT-local datetime outside the news section is <= T;
 *  - news.upcoming scheduledAt values are ALLOWED to exceed T (public
 *    schedule) but the upcoming objects must not carry `actual`;
 *  - news.recent actuals must not carry a timestamp beyond T either.
 * Throws on any violation — the model call must not proceed.
 */
export function assertPayloadSafety(payload: DecisionPayload, T: string): void {
  const violations: string[] = [];
  const checkForbiddenAndTimes = (
    node: unknown,
    path: string,
    insideNewsUpcoming: boolean,
  ): void => {
    if (node === null || typeof node !== "object") {
      if (typeof node === "string") {
        for (const m of node.matchAll(DATETIME_ANYWHERE)) {
          const raw = m[0].replace("T", " ");
          const withSec = raw.length === 16 ? `${raw}:00` : raw;
          if (ISO_Z.test(node)) {
            // UTC ISO: compare against T converted to UTC
            const tUtc = Date.parse(`${T.replace(" ", "T")}+03:00`);
            if (Date.parse(node) > tUtc && !insideNewsUpcoming) {
              violations.push(`${path}: future ISO timestamp ${node}`);
            }
            continue;
          }
          if (withSec > T && !insideNewsUpcoming) {
            violations.push(`${path}: future datetime ${withSec}`);
          }
        }
      }
      return;
    }
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++)
        checkForbiddenAndTimes(node[i], `${path}[${i}]`, insideNewsUpcoming);
      return;
    }
    const rec = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(rec)) {
      if (FORBIDDEN_KEYS.has(k)) violations.push(`${path}.${k}: forbidden key`);
      const upcomingBranch =
        insideNewsUpcoming ||
        (path === "news" && k === "upcoming") ||
        path.startsWith("news.upcoming");
      if (upcomingBranch && k === "actual")
        violations.push(`${path}.${k}: actual on upcoming event`);
      if (upcomingBranch && k === "status" && v !== "scheduled")
        violations.push(`${path}.${k}: upcoming event not marked scheduled`);
      checkForbiddenAndTimes(v, path ? `${path}.${k}` : k, upcomingBranch);
    }
  };
  checkForbiddenAndTimes(payload, "", false);
  if (violations.length > 0) {
    throw new Error(`PAYLOAD LEAK GATE: ${violations.join(" | ")}`);
  }
}

/* ------------------------------------------------------------------ *
 * Response schema + integrity validation                             *
 * ------------------------------------------------------------------ */

export const selectionResponseSchema = z.object({
  decision_timestamp: z.string().min(1),
  selection: z.enum(["CANDIDATE", "INVALID_SET"]),
  selected_candidate_id: z.string().nullable(),
  reasoning: z.string().min(1),
  rejected_candidates: z.array(
    z.object({ candidate_id: z.string().min(1), reason: z.string().min(1) }),
  ),
  tools_used: z.array(z.string()),
});

export type SelectionResponse = z.infer<typeof selectionResponseSchema>;

export interface ValidatedSelection {
  ok: boolean;
  response?: SelectionResponse;
  errors: string[];
}

/** Schema-parse + cross-check against the presented candidate set and T. */
/**
 * Models frequently wrap JSON in markdown fences. Strip ONE well-formed fence
 * (``` / ```json) before parsing; prose around the payload stays a parse
 * failure by design — malformed output must never become a decision.
 */
export function stripJsonFence(raw: string): string {
  const m = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?\s*```\s*$/.exec(raw);
  return m ? m[1]! : raw;
}

export function validateSelection(
  raw: string,
  T: string,
  candidates: ActionableCandidate[],
): ValidatedSelection {
  const errors: string[] = [];
  let json: unknown;
  try {
    json = JSON.parse(stripJsonFence(raw));
  } catch {
    return { ok: false, errors: ["response is not valid JSON"] };
  }
  const parsed = selectionResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  const r = parsed.data;
  if (r.decision_timestamp !== T) {
    errors.push(`decision_timestamp mismatch (got "${r.decision_timestamp}")`);
  }
  const ids = new Set(candidates.map((c) => c.candidateId));
  if (r.selection === "CANDIDATE") {
    if (r.selected_candidate_id === null)
      errors.push("CANDIDATE selection with null selected_candidate_id");
    else if (!ids.has(r.selected_candidate_id)) {
      errors.push(`selected_candidate_id "${r.selected_candidate_id}" is not in the presented set`);
    }
  } else {
    if (r.selected_candidate_id !== null)
      errors.push("INVALID_SET selection must have null selected_candidate_id");
  }
  for (const rej of r.rejected_candidates) {
    if (!ids.has(rej.candidate_id))
      errors.push(`rejected candidate "${rej.candidate_id}" is not in the presented set`);
    if (rej.candidate_id === r.selected_candidate_id)
      errors.push(`candidate "${rej.candidate_id}" is both selected and rejected`);
  }
  for (const tool of r.tools_used) {
    if (!(TOOL_WHITELIST as readonly string[]).includes(tool))
      errors.push(`tools_used entry "${tool}" is not whitelisted`);
  }
  return errors.length === 0 ? { ok: true, response: r, errors } : { ok: false, errors };
}

/* ------------------------------------------------------------------ *
 * Decision records + orchestration                                   *
 * ------------------------------------------------------------------ */

export type SelectionRecordStatus =
  | "decided"
  | "invalid-set" // deterministic INVALID_SET (empty/corrupt set) — no model call
  | "invalid-output" // model output failed schema/integrity validation
  | "api-error"
  | "leak-violation";

export interface SelectionRecord {
  kind: "selection";
  decisionTimestamp: string;
  window: string;
  candidatesPresented: Array<{
    candidateId: string;
    key: string;
    strategyId: string;
    side: string;
    entry: number;
    sl: number;
    tp: number;
    signalDatetime: string;
  }>;
  evidenceSnapshot: unknown;
  newsSnapshot: unknown;
  model: string;
  promptVersion: string;
  apiStatus: "ok" | "no-call" | "failed";
  validation: "valid" | "invalid";
  status: SelectionRecordStatus;
  selection?: "CANDIDATE" | "INVALID_SET" | undefined;
  selectedCandidateId?: string | null | undefined;
  statusNote?: string | undefined;
  latencyMs?: number | undefined;
  validationErrors?: string[] | undefined;
}

export interface SelectAtOptions {
  T: string;
  windowLabel: string;
  ctx: EvidenceContext;
  truth: TruthTradeLike[];
  newsEvents: CalendarEvent[] | undefined;
  newsOptions?: { horizonHours?: number; lookbackHours?: number };
  tail?: number;
  datetimes: string[];
  model: string;
  callModel: ((payloadRaw: string, T: string) => Promise<string>) | undefined; // undefined => deterministic stub
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** Deterministic offline stub: highest hash bucket wins; clearly labeled. */
export function stubSelectModel(payloadRaw: string): Promise<string> {
  const payload = JSON.parse(payloadRaw) as DecisionPayload;
  let best: { id: string; score: number } | undefined;
  for (const c of payload.candidates) {
    const score = parseInt(
      sha256(`${payload.decision_timestamp}|${c.candidate_id}|${c.strategy}|${c.entry}`).slice(
        0,
        8,
      ),
      16,
    );
    if (!best || score > best.score) best = { id: c.candidate_id, score };
  }
  const selected = best?.id ?? null;
  const rejected = payload.candidates
    .filter((c) => c.candidate_id !== selected)
    .map((c) => ({
      candidate_id: c.candidate_id,
      reason: "stub: lower deterministic hash bucket",
    }));
  return Promise.resolve(
    JSON.stringify({
      decision_timestamp: payload.decision_timestamp,
      selection: "CANDIDATE",
      selected_candidate_id: selected,
      reasoning: `STUB (offline plumbing validation): selected ${selected} by deterministic hash over sanitized fields; no model involved.`,
      rejected_candidates: rejected,
      tools_used: ["candidateRiskContext"],
    }),
  );
}

const baseRecord = (
  T: string,
  window: string,
  presented: SelectionRecord["candidatesPresented"],
  evidence: unknown,
  news: unknown,
  model: string,
  promptVersion: string,
): SelectionRecord => ({
  kind: "selection",
  decisionTimestamp: T,
  window,
  candidatesPresented: presented,
  evidenceSnapshot: evidence,
  newsSnapshot: news,
  model,
  promptVersion,
  apiStatus: "no-call",
  validation: "invalid",
  status: "invalid-set",
});

/**
 * Execute one decision at timestamp T. One model call maximum; an empty or
 * corrupt set is a deterministic INVALID_SET with no call. Fail-closed
 * throughout: malformed model output never becomes a decision.
 */
export async function selectAtDecision(options: SelectAtOptions): Promise<SelectionRecord> {
  const { T, ctx } = options;
  const prompt = loadSystemPrompt();
  const set = actionableAt(options.truth, T);
  const presentedFields = (c: ActionableCandidate) => ({
    candidateId: c.candidateId,
    key: c.key,
    strategyId: c.strategyId,
    side: c.side,
    entry: c.entry,
    sl: c.sl,
    tp: c.tp,
    signalDatetime: c.signalDatetime,
  });
  if (set.candidates.length === 0) {
    const rec = baseRecord(T, options.windowLabel, [], null, null, options.model, prompt.version);
    rec.statusNote =
      set.corrupt.length > 0
        ? `corrupt candidates: ${set.corrupt.join("; ")}`
        : "empty candidate set";
    rec.selection = "INVALID_SET";
    return rec;
  }
  if (!set.ok) {
    const rec = baseRecord(
      T,
      options.windowLabel,
      set.candidates.map(presentedFields),
      null,
      null,
      options.model,
      prompt.version,
    );
    rec.statusNote = `corrupt candidate set: ${set.corrupt.join("; ")}`;
    rec.selection = "INVALID_SET";
    return rec;
  }
  const payload = buildPayload({
    T,
    window: options.windowLabel,
    ctx,
    candidates: set.candidates,
    newsEvents: options.newsEvents,
    newsOptions: options.newsOptions,
    tail: options.tail,
    datetimes: options.datetimes,
  });
  let payloadRaw: string;
  try {
    assertPayloadSafety(payload, T);
    payloadRaw = JSON.stringify(payload);
  } catch (error) {
    const rec = baseRecord(
      T,
      options.windowLabel,
      set.candidates.map(presentedFields),
      payload.market,
      payload.news,
      options.model,
      prompt.version,
    );
    rec.status = "leak-violation";
    rec.statusNote = String(error);
    return rec;
  }
  const recordBase = (): SelectionRecord => {
    const rec = baseRecord(
      T,
      options.windowLabel,
      set.candidates.map(presentedFields),
      payload.market,
      payload.news,
      options.model,
      prompt.version,
    );
    return rec;
  };
  const started = Date.now();
  let raw: string;
  try {
    raw = options.callModel
      ? await options.callModel(payloadRaw, T)
      : await stubSelectModel(payloadRaw);
  } catch (error) {
    const rec = recordBase();
    rec.status = "api-error";
    rec.apiStatus = "failed";
    rec.statusNote =
      error instanceof GeminiError ? `${error.kind}: ${error.message}` : String(error);
    rec.latencyMs = Date.now() - started;
    return rec;
  }
  const latencyMs = Date.now() - started;
  const validated = validateSelection(raw, T, set.candidates);
  if (!validated.ok) {
    const rec = recordBase();
    rec.status = "invalid-output";
    rec.apiStatus = "ok";
    rec.latencyMs = latencyMs;
    rec.validationErrors = validated.errors;
    return rec;
  }
  const rec = recordBase();
  rec.status = "decided";
  rec.apiStatus = "ok";
  rec.validation = "valid";
  rec.selection = validated.response!.selection;
  rec.selectedCandidateId = validated.response!.selected_candidate_id;
  rec.latencyMs = latencyMs;
  return rec;
}

/* ------------------------------------------------------------------ *
 * Live model adapter (production path uses the Gemini client)        *
 * ------------------------------------------------------------------ */

export interface LiveModelOptions {
  config: GeminiConfig;
  fetchImpl?: GeminiFetchLike;
}

/** Build the live model caller (system prompt + JSON user payload). */
/**
 * DEPLOYMENT ADDENDUM (addendum-v1, appended after the prompt body):
 * the final prompt speaks of tool FAMILIES; this deployment computes the
 * following six named tool outputs server-side and embeds them in the user
 * payload. Advertised-but-absent families are called out so the model never
 * claims values it cannot see (and never trips the tools_used whitelist).
 */
export const DEPLOYMENT_ADDENDUM = `
DEPLOYMENT ADDENDUM (addendum-v1) — how the TOOLS map onto the data you receive:
All tool outputs are precomputed server-side over candles with index <= the decision timestamp and are embedded in the JSON user payload:
- EMA 20/50/200 (values, slopes, stack, price distance in ATR, directional persistence) and completed-1H trend come from market.trendContext.
- RSI 14, ROC 5/10, acceleration, body momentum come from market.momentumContext.
- ATR 14 (value, percentile, regime), range/ATR, volatility expansion share, realized volatility come from market.volatilityContext.
- Swing highs/lows (confirmation-bounded), previous-day high/low, session high/low, structural-break state, distances in ATR come from market.structureContext.
- Candle body/wick/range ratios, consecutive directional closes, inside/outside state come from market.priceActionContext and the recent_candles tail (OHLC ending at the decision timestamp).
- Per-candidate R:R, stop/target distances in ATR, and SL/TP relation to confirmed structure are in each candidate's risk_quality object.
- Scheduled economic events (names, impact, scheduled time, minutes until, and values only where already public) are in the news section.
State flags may read "valid", "insufficient_history", or "no_data" — treat non-valid outputs as missing data, never as evidence.
MACD, Bollinger Bands, and Donchian channels are NOT computed by this deployment: do not claim their values anywhere. In tools_used you may name ONLY: trendContext, momentumContext, volatilityContext, structureContext, priceActionContext, candidateRiskContext, newsContext.
Respond with STRICT JSON only — one object matching the OUTPUT FORMAT contract; no prose, no markdown fences.`;
export const ADDENDUM_VERSION = "addendum-v1";

export function makeLiveCaller(
  options: LiveModelOptions,
): (payloadRaw: string, T: string) => Promise<string> {
  const prompt = loadSystemPrompt();
  return async (payloadRaw: string) => {
    const res = await generateGemini(
      options.config,
      {
        systemPrompt: prompt.body + "\n\n" + DEPLOYMENT_ADDENDUM,
        userPrompt: payloadRaw,
      },
      options.fetchImpl,
    );
    return res.text;
  };
}
