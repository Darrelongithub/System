/**
 * GENERATOR WINDOW STABILITY — the exported CSV must describe each bar
 * identically no matter how far the fetched window extends.
 *
 * Why this is a product invariant, not a nicety: the live analyzer runs on a
 * fresh export that ENDS at the newest bar, while the backtest replays a file
 * that continues past it. Any enrichment column the engine reads whose value for
 * bar k depends on bars after k makes the same calendar bar describe itself
 * differently in the two files, so the replay stops reproducing the live
 * decision (PROJECT-CHARTER: causality, determinism, live↔backend parity).
 *
 * The measured failure this pins: the reliability gap rule compared each row
 * against the average gap of the WHOLE file, so regenerating the same data with
 * a longer window flipped `is_reliable` for 216 of 4,812 overlapping bars on the
 * locked baseline; because reliability drives the ATR chain, `atr_30m` — the
 * denominator of every SL/TP distance — differed for 2,189 of them (mean 6.6%,
 * max 61%) and 82 PASS/FAIL decisions flipped inside a single shared date range.
 *
 * The check is on the CAUSAL columns only. `similar_swing_retrace_pct`,
 * `similar_swing_continued_pct`, `swing_invalidated` and the retrace horizon are
 * forward-computed by design (they are the hindsight columns the pipeline
 * documents and strips); `is_reliable`, `reliable_streak_length`, `atr_30m`,
 * `local_avg_range`, `range` and `session` are the ones the engine consumes.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { loadBaselineCsv } from "./fixtures.mjs";
import { buildOhlcCsv } from "../src/lib/ohlc-generator.ts";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import { runAnalysis } from "../src/lib/analyzer/run.ts";
import { ANALYZER_CERTIFIED_OPTIONS, ANALYZER_LIVE_OPTIONS } from "../src/lib/analyzer/config.ts";

const CAUSAL_COLUMNS = [
  "session",
  "range",
  "localAvgRange",
  "isReliable",
  "atr30m",
  "reliableStreakLength",
];

let cache = null;
/**
 * Two exports of the same market data, produced by the real generator through a
 * stubbed provider: the full window, and a window that stops at the midpoint
 * (exactly the shape of a live export, which cannot contain bars that have not
 * printed yet). The locked baseline is replayed as the provider feed so the
 * scenario is real (9,738 bars, every session, weekend closures included) —
 * read-only, nothing is written back to the artifact.
 */
async function exports() {
  if (cache) return cache;
  const providerRows = parseCsv(loadBaselineCsv())
    .candles.map((candle) => ({
      datetime: candle.datetime,
      open: String(candle.open),
      high: String(candle.high),
      low: String(candle.low),
      close: String(candle.close),
    }))
    .sort((a, b) => a.datetime.localeCompare(b.datetime));

  const firstDay = providerRows[0].datetime.slice(0, 10);
  const lastDay = providerRows.at(-1).datetime.slice(0, 10);
  const midDay = providerRows[Math.floor(providerRows.length / 2)].datetime.slice(0, 10);

  const generate = async (endDate) => {
    const originalFetch = globalThis.fetch;
    const logs = [];
    globalThis.fetch = async (_url, init) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      const values = providerRows
        .filter(
          (row) => row.datetime >= String(body.start_date) && row.datetime <= String(body.end_date),
        )
        .reverse(); // Twelve Data returns newest first
      return new Response(JSON.stringify({ status: "ok", values }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    try {
      const csv = await buildOhlcCsv({
        symbol: "XAU/USD",
        startDate: firstDay,
        endDate,
        specifyTime: false,
        startTime: "00:00",
        endTime: "23:59",
        log: (message) => logs.push(String(message)),
        setCooldown: () => {},
      });
      return { csv, logs };
    } finally {
      globalThis.fetch = originalFetch;
    }
  };

  const full = await generate(lastDay);
  const prefix = await generate(midDay);
  assert(full.csv !== null, `full export generated (log tail: ${full.logs.slice(-3).join(" | ")})`);
  assert(
    prefix.csv !== null,
    `prefix export generated (log tail: ${prefix.logs.slice(-3).join(" | ")})`,
  );
  cache = {
    fullCsv: full.csv,
    prefixCsv: prefix.csv,
    full: parseCsv(full.csv).candles,
    prefix: parseCsv(prefix.csv).candles,
    midDay,
  };
  return cache;
}

test("generator: the same bar carries the same causal columns in a live-length export and a longer one", async () => {
  const { full, prefix, midDay, fullCsv, prefixCsv } = await exports();

  // Non-vacuity: the prefix really is a shorter window over the same series,
  // with the full window extending past it.
  assert(
    prefix.length > 1000 && full.length > prefix.length + 1000,
    `expected a long pre-fix overlap (prefix ${prefix.length}, full ${full.length})`,
  );
  assertEqual(prefix.at(-1).datetime.slice(0, 10), midDay, "prefix ends at the midpoint day");

  const fullByDatetime = new Map(full.map((candle) => [candle.datetime, candle]));
  let compared = 0;
  const diffs = {};
  const note = (column, datetime, a, b) => {
    diffs[column] = diffs[column] ?? { count: 0, example: `${datetime}: prefix=${a} full=${b}` };
    diffs[column].count += 1;
  };
  for (const candle of prefix) {
    const other = fullByDatetime.get(candle.datetime);
    if (!other) continue;
    compared += 1;
    for (const column of CAUSAL_COLUMNS) {
      const a = candle[column];
      const b = other[column];
      const same =
        typeof a === "number" && typeof b === "number"
          ? Math.abs(a - b) < 1e-9
          : String(a) === String(b);
      if (!same) note(column, candle.datetime, a, b);
    }
  }
  assert(compared > 4000, `expected thousands of shared rows, compared ${compared}`);
  assertEqual(
    Object.keys(diffs).length,
    0,
    `causal columns must not depend on how far the window extends:\n  ${Object.entries(diffs)
      .map(([column, info]) => `${column}: ${info.count} row(s), e.g. ${info.example}`)
      .join("\n  ")}`,
  );

  // Anti-vacuity for the specific rule that broke: the two files' global
  // per-session gap averages must actually differ (that is what used to decide
  // the flags), and at least one shared row must sit between the two thresholds
  // — i.e. the old whole-file rule would have flipped that row. A test that
  // cannot provoke the old behaviour cannot protect the new one.
  const ms = (datetime) => Date.parse(`${datetime.replace(" ", "T")}+03:00`);
  const globalGapMeans = (candles) => {
    const bySession = { asian: [], london: [], ny: [] };
    for (let i = 1; i < candles.length; i++) {
      const previous = candles[i - 1];
      const current = candles[i];
      const adjacent =
        Math.abs(ms(current.datetime) - ms(previous.datetime) - 30 * 60 * 1000) < 1000;
      if (!adjacent || previous.session !== current.session) continue;
      bySession[current.session].push(Math.abs(current.open - previous.close));
    }
    const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    return {
      asian: mean(bySession.asian),
      london: mean(bySession.london),
      ny: mean(bySession.ny),
    };
  };
  const prefixMeans = globalGapMeans(prefix);
  const fullMeans = globalGapMeans(full);
  const shifted = ["asian", "london", "ny"].filter(
    (session) => Math.abs(prefixMeans[session] - fullMeans[session]) / fullMeans[session] > 0.01,
  );
  assert(
    shifted.length > 0,
    `the old whole-file rule must be provably unstable on this fixture (per-session means moved: ${JSON.stringify({ prefixMeans, fullMeans })})`,
  );
  let betweenThresholds = 0;
  for (let i = 1; i < prefix.length; i++) {
    const previous = prefix[i - 1];
    const current = prefix[i];
    const adjacent = Math.abs(ms(current.datetime) - ms(previous.datetime) - 30 * 60 * 1000) < 1000;
    if (!adjacent || previous.session !== current.session) continue;
    const gap = Math.abs(current.open - previous.close);
    const oldPrefixFlag = gap > 2 * prefixMeans[current.session];
    const oldFullFlag = gap > 2 * fullMeans[current.session];
    if (oldPrefixFlag !== oldFullFlag) betweenThresholds += 1;
  }
  assert(
    betweenThresholds > 0,
    "at least one row must have been flipped by the old whole-file rule, or this test proves nothing",
  );

  // And the product-level statement: with the same inputs, the live run on the
  // short export and the certified replay on the long export now reach the same
  // decision on every bar both can see.
  const live = runAnalysis(prefixCsv, ANALYZER_LIVE_OPTIONS);
  const replay = runAnalysis(fullCsv, ANALYZER_CERTIFIED_OPTIONS);
  assert(live.ok && replay.ok, "both analyses succeed");
  const cutoff = live.analysis.lastRowDatetime;
  const signature = (row) =>
    `${row.result}|${row.reason}|${row.entry ?? ""}|${row.sl ?? ""}|${row.tp ?? ""}`;
  const replayByKey = new Map(
    replay.analysis.results
      .filter((row) => row.datetime <= cutoff)
      .map((row) => [`${row.index}|${row.strategyId}`, signature(row)]),
  );
  let comparedRows = 0;
  let divergent = 0;
  let example = null;
  for (const row of live.analysis.results) {
    if (row.datetime > cutoff) continue;
    const other = replayByKey.get(`${row.index}|${row.strategyId}`);
    if (other === undefined) continue;
    comparedRows += 1;
    if (other !== signature(row)) {
      divergent += 1;
      example ??= `${row.datetime} ${row.strategyId}: live ${row.result} (${row.reason?.slice(0, 30)}) vs replay ${other.slice(0, 40)}`;
    }
  }
  assert(comparedRows > 10_000, `expected a full decision table to compare, got ${comparedRows}`);
  assertEqual(
    divergent,
    0,
    `live export vs replay export decision divergence on shared bars: ${divergent}/${comparedRows} (e.g. ${example})`,
  );
});
