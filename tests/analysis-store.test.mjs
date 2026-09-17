/**
 * ANALYSIS STORE VALIDATION — the boundary between browser storage and the
 * engine's input.
 *
 * The snapshot is the only path by which the generator's CSV reaches the live
 * analyzer, and it round-trips through `sessionStorage` as JSON: a user can
 * restore a stale entry from a previous version, a quota failure can truncate a
 * write, and any script on the page can rewrite it. `parseAnalysisSnapshot` is
 * the gate that decides whether that text becomes the analyzer's dataset, so it
 * must be strictly fail-closed and must never leak an unexpected field into the
 * analysis (a stale `symbol` with a fresh `ohlcCsv` would mislabel the book).
 *
 * Empirically probed on 2026-09-17 before pinning; the shipped gate behaved
 * correctly on every case below, including the deliberate fail-closed treatment
 * of a legacy snapshot that predates the `csvName`/`ohlcCsv` fields.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { parseAnalysisSnapshot } from "../src/lib/analysis-store-validation.ts";

const VALID = {
  symbol: "XAU/USD",
  createdAt: "2026-01-05 10:30:00",
  range: "2026-01-01 → 2026-01-05",
  csvName: "XAUUSD_30min_2026-01-01_to_2026-01-05.csv",
  ohlcCsv: "# metadata: {}\ndatetime,open\n2026-01-05 09:00:00,4000",
};

test("snapshot: a well-formed snapshot round-trips field for field", () => {
  const parsed = parseAnalysisSnapshot(JSON.stringify(VALID));
  assert(parsed, "a valid snapshot must parse");
  assertEqual(parsed.symbol, VALID.symbol, "symbol");
  assertEqual(parsed.createdAt, VALID.createdAt, "createdAt");
  assertEqual(parsed.range, VALID.range, "range");
  assertEqual(parsed.csvName, VALID.csvName, "csvName");
  assertEqual(parsed.ohlcCsv, VALID.ohlcCsv, "ohlcCsv (multiline CSV survives JSON)");
  assertEqual(Object.keys(parsed).length, 5, "exactly the five known fields are returned");
});

test("snapshot: CSV-less snapshots are accepted (the chart-only path)", () => {
  const parsed = parseAnalysisSnapshot(JSON.stringify({ ...VALID, csvName: null, ohlcCsv: null }));
  assert(parsed, "a snapshot without a CSV is still a valid snapshot");
  assertEqual(parsed.ohlcCsv, null, "null CSV preserved as null");
});

test("snapshot: unknown fields cannot ride along into the analysis", () => {
  const parsed = parseAnalysisSnapshot(
    JSON.stringify({ ...VALID, symbolOverride: "EUR/USD", injected: { evil: true } }),
  );
  assert(parsed, "extra fields do not invalidate a good snapshot");
  assertEqual(Object.keys(parsed).length, 5, "extra fields are dropped, never forwarded");
  assertEqual(
    Object.prototype.hasOwnProperty.call(parsed, "symbolOverride"),
    false,
    "no pass-through of unknown keys",
  );
});

test("snapshot: every malformed shape is refused, never partially trusted", () => {
  const cases = [
    ["empty string", "", "no snapshot"],
    ["null", null, "nothing stored"],
    ["not JSON", "{oh no", "truncated write"],
    ["JSON array", "[1,2,3]", "not an object"],
    ["JSON scalar", "42", "not an object"],
    ["null literal", "null", "nothing stored"],
    ["missing symbol", JSON.stringify({ ...VALID, symbol: undefined }), "required field"],
    ["symbol not a string", JSON.stringify({ ...VALID, symbol: 5 }), "type mismatch"],
    [
      "createdAt missing",
      JSON.stringify({ symbol: VALID.symbol, range: VALID.range, csvName: null, ohlcCsv: null }),
      "required field",
    ],
    [
      "range missing",
      JSON.stringify({
        symbol: VALID.symbol,
        createdAt: VALID.createdAt,
        csvName: null,
        ohlcCsv: null,
      }),
      "required field",
    ],
    ["csvName is a number", JSON.stringify({ ...VALID, csvName: 7 }), "type mismatch"],
    [
      "ohlcCsv is an object",
      JSON.stringify({ ...VALID, ohlcCsv: { toString: "nope" } }),
      "type mismatch",
    ],
    // Fail-closed on a legacy/partial entry: a snapshot from a version that did
    // not write csvName must be discarded rather than guessed at.
    [
      "legacy entry without csvName",
      JSON.stringify({ symbol: "XAU/USD", createdAt: "x", range: "y" }),
      "field absent",
    ],
  ];
  for (const [label, raw, why] of cases) {
    assertEqual(parseAnalysisSnapshot(raw), null, `${label} must be refused (${why})`);
  }
});
