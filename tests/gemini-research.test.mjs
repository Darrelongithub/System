/**
 * Gemini research-layer tests — leak integrity, output validation, client
 * resilience (retry/timeout/auth/rate-limit), budget enforcement, and exact
 * evaluation math. The deterministic engine is never touched: these tests
 * exercise ONLY the AI layer via injected transports and synthetic triggers.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import {
  buildDecisionPrompt,
  compressPatterns,
  evaluateRecords,
  OPTIMIZED_CALLBACK_BUDGET,
  parseDecision,
  promptLeakScan,
  RESEARCH_CALLBACK_BUDGET,
  runResearch,
  sanitizeCandidate,
  visibleContext,
} from "../src/lib/ai/research.ts";
import { generateGemini, loadGeminiConfig, GeminiError } from "../src/lib/ai/gemini.api.ts";

const mkTrigger = (over = {}) => ({
  strategyId: "macd-cross",
  strategy: "MACD Cross",
  datetime: "2026-01-05 14:00:00",
  side: "long",
  htfTrend: "bullish",
  entry: 100,
  sl: 95,
  tp: 112,
  rr: 2.4,
  reason: "MACD histogram crossed above signal",
  setupStatus: "RESOLVED", // future knowledge — must never reach the prompt
  statusNote: "TP hit at 2026-01-05 22:30:00", // future knowledge — must never reach the prompt
  outcome: "TP", // future knowledge
  exitDatetime: "2026-01-05 22:30:00", // future knowledge
  exitPrice: 112, // future knowledge
  rMultiple: 2.4, // future knowledge
  detail: ["extra"],
  kind: "trade",
  ...over,
});

const ctx = (datetime, message = "obs", strategyId = "ct-tick") => ({
  strategyId,
  strategy: strategyId,
  datetime,
  message,
});

function okFetch(status, body, delayMs = 0, calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    if (delayMs > 0) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, delayMs);
        init.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new Error("aborted"));
        });
      });
    }
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      text: async () => body,
    };
  };
}

test("budgets: research=1000, optimized=250", () => {
  assertEqual(RESEARCH_CALLBACK_BUDGET, 1000);
  assertEqual(OPTIMIZED_CALLBACK_BUDGET, 250);
});

test("integrity: sanitized prompt carries zero outcome/future fields", () => {
  const trigger = mkTrigger();
  const candidate = sanitizeCandidate(trigger);
  const context = [
    ctx("2026-01-05 13:30:00"),
    ctx("2026-01-05 14:00:00"),
    ctx("2026-01-05 14:30:00", "FUTURE obs"),
  ];
  const visible = visibleContext(context, candidate.datetime);
  assertEqual(visible.length, 2, "future context observation excluded");
  const prompt = buildDecisionPrompt(candidate, visible);
  for (const forbidden of [
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
    "2026-01-05 14:30:00",
    "extra",
  ]) {
    assert(!prompt.includes(forbidden), `prompt must not contain "${forbidden}"`);
  }
  for (const required of [
    candidate.entry.toString(),
    candidate.sl.toString(),
    candidate.tp.toString(),
    candidate.reason,
    "DECISION TIMESTAMP",
  ]) {
    assert(prompt.includes(required), `prompt carries ${required}`);
  }
  assertEqual(
    promptLeakScan(prompt, candidate.datetime).length,
    0,
    "clean prompt passes its own gate",
  );
});

test("integrity: leak scan rejects planted future/outcome content", () => {
  const candidate = sanitizeCandidate(mkTrigger());
  const prompt = buildDecisionPrompt(candidate, []);
  assert(
    promptLeakScan(prompt + "\noutcome: TP", candidate.datetime).length > 0,
    "outcome token caught",
  );
  assert(
    promptLeakScan(prompt + "\n2026-01-06 00:00:00 future candle", candidate.datetime).length > 0,
    "future datetime caught",
  );
  assert(
    promptLeakScan(prompt, "2026-01-05 12:00:00").length > 0,
    "decision-time event itself becomes future when mislabeled",
  );
});

test("validation: parseDecision accepts clean JSON, rejects everything else", () => {
  const good = JSON.stringify({
    verdict: "SELECT",
    confidence: "H",
    rationale: "clean structure",
    factors: ["a"],
    patternTags: ["t"],
  });
  const wrapped = `Here is my analysis:\n${good}\n(originally-deterministic notes)`;
  const w = parseDecision(wrapped);
  assert(w.ok && w.decision.verdict === "SELECT", "prose-wrapped JSON accepted");
  for (const bad of [
    "no braces at all",
    '{"verdict":"MAYBE","confidence":"H","rationale":"x","factors":[],"patternTags":[]}',
    '{"verdict":"SELECT","confidence":"H"}',
    `{"verdict":"SELECT","confidence":"H","rationale":"${"x".repeat(5000)}","factors":[],"patternTags":[]}`,
    '{"verdict":"SELECT","confidence":"H","rationale":"ok","factors":[],"patternTags":[]', // truncated
  ]) {
    assert(!parseDecision(bad).ok, `rejected: ${bad.slice(0, 40)}`);
  }
});

test("client: no key fails closed with auth error and zero network calls", async () => {
  const calls = [];
  const config = { ...loadGeminiConfig({}), apiKey: undefined };
  let failed = null;
  try {
    await generateGemini(
      config,
      { systemPrompt: "s", userPrompt: "u" },
      okFetch(200, "{}", 0, calls),
    );
  } catch (e) {
    failed = e;
  }
  assert(failed instanceof GeminiError && failed.kind === "auth", "auth error raised");
  assertEqual(calls.length, 0, "no network call without key");
});

test("client: 429 retries and succeeds; 401 never retries; timeout classified", async () => {
  let n = 0;
  const okBody = JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"v":1}' }] } }] });
  const retriable = async (url, init) => {
    n += 1;
    if (n === 1)
      return {
        ok: false,
        status: 429,
        headers: { get: () => null },
        text: async () => '{"error":{"message":"rate"}}',
      };
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => okBody };
  };
  const config = { ...loadGeminiConfig({}), apiKey: "k", maxRetries: 2, timeoutMs: 5000 };
  const res = await generateGemini(config, { systemPrompt: "s", userPrompt: "u" }, retriable);
  assertEqual(res.attempts, 2, "one retry after 429");
  assertEqual(res.text, '{"v":1}');

  let m = 0;
  const fatal = async () => {
    m += 1;
    return {
      ok: false,
      status: 401,
      headers: { get: () => null },
      text: async () => '{"error":{"message":"bad key"}}',
    };
  };
  let err = null;
  try {
    await generateGemini(config, { systemPrompt: "s", userPrompt: "u" }, fatal);
  } catch (e) {
    err = e;
  }
  assert(err instanceof GeminiError && err.kind === "auth", "401 → auth kind");
  assertEqual(m, 1, "401 not retried");

  const slow = okFetch(
    200,
    JSON.stringify({ candidates: [{ content: { parts: [{ text: "x" }] } }] }),
    200,
  );
  let err2 = null;
  try {
    await generateGemini(
      { ...config, timeoutMs: 20, maxRetries: 0 },
      { systemPrompt: "s", userPrompt: "u" },
      slow,
    );
  } catch (e) {
    err2 = e;
  }
  assert(err2 instanceof GeminiError && err2.kind === "timeout", "abort → timeout kind");

  const garbage = okFetch(200, "<html>upstream proxy error</html>");
  let err3 = null;
  try {
    await generateGemini(
      { ...config, maxRetries: 0 },
      { systemPrompt: "s", userPrompt: "u" },
      garbage,
    );
  } catch (e) {
    err3 = e;
  }
  assert(
    err3 instanceof GeminiError && err3.kind === "bad-response",
    "non-JSON 200 → bad-response, never a decision",
  );
});

async function stubRun(over = {}) {
  const candidates = Array.from({ length: 5 }, (_, i) =>
    mkTrigger({ datetime: `2026-01-0${i + 1} 14:00:00` }),
  );
  return runResearch({
    candidates,
    contextEvents: [],
    stage: "research",
    maxCallbacks: 3,
    config: loadGeminiConfig({}),
    sleep: async () => {},
    paceMs: 0,
    stubDecide: (_c, prompt) =>
      JSON.stringify({
        verdict: "SELECT",
        confidence: "M",
        rationale: `stub ${prompt.length}`,
        factors: ["f"],
        patternTags: ["t"],
      }),
    ...over,
  });
}

test("budget: callbacks are hard-capped; over-budget candidates get no record", async () => {
  const records = await stubRun();
  assertEqual(records.length, 3, "exactly 3 callbacks for budget 3");
  assert(
    records.every((r) => r.status === "decided"),
    "all decided under stub",
  );
});

test("fail-closed: malformed model output is recorded invalid-output, never a decision", async () => {
  const records = await stubRun({
    stubDecide: () => "I think this one looks pretty good actually",
  });
  assert(
    records.every((r) => r.status === "invalid-output"),
    "all invalid",
  );
  assert(
    records.every((r) => r.decision === undefined),
    "no fabricated decisions",
  );
});

test("fail-closed: pre-call leak violation blocks the model call", async () => {
  let calls = 0;
  const records = await runResearch({
    candidates: [mkTrigger()],
    contextEvents: [ctx("2026-01-05 13:00:00", "something suspicious: TP hit later")], // leak-bearing context text
    stage: "research",
    maxCallbacks: 1,
    config: loadGeminiConfig({}),
    sleep: async () => {},
    paceMs: 0,
    stubDecide: () => {
      calls += 1;
      return "{}";
    },
  });
  assertEqual(records[0].status, "leak-violation");
  assertEqual(calls, 0, "model never called on leaked prompt");
});

test("evaluation: exact math on hand-computable synthetic set", () => {
  const truth = [
    { strategyId: "a", datetime: "2026-01-01 00:00:00", side: "long", outcome: "TP", rMultiple: 2 },
    {
      strategyId: "a",
      datetime: "2026-01-02 00:00:00",
      side: "long",
      outcome: "SL",
      rMultiple: -1,
    },
    { strategyId: "a", datetime: "2026-01-03 00:00:00", side: "long", outcome: "TP", rMultiple: 1 },
    {
      strategyId: "a",
      datetime: "2026-01-04 00:00:00",
      side: "long",
      outcome: "SL",
      rMultiple: -1,
    },
    {
      strategyId: "a",
      datetime: "2026-01-05 00:00:00",
      side: "long",
      outcome: "OPEN",
      rMultiple: 0,
    },
    {
      strategyId: "a",
      datetime: "2026-01-06 00:00:00",
      side: "long",
      outcome: "NO_FILL",
      rMultiple: 0,
    },
  ];
  const rec = (i, key, verdict, status = "decided") => ({
    index: i,
    key,
    decisionDatetime: key.split("|")[1],
    stage: "research",
    promptHash: "",
    prompt: "",
    contextCount: 0,
    contextTruncated: 0,
    status,
    decision:
      status === "decided"
        ? {
            verdict,
            confidence: "M",
            rationale: "-",
            factors: [],
            patternTags: verdict === "SELECT" ? ["x"] : [],
          }
        : undefined,
  });
  const records = [
    rec(0, "a|2026-01-01 00:00:00|long", "SELECT"),
    rec(1, "a|2026-01-02 00:00:00|long", "REJECT"),
    rec(2, "a|2026-01-03 00:00:00|long", "SELECT"),
    rec(3, "a|2026-01-04 00:00:00|long", "SELECT"),
    rec(4, "a|2026-01-05 00:00:00|long", "UNSURE"),
    rec(5, "a|2026-01-06 00:00:00|long", undefined, "api-error"),
  ];
  const m = evaluateRecords(records, truth);
  assertEqual(m.candidates, 6);
  assertEqual(m.decided, 5);
  assertEqual(m.selected, 3, "only SELECTs");
  assertEqual(m.skippedByError, 1);
  assertEqual(m.tp, 2);
  assertEqual(m.sl, 1);
  assertEqual(m.open, 0);
  assertEqual(m.noFill, 0);
  assertEqual(m.totalR, 2, "2 + 1 + (-1)");
  assert(Math.abs(m.avgR - 2 / 3) < 1e-12);
  assert(Math.abs(m.winRate - 2 / 3) < 1e-12);
  assert(Math.abs(m.profitFactor - 3 / 1) < 1e-12);
  assert(Math.abs(m.selectionRate - 3 / 5) < 1e-12);
  // chronological cumulative R: +2, -1(? no — selected are idx 0(+2), 2(+1), 3(-1)): peak 3 after idx2, dd = 3-2 = 1
  assert(Math.abs(m.maxDrawdownR - 1) < 1e-12);

  const lifts = compressPatterns(records, truth);
  assertEqual(lifts.length, 1, "one tag across selects");
  assertEqual(lifts[0].selectedWith, 3);
  assert(Math.abs(lifts[0].winRateWith - 2 / 3) < 1e-12);
  assert(Math.abs(lifts[0].lift - 0) < 1e-12, "tag equals its own base rate");
});
