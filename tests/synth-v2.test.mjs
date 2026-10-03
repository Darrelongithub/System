import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import { generatePath } from "../src/lib/synth-v2/generate.ts";
import { exchangeSlots, parseEatDatetime } from "../src/lib/synth-v2/time.ts";
import { assertPathInvariants } from "../src/lib/synth-v2/validation.ts";

const profile = JSON.parse(
  readFileSync(new URL("../src/lib/synth-v2/profile.json", import.meta.url), "utf8"),
);

test("synth-v2: same seed and config produce byte-identical OHLC, labels, and CSV", () => {
  const config = { seed: "unit-determinism", weekdays: 5, startDate: "2026-01-05" };
  const first = generatePath(profile, config);
  const second = generatePath(profile, config);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test("synth-v2: generated weekday bars preserve positive OHLC and timestamps", () => {
  const path = generatePath(profile, { seed: 48, weekdays: 8, startDate: "2026-01-05" });
  assertPathInvariants(path.candles, 8);
  assert.equal(path.labels.length, path.candles.length);
  assert.equal(path.labels.every((label) => label.flags.length === 0), true);
});

test("synth-v2: engine CSV parser round-trips all generated OHLC fields", () => {
  const path = generatePath(profile, { seed: "csv-round-trip", weekdays: 5, startDate: "2026-01-05" });
  const parsed = parseCsv(path.csv);
  assert.equal(parsed.metadataError, undefined);
  assert.equal(parsed.candles.length, path.candles.length);
  for (let index = 0; index < path.candles.length; index++) {
    const expected = path.candles[index];
    const actual = parsed.candles[index];
    assert.equal(actual.invalid, undefined);
    assert.deepEqual(
      [actual.datetime, actual.open, actual.high, actual.low, actual.close],
      [expected.datetime, expected.open, expected.high, expected.low, expected.close],
    );
  }
});

test("synth-v2: dial values outside empirical p10-p90 are explicitly flagged", () => {
  const value = profile.dialBands.volatilityLevel.p90 * 1.01;
  const path = generatePath(profile, {
    seed: "extrapolation",
    weekdays: 2,
    startDate: "2026-01-05",
    dials: { volatilityLevel: value },
  });
  assert.equal(path.labels.every((label) => label.flags.includes("EXTRAPOLATION")), true);
  assert.equal(path.labels.every((label) => label.flags.includes("EXTRAPOLATION:volatilityLevel")), true);
});

test("synth-v2: London and New York session slots shift independently with DST", () => {
  const winter = exchangeSlots(parseEatDatetime("2026-01-05 16:00:00"));
  const summer = exchangeSlots(parseEatDatetime("2026-07-06 16:00:00"));
  assert.equal(summer.london, winter.london + 2);
  assert.equal(summer.newYork, winter.newYork + 2);
});

test("synth-v2: trend settings outside constrained variance-ratio endpoints are labelled", () => {
  const value = profile.trendinessBounds.p10 - 0.001;
  const path = generatePath(profile, {
    seed: "trend-extrapolation",
    weekdays: 2,
    startDate: "2026-01-05",
    dials: { trendiness: value },
  });
  assert.equal(path.labels.every((label) => label.flags.includes("EXTRAPOLATION")), true);
  assert.equal(
    path.labels.every((label) => label.flags.includes("EXTRAPOLATION:trendinessVarianceRatio")),
    true,
  );
});
