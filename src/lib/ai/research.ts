/**
 * Phase-1/Phase-2 AI research layer for ForexLens.
 *
 * Sits strictly ABOVE the deterministic engine: `runAnalysis`/`analyseContinuous`
 * produce candidates; this module sanitizes them into leak-free prompts, asks
 * Gemini for a structured decision per candidate (bounded by a callback
 * budget — 1000 for Phase-1 research, 250 for Phase-2 optimized), records a
 * full audit trail, and only afterwards evaluates selections against the
 * backtester's own outcomes.
 *
 * Research integrity (anti-cheating):
 * - Candidates are built from an explicit WHITELIST of decision-time fields
 *   (no outcome / exit / rMultiple / setupStatus / statusNote / detail).
 * - Context events are filtered to `datetime <= decision datetime`.
 * - Every prompt passes a leak scan that rejects any outcome-bearing token or
 *   any candle/context datetime later than the decision timestamp.
 * - Outcomes are joined ONLY in `evaluateResearch`, after all decisions exist.
 */
import { z } from "zod";
import type { DayTrigger } from "@/lib/backtest/engine";
import type { ContextEvent } from "@/lib/analyzer/strategy-kind";
import { generateGemini, type FetchLike, type GeminiConfig, GeminiError } from "./gemini.api";

/** Phase-1 exploratory allowance. */
export const RESEARCH_CALLBACK_BUDGET = 1000;
/** Phase-2 optimized allowance — used only after the edge is distilled. */
export const OPTIMIZED_CALLBACK_BUDGET = 250;

export interface ResearchCandidate {
  key: string;
  strategyId: string;
  strategy: string;
  /** Decision timestamp (EAT, engine format "YYYY-MM-DD HH:mm:ss"). */
  datetime: string;
  side: string;
  htfTrend: string;
  entry: number | undefined;
  sl: number | undefined;
  tp: number | undefined;
  rr: number | undefined;
  reason: string;
}

export const candidateKeyOf = (t: Pick<DayTrigger, "strategyId" | "datetime" | "side">): string =>
  `${t.strategyId}|${t.datetime}|${t.side ?? "-"}`;

/** Outcome-bearing fields must never leave the engine boundary. */
const FORBIDDEN_SNIPPETS = [
  "outcome",
  "rMultiple",
  "exitPrice",
  "exitDatetime",
  "setupStatus",
  "statusNote",
  "RESOLVED",
  "EXPIRED",
  "NO_FILL",
  "TP hit",
  "SL hit",
  "stop hit",
  "wins this trade",
  "loses this trade",
  "will hit",
  "eventually",
];

export function sanitizeCandidate(trigger: DayTrigger): ResearchCandidate {
  if (trigger.kind === "context") throw new Error("context observations are not trade candidates");
  return {
    key: candidateKeyOf(trigger),
    strategyId: trigger.strategyId,
    strategy: trigger.strategy,
    datetime: trigger.datetime,
    side: trigger.side ?? "-",
    htfTrend:
      typeof trigger.htfTrend === "string"
        ? trigger.htfTrend
        : JSON.stringify(trigger.htfTrend ?? "-"),
    entry: trigger.entry,
    sl: trigger.sl,
    tp: trigger.tp,
    rr: trigger.rr,
    reason: trigger.reason,
  };
}

/** Visible-at-decision-time context: strictly non-strict earlier/equal timestamps. */
export function visibleContext(events: ContextEvent[], decisionDatetime: string): ContextEvent[] {
  return events.filter((e) => e.datetime <= decisionDatetime);
}

/** Default context tail per prompt: newest 40 observations (research-sound recency window, and it bounds prompt size/tokens). */
export const RESEARCH_CONTEXT_TAIL = 40;

export const decisionSchema = z.object({
  verdict: z.enum(["SELECT", "REJECT", "UNSURE"]),
  confidence: z.enum(["L", "M", "H"]),
  rationale: z.string().min(1).max(4000),
  factors: z.array(z.string().min(1).max(200)).max(8),
  patternTags: z.array(z.string().min(1).max(60)).max(12),
});
export type GeminiDecision = z.infer<typeof decisionSchema>;

export const RESEARCH_SYSTEM_PROMPT = `You are the quantitative research layer above a certified deterministic FX backtester.
Each request describes ONE trade candidate exactly as it existed at its decision timestamp: strategy,
direction, entry/SL/TP/RR (already spread-adjusted and verified by the engine), and the context
observations available up to that moment. You NEVER receive any information from after the decision
timestamp; do not ask for it and do not infer or invent future prices.

Task (research mode — exploratory, NOT a rigid rubric):
Decide whether you would take this candidate. Think freely: market structure, session, volatility,
RR geometry, trend alignment, and any pattern the deterministic layer does not explicitly encode.
Be explicit about what drives your view — the goal is discovering whether AI reasoning adds edge.

Reply with ONLY a single JSON object, no prose outside it:
{
  "verdict": "SELECT" | "REJECT" | "UNSURE",
  "confidence": "L" | "M" | "H",
  "rationale": "<= 1500 chars, concrete, mentions the deciding evidence",
  "factors": ["<= 8 short strings, each one deciding factor"],
  "patternTags": ["<= 12 snake_case tags naming any repeatable pattern you notice"]
}`;

export function buildDecisionPrompt(candidate: ResearchCandidate, context: ContextEvent[]): string {
  const ctxLines = context.map((e) => `- [${e.datetime}] ${e.strategyId}: ${e.message}`);
  return [
    `DECISION TIMESTAMP (EAT): ${candidate.datetime} — nothing after this moment exists for you.`,
    ``,
    `CANDIDATE ${candidate.key}`,
    `strategy: ${candidate.strategy} (${candidate.strategyId})`,
    `side: ${candidate.side}`,
    `htf_trend_context: ${candidate.htfTrend}`,
    `entry: ${candidate.entry ?? "n/a"}`,
    `stop_loss: ${candidate.sl ?? "n/a"}`,
    `take_profit: ${candidate.tp ?? "n/a"}`,
    `risk_reward: ${candidate.rr ?? "n/a"}`,
    `engine_reason: ${candidate.reason}`,
    ``,
    `CONTEXT OBSERVATIONS AVAILABLE UP TO THE DECISION TIMESTAMP (${ctxLines.length}):`,
    ctxLines.length ? ctxLines.join("\n") : "(none)",
    ``,
    `Return the JSON decision object now.`,
  ].join("\n");
}

export function promptLeakScan(prompt: string, decisionDatetime: string): string[] {
  const violations: string[] = [];
  for (const snippet of FORBIDDEN_SNIPPETS) {
    if (prompt.includes(snippet)) violations.push(`forbidden snippet "${snippet}"`);
  }
  // Any full datetime after the decision timestamp would be future data.
  const dtRe = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g;
  for (const match of prompt.match(dtRe) ?? []) {
    if (match > decisionDatetime) violations.push(`future datetime ${match}`);
  }
  return violations;
}

/** Deterministic, tiny, non-cryptographic hash for prompt identity in the audit log. */
export function promptHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function parseDecision(
  rawText: string,
): { ok: true; decision: GeminiDecision } | { ok: false; problems: string[] } {
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, problems: ["no JSON object in response"] };
  let value: unknown;
  try {
    value = JSON.parse(rawText.slice(start, end + 1));
  } catch (error) {
    return {
      ok: false,
      problems: [`json parse failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
  const result = decisionSchema.safeParse(value);
  if (!result.success) {
    return {
      ok: false,
      problems: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  return { ok: true, decision: result.data };
}

export type ResearchRecordStatus = "decided" | "api-error" | "invalid-output" | "leak-violation";

export interface ResearchRecord {
  index: number;
  key: string;
  decisionDatetime: string;
  stage: "research" | "optimized";
  promptHash: string;
  prompt: string;
  contextCount: number;
  contextTruncated: number;
  /** Sanitized decision-time info only — enables Phase-2 slicing without re-reading prompts. */
  meta?: { rr?: number; htfTrend?: string; side?: string };
  model?: string;
  latencyMs?: number;
  attempts?: number;
  status: ResearchRecordStatus;
  error?: string;
  rawResponse?: string;
  decision?: GeminiDecision;
}

export interface ResearchRunOptions {
  candidates: DayTrigger[];
  contextEvents: ContextEvent[];
  stage: "research" | "optimized";
  maxCallbacks: number;
  model?: string;
  config: GeminiConfig;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  paceMs?: number;
  /** Stub transport hook for deterministic offline runs. */
  stubDecide?: (candidate: ResearchCandidate, prompt: string) => string;
  onRecord?: (record: ResearchRecord) => void;
  /** Max context observations per prompt (most recent only). Default RESEARCH_CONTEXT_TAIL. */
  contextTail?: number;
}

/**
 * Sequential, budget-capped, fully audited decision run. Fail-closed: any API
 * failure or malformed output is recorded as such and never counted as a
 * decision. Calls stop exactly at maxCallbacks (1000 research / 250 optimized).
 */
export async function runResearch(options: ResearchRunOptions): Promise<ResearchRecord[]> {
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const paceMs = options.paceMs ?? 50;
  const candidates = options.candidates.map(sanitizeCandidate);
  // Engine triggers arrive chronologically from the continuous pass.
  const sorted = [...candidates].sort(
    (a, b) => a.datetime.localeCompare(b.datetime) || a.key.localeCompare(b.key),
  );
  const records: ResearchRecord[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i >= options.maxCallbacks) break;
    const candidate = sorted[i]!;
    const visible = visibleContext(options.contextEvents, candidate.datetime);
    const tail = options.contextTail ?? RESEARCH_CONTEXT_TAIL;
    const context = visible.slice(-tail);
    const truncated = visible.length - context.length;
    const prompt = buildDecisionPrompt(candidate, context);
    const violations = promptLeakScan(prompt, candidate.datetime);
    const base: ResearchRecord = {
      index: i,
      key: candidate.key,
      decisionDatetime: candidate.datetime,
      stage: options.stage,
      promptHash: promptHash(prompt),
      prompt,
      contextCount: context.length,
      contextTruncated: truncated,
      meta: { rr: candidate.rr, htfTrend: candidate.htfTrend, side: candidate.side },
      status: "decided",
    };
    if (violations.length > 0) {
      // Leak gate fires BEFORE any model call — this is a hard failure, never a decision.
      const record: ResearchRecord = {
        ...base,
        status: "leak-violation",
        error: violations.join("; "),
      };
      records.push(record);
      options.onRecord?.(record);
      continue;
    }
    try {
      let rawText: string;
      let model: string | undefined;
      let latencyMs: number | undefined;
      let attempts: number | undefined;
      if (options.stubDecide) {
        rawText = options.stubDecide(candidate, prompt);
        model = options.model ?? "deterministic-stub";
        latencyMs = 0;
        attempts = 0;
      } else {
        const response = await generateGemini(
          options.config,
          {
            systemPrompt: RESEARCH_SYSTEM_PROMPT,
            userPrompt: prompt,
            maxOutputTokens: options.stage === "research" ? 2200 : 900,
          },
          options.fetchImpl,
        );
        rawText = response.text;
        model = response.model;
        latencyMs = response.latencyMs;
        attempts = response.attempts;
        if (paceMs > 0) await sleep(paceMs);
      }
      const parsed = parseDecision(rawText);
      const record: ResearchRecord = parsed.ok
        ? {
            ...base,
            model,
            latencyMs,
            attempts,
            status: "decided",
            rawResponse: rawText,
            decision: parsed.decision,
          }
        : {
            ...base,
            model,
            latencyMs,
            attempts,
            status: "invalid-output",
            error: parsed.problems.join("; "),
            rawResponse: rawText,
          };
      records.push(record);
      options.onRecord?.(record);
    } catch (error) {
      const record: ResearchRecord = {
        ...base,
        status: "api-error",
        error: error instanceof GeminiError ? `${error.kind}: ${error.message}` : String(error),
      };
      records.push(record);
      options.onRecord?.(record);
    }
  }
  return records;
}

/* ---------- post-decision evaluation (backtester truth joins HERE, never before) ---------- */

export interface TruthTrade {
  strategyId: string;
  datetime: string;
  side: string;
  outcome: string;
  rMultiple?: number | null;
}

export interface SliceMetrics {
  candidates: number;
  decided: number;
  selected: number;
  skippedByError: number;
  tp: number;
  sl: number;
  open: number;
  noFill: number;
  totalR: number;
  avgR: number;
  winRate: number;
  expectancy: number;
  profitFactor: number | null;
  maxDrawdownR: number;
}

export function evaluateRecords(
  records: ResearchRecord[],
  truth: TruthTrade[],
): SliceMetrics & { selectionRate: number } {
  const truthByKey = new Map(truth.map((t) => [`${t.strategyId}|${t.datetime}|${t.side}`, t]));
  const decided = records.filter((r) => r.status === "decided" && r.decision);
  const selected = decided
    .filter((r) => r.decision!.verdict === "SELECT")
    .map((r) => truthByKey.get(r.key))
    .filter((t): t is TruthTrade => t !== undefined)
    .sort((a, b) => a.datetime.localeCompare(b.datetime));
  let tp = 0,
    sl = 0,
    open = 0,
    noFill = 0,
    totalR = 0,
    wins = 0,
    losses = 0,
    gProfit = 0,
    gLoss = 0;
  let cum = 0,
    peak = 0,
    maxDd = 0;
  for (const t of selected) {
    if (t.outcome === "TP") {
      tp += 1;
    } else if (t.outcome === "SL") {
      sl += 1;
    } else if (t.outcome === "NO_FILL") {
      noFill += 1;
    } else {
      open += 1;
    }
    const r = typeof t.rMultiple === "number" ? t.rMultiple : 0;
    totalR += r;
    if (t.outcome === "TP") {
      wins += 1;
      gProfit += r;
    } else if (t.outcome === "SL") {
      losses += 1;
      gLoss += Math.abs(r);
    }
    cum += r;
    peak = Math.max(peak, cum);
    maxDd = Math.max(maxDd, peak - cum);
  }
  const n = selected.length;
  const avgR = n ? totalR / n : 0;
  return {
    candidates: records.length,
    decided: decided.length,
    selected: n,
    skippedByError: records.filter((r) => r.status !== "decided").length,
    tp,
    sl,
    open,
    noFill,
    totalR,
    avgR,
    winRate: wins + losses > 0 ? wins / (wins + losses) : 0,
    expectancy: avgR,
    profitFactor: gLoss > 0 ? gProfit / gLoss : gProfit > 0 ? null : 0,
    maxDrawdownR: maxDd,
    selectionRate: decided.length ? n / decided.length : 0,
  };
}

/* ---------- Phase-2: distill the discovered edge ---------- */

export interface PatternLift {
  tag: string;
  selectedWith: number;
  wins: number;
  losses: number;
  winRateWith: number;
  /** win-rate lift vs the baseline win rate of all selected trades. */
  lift: number;
}

export function compressPatterns(records: ResearchRecord[], truth: TruthTrade[]): PatternLift[] {
  const truthByKey = new Map(truth.map((t) => [`${t.strategyId}|${t.datetime}|${t.side}`, t]));
  const base = evaluateRecords(records, truth);
  const byTag = new Map<string, { wins: number; losses: number; selected: number }>();
  for (const r of records) {
    if (r.status !== "decided" || r.decision?.verdict !== "SELECT") continue;
    const t = truthByKey.get(r.key);
    if (!t) continue;
    for (const tag of r.decision.patternTags) {
      const entry = byTag.get(tag) ?? { wins: 0, losses: 0, selected: 0 };
      entry.selected += 1;
      if (t.outcome === "TP") entry.wins += 1;
      else if (t.outcome === "SL") entry.losses += 1;
      byTag.set(tag, entry);
    }
  }
  return [...byTag.entries()]
    .map(([tag, s]) => ({
      tag,
      selectedWith: s.selected,
      wins: s.wins,
      losses: s.losses,
      winRateWith: s.wins + s.losses > 0 ? s.wins / (s.wins + s.losses) : 0,
      lift: (s.wins + s.losses > 0 ? s.wins / (s.wins + s.losses) : 0) - base.winRate,
    }))
    .sort((a, b) => b.selectedWith - a.selectedWith || b.lift - a.lift);
}
