/**
 * The AI verifier must see what the live analyzer saw — nothing that was only
 * knowable after the decision.
 *
 * Three analyzer-CSV columns are computed from bars that come AFTER the row they
 * describe (`similar_swing_retrace_pct` and `similar_swing_continued_pct` measure
 * up to 40 future bars; `swing_invalidated` asks whether any later row closed
 * past a swing). On a historical window they encode the market's answer; live they
 * are empty. Feeding them to the model makes a historical verifier verdict
 * unreproducible in production, so `stripHindsightColumns` blanks them before the
 * prompt is built.
 *
 * Pinned here: the strip preserves the document (header, row count, every other
 * column byte-identical) and is idempotent; the prompt tells the model the columns
 * are unavailable and no longer instructs it to use them; the generator really
 * derives them from a forward window; and the engine's own decisions are
 * independent of them (so blanking cannot change what the product trades).
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { readFileSync } from "node:fs";
import { loadBaselineCsv, repoPath } from "./fixtures.mjs";
import {
  HINDSIGHT_COLUMNS,
  splitCsvLine,
  stripHindsightColumns,
} from "../src/lib/verifier-input.ts";
import { runAnalysis } from "../src/lib/analyzer/run.ts";
import { ANALYZER_CERTIFIED_OPTIONS } from "../src/lib/analyzer/config.ts";

test("verifier input: hindsight columns are blanked without touching anything else", () => {
  const csv = loadBaselineCsv();
  const { csv: stripped, strippedColumns, strippedRows } = stripHindsightColumns(csv);

  assertEqual(
    [...strippedColumns].sort().join(","),
    [...HINDSIGHT_COLUMNS].sort().join(","),
    "columns stripped",
  );
  assert(
    strippedRows > 9000,
    `expected most rows to carry hindsight values, stripped ${strippedRows}`,
  );

  const before = csv.split("\n");
  const after = stripped.split("\n");
  assertEqual(after.length, before.length, "line count preserved");

  const header = splitCsvLine(before[1]);
  assertEqual(after[1], before[1], "header preserved exactly");
  const targetIndexes = new Set(
    HINDSIGHT_COLUMNS.map((name) => header.indexOf(name)).filter((i) => i >= 0),
  );
  assertEqual(
    targetIndexes.size,
    HINDSIGHT_COLUMNS.length,
    "all three columns present in the baseline",
  );

  let checkedRows = 0;
  for (let i = 2; i < before.length; i++) {
    const line = before[i];
    if (!line || line.startsWith("===") || line.startsWith("#")) {
      assertEqual(after[i], line, `non-data line ${i} unchanged`);
      continue;
    }
    const cellsBefore = splitCsvLine(line);
    const cellsAfter = splitCsvLine(after[i]);
    assertEqual(cellsAfter.length, cellsBefore.length, `row ${i} keeps its cell count`);
    assertEqual(cellsAfter.length, header.length, `row ${i} still matches the header`);
    for (let c = 0; c < cellsBefore.length; c++) {
      if (targetIndexes.has(c)) {
        assertEqual(cellsAfter[c], "", `row ${i} column ${header[c]} blanked`);
      } else {
        assertEqual(cellsAfter[c], cellsBefore[c], `row ${i} column ${header[c]} untouched`);
      }
    }
    checkedRows += 1;
  }
  assert(checkedRows > 9000, `checked ${checkedRows} data rows`);

  const again = stripHindsightColumns(stripped);
  assertEqual(again.strippedRows, 0, "second pass strips nothing");
  assertEqual(again.csv, stripped, "second pass is a no-op");
});

test("verifier input: a CSV without the hindsight columns passes through unchanged", () => {
  const csv = [
    "# metadata: {}",
    "datetime,open,high,low,close,session",
    "2026-01-01 00:00:00,4000,4001,3999,4000,asian",
  ].join("\n");
  const result = stripHindsightColumns(csv);
  assertEqual(result.csv, csv, "untouched");
  assertEqual(result.strippedColumns.length, 0, "nothing reported as stripped");
});

test("verifier input: the prompt names the columns as unavailable and never instructs their use", () => {
  const source = readFileSync(repoPath("src/lib/verifier.server.ts"), "utf8");
  for (const column of HINDSIGHT_COLUMNS) {
    assert(source.includes(column), `prompt must name ${column} as omitted`);
  }
  assert(
    /blanked on purpose|omitted — measured from later bars/i.test(source),
    "prompt must say why the columns are missing",
  );
  assert(
    !/Use atr_30m and similar_swing_retrace_pct/i.test(source),
    "prompt must no longer instruct the model to use the retracement percentage",
  );
});

test("verifier input: the generator derives those columns from a forward window", () => {
  // The claim "hindsight" is about the data source, so pin it where it is
  // produced: the swing columns are computed over bars AFTER the swing row.
  const source = readFileSync(repoPath("src/lib/ohlc-generator.ts"), "utf8");
  assert(
    /const futureRows = workingRows\.slice\(index \+ 1/.test(source),
    "retrace/continued must be computed from the forward window",
  );
  assert(
    /const allLaterRows = workingRows\.slice\(index \+ 1\)/.test(source),
    "swing_invalidated must be computed from later rows",
  );
  // The figure is computed on the swing row from the forward window, then
  // exported under the similar_swing_retrace_pct column.
  assert(
    /row\.observedRetracePct = Math\.min\(100, \(counterMove \/ row\.swingRange\) \* 100\)/.test(
      source,
    ),
    "the retracement figure must come from the forward-window counter-move",
  );
  assert(
    /similarSwingRetracePct/.test(source) && /row\.similarSwingRetracePct =/.test(source),
    "and that figure must be what the similar_swing_retrace_pct column carries",
  );
});

test("verifier input: the engine's decisions do not depend on the stripped columns", () => {
  const csv = loadBaselineCsv();
  const { csv: stripped } = stripHindsightColumns(csv);

  const fingerprint = (analysis) =>
    analysis.tradePasses
      .map(
        (t) =>
          `${t.strategyId}|${t.index}|${t.side}|${t.entry}|${t.sl}|${t.tp}|${t.rr}|${t.outcome}|${t.exitDatetime}|${t.rMultiple}`,
      )
      .join("\n");

  const original = runAnalysis(csv, ANALYZER_CERTIFIED_OPTIONS);
  const blanked = runAnalysis(stripped, ANALYZER_CERTIFIED_OPTIONS);
  assert(original.ok && blanked.ok, "both runs succeed");
  assertEqual(
    fingerprint(blanked.analysis),
    fingerprint(original.analysis),
    "trade rows identical",
  );
  assertEqual(
    blanked.analysis.tradePasses.length,
    original.analysis.tradePasses.length,
    "trade count identical",
  );
  assertEqual(
    JSON.stringify(blanked.analysis.contract),
    JSON.stringify(original.analysis.contract),
    "series contract identical",
  );
});
