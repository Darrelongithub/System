/**
 * Phase-2 deep evaluation for the Gemini research layer.
 *
 * Consumes ONLY finished decision records (audit JSONL rows) plus backtester
 * truth — outcomes were never visible at decision time by construction
 * (see research.ts sanitization + leak scan). Produces the raw-vs-filtered
 * comparison at aggregate level AND across strategy / session / weekday /
 * RR-band / HTF-alignment slices, flagging only slices with n ≥ 20 selections
 * as statistically meaningful.
 */
import { sessionOf } from "@/lib/analyzer/time";
import {
  evaluateRecords,
  type ResearchRecord,
  type SliceMetrics,
  type TruthTrade,
} from "./research";

export const MEANINGFUL_N = 20;

export type DimensionName = "strategy" | "session" | "weekday" | "rrBand" | "htfAlignment";

export interface BucketMetrics extends SliceMetrics {
  n: number;
  meaningful: boolean;
}

export interface SliceSet {
  overall: SliceMetrics & { selectionRate: number };
  buckets: Record<DimensionName, Record<string, BucketMetrics>>;
}

export interface DeepEvaluation {
  filtered: SliceSet;
  baseline: SliceSet;
  decidedCoverage: { candidates: number; decided: number; failures: number; selectionRate: number };
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function weekdayOf(datetime: string): string {
  const day = datetime.slice(0, 10);
  return WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()] ?? "unknown";
}

export function rrBandOf(rr: number | undefined | null): string {
  if (rr === undefined || rr === null || !Number.isFinite(rr) || rr <= 0) return "rr:unknown";
  if (rr < 1.5) return "rr:<1.5";
  if (rr < 2.5) return "rr:1.5–2.5";
  if (rr < 4) return "rr:2.5–4";
  return "rr:≥4";
}

interface Acc {
  n: number;
  tp: number;
  sl: number;
  open: number;
  noFill: number;
  rSum: number;
  wins: number;
  losses: number;
  gProfit: number;
  gLoss: number;
  cumR: number;
  peak: number;
  maxDd: number;
}

const newAcc = (): Acc => ({
  n: 0,
  tp: 0,
  sl: 0,
  open: 0,
  noFill: 0,
  rSum: 0,
  wins: 0,
  losses: 0,
  gProfit: 0,
  gLoss: 0,
  cumR: 0,
  peak: 0,
  maxDd: 0,
});

function feed(acc: Acc, trade: TruthTrade): void {
  acc.n += 1;
  const r = typeof trade.rMultiple === "number" ? trade.rMultiple : 0;
  acc.rSum += r;
  if (trade.outcome === "TP") {
    acc.tp += 1;
    acc.wins += 1;
    acc.gProfit += r;
  } else if (trade.outcome === "SL") {
    acc.sl += 1;
    acc.losses += 1;
    acc.gLoss += Math.abs(r);
  } else if (trade.outcome === "NO_FILL") acc.noFill += 1;
  else acc.open += 1;
  acc.cumR += r;
  acc.peak = Math.max(acc.peak, acc.cumR);
  acc.maxDd = Math.max(acc.maxDd, acc.peak - acc.cumR);
}

function finish(acc: Acc): BucketMetrics {
  const avgR = acc.n ? acc.rSum / acc.n : 0;
  return {
    candidates: acc.n,
    decided: acc.n,
    selected: acc.n,
    skippedByError: 0,
    tp: acc.tp,
    sl: acc.sl,
    open: acc.open,
    noFill: acc.noFill,
    totalR: acc.rSum,
    avgR,
    winRate: acc.wins + acc.losses > 0 ? acc.wins / (acc.wins + acc.losses) : 0,
    expectancy: avgR,
    profitFactor: acc.gLoss > 0 ? acc.gProfit / acc.gLoss : acc.gProfit > 0 ? null : 0,
    maxDrawdownR: acc.maxDd,
    n: acc.n,
    meaningful: acc.n >= MEANINGFUL_N,
  };
}

interface LabeledTrade {
  trade: TruthTrade;
  labels: Record<DimensionName, string>;
}

function labelsFor(
  trade: TruthTrade,
  meta?: { rr?: number; htfTrend?: string },
): Record<DimensionName, string> {
  const side = trade.side ?? "-";
  const htf = meta?.htfTrend?.toLowerCase() ?? "";
  const aligned =
    (side === "long" && htf.includes("bull")) || (side === "short" && htf.includes("bear"))
      ? "aligned"
      : htf === ""
        ? "unknown"
        : "counter-trend";
  return {
    strategy: trade.strategyId,
    session: sessionOf(trade.datetime) ?? "unknown",
    weekday: weekdayOf(trade.datetime),
    rrBand: rrBandOf(meta?.rr),
    htfAlignment: aligned,
  };
}

function buildSliceSet(
  labeled: LabeledTrade[],
  overall: SliceMetrics & { selectionRate: number },
): SliceSet {
  const dims: DimensionName[] = ["strategy", "session", "weekday", "rrBand", "htfAlignment"];
  const acc = Object.fromEntries(dims.map((d) => [d, new Map<string, Acc>()])) as Record<
    DimensionName,
    Map<string, Acc>
  >;
  const sorted = [...labeled].sort((a, b) => a.trade.datetime.localeCompare(b.trade.datetime));
  for (const item of sorted) {
    for (const dim of dims) {
      const key = item.labels[dim];
      let a = acc[dim].get(key);
      if (!a) {
        a = newAcc();
        acc[dim].set(key, a);
      }
      feed(a, item.trade);
    }
  }
  const buckets = Object.fromEntries(
    dims.map((dim) => [
      dim,
      Object.fromEntries([...acc[dim].entries()].map(([k, a]) => [k, finish(a)])),
    ]),
  ) as Record<DimensionName, Record<string, BucketMetrics>>;
  return { overall, buckets };
}

/**
 * Full comparison of the Gemini-filtered selections vs the raw deterministic
 * baseline over the same truth set. Filtered slices additionally use the
 * audit record's sanitized meta (rr/htfTrend) for RR-band/HTF-alignment.
 */
export function evaluateDeep(records: ResearchRecord[], truth: TruthTrade[]): DeepEvaluation {
  const truthByKey = new Map(truth.map((t) => [`${t.strategyId}|${t.datetime}|${t.side}`, t]));

  const decided = records.filter((r) => r.status === "decided" && r.decision);
  const filteredTrades: LabeledTrade[] = decided
    .filter((r) => r.decision!.verdict === "SELECT")
    .map((r) => {
      const trade = truthByKey.get(r.key);
      return trade ? { trade, labels: labelsFor(trade, r.meta) } : null;
    })
    .filter((x): x is LabeledTrade => x !== null);
  const filteredOverall = evaluateRecords(records, truth);

  const baselineLabeled: LabeledTrade[] = truth.map((trade) => ({
    trade,
    labels: labelsFor(trade, { rr: (trade as { rr?: number }).rr, htfTrend: "" }),
  }));
  const baselineRecords: ResearchRecord[] = truth.map((t) => ({
    index: 0,
    key: `${t.strategyId}|${t.datetime}|${t.side}`,
    decisionDatetime: t.datetime,
    stage: "research",
    promptHash: "",
    prompt: "",
    contextCount: 0,
    contextTruncated: 0,
    status: "decided",
    decision: { verdict: "SELECT", confidence: "M", rationale: "-", factors: [], patternTags: [] },
  }));
  const baselineOverall = evaluateRecords(baselineRecords, truth);

  return {
    filtered: buildSliceSet(filteredTrades, filteredOverall),
    baseline: buildSliceSet(baselineLabeled, baselineOverall),
    decidedCoverage: {
      candidates: records.length,
      decided: decided.length,
      failures: records.filter((r) => r.status !== "decided").length,
      selectionRate: filteredOverall.selectionRate,
    },
  };
}

/** Resume support: which prior callbacks are terminal (skip) vs retryable. */
export function resumeState(prior: ResearchRecord[]): {
  skipKeys: Set<string>;
  usedBudget: number;
  retryKeys: string[];
} {
  const TERMINAL = new Set(["decided", "invalid-output", "leak-violation"]);
  const skipKeys = new Set<string>();
  const retryKeys: string[] = [];
  for (const r of prior) {
    if (TERMINAL.has(r.status)) skipKeys.add(r.key);
    else retryKeys.push(r.key);
  }
  return { skipKeys, usedBudget: prior.length, retryKeys };
}
