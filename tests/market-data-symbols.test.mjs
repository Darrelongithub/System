/**
 * `AVAILABLE_SYMBOLS` is broader than the pipeline is calibrated for
 * (AUDIT-ARENA-2026-09-08 §9): crypto trades 24/7 and the oil products follow
 * futures/ETF hours, while the session buckets, weekend policy, spread parser,
 * ATR reliability thresholds and strategy calibrations are all forex/metals-tuned
 * (XAU/USD is the only golden baseline).
 *
 * Trimming the provider list would be a product decision, so instead the split
 * is made explicit (`UNVALIDATED_SYMBOLS` / `isCalibratedSymbol`) and the Data
 * Generator warns when an unvalidated symbol is picked. These tests pin the
 * classification: a new symbol cannot be added without a decision, a stale entry
 * cannot silently hide the warning, and the lookup cannot stop normalising.
 */
import { test, assert, assertEqual } from "./tiny.mjs";
import {
  AVAILABLE_SYMBOLS,
  UNVALIDATED_SYMBOLS,
  isCalibratedSymbol,
} from "../src/lib/market-data.ts";

test("symbol calibration: the golden baseline and forex/metals are calibrated", () => {
  assert(isCalibratedSymbol("XAU/USD"), "XAU/USD — the only golden baseline");
  assert(isCalibratedSymbol("XAG/USD"), "XAG/USD — London/NY metal");
  for (const fx of ["EUR/USD", "USD/JPY", "GBP/USD", "USD/ZAR", "NZD/JPY", "EUR/GBP"]) {
    assert(AVAILABLE_SYMBOLS.includes(fx), `${fx} is offered`);
    assert(isCalibratedSymbol(fx), `${fx} — 24/5 forex, session logic applies`);
  }
});

test("symbol calibration: 24/7 crypto and oil products are flagged unvalidated", () => {
  for (const symbol of ["BTC/USD", "ETH/USD", "SOL/USD", "DOGE/USD", "USO/USD", "BCO/USD"]) {
    assert(AVAILABLE_SYMBOLS.includes(symbol), `${symbol} is still offered by the provider`);
    assert(!isCalibratedSymbol(symbol), `${symbol} must NOT be reported as calibrated`);
  }
  assert(!isCalibratedSymbol("AAPL"), "a symbol the provider list does not offer is uncalibrated");
  assert(!isCalibratedSymbol(""), "empty input is uncalibrated");
});

test("symbol calibration: normalises case/whitespace and classifies every offered symbol exactly once", () => {
  assertEqual(isCalibratedSymbol("  xau/usd "), true, "case and surrounding whitespace normalised");
  assertEqual(isCalibratedSymbol("sol/usd"), false, "lower-case crypto still flagged");

  for (const symbol of AVAILABLE_SYMBOLS) {
    assertEqual(
      isCalibratedSymbol(symbol),
      !UNVALIDATED_SYMBOLS.includes(symbol),
      `${symbol}: calibrated unless explicitly listed as unvalidated`,
    );
  }
  for (const symbol of UNVALIDATED_SYMBOLS) {
    assert(
      AVAILABLE_SYMBOLS.includes(symbol),
      `${symbol}: stale entry — it is no longer offered, so it would silently hide a warning`,
    );
  }
  assert(UNVALIDATED_SYMBOLS.length > 0, "the unvalidated list is not empty");
});
