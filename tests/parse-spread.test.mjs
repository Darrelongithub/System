/**
 * F4 regression — parseSpread must read the price-unit value, not multiply it
 * by 1e-4 merely because the word "pips" appears later in the sentence.
 * Pre-fix the app's own forex templates parsed 10,000x too small (EURUSD
 * 2e-8, USDJPY 2e-6).
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import { parseSpread } from "../src/lib/analyzer/parse.ts";

const expect = (convention, expected) =>
  assertEqual(parseSpread(convention), expected, `spread for: ${convention}`);

test("F4: generator templates parse to their intended price-unit spread", () => {
  expect(
    "XAUUSD: static estimate of $0.20 per ounce, used only for final Entry/SL/TP pricing; never applied to OHLC or derived calculations.",
    0.2,
  );
  expect(
    "XAGUSD: static estimate of $0.02 per ounce, used only for final Entry/SL/TP pricing; never applied to OHLC or derived calculations.",
    0.02,
  );
  expect(
    "BTCUSD: static estimate of $25.00, used only for final Entry/SL/TP pricing; never applied to OHLC or derived calculations.",
    25,
  );
  expect(
    "ETHUSD: static estimate of $2.00, used only for final Entry/SL/TP pricing; never applied to OHLC or derived calculations.",
    2,
  );
  expect(
    "USDJPY: static estimate of 0.02 price units (approximately 2 pips), used only for final Entry/SL/TP pricing; never applied to OHLC or derived calculations.",
    0.02,
  );
  expect(
    "EURUSD: static estimate of 0.0002 price units (approximately 2 pips), used only for final Entry/SL/TP pricing; never applied to OHLC or derived calculations.",
    0.0002,
  );
});

test("F4: pip-denominated conventions still convert", () => {
  expect("Spread: 0.5 pips", 0.00005);
  expect("2 pips", 0.0002);
});

test("F4: symbol digits are never mistaken for prices", () => {
  expect(
    "US30: static estimate of 0.0002 price units (approximately 2 pips), used only for final Entry/SL/TP pricing.",
    0.0002,
  );
});

test("F4: garbage conventions stay rejected (fail-closed)", () => {
  assert(Number.isNaN(parseSpread("no numbers here")), "no-number convention must be NaN");
  assert(Number.isNaN(parseSpread("Spread: -0.2 price units")), "negative spread must be NaN");
});
