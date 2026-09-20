/**
 * CSV ROUND-TRIP SEMANTICS — what the writer's documents mean when the parser
 * reads them back, and how a hostile-but-legal document is handled.
 *
 * The analyzer only ever consumes a generator CSV in production, so these cases
 * are about robustness of the boundary rather than the happy path: a value that
 * silently attaches to the wrong column, a numeric format that is misread, or a
 * malformed row that disappears would each corrupt the decision without any
 * visible failure. Every assertion below is the behaviour the parser documents
 * in its own comments:
 *
 *   - columns are read BY HEADER NAME, so order and extra columns cannot shift
 *     a value;
 *   - a row with too FEW cells fails visibly (missing core field), while cells
 *     beyond the header are ignored — never shifted into a core column;
 *   - quoting/escaping/CRLF/BOM are transport details and must not change data;
 *   - a malformed or timezone-bearing datetime is INVALID, never reinterpreted;
 *   - only the section markers the file's own metadata declares are skipped; a
 *     marker-looking line from another convention stays visible as an invalid
 *     row rather than being silently dropped ("bad market data cannot
 *     disappear").
 *
 * Empirical basis (2026-09-17 bug hunt): all of the above were probed against
 * the real parser before being pinned; no implementation change was required.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import { runAnalysis } from "../src/lib/analyzer/run.ts";

const meta = (extra = {}) =>
  `# metadata: ${JSON.stringify({
    data_age: "2026-01-05 23:30:00 EAT",
    spread_convention: "XAUUSD: static estimate of $0.20 per ounce.",
    atr_method: "rolling 14",
    similar_swing_selection_rule: "closest magnitude",
    ...extra,
  })}`;

const HEADER = "datetime,open,high,low,close,is_reliable";

/** `count` valid 30-minute bars starting 2026-01-05 09:00 EAT (wraps days). */
function barRows(count = 12) {
  const out = [];
  const startMinutes = 9 * 60;
  for (let i = 0; i < count; i++) {
    const total = startMinutes + i * 30;
    const day = 5 + Math.floor(total / (24 * 60));
    const minutes = total % (24 * 60);
    const stamp = `2026-01-${String(day).padStart(2, "0")} ${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;
    const base = 4000 + i;
    out.push(`${stamp},${base},${base + 1},${base - 1},${base + 0.5},true`);
  }
  return out;
}

test("csv round trip: values follow their column NAME, not their position", () => {
  // A shuffled header with an extra unrelated column in the middle.
  const header = "close,is_reliable,open,low,high,instrument_note,datetime";
  const body = barRows().map((line) => {
    const [datetime, open, high, low, close] = line.split(",");
    return `${close},true,${open},${low},${high},XAUUSD,${datetime}`;
  });
  const parsed = parseCsv([meta(), header, ...body].join("\n"));
  assertEqual(parsed.metadataError, undefined, "metadata parses");
  assertEqual(parsed.candles.length, 12, "all rows parsed");
  const first = parsed.candles[0];
  assertEqual(first.datetime, "2026-01-05 09:00:00", "datetime follows its column name");
  assertEqual(first.open, 4000, "open follows its column name");
  assertEqual(first.high, 4001, "high follows its column name");
  assertEqual(first.low, 3999, "low follows its column name");
  assertEqual(first.close, 4000.5, "close follows its column name");
  assertEqual(first.invalid, undefined, "no row was invalidated by the reordering");
  assertEqual(first.raw["instrument_note"], "XAUUSD", "the unknown column is kept verbatim in raw");
});

test("csv round trip: quoting, escaped quotes, commas and unicode are preserved", () => {
  const header = `${HEADER},direction,note`;
  const body = [
    '2026-01-05 09:00:00,4000,4001,3999,4000.5,true,"Bull, ish","say ""hi"", naïve ✓"',
    "2026-01-05 09:30:00,4000.5,4002,3999,4001.5,true,Bearish,plain",
  ];
  const parsed = parseCsv([meta(), header, ...body].join("\n"));
  assertEqual(parsed.metadataError, undefined, "metadata parses");
  const [a, b] = parsed.candles;
  assertEqual(a.direction, "Bull, ish", "a quoted comma stays inside the field");
  assertEqual(a.raw["note"], 'say "hi", naïve ✓', "escaped quotes and non-ASCII survive");
  assertEqual(b.direction, "Bearish", "the next row is not shifted by the quoted comma");
  assertEqual(b.close, 4001.5, "core columns stay aligned");
});

test("csv round trip: numeric formats parse to their true values; junk fails visibly", () => {
  const header = `${HEADER},body_percent_of_range,similar_swing_retrace_pct,atr_30m,similar_swing_refs`;
  const refs = JSON.stringify(["2026-01-05 09:00:00"]);
  const body = [
    `2026-01-05 09:00:00,4e3,4.001e3,3999,4000.5,true,87.5%,-12.25,1.5E-1,"${refs.replace(/"/g, '""')}"`,
    "2026-01-05 09:30:00,4000.5,4002,3999,4001.5,TRUE,0.0%,0,2,[]",
    "2026-01-05 10:00:00,4001.5,4003,4000,4002.5,Yes,#N/A,#N/A,#N/A,[]",
    '2026-01-05 10:30:00,4002.5,4004,4001,4003.5,1,"1,234.5%",0.5,NaN,[]',
  ];
  const parsed = parseCsv([meta(), header, ...body].join("\n"));
  assertEqual(parsed.metadataError, undefined, "metadata parses");
  const [a, b, c, d] = parsed.candles;

  assertEqual(a.open, 4000, "scientific notation open");
  assertEqual(a.high, 4001, "scientific notation high");
  assertEqual(a.bodyPercentOfRange, 87.5, "percent suffix stripped");
  assertEqual(a.similarSwingRetracePct, -12.25, "negative percentage kept signed");
  assertEqual(a.atr30m, 0.15, "exponent notation atr");
  assertEqual(a.similarSwingRefs.length, 1, "quoted refs JSON reassembled");
  assertEqual(a.similarSwingRefs[0], "2026-01-05 09:00:00", "ref value intact");

  assertEqual(b.isReliable, true, "TRUE is a boolean");
  assertEqual(b.bodyPercentOfRange, 0, "0.0% is zero, not missing");
  assertEqual(c.isReliable, true, "Yes is a boolean");
  assertEqual(c.atr30m, undefined, "#N/A is missing, never a number");
  assertEqual(d.isReliable, true, "1 is a boolean");
  assertEqual(d.atr30m, undefined, "NaN is missing, never a number");
  // A quoted thousands separator is NOT silently re-read as 1234.5.
  assertEqual(
    d.bodyPercentOfRange,
    undefined,
    "a thousands separator is rejected rather than misread as a different number",
  );
  // …and a non-numeric CORE column makes the row visibly invalid instead of
  // silently producing an analysis without that bar.
  const brokenCore = "2026-01-05 11:00:00,4003.5,4005,4002,#N/A,true";
  const withBroken = parseCsv([meta(), HEADER, brokenCore].join("\n"));
  assert(
    withBroken.candles[0].invalid?.includes("missing core fields"),
    `a junk close must invalidate the row, got: ${withBroken.candles[0].invalid ?? "valid"}`,
  );
});

test("csv round trip: CRLF and a UTF-8 BOM change nothing", () => {
  const lf = [meta(), HEADER, ...barRows()].join("\n");
  const crlf = lf.split("\n").join("\r\n");
  const bomb = `\uFEFF${crlf}`;
  const fingerprint = (text) =>
    JSON.stringify(
      parseCsv(text).candles.map((c) => [c.datetime, c.open, c.high, c.low, c.close, c.isReliable]),
    );
  const expected = fingerprint(lf);
  assertEqual(fingerprint(crlf), expected, "CRLF must not alter a single value");
  assertEqual(fingerprint(bomb), expected, "a BOM must not alter a single value");
});

test("csv round trip: only the markers the file declares are skipped; other marker-looking lines stay visible", () => {
  const declared = meta({
    section_marker_convention:
      "Lines starting with '~~~' (day headers) are section markers only. They are never data rows.",
  });
  const text = [
    declared,
    HEADER,
    "~~~ DAY 1 ~~~",
    ...barRows(4),
    "=== UNDECLARED MARKER ===",
    ...barRows(4).map((line) => line.replace("2026-01-05 ", "2026-01-06 ")),
  ].join("\n");
  const parsed = parseCsv(text);
  assert(parsed.candles.length > 0, "the document parsed");
  const asCandle = parsed.candles.filter((c) => c.datetime.startsWith("~~~"));
  assertEqual(asCandle.length, 0, "the declared marker is a divider, never a candle");
  // The undeclared marker is deliberately NOT inferred as a divider: it stays in
  // the row list as an invalid row so bad data cannot vanish. (Its extra cells
  // also shift nothing: the row is rejected on its datetime alone.)
  const visible = parsed.candles.filter((c) => c.datetime.startsWith("==="));
  assertEqual(visible.length, 1, "an undeclared marker line remains visible in the row list");
  assert(
    visible[0].invalid?.includes("malformed or timezone-bearing datetime"),
    `it must be rejected as a malformed row, got: ${visible[0].invalid ?? "valid"}`,
  );

  // With the generator's own convention the same line IS a divider (that is what
  // the generator writes in metadata).
  const generatedConvention = meta({
    section_marker_convention:
      "Lines starting with '===' (day headers and '=== WEEKEND / SKIPPED ===') are section markers only.",
  });
  const withGenerated = parseCsv(
    [generatedConvention, HEADER, "=== MONDAY 2026-01-05 (UTC) ===", ...barRows(4)].join("\n"),
  );
  assertEqual(
    withGenerated.candles.filter((c) => c.datetime.startsWith("===")).length,
    0,
    "the generator's own markers are dividers",
  );
  assertEqual(withGenerated.candles.length, 4, "and all four bars survive");
});

test("csv round trip: malformed and timezone-bearing datetimes are invalid, never reinterpreted", () => {
  const body = [
    "2026-01-05T09:00:00+03:00,4000,4001,3999,4000.5,true",
    "05/01/2026 09:30,4001,4002,4000,4001.5,true",
    "2026-01-05 09:60:00,4002,4003,4001,4002.5,true",
    "2026-13-45 09:30:00,4003,4004,4002,4003.5,true",
    "2026-02-30 09:30:00,4004,4005,4003,4004.5,true",
  ];
  const parsed = parseCsv([meta(), HEADER, ...body].join("\n"));
  assertEqual(parsed.candles.length, 5, "every row is kept in the file model");
  const valid = parsed.candles.filter((c) => c.invalid === undefined);
  assertEqual(
    valid.length,
    0,
    `none of these may be treated as a real bar: ${valid.map((c) => c.datetime).join(" | ")}`,
  );
  for (const candle of parsed.candles) {
    assert(
      candle.invalid?.includes("malformed or timezone-bearing datetime"),
      `${candle.datetime}: ${candle.invalid}`,
    );
  }
  // And the engine refuses the whole file rather than analysing it as shorter.
  const outcome = runAnalysis([meta(), HEADER, ...body].join("\n"), { seriesEndsComplete: true });
  assertEqual(outcome.ok, false, "an all-invalid document fails closed");
  assert(
    outcome.error?.includes("no valid data rows"),
    `rejection must name the cause, got: ${outcome.error ?? "none"}`,
  );
});

test("csv round trip: a CRLF, header-shuffled document still reaches the engine", () => {
  const header = "high,datetime,close,is_reliable,low,open";
  const body = barRows(40).map((line) => {
    const [datetime, open, high, low, close] = line.split(",");
    return `${high},${datetime},${close},true,${low},${open}`;
  });
  const text = [meta(), header, ...body].join("\r\n");
  const outcome = runAnalysis(text, { seriesEndsComplete: true });
  assert(outcome.ok, `must analyse: ${outcome.ok ? "" : outcome.error}`);
  assertEqual(outcome.analysis.analyzedRows, 40, "all 40 rows reached the engine");
  assertEqual(outcome.analysis.invalidRows, 0, "none was invalidated");
});
