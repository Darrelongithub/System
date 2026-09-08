/**
 * Actionable candidate sets for the Gemini trade-selection layer.
 *
 * Semantics (documented, deterministic):
 *  - A candidate is ACTIONABLE at decision timestamp T iff its signal occurred
 *    at or before T (datetime <= T) and it had NOT yet resolved before T. A
 *    trade is excluded when its TP/SL exit happened strictly before T.
 *  - Eventual OPEN / NO_FILL trades carry no exitDatetime: their setups stay
 *    actionable from signal time onward (documented research convention —
 *    only 4 OPEN / 0 NO_FILL exist in the certified baseline).
 *  - Resolved candidates are NEVER presented: no status, no outcome, nothing.
 *    They simply do not exist in the set.
 *  - Candidate ids are stable content-derived labels (c1..cn after sorting by
 *    key), so permuting the input order cannot change ids or the decision.
 *  - Corrupt candidates (missing required fields) poison the WHOLE set: the
 *    decision becomes a deterministic INVALID_SET with no model call.
 */
export interface TruthTradeLike {
  strategyId: string;
  datetime: string;
  side?: string;
  entry?: number | undefined;
  sl?: number | undefined;
  tp?: number | undefined;
  rr?: number | undefined;
  htfTrend?: string;
  outcome?: string;
  exitDatetime?: string;
}

export interface ActionableCandidate {
  candidateId: string;
  key: string;
  strategyId: string;
  side: string;
  entry: number;
  sl: number;
  tp: number;
  rr: number | undefined;
  htfTrend: string;
  signalDatetime: string;
}

export interface CandidateSetResult {
  ok: boolean;
  /** Present when ok: the deterministic, ordered candidate set. */
  candidates: ActionableCandidate[];
  /** Keys (or descriptions) of corrupt trades that invalidate the set. */
  corrupt: string[];
}

const REQUIRED: ReadonlyArray<keyof TruthTradeLike> = [
  "strategyId",
  "datetime",
  "side",
  "entry",
  "sl",
  "tp",
];

export function tradeKeyOf(t: Pick<TruthTradeLike, "strategyId" | "datetime" | "side">): string {
  return `${t.strategyId}|${t.datetime}|${t.side ?? "-"}`;
}

/**
 * A trade is resolved before T iff TP/SL was hit strictly before T. An exit on
 * the candle starting AT T resolves somewhere inside [T, T+interval) — that is
 * not knowable at the instant T (blueprint: only resolutions BEFORE T remove
 * the candidate), so it stays actionable.
 */
export function resolvedBy(t: TruthTradeLike, T: string): boolean {
  if ((t.outcome === "TP" || t.outcome === "SL") && t.exitDatetime !== undefined) {
    return t.exitDatetime < T;
  }
  return false;
}

/**
 * Build the actionable candidate set for decision timestamp T.
 * Deterministic: output is identical for any input permutation.
 */
export function actionableAt(truth: TruthTradeLike[], T: string): CandidateSetResult {
  const seen = truth.filter((t) => t.datetime <= T);
  const live = seen.filter((t) => !resolvedBy(t, T));
  const corrupt: string[] = [];
  const valid: TruthTradeLike[] = [];
  for (const t of live) {
    const missing = REQUIRED.filter(
      (k) => t[k] === undefined || (typeof t[k] === "string" && (t[k] as string) === ""),
    );
    const badNumber =
      t.entry !== undefined && !Number.isFinite(t.entry)
        ? true
        : t.sl !== undefined && !Number.isFinite(t.sl)
          ? true
          : t.tp !== undefined && !Number.isFinite(t.tp);
    if (missing.length > 0 || badNumber) {
      corrupt.push(
        `${tradeKeyOf(t)} (missing/invalid: ${missing.join(",") || "non-finite price"})`,
      );
    } else {
      valid.push(t);
    }
  }
  const sorted = valid
    .map((t) => ({ t, key: tradeKeyOf(t) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const candidates = sorted.map(({ t, key }, i) => ({
    candidateId: `c${i + 1}`,
    key,
    strategyId: t.strategyId,
    side: String(t.side),
    entry: Number(t.entry),
    sl: Number(t.sl),
    tp: Number(t.tp),
    rr: t.rr,
    htfTrend: t.htfTrend ?? "-",
    signalDatetime: t.datetime,
  }));
  return { ok: corrupt.length === 0, candidates, corrupt };
}
