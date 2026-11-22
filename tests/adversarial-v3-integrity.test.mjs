/** Adversarial contracts for production strategies, live tails, accounting and friction. */
import { test, assert, assertEqual } from "./tiny.mjs";
import { V2_TRADE_STRATEGIES } from "../src/lib/analyzer/strategies/v2-regime-bots.ts";
import { readFileSync } from "node:fs";
import { loadBaselineCsv } from "./fixtures.mjs";
import { runAnalysis } from "../src/lib/analyzer/run.ts";
import {
  frictionInR,
  FRICTION_PRESETS,
  summarizeFrictionAdjustedR,
} from "../src/lib/pipeline/friction.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const signalKey = (row) =>
  JSON.stringify([
    row.result,
    row.side,
    row.entry,
    row.sl,
    row.tp,
    row.riskMultiplier,
    row.trend,
    row.reason,
  ]);

test("adversarial v3: all thirty registered strategies have unique IDs", () => {
  assertEqual(V2_TRADE_STRATEGIES.length, 30, "production strategy count");
  const ids = V2_TRADE_STRATEGIES.map((strategy) => strategy.id);
  assertEqual(new Set(ids).size, ids.length, "strategy IDs must be unique");
});

test("adversarial v3: randomized truncations preserve decisions for all 30 bots", () => {
  const csv = loadBaselineCsv();
  const full = runAnalysis(csv, { seriesEndsComplete: false });
  assert(full.ok, "full reference series parses");
  const ids = new Set(V2_TRADE_STRATEGIES.map((strategy) => strategy.id));
  const dataLines = csv.split("\n");
  const body = [];
  for (let line = 2; line < dataLines.length; line++) {
    if (dataLines[line].trim() && !dataLines[line].startsWith("==="))
      body.push({ line, index: body.length });
  }
  const refRows = full.analysis.results.filter((row) => ids.has(row.strategyId));
  const candidates = new Map(
    V2_TRADE_STRATEGIES.map((strategy) => [strategy.id, { PASS: [], FAIL: [] }]),
  );
  for (const row of refRows)
    if (
      (row.result === "PASS" || row.result === "FAIL") &&
      row.index > 1200 &&
      row.index < body.length - 3
    )
      candidates.get(row.strategyId)[row.result].push(row.index);
  let rng = 0x36eca3a2;
  const random = (max) => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng % max;
  };
  const cutoffs = new Set();
  for (const perBot of candidates.values())
    for (const kind of ["PASS", "FAIL"]) {
      const pool = perBot[kind];
      if (pool.length) cutoffs.add(pool[random(pool.length)]);
    }
  assert(cutoffs.size > 0, "baseline must include v3 trigger/fail opportunities");
  const lineByIndex = body.map(({ line }) => line);
  for (const cutoff of cutoffs) {
    // Retain one later bar so the chosen cutoff itself is not treated as a forming candle.
    const prefix = dataLines.slice(0, lineByIndex[cutoff + 1] + 1).join("\n");
    const result = runAnalysis(prefix, { seriesEndsComplete: false });
    assert(result.ok, `truncated series parses at ${cutoff}`);
    const expected = refRows.filter((row) => row.index === cutoff);
    const actual = result.analysis.results.filter(
      (row) => ids.has(row.strategyId) && row.index === cutoff,
    );
    const byKey = (rows) =>
      new Map(rows.map((row) => [`${row.strategyId}:${row.index}`, signalKey(row)]));
    const exp = byKey(expected),
      got = byKey(actual);
    for (const [key, value] of exp)
      assertEqual(got.get(key), value, `causal signal changed at ${key}`);
  }
});

test("adversarial v3: live-tail, adverse gap and SL-first policies remain explicit", () => {
  const run = read("../src/lib/analyzer/run.ts");
  const status = read("../src/lib/analyzer/status.ts");
  assert(
    run.includes("options.seriesEndsComplete ?? false"),
    "live mode defaults to incomplete tail",
  );
  assert(run.includes("candles.length - 1"), "incomplete final candle is excluded");
  assert(status.includes('resolutionLevel: "SL"'), "stop exits remain explicitly represented");
  assert(
    status.includes("bar opened beyond the stop"),
    "gap stop fills are explained at adverse open",
  );
  assert(status.includes("BOTH TP and SL"), "same-bar ambiguity is documented");
});

test("adversarial v3: friction profiles and R conversion are explicit and arithmetic-safe", () => {
  assertEqual(FRICTION_PRESETS.raw.cost, 0, "raw profile cost");
  assertEqual(FRICTION_PRESETS.tight.cost, 0.2, "tight profile cost");
  assertEqual(FRICTION_PRESETS.realistic.cost, 0.5, "realistic profile cost");
  assertEqual(FRICTION_PRESETS.hostile.cost, 0.8, "hostile profile cost");
  assertEqual(frictionInR(0.5, 2000, 1990), 0.05, "cost converted by stop risk");
  assertEqual(frictionInR(0.5, 2000, 2000), null, "zero risk is unpriceable");
  const summary = summarizeFrictionAdjustedR(
    [
      { setupStatus: "RESOLVED", outcome: "TP", entry: 2000, sl: 1990, rMultiple: 2 },
      { setupStatus: "RESOLVED", outcome: "SL", entry: 2000, sl: 1990, rMultiple: -1 },
      { setupStatus: "FILLED", outcome: "OPEN", entry: 2000, sl: 1990, rMultiple: 0 },
      { setupStatus: "RESOLVED", outcome: "NO_FILL", entry: 2000, sl: 1990, rMultiple: 0 },
    ],
    0.5,
  );
  assertEqual(summary.count, 2, "only resolved TP/SL trades are priced");
  assertEqual(summary.grossSum, 1, "gross resolved R total");
  assert(Math.abs(summary.netSum - 0.9) < 1e-12, "net R subtracts cost per stop risk on each trade");
  const backtest = read("../src/pages/Backtest.tsx");
  assert(
    backtest.includes("Net avg R") && backtest.includes("Gross avg R"),
    "gross and adjusted R are separately labeled",
  );
});
