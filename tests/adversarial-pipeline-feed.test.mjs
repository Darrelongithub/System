/** Hostile Twelve Data feed and large-series memory-mode checks. */
import { test, assert, assertEqual } from "./tiny.mjs";
import { fetchTwelveDataCandles } from "../src/lib/market-data.ts";
import { isProviderRateLimit } from "../src/lib/market-data.ts";
import { analyseContinuous } from "../src/lib/pipeline/continuous.ts";
import { runAnalysis } from "../src/lib/analyzer/run.ts";
import { loadBaselineCsv } from "./fixtures.mjs";
import { parseCsv } from "../src/lib/analyzer/parse.ts";

const request = {
  symbol: "XAU/USD",
  interval: "30min",
  start_date: "2026-01-01",
  timezone: "Africa/Nairobi",
  outputsize: "5000",
};

test("adversarial feed: rotating keys falls through 429 and preserves forming M30 candle", async () => {
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => {
    const key = new URL(url).searchParams.get("apikey");
    seen.push(key);
    if (key === "limited-key")
      return new Response(JSON.stringify({ code: 429, message: "credits exhausted" }), {
        status: 200,
      });
    return new Response(
      JSON.stringify({
        values: [
          {
            datetime: "2026-01-01 12:00:00",
            open: "2000",
            high: "2002",
            low: "1999",
            close: "2001",
          },
        ],
      }),
      { status: 200 },
    );
  };
  try {
    const result = await fetchTwelveDataCandles(request, ["limited-key", "working-key"]);
    assertEqual(seen.join(","), "limited-key,working-key", "try next key after provider-level 429");
    assertEqual(
      result.data.values?.[0]?.datetime,
      "2026-01-01 12:00:00",
      "transport retains the newest/forming candle",
    );
    assert(
      !isProviderRateLimit(result.response, result.data),
      "successful rotated-key response is not rate limited",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("adversarial feed: all limited keys surface a bounded 429, not a false success", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ code: 429, message: "credits exhausted" }), { status: 200 });
  try {
    const result = await fetchTwelveDataCandles(request, ["one", "two"]);
    assertEqual(result.response.status, 429, "all-key rate limit status");
    assertEqual(result.response.headers.get("Retry-After"), "60", "bounded retry header");
    assert(isProviderRateLimit(result.response, result.data), "shared classifier recognizes 429");
  } finally {
    globalThis.fetch = original;
  }
});

test("adversarial feed: weekend markers are not bars, missing intervals are not backfilled, duplicates fail closed", () => {
  const lines = loadBaselineCsv().split("\n");
  const first = lines[2].split(",");
  const next = [...first];
  first[0] = "2026-01-02 21:00:00";
  next[0] = "2026-01-05 00:00:00";
  const csv = `${lines[0]}\n${lines[1]}\n${first.join(",")}\n=== WEEKEND / SKIPPED ===\n${next.join(",")}`;
  const parsed = parseCsv(csv);
  assertEqual(
    parsed.candles.length,
    2,
    "markers do not parse as candles and missing bars are not synthesized",
  );
  assert(
    parsed.candles[1].index - parsed.candles[0].index === 1,
    "parsed candles remain the two supplied rows",
  );
  assert(
    parsed.candles[1].datetime > parsed.candles[0].datetime,
    "chronological EAT rows remain ordered across weekend gap",
  );
  const duplicate = [...next];
  duplicate[0] = first[0];
  const duplicated = parseCsv(
    `${lines[0]}\n${lines[1]}\n${first.join(",")}\n${duplicate.join(",")}`,
  );
  assert(
    duplicated.candles.some((row) => row.invalid),
    "duplicate timestamps are rejected, not silently merged",
  );
  const full = loadBaselineCsv().split("\n");
  const firstData = full[2];
  full[2] = full[3];
  full[3] = firstData;
  const outOfOrder = runAnalysis(full.join("\n"), { seriesEndsComplete: false });
  assert(
    !outOfOrder.ok && outOfOrder.error.includes("timestamps out of order"),
    "out-of-order provider rows fail closed",
  );
});

test("adversarial pipeline: 50k-bar continuous replay uses fail-row omission without OOM", () => {
  const baseline = loadBaselineCsv().split("\n");
  const header = baseline[1];
  const template = baseline.find((line, i) => i > 1 && line && !line.startsWith("==="));
  assert(template, "baseline supplies a valid candle row");
  const fields = template.split(",");
  const rows = new Array(50_000);
  let timestamp = Date.UTC(2018, 0, 1);
  for (let i = 0; i < rows.length; i++, timestamp += 30 * 60_000) {
    const f = [...fields];
    const date = new Date(timestamp + 3 * 60 * 60_000);
    const stamp = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}:00`;
    f[0] = stamp;
    const mid = 1900 + i * 0.0001;
    f[1] = mid.toFixed(2);
    f[2] = (mid + 2).toFixed(2);
    f[3] = (mid - 2).toFixed(2);
    f[4] = (mid + 0.2).toFixed(2);
    rows[i] = f.join(",");
  }
  const meta = baseline[0];
  const csv = `${meta}\n${header}\n${rows.join("\n")}`;
  const before = process.memoryUsage().heapUsed;
  const started = performance.now();
  const result = analyseContinuous(csv, { seriesEndsComplete: true, omitFailResults: true });
  const elapsedMs = performance.now() - started;
  assert(result.ok, `50k continuous bars complete without OOM: ${result.ok ? "" : result.error}`);
  assert(result.analysis.totalRows >= 49_990, "all generated rows reach analysis");
  assert(
    result.analysis.results.every((row) => row.result !== "FAIL"),
    "memory mode omits retained FAIL row objects",
  );
  assert(
    result.analysis.perStrategy.some((strategy) => strategy.failCount > 0),
    "fail counts remain aggregated despite omission",
  );
  console.log(
    `[adversarial benchmark] 50,000 bars; ${elapsedMs.toFixed(0)} ms; heap delta ${((process.memoryUsage().heapUsed - before) / 1024 / 1024).toFixed(1)} MiB; retained result rows ${result.analysis.results.length}`,
  );
});
