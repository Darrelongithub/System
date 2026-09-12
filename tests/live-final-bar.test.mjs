/**
 * F2 regression — with seriesEndsComplete=false the final bar is untrusted:
 * excluded from signal generation AND from trade resolution. Pre-fix, live
 * (AnalysisV2) reports marked trades RESOLVED TP/SL on the incomplete final
 * bar. "Now" for resolution is the last signal-eligible bar.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { makeCsv, csvRow, eatDateTime } from "./fixtures.mjs";
import { runAnalysis } from "../src/lib/analyzer/run.ts";
import { evaluateSetupStatus } from "../src/lib/analyzer/status.ts";
import { parseCsv } from "../src/lib/analyzer/parse.ts";

function buildSet() {
  let ms = Date.parse("2025-01-01T00:00:00+03:00");
  const rows = [];
  let p = 4000;
  for (let i = 0; i < 120; i++) {
    p += Math.sin(i / 5) * 2;
    rows.push(csvRow(eatDateTime(ms), p, p + 3, p - 3, p + 0.5));
    ms += 1800000;
  }
  for (let i = 0; i < 10; i++) {
    p += 30;
    rows.push(csvRow(eatDateTime(ms), p - 28, p + 2, p - 30, p));
    ms += 1800000;
  }
  const spike = p + 80;
  for (let i = 0; i < 3; i++) {
    p -= 1;
    rows.push(csvRow(eatDateTime(ms), p + 1, p + 2, p - 1, p));
    ms += 1800000;
  }
  // Final (untrusted) bar spikes violently through open trades' levels.
  rows.push(csvRow(eatDateTime(ms), p, spike, p - 2, spike - 1));
  return rows;
}

test("F2: live mode never resolves a trade on the untrusted final bar", () => {
  const rows = buildSet();
  const finalDt = rows[rows.length - 1].split(",")[0];
  const live = runAnalysis(makeCsv(rows), { seriesEndsComplete: false });
  assert(live.ok, "parse ok");
  const leaks = live.analysis.tradePasses.filter((t) => t.exitDatetime === finalDt);
  assertEqual(
    leaks.length,
    0,
    `resolutions on final bar: ${leaks.map((t) => `${t.strategyId}@${t.index}`).join(",")}`,
  );
});

test("F2: pre-final-bar resolutions are identical between complete and live modes", () => {
  const rows = buildSet();
  const finalDt = rows[rows.length - 1].split(",")[0];
  const complete = runAnalysis(makeCsv(rows), { seriesEndsComplete: true });
  const live = runAnalysis(makeCsv(rows), { seriesEndsComplete: false });
  assert(complete.ok && live.ok, "parse ok");
  const pre = (r) =>
    r.analysis.tradePasses
      .filter((t) => t.exitDatetime && t.exitDatetime !== finalDt)
      .map((t) => `${t.strategyId}@${t.index}:${t.outcome}:${t.exitDatetime}:${t.exitPrice}`)
      .join("|");
  assertEqual(pre(live), pre(complete), "pre-final resolutions diverge between modes");
});

test("F2: a trigger whose only resolution is the untrusted bar reports live, not resolved", () => {
  const rows = buildSet();
  const csv = makeCsv(rows);
  const live = runAnalysis(csv, { seriesEndsComplete: false });
  assert(live.ok, "parse ok");
  // Reproduce the pre-fix leak: evaluating the same row against the FULL
  // series (old behavior) resolves it on the final bar.
  const all = parseCsv(csv).candles;
  const finalDt = all[all.length - 1].datetime;
  let sawLive = 0;
  let sawOldLeak = 0;
  for (const t of live.analysis.tradePasses) {
    if (t.setupStatus === "FILLED" || t.setupStatus === "PENDING") {
      const oldStyle = evaluateSetupStatus(t, all);
      if (
        oldStyle.setupStatus === "RESOLVED" &&
        oldStyle.resolutionCandle &&
        oldStyle.resolutionCandle.datetime === finalDt
      ) {
        sawOldLeak++;
      }
      sawLive++;
    }
  }
  assert(sawLive > 0, "fixture must contain at least one still-live trade");
  assert(
    sawOldLeak > 0,
    "fixture must provoke the pre-fix leak when resolution sees the full series (guard against a vacuous fixture)",
  );
});
