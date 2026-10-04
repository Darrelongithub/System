import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseCsv } from "../src/lib/analyzer/parse.ts";
import { parseSourceCsv } from "../src/lib/synth-v2/csv.ts";
import { generatePath, generatePathWithSchedule } from "../src/lib/synth-v2/generate.ts";
import { generateStage2Path, getRegimeBaseDials, REGIME_IDS } from "../src/lib/synth-v2/regimes.ts";
import { decodeStage2Artifact, encodeStage2Artifact } from "../src/lib/synth-v2/stage2-artifacts.ts";
import {
  addDesignPathToPairwiseAuc,
  computeCausalFeatures,
  createPairwiseAucAccumulator,
  deriveStage2Bands,
  finishPairwiseAuc,
} from "../src/lib/synth-v2/stage2-validation.ts";
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

test("synth-v2 Stage 2: frozen regime library uses the specified p10/p50/p90 dial combinations", () => {
  assert.deepEqual(REGIME_IDS, [
    "quiet_range", "normal_chop", "trend_up", "trend_down", "whipsaw", "expansion_up", "expansion_down",
  ]);
  const lowVol = profile.dialBands.volatilityLevel.p10;
  const normalVol = profile.dialBands.volatilityLevel.p50;
  const highVol = profile.dialBands.volatilityLevel.p90;
  const flat = profile.dialBands.drift.p50;
  const up = profile.dialBands.drift.p90;
  const down = profile.dialBands.drift.p10;
  const meanReverting = profile.trendinessBounds.p10;
  const randomTrend = profile.dialBands.trendiness.p50;
  const trending = profile.trendinessBounds.p90;
  const expected = [
    ["quiet_range", lowVol, flat, meanReverting],
    ["normal_chop", normalVol, flat, randomTrend],
    ["trend_up", normalVol, up, trending],
    ["trend_down", normalVol, down, trending],
    ["whipsaw", highVol, flat, meanReverting],
    ["expansion_up", highVol, up, trending],
    ["expansion_down", highVol, down, trending],
  ];
  for (const [regimeId, volatilityLevel, drift, trendiness] of expected) {
    const dials = getRegimeBaseDials(profile, regimeId);
    assert.equal(dials.volatilityLevel, volatilityLevel, `${regimeId} volatility`);
    assert.equal(dials.drift, drift, `${regimeId} drift`);
    assert.equal(dials.trendiness, trendiness, `${regimeId} trend`);
  }
});

test("synth-v2 Stage 2: seeded regime chains are deterministic, bounded, and fully labelled", () => {
  const options = { seed: 424242, set: "DESIGN" };
  const first = generateStage2Path(profile, options);
  const second = generateStage2Path(profile, options);
  const firstRecord = encodeStage2Artifact(first);
  const secondRecord = encodeStage2Artifact(second);
  assert.equal(firstRecord, secondRecord);
  assert.equal(createHash("sha256").update(firstRecord).digest("hex"), createHash("sha256").update(secondRecord).digest("hex"));
  assert.ok(first.segments.length >= 3 && first.segments.length <= 6);
  assert.equal(first.weekdays, first.segments.reduce((sum, segment) => sum + segment.weekdays, 0));
  for (let index = 0; index < first.segments.length; index++) {
    const segment = first.segments[index];
    assert.ok(segment.weekdays >= 10 && segment.weekdays <= 60);
    assert.ok(REGIME_IDS.includes(segment.regimeId));
    if (index > 0) {
      assert.notEqual(segment.regimeId, first.segments[index - 1].regimeId);
      assert.ok(segment.blendBarsFromPrevious >= 48 && segment.blendBarsFromPrevious <= 200);
    }
  }
  assert.equal(first.synthetic.labels.length, first.synthetic.candles.length);
  assert.equal(first.synthetic.labels.every((label, index) =>
    label.regimeId === first.scenarioLabels[index].regimeId &&
    label.segmentIndex === first.scenarioLabels[index].segmentIndex &&
    label.inBlend === first.scenarioLabels[index].inBlend &&
    JSON.stringify(label.overlayFlags) === JSON.stringify(first.scenarioLabels[index].overlays) &&
    JSON.stringify(label.dials) === JSON.stringify(first.barDials[index])
  ), true);
  assert.equal(first.synthetic.labels.every((label) =>
    label.flags.includes("EXTRAPOLATION") === (label.flags.length > 0)
  ), true);
});

test("synth-v2 Stage 2: NULL paths are single-regime 140-weekday paths with overlays off", () => {
  const path = generateStage2Path(profile, { seed: 2001, set: "NULL", regimeId: "quiet_range" });
  assert.equal(path.weekdays, 140);
  assert.equal(path.segments.length, 1);
  assert.equal(path.segments[0].weekdays, 140);
  assert.equal(path.segments[0].regimeId, "quiet_range");
  assert.equal(path.segments[0].overlays.length, 0);
  assert.equal(path.synthetic.labels.every((label) =>
    label.regimeId === "quiet_range" && label.inBlend === false && label.overlayFlags.length === 0
  ), true);
});

test("synth-v2 Stage 2: compact paths round-trip candles, ground truth, and engine CSV", () => {
  const path = generateStage2Path(profile, { seed: 9, set: "DESIGN" });
  const encoded = encodeStage2Artifact(path);
  const decoded = decodeStage2Artifact(encoded);
  assert.deepEqual(decoded.candles, path.synthetic.candles);
  assert.equal(decoded.labels.length, path.synthetic.labels.length);
  for (let index = 0; index < decoded.labels.length; index++) {
    const actual = decoded.labels[index];
    const expected = path.synthetic.labels[index];
    assert.equal(actual.datetime, expected.datetime);
    assert.equal(actual.regimeId, expected.regimeId);
    assert.equal(actual.segmentIndex, expected.segmentIndex);
    assert.equal(actual.inBlend, expected.inBlend);
    assert.deepEqual(actual.overlayFlags, expected.overlayFlags);
    assert.deepEqual(actual.flags, expected.flags);
    assert.equal(actual.gapKind, expected.gapKind);
    assert.equal(actual.newsSpike, expected.newsSpike);
    for (const key of Object.keys(expected.dials)) assert.ok(Math.abs(actual.dials[key] - expected.dials[key]) <= 1e-9);
  }
  const parsed = parseCsv(decoded.csv);
  assert.equal(parsed.metadataError, undefined);
  assert.equal(parsed.candles.length, path.synthetic.candles.length);
  for (let index = 0; index < path.synthetic.candles.length; index++) {
    const expected = path.synthetic.candles[index];
    const actual = parsed.candles[index];
    assert.deepEqual([actual.datetime, actual.open, actual.high, actual.low, actual.close],
      [expected.datetime, expected.open, expected.high, expected.low, expected.close]);
  }
  const failureTag = "GENERATOR G2 FAIL: do not use features built on fewer than 6 bars.";
  const tagged = decodeStage2Artifact(encodeStage2Artifact(path, failureTag));
  assert.equal(tagged.statusTag, failureTag);
  assert.match(tagged.csv, /generator_status_tag/);
  assert.equal(parseCsv(tagged.csv).metadataError, undefined);
});

test("synth-v2 Stage 2: relabelling cannot change OHLC when schedule and dials are fixed", () => {
  const path = generateStage2Path(profile, { seed: 57, set: "DESIGN" });
  const changedLabels = path.scenarioLabels.map((label, index) => ({
    ...label,
    regimeId: REGIME_IDS[(index + 1) % REGIME_IDS.length],
    segmentIndex: (label.segmentIndex + 1) % path.segments.length,
    inBlend: !label.inBlend,
    overlays: label.overlays.length ? [] : ["news_storm"],
  }));
  const replay = generatePathWithSchedule(profile, {
    seed: path.seed,
    weekdays: path.weekdays,
    startDate: path.startDate,
    barDials: path.barDials,
    scenarioLabels: changedLabels,
  }, path.schedule);
  assert.deepEqual(replay.candles, path.synthetic.candles);
});

test("synth-v2 Stage 2: causal features do not use the classified or later bars", () => {
  const path = generateStage2Path(profile, { seed: 77, set: "DESIGN" });
  const index = 400;
  const original = computeCausalFeatures(path.synthetic.candles)[index];
  const futureMutated = path.synthetic.candles.map((candle, current) => current < index ? candle : ({
    ...candle,
    open: candle.open * 1.2,
    high: candle.high * 1.2,
    low: candle.low * 1.2,
    close: candle.close * 1.2,
  }));
  assert.deepEqual(computeCausalFeatures(futureMutated)[index], original);
  assert.ok(original.rolling48AtrPercent !== undefined);
  assert.ok(original.rolling48DriftZ !== undefined);
  assert.ok(original.rolling240VarianceRatio8 !== undefined);
  assert.ok(original.rolling240VarianceRatio16 !== undefined);
});

test("synth-v2 Stage 2: pairwise AUC accepts DESIGN only and produces all 21 regime pairs", () => {
  const accumulator = createPairwiseAucAccumulator();
  const design = generateStage2Path(profile, { seed: 100, set: "DESIGN" });
  addDesignPathToPairwiseAuc(accumulator, design);
  const rows = finishPairwiseAuc(accumulator);
  assert.equal(rows.length, 21);
  assert.equal(rows.every((row) => Number.isFinite(row.bestSingleFeatureAuc)), true);
  assert.equal(rows.every((row) => row.bestSingleFeatureAuc >= 0.5 && row.bestSingleFeatureAuc <= 1), true);
  const locked = generateStage2Path(profile, { seed: 1001, set: "LOCKED TEST" });
  assert.throws(() => addDesignPathToPairwiseAuc(accumulator, locked), /DESIGN-only/);
});

test("synth-v2 Stage 2: real source bands derive only from the verified market CSV", () => {
  const sourceText = readFileSync(new URL("../XAUUSD_30min_2020-01-24_to_2026-10-01.csv", import.meta.url), "utf8");
  const source = parseSourceCsv(sourceText);
  const bands = deriveStage2Bands(source);
  assert.ok(bands.atrPercentPerBar.samples > 70_000);
  assert.ok(bands.dailyDrift.samples > 1_700);
  assert.equal(bands.windowWeekdays, 5);
  assert.ok(bands.varianceRatio8.samples > 1_700);
  assert.ok(bands.varianceRatio16.samples > 1_700);
});
