import assert from "node:assert/strict";
import test from "node:test";
import {
  computeForwardOutcome,
  computeReturnSeries,
  isoWeekKey,
  minimumFiveWeekdayOffset,
  parseEATDate,
  parseGoldCsv,
  quantile,
  sampleWithoutReplacement,
  seededRandom,
  splitCsvRecord,
} from "../src/lib/regime-detector-eval/core.mjs";

test("regime evaluation CSV parser handles doubled quotes and commas", () => {
  assert.deepEqual(splitCsvRecord('2024-01-01,"[""one,two"",""three""]",7'), [
    "2024-01-01",
    '["one,two","three"]',
    "7",
  ]);
});

test("regime evaluation parser keeps all OHLC rows and ignores derived annotations", () => {
  const metadata =
    '# metadata: {"data_age":"2024-01-02 00:30:00 EAT","section_marker_convention":"=== markers"}';
  const csv = [
    metadata,
    "datetime,open,high,low,close,is_reliable,similar_swing_refs",
    '2024-01-01 00:00:00,100,102,99,101,false,"[""x,y"",""]"',
    "=== WEEKEND / SKIPPED ===",
    "2024-01-01 00:30:00,101,103,100,102,true,[]",
  ].join("\n");
  const result = parseGoldCsv(csv);
  assert.equal(result.bars.length, 2);
  assert.equal(result.skippedDividerLines, 1);
  assert.equal(result.hasVolume, false);
  assert.deepEqual(
    result.bars.map(({ open, high, low, close, volume }) => ({ open, high, low, close, volume })),
    [
      { open: 100, high: 102, low: 99, close: 101, volume: null },
      { open: 101, high: 103, low: 100, close: 102, volume: null },
    ],
  );
});

test("regime evaluation parser rejects malformed timestamps, geometry and chronology", () => {
  const prefix = '# metadata: {"section_marker_convention":"==="}\ndatetime,open,high,low,close\n';
  assert.throws(() => parseGoldCsv(prefix + "bad,1,2,0,1"), /invalid EAT wall-clock timestamp/);
  assert.throws(
    () => parseGoldCsv(prefix + "2024-01-01 00:00:00,1,0,2,1"),
    /invalid OHLC geometry/,
  );
  assert.throws(
    () => parseGoldCsv(prefix + "2024-01-01 00:30:00,1,2,0.5,1.5\n2024-01-01 00:00:00,1,2,0.5,1.5"),
    /duplicate or out-of-order timestamp/,
  );
});

test("regime evaluation uses EAT wall-clock weekdays and ISO week grouping", () => {
  assert.equal(parseEATDate("2023-07-01 00:30:00").dateKey, "2023-07-01");
  assert.equal(parseEATDate("2023-07-01 00:30:00").weekday, 6);
  assert.equal(isoWeekKey("2023-07-01"), "2023-W26");
  assert.equal(isoWeekKey("2023-07-03"), "2023-W27");
});

test("regime evaluation five-weekday placebo offset includes cyclic wraparound", () => {
  const bars = ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"].map(
    (dateKey) => ({ dateKey }),
  );
  assert.equal(minimumFiveWeekdayOffset(bars), 5);
});

test("regime evaluation forward outcomes use only t+1..t+H and prior 2400 returns", () => {
  const bars = Array.from({ length: 2405 }, (_, index) => {
    const close = 100 * Math.exp(0.001 * index);
    return { timestamp: new Date(Date.UTC(2020, 0, 1, 0, index)).toISOString(), close };
  });
  const prefixes = computeReturnSeries(bars);
  const outcome = computeForwardOutcome(bars, prefixes, 0.2, 2401, 2);
  assert.ok(Math.abs(outcome.forwardVolatilityRatio - 1) < 1e-10);
  assert.ok(Math.abs(outcome.trendEfficiency - 1) < 1e-10);
  assert.ok(
    Math.abs(outcome.signedReturnAtr - (bars[2403].close - bars[2401].close) / 0.2) < 1e-10,
  );
  assert.throws(() => computeForwardOutcome(bars, prefixes, 0.2, 2400, 2), /in-range label bar/);
});

test("regime evaluation sampling is reproducible and without replacement", () => {
  const first = sampleWithoutReplacement([1, 2, 3, 4, 5], 4, seededRandom(123));
  const second = sampleWithoutReplacement([1, 2, 3, 4, 5], 4, seededRandom(123));
  assert.deepEqual(first, second);
  assert.equal(new Set(first).size, 4);
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
});
