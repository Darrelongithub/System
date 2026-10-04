import { assert, assertDeepEqual, assertEqual, test } from "./tiny.mjs";
import { formatEatDatetime, parseEatDatetime } from "../src/lib/synth-v2/time.ts";
import { classifyTercile, fitTrendinessControl, makeDistribution, theoreticalAr1VarianceRatio, varianceRatio } from "../src/lib/synth-v2/stage2b-math.ts";
import { getStage2BSettings } from "../src/lib/synth-v2/stage2b-regimes.ts";
import { computeStage2BCausalFeatures, createStage2BAucAccumulator, finishStage2BAuc, hardPairRows } from "../src/lib/synth-v2/stage2b-validation.ts";
import { STAGE2B_REGIMES } from "../src/lib/synth-v2/stage2b-types.ts";

function fakeCalibration() {
  const makeBand = (center, width) => ({
    p5: center - width,
    p17: center - width * 0.6,
    p33: center - width * 0.3,
    p50: center,
    p67: center + width * 0.3,
    p83: center + width * 0.6,
    p90: center + width * 0.8,
    p95: center + width,
    samples: 100,
  });
  const distributions = {
    atrPercent: makeBand(0.002, 0.001),
    drift: makeBand(0, 0.01),
    varianceRatio8: makeBand(1, 0.5),
    varianceRatio16: makeBand(1, 0.5),
    gapSize: makeBand(0.5, 0.4),
    newsSpikeIntensity: makeBand(0.03, 0.02),
  };
  const target = (phi, q) => theoreticalAr1VarianceRatio(phi, q);
  return {
    schemaVersion: 1,
    sourceSha256: "a".repeat(64),
    profileSha256: "b".repeat(64),
    specSha256: "c".repeat(64),
    windowWeekdays: 20,
    quantileMethod: "linear-(n-1)*p",
    sourceWindowCount: 10,
    sourceStretchCount: 1,
    distributions,
    realCeilings: Object.fromEntries(["atrPercent", "drift", "varianceRatio8", "varianceRatio16"].map((metric) => [metric, {
      LOW: { n: 20, ceiling: 0.7, thin: false }, NORMAL: { n: 20, ceiling: 0.7, thin: false }, HIGH: { n: 20, ceiling: 0.7, thin: false },
    }])),
    trendControls: {
      LOW: { phi: -0.2, targetVR8: target(-0.2, 8), targetVR16: target(-0.2, 16), achievedVR8: target(-0.2, 8), achievedVR16: target(-0.2, 16), normalizedSquaredError: 0 },
      NORMAL: { phi: 0, targetVR8: 1, targetVR16: 1, achievedVR8: 1, achievedVR16: 1, normalizedSquaredError: 0 },
      HIGH: { phi: 0.4, targetVR8: target(0.4, 8), targetVR16: target(0.4, 16), achievedVR8: target(0.4, 8), achievedVR16: target(0.4, 16), normalizedSquaredError: 0 },
    },
    newsStandardization: { residualMean: 0, residualSd: 1, tailThreshold: 2 },
  };
}

function candleSeries(count) {
  const result = [];
  let close = 2350;
  const start = parseEatDatetime("2026-01-05 01:00");
  for (let index = 0; index < count; index++) {
    const open = close;
    close = open * Math.exp(0.0015 * Math.sin(index * 0.17) + 0.0002 * Math.cos(index * 0.071));
    const radius = 0.001 + (index % 7) * 0.00005;
    result.push({
      datetime: formatEatDatetime(start + index * 30 * 60_000),
      open,
      high: Math.max(open, close) * (1 + radius),
      low: Math.min(open, close) * (1 - radius),
      close,
    });
  }
  return result;
}

test("synth-v2-stage2b: variance-ratio horizons accept 2q returns and reject shorter input", () => {
  const returns = Array.from({ length: 48 }, (_, index) => Math.sin(index * 0.41) + index * 0.001);
  assert(Number.isFinite(varianceRatio(returns.slice(0, 16), 8)), "VR8 accepts 16 returns");
  assert(Number.isFinite(varianceRatio(returns.slice(0, 32), 16)), "VR16 accepts 32 returns");
  assert(Number.isFinite(varianceRatio(returns, 16)), "the preregistered 48-return feature window supports VR16");
  let threw = false;
  try { varianceRatio(returns.slice(0, 31), 16); } catch (error) { threw = String(error).includes("32 one-bar returns"); }
  assert(threw, "VR16 rejects fewer than 32 one-bar returns");
});

test("synth-v2-stage2b: fixed AR(1) grid recovers an exact phi target pair", () => {
  const result = fitTrendinessControl(
    theoreticalAr1VarianceRatio(0.3, 8),
    theoreticalAr1VarianceRatio(0.3, 16),
    1,
    1,
  );
  assert(Math.abs(result.phi - 0.3) < 1e-12, `phi grid matches 0.3, received ${result.phi}`);
  assert(result.normalizedSquaredError < 1e-24, `exact target pair has near-zero fit error, received ${result.normalizedSquaredError}`);
});

test("synth-v2-stage2b: terciles and seven regime targets use registered p17/p50/p83 levels", () => {
  const distribution = makeDistribution([0, 1, 2, 3, 4, 5, 6]);
  assertEqual(classifyTercile(distribution.p33 - 0.01, distribution), "LOW");
  assertEqual(classifyTercile(distribution.p33, distribution), "NORMAL");
  assertEqual(classifyTercile(distribution.p67, distribution), "NORMAL");
  assertEqual(classifyTercile(distribution.p67 + 0.01, distribution), "HIGH");
  const calibration = fakeCalibration();
  const quiet = getStage2BSettings(calibration, "quiet_range");
  assertEqual(quiet.dials.volatilityLevel, calibration.distributions.atrPercent.p17);
  assertEqual(quiet.dials.drift, calibration.distributions.drift.p50);
  assertEqual(quiet.dials.trendiness, calibration.trendControls.LOW.phi);
  assertEqual(quiet.wobbleWidths.volatilityLevel, calibration.distributions.atrPercent.p83 - calibration.distributions.atrPercent.p17);
  const expansionDown = getStage2BSettings(calibration, "expansion_down");
  assertEqual(expansionDown.dials.volatilityLevel, calibration.distributions.atrPercent.p83);
  assertEqual(expansionDown.dials.drift, calibration.distributions.drift.p17);
  assertEqual(expansionDown.dials.trendiness, calibration.trendControls.HIGH.phi);
  assertEqual(STAGE2B_REGIMES.length, 7);
});

test("synth-v2-stage2b: all AUC features use only the preceding completed window", () => {
  const original = candleSeries(150);
  const baseline = computeStage2BCausalFeatures(original);
  for (const index of [61, 65, 101]) {
    assert(Number.isFinite(baseline[index].rolling48AtrPercent), `ATR feature is complete at ${index}`);
    assert(Number.isFinite(baseline[index].rolling48DriftZ), `drift feature is complete at ${index}`);
    assert(Number.isFinite(baseline[index].rolling48VarianceRatio8), `VR8 feature is complete at ${index}`);
    assert(Number.isFinite(baseline[index].rolling48VarianceRatio16), `VR16 feature is complete at ${index}`);
    const changedFuture = original.map((candle) => ({ ...candle }));
    for (let future = index; future < changedFuture.length; future++) {
      changedFuture[future].open *= 1.15;
      changedFuture[future].high *= 1.15;
      changedFuture[future].low *= 1.15;
      changedFuture[future].close *= 1.15;
    }
    const afterMutation = computeStage2BCausalFeatures(changedFuture);
    assertDeepEqual(afterMutation[index], baseline[index], `future mutation does not change feature row ${index}`);
  }
});

test("synth-v2-stage2b: pairwise AUC output has 21 pairs and includes the four hard pairs", () => {
  const accumulator = createStage2BAucAccumulator();
  for (const regime of STAGE2B_REGIMES) {
    accumulator.byRegime[regime.id].rolling48AtrPercent.push(regime.id === "quiet_range" ? 1 : 2);
    accumulator.samples[regime.id] = 1;
  }
  const pairs = finishStage2BAuc(accumulator);
  assertEqual(pairs.length, 21);
  const hard = hardPairRows(pairs).map((row) => [row.regimeA, row.regimeB].sort().join("|")).sort();
  assertDeepEqual(hard, [
    "expansion_up|trend_up",
    "normal_chop|quiet_range",
    "normal_chop|trend_down",
    "normal_chop|trend_up",
  ].sort());
});

test("synth-v2 Stage 2c: regression test for C-2 crash on debug seed 90135 (invalid OHLC fixed at root cause)", async () => {
  const { readFileSync } = await import("node:fs");
  const { createPathSchedule, generatePathWithSchedule } = await import("../src/lib/synth-v2/generate.ts");
  const { assertPathInvariants } = await import("../src/lib/synth-v2/validation.ts");
  const profile = JSON.parse(readFileSync("src/lib/synth-v2/profile.json", "utf8"));
  const calibration = JSON.parse(readFileSync("src/lib/synth-v2/STAGE2C-REAL-BANDS.json", "utf8"));

  const seed = 6142;
  const weekdays = 167;
  const startDate = "2026-04-23";
  const schedule = createPathSchedule(profile, { seed, weekdays, startDate });
  
  // Reconstruct the 6142 generator config that crashed at 2026-08-24 15:00:00 (and 90135 at 2026-08-28 17:00:00)
  const barDials = Array(schedule.totalBars).fill({
    volatilityLevel: 0.002549,
    drift: -0.001352,
    trendiness: 0.057827,
    gapSize: 0.125048,
    newsSpikeIntensity: 0.024305,
  });
  const scenarioLabels = Array(schedule.totalBars).fill({
    regimeId: "expansion_down",
    segmentIndex: 1,
    inBlend: false,
    overlays: [],
  });

  const path = generatePathWithSchedule(profile, { seed: 90135, weekdays, startDate, barDials, scenarioLabels }, schedule);
  assert(path.candles.length > 0, "path generated candles");
  assertPathInvariants(path.candles, weekdays);
});

test("synth-v2 Stage 2c: dial map inverts target ATR% percentiles monotonically", async () => {
  const { readFileSync } = await import("node:fs");
  const volMap = JSON.parse(readFileSync("src/lib/synth-v2/STAGE2C-VOL-MAP.json", "utf8"));
  assert(volMap.p5 < volMap.p17, "p5 < p17");
  assert(volMap.p17 < volMap.p33, "p17 < p33");
  assert(volMap.p33 < volMap.p50, "p33 < p50");
  assert(volMap.p50 < volMap.p67, "p50 < p67");
  assert(volMap.p67 < volMap.p83, "p67 < p83");
  assert(volMap.p83 < volMap.p90, "p83 < p90");
  assert(volMap.p90 < volMap.p95, "p90 < p95");
  assert(volMap.wobbleWidth > 0, "wobble width positive");
  assertEqual(volMap.wobbleWidth, volMap.p83 - volMap.p17);
});
