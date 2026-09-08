/**
 * Trade-selection layer tests — windows, actionable candidates, evidence
 * tools, news visibility, payload safety gate, response validation, and the
 * full orchestration. Everything is synthetic and deterministic; no engine
 * involvement. Fixture builders live at the bottom.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { decisionTimestamps, windowLabel } from "../src/lib/ai/select/windows.ts";
import { actionableAt, resolvedBy, tradeKeyOf } from "../src/lib/ai/select/candidates.ts";
import {
  EvidenceContext,
  trendContext,
  momentumContext,
  volatilityContext,
  structureContext,
  priceActionContext,
  candidateRiskQuality,
  candleTail,
} from "../src/lib/ai/select/evidence.ts";
import {
  visibleNews,
  normalizeFinnhubCalendar,
  normalizeEventFile,
  eatLocalToUtcMs,
  finnhubProvider,
} from "../src/lib/ai/select/news.ts";
import {
  buildPayload,
  assertPayloadSafety,
  stripJsonFence,
  validateSelection,
  loadSystemPrompt,
  makeLiveCaller,
  DEPLOYMENT_ADDENDUM,
  ADDENDUM_VERSION,
  TOOL_WHITELIST as TOOL_WHITELIST_LIST,
  selectAtDecision,
  stubSelectModel,
  TOOL_WHITELIST,
} from "../src/lib/ai/select/selector.ts";

/* ------------------------------------------------------------------ */
/* windows                                                             */
/* ------------------------------------------------------------------ */

test("windows: fixed times generate per-day EAT decision stamps", () => {
  const stamps = decisionTimestamps(
    ["2026-01-14 00:30:00", "2026-01-14 02:00:00", "2026-01-15 22:00:00"],
    { kind: "times", times: ["12:00", "06:00", "18:00", "06:00"] },
  );
  assertEqual(
    stamps.join(","),
    [
      "2026-01-14 06:00:00",
      "2026-01-14 12:00:00",
      "2026-01-14 18:00:00",
      "2026-01-15 06:00:00",
      "2026-01-15 12:00:00",
      "2026-01-15 18:00:00",
    ].join(","),
    "deduped, sorted, per candle day",
  );
  assertEqual(windowLabel({ kind: "times", times: ["06:00", "12:00"] }), "times(06:00,12:00)");
});

test("windows: every-N-hours, sessions preset, explicit timestamps, validation", () => {
  const every = decisionTimestamps(["2026-01-14 00:30:00"], { kind: "every", hours: 8 });
  assertEqual(every.join(","), "2026-01-14 00:00:00,2026-01-14 08:00:00,2026-01-14 16:00:00");
  const sessions = decisionTimestamps(["2026-01-14 00:30:00"], { kind: "sessions" });
  assertEqual(sessions.join(","), "2026-01-14 01:00:00,2026-01-14 11:00:00,2026-01-14 16:00:00");
  const explicit = decisionTimestamps([], {
    kind: "explicit",
    timestamps: ["2026-01-14 12:00", "2026-01-14 12:00:00"],
  });
  assertEqual(explicit.join(","), "2026-01-14 12:00:00", "deduped + normalized");
  let threw = 0;
  try {
    decisionTimestamps([], { kind: "every", hours: 0 });
  } catch {
    threw++;
  }
  try {
    decisionTimestamps([], { kind: "times", times: ["25:00"] });
  } catch {
    threw++;
  }
  try {
    decisionTimestamps([], { kind: "explicit", timestamps: ["nope"] });
  } catch {
    threw++;
  }
  assertEqual(threw, 3, "invalid configs rejected");
});

/* ------------------------------------------------------------------ */
/* actionable candidates                                               */
/* ------------------------------------------------------------------ */

test("candidates: resolved, staggered, arrival, exact-T, determinism, corruption", () => {
  const mk = (over) => ({
    strategyId: "s1",
    datetime: "2026-01-14 06:00:00",
    side: "long",
    entry: 100,
    sl: 95,
    tp: 110,
    rr: 2,
    htfTrend: "bullish",
    ...over,
  });
  const T = "2026-01-14 12:00:00";
  const resolved = mk({ strategyId: "res", outcome: "TP", exitDatetime: "2026-01-14 11:00:00" });
  const liveEarly = mk({
    strategyId: "early",
    datetime: "2026-01-13 17:00:00",
    outcome: "TP",
    exitDatetime: "2026-01-14 18:00:00",
  });
  const atT = mk({ strategyId: "now", datetime: T });
  const future = mk({ strategyId: "fut", datetime: "2026-01-14 12:30:00" });
  const open = mk({ strategyId: "open", outcome: "OPEN" });
  assert(resolvedBy(resolved, T), "resolved before T");
  assert(!resolvedBy(liveEarly, T), "resolves after T → still live");
  const set = actionableAt([future, open, atT, resolved, liveEarly], T);
  const ids = set.candidates.map((c) => c.strategyId);
  assertEqual(
    ids.join(","),
    "early,now,open",
    "early signal kept, exact-T kept, OPEN kept; resolved+future excluded",
  );
  const set2 = actionableAt([open, liveEarly, future, resolved, atT], T);
  assertEqual(
    JSON.stringify(set.candidates),
    JSON.stringify(set2.candidates),
    "input permutation cannot change ids/order",
  );
  const bad = actionableAt([mk({ strategyId: "bad-inj", tp: undefined })], T);
  assert(!bad.ok && bad.corrupt.length === 1, "corrupt candidate poisons the set");
  // boundary: an exit DURING the bar starting at T is not knowable at instant T
  const atBoundary = actionableAt([mk({ strategyId: "edge", outcome: "SL", exitDatetime: T })], T);
  assertEqual(
    atBoundary.candidates.length,
    1,
    "exit at T's own bar stays actionable (only exits BEFORE T remove a candidate)",
  );
  const justBefore = actionableAt(
    [mk({ strategyId: "edge2", outcome: "SL", exitDatetime: "2026-01-14 11:59:59" })],
    T,
  );
  assertEqual(justBefore.candidates.length, 0, "exit one second before T removes the candidate");
});

/* ------------------------------------------------------------------ */
/* evidence tools                                                      */
/* ------------------------------------------------------------------ */

test("evidence: future immunity — appending absurd candles never changes a snapshot", () => {
  const candles = walk(220);
  const T = candles[150].datetime;
  const before = snapshotBundle(new EvidenceContext(candles), T);
  const absurd = candles.map((c) => ({ ...c }));
  for (let i = 156; i < absurd.length; i++) {
    absurd[i] = {
      datetime: absurd[i].datetime,
      open: 99999 + i,
      high: 999999 + i,
      low: 90000 + i,
      close: 999999 + i,
    };
  }
  const after = snapshotBundle(new EvidenceContext(absurd), T);
  assertEqual(
    JSON.stringify(after),
    JSON.stringify(before),
    "future mutation must not move any tool output at T",
  );
});

test("evidence: historical sensitivity — mutating data before T changes outputs", () => {
  const candles = walk(220);
  const T = candles[150].datetime;
  const before = snapshotBundle(new EvidenceContext(candles), T);
  const mutated = candles.map((c) => ({ ...c }));
  for (let i = 100; i < 140; i++)
    mutated[i] = { ...mutated[i], high: mutated[i].high + 500, low: mutated[i].low - 500 };
  const after = snapshotBundle(new EvidenceContext(mutated), T);
  assert(
    JSON.stringify(after) !== JSON.stringify(before),
    "historical mutation must move evidence",
  );
});

test("evidence: insufficient history is explicit, values never fabricated", () => {
  const candles = walk(10);
  const ctx = new EvidenceContext(candles);
  const asOf = ctx.asOfIndex(candles[5].datetime);
  const trend = trendContext(ctx, asOf);
  assertEqual(trend.state, "insufficient_history");
  assertEqual(trend.value.ema200, undefined);
  const vol = volatilityContext(ctx, asOf);
  assertEqual(vol.value.atr14, undefined, "ATR needs 15 bars, not faked");
  assertEqual(vol.state, "insufficient_history");
  const none = trendContext(ctx, -1);
  assertEqual(none.state, "no_data");
});

test("evidence: hand-checkable values on a tiny crafted series", () => {
  // 16 flat clock-hour bars (range exactly 2) then a jump bar; ATR/ROC by hand.
  const candles = [];
  for (let i = 0; i < 16; i++) {
    const hh = String(i).padStart(2, "0");
    candles.push({ datetime: `2026-01-05 ${hh}:00:00`, open: 100, high: 101, low: 99, close: 100 });
  }
  candles.push({ datetime: "2026-01-05 16:00:00", open: 100, high: 111, low: 100, close: 110 });
  const ctx = new EvidenceContext(candles);
  const asOf = 16;
  const trend = trendContext(ctx, asOf);
  assertEqual(trend.value.ema20, undefined, "only 17 bars");
  // Wilder ATR14 at bar 14: TR of bars 1..14 all flat (2.0) -> exactly 2.0
  assertEqual(volatilityContext(ctx, 14).value.atr14, 2);
  // At bar 16 the jump's TR (11) enters: (2*13 + 11)/14 rounded to 2dp
  const vol = volatilityContext(ctx, asOf);
  assertEqual(vol.value.atr14, 2.64, "wilder update folds the jump TR in");
  const mom = momentumContext(ctx, asOf);
  assert(mom.value.roc5 > 0, "last 5 bars include the jump");
  const pa = priceActionContext(ctx, asOf);
  assertEqual(pa.value.consecutiveDirection, 1, "one up bar");
  const tail = candleTail(candles, asOf, 5);
  assertEqual(tail.length, 5);
  assertEqual(tail[4].c, 110);
});

test("evidence: risk quality relates SL/TP to confirmed structure and ATR", () => {
  const candles = swingSeries();
  const ctx = new EvidenceContext(candles);
  const asOf = candles.length - 1;
  const structure = structureContext(ctx, asOf).value;
  const rq = candidateRiskQuality(
    ctx,
    asOf,
    { side: "long", entry: 106, sl: 95, tp: 126, rr: 2 },
    structure,
  );
  assertEqual(typeof rq.stopDistanceAtr, "number");
  assertEqual(rq.slBeyondNearestSwing, true, "stop below the last confirmed swing low");
  const atr = ctx.atr14[asOf];
  assert(atr !== undefined && atr > 0);
  assert(
    Math.abs(rq.stopDistanceAtr - 11 / atr) < 1e-3,
    "risk-quality matches 11/atr within rounding",
  );
});

/* ------------------------------------------------------------------ */
/* news                                                                */
/* ------------------------------------------------------------------ */

test("news: normalization maps finnhub rows; strips unknown fields", () => {
  const events = normalizeFinnhubCalendar({
    economicCalendar: [
      {
        event: "CPI m/m",
        country: "US",
        impact: "high",
        time: "2026-02-11 13:30:00",
        actual: "0.4",
        estimate: "0.3",
        prev: "0.3",
      },
      { event: "ECB Rate", country: "EU", impact: "2", time: "2026-02-12 13:15:00" },
    ],
  });
  assertEqual(events.length, 2);
  assertEqual(events[0].currency, "USD");
  assertEqual(events[0].impact, "high");
  assertEqual(events[0].status, "released");
  assertEqual(events[0].scheduledAt, "2026-02-11T13:30:00Z");
  assertEqual(events[1].impact, "medium");
  assertEqual(events[1].status, "scheduled");
});

test("news: visibility honors T — schedule yes, unreleased actuals never", () => {
  const events = normalizeEventFile({
    events: [
      {
        id: "up",
        name: "FOMC",
        currency: "USD",
        impact: "high",
        scheduledAt: "2026-01-14T19:00:00Z",
        status: "released",
        actual: "SHOULD-BE-STRIPPED",
      },
      {
        id: "past",
        name: "CPI",
        currency: "USD",
        impact: "high",
        scheduledAt: "2026-01-14T08:30:00Z",
        status: "released",
        releasedAt: "2026-01-14T08:30:00Z",
        actual: "0.4%",
      },
      {
        id: "far",
        name: "FutureBuzz",
        currency: "USD",
        impact: "high",
        scheduledAt: "2026-03-01T00:00:00Z",
      },
      {
        id: "jpy",
        name: "BoJ",
        currency: "JPY",
        impact: "high",
        scheduledAt: "2026-01-14T12:00:00Z",
      },
    ],
  });
  const T = "2026-01-14 14:00:00"; // EAT = 11:00 UTC
  const v = visibleNews(events, T, { horizonHours: 48, lookbackHours: 24 });
  assertEqual(v.upcoming.length, 1, "future JPY excluded (currency), BoJ/filtering correct");
  assertEqual(v.upcoming[0].id, "up");
  assertEqual(
    v.upcoming[0].actual,
    undefined,
    "upcoming event actual stripped even if file claims released",
  );
  assertEqual(v.upcoming[0].status, "scheduled");
  assertEqual(v.upcoming[0].minutesUntil, 480, "19:00Z − 11:00Z = 8h");
  assertEqual(v.recent.length, 1);
  assertEqual(v.recent[0].id, "past");
  assertEqual(v.recent[0].actual, "0.4%", "released-by-T actual visible");
  assert(
    v.recent.every((e) => e.scheduledAt <= "2026-01-14T11:00:00Z"),
    "nothing scheduled after T in recent",
  );
});

test("news: mutating the future calendar cannot change the pre-news at T", () => {
  const mk = () =>
    normalizeEventFile({
      events: [
        {
          id: "evt",
          name: "CPI",
          currency: "USD",
          impact: "high",
          scheduledAt: "2026-01-14T13:30:00Z",
        },
      ],
    });
  const T = "2026-01-14 10:00:00";
  const before = visibleNews(mk(), T);
  const evil = mk();
  evil.push({
    id: "x",
    name: "CATASTROPHIC LEAK",
    currency: "USD",
    impact: "high",
    scheduledAt: "2026-04-01T00:00:00Z",
    status: "released",
    actual: "leak",
  });
  const after = visibleNews(evil, T);
  assertEqual(
    JSON.stringify(after),
    JSON.stringify(before),
    "events beyond the horizon cannot leak into T",
  );
});

/* ------------------------------------------------------------------ */
/* payload safety gate                                                 */
/* ------------------------------------------------------------------ */

test("leak gate: outcome keys and future datetimes are rejected before any call", () => {
  const candles = walk(800);
  const ctx = new EvidenceContext(candles);
  const T = "2026-01-14 12:00:00";
  const set = actionableAt(TRUTH_WS, T);
  assert(set.candidates.length > 0);
  const payload = buildPayload({
    T,
    window: "sessions",
    ctx,
    candidates: set.candidates,
    newsEvents: [],
    datetimes: candles.map((c) => c.datetime),
    tail: 10,
  });
  assertPayloadSafety(payload, T); // must not throw for the honest payload
  const withOutcome = JSON.parse(JSON.stringify(payload));
  withOutcome.candidates[0].outcome = "TP";
  let threw = 0;
  try {
    assertPayloadSafety(withOutcome, T);
  } catch {
    threw++;
  }
  const futureDt = JSON.parse(JSON.stringify(payload));
  futureDt.notes = "something at 2027-01-01 12:00:00 happened";
  try {
    assertPayloadSafety(futureDt, T);
  } catch {
    threw++;
  }
  const newsLeak = JSON.parse(JSON.stringify(payload));
  newsLeak.news = {
    asOfUtc: "2026-01-01T00:00:00.000Z",
    upcoming: [
      {
        id: "x",
        name: "e",
        currency: "USD",
        impact: "high",
        scheduledAt: "2027-01-01T00:00:00Z",
        status: "scheduled",
        actual: "0.9%",
      },
    ],
    recent: [],
  };
  try {
    assertPayloadSafety(newsLeak, T);
  } catch {
    threw++;
  }
  assertEqual(threw, 3, "outcome key, future datetime, and upcoming actual all blocked");
});

/* ------------------------------------------------------------------ */
/* response validation                                                 */
/* ------------------------------------------------------------------ */

test("validation: exactly-one-selection schema is enforced", () => {
  const cands = actionableAt(TRUTH_WS, "2026-01-14 12:00:00").candidates;
  const T = "2026-01-14 12:00:00";
  const good = JSON.stringify({
    decision_timestamp: T,
    selection: "CANDIDATE",
    selected_candidate_id: cands[0].candidateId,
    reasoning: "x",
    rejected_candidates: cands
      .slice(1)
      .map((c) => ({ candidate_id: c.candidateId, reason: "weaker" })),
    tools_used: ["trendContext"],
  });
  assert(validateSelection(good, T, cands).ok, "honest response validates");
  const badId = good.replace(cands[0].candidateId, "c999");
  assert(!validateSelection(badId, T, cands).ok, "unknown selected id rejected");
  const notJson = "sure, I'd pick the first one";
  assert(!validateSelection(notJson, T, cands).ok, "malformed JSON rejected");
  const nullPick = JSON.parse(good);
  nullPick.selected_candidate_id = null;
  assert(
    !validateSelection(JSON.stringify(nullPick), T, cands).ok,
    "CANDIDATE with null pick rejected",
  );
  const invalidSet = JSON.parse(good);
  invalidSet.selection = "INVALID_SET";
  assert(
    !validateSelection(JSON.stringify(invalidSet), T, cands).ok,
    "INVALID_SET with a selected_id rejected",
  );
  const badTool = JSON.parse(good);
  badTool.tools_used = ["futureOracle"];
  assert(!validateSelection(JSON.stringify(badTool), T, cands).ok, "non-whitelisted tool rejected");
  const bothWays = JSON.parse(good);
  bothWays.rejected_candidates.push({
    candidate_id: cands[0].candidateId,
    reason: "contradiction",
  });
  assert(
    !validateSelection(JSON.stringify(bothWays), T, cands).ok,
    "same id selected AND rejected",
  );
  const wrongT = JSON.parse(good);
  wrongT.decision_timestamp = "2026-01-14 13:00:00";
  assert(!validateSelection(JSON.stringify(wrongT), T, cands).ok, "timestamp tampering rejected");
});

/* ------------------------------------------------------------------ */
/* orchestration (stub model)                                          */
/* ------------------------------------------------------------------ */

test("selectAtDecision: empty set → INVALID_SET no-call; corrupt → INVALID_SET; stub decides", async () => {
  const candles = walk(260);
  const ctx = new EvidenceContext(candles);
  const datetimes = candles.map((c) => c.datetime);
  const emptyT = "2026-01-01 00:00:00"; // before any signal
  const recEmpty = await selectAtDecision({
    T: emptyT,
    windowLabel: "t",
    ctx,
    truth: TRUTH_WS,
    newsEvents: undefined,
    datetimes,
    model: "stub",
  });
  assertEqual(recEmpty.status, "invalid-set");
  assertEqual(recEmpty.apiStatus, "no-call");
  assertEqual(recEmpty.selection, "INVALID_SET");
  const corruptTruth = TRUTH_WS.map((t) => ({ ...t }));
  corruptTruth[0] = { ...corruptTruth[0], tp: undefined };
  const T = "2026-01-14 12:00:00";
  const recCorrupt = await selectAtDecision({
    T,
    windowLabel: "t",
    ctx,
    truth: corruptTruth,
    newsEvents: undefined,
    datetimes,
    model: "stub",
  });
  assertEqual(recCorrupt.status, "invalid-set");
  assert(recCorrupt.statusNote.includes("corrupt"));
  const recGood = await selectAtDecision({
    T,
    windowLabel: "t",
    ctx,
    truth: TRUTH_WS,
    newsEvents: undefined,
    datetimes,
    model: "stub",
  });
  assertEqual(recGood.status, "decided");
  assertEqual(recGood.validation, "valid");
  assert(
    ["c1", "c2", "c3", "c4", "c5"].includes(recGood.selectedCandidateId),
    "exactly one of the presented ids",
  );
  // ordering independence: permuted truth → same decision
  const recPermuted = await selectAtDecision({
    T,
    windowLabel: "t",
    ctx,
    truth: [...TRUTH_WS].reverse(),
    newsEvents: undefined,
    datetimes,
    model: "stub",
  });
  assertEqual(
    recPermuted.selectedCandidateId,
    recGood.selectedCandidateId,
    "input order cannot change the decision",
  );
});

test("selectAtDecision: api failure and invalid output fail closed; future-mutation immunity end-to-end", async () => {
  const candles = walk(800);
  const ctx = new EvidenceContext(candles);
  const datetimes = candles.map((c) => c.datetime);
  const T = "2026-01-14 12:00:00";
  const failing = async () => {
    throw new Error("network down");
  };
  const recFail = await selectAtDecision({
    T,
    windowLabel: "t",
    ctx,
    truth: TRUTH_WS,
    newsEvents: undefined,
    datetimes,
    model: "live",
    callModel: failing,
  });
  assertEqual(recFail.status, "api-error");
  const junk = async () => '{"selected_candidate_id":"c1"}';
  const recJunk = await selectAtDecision({
    T,
    windowLabel: "t",
    ctx,
    truth: TRUTH_WS,
    newsEvents: undefined,
    datetimes,
    model: "live",
    callModel: junk,
  });
  assertEqual(recJunk.status, "invalid-output");
  assert(recJunk.validationErrors.length > 0);
  // end-to-end future mutation: absurd rows strictly after T; decision+evidence at T identical
  const asOfInData = candles.findIndex((c) => c.datetime >= T);
  assert(asOfInData > 0, "T must lie inside the candle range for this probe");
  const mutated = candles.map((c) => ({ ...c }));
  for (let i = asOfInData + 5; i < mutated.length; i++)
    mutated[i] = {
      datetime: mutated[i].datetime,
      open: 1e6,
      high: 1e6 + i,
      low: 1e6 - 1,
      close: 1e6 + i,
    };
  const recA = await selectAtDecision({
    T,
    windowLabel: "t",
    ctx,
    truth: TRUTH_WS,
    newsEvents: undefined,
    datetimes,
    model: "stub",
  });
  const recB = await selectAtDecision({
    T,
    windowLabel: "t",
    ctx: new EvidenceContext(mutated),
    truth: TRUTH_WS,
    newsEvents: undefined,
    datetimes: mutated.map((c) => c.datetime),
    model: "stub",
  });
  assertEqual(
    recB.selectedCandidateId,
    recA.selectedCandidateId,
    "decision at T immune to future candles",
  );
  assertEqual(
    JSON.stringify(recB.evidenceSnapshot),
    JSON.stringify(recA.evidenceSnapshot),
    "evidence immune to future candles",
  );
  // payload-level immunity: EVERY field the model receives is identical under future mutation
  const setA = actionableAt(TRUTH_WS, T).candidates;
  const payA = buildPayload({
    T,
    window: "t",
    ctx,
    candidates: setA,
    newsEvents: undefined,
    datetimes,
  });
  const payB = buildPayload({
    T,
    window: "t",
    ctx: new EvidenceContext(mutated),
    candidates: setA,
    newsEvents: undefined,
    datetimes: mutated.map((c) => c.datetime),
  });
  assertEqual(
    JSON.stringify(payB),
    JSON.stringify(payA),
    "the entire payload is immune to future candles (incl. interval detection)",
  );
});

/* ------------------------------------------------------------------ */
test("selectAtDecision: decision before the first candle degrades to no_data, never crashes", async () => {
  const candles = walk(120, { start: "2026-01-20T00:00:00+03:00" });
  const ctx = new EvidenceContext(candles);
  const rec = await selectAtDecision({
    T: "2026-01-14 12:00:00",
    windowLabel: "t",
    ctx,
    truth: TRUTH_WS,
    newsEvents: undefined,
    datetimes: candles.map((c) => c.datetime),
    model: "stub",
  });
  assertEqual(rec.status, "decided", "stub decides even with no candle history yet");
  const ev = rec.evidenceSnapshot;
  assertEqual(ev.trendContext.state, "no_data", "honest no_data at asOf=-1");
  assertEqual(ev.recent_candles.length, 0);
});

test("validation: fenced JSON accepted, prose/multi-select/duplicate-id rejected", () => {
  const cands = actionableAt(TRUTH_WS, "2026-01-14 12:00:00").candidates;
  const T = "2026-01-14 12:00:00";
  const good = JSON.stringify({
    decision_timestamp: T,
    selection: "CANDIDATE",
    selected_candidate_id: cands[0].candidateId,
    reasoning: "x",
    rejected_candidates: [],
    tools_used: ["trendContext"],
  });
  const fenced = "```json\n" + good + "\n```";
  assert(validateSelection(fenced, T, cands).ok, "fenced reply validates");
  assertEqual(stripJsonFence("```\n" + good + "\n```"), good, "bare fence stripped");
  const prose = "Here is my decision: " + good;
  assert(!validateSelection(prose, T, cands).ok, "prose-wrapped output rejected by design");
  const multi = JSON.parse(good);
  multi.selected_candidate_id = [cands[0].candidateId, cands[1].candidateId];
  assert(!validateSelection(JSON.stringify(multi), T, cands).ok, "array of picks rejected");
  multi.selected_candidate_id = cands[0].candidateId + " " + cands[1].candidateId;
  assert(!validateSelection(JSON.stringify(multi), T, cands).ok, "concatenated ids rejected");
  const duplicated = JSON.parse(good);
  duplicated.rejected_candidates = [
    { candidate_id: cands[1].candidateId, reason: "a" },
    { candidate_id: cands[1].candidateId, reason: "b" },
  ];
  assert(
    validateSelection(JSON.stringify(duplicated), T, cands).ok,
    "duplicate rejects tolerated (same id, redundant)",
  );
});

test("payload: future-outcome mutation never changes what Gemini sees", () => {
  const candles = walk(800);
  const ctx = new EvidenceContext(candles);
  const datetimes = candles.map((c) => c.datetime);
  const T = "2026-01-14 12:00:00";
  const build = (truth) => {
    const set = actionableAt(truth, T);
    assert(set.candidates.length > 0);
    return buildPayload({
      T,
      window: "t",
      ctx,
      candidates: set.candidates,
      newsEvents: undefined,
      datetimes,
    });
  };
  const payA = build(TRUTH_WS);
  // mutate eventual outcomes/rMultiples of the presented trades (exits stay after T → same liveness)
  const mutatedTruth = TRUTH_WS.map((t) => ({ ...t }));
  mutatedTruth[0] = { ...mutatedTruth[0], outcome: "SL", rMultiple: -1 };
  mutatedTruth[1] = { ...mutatedTruth[1], outcome: "TP", rMultiple: 99 };
  mutatedTruth[4] = { ...mutatedTruth[4], outcome: "NO_FILL", rMultiple: 0, exitPrice: 1 };
  const payB = build(mutatedTruth);
  assertEqual(
    JSON.stringify(payB),
    JSON.stringify(payA),
    "outcome/rMultiple/exitPrice mutations invisible to the payload",
  );
  // and the pipeline-level decision stays identical too
  // (stub is deterministic over sanitized fields only)
});

test("pipeline e2e: multi-strategy + opposing + staggered in one decision (stub)", async () => {
  const candles = walk(800);
  const ctx = new EvidenceContext(candles);
  const datetimes = candles.map((c) => c.datetime);
  const T = "2026-01-14 12:00:00";
  const rec = await selectAtDecision({
    T,
    windowLabel: "sessions",
    ctx,
    truth: TRUTH_WS,
    newsEvents: undefined,
    datetimes,
    model: "stub",
  });
  assertEqual(rec.status, "decided");
  const presented = rec.candidatesPresented;
  assert(presented.length >= 3, "staggered set presented together");
  const sides = new Set(presented.map((c) => c.side));
  assert(sides.has("long") && sides.has("short"), "opposing candidates in one set");
  const strategies = new Set(presented.map((c) => c.strategyId));
  assertEqual(strategies.size, presented.length, "multiple strategies distinguished");
  assert(
    ["c1", "c2", "c3"].includes(rec.selectedCandidateId),
    "exactly one of the presented ids chosen",
  );
});

test("news: finnhubProvider normalization through injected mock transport (offline proof)", async () => {
  let sawUrl = "";
  const mockFetch = async (url) => {
    sawUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        economicCalendar: [
          {
            event: "CPI",
            country: "US",
            impact: "high",
            time: "2026-01-14 13:30:00",
            estimate: "0.3",
            prev: "0.3",
          },
          {
            event: "BoJ",
            country: "JP",
            impact: "high",
            time: "2026-01-14 03:00:00",
            actual: "-0.1",
          },
        ],
      }),
    };
  };
  const provider = finnhubProvider({ apiKey: "TEST-KEY-NOT-REAL", fetchImpl: mockFetch });
  const events = await provider.fetchCalendar({
    fromUtc: "2026-01-14T00:00:00Z",
    toUtc: "2026-01-15T00:00:00Z",
  });
  assertEqual(events.length, 2, "normalized rows");
  assert(sawUrl.includes("token=TEST-KEY-NOT-REAL"), "token sent on the wire");
  assert(sawUrl.startsWith("https://finnhub.io/api/v1/calendar/economic"), "correct endpoint");
  // visibility at 11:00 EAT (=08:00 UTC): BoJ actual released 03:00Z -> visible; CPI 13:30Z -> upcoming schedule-only
  const v = visibleNews(events, "2026-01-14 11:00:00");
  assertEqual(v.upcoming.filter((e) => e.name === "CPI").length, 1);
  assertEqual(v.upcoming[0].actual, undefined, "upcoming CPI actual stripped");
  assertEqual(
    v.recent.filter((e) => e.name === "BoJ").length,
    0,
    "JPY filtered out of default currency set",
  );
  // fail closed without key
  const noKey = finnhubProvider({ apiKey: "", fetchImpl: mockFetch });
  let threw = false;
  try {
    await noKey.fetchCalendar({ fromUtc: "2026-01-14T00:00:00Z", toUtc: "2026-01-15T00:00:00Z" });
  } catch {
    threw = true;
  }
  assert(threw, "missing key -> fail closed");
});

test("final prompt: asset identity + live caller composes body+addendum end-to-end", async () => {
  const prompt = loadSystemPrompt();
  assertEqual(prompt.version, "ts-v2-final-1", "final prompt asset is wired");
  assert(prompt.body.startsWith("You are a discretionary trade-selection specialist"), "header never leaks into the body");
  assert(!prompt.body.includes("<!--"), "no comment remnants in the body");
  for (const sig of ["MUTUAL EXCLUSIVITY VS. SHARED IDENTITY", "A close call is still a call", "INVALID_SET", "selected_candidate_id"]) {
    assert(prompt.body.includes(sig), `final prompt contains "${sig}"`);
  }
  assert(ADDENDUM_VERSION === "addendum-v1");
  // composition: capture the exact system_prompt sent on the wire
  let captured = "";
  const validResponse = {
    decision_timestamp: "2026-01-14 12:00:00",
    selection: "CANDIDATE",
    selected_candidate_id: "c1",
    reasoning: "same move two slices; nearer target better supported.",
    rejected_candidates: [{ candidate_id: "c2", reason: "further target stretched" }],
    tools_used: ["trendContext"],
  };
  const mockFetch = async (_url, init) => {
    captured = JSON.parse(init.body).system_instruction.parts[0].text;
    return {
      ok: true, status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "```json\n" + JSON.stringify(validResponse) + "\n```" }] } }] }),
      text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: "```json\n" + JSON.stringify(validResponse) + "\n```" }] } }] }),
    };
  };
  const caller = makeLiveCaller({ config: { apiKey: "TEST-KEY", model: "gemini-2.5-flash", baseUrl: "https://example.test", timeoutMs: 5000, maxRetries: 0 }, fetchImpl: mockFetch });
  const raw = await caller('{"x":1}', "2026-01-14 12:00:00");
  assert(captured.includes("MUTUAL EXCLUSIVITY VS. SHARED IDENTITY"), "final body on the wire");
  assert(captured.includes(DEPLOYMENT_ADDENDUM), "addendum appended");
  assert(captured.indexOf("MUTUAL EXCLUSIVITY") < captured.indexOf("DEPLOYMENT ADDENDUM"), "body precedes addendum");
  for (const tool of TOOL_WHITELIST_LIST) assert(DEPLOYMENT_ADDENDUM.includes(tool), `addendum lists ${tool}`);
  assert(DEPLOYMENT_ADDENDUM.includes("NOT computed"), "absent families (MACD/Bollinger/Donchian) flagged");
  // fenced real-world reply round-trips through validation
  const cands = actionableAt(TRUTH_WS, "2026-01-14 12:00:00").candidates;
  const v = validateSelection(raw, "2026-01-14 12:00:00", cands);
  assert(v.ok && v.response.selected_candidate_id === "c1", "fenced Gemini reply validates to c1");
});

test("news: corrupted-feed adversarial — actual attached without release proof never leaks", () => {
  const T = "2026-01-14 12:00:00";
  const evs = [
    // released flag lies: future releasedAt, but an actual value attached
    { id: "c1", name: "CPI", currency: "USD", impact: "high", scheduledAt: "2026-01-14T08:30:00Z", status: "released", releasedAt: "2026-01-14T10:30:00Z", actual: "4.2", forecast: "3.1", previous: "3.0" },
    // past schedule, still "scheduled", actual value attached (feed corruption)
    { id: "c2", name: "PPI", currency: "USD", impact: "high", scheduledAt: "2026-01-14T08:00:00Z", status: "scheduled", actual: "9.9", forecast: "2.2", previous: "2.1" },
    // legitimately released before T (control)
    { id: "c3", name: "Claims", currency: "USD", impact: "medium", scheduledAt: "2026-01-14T07:30:00Z", status: "released", releasedAt: "2026-01-14T07:31:00Z", actual: "211K", forecast: "220K", previous: "219K" },
  ];
  const v = visibleNews(evs, T, { horizonHours: 48, lookbackHours: 48 });
  const byId = Object.fromEntries(v.recent.map((e) => [e.id, e]));
  assert(byId.c1.actual === undefined && byId.c1.status === "scheduled", "future-releasedAt actual suppressed");
  assert(byId.c2.actual === undefined && byId.c2.status === "scheduled", "unreleased-corrupt actual suppressed");
  assertEqual(byId.c3.actual, "211K", "legit released actual passes (control)");
});

test("hostile §6/§10: news provider failure battery + zero key leakage", async () => {
  const KEY = "SUPER-SECRET-TEST-TOKEN-777";
  const urlResp = (json) => ({ ok: true, status: 200, json: async () => json });
  // invalid key / rate limit / server error all fail CLOSED
  for (const status of [401, 403, 429, 500]) {
    const p = finnhubProvider({ apiKey: KEY, fetchImpl: async () => ({ ok: false, status, json: async () => ({}) }) });
    let msg = "";
    try { await p.fetchCalendar({ fromUtc: "2026-01-01", toUtc: "2026-01-02" }); } catch (e) { msg = String(e.message ?? e); }
    assert(msg !== "" && msg.includes(`HTTP ${status}`), `HTTP ${status} fails closed (got: ${msg.slice(0,40)})`);
    assert(!msg.includes(KEY), `error for HTTP ${status} contains NO key material`);
  }
  // malformed payload → closed error, no key
  {
    const p = finnhubProvider({ apiKey: KEY, fetchImpl: async () => urlResp({ nope: true }) });
    await p.fetchCalendar({ fromUtc: "2026-01-01", toUtc: "2026-01-02" }).then(
      () => { throw new Error("malformed payload accepted"); },
      (e) => assert(!String(e).includes(KEY) && !String(e).includes("777"), "malformed error leaks nothing"),
    );
  }
  // empty calendar is legitimate data, NOT an error
  {
    const p = finnhubProvider({ apiKey: KEY, fetchImpl: async () => urlResp({ economicCalendar: [] }) });
    const evs = await p.fetchCalendar({ fromUtc: "2026-01-01", toUtc: "2026-01-02" });
    assertEqual(evs.length, 0, "empty calendar returns empty, not failure");
  }
  // transport timeout: hung provider rejects fast (default wrapper)
  {
    const p = finnhubProvider({ apiKey: KEY, timeoutMs: 40 });
    const t0 = Date.now();
    let rejected = false;
    try { await p.fetchCalendar({ fromUtc: "2026-01-01", toUtc: "2026-01-02" }); } catch { rejected = true; }
    const dt = Date.now() - t0;
    assert(rejected && dt < 2000, `hung fetch rejected fast (${dt}ms), fail closed — no indefinite stall`);
  }
});

test("hostile §3: boundary semantics consolidated — every < vs <= deliberate", () => {
  const T = "2026-01-14 12:00:00"; // EAT == 09:00Z
  const mkB = (over) => ({ strategyId: "s1", datetime: "2026-01-14 06:00:00", side: "long", entry: 100, sl: 95, tp: 110, rr: 2, ...over });
  // candidate signal timestamp == T → PRESENT; > T by one minute → ABSENT
  assert(actionableAt([mkB({ strategyId: "atT", datetime: T })], T).candidates.some((c) => c.strategyId === "atT"), "signal exactly at T is present");
  assert(!actionableAt([mkB({ strategyId: "afterT", datetime: "2026-01-14 12:01:00" })], T).candidates.some((c) => c.strategyId === "afterT"), "signal after T is absent");
  // signal > T by one minute → ABSENT
  {
    const r = mkB({ strategyId: "r1", datetime: "2026-01-13 10:00:00", outcome: "TP", exitDatetime: "2026-01-14 11:59:00" });
    assert(resolvedBy(r, T), "resolved 1 min before T is excluded");
    const r2 = { ...r, strategyId: "r2", exitDatetime: "2026-01-14 12:00:00" };
    assert(!resolvedBy(r2, T), "exit stamp exactly AT T stays actionable (resolution lands inside [T, T+interval))");
  }
  // news scheduled EXACTLY at T → recent branch, status scheduled, NO actual
  {
    const v = visibleNews(
      [{ id: "e1", name: "NFP", currency: "USD", impact: "high", scheduledAt: "2026-01-14T09:00:00Z", status: "scheduled", actual: "1.0" }],
      T, { lookbackHours: 48, horizonHours: 48 },
    );
    const e = v.recent.find((x) => x.id === "e1");
    assert(e && e.status === "scheduled" && e.actual === undefined, "at-T scheduled event: recent, unreleased, actual suppressed");
    assertEqual(v.upcoming.length, 0, "scheduled exactly at T is not 'upcoming'");
  }
  // news releasedAt EXACTLY at T → released, actual VISIBLE (public at T)
  {
    const v = visibleNews(
      [{ id: "e2", name: "CPI", currency: "USD", impact: "high", scheduledAt: "2026-01-14T08:30:00Z", status: "released", releasedAt: "2026-01-14T09:00:00Z", actual: "3.7", previous: "3.5" }],
      T, { lookbackHours: 48, horizonHours: 48 },
    );
    const e = v.recent.find((x) => x.id === "e2");
    assertEqual(e.actual, "3.7", "released exactly at T is knowable at T (inclusive bound, deliberate)");
  }
  // candle slice: bar stamped == T is the LAST visible bar; nothing after T
  {
    const candles = walk(24); // covers 2026-01-13 12:00 .. 2026-01-14 11:00 ... (1h synthetic)
    const ctx = new EvidenceContext(candles);
    const asOf = ctx.asOfIndex(T);
    const visible = candles.slice(0, asOf + 1);
    assert(visible.every((c) => c.datetime <= T), "asOf slice contains nothing after T");
    assert(asOf >= 0 && (asOf + 1 >= candles.length || candles[asOf + 1].datetime > T), "asOf+1 is beyond T");
  }
});

test("hostile §10: gemini client errors never echo the API key", async () => {
  const KEY = "GK-LIVE-LOOKING-SECRET-999";
  const cfg = { apiKey: KEY, model: "m", baseUrl: "https://x.test", timeoutMs: 1000, maxRetries: 0 };
  const mock = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "bad creds" } }), text: async () => '{"error":{"message":"bad creds"}}' });
  let msg = "";
  try { await generateGemini(cfg, { systemPrompt: "s", userPrompt: "u" }, mock); } catch (e) { msg = String(e.message ?? e); }
  assert(msg !== "" && !msg.includes("999") && !msg.includes(KEY.slice(0, 6)), "auth error carries no key material");
  const candles = walk(24);
  const p = buildPayload({ T: "2026-01-14 12:00:00", window: "every-2h", ctx: new EvidenceContext(candles), candidates: actionableAt(TRUTH_WS, "2026-01-14 12:00:00").candidates, newsEvents: [], datetimes: candles.map((c) => c.datetime), tail: 5 });
  assert(!JSON.stringify(p).toLowerCase().includes("apikey") && !JSON.stringify(p).includes("999"), "payload/records contain no key fields");
});

/* fixtures                                                            */
/* ------------------------------------------------------------------ */

/** Gentle deterministic walk of CandleLike rows (30-min spacing, EAT strings). */
function walk(n, opts = {}) {
  const start = Date.parse(opts.start ?? "2026-01-01T00:00:00+03:00");
  const stepMs = opts.stepMs ?? 30 * 60000;
  let p = opts.startPrice ?? 4000;
  const rows = [];
  for (let i = 0; i < n; i++) {
    p += Math.sin(i / 3) * 6 + (i % 13 === 0 ? 9 : -3);
    const eat = new Date(start + i * stepMs + 3 * 3600 * 1000);
    rows.push({
      datetime: `${eat.toISOString().slice(0, 10)} ${eat.toISOString().slice(11, 19)}`,
      open: round2(p),
      high: round2(p + 4),
      low: round2(p - 4),
      close: round2(p + 1),
    });
  }
  return rows;
}

/** Series with one clear swing structure for structure/risk tests. */
function swingSeries() {
  const rows = [];
  const prices = [
    100, 102, 104, 103, 101, 99, 101, 103, 106, 108, 107, 105, 103, 102, 104, 106, 109, 111, 110,
    108, 106, 104, 103, 105, 107, 109, 112, 111, 110, 108,
  ];
  const start = Date.parse("2026-01-01T00:00:00+03:00");
  prices.forEach((p, i) => {
    const eat = new Date(start + i * 3600000 + 3 * 3600 * 1000);
    rows.push({
      datetime: `${eat.toISOString().slice(0, 10)} ${eat.toISOString().slice(11, 19)}`,
      open: p,
      high: p + 1.5,
      low: p - 1.5,
      close: p + 0.5,
    });
  });
  return rows;
}

const round2 = (v) => Math.round(v * 100) / 100;

function snapshotBundle(ctx, T) {
  const asOf = ctx.asOfIndex(T);
  return {
    trend: trendContext(ctx, asOf),
    momentum: momentumContext(ctx, asOf),
    volatility: volatilityContext(ctx, asOf),
    structure: structureContext(ctx, asOf),
    priceAction: priceActionContext(ctx, asOf),
    tail: candleTail(ctx.candles, asOf, 30),
  };
}

/** Wired-so candidates spanning early/live/at/future states around T=2026-01-14 12:00. */
const TRUTH_WS = [
  {
    strategyId: "early-long",
    strategy: "Early Long",
    datetime: "2026-01-13 17:00:00",
    side: "long",
    entry: 4005,
    sl: 3995,
    tp: 4025,
    rr: 2,
    htfTrend: "bullish",
    outcome: "TP",
    exitDatetime: "2026-01-14 18:00:00",
    rMultiple: 2,
  },
  {
    strategyId: "at-t",
    strategy: "At T",
    datetime: "2026-01-14 12:00:00",
    side: "short",
    entry: 4010,
    sl: 4020,
    tp: 3990,
    rr: 2,
    htfTrend: "bearish",
    outcome: "SL",
    exitDatetime: "2026-01-15 09:00:00",
    rMultiple: -1,
  },
  {
    strategyId: "resolved",
    strategy: "Resolved",
    datetime: "2026-01-14 06:00:00",
    side: "long",
    entry: 4000,
    sl: 3990,
    tp: 4020,
    rr: 2,
    htfTrend: "-",
    outcome: "TP",
    exitDatetime: "2026-01-14 11:30:00",
    rMultiple: 2,
  },
  {
    strategyId: "future",
    strategy: "Future",
    datetime: "2026-01-14 18:00:00",
    side: "long",
    entry: 4010,
    sl: 4000,
    tp: 4030,
    rr: 2,
    htfTrend: "-",
    outcome: "TP",
    exitDatetime: "2026-01-16 10:00:00",
    rMultiple: 2,
  },
  {
    strategyId: "still-open",
    strategy: "Still Open",
    datetime: "2026-01-12 08:00:00",
    side: "short",
    entry: 4020,
    sl: 4030,
    tp: 4000,
    rr: 2,
    htfTrend: "bearish",
    outcome: "OPEN",
  },
];
