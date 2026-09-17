/**
 * The AI verifier must see what the LIVE analyzer saw — in the backtest too.
 *
 * The live verifier receives `buildReport(analysis, "LIVE")`: only PENDING/FILLED
 * setups, no outcome, plus the CSV as it stood at the decision moment. The
 * backtest replay used to hand it the packaged day report, which states each
 * trigger's forward-resolved outcome (`outcome SL @ ... | realised -1.00R`), the
 * full-window rolling stats that already fold that day's resolutions in, and the
 * raw CSV including the forward bars used to resolve them. The model could read
 * the answer off its own prompt; its verdict was therefore not a replay of the
 * live decision.
 *
 * Pinned here:
 *  - `buildDayReport({ resolutionView: "checkpoint" })` withholds every
 *    forward-derived field and keeps the decision-time ones (setups, entry/SL/TP,
 *    RR, reasons, HTF context, per-strategy evaluated/pass counts);
 *  - the default ("forward") packaging is unchanged — it still records outcomes,
 *    because it is the historical artifact;
 *  - `truncateCsvAt` cuts the CSV at the checkpoint, keeps the document structure
 *    and every earlier row byte-identical, and the note explains the cut;
 *  - on the real baseline, a checkpoint report for a day with resolved triggers
 *    contains no resolution text at all, while the packaged one does.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { readFileSync } from "node:fs";
import { loadBaselineCsv, repoPath } from "./fixtures.mjs";
import { splitCsvLine, truncateCsvAt } from "../src/lib/verifier-input.ts";
import {
  buildDayReport,
  buildStrategyBreakdown,
  emptyState,
  snapshotState,
} from "../src/lib/backtest/engine.ts";
import { analyseContinuous } from "../src/lib/pipeline/continuous.ts";

const TRIGGER = {
  strategyId: "macd-signal-cross",
  strategy: "MACD Signal Cross",
  datetime: "2026-01-05 10:00:00",
  side: "long",
  htfTrend: { h1: "bullish", h4: "ranging", d1: "bullish" },
  entry: 4400,
  sl: 4380,
  tp: 4480,
  rr: 4,
  reason: "MACD cross up",
  setupStatus: "RESOLVED",
  // A trailing exit keeps the exit price distinct from entry/SL/TP, so a test
  // can prove the exit value itself is absent from the checkpoint copy.
  statusNote: "Donchian 5-day trailing exit hit at 2026-01-08 10:00:00 at 4455.5",
  outcome: "TP",
  exitDatetime: "2026-01-08 10:00:00",
  exitPrice: 4455.5,
  rMultiple: 2.5,
  detail: [
    "Entry requirements satisfied: MACD cross up",
    "ATR(14) at entry: 6.00000",
    "Resolution: TP hit at 2026-01-08 10:00:00; trigger price 4455.5; candle O/H/L/C 4460/4470/4450/4465.",
  ],
  kind: "trade",
};

function baseInput(overrides = {}) {
  const state = emptyState("XAU/USD");
  return {
    symbol: "XAU/USD",
    day: "2026-01-05",
    checkpoint: "23:59",
    windowStart: "2025-12-01",
    state,
    triggers: [TRIGGER],
    analyzedRows: 42,
    invalidRows: 0,
    lastRowDatetime: "2026-01-05 23:30:00",
    resolutionEnd: "2026-01-10",
    ...overrides,
  };
}

test("backtest verifier input: the checkpoint view withholds forward-resolved facts", () => {
  const checkpoint = buildDayReport(baseInput({ resolutionView: "checkpoint" }));
  assert(
    !/outcome (TP|SL|NO_FILL|OPEN)\b/.test(checkpoint),
    "no resolved outcome may appear in a checkpoint copy",
  );
  assert(!/realised -?\d/.test(checkpoint), "no realised R");
  assert(!/2026-01-08 10:00:00/.test(checkpoint), "no exit datetime");
  assert(!/4455/.test(checkpoint), "no exit price");
  assert(
    !/Donchian 5-day trailing/.test(checkpoint),
    "no forward resolution note (even a non-TP/SL one)",
  );
  assert(
    !/^\s*-?\s*resolution:(?!\s*withheld)/im.test(checkpoint),
    "no resolution line anywhere — including the detail block run.ts appends to (the explicit 'withheld' placeholder is the only allowed form)",
  );
  assert(
    !/4450\/4470/.test(checkpoint),
    "no resolution candle OHLC smuggled through the detail block",
  );
  assert(checkpoint.includes("ATR(14) at entry"), "decision-time detail lines stay");
  assert(!/status RESOLVED/.test(checkpoint), "no forward-derived setup status");
  assert(
    checkpoint.includes("outcome: (withheld"),
    "the withheld outcome must be stated, not silently dropped",
  );
  assert(checkpoint.includes("RR 4.00"), "decision-time RR stays");
  assert(checkpoint.includes("entry 4400"), "decision-time entry stays");
  assert(checkpoint.includes("SL 4380") && checkpoint.includes("TP 4480"), "levels stay");
  assert(checkpoint.includes("MACD cross up"), "the decision-time reason stays");
  assert(
    checkpoint.includes("H1 bullish / H4 ranging / D1 bullish"),
    "the decision-time HTF context stays",
  );
});

test("backtest verifier input: the packaged report keeps the full historical record", () => {
  const packaged = buildDayReport(baseInput());
  assert(packaged.includes("outcome TP @ 2026-01-08 10:00:00 (4455.5)"), "packaged outcome kept");
  assert(packaged.includes("realised 2.50R"), "packaged realised R kept");
  assert(
    packaged.includes("resolution: Donchian 5-day trailing exit hit at 2026-01-08 10:00:00"),
    "packaged note kept",
  );
  assert(packaged.includes("status RESOLVED"), "packaged status kept");
  assert(
    /forward_resolution_window: 2026-01-05 -> 2026-01-10/.test(packaged),
    "packaged window line kept",
  );
  assert(
    !/forward_resolution_window: withheld/.test(packaged),
    "the default view must not be the checkpoint view",
  );
});

test("backtest verifier input: snapshotState isolates the pre-fold book", () => {
  const state = emptyState("XAU/USD");
  state.firstDay = "2026-01-04";
  state.days = ["2026-01-04"];
  const strategyId = Object.keys(state.stats)[0];
  assert(strategyId, "seeded stats exist");
  state.stats[strategyId].triggers = 3;
  state.stats[strategyId].tpHits = 1;

  const snapshot = snapshotState(state);
  // Folding the day mutates the live state (applyTriggers works in place); the
  // snapshot must not follow it.
  state.stats[strategyId].triggers += 1;
  state.stats[strategyId].tpHits += 1;
  state.days.push("2026-01-05");
  state.skipped.push({ day: "2026-01-05", reason: "x" });

  assertEqual(snapshot.stats[strategyId].triggers, 3, "snapshot triggers frozen");
  assertEqual(snapshot.stats[strategyId].tpHits, 1, "snapshot TP hits frozen");
  assertEqual(snapshot.days.length, 1, "snapshot day list frozen");
  assertEqual(snapshot.skipped.length, 0, "snapshot skipped list frozen");

  const checkpoint = buildDayReport(baseInput({ state: snapshot, resolutionView: "checkpoint" }));
  assert(
    checkpoint.includes("days completed (incl. this one): 1"),
    "checkpoint copy describes the book as of the previous completed day",
  );
});

test("backtest verifier input: truncateCsvAt cuts the CSV at the checkpoint", () => {
  const csv = [
    '# metadata: {"data_age":"2026-01-10 23:30:00 EAT","generated_at":"2026-09-17T00:00:00Z"}',
    "datetime,open,high,low,close",
    "=== MONDAY 2026-01-05 (UTC) ===",
    "2026-01-05 03:00:00,4400,4401,4399,4400",
    "2026-01-05 23:30:00,4400,4402,4398,4401",
    "=== TUESDAY 2026-01-06 (UTC) ===",
    "2026-01-06 03:00:00,4401,4403,4400,4402",
    "2026-01-06 23:30:00,4402,4404,4401,4403",
  ].join("\n");

  const { csv: cut, droppedRows } = truncateCsvAt(csv, "2026-01-05 23:59:59");
  assertEqual(droppedRows, 2, "two later rows dropped");
  const lines = cut.split("\n");
  assertEqual(lines[0], csv.split("\n")[0], "metadata line byte-identical");
  assertEqual(lines[1], "datetime,open,high,low,close", "header byte-identical");
  assert(cut.includes("2026-01-05 23:30:00,4400,4402,4398,4401"), "last kept row intact");
  assert(!cut.includes("2026-01-06 03:00:00"), "later row gone");
  assert(!cut.includes("=== TUESDAY 2026-01-06 (UTC) ==="), "later day marker gone");
  assert(
    cut.includes("withheld — bars later than the checkpoint are not knowable"),
    "the cut is explained to the model",
  );

  // Cutoff inside a day keeps that day's earlier bars only, and keeps the marker.
  const midday = truncateCsvAt(csv, "2026-01-05 12:00:00");
  assert(midday.csv.includes("=== MONDAY 2026-01-05 (UTC) ==="), "own-day marker kept");
  assert(!midday.csv.includes("2026-01-05 23:30:00"), "later bar of the same day dropped");

  // Nothing after the cutoff: byte-identical passthrough.
  const untouched = truncateCsvAt(csv, "2030-01-01 00:00:00");
  assertEqual(untouched.droppedRows, 0, "nothing dropped");
  assertEqual(untouched.csv, csv, "passthrough is byte-identical");
});

test("backtest verifier input: truncation is not defeated by the metadata generated_at date", () => {
  // The metadata line carries today's generated_at; a naive date scan would drop
  // the header line for a historical cutoff. Structural lines must always survive.
  const csv = [
    '# metadata: {"data_age":"2026-01-10 23:30:00 EAT","generated_at":"2026-09-17T12:00:00Z"}',
    "datetime,open,high,low,close",
    "2026-01-06 03:00:00,4401,4403,4400,4402",
  ].join("\n");
  const { csv: cut, droppedRows } = truncateCsvAt(csv, "2026-01-05 23:59:59");
  assertEqual(droppedRows, 1, "the later row is dropped");
  assert(cut.startsWith("# metadata:"), "metadata line survives");
  assert(cut.includes("datetime,open,high,low,close"), "header survives");
});

test("backtest verifier input: on the real baseline a checkpoint day carries no resolution text", () => {
  const continuous = analyseContinuous(loadBaselineCsv(), { seriesEndsComplete: true });
  assert(continuous.ok, "baseline analyses");
  const days = continuous.tradeTriggers
    .filter((t) => t.outcome === "TP" || t.outcome === "SL")
    .map((t) => t.datetime.slice(0, 10));
  const resolvedDays = [...new Set(days)];
  assert(resolvedDays.length > 100, `expected many resolved days, got ${resolvedDays.length}`);

  let checked = 0;
  for (const day of resolvedDays) {
    if (checked >= 5) break;
    const triggers = continuous.tradesOnDay(day);
    if (triggers.length === 0) continue;
    const packaged = buildDayReport({
      symbol: "XAU/USD",
      day,
      checkpoint: "23:59",
      windowStart: "2025-12-01",
      state: emptyState("XAU/USD"),
      triggers,
      strategyBreakdown: buildStrategyBreakdown(continuous.analysis.results, day),
      resolutionEnd: "2026-08-31",
    });
    const checkpoint = buildDayReport({
      symbol: "XAU/USD",
      day,
      checkpoint: "23:59",
      windowStart: "2025-12-01",
      state: emptyState("XAU/USD"),
      triggers,
      strategyBreakdown: buildStrategyBreakdown(continuous.analysis.results, day),
      resolutionEnd: "2026-08-31",
      resolutionView: "checkpoint",
    });
    assert(
      /outcome (TP|SL)\b/.test(packaged),
      `${day}: packaged report must still record outcomes`,
    );
    assert(
      /Resolution: (TP|SL) hit/.test(packaged),
      `${day}: packaged report must keep the resolution detail line`,
    );
    for (const pattern of [
      /outcome (TP|SL|NO_FILL|OPEN)\b/,
      /realised -?\d/,
      /^\s*-?\s*resolution:(?!\s*withheld)/im,
      /status (RESOLVED|EXPIRED)/,
      /Resolution: (TP|SL) hit/,
    ]) {
      assert(
        !pattern.test(checkpoint),
        `${day}: checkpoint report leaked ${pattern} — the verifier would see the answer`,
      );
    }
    checked += 1;
  }
  assertEqual(checked, 5, "five real days checked");
});

test("backtest verifier input: the backtest page feeds the verifier the decision-time copies", () => {
  const source = readFileSync(repoPath("src/pages/Backtest.tsx"), "utf8");
  assert(
    /resolutionView: "checkpoint"/.test(source),
    "Backtest.tsx must build the verifier report with the checkpoint view",
  );
  assert(
    /truncateCsvAt\(continuousCsv, checkpointEnd\)/.test(source),
    "Backtest.tsx must cut the verifier's CSV at the day's checkpoint",
  );
  assert(
    /snapshotState\(working\)/.test(source),
    "the checkpoint view must use the pre-fold state snapshot",
  );
  assert(
    /scoutData: verifierReport/.test(source),
    "the verifier must receive the decision-time report, not the packaged one",
  );
  // The packaged report (the historical artifact) is still built without the view.
  const packaged = /let report = buildDayReport\(\{[\s\S]*?\}\);/.exec(source);
  assert(packaged, "packaged day report call found");
  assert(!/resolutionView/.test(packaged[0]), "packaged report keeps full resolutions");
});

test("backtest verifier input: the CSV handed over contains no forward rows (real baseline)", () => {
  const csv = loadBaselineCsv();
  const lines = csv.split("\n");
  const header = splitCsvLine(lines[1]);
  const datetimeAt = header.indexOf("datetime");
  assert(datetimeAt >= 0, "baseline has a datetime column");

  const cutoff = "2026-03-10 23:59:59";
  const { csv: cut, droppedRows } = truncateCsvAt(csv, cutoff);
  assert(droppedRows > 5000, `expected the forward tail to be dropped, got ${droppedRows}`);

  let lastKept = "";
  let keptRows = 0;
  for (const line of cut.split("\n").slice(2)) {
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(line)) continue;
    const dt = splitCsvLine(line)[datetimeAt];
    assert(dt <= cutoff, `kept row ${dt} is after the cutoff`);
    assert(dt >= lastKept, "kept rows stay in order");
    lastKept = dt;
    keptRows += 1;
  }
  assert(keptRows > 4000, `expected most rows kept, got ${keptRows}`);
  assert(cut.includes("# note:") && cut.includes(cutoff), "the withheld note names the checkpoint");
});
