/**
 * OHLC chunked-fetch regression — a backtest date range wider than Twelve
 * Data's per-request row cap must be split into contiguous chunks, fetched
 * sequentially, merged (dedup by timestamp, sorted chronologically), and
 * handed to the analyzer. No chunk may be silently skipped on hard failure,
 * and short ranges must keep taking the original single-request path.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { buildOhlcCsv, chunkDateRange, CHUNK_SPAN_DAYS } from "../src/lib/ohlc-generator.ts";

function candle(datetime, price) {
  return {
    datetime,
    open: String(price),
    high: String(price + 1),
    low: String(price - 1),
    close: String(price + 0.5),
  };
}

function stubFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    calls.push(body);
    const result = await handler(body, calls.length);
    return {
      ok: result.status < 400,
      status: result.status,
      text: async () => JSON.stringify(result.body),
    };
  };
  return { restore: () => (globalThis.fetch = original), calls };
}

function baseOptions(overrides, logs) {
  return {
    symbol: "XAU/USD",
    specifyTime: false,
    startTime: "00:00",
    endTime: "23:59",
    log: (m) => logs.push(m),
    setCooldown: () => {},
    ...overrides,
  };
}

test("chunkDateRange: short range stays a single chunk", () => {
  const chunks = chunkDateRange("2026-01-01", "2026-01-10", CHUNK_SPAN_DAYS);
  assertEqual(chunks.length, 1, "one chunk for a 10-day span");
  assertEqual(chunks[0].start, "2026-01-01");
  assertEqual(chunks[0].end, "2026-01-10");
});

test("chunkDateRange: wide range splits into contiguous, non-overlapping chunks covering the full span", () => {
  const chunks = chunkDateRange("2026-01-01", "2026-08-01", CHUNK_SPAN_DAYS);
  assert(chunks.length > 1, "must split");
  assertEqual(chunks[0].start, "2026-01-01");
  assertEqual(chunks[chunks.length - 1].end, "2026-08-01");
  for (let i = 1; i < chunks.length; i++) {
    const prevEnd = new Date(`${chunks[i - 1].end}T00:00:00Z`);
    const thisStart = new Date(`${chunks[i].start}T00:00:00Z`);
    assertEqual(
      thisStart.getTime() - prevEnd.getTime(),
      86_400_000,
      `chunk ${i} must start exactly one day after the previous chunk ends (no gap, no overlap)`,
    );
  }
  for (const c of chunks) {
    const days =
      (new Date(`${c.end}T00:00:00Z`).getTime() - new Date(`${c.start}T00:00:00Z`).getTime()) /
      86_400_000;
    assert(
      days < CHUNK_SPAN_DAYS,
      `chunk ${c.start}->${c.end} must stay under the per-request cap`,
    );
  }
});

test("buildOhlcCsv: short window takes the original single-request path (no chunk log, one fetch)", async () => {
  const logs = [];
  const stub = stubFetch(async () => ({
    status: 200,
    body: { status: "ok", values: [candle("2026-01-02 09:00:00", 2050)] },
  }));
  try {
    await buildOhlcCsv(baseOptions({ startDate: "2026-01-02", endDate: "2026-01-02" }, logs));
    assertEqual(stub.calls.length, 1, "exactly one upstream request for a short window");
    assert(!logs.some((l) => l.includes("splitting into")), "must not take the chunked path");
  } finally {
    stub.restore();
  }
});

test("buildOhlcCsv: wide window fetches multiple contiguous chunks and merges them", async () => {
  const logs = [];
  const seenRanges = [];
  const stub = stubFetch(async (body) => {
    seenRanges.push(`${body.start_date} -> ${body.end_date}`);
    return {
      status: 200,
      body: {
        status: "ok",
        values: [candle(`${body.start_date.slice(0, 10)} 09:00:00`, 2000 + seenRanges.length)],
      },
    };
  });
  try {
    await buildOhlcCsv(baseOptions({ startDate: "2026-01-01", endDate: "2026-07-15" }, logs));
    assert(stub.calls.length > 1, "a 6.5-month range must be split into multiple requests");
    assert(
      logs.some((l) => l.includes("splitting into") && l.includes("chunk")),
      "must log that it split into chunks",
    );
    assert(
      logs.some(
        (l) => l.includes("Combined") && l.includes("deduplicated") && l.includes("sorted"),
      ),
      "must log the merge/dedup/sort step",
    );
  } finally {
    stub.restore();
  }
});

test("buildOhlcCsv: duplicate timestamps across chunks are deduplicated and the result is sorted", async () => {
  const logs = [];
  let call = 0;
  const stub = stubFetch(async () => {
    call++;
    if (call === 1) {
      return {
        status: 200,
        body: {
          status: "ok",
          values: [candle("2026-02-01 10:00:00", 10), candle("2026-01-05 09:00:00", 1)],
        },
      };
    }
    return {
      status: 200,
      body: {
        status: "ok",
        // Same timestamp as chunk 1's second row (boundary duplicate) plus one new row.
        values: [candle("2026-01-05 09:00:00", 999), candle("2026-04-01 09:00:00", 40)],
      },
    };
  });
  try {
    await buildOhlcCsv(baseOptions({ startDate: "2026-01-01", endDate: "2026-06-01" }, logs));
    const mergeLine = logs.find((l) => l.includes("Combined") && l.includes("deduplicated"));
    assert(mergeLine, "merge log line must be present");
    assert(
      /into 3 deduplicated/.test(mergeLine),
      `4 raw rows with 1 duplicate timestamp must collapse to 3; got: ${mergeLine}`,
    );
  } finally {
    stub.restore();
  }
});

test("buildOhlcCsv: a hard provider error on any chunk aborts the whole fetch — no partial/synthetic substitution", async () => {
  const logs = [];
  let call = 0;
  const stub = stubFetch(async () => {
    call++;
    if (call === 1) {
      return { status: 200, body: { status: "ok", values: [candle("2026-01-05 09:00:00", 1)] } };
    }
    return { status: 500, body: { status: "error", message: "internal provider failure" } };
  });
  try {
    const csv = await buildOhlcCsv(
      baseOptions({ startDate: "2026-01-01", endDate: "2026-06-01" }, logs),
    );
    assertEqual(csv, null, "must abort with null, never a partially-built or fabricated CSV");
    assert(
      logs.some((l) => l.includes("internal provider failure")),
      "the provider's real error reason must be surfaced in the log",
    );
  } finally {
    stub.restore();
  }
});

test("buildOhlcCsv: terminal rate limit during a chunked fetch aborts cleanly (reuses the same bounded retry budget)", async () => {
  const logs = [];
  const stub = stubFetch(async () => ({
    status: 429,
    body: { status: "error", code: 429, message: "You have run out of API credits" },
  }));
  try {
    const csv = await Promise.race([
      buildOhlcCsv(
        baseOptions({ startDate: "2026-01-01", endDate: "2026-07-15", rateLimitRetries: 0 }, logs),
      ),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("hung — unbounded retry")), 10000),
      ),
    ]);
    assertEqual(csv, null, "terminal rate-limit must return null");
    assertEqual(
      stub.calls.length,
      1,
      "exactly one upstream attempt when no retries remain, even mid-chunk-plan",
    );
    assert(logs.some((l) => l.includes("aborting this fetch instead of retrying forever")));
  } finally {
    stub.restore();
  }
});
