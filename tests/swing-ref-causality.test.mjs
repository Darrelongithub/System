/**
 * Ref causality guard — a similar_swing_ref must resolve only to an EARLIER
 * row. Future-pointing or self-referencing refs are a data-causality
 * violation: report them as unresolved instead of silently letting lookahead
 * data shape this row's trend.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { makeCsv, csvRow, eatDateTime } from "./fixtures.mjs";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import { buildIndex, resolveSwings } from "../src/lib/analyzer/structure.ts";

test("refs: forward-pointing and self refs are rejected as unresolved", () => {
  const t0 = Date.parse("2025-01-01T00:00:00+03:00");
  const dt = (i) => eatDateTime(t0 + i * 1800000);
  const rows = [
    // candle 0 references candle 2 (its future) and itself
    csvRow(dt(0), 100, 105, 99, 102, { refs: JSON.stringify([dt(2), dt(0)]) }),
    csvRow(dt(1), 102, 104, 100, 103, { refs: JSON.stringify([]) }),
    csvRow(dt(2), 103, 120, 101, 110, { refs: JSON.stringify([]) }),
    csvRow(dt(3), 110, 112, 108, 111, { refs: JSON.stringify([dt(2)]) }),
  ];
  const parsed = parseCsv(makeCsv(rows));
  const byDt = buildIndex(parsed.candles);
  const c0 = parsed.candles[0];
  const swings = resolveSwings(c0, byDt);
  assertEqual(swings.candles.length, 0, "no future/self ref may resolve");
  assertEqual(swings.unresolved.length, 2, "both bad refs reported unresolved");
  // A backward ref from candle 3 to candle 2 resolves normally.
  const back = resolveSwings(parsed.candles[3], byDt);
  assertEqual(back.candles.length, 1, "backward ref resolves");
  assertEqual(back.unresolved.length, 0, "backward ref not flagged");
});

test("refs: ordinary past refs and unknown refs behave exactly as before", () => {
  const t0 = Date.parse("2025-01-01T00:00:00+03:00");
  const dt = (i) => eatDateTime(t0 + i * 1800000);
  const rows = [
    csvRow(dt(0), 100, 105, 99, 102, { refs: "[]" }),
    csvRow(dt(1), 102, 104, 100, 103, { refs: JSON.stringify([dt(0), "2020-01-01 00:00:00"]) }),
  ];
  const parsed = parseCsv(makeCsv(rows));
  const byDt = buildIndex(parsed.candles);
  const swings = resolveSwings(parsed.candles[1], byDt);
  assertEqual(swings.candles.length, 1, "past ref resolves");
  assertEqual(swings.unresolved.length, 1, "unknown ref reported, not nulled");
  assert(swings.unresolved[0].startsWith("2020-01-01"), "unknown ref preserved verbatim");
});
