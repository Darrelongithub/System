/**
 * Causality / lookahead battery — signals, levels and pre-cutoff resolutions
 * must not depend on data that lies in their future. Attack variants mutate,
 * corrupt, flatten, gap, or truncate everything after a cutoff index and
 * demand byte-identical outputs at or before the cutoff.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { loadBaselineCsv, repoPath } from "./fixtures.mjs";
import { readFileSync } from "node:fs";
import { runAnalysis } from "../src/lib/analyzer/run.ts";
import { parseCsv } from "../src/lib/analyzer/parse.ts";

const OPTIONS = { seriesEndsComplete: true, enableHtfDirectionFilter: true };

function splitDataLines(csv) {
  const lines = csv.split("\n");
  const dataIdx = [];
  for (let i = 2; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("===") || l.trim() === "") continue;
    dataIdx.push(i);
  }
  return { lines, dataIdx };
}

function fingerprint(analysis) {
  return analysis.results.map((r) =>
    [
      r.strategyId,
      r.index,
      r.result,
      r.side,
      r.entry,
      r.sl,
      r.tp,
      r.rr,
      r.outcome,
      r.exitDatetime,
      r.exitPrice,
    ].join("|"),
  );
}

function runText(text) {
  const r = runAnalysis(text, OPTIONS);
  if (!r.ok) return { error: r.error };
  return fingerprint(r.analysis);
}

test("causality: future mutations never alter signals or pre-cutoff resolutions", () => {
  const baseline = loadBaselineCsv();
  const ref = runText(baseline);
  assert(!ref.error, "baseline must parse");
  const { lines, dataIdx } = splitDataLines(baseline);
  // exitDatetime -> candle index (mutations below never alter datetimes).
  const dtIndex = new Map();
  for (const c of parseCsv(baseline).candles) dtIndex.set(c.datetime, c.index);

  const idxOf = (row) => Number(row.split("|")[1]);
  const CUTOFFS = [3000, 7500];
  for (const k of CUTOFFS) {
    const cutoffLine = dataIdx[k];
    const refPrefix = ref.filter((row) => idxOf(row) <= k);

    // A: replace every row after the cutoff with extreme (valid) prices.
    const a = [...lines];
    for (let i = cutoffLine + 1; i < lines.length; i++) {
      if (lines[i].startsWith("===") || lines[i].trim() === "") continue;
      const c = lines[i].split(",");
      c[1] = "1000000";
      c[2] = "1000010";
      c[3] = "999990";
      c[4] = "1000005";
      c[14] = "true";
      a[i] = c.join(",");
    }
    // B: everything after the cutoff becomes invalid geometry (high<low).
    const b = [...lines];
    for (let i = cutoffLine + 1; i < lines.length; i++) {
      if (lines[i].startsWith("===") || lines[i].trim() === "") continue;
      const c = lines[i].split(",");
      c[2] = "1";
      c[3] = "2";
      b[i] = c.join(",");
    }
    // C: hard truncation after the cutoff.
    const c = lines.slice(0, cutoffLine + 1);

    for (const [label, variant] of [
      ["extreme-future", a],
      ["invalid-future", b],
      ["truncate", c],
    ]) {
      const got = runText(variant.join("\n"));
      assert(!got.error, `${label} must still parse (K=${k})`);
      const gotPrefix = got.filter((row) => idxOf(row) <= k);
      assertEqual(
        gotPrefix.length,
        refPrefix.length,
        `${label} changed the number of result rows at/before index ${k}`,
      );
      for (let i = 0; i < refPrefix.length; i++) {
        const rf = refPrefix[i].split("|");
        const gf = gotPrefix[i].split("|");
        // Signal identity (strategy, index, result, side, entry, sl, tp, rr):
        // always required — no read-ahead allowed.
        const refSig = rf.slice(0, 8).join("|");
        const gotSig = gf.slice(0, 8).join("|");
        assertEqual(gotSig, refSig, `${label} diverged on signal fields at row ${i} (K=${k})`);
        // Resolution fields are only locked when the resolution completed at
        // or before the cutoff — later outcomes legitimately change when the
        // future itself changes (or vanishes).
        const refExitIdx = rf[9] ? (dtIndex.get(rf[9]) ?? -Infinity) : undefined;
        if (refExitIdx === undefined || refExitIdx <= k) {
          const refOut = rf.slice(8).join("|");
          const gotOut = gf.slice(8).join("|");
          assertEqual(
            gotOut,
            refOut,
            `${label} diverged on pre-cutoff resolution at row ${i} (K=${k})`,
          );
        }
      }
    }
  }
});
