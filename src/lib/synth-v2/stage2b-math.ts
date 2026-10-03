import { mean, quantile } from "./random";
import type { Stage2BDistribution, Stage2BLevel } from "./stage2b-types";

export const WINDOW_WEEKDAYS = 20;
export const TERCILE_LEVELS: readonly Stage2BLevel[] = ["LOW", "NORMAL", "HIGH"];
export const QUANTILE_PROBABILITIES = [0.05, 0.17, 0.33, 0.5, 0.67, 0.83, 0.9, 0.95] as const;

export function populationVariance(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const center = mean(values);
  let sum = 0;
  for (const value of values) sum += (value - center) ** 2;
  return sum / values.length;
}

export function varianceRatio(returns: readonly number[], horizon: number): number {
  if (!Number.isInteger(horizon) || horizon < 2 || returns.length < horizon * 2) {
    throw new Error(`variance ratio requires at least ${horizon * 2} one-bar returns`);
  }
  const oneVariance = populationVariance(returns);
  if (!(oneVariance > 0)) return 1;
  const sums: number[] = [];
  for (let start = 0; start + horizon <= returns.length; start++) {
    let total = 0;
    for (let offset = 0; offset < horizon; offset++) total += returns[start + offset]!;
    sums.push(total);
  }
  return populationVariance(sums) / (horizon * oneVariance);
}

export function theoreticalAr1VarianceRatio(phi: number, horizon: number): number {
  let sum = 0;
  for (let lag = 1; lag < horizon; lag++) sum += (horizon - lag) * phi ** lag;
  return 1 + (2 / horizon) * sum;
}

export function fitTrendinessControl(
  targetVR8: number,
  targetVR16: number,
  widthVR8: number,
  widthVR16: number,
): { phi: number; achievedVR8: number; achievedVR16: number; normalizedSquaredError: number } {
  if (!(widthVR8 > 0 && widthVR16 > 0)) throw new Error("trendiness fit requires positive p83-p17 VR widths");
  let bestPhi = -0.94;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestVR8 = theoreticalAr1VarianceRatio(bestPhi, 8);
  let bestVR16 = theoreticalAr1VarianceRatio(bestPhi, 16);
  for (let step = 0; step <= 18_800; step++) {
    const phi = -0.94 + step / 10_000;
    const vr8 = theoreticalAr1VarianceRatio(phi, 8);
    const vr16 = theoreticalAr1VarianceRatio(phi, 16);
    const score = ((vr8 - targetVR8) / widthVR8) ** 2 + ((vr16 - targetVR16) / widthVR16) ** 2;
    // Ascending scan means exact ties retain the lower phi, as pre-registered.
    if (score < bestScore) {
      bestPhi = phi;
      bestScore = score;
      bestVR8 = vr8;
      bestVR16 = vr16;
    }
  }
  return { phi: bestPhi, achievedVR8: bestVR8, achievedVR16: bestVR16, normalizedSquaredError: bestScore };
}

export function makeDistribution(values: readonly number[]): Stage2BDistribution {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("cannot derive Stage 2b quantiles from empty/non-finite values");
  }
  return {
    p5: quantile(values, 0.05),
    p17: quantile(values, 0.17),
    p33: quantile(values, 0.33),
    p50: quantile(values, 0.5),
    p67: quantile(values, 0.67),
    p83: quantile(values, 0.83),
    p90: quantile(values, 0.9),
    p95: quantile(values, 0.95),
    samples: values.length,
  };
}

export function classifyTercile(value: number, distribution: Pick<Stage2BDistribution, "p33" | "p67">): Stage2BLevel {
  if (value < distribution.p33) return "LOW";
  if (value <= distribution.p67) return "NORMAL";
  return "HIGH";
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}
