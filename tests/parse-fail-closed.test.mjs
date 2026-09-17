/**
 * F7 regression — a wrong/corrupted upload must be REJECTED, not surface as an
 * empty, apparently successful analysis. Pre-fix, parseCsv accepted a header
 * that lacked core columns (every candle then came out invalid), and
 * runAnalysis still returned ok:true with zero trades, so the UI showed
 * "no setups" for a file it could never have analysed. These tests pin the
 * three fail-closed boundaries: empty file, missing required column, and an
 * all-invalid body. They also pin that the minimal valid shape still passes,
 * so the gate cannot be made stricter by accident.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import { runAnalysis } from "../src/lib/analyzer/run.ts";
import { loadBaselineCsv } from "./fixtures.mjs";

const metadataLine = loadBaselineCsv().split(/\r?\n/)[0];
const HEADER = "datetime,open,high,low,close,is_reliable";

function pad(n) {
  return String(n).padStart(2, "0");
}

function rows({ invertGeometry = false } = {}) {
  const out = [];
  // Monday 2025-11-03, 20 half-hour bars from 00:00 EAT.
  for (let i = 0; i < 20; i++) {
    const minuteOfDay = i * 30;
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    const base = 4000 + i;
    const open = base.toFixed(2);
    const close = (base + 0.5).toFixed(2);
    const high = (base + 1.0).toFixed(2);
    const low = (base - 0.5).toFixed(2);
    const datetime = `2025-11-03 ${pad(hour)}:${pad(minute)}:00`;
    if (invertGeometry) {
      // high < low — every row must be marked invalid.
      out.push(`${datetime},${open},${low},${high},${close},true`);
    } else {
      out.push(`${datetime},${open},${high},${low},${close},true`);
    }
  }
  return out.join("\n");
}

const validCsv = () => [metadataLine, HEADER, rows()].join("\n");

test("F7: the minimal valid CSV still analyses (gate is not over-strict)", () => {
  const parsed = parseCsv(validCsv());
  assert(!parsed.metadataError, `unexpected parse error: ${parsed.metadataError ?? ""}`);
  assertEqual(parsed.candles.length, 20, "all 20 rows parsed");
  const outcome = runAnalysis(validCsv(), { seriesEndsComplete: true });
  assert(outcome.ok, `minimal valid CSV must analyse; got: ${outcome.error ?? "ok"}`);
});

test("F7: an empty file is rejected with a metadata error", () => {
  const parsed = parseCsv("   \n  \n");
  assert(parsed.metadataError?.includes("empty"), `got: ${parsed.metadataError ?? "none"}`);
  const outcome = runAnalysis("   ");
  assertEqual(outcome.ok, false);
  assert(outcome.error?.includes("INVALID FILE"), `got: ${outcome.error ?? "none"}`);
});

test("F7: a header missing a required column is rejected before rows parse", () => {
  const headerWithoutClose = "datetime,open,high,low,is_reliable";
  const broken = [metadataLine, headerWithoutClose, rows({})].join("\n");
  const parsed = parseCsv(broken);
  assert(parsed.metadataError?.includes("close"), `got: ${parsed.metadataError ?? "none"}`);
  assertEqual(parsed.candles.length, 0, "no candles from a broken header");
  const outcome = runAnalysis(broken);
  assertEqual(outcome.ok, false);
  assert(outcome.error?.includes("INVALID FILE"), `got: ${outcome.error ?? "none"}`);
});

test("F7: a duplicated timestamp keeps the FIRST row and invalidates its siblings", () => {
  // The policy is deliberate (parse.ts: "keep the first; mark later siblings
  // invalid") and decision-relevant: a duplicated bar must not be evaluated
  // twice, and the row that survives decides the entry price.
  // Mutation check (2026-09-17 bug hunt): inverting the policy (keep the last,
  // mark the first invalid) survived the whole suite — nothing asserted which
  // copy of a duplicated timestamp the engine actually uses.
  const t0 = Date.parse("2025-11-03T09:30:00+03:00");
  const dt = (i) =>
    new Date(t0 + i * 1800000 + 3 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const base = 4000 + i;
    rows.push(`${dt(i)},${base},${base + 1},${base - 1},${base + 0.5},true`);
  }
  // Row 6 repeats row 5's timestamp with visibly different prices.
  rows[6] = `${dt(5)},5000,5001,4999,5000.5,true`;
  const csv = [metadataLine, HEADER, ...rows].join("\n");

  const parsed = parseCsv(csv);
  assertEqual(parsed.metadataError, undefined, "header is fine");
  assertEqual(parsed.candles.length, 12, "both rows are present in the file model");
  assertEqual(
    parsed.candles[5].invalid,
    undefined,
    "the first row at a duplicated timestamp stays usable",
  );
  assertEqual(parsed.candles[5].close, 4005.5, "the first row's own values are kept");
  assert(
    parsed.candles[6].invalid?.includes("duplicate datetime"),
    `the later sibling must be marked invalid, got: ${parsed.candles[6].invalid ?? "none"}`,
  );
  assertEqual(
    parsed.candles[6].close,
    5000.5,
    "the invalid sibling keeps its raw values for diagnosis",
  );

  const outcome = runAnalysis(csv, { seriesEndsComplete: true });
  assert(outcome.ok, "the file is still analysable");
  assertEqual(outcome.analysis.invalidRows, 1, "exactly one row excluded");
  assertEqual(
    outcome.analysis.invalidRowList.length,
    1,
    "and it is reported to the user rather than silently dropped",
  );
  assert(
    outcome.analysis.invalidRowList[0].reason.includes("duplicate datetime"),
    `report must name the reason: ${outcome.analysis.invalidRowList[0].reason}`,
  );
  // The kept bar is the first one: its price reaches the engine, the sibling's
  // does not (both would otherwise appear as separate bars).
  const usable = outcome.analysis.results.filter((r) => r.datetime === parsed.candles[5].datetime);
  assert(usable.length > 0, "the kept bar was evaluated");
});

test("F7: an all-invalid body fails closed instead of returning an empty success", () => {
  const parsed = parseCsv([metadataLine, HEADER, rows({ invertGeometry: true })].join("\n"));
  assert(!parsed.metadataError, "header itself is fine");
  assert(parsed.candles.length === 20, "rows were parsed");
  assert(
    parsed.candles.every((c) => c.invalid),
    "every row invalid (high < low)",
  );
  const outcome = runAnalysis([metadataLine, HEADER, rows({ invertGeometry: true })].join("\n"), {
    seriesEndsComplete: true,
  });
  assertEqual(outcome.ok, false);
  assert(
    outcome.error?.includes("no valid data rows"),
    `all-invalid must report rejection; got: ${outcome.error ?? "none"}`,
  );
});
