import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateStage2BPath } from "../src/lib/synth-v2/stage2b-regimes.ts";
import {
  computeStage3FeaturesForWeekday,
  wilderAtrPercent,
} from "../src/lib/synth-v2/stage3/features.ts";
import {
  predictMultinomialLogistic,
  trainDecisionTree,
  trainMultinomialLogistic,
  Stage3HysteresisTracker,
} from "../src/lib/synth-v2/stage3/models.ts";

test("synth-v2 Stage 3: strict no-lookahead unit test (replacing bars after weekday t leaves state at or before t identical)", () => {
  const profile = JSON.parse(readFileSync("src/lib/synth-v2/profile.json", "utf8"));
  const calibration = JSON.parse(readFileSync("src/lib/synth-v2/STAGE2C-REAL-BANDS.json", "utf8"));

  // Generate deterministic DESIGN seed 8002
  const originalPath = generateStage2BPath(profile, calibration, { set: "DESIGN", seed: 8002 });
  const candlesOriginal = originalPath.synthetic.candles;
  const schedule = originalPath.schedule;

  const barOffsets = [0];
  for (const count of schedule.barCounts) {
    barOffsets.push(barOffsets.at(-1) + count);
  }

  const atrOriginal = wilderAtrPercent(candlesOriginal);

  // Choose test weekday t = 75 (after 60-day warm-up)
  const testDay = 75;
  const testBarEnd = barOffsets[testDay] + schedule.barCounts[testDay] - 1;

  const featuresOriginal = computeStage3FeaturesForWeekday(
    candlesOriginal,
    barOffsets,
    schedule.barCounts,
    atrOriginal,
    testDay,
  );

  // Now create a mutated copy of candles where every bar after testBarEnd is replaced with random absurd values
  const candlesMutated = candlesOriginal.map((c, idx) => {
    if (idx <= testBarEnd) return { ...c };
    return {
      datetime: c.datetime,
      open: 9999.0 + Math.random() * 500,
      high: 12000.0 + Math.random() * 500,
      low: 100.0 + Math.random() * 50,
      close: 5000.0 + Math.random() * 500,
    };
  });

  const atrMutated = wilderAtrPercent(candlesMutated);

  const featuresMutated = computeStage3FeaturesForWeekday(
    candlesMutated,
    barOffsets,
    schedule.barCounts,
    atrMutated,
    testDay,
  );

  // Verify that every single feature at day t is 100% strictly identical
  for (const key of Object.keys(featuresOriginal)) {
    assert.equal(
      featuresOriginal[key],
      featuresMutated[key],
      `Feature ${key} at weekday ${testDay} was affected by future bars!`,
    );
  }
});

test("synth-v2 Stage 3: multinomial logistic regression produces valid probabilities summing to 1", () => {
  const X = [
    [1, 0, -1],
    [-1, 1, 0],
    [0, -1, 1],
    [2, 0, -2],
    [-2, 2, 0],
    [0, -2, 2],
  ];
  const y = [0, 1, 2, 0, 1, 2];
  const W = trainMultinomialLogistic(X, y, 3, 1.0, 50);

  const testX = [0.5, 0.2, -0.7];
  const probs = predictMultinomialLogistic(W, testX);

  assert.equal(probs.length, 3);
  for (const p of probs) {
    assert(p >= 0 && p <= 1, `Probability ${p} out of bounds`);
  }
  const sum = probs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1.0) < 1e-6, `Probabilities sum to ${sum}, expected 1.0`);
});

test("synth-v2 Stage 3: hysteresis tracker suppresses transient switches", () => {
  const tracker = new Stage3HysteresisTracker({ k: 3, d: 0.1 });

  // Day 0: state 0 is dominant
  const s0 = tracker.update([0.8, 0.1, 0.1]);
  assert.equal(s0, 0, "initial state should be 0");

  // Day 1: transient spike for state 1, but streak=1 < 3
  const s1 = tracker.update([0.3, 0.6, 0.1]);
  assert.equal(s1, 0, "should not switch on single transient spike");

  // Day 2: state 1 beats state 0 again, streak=2 < 3
  const s2 = tracker.update([0.3, 0.6, 0.1]);
  assert.equal(s2, 0, "should not switch on 2 consecutive days when K=3");

  // Day 3: state 1 beats state 0 again, streak=3 >= 3 -> switch!
  const s3 = tracker.update([0.3, 0.6, 0.1]);
  assert.equal(s3, 1, "should switch after 3 consecutive days");
});
