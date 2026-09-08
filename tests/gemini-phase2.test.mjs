/**
 * Phase-2 deep-evaluation tests — slice math, session/weekday/RR labels,
 * meaningfulness flags, and resume-state semantics. All deterministic,
 * synthetic fixtures; no engine or API involvement.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import {
  evaluateDeep,
  resumeState,
  rrBandOf,
  weekdayOf,
  MEANINGFUL_N,
} from "../src/lib/ai/evaluate.ts";
import { sessionOf } from "../src/lib/analyzer/time.ts";

const trade = (strategyId, datetime, outcome, rMultiple, side = "long", rr = 2) => ({
  strategyId,
  datetime,
  side,
  outcome,
  rMultiple,
  rr,
});

const rec = (i, key, verdict, status = "decided", meta = {}) => ({
  index: i,
  key,
  decisionDatetime: key.split("|")[1],
  stage: "research",
  promptHash: "",
  prompt: "",
  contextCount: 0,
  contextTruncated: 0,
  meta,
  status,
  decision:
    status === "decided"
      ? { verdict, confidence: "M", rationale: "-", factors: [], patternTags: [] }
      : undefined,
});

test("labels: session boundaries follow the engine's EAT windows", () => {
  assertEqual(sessionOf("2026-01-05 01:00:00"), "asian");
  assertEqual(sessionOf("2026-01-05 10:59:00"), "asian");
  assertEqual(sessionOf("2026-01-05 11:00:00"), "london");
  assertEqual(sessionOf("2026-01-05 15:59:00"), "london");
  assertEqual(sessionOf("2026-01-05 16:00:00"), "ny");
  assertEqual(sessionOf("2026-01-05 00:59:00"), "ny", "ny tail hour");
  assertEqual(sessionOf("2026-01-05 00:00:00"), "ny", "midnight is ny tail");
});

test("labels: weekday + rrBand boundaries", () => {
  assertEqual(weekdayOf("2025-11-08 01:00:00"), "saturday");
  assertEqual(weekdayOf("2025-11-09 12:00:00"), "sunday");
  assertEqual(weekdayOf("2026-08-20 10:00:00"), "thursday");
  assertEqual(rrBandOf(1.49), "rr:<1.5");
  assertEqual(rrBandOf(1.5), "rr:1.5–2.5");
  assertEqual(rrBandOf(2.49), "rr:1.5–2.5");
  assertEqual(rrBandOf(2.5), "rr:2.5–4");
  assertEqual(rrBandOf(3.99), "rr:2.5–4");
  assertEqual(rrBandOf(4), "rr:≥4");
  assertEqual(rrBandOf(0), "rr:unknown");
  assertEqual(rrBandOf(-2), "rr:unknown");
  assertEqual(rrBandOf(undefined), "rr:unknown");
  assertEqual(rrBandOf(Number.NaN), "rr:unknown");
});

test("evaluateDeep: slice buckets and baselines are exactly hand-computable", () => {
  const truth = [
    trade("macd-cross", "2026-01-05 02:00:00", "TP", 2), // asian
    trade("macd-cross", "2026-01-05 12:00:00", "SL", -1), // london
    trade("dual-thrust", "2026-01-06 17:00:00", "TP", 3), // ny
    trade("dual-thrust", "2026-01-07 17:30:00", "SL", -1), // ny
  ];
  const records = [
    rec(0, "macd-cross|2026-01-05 02:00:00|long", "SELECT", "decided", {
      rr: 2,
      htfTrend: "bullish",
      side: "long",
    }),
    rec(1, "macd-cross|2026-01-05 12:00:00|long", "REJECT", "decided", {
      rr: 2,
      htfTrend: "bearish",
      side: "long",
    }),
    rec(2, "dual-thrust|2026-01-06 17:00:00|long", "SELECT", "decided", {
      rr: 3,
      htfTrend: "bullish",
      side: "long",
    }),
    rec(3, "dual-thrust|2026-01-07 17:30:00|long", "SELECT", "api-error"),
  ];
  const deep = evaluateDeep(records, truth);

  // overall invariants
  assertEqual(deep.filtered.overall.selected, 2, "2 selects (api-error never counts)");
  assertEqual(deep.baseline.overall.selected, 4, "baseline = every truth trade");
  assertEqual(deep.filtered.overall.totalR, 5, "2 + 3");
  assertEqual(deep.decidedCoverage.decided, 3);
  assertEqual(deep.decidedCoverage.failures, 1);

  // strategy slices
  const strat = deep.filtered.buckets.strategy;
  assertEqual(strat["macd-cross"].n, 1);
  assertEqual(strat["macd-cross"].winRate, 1);
  assertEqual(strat["dual-thrust"].n, 1);
  // session slices (engine-derived)
  const sess = deep.filtered.buckets.session;
  assertEqual(sess["asian"].n, 1);
  assertEqual(sess["ny"].n, 1);
  assertEqual(sess["london"], undefined, "rejected london trade not in filtered slice");
  // baseline session has everything
  assertEqual(deep.baseline.buckets.session["london"].n, 1);
  assertEqual(deep.baseline.buckets.session["ny"].n, 2);
  // htf alignment only on the filtered side (baseline truth carries no htf)
  const htf = deep.filtered.buckets.htfAlignment;
  assertEqual(htf["aligned"].n, 2);
  assertEqual(Object.keys(deep.baseline.buckets.htfAlignment).join(","), "unknown");
  // rrBand from sanitized meta
  assertEqual(deep.filtered.buckets.rrBand["rr:1.5–2.5"].n, 1);
  assertEqual(deep.filtered.buckets.rrBand["rr:2.5–4"].n, 1);
  // meaningful threshold
  assert(!deep.filtered.buckets.strategy["macd-cross"].meaningful, "n=1 not meaningful");
});

test("evaluateDeep: meaningful flag flips exactly at n=20", () => {
  const truth = [];
  const records = [];
  for (let i = 0; i < MEANINGFUL_N; i++) {
    const dt = `2026-02-0${(i % 9) + 1} 0${i % 10}:00:00`.padEnd(19, "0").slice(0, 19);
    truth.push(trade("macd-cross", dt, "SL", -1, "long", 2));
    records.push(
      rec(i, `macd-cross|${dt}|long`, "SELECT", "decided", {
        rr: 2,
        htfTrend: "bullish",
        side: "long",
      }),
    );
  }
  truth.push(trade("macd-cross", "2026-02-28 11:00:00", "SL", -1, "long", 2));
  records.push(
    rec(99, "macd-cross|2026-02-28 11:00:00|long", "REJECT", "decided", {
      rr: 2,
      htfTrend: "bullish",
    }),
  );
  const deep = evaluateDeep(records, truth);
  assertEqual(deep.filtered.buckets.strategy["macd-cross"].n, MEANINGFUL_N, "selects only");
  assert(deep.filtered.buckets.strategy["macd-cross"].meaningful, "n=20 → meaningful");
  assertEqual(
    deep.filtered.buckets.session["london"],
    undefined,
    "rejected london trade absent from filtered slices",
  );
  assertEqual(
    deep.filtered.buckets.session["asian"].n,
    MEANINGFUL_N - 2,
    "18 selects land in asian hours",
  );
  assert(!deep.filtered.buckets.session["asian"].meaningful, "n=18 is below the threshold");
  assertEqual(deep.filtered.buckets.session["ny"].n, 2, "2 midnight selects land in ny");
  assert(!deep.filtered.buckets.session["ny"].meaningful, "n=2 is below the threshold");
});

test("resumeState: terminal records skip, api-errors are retried, budget is consumed", () => {
  const prior = [
    rec(0, "a|2026-01-01 00:00:00|long", "SELECT", "decided"),
    rec(1, "b|2026-01-02 00:00:00|long", undefined, "invalid-output"),
    rec(2, "c|2026-01-03 00:00:00|long", undefined, "leak-violation"),
    rec(3, "d|2026-01-04 00:00:00|long", undefined, "api-error"),
  ];
  const state = resumeState(prior);
  assertEqual(state.usedBudget, 4, "every prior callback consumed budget");
  assertEqual(state.skipKeys.size, 3, "terminals skipped");
  assertEqual(state.retryKeys.length, 1);
  assertEqual(state.retryKeys[0], "d|2026-01-04 00:00:00|long", "api-error retried");
});
