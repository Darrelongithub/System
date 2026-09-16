/**
 * Live-fidelity guard: how much history does the live analyzer need before its
 * answer on the actionable bar equals the backtest's answer for that same bar?
 *
 * Live analysis runs on whatever CSV the user generated, so the fetch window is
 * a *product* input, not an implementation detail: a short window starves the
 * warm-up (EMA200, the 50-bar ATR percentile behind Filter C, daily aggregates,
 * and the per-strategy dedupe state) and the live decision for the newest bar
 * silently stops matching the backtest.
 *
 * Measured on the locked baseline with the live policy (`seriesEndsComplete:
 * false`), comparing the last signal-eligible bar against a full-history run of
 * the same bar:
 *
 *   window    rows differing on the actionable bar
 *   150-300   4
 *   400-800   2
 *   900+      0
 *   1000+     0, and the final ~180 bars are identical
 *
 * The test pins 1,000 bars as the supported floor with margin over the measured
 * ~900-bar break-even. If a future change lengthens warm-up (a longer EMA, a
 * deeper percentile window, more carry-over state) this fails, which is the
 * point: the requirement has to be re-measured and re-published, not discovered
 * by a user acting on a different signal than the backtest showed.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { loadBaselineCsv } from "./fixtures.mjs";
import { runAnalysis } from "../src/lib/analyzer/run.ts";
import { ANALYZER_LIVE_OPTIONS } from "../src/lib/analyzer/config.ts";

const SUPPORTED_WINDOW_BARS = 1000;

let cached = null;
function liveRuns() {
  if (cached) return cached;
  const csv = loadBaselineCsv();
  const lines = csv.split("\n");
  const meta = lines[0];
  const header = lines[1];
  const data = lines.slice(2).filter((l) => l.trim() !== "");

  const full = runAnalysis(csv, ANALYZER_LIVE_OPTIONS);
  if (!full.ok) throw new Error(full.error);
  const window = runAnalysis(
    [meta, header, ...data.slice(-SUPPORTED_WINDOW_BARS)].join("\n"),
    ANALYZER_LIVE_OPTIONS,
  );
  if (!window.ok) throw new Error(window.error);

  cached = { full: full.analysis.results, window: window.analysis.results, data };
  return cached;
}

const key = (r) => `${r.datetime}|${r.strategyId}|${r.side ?? "-"}`;
const sig = (r) => `${r.result}|${r.reason}|${r.entry ?? ""}|${r.sl ?? ""}|${r.tp ?? ""}`;

test(`warm-up: a ${SUPPORTED_WINDOW_BARS}-bar live window reproduces full-history decisions on the newest bars`, () => {
  const { full, window } = liveRuns();
  const fullByKey = new Map(full.map((r) => [key(r), sig(r)]));
  const windowByKey = new Map(window.map((r) => [key(r), sig(r)]));

  // The actionable bar under the live policy is the last signal-eligible row.
  const lastIndex = full.reduce((m, r) => (r.index > m ? r.index : m), 0);
  const actionableIndex = lastIndex - 1;
  const actionableDt = full.find((r) => r.index === actionableIndex)?.datetime;
  assert(actionableDt, "baseline must expose an actionable bar");

  let differing = 0;
  for (const [k, v] of windowByKey) {
    if (!k.startsWith(`${actionableDt}|`)) continue;
    if (fullByKey.get(k) !== v) differing += 1;
  }
  for (const [k, v] of fullByKey) {
    if (!k.startsWith(`${actionableDt}|`)) continue;
    if (windowByKey.get(k) !== v) differing += 1;
  }
  assertEqual(differing, 0, "actionable-bar rows differing between windowed and full-history runs");
});

test(`warm-up: with ${SUPPORTED_WINDOW_BARS} bars, the whole final trading day matches full history`, () => {
  const { full, window } = liveRuns();
  const fullByKey = new Map(full.map((r) => [key(r), sig(r)]));
  const windowByKey = new Map(window.map((r) => [key(r), sig(r)]));

  const lastDt = full.reduce((m, r) => (r.datetime > m ? r.datetime : m), "");
  const day = lastDt.slice(0, 10);

  let compared = 0;
  for (const r of full) {
    if (!r.datetime.startsWith(day)) continue;
    if (!windowByKey.has(key(r))) continue; // window starts after this row
    compared += 1;
    assertEqual(windowByKey.get(key(r)), fullByKey.get(key(r)), `row ${key(r)}`);
  }
  assert(compared > 20, `expected a full trading day of rows to compare, got ${compared}`);
});
