/**
 * OHLC chunked-fetch regression — a backtest date range wider than Twelve
 * Data's per-request row cap must be split into contiguous chunks, fetched
 * sequentially, merged (dedup by timestamp, sorted chronologically), and
 * handed to the analyzer. No chunk may be silently skipped on hard failure,
 * and short ranges must keep taking the original single-request path.
 */
import { test, assert, assertEqual, assertDeepEqual } from "./tiny.mjs";
import { buildOhlcCsv, chunkDateRange, CHUNK_SPAN_DAYS } from "../src/lib/ohlc-generator.ts";
import { parseCsv } from "../src/lib/analyzer/parse.ts";

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
    // NOTE (2026-09-17 bug hunt): this fixture is deliberately tiny, so the
    // export validator refuses it and buildOhlcCsv returns null — only the merge
    // LOG is observable here. That is why the old assertions could not tell
    // which copy of the shared timestamp survived (a first-wins mutation stayed
    // green), nor that the file was ordered. The assembled series is asserted
    // against real CSV content in the multi-chunk test below, and the
    // deduplication policy itself is documented at the merge site.
    const csv = await buildOhlcCsv(
      baseOptions({ startDate: "2026-01-01", endDate: "2026-06-01" }, logs),
    );
    assertEqual(csv, null, "this fixture is below the validator's floor (see note above)");
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

/**
 * A synthetic XAU/USD series (mild uptrend + oscillation, with isolated
 * zero-range bars so the reliability canary has false rows) long enough to be
 * split across chunks AND rich enough that the export validator accepts it.
 */
function syntheticProviderRows({ startEatMs, days }) {
  const barMs = 30 * 60 * 1000;
  const rows = [];
  let prevClose = null;
  for (let ms = startEatMs, i = 0; i < days * 48; ms += barMs, i++) {
    const level = 2400 + 0.05 * i + 6 * Math.sin((2 * Math.PI * i) / 40);
    const flat = level.toFixed(2);
    if (i % 37 === 11) {
      rows.push({ datetime: eatLabel(ms), open: flat, high: flat, low: flat, close: flat });
      prevClose = level;
      continue;
    }
    const open = prevClose === null ? level : prevClose;
    const close = level;
    rows.push({
      datetime: eatLabel(ms),
      open: open.toFixed(2),
      high: (Math.max(open, close) + 1.2).toFixed(2),
      low: (Math.min(open, close) - 1.2).toFixed(2),
      close: close.toFixed(2),
    });
    prevClose = close;
  }
  return rows;
}

const eatLabel = (ms) =>
  new Date(ms + 3 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");

test("buildOhlcCsv: a real multi-chunk export is ordered, duplicate-free, window-clipped, deterministic, and keeps the later chunk's boundary copy", async () => {
  // Mon 2026-01-05 00:00 EAT, 120 days => two chunks at CHUNK_SPAN_DAYS.
  // EAT wall clock: 2026-01-05 00:00 EAT is 2026-01-04 21:00 UTC. The series is
  // deliberately WIDER than the request on both sides (the generator pads its
  // fetch windows by a day before and two days after), so the "nothing outside
  // the requested window" assertion has real rows to clip.
  const series = syntheticProviderRows({
    startEatMs: Date.UTC(2026, 0, 2, 21, 0), // 2026-01-03 00:00 EAT, two days early
    days: 124,
  });
  assert(series.length > 5000, `fixture must be long enough to chunk (${series.length} rows)`);
  assert(
    series[0].datetime < "2026-01-05 00:00:00" && series.at(-1).datetime > "2026-05-04 23:59:59",
    "fixture must extend past both ends of the requested window",
  );

  const run = async () => {
    const logs = [];
    let chunkCalls = 0;
    const stub = stubFetch(async (body, callIndex) => {
      chunkCalls += 1;
      const start = String(body.start_date);
      const end = String(body.end_date);
      const inWindow = series.filter((r) => r.datetime >= start && r.datetime <= end);
      // A provider re-sending the previous chunk's final bar with revised prices
      // (the boundary-overlap case the merge has to resolve).
      let overlap = [];
      if (callIndex > 1) {
        const previousEnd = String(stub.calls[callIndex - 2].end_date);
        const lastOfPrevious = series.filter((r) => r.datetime <= previousEnd).at(-1);
        if (lastOfPrevious) {
          overlap = [{ ...lastOfPrevious, close: (Number(lastOfPrevious.close) + 50).toFixed(2) }];
        }
      }
      return {
        status: 200,
        body: { status: "ok", values: [...inWindow, ...overlap].reverse() },
      };
    });
    try {
      const csv = await buildOhlcCsv(
        baseOptions({ startDate: "2026-01-05", endDate: "2026-05-04" }, logs),
        // (options spread by baseOptions; no window override needed)
      );
      return { csv, chunkCalls, logs, ranges: stub.calls.map((c) => [c.start_date, c.end_date]) };
    } finally {
      stub.restore();
    }
  };

  const first = await run();
  assert(first.chunkCalls > 1, `expected a multi-chunk fetch, got ${first.chunkCalls} call(s)`);
  assert(first.csv !== null, `export must be produced (log: ${first.logs.slice(-2).join(" | ")})`);
  const candles = parseCsv(first.csv).candles;
  const times = candles.map((c) => c.datetime);
  assert(candles.length > 3000, `expected a full exported series, got ${candles.length} rows`);
  assertEqual(times.length, new Set(times).size, "no timestamp may appear twice");
  assertDeepEqual(times, [...times].sort(), "rows must be exported oldest-first");
  assertEqual(times[0], "2026-01-05 00:00:00", "first exported timestamp");
  assertEqual(times[times.length - 1], "2026-05-04 23:30:00", "last exported timestamp");
  const outside = candles.filter(
    (c) => c.datetime < "2026-01-05 00:00:00" || c.datetime > "2026-05-04 23:59:59",
  );
  assertEqual(outside.length, 0, "the padded fetch window must not leak rows outside the request");

  // The overlap bar must survive exactly once, carrying the LATER chunk's copy.
  const overlapDatetime = series.filter((r) => r.datetime <= first.ranges[0][1]).at(-1).datetime;
  const kept = candles.find((c) => c.datetime === overlapDatetime);
  assert(kept, "the boundary overlap bar must be present");
  assertEqual(
    kept.close,
    Number(series.find((r) => r.datetime === overlapDatetime).close) + 50,
    "the later-fetched copy wins a duplicated timestamp (documented merge policy)",
  );
  assertEqual(
    times.filter((t) => t === overlapDatetime).length,
    1,
    "the boundary bar is not duplicated",
  );

  // Same inputs, same series: the merge/dedup/sort path is deterministic.
  // The metadata's `generated_at` is a wall-clock stamp of the run, so the
  // comparison is over every line after the metadata line.
  const second = await run();
  const body = (csv) => csv.split("\n").slice(1).join("\n");
  assertEqual(
    body(second.csv),
    body(first.csv),
    "two identical fetches must produce a byte-identical series and header",
  );
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
