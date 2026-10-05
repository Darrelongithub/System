import test from "node:test";
import assert from "node:assert/strict";
import {
  BaggedTreeEnsemble,
  normalCdf,
  orientedAuc,
  trainBaggedTreeEnsemble,
  REGIME_TO_DRIFT,
  REGIME_TO_TRENDINESS,
  REGIME_TO_VOLATILITY,
} from "../src/lib/synth-v2/stage3b/diagnostics.ts";

test("synth-v2 Stage 3b: normalCdf matches standard normal quantiles", () => {
  assert(Math.abs(normalCdf(0) - 0.5) < 1e-5, "Phi(0) == 0.5");
  assert(Math.abs(normalCdf(1.96) - 0.975002) < 1e-4, "Phi(1.96) ~= 0.975");
  assert(Math.abs(normalCdf(-1.96) - 0.024998) < 1e-4, "Phi(-1.96) ~= 0.025");
});

test("synth-v2 Stage 3b: orientedAuc correctly flips below 0.5 to >= 0.5", () => {
  const a = [1, 2, 3];
  const b = [4, 5, 6];
  assert.equal(orientedAuc(a, b), 1.0, "perfect separation");
  assert.equal(orientedAuc(b, a), 1.0, "reversed group separation flips to 1.0");
});

test("synth-v2 Stage 3b: SPEC-2b dial mappings are complete and partitioned", () => {
  const regimes = ["quiet_range", "normal_chop", "trend_up", "trend_down", "whipsaw", "expansion_up", "expansion_down"];
  for (const r of regimes) {
    assert(REGIME_TO_VOLATILITY[r], `missing vol mapping for ${r}`);
    assert(REGIME_TO_DRIFT[r], `missing drift mapping for ${r}`);
    assert(REGIME_TO_TRENDINESS[r], `missing trend mapping for ${r}`);
  }
  assert.equal(REGIME_TO_VOLATILITY.quiet_range, "LOW");
  assert.equal(REGIME_TO_VOLATILITY.whipsaw, "HIGH");
  assert.equal(REGIME_TO_DRIFT.trend_up, "UP");
  assert.equal(REGIME_TO_DRIFT.trend_down, "DOWN");
  assert.equal(REGIME_TO_DRIFT.normal_chop, "FLAT");
});

test("synth-v2 Stage 3b: BaggedTreeEnsemble produces valid probabilities summing to 1", () => {
  const X = [
    [1, 0, -1],
    [-1, 1, 0],
    [0, -1, 1],
    [2, 0, -2],
    [-2, 2, 0],
    [0, -2, 2],
  ];
  const y = [0, 1, 2, 0, 1, 2];
  const ensemble = trainBaggedTreeEnsemble(X, y, 3, 10, 3, 123);

  const testX = [0.5, 0.2, -0.7];
  const probs = ensemble.predictProbs(testX);

  assert.equal(probs.length, 3);
  const sum = probs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1.0) < 1e-6, "probabilities sum to 1");
  const cls = ensemble.predictClass(testX);
  assert(cls >= 0 && cls < 3, "valid class prediction");
});
