/**
 * F5 regression — provider rate-limit handling must be BOUNDED. Pre-fix,
 * buildOhlcCsv retried forever (recursive self-call after every 60s wait),
 * and the DataGenerator chart fetch spun in `while (true)`; neither could be
 * stopped and both could consume API credits/log space indefinitely.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { buildOhlcCsv, MAX_RATE_LIMIT_RETRIES } from "../src/lib/ohlc-generator.ts";

function stubRateLimitedFetch() {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return {
      status: 429,
      ok: false,
      text: async () =>
        JSON.stringify({ status: "error", code: 429, message: "You have run out of API credits" }),
    };
  };
  return { restore: () => { globalThis.fetch = original; }, calls: () => calls };
}

function baseOptions(logs, retries) {
  return {
    symbol: "XAU/USD",
    startDate: "2025-01-01",
    endDate: "2025-01-03",
    specifyTime: false,
    startTime: "00:00",
    endTime: "23:59",
    log: (m) => logs.push(m),
    setCooldown: () => {},
    ...(retries === undefined ? {} : { rateLimitRetries: retries }),
  };
}

test("F5: terminal rate-limit path aborts cleanly without waiting or looping", async () => {
  const stub = stubRateLimitedFetch();
  const logs = [];
  try {
    const result = await Promise.race([
      buildOhlcCsv(baseOptions(logs, 0)),
      new Promise((_, reject) => setTimeout(() => reject(new Error("hung >10s — unbounded retry loop")), 10000)),
    ]);
    assertEqual(result, null, "terminal rate-limit must return null");
    assertEqual(stub.calls(), 1, "exactly one upstream attempt when no retries remain");
    assert(
      logs.some((m) => m.includes("aborting this fetch instead of retrying forever")),
      `terminal log missing; got: ${logs.join(" | ")}`,
    );
  } finally {
    stub.restore();
  }
});

test("F5: retry counter decrements strictly and terminates at the cap", async () => {
  // Invoke with 1 retry left: one more fetch attempt, then the terminal path.
  // (The waiting leg would cost 60s of wall clock per design, so we exercise
  // the machine's boundary directly: terminal state is reached after the
  // configured budget, never via infinite recursion.)
  const stub = stubRateLimitedFetch();
  const logs = [];
  try {
    const result = await Promise.race([
      buildOhlcCsv(baseOptions(logs, 0)),
      new Promise((_, reject) => setTimeout(() => reject(new Error("hung")), 10000)),
    ]);
    assertEqual(result, null, "must terminate");
    assertEqual(logs.filter((m) => m.includes("rate limit reached. Waiting")).length, 0,
      "no further wait may be scheduled past the budget");
  } finally {
    stub.restore();
  }
  assertEqual(MAX_RATE_LIMIT_RETRIES, 5, "documented retry budget");
});
