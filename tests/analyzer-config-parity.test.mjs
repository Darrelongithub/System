/**
 * Live ↔ certified configuration parity.
 *
 * The product promise is: *the backtester reproduces what the live analyzer
 * would have known and done.* That promise is only as good as the guarantee that
 * both paths run the same engine with the same rules, differing **only** in what
 * they may assume about the final row of the series.
 *
 * These tests pin that guarantee structurally, so it cannot erode by edits at a
 * call site:
 *
 *   1. the two shipped configurations differ in exactly one field
 *      (`seriesEndsComplete`), and neither pins a filter → which filters ship is
 *      decided once, by the `runAnalysis` defaults;
 *   2. no file under `src/` outside `run.ts` may mention `enableFilterC` /
 *      `enableFilterF` — a call site cannot run a different rule set;
 *   3. the product entry points (live page, continuous backtest, golden
 *      generator, shared test fixture) use the shared configuration objects;
 *   4. running both configurations over the locked baseline differs only on the
 *      final row of the series — the single, documented policy difference.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { repoPath, loadBaselineCsv } from "./fixtures.mjs";
import { runAnalysis } from "../src/lib/analyzer/run.ts";
import { ANALYZER_CERTIFIED_OPTIONS, ANALYZER_LIVE_OPTIONS } from "../src/lib/analyzer/config.ts";

const read = (p) => readFileSync(repoPath(p), "utf8");

test("config: live and certified differ only in the final-bar policy, and neither pins a filter", () => {
  const live = { ...ANALYZER_LIVE_OPTIONS };
  const certified = { ...ANALYZER_CERTIFIED_OPTIONS };

  assertEqual(
    live["seriesEndsComplete"],
    false,
    "live treats the final row as possibly in progress",
  );
  assertEqual(certified["seriesEndsComplete"], true, "certified treats every row as closed");

  const differing = Object.keys({ ...live, ...certified }).filter((k) => live[k] !== certified[k]);
  assertEqual(differing.join(","), "seriesEndsComplete", "the only permitted difference");

  for (const [name, cfg] of [
    ["live", live],
    ["certified", certified],
  ]) {
    assert(
      !("enableFilterC" in cfg) && !("enableFilterF" in cfg),
      `${name} config must not pin filter flags — shipped filters are defined by run.ts defaults`,
    );
  }
});

test("config: no src/ call site outside run.ts may toggle a filter", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = `${dir}/${entry}`;
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      if (full.endsWith("src/lib/analyzer/run.ts")) continue;
      // Strip comments: the invariant is about *code* toggling a filter, and
      // the config module documents the rule in prose.
      const code = readFileSync(full, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      if (/enableFilter[CF]/.test(code))
        offenders.push(full.replace(`${fileURLToPath(repoPath(""))}/`, ""));
    }
  };
  walk(fileURLToPath(repoPath("src")));
  assertEqual(
    offenders.length,
    0,
    `files toggling filters from a call site:\n  ${offenders.join("\n  ")}`,
  );
});

test("config: the product entry points use the shared configuration objects", () => {
  const expectations = [
    ["src/pages/AnalysisV2.tsx", "ANALYZER_LIVE_OPTIONS"],
    ["src/lib/pipeline/continuous.ts", "ANALYZER_CERTIFIED_OPTIONS"],
    ["scripts/generate-golden.mjs", "ANALYZER_CERTIFIED_OPTIONS"],
    ["tests/fixtures.mjs", "ANALYZER_CERTIFIED_OPTIONS"],
  ];
  for (const [file, symbol] of expectations) {
    const text = read(file);
    assert(text.includes(symbol), `${file} must run the shared configuration (${symbol})`);
    assert(
      !/runAnalysis\([^)]*seriesEndsComplete\s*:/.test(text),
      `${file} must not hand-roll a runAnalysis option object`,
    );
  }
});

test("config: over the locked baseline the two configurations differ only on the final row", () => {
  const csv = loadBaselineCsv();
  const live = runAnalysis(csv, ANALYZER_LIVE_OPTIONS);
  const certified = runAnalysis(csv, ANALYZER_CERTIFIED_OPTIONS);
  assert(live.ok && certified.ok, "both runs must succeed");

  const key = (r) => `${r.index}|${r.strategyId}|${r.side ?? "-"}`;
  const sig = (r) => `${r.result}|${r.reason}|${r.entry ?? ""}|${r.sl ?? ""}|${r.tp ?? ""}`;
  const liveByKey = new Map(live.analysis.results.map((r) => [key(r), sig(r)]));
  const certifiedByKey = new Map(certified.analysis.results.map((r) => [key(r), sig(r)]));

  const lastIndex = certified.analysis.results.reduce((m, r) => (r.index > m ? r.index : m), 0);
  let differing = 0;
  let offFinalRow = 0;
  for (const [k, v] of certifiedByKey) {
    if (liveByKey.get(k) === v) continue;
    differing += 1;
    if (!k.startsWith(`${lastIndex}|`)) offFinalRow += 1;
  }
  assert(differing > 0, "the live/certified policy must be observable, not vacuous");
  assertEqual(
    offFinalRow,
    0,
    "rows before the final row must be identical under both configurations",
  );
});
